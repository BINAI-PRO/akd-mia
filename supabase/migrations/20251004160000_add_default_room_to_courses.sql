ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS default_room_id uuid;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_default_room_id_fkey
  FOREIGN KEY (default_room_id) REFERENCES public.rooms(id);
