-- Server-side inbox for mission drafts created through the authoring MCP.
-- The table is never directly exposed through the Data API. All access goes
-- through GM-key-gated functions, and the MCP token remains at the app edge.

create table public.fc_mission_author_drafts (
  id uuid primary key default gen_random_uuid(),
  room text not null references public.fc_sessions(room) on delete cascade,
  mission_id text not null
    check (mission_id ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  mission jsonb not null,
  created_by text not null default 'ChatGPT'
    check (char_length(btrim(created_by)) between 1 and 100),
  created_at timestamptz not null default now(),
  imported_at timestamptz,
  check (mission ->> 'format' = 'friend-computer-mission'),
  check (mission ->> 'version' = '1'),
  check (mission ->> 'id' = mission_id),
  check (octet_length(mission::text) <= 1048576)
);

create index fc_mission_author_drafts_room_created_idx
  on public.fc_mission_author_drafts (room, created_at desc);

create index fc_mission_author_drafts_pending_idx
  on public.fc_mission_author_drafts (room, created_at desc)
  where imported_at is null;

alter table public.fc_mission_author_drafts enable row level security;

revoke all on table public.fc_mission_author_drafts from public, anon, authenticated;

create or replace function public.fc_save_mission_author_draft(
  p_room text,
  p_gm_key text,
  p_mission jsonb,
  p_created_by text default 'ChatGPT'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  draft_id uuid;
  normalized_author text := left(coalesce(nullif(btrim(p_created_by), ''), 'ChatGPT'), 100);
begin
  if not public.fc_ensure_session(p_room, p_gm_key) then return null; end if;
  if p_mission is null
    or p_mission ->> 'format' <> 'friend-computer-mission'
    or p_mission ->> 'version' <> '1'
    or coalesce(p_mission ->> 'id', '') !~ '^[a-z0-9][a-z0-9_-]{2,63}$'
    or char_length(btrim(coalesce(p_mission ->> 'title', ''))) not between 1 and 200
    or coalesce(jsonb_typeof(p_mission -> 'director' -> 'scenes'), '') <> 'array'
    or octet_length(p_mission::text) > 1048576
  then
    return null;
  end if;

  if jsonb_array_length(p_mission -> 'director' -> 'scenes') < 1 then return null; end if;

  if (
    select count(*) >= 20
    from public.fc_mission_author_drafts d
    where d.room = p_room and d.created_at >= now() - interval '1 hour'
  ) then
    return null;
  end if;

  delete from public.fc_mission_author_drafts d
  where d.room = p_room
    and (
      d.created_at < now() - interval '90 days'
      or (d.imported_at is not null and d.imported_at < now() - interval '14 days')
    );

  insert into public.fc_mission_author_drafts(room, mission_id, title, mission, created_by)
  values (
    p_room,
    p_mission ->> 'id',
    btrim(p_mission ->> 'title'),
    p_mission,
    normalized_author
  )
  returning id into draft_id;

  return draft_id;
end;
$function$;

create or replace function public.fc_list_mission_author_drafts(
  p_room text,
  p_gm_key text,
  p_include_imported boolean default false
)
returns table(
  id uuid,
  mission_id text,
  title text,
  created_by text,
  created_at timestamptz,
  imported_at timestamptz,
  mission jsonb
)
language plpgsql
security definer
set search_path = public, extensions
as $function$
begin
  if not public.fc_ensure_session(p_room, p_gm_key) then return; end if;

  return query
  select d.id, d.mission_id, d.title, d.created_by, d.created_at, d.imported_at, d.mission
  from public.fc_mission_author_drafts d
  where d.room = p_room
    and (coalesce(p_include_imported, false) or d.imported_at is null)
  order by d.created_at desc
  limit 50;
end;
$function$;

create or replace function public.fc_mark_mission_author_draft_imported(
  p_room text,
  p_gm_key text,
  p_draft_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $function$
begin
  if not public.fc_ensure_session(p_room, p_gm_key) then return false; end if;

  update public.fc_mission_author_drafts d
  set imported_at = coalesce(d.imported_at, now())
  where d.room = p_room and d.id = p_draft_id;

  return found;
end;
$function$;

revoke all on function public.fc_save_mission_author_draft(text, text, jsonb, text) from public, authenticated;
revoke all on function public.fc_list_mission_author_drafts(text, text, boolean) from public, authenticated;
revoke all on function public.fc_mark_mission_author_draft_imported(text, text, uuid) from public, authenticated;

grant execute on function public.fc_save_mission_author_draft(text, text, jsonb, text) to anon;
grant execute on function public.fc_list_mission_author_drafts(text, text, boolean) to anon;
grant execute on function public.fc_mark_mission_author_draft_imported(text, text, uuid) to anon;
