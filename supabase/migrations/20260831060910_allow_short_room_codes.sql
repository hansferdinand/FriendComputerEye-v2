alter table public.fc_sessions
  drop constraint if exists fc_sessions_room_length;

alter table public.fc_sessions
  add constraint fc_sessions_room_length
  check (char_length(room) between 1 and 96);

create or replace function public.fc_ensure_session(p_room text, p_gm_key text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  existing_hash bytea;
  supplied_hash bytea;
begin
  if p_room is null or char_length(p_room) < 1 or char_length(p_room) > 96 then
    return false;
  end if;

  if p_gm_key is null or char_length(p_gm_key) < 1 or char_length(p_gm_key) > 256 then
    return false;
  end if;

  supplied_hash := extensions.digest(convert_to(p_gm_key, 'UTF8'), 'sha256');
  select gm_key_hash into existing_hash from public.fc_sessions where room = p_room;

  if existing_hash is null then
    insert into public.fc_sessions(room, gm_key_hash)
    values (p_room, supplied_hash)
    on conflict (room) do nothing;
    select gm_key_hash into existing_hash from public.fc_sessions where room = p_room;
  end if;

  if existing_hash = supplied_hash then
    update public.fc_sessions set updated_at = now() where room = p_room;
    return true;
  end if;

  return false;
end;
$$;
