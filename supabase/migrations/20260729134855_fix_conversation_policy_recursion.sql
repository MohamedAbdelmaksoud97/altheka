create or replace function private.is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants participant
    where participant.conversation_id = p_conversation_id
      and participant.user_id = coalesce(p_user_id, (select auth.uid()))
      and participant.left_at is null
  );
$$;

revoke all on function private.is_conversation_participant(uuid, uuid)
from public, anon;
grant execute on function private.is_conversation_participant(uuid, uuid)
to authenticated;

drop policy if exists conversations_participant_select on public.conversations;
create policy conversations_participant_select on public.conversations
for select to authenticated
using ((select private.is_conversation_participant(id, null)));

drop policy if exists conversation_participants_member_select
  on public.conversation_participants;
create policy conversation_participants_member_select
on public.conversation_participants
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_conversation_participant(conversation_id, null))
);

drop policy if exists messages_participant_select on public.messages;
create policy messages_participant_select on public.messages
for select to authenticated
using (
  deleted_at is null
  and (select private.is_conversation_participant(conversation_id, null))
);

drop policy if exists messages_participant_insert on public.messages;
create policy messages_participant_insert on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and (select private.is_conversation_participant(conversation_id, null))
);
