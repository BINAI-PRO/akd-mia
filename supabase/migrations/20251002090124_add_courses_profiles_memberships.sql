-- Add tables for courses and client profiles plus membership metadata enhancements
BEGIN;

CREATE TYPE public.course_status AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE public.course_visibility AS ENUM ('PUBLIC','PRIVATE');

CREATE TABLE public.courses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  slug text UNIQUE,
  description text,
  short_description text,
  price numeric(12,2),
  currency text NOT NULL DEFAULT 'MXN',
  duration_label text,
  level text,
  category text,
  visibility public.course_visibility NOT NULL DEFAULT 'PUBLIC',
  status public.course_status NOT NULL DEFAULT 'DRAFT',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  cover_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_courses_updated_at
BEFORE UPDATE ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY courses_public_read ON public.courses
FOR SELECT USING (true);

CREATE POLICY courses_admin_all ON public.courses
FOR ALL
USING (((auth.jwt() ? 'is_admin'::text) AND ((auth.jwt() ->> 'is_admin'::text))::boolean))
WITH CHECK (((auth.jwt() ? 'is_admin'::text) AND ((auth.jwt() ->> 'is_admin'::text))::boolean));

CREATE TYPE public.client_status AS ENUM ('ACTIVE','PAYMENT_FAILED','ON_HOLD','CANCELED');

CREATE TABLE public.client_profiles (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  status public.client_status NOT NULL DEFAULT 'ACTIVE',
  avatar_url text,
  birthdate date,
  occupation text,
  notes text,
  emergency_contact_name text,
  emergency_contact_phone text,
  preferred_apparatus text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_client_profiles_updated_at
BEFORE UPDATE ON public.client_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_profiles_admin_all ON public.client_profiles
FOR ALL
USING (((auth.jwt() ? 'is_admin'::text) AND ((auth.jwt() ->> 'is_admin'::text))::boolean))
WITH CHECK (((auth.jwt() ? 'is_admin'::text) AND ((auth.jwt() ->> 'is_admin'::text))::boolean));

ALTER TABLE public.membership_types
  ADD COLUMN trial_days integer,
  ADD COLUMN access_classes boolean NOT NULL DEFAULT true,
  ADD COLUMN access_courses boolean NOT NULL DEFAULT false,
  ADD COLUMN access_events boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.membership_types SET updated_at = created_at;

CREATE TRIGGER trg_membership_types_updated_at
BEFORE UPDATE ON public.membership_types
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.membership_usages
  ADD COLUMN credit_delta integer NOT NULL DEFAULT 1,
  ADD COLUMN notes text;

COMMIT;
