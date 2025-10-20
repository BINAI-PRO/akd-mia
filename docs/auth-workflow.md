# Auth Workflow Guide

This project now separates authentication (Supabase **auth.users**) from business records (tables under `public`). Follow these steps to keep everything wired correctly.

## 1. Database migration

Run the SQL in `supabase/migrations/20251019_add_auth_user_id_to_clients.sql` against your Supabase project (via the Dashboard SQL editor, Supabase CLI, or migration runner):

```sql
alter table public.clients
  add column if not exists auth_user_id uuid unique;
```

Link existing clients manually afterwards:

```sql
update public.clients
set auth_user_id = '<AUTH_USER_UUID>'
where id = '<CLIENT_UUID>';
```

## 2. Creating users

Use the provided script (reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`):

```bash
npm run create:supabase-user -- admin@atpilatestime.com SuperSecret123 "Admin AT" <optional-client-uuid>
```

It will:

1. Create the Supabase Auth user with `is_admin=true`.
2. Optionally link the new auth user to an existing `public.clients` row (`auth_user_id`).

You can still add users manually from Supabase Dashboard → Authentication → Users (remember to set `app_metadata.is_admin` when appropriate).

## 3. Populating profile data

- **Primary source**: `public.clients` + `public.client_profiles`.
- **Auth metadata (optional)**: set in Supabase Dashboard → Users → Metadata.

The runtime profile resolution works like this:

1. Start with metadata from the Supabase session (name, avatar, admin flag).
2. Call `/api/me` (implemented in both apps) to pull enriched data from `clients` and `client_profiles`.
3. Merge the two sources so headers/layouts always render a name/avatar, even when metadata is empty.

If you keep `client_profiles.avatar_url` and `client_profiles.status` updated, both the admin panel and mobile app will display them automatically.

## 4. Linking future signups

Whenever you onboard a new client programmatically:

1. Create the auth user (either via Supabase Admin API or Dashboard).
2. Insert a `public.clients` row with standard info.
3. Set `auth_user_id` in that row to the auth user UUID.
4. Optionally update `auth.users` metadata to mirror `full_name`, `avatar_url`, etc. (the script can be extended to do this).

This keeps row-level security rules relying on `auth.uid()` aligned with your business tables and ensures UI components always have consistent profile information.
