import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  patientId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(20),
});

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface CaptureAuditRow {
  id: string;
  created_at: string;
  captured_at: string;
  decision: string;
  profile_version: string;
  thresholds_version: string;
  image_width: number;
  image_height: number;
  image_bytes: number;
  jpeg_sha256: string;
  source: string;
  report: Json;
}

export const listCaptureAuditsForPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<CaptureAuditRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("capture_audits")
      .select(
        "id, created_at, captured_at, decision, profile_version, thresholds_version, image_width, image_height, image_bytes, jpeg_sha256, source, report",
      )
      .eq("patient_id", data.patientId)
      .order("captured_at", { ascending: false })
      .limit(data.limit);

    if (error) throw new Error(error.message);
    return (rows ?? []) as CaptureAuditRow[];
  });
