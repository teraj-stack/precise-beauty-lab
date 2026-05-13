import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CaptureAuditRow } from "./capture-audit-list.functions";

const InputSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  decision: z.string().min(1).max(64).optional(),
  source: z.string().min(1).max(64).optional(),
  sha256: z
    .string()
    .min(4)
    .max(64)
    .regex(/^[a-fA-F0-9]+$/)
    .optional(),
  patientId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export interface AuditSearchResult {
  rows: CaptureAuditRow[];
  truncated: boolean;
}

export const searchCaptureAudits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AuditSearchResult> => {
    const { supabase } = context;
    let q = supabase
      .from("capture_audits")
      .select(
        "id, created_at, captured_at, decision, profile_version, thresholds_version, image_width, image_height, image_bytes, jpeg_sha256, source, report",
      )
      .order("captured_at", { ascending: false })
      .limit(data.limit);

    if (data.from) q = q.gte("captured_at", data.from);
    if (data.to) q = q.lte("captured_at", data.to);
    if (data.decision) q = q.eq("decision", data.decision);
    if (data.source) q = q.eq("source", data.source);
    if (data.patientId) q = q.eq("patient_id", data.patientId);
    if (data.sha256) {
      const v = data.sha256.toLowerCase();
      if (v.length === 64) q = q.eq("jpeg_sha256", v);
      else q = q.ilike("jpeg_sha256", `${v}%`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as CaptureAuditRow[];
    return { rows: list, truncated: list.length >= data.limit };
  });
