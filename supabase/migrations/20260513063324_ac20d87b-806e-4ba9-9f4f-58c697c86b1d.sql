CREATE UNIQUE INDEX IF NOT EXISTS capture_audits_owner_sha_captured_uniq
  ON public.capture_audits (owner_id, jpeg_sha256, captured_at);