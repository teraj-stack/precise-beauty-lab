import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readQualityReportFromJpeg } from "./capture-metadata";
import { validateQualityReport } from "./quality-report-schema";

const InputSchema = z.object({
  jpegBase64: z.string().min(64).max(20_000_000),
  patientId: z.string().uuid().nullable().optional(),
});

export const submitCaptureAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Decode base64 (no data: prefix expected; client strips it).
    const bytes = Buffer.from(data.jpegBase64, "base64");
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error("[E_JPEG_INVALID] Nieprawidłowy plik JPEG (brak nagłówka SOI)");
    }

    const u8 = new Uint8Array(bytes);
    const rawReport = readQualityReportFromJpeg(u8);
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
      const detail = validation.issues?.length
        ? ` — ${validation.issues.join("; ")}`
        : "";
      throw new Error(`[${code}] ${validation.message}${detail}`);
    }
    const report = validation.report;

    const sha256 = createHash("sha256").update(bytes).digest("hex");

    // Idempotency: same (owner, sha256, capturedAt) → return existing row.
    const { data: existing, error: existingError } = await supabase
      .from("capture_audits")
      .select("id, created_at, jpeg_sha256")
      .eq("owner_id", userId)
      .eq("jpeg_sha256", sha256)
      .eq("captured_at", report.capturedAt)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) {
      return {
        id: existing.id,
        sha256: existing.jpeg_sha256,
        createdAt: existing.created_at,
        deduplicated: true as const,
      };
    }

    const { data: row, error } = await supabase
      .from("capture_audits")
      .insert({
        owner_id: userId,
        patient_id: data.patientId ?? null,
        captured_at: report.capturedAt,
        decision: report.decision,
        profile_version: report.profileVersion,
        thresholds_version: report.thresholdsVersion,
        image_width: report.image.width,
        image_height: report.image.height,
        image_bytes: bytes.length,
        jpeg_sha256: sha256,
        report: JSON.parse(JSON.stringify(report)),
        source: "jpeg-com",
      })
      .select("id, created_at, jpeg_sha256")
      .single();

    if (error) {
      // Race: a parallel request inserted the same (owner, sha256, capturedAt)
      // between our existence check and insert. Re-fetch and return it.
      if ((error as { code?: string }).code === "23505") {
        const { data: dup, error: dupErr } = await supabase
          .from("capture_audits")
          .select("id, created_at, jpeg_sha256")
          .eq("owner_id", userId)
          .eq("jpeg_sha256", sha256)
          .eq("captured_at", report.capturedAt)
          .single();
        if (dupErr) throw new Error(dupErr.message);
        return {
          id: dup.id,
          sha256: dup.jpeg_sha256,
          createdAt: dup.created_at,
          deduplicated: true as const,
        };
      }
      throw new Error(error.message);
    }
    return {
      id: row.id,
      sha256: row.jpeg_sha256,
      createdAt: row.created_at,
      deduplicated: false as const,
    };
  });
