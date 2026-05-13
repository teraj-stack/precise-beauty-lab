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
      throw new Error("Nieprawidłowy plik JPEG");
    }

    const u8 = new Uint8Array(bytes);
    const rawReport = readQualityReportFromJpeg(u8);
    if (!rawReport) {
      throw new Error("Brak segmentu COM z raportem jakości w pliku JPEG");
    }

    const validation = validateQualityReport(rawReport);
    if (!validation.ok) {
      const detail = validation.issues?.length
        ? ` — ${validation.issues.join("; ")}`
        : "";
      throw new Error(`${validation.message}${detail}`);
    }
    const report = validation.report;

    const sha256 = createHash("sha256").update(bytes).digest("hex");

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

    if (error) throw new Error(error.message);
    return { id: row.id, sha256: row.jpeg_sha256, createdAt: row.created_at };
  });
