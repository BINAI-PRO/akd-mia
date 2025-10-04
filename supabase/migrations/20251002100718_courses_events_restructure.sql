BEGIN;

ALTER TABLE public.courses
  ADD COLUMN session_count integer NOT NULL DEFAULT 1,
  ADD COLUMN session_duration_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN lead_instructor_id uuid;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_lead_instructor_id_fkey FOREIGN KEY (lead_instructor_id) REFERENCES public.instructors(id) ON DELETE SET NULL;

ALTER TABLE public.courses
  ALTER COLUMN session_count DROP DEFAULT,
  ALTER COLUMN session_duration_minutes DROP DEFAULT;

ALTER TABLE public.sessions
  ADD COLUMN course_id uuid REFERENCES public.courses(id);

CREATE TYPE public.event_status AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');

CREATE TABLE public.events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  lead_instructor_id uuid REFERENCES public.instructors(id) ON DELETE SET NULL,
  capacity integer,
  status public.event_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TABLE public.event_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  instructor_id uuid REFERENCES public.instructors(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  capacity integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_public_read ON public.events
  FOR SELECT USING (true);

CREATE POLICY events_admin_all ON public.events
  FOR ALL
  USING (((auth.jwt() ? 'is_admin'::text) AND ((auth.jwt() ->> 'is_admin'::text))::boolean))
  WITH CHECK (((auth.jwt() ? 'is_admin'::text) AND ((auth.jwt() ->> 'is_admin'::text))::boolean));

CREATE POLICY event_sessions_public_read ON public.event_sessions
  FOR SELECT USING (true);

CREATE POLICY event_sessions_admin_all ON public.event_sessions
  FOR ALL
  USING (((auth.jwt() ? 'is_admin'::text) AND ((auth.jwt() ->> 'is_admin'::text))::boolean))
  WITH CHECK (((auth.jwt() ? 'is_admin'::text) AND ((auth.jwt() ->> 'is_admin'::text))::boolean));

COMMIT;
