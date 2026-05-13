
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'cosmetologist');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  title text,
  avatar_url text,
  pin_hash text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  privacy_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'last_name');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cosmetologist');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Patients
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  date_of_birth date,
  medical_alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access patients" ON public.patients FOR ALL
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER patients_touch BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX patients_owner_idx ON public.patients(owner_id);

-- Appointments
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  treatment_type text,
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access appts" ON public.appointments FOR ALL
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER appointments_touch BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX appointments_owner_starts_idx ON public.appointments(owner_id, starts_at);

-- Consultations (wywiad)
CREATE TABLE public.consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_draft boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access consultations" ON public.consultations FOR ALL
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER consultations_touch BEFORE UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Treatment notes
CREATE TABLE public.treatment_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  treatment_type text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.treatment_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access tnotes" ON public.treatment_notes FOR ALL
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Gallery
CREATE TABLE public.gallery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  category text NOT NULL DEFAULT 'before',
  session_label text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access photos" ON public.gallery_photos FOR ALL
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Home care plans
CREATE TABLE public.home_care_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.home_care_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access plans" ON public.home_care_plans FOR ALL
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER home_care_touch BEFORE UPDATE ON public.home_care_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage bucket for patient photos (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-photos', 'patient-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owner read photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'patient-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner upload photos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'patient-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner update photos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'patient-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner delete photos" ON storage.objects FOR DELETE
  USING (bucket_id = 'patient-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
