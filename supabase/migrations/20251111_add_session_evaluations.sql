create table public.session_evaluations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  class_type_id uuid references public.class_types(id),
  instructor_id uuid references public.instructors(id),
  room_id uuid references public.rooms(id),
  session_start timestamptz,
  session_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rating_reservation_process smallint not null check (rating_reservation_process between 1 and 5),
  rating_reception smallint not null check (rating_reception between 1 and 5),
  rating_cleanliness smallint not null check (rating_cleanliness between 1 and 5),
  rating_lighting smallint not null check (rating_lighting between 1 and 5),
  rating_climate smallint not null check (rating_climate between 1 and 5),
  rating_noise smallint not null check (rating_noise between 1 and 5),
  rating_room_comfort smallint not null check (rating_room_comfort between 1 and 5),
  rating_equipment_condition smallint not null check (rating_equipment_condition between 1 and 5),
  rating_equipment_availability smallint not null check (rating_equipment_availability between 1 and 5),
  rating_instructor_respect smallint not null check (rating_instructor_respect between 1 and 5),
  rating_instructor_clarity smallint not null check (rating_instructor_clarity between 1 and 5),
  rating_instructor_technique smallint not null check (rating_instructor_technique between 1 and 5),
  discomfort boolean not null default false,
  discomfort_notes text,
  nps_score smallint check (nps_score between 0 and 10),
  comment text,
  summary_reception numeric(4,2) not null,
  summary_environment numeric(4,2) not null,
  summary_equipment numeric(4,2) not null,
  summary_instructor numeric(4,2) not null,
  summary_global numeric(4,2) not null,
  constraint session_evaluations_booking_id_key unique (booking_id)
);

create index session_evaluations_booking_idx on public.session_evaluations(booking_id);
create index session_evaluations_session_idx on public.session_evaluations(session_id);
create index session_evaluations_client_idx on public.session_evaluations(client_id);
create index session_evaluations_instructor_idx on public.session_evaluations(instructor_id);
create index session_evaluations_created_idx on public.session_evaluations(created_at);

alter table public.session_evaluations enable row level security;

create policy session_evaluations_admin_all on public.session_evaluations
  using (((auth.jwt() ? 'is_admin'::text) and ((auth.jwt() ->> 'is_admin'::text))::boolean))
  with check (((auth.jwt() ? 'is_admin'::text) and ((auth.jwt() ->> 'is_admin'::text))::boolean));

create policy session_evaluations_client_select on public.session_evaluations
  for select using (
    exists (
      select 1 from public.clients c
      where c.id = session_evaluations.client_id
        and c.auth_user_id = auth.uid()
    )
  );

create policy session_evaluations_client_insert on public.session_evaluations
  for insert with check (
    exists (
      select 1 from public.clients c
      where c.id = session_evaluations.client_id
        and c.auth_user_id = auth.uid()
    )
  );

create policy session_evaluations_client_update on public.session_evaluations
  for update using (
    exists (
      select 1 from public.clients c
      where c.id = session_evaluations.client_id
        and c.auth_user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.clients c
      where c.id = session_evaluations.client_id
        and c.auth_user_id = auth.uid()
    )
  );

create trigger trg_session_evaluations_updated_at
  before update on public.session_evaluations
  for each row execute function public.set_updated_at_timestamp();
