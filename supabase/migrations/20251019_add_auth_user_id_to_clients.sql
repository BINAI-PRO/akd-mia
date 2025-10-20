-- Link clients with Supabase auth users
alter table public.clients
  add column if not exists auth_user_id uuid unique;

-- Optional: backfill existing clients here by setting auth_user_id manually.
-- update public.clients set auth_user_id = '{SUPABASE_USER_UUID}' where id = '{CLIENT_UUID}';
