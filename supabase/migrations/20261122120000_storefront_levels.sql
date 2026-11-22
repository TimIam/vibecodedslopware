-- Par for the Curse course edits, published from the level editor on the live site.
--
-- Every publish is a new row (nothing is overwritten), so older versions stay here for a rollback.
-- The newest row per course is what players get:
--   * storefront.published_level(name)   anyone, including anon: the game reads it on load through
--                                         /api/admin?view=course (cached for a few seconds).
--   * storefront.publish_level(...)      owner and admin members only, checked inside; refuses (PT409,
--                                         which PostgREST answers as HTTP 409) when the course changed
--                                         since the editor loaded it, unless p_force.
--
-- This grants anon USAGE on the storefront schema, for published_level alone. Postgres gives every new
-- function EXECUTE to PUBLIC by default, and a per-schema default cannot take that back, so from now on
-- every function created in storefront must `revoke all ... from public, anon` right after it. The
-- storefront tests check that anon can call nothing else (tools/storefront.test.mjs).
--
-- forageAIv2 applies migrations one at a time: apply this file on its own (never `supabase db push`).

create table storefront.levels (
  id           bigint generated always as identity primary key,
  name         text not null check (name in ('front', 'back')),
  body         text not null check (octet_length(body) <= 1000000),
  published_at timestamptz not null default now(),
  published_by uuid default auth.uid()
);
create index levels_latest on storefront.levels (name, id desc);

alter table storefront.levels enable row level security;
revoke all on storefront.levels from public, anon, authenticated;
grant select on storefront.levels to authenticated;
grant all on storefront.levels to service_role;
create policy levels_read on storefront.levels for select to authenticated using (storefront.is_member());

-- The course players get: {id, text, at}, or null before the first publish.
create function storefront.published_level(p_name text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', l.id::text, 'text', l.body, 'at', l.published_at)
  from storefront.levels l
  where l.name = p_name
  order by l.id desc
  limit 1
$$;

-- p_base: the id the editor started from ('none' before the first publish).
-- Returns {id, unchanged}.
create function storefront.publish_level(p_name text, p_body text, p_base text, p_force boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_role text := storefront.member_role();
  v_id bigint;
  v_body text;
begin
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_name is null or p_name not in ('front', 'back') then
    raise exception 'unknown level' using errcode = '22023';
  end if;
  if p_body is null or octet_length(p_body) > 1000000 then
    raise exception 'level too large' using errcode = '22023';
  end if;
  -- One publish per course at a time, so two tabs cannot both pass the check below.
  perform pg_advisory_xact_lock(hashtext('storefront.levels'), hashtext(p_name));
  select l.id, l.body into v_id, v_body from storefront.levels l where l.name = p_name order by l.id desc limit 1;
  if not coalesce(p_force, false) and coalesce(p_base, 'none') is distinct from coalesce(v_id::text, 'none') then
    raise exception 'the course changed on the site since the editor loaded it' using errcode = 'PT409';
  end if;
  if v_body is not distinct from p_body then
    return jsonb_build_object('id', v_id::text, 'unchanged', true);
  end if;
  insert into storefront.levels (name, body) values (p_name, p_body) returning id into v_id;
  insert into storefront.audit_log (action, detail)
    values ('level-publish', jsonb_build_object('name', p_name, 'id', v_id, 'bytes', octet_length(p_body), 'forced', coalesce(p_force, false)));
  return jsonb_build_object('id', v_id::text, 'unchanged', false);
end;
$$;

-- Close any function left with Postgres' default EXECUTE for PUBLIC before anon can reach the schema,
-- then grant exactly the two new ones.
revoke all on all functions in schema storefront from public, anon;
revoke all on all tables in schema storefront from anon;
revoke all on all sequences in schema storefront from public, anon;
grant usage on schema storefront to anon;
grant execute on function storefront.published_level(text) to anon, authenticated, service_role;
grant execute on function storefront.publish_level(text, text, text, boolean) to authenticated;
