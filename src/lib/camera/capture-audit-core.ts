/**
 * Pure / dependency-injected core of the capture-audit insert pipeline.
 *
 * The createServerFn handler in `capture-audit.functions.ts` is a thin
 * wrapper around this function — extracted so the dedup behaviour
 * (existence check + 23505 race re-fetch) can be exercised with a mocked
 * Supabase client in integration tests, without booting the TanStack
 * server runtime or the real database.
 */

import { createHash } from "crypto";
import { readQualityReportFromJpeg } from "./capture-metadata";
import { validateQualityReport } from "./quality-report-schema";
import {
  PARSER_VERSION,
  INTEGRITY_VERSION,
  computeReportSignature,
  type IntegrityEnvelope,
} from "./parser-integrity";

export interface CaptureAuditInsertInput {
  jpegBytes: Uint8Array;
  patientId?: string | null;
}

export interface CaptureAuditInsertResult {
  id: string;
  sha256: string;
  createdAt: string;
  deduplicated: boolean;
}

/**
 * Minimal structural type covering the surface of the Supabase JS client
 * actually used by `performCaptureAuditInsert`. Tests can implement this
 * directly with an in-memory store.
 */
export interface AuditSupabaseLike {
  from(table: "capture_audits"): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          eq(col: string, val: string): {
            maybeSingle(): Promise<{
              data: { id: string; created_at: string; jpeg_sha256: string } | null;
              error: { message: string } | null;
            }>;
            single(): Promise<{
              data: { id: string; created_at: string; jpeg_sha256: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    insert(row: Record<string, unknown>): {
      select(cols: string): {
        single(): Promise<{
          data: { id: string; created_at: string; jpeg_sha256: string } | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
}

export async function performCaptureAuditInsert(
  supabase: AuditSupabaseLike,
  userId: string,
  input: CaptureAuditInsertInput,
): Promise<CaptureAuditInsertResult> {
  const bytes = input.jpegBytes;
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("[E_JPEG_INVALID] Nieprawidłowy plik JPEG (brak nagłówka SOI)");
  }

  const rawReport = readQualityReportFromJpeg(bytes);
  if (!rawReport) {
    throw new Error(
      "[E_NO_COM] Brak segmentu COM z raportem jakości w pliku JPEG. " +
        "Zdjęcie pochodzi spoza standardowego trybu MSC lub zostało przepisane (re-encode).",
    );
  }

  const validation = validateQualityReport(rawReport);
  if (!validation.ok) {
    const codeMap = {
      missing: "E_REPORT_MISSING",
      schema_mismatch: "E_SCHEMA_MISMATCH",
      shape_invalid: "E_SCHEMA_INVALID",
    } as const;
    const code = codeMap[validation.code];
    const detail = validation.issues?.length ? ` — ${validation.issues.join("; ")}` : "";
    throw new Error(`[${code}] ${validation.message}${detail}`);
  }
  const report = validation.report;

  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const reportPlain = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
  const signature = await computeReportSignature(reportPlain);
  const integrity: IntegrityEnvelope = {
    parserVersion: PARSER_VERSION,
    integrityVersion: INTEGRITY_VERSION,
    signature,
    signedAt: new Date().toISOString(),
    algorithm: "sha256-canonical-json",
  };
  const reportWithIntegrity = { ...reportPlain, _integrity: integrity };

  // 1) Fast path: row already exists for (owner, sha, capturedAt).
  const existingQ = supabase
    .from("capture_audits")
    .select("id, created_at, jpeg_sha256")
    .eq("owner_id", userId)
    .eq("jpeg_sha256", sha256)
    .eq("captured_at", report.capturedAt);
  const { data: existing, error: existingError } = await existingQ.maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) {
    return {
      id: existing.id,
      sha256: existing.jpeg_sha256,
      createdAt: existing.created_at,
      deduplicated: true,
    };
  }

  // 2) Insert. Race-safe: if another request inserted between our check and
  // here, the unique index on (owner_id, jpeg_sha256, captured_at) raises
  // 23505, and we re-fetch the winning row.
  const { data: row, error } = await supabase
    .from("capture_audits")
    .insert({
      owner_id: userId,
      patient_id: input.patientId ?? null,
      captured_at: report.capturedAt,
      decision: report.decision,
      profile_version: report.profileVersion,
      thresholds_version: report.thresholdsVersion,
      image_width: report.image.width,
      image_height: report.image.height,
      image_bytes: bytes.length,
      jpeg_sha256: sha256,
      report: JSON.parse(JSON.stringify(reportWithIntegrity)),
      source: "jpeg-com",
    })
    .select("id, created_at, jpeg_sha256")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const { data: dup, error: dupErr } = await supabase
        .from("capture_audits")
        .select("id, created_at, jpeg_sha256")
        .eq("owner_id", userId)
        .eq("jpeg_sha256", sha256)
        .eq("captured_at", report.capturedAt)
        .single();
      if (dupErr) throw new Error(dupErr.message);
      if (!dup) throw new Error("[E_DEDUP_LOST] Konflikt unikalności bez wiersza zwycięzcy");
      return {
        id: dup.id,
        sha256: dup.jpeg_sha256,
        createdAt: dup.created_at,
        deduplicated: true,
      };
    }
    throw new Error(error.message);
  }
  if (!row) throw new Error("[E_INSERT_NO_ROW] Insert nie zwrócił wiersza");
  return {
    id: row.id,
    sha256: row.jpeg_sha256,
    createdAt: row.created_at,
    deduplicated: false,
  };
}
