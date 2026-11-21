-- Storefront analytics for vibecodedslopware.com (private admin dashboard).
--
-- Lives in its own schema, `storefront`, inside the shared forageAIv2 project. That project also holds
-- ForageAI's end-user accounts, so being signed in proves nothing here: every read and write is gated
-- by an explicit row in storefront.members, checked by storefront.is_member() in RLS policies.
-- There are no members after this migration. Adding Tim and Josh is a separate, manual step
-- (docs/storefront-analytics.md, "Onboarding").
--
-- Writers:
--   * members (role authenticated, RLS applies): listings, manual imports, their own audit rows.
--   * the server (service_role, bypasses RLS): first-party events and API syncs, through the
--     functions at the bottom, which are granted to service_role only.
-- anon gets nothing.
--
-- Checked in only. Not applied to any live database by the session that wrote it.

create schema if not exists storefront;
revoke all on schema storefront from public;
revoke all on schema storefront from anon;
grant usage on schema storefront to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Who may see this. No email or name is stored here; the auth user id is the identity.
create table storefront.members (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('owner', 'admin')),
  require_mfa boolean not null default false,
  added_at    timestamptz not null default now(),
  note        text check (char_length(note) <= 200)
);

-- The caller's role, or null. Fails closed: anonymous sign-ins, unconfirmed, banned or deleted
-- users, non-'authenticated' JWTs and (when require_mfa) sessions below aal2 all get null.
create function storefront.member_role() returns text
language sql stable security definer set search_path = '' as $$
  select m.role
  from storefront.members m
  join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid()
    and coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and coalesce(u.is_anonymous, false) = false
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until < now())
    and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    and (not m.require_mfa or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$$;

create function storefront.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select storefront.member_role() is not null
$$;

create function storefront.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select storefront.member_role() is not distinct from 'owner'
$$;

-- ---------------------------------------------------------------------------------------------
-- What we sell or give away, and where.
create table storefront.games (
  slug       text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  title      text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now()
);

-- One row per (platform, source id). `external_id` is the id the platform's own API uses
-- (itch game id, Steam appid/packageid, CurseForge project id, GitHub asset name, site path).
-- `url` is the public page an outbound click goes to, when there is one.
create table storefront.listings (
  id          uuid primary key default gen_random_uuid(),
  game_slug   text not null references storefront.games (slug) on update cascade,
  platform    text not null check (platform in ('site', 'itch', 'steam', 'epic', 'curseforge', 'github')),
  kind        text not null check (kind in ('site_asset', 'itch_game', 'steam_app', 'steam_package',
                                            'epic_product', 'curseforge_project', 'github_asset', 'store_page')),
  external_id text not null check (char_length(external_id) between 1 and 300),
  url         text check (url is null or url ~ '^https://[^\s]+$'),
  label       text check (char_length(label) <= 120),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (platform, kind, external_id)
);
create index listings_game on storefront.listings (game_slug);
create index listings_url on storefront.listings (url) where url is not null;

-- ---------------------------------------------------------------------------------------------
-- First-party tracking. A visitor hash is an HMAC of (day, client address, user agent) made on the
-- server with a secret; it only deduplicates repeats within one day and is deleted by
-- rollup_first_party() after two days, leaving the per-day counts in first_party_daily.
create table storefront.first_party_events (
  listing_id   uuid not null references storefront.listings (id) on delete cascade,
  kind         text not null check (kind in ('site_download', 'outbound_click')),
  day          date not null,
  visitor_hash text not null check (visitor_hash ~ '^[A-Za-z0-9_-]{43}$'),
  primary key (listing_id, kind, day, visitor_hash)
);

create table storefront.first_party_daily (
  listing_id uuid not null references storefront.listings (id) on delete cascade,
  kind       text not null check (kind in ('site_download', 'outbound_click')),
  day        date not null,
  visitors   integer not null check (visitors >= 0),
  primary key (listing_id, kind, day)
);

-- ---------------------------------------------------------------------------------------------
-- Platform-reported numbers. Never summed across currencies; revenue rows always carry one.
--   basis 'day'        value for that one day (Steam).
--   basis 'cumulative' lifetime total as reported on `day` (itch, CurseForge, GitHub).
create table storefront.sync_runs (
  id           uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('itch', 'steam', 'curseforge', 'github', 'fixture')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'success', 'error')),
  rows_written integer not null default 0,
  message      text check (char_length(message) <= 500)
);

create table storefront.imports (
  id           uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('epic_import', 'manual_import')),
  file_sha256  text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  filename     text check (char_length(filename) <= 200),
  row_count    integer not null check (row_count >= 0),
  imported_by  uuid not null default auth.uid(),
  imported_at  timestamptz not null default now(),
  unique (source, file_sha256)
);

create table storefront.metrics (
  listing_id uuid not null references storefront.listings (id) on delete cascade,
  metric     text not null check (metric in ('sales_units', 'refund_units', 'free_claims', 'store_downloads',
                                             'key_activations', 'views', 'revenue_gross', 'revenue_net', 'earnings')),
  basis      text not null check (basis in ('day', 'cumulative')),
  day        date not null,
  currency   text not null default '' check (currency = '' or currency ~ '^[A-Z]{3}$'),
  value      numeric(20, 4) not null check (value >= 0),
  source     text not null check (source in ('itch', 'steam', 'curseforge', 'github', 'fixture', 'epic_import', 'manual_import')),
  run_id     uuid references storefront.sync_runs (id) on delete set null,
  import_id  uuid references storefront.imports (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (listing_id, metric, basis, day, currency),
  check ((metric in ('revenue_gross', 'revenue_net', 'earnings')) = (currency <> '')),
  check (num_nonnulls(run_id, import_id) <= 1)
);
create index metrics_day on storefront.metrics (day);

-- Per source: last attempt, last success, and an opaque resume cursor (Steam's highwatermark).
create table storefront.source_state (
  source          text primary key check (source in ('itch', 'steam', 'curseforge', 'github', 'fixture', 'epic_import', 'manual_import')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error      text check (char_length(last_error) <= 500),
  cursor          jsonb not null default '{}'::jsonb
);

create table storefront.audit_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  uuid default auth.uid(),
  action text not null check (char_length(action) <= 60),
  detail jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------------------------
-- Privileges. Start from nothing, then grant exactly what RLS below narrows.
revoke all on all tables in schema storefront from public, anon, authenticated;
revoke all on all functions in schema storefront from public, anon;
alter default privileges in schema storefront revoke all on tables from public, anon, authenticated;
alter default privileges in schema storefront revoke all on functions from public, anon;

grant select on all tables in schema storefront to authenticated;
grant insert, update on storefront.games, storefront.listings to authenticated;
grant insert on storefront.imports, storefront.audit_log to authenticated;
grant insert, update on storefront.metrics to authenticated;
grant all on all tables in schema storefront to service_role;
grant execute on function storefront.member_role(), storefront.is_member(), storefront.is_owner() to authenticated, service_role;

alter table storefront.members            enable row level security;
alter table storefront.games              enable row level security;
alter table storefront.listings           enable row level security;
alter table storefront.first_party_events enable row level security;
alter table storefront.first_party_daily  enable row level security;
alter table storefront.sync_runs          enable row level security;
alter table storefront.imports            enable row level security;
alter table storefront.metrics            enable row level security;
alter table storefront.source_state       enable row level security;
alter table storefront.audit_log          enable row level security;

-- Reads: members only. (Policies are `to authenticated`; anon has no grants at all.)
create policy members_read      on storefront.members            for select to authenticated using (storefront.is_member());
create policy games_read        on storefront.games              for select to authenticated using (storefront.is_member());
create policy listings_read     on storefront.listings           for select to authenticated using (storefront.is_member());
create policy fp_events_read    on storefront.first_party_events for select to authenticated using (storefront.is_member());
create policy fp_daily_read     on storefront.first_party_daily  for select to authenticated using (storefront.is_member());
create policy runs_read         on storefront.sync_runs          for select to authenticated using (storefront.is_member());
create policy imports_read      on storefront.imports            for select to authenticated using (storefront.is_member());
create policy metrics_read      on storefront.metrics            for select to authenticated using (storefront.is_member());
create policy state_read        on storefront.source_state       for select to authenticated using (storefront.is_member());
create policy audit_read        on storefront.audit_log          for select to authenticated using (storefront.is_member());

-- Writes by members: the catalog, and manual imports. Nobody but the server writes API-sourced
-- numbers, and members cannot touch storefront.members at all (no policy, no grant).
create policy games_insert    on storefront.games    for insert to authenticated with check (storefront.is_member());
create policy games_update    on storefront.games    for update to authenticated using (storefront.is_member()) with check (storefront.is_member());
create policy listings_insert on storefront.listings for insert to authenticated with check (storefront.is_member());
create policy listings_update on storefront.listings for update to authenticated using (storefront.is_member()) with check (storefront.is_member());
create policy imports_insert  on storefront.imports  for insert to authenticated
  with check (storefront.is_member() and imported_by = auth.uid());
create policy metrics_import_insert on storefront.metrics for insert to authenticated
  with check (storefront.is_member() and source in ('epic_import', 'manual_import') and import_id is not null and run_id is null);
create policy metrics_import_update on storefront.metrics for update to authenticated
  using (storefront.is_member() and source in ('epic_import', 'manual_import'))
  with check (storefront.is_member() and source in ('epic_import', 'manual_import') and import_id is not null and run_id is null);
create policy audit_insert on storefront.audit_log for insert to authenticated
  with check (storefront.is_member() and actor = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- Member-callable functions. SECURITY INVOKER, so every statement inside runs under the RLS above.

-- One manual import (Epic portal export transcribed to the template, or any other validated file).
-- Idempotent: the same file (by SHA-256) is accepted once; re-sending it changes nothing. A later,
-- different file that covers the same rows replaces them (latest import wins).
-- p_rows: [{listing_id, metric, basis, day, currency, value}, ...]
create function storefront.import_metrics(p_source text, p_sha256 text, p_filename text, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_import uuid;
  v_count integer;
begin
  if not storefront.is_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_source not in ('epic_import', 'manual_import') then
    raise exception 'unknown import source' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 20000 then
    raise exception 'rows must be a non-empty array of at most 20000' using errcode = '22023';
  end if;

  if exists (select 1 from storefront.imports i where i.source = p_source and i.file_sha256 = p_sha256) then
    return jsonb_build_object('status', 'duplicate', 'rows', 0);
  end if;
  -- An Epic import may only describe Epic listings; no import may overwrite an API-sourced number.
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    left join storefront.listings l on l.id = (r ->> 'listing_id')::uuid
    where l.id is null or (p_source = 'epic_import' and l.platform <> 'epic')
  ) then
    raise exception 'import rows must reference known listings of the import''s platform' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    join storefront.metrics m on m.listing_id = (r ->> 'listing_id')::uuid and m.metric = r ->> 'metric'
      and m.basis = r ->> 'basis' and m.day = (r ->> 'day')::date and m.currency = coalesce(r ->> 'currency', '')
    where m.source not in ('epic_import', 'manual_import')
  ) then
    raise exception 'import would overwrite platform-reported data' using errcode = '22023';
  end if;

  insert into storefront.imports (source, file_sha256, filename, row_count)
  values (p_source, p_sha256, left(p_filename, 200), jsonb_array_length(p_rows))
  returning id into v_import;

  insert into storefront.metrics as m (listing_id, metric, basis, day, currency, value, source, import_id, updated_at)
  select (r ->> 'listing_id')::uuid, r ->> 'metric', r ->> 'basis', (r ->> 'day')::date,
         coalesce(r ->> 'currency', ''), (r ->> 'value')::numeric, p_source, v_import, now()
  from jsonb_array_elements(p_rows) r
  on conflict (listing_id, metric, basis, day, currency) do update
    set value = excluded.value, source = excluded.source, import_id = excluded.import_id,
        run_id = null, updated_at = now();
  get diagnostics v_count = row_count;

  insert into storefront.audit_log (action, detail)
  values ('import', jsonb_build_object('source', p_source, 'import_id', v_import, 'rows', v_count, 'filename', left(p_filename, 200)));

  return jsonb_build_object('status', 'imported', 'import_id', v_import, 'rows', v_count);
end $$;

-- Everything the dashboard shows for a date window, one row per (listing, metric, currency).
--   day-basis metrics and first-party counts: summed over [p_from, p_to], with the days that had data.
--   cumulative metrics: the latest snapshot on or before p_to (a lifetime figure, not windowed).
create function storefront.report(p_from date, p_to date)
returns table (listing_id uuid, metric text, basis text, currency text, value numeric,
               first_day date, last_day date, days_with_data integer, sources text, updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with fp as (
    select d.listing_id, d.kind, d.day, d.visitors::numeric as n from storefront.first_party_daily d
    where d.day between p_from and p_to
    union all
    select e.listing_id, e.kind, e.day, count(*)::numeric from storefront.first_party_events e
    where e.day between p_from and p_to
      and not exists (select 1 from storefront.first_party_daily d
                      where d.listing_id = e.listing_id and d.kind = e.kind and d.day = e.day)
    group by e.listing_id, e.kind, e.day
  ),
  snap as (
    select distinct on (m.listing_id, m.metric, m.currency)
           m.listing_id, m.metric, m.currency, m.value, m.day, m.source, m.updated_at
    from storefront.metrics m
    where m.basis = 'cumulative' and m.day <= p_to
    order by m.listing_id, m.metric, m.currency, m.day desc
  )
  select m.listing_id, m.metric, 'day', m.currency, sum(m.value), min(m.day), max(m.day),
         count(distinct m.day)::integer, string_agg(distinct m.source, ','), max(m.updated_at)
  from storefront.metrics m
  where m.basis = 'day' and m.day between p_from and p_to
  group by m.listing_id, m.metric, m.currency
  union all
  select s.listing_id, s.metric, 'cumulative', s.currency, s.value, s.day, s.day, 1, s.source, s.updated_at
  from snap s
  union all
  select fp.listing_id, fp.kind, 'day', '', sum(fp.n), min(fp.day), max(fp.day),
         count(distinct fp.day)::integer, 'first_party', null::timestamptz
  from fp
  group by fp.listing_id, fp.kind
$$;

grant execute on function storefront.import_metrics(text, text, text, jsonb) to authenticated;
grant execute on function storefront.report(date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Server-only functions (service_role). Not executable by authenticated or anon.

-- Make the catalog match lib/storefront/catalog.json. Upserts; never deletes (a listing that
-- disappears from the catalog is marked inactive so its history stays).
create function storefront.sync_catalog(p_catalog jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare v_n integer;
begin
  insert into storefront.games as g (slug, title)
  select key, value ->> 'title' from jsonb_each(p_catalog -> 'games')
  on conflict (slug) do update set title = excluded.title where g.title is distinct from excluded.title;

  insert into storefront.listings as l (game_slug, platform, kind, external_id, url, label, active)
  select g.key, x ->> 'platform', x ->> 'kind', x ->> 'id', x ->> 'url', x ->> 'label', true
  from jsonb_each(p_catalog -> 'games') g, jsonb_array_elements(g.value -> 'listings') x
  on conflict (platform, kind, external_id) do update
    set game_slug = excluded.game_slug, url = excluded.url, label = excluded.label, active = true;
  get diagnostics v_n = row_count;

  update storefront.listings l set active = false
  where l.active and not exists (
    select 1 from jsonb_each(p_catalog -> 'games') g, jsonb_array_elements(g.value -> 'listings') x
    where x ->> 'platform' = l.platform and x ->> 'kind' = l.kind and x ->> 'id' = l.external_id);
  return v_n;
end $$;

-- Count one site download or outbound click. The server has already checked the target against
-- the catalog. Returns true when it was new for that visitor today (false for a repeat).
create function storefront.record_event(p_platform text, p_kind text, p_external_id text,
                                        p_event text, p_day date, p_visitor_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_listing uuid; v_n integer;
begin
  select l.id into v_listing from storefront.listings l
  where l.platform = p_platform and l.kind = p_kind and l.external_id = p_external_id and l.active;
  if v_listing is null then return false; end if;
  insert into storefront.first_party_events (listing_id, kind, day, visitor_hash)
  values (v_listing, p_event, p_day, p_visitor_hash)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

-- Fold days older than p_keep_days into per-day counts and delete their visitor hashes.
create function storefront.rollup_first_party(p_keep_days integer default 2) returns integer
language plpgsql security invoker set search_path = '' as $$
declare v_cut date := current_date - greatest(p_keep_days, 1); v_n integer;
begin
  insert into storefront.first_party_daily as d (listing_id, kind, day, visitors)
  select e.listing_id, e.kind, e.day, count(*) from storefront.first_party_events e
  where e.day < v_cut group by 1, 2, 3
  on conflict (listing_id, kind, day) do update set visitors = d.visitors + excluded.visitors;
  delete from storefront.first_party_events e where e.day < v_cut;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function storefront.begin_run(p_source text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  insert into storefront.sync_runs (source) values (p_source) returning id into v_id;
  insert into storefront.source_state as s (source, last_attempt_at) values (p_source, now())
  on conflict (source) do update set last_attempt_at = now();
  return v_id;
end $$;

-- Upsert one batch of API rows for a run. For basis 'day' the caller sends complete totals for
-- each day it touches (Steam: every page of a date summed first), so replacing is correct and a
-- rerun of the same data is a no-op in effect.
-- p_rows: [{platform, kind, external_id, metric, basis, day, currency, value}, ...]
create function storefront.upsert_metrics(p_run uuid, p_rows jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare v_source text; v_n integer;
begin
  select r.source into v_source from storefront.sync_runs r where r.id = p_run and r.status = 'running';
  if v_source is null then raise exception 'no running sync run %', p_run; end if;
  insert into storefront.metrics as m (listing_id, metric, basis, day, currency, value, source, run_id, updated_at)
  select l.id, r ->> 'metric', r ->> 'basis', (r ->> 'day')::date, coalesce(r ->> 'currency', ''),
         (r ->> 'value')::numeric, v_source, p_run, now()
  from jsonb_array_elements(p_rows) r
  join storefront.listings l on l.platform = r ->> 'platform' and l.kind = r ->> 'kind' and l.external_id = r ->> 'external_id'
  on conflict (listing_id, metric, basis, day, currency) do update
    set value = excluded.value, source = excluded.source, run_id = excluded.run_id, import_id = null, updated_at = now()
    where m.value is distinct from excluded.value or m.source is distinct from excluded.source;
  get diagnostics v_n = row_count;
  update storefront.sync_runs set rows_written = rows_written + v_n where id = p_run;
  return v_n;
end $$;

create function storefront.finish_run(p_run uuid, p_ok boolean, p_message text, p_cursor jsonb default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_source text;
begin
  update storefront.sync_runs set finished_at = now(), status = case when p_ok then 'success' else 'error' end,
         message = left(p_message, 500)
  where id = p_run and status = 'running' returning source into v_source;
  if v_source is null then raise exception 'no running sync run %', p_run; end if;
  update storefront.source_state set
    last_success_at = case when p_ok then now() else last_success_at end,
    last_error = case when p_ok then null else left(p_message, 500) end,
    cursor = case when p_ok and p_cursor is not null then p_cursor else cursor end
  where source = v_source;
end $$;

-- Record that a manual import happened, for the coverage panel.
create function storefront.touch_import_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into storefront.source_state as s (source, last_attempt_at, last_success_at)
  values (new.source, now(), now())
  on conflict (source) do update set last_attempt_at = now(), last_success_at = now(), last_error = null;
  return new;
end $$;
revoke all on function storefront.touch_import_state() from public, anon, authenticated;
create trigger imports_touch_state after insert on storefront.imports
  for each row execute function storefront.touch_import_state();

revoke all on function storefront.sync_catalog(jsonb), storefront.record_event(text, text, text, text, date, text),
  storefront.rollup_first_party(integer), storefront.begin_run(text), storefront.upsert_metrics(uuid, jsonb),
  storefront.finish_run(uuid, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function storefront.sync_catalog(jsonb), storefront.record_event(text, text, text, text, date, text),
  storefront.rollup_first_party(integer), storefront.begin_run(text), storefront.upsert_metrics(uuid, jsonb),
  storefront.finish_run(uuid, boolean, text, jsonb) to service_role;
