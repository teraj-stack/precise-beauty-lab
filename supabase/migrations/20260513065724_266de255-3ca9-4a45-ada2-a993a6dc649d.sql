-- Enforce idempotent audit save: prevent duplicates of the same JPEG
-- (owner_id + jpeg_sha256 + captured_at) at the database level so concurrent
-- requests are guaranteed to produce a single row even if the server-side
-- existence check races with another in-flight insert.
CREATE UNIQUE INDEX IF NOT EXISTS capture_audits_owner_sha_capturedat_key
  ON public.capture_audits (owner_id, jpeg_sha256, captured_at);