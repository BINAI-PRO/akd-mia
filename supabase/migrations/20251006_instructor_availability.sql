-- 2025-10-06 Instructor availability tables
BEGIN;

CREATE TABLE IF NOT EXISTS public.instructor_weekly_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_instructor_weekly_availability_time CHECK (start_time < end_time),
  CONSTRAINT instructor_weekly_availability_instructor_id_fkey FOREIGN KEY (instructor_id)
    REFERENCES public.instructors(id) ON DELETE CASCADE,
  CONSTRAINT instructor_weekly_availability_unique UNIQUE (instructor_id, weekday, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_instructor_weekly_availability_instructor_weekday
  ON public.instructor_weekly_availability (instructor_id, weekday);

CREATE TABLE IF NOT EXISTS public.instructor_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL,
  week_start_date date NOT NULL,
  label text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT instructor_week_overrides_instructor_id_fkey FOREIGN KEY (instructor_id)
    REFERENCES public.instructors(id) ON DELETE CASCADE,
  CONSTRAINT instructor_week_overrides_unique UNIQUE (instructor_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_instructor_week_overrides_instructor_week
  ON public.instructor_week_overrides (instructor_id, week_start_date);

CREATE TABLE IF NOT EXISTS public.instructor_week_override_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_instructor_week_override_slots_time CHECK (start_time < end_time),
  CONSTRAINT instructor_week_override_slots_override_id_fkey FOREIGN KEY (override_id)
    REFERENCES public.instructor_week_overrides(id) ON DELETE CASCADE,
  CONSTRAINT instructor_week_override_slots_unique UNIQUE (override_id, weekday, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_instructor_week_override_slots_override_weekday
  ON public.instructor_week_override_slots (override_id, weekday);

COMMIT;
