alter table public.studio_settings
  add column if not exists memberships_enabled boolean not null default true;

update public.studio_settings
set memberships_enabled = coalesce(memberships_enabled, true)
where memberships_enabled is distinct from true;
