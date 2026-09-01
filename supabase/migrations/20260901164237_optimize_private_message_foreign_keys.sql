-- Keep room + seat together at the start of each index so PostgreSQL can use
-- them both for message lookups and for the composite Citizen foreign keys.
drop index public.fc_direct_messages_recipient_idx;
drop index public.fc_direct_messages_sender_idx;

create index fc_direct_messages_recipient_idx
  on public.fc_direct_messages (room, recipient_seat, recipient_kind, created_at desc, id desc);

create index fc_direct_messages_sender_idx
  on public.fc_direct_messages (room, sender_seat, sender_kind, created_at desc, id desc);
