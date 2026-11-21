-- Test-only stand-in for the parts of a Supabase database the storefront migration depends on:
-- the anon / authenticated / service_role roles and auth.users, auth.uid(), auth.jwt(), auth.role().
-- The function bodies match Supabase's own definitions (they read the request.jwt.* settings that
-- PostgREST sets per request). Never applied to a real project.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key,
  email              text,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  banned_until       timestamptz,
  deleted_at         timestamptz,
  is_anonymous       boolean not null default false
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.role', true),
                         (current_setting('request.jwt.claims', true)::jsonb ->> 'role')), '')::text
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
