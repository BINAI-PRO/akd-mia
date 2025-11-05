create table if not exists public.studio_settings (
  key text primary key,
  schedule_timezone text not null default 'Etc/GMT-1',
  updated_at timestamp with time zone not null default now(),
  updated_by uuid references public.staff(id)
);

insert into public.studio_settings (key, schedule_timezone)
values ('default', 'Etc/GMT-1')
on conflict (key) do nothing;
