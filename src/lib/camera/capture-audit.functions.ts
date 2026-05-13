import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  performCaptureAuditInsert,
  type AuditSupabaseLike,
} from "./capture-audit-core";

const InputSchema = z.object({
  jpegBase64: z.string().min(64).max(20_000_000),
  patientId: z.string().uuid().nullable().optional(),
});

export const submitCaptureAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const bytes = Buffer.from(data.jpegBase64, "base64");
    return performCaptureAuditInsert(
      supabase as unknown as AuditSupabaseLike,
      userId,
      { jpegBytes: new Uint8Array(bytes), patientId: data.patientId ?? null },
    );
  });
