
CREATE TABLE public.capture_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  patient_id uuid,
  captured_at timestamptz NOT NULL,
  decision text NOT NULL,
  profile_version text NOT NULL,
  thresholds_version text NOT NULL,
  image_width integer NOT NULL,
  image_height integer NOT NULL,
  image_bytes integer NOT NULL,
  jpeg_sha256 text NOT NULL,
  report jsonb NOT NULL,
  source text NOT NULL DEFAULT 'jpeg-com',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.capture_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access capture_audits"
ON public.capture_audits
FOR ALL
USING ((owner_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((owner_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX capture_audits_owner_idx ON public.capture_audits (owner_id, created_at DESC);
CREATE INDEX capture_audits_patient_idx ON public.capture_audits (patient_id);
CREATE INDEX capture_audits_sha_idx ON public.capture_audits (jpeg_sha256);
