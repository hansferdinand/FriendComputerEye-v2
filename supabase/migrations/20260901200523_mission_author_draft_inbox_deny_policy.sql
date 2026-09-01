-- Make the direct-access denial explicit. Authorized reads and writes continue
-- to use the narrowly granted, GM-key-gated RPC functions.
create policy "deny all direct mission draft access"
  on public.fc_mission_author_drafts
  as restrictive
  for all
  to public
  using (false)
  with check (false);
