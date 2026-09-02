-- Make GM oversight an always-on, explicitly disclosed property of table
-- messaging. Participant capability links still restrict players to their own
-- conversations, while the GM-key-gated list RPC can review every room message.

create or replace function public.fc_message_gm_settings(p_room text, p_gm_key text)
returns table(
  allow_player_to_player boolean,
  retention_hours smallint,
  gm_can_read_player_to_player boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $function$
begin
  if not public.fc_ensure_session(p_room, p_gm_key) then return; end if;

  insert into public.fc_message_settings(room)
  values (p_room)
  on conflict (room) do nothing;

  return query
  select s.allow_player_to_player, s.retention_hours, true
  from public.fc_message_settings s
  where s.room = p_room;
end;
$function$;

create or replace function public.fc_message_gm_list(
  p_room text,
  p_gm_key text,
  p_limit integer default 100
)
returns table(
  id bigint,
  sender_kind text,
  sender_seat smallint,
  sender_name text,
  recipient_kind text,
  recipient_seat smallint,
  recipient_name text,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $function$
begin
  if not public.fc_ensure_session(p_room, p_gm_key) then return; end if;
  perform public.fc_message_prune(p_room);

  return query
  select m.id,
         m.sender_kind,
         m.sender_seat,
         case when m.sender_kind = 'gm' then 'GM' else sc.display_name end,
         m.recipient_kind,
         m.recipient_seat,
         case when m.recipient_kind = 'gm' then 'GM' else rc.display_name end,
         extensions.pgp_sym_decrypt(m.body_cipher, encode(s.gm_key_hash, 'hex')),
         m.created_at,
         m.read_at
  from public.fc_direct_messages m
  join public.fc_sessions s on s.room = m.room
  left join public.fc_citizens sc on sc.room = m.room and sc.seat = m.sender_seat
  left join public.fc_citizens rc on rc.room = m.room and rc.seat = m.recipient_seat
  where m.room = p_room
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$function$;

create or replace function public.fc_message_player_identity(p_token text)
returns table(
  room text,
  seat smallint,
  citizen_id text,
  display_name text,
  allow_player_to_player boolean,
  retention_hours smallint,
  gm_can_read_player_to_player boolean,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  token_room text;
  token_seat smallint;
begin
  select i.room, i.seat into token_room, token_seat
  from public.fc_message_token_identity(p_token) i;
  if token_room is null then return; end if;

  update public.fc_message_participants p
  set last_seen_at = now()
  where p.room = token_room
    and p.seat = token_seat
    and (p.last_seen_at is null or p.last_seen_at < now() - interval '1 minute');

  return query
  select c.room,
         c.seat,
         c.citizen_id,
         c.display_name,
         coalesce(s.allow_player_to_player, false),
         coalesce(s.retention_hours, 168::smallint),
         true,
         p.expires_at
  from public.fc_citizens c
  join public.fc_message_participants p on p.room = c.room and p.seat = c.seat
  left join public.fc_message_settings s on s.room = c.room
  where c.room = token_room and c.seat = token_seat;
end;
$function$;

revoke all on function public.fc_message_gm_settings(text, text) from public, anon, authenticated;
revoke all on function public.fc_message_gm_list(text, text, integer) from public, anon, authenticated;
revoke all on function public.fc_message_player_identity(text) from public, anon, authenticated;

grant execute on function public.fc_message_gm_settings(text, text) to anon;
grant execute on function public.fc_message_gm_list(text, text, integer) to anon;
grant execute on function public.fc_message_player_identity(text) to anon;

comment on function public.fc_message_gm_list(text, text, integer) is
  'Returns all encrypted room messages to an authorized GM, including disclosed Citizen-to-Citizen table traffic.';
