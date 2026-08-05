drop policy if exists conversations_participant_select on public.conversations;
create policy conversations_participant_select
on public.conversations
for select
to authenticated
using (
  (select private.is_conversation_participant(id, null))
  or (
    conversation_type = 'internal'
    and project_id is not null
    and (select private.has_permission('messages.read_internal'))
    and (select private.can_supervise_project(project_id, (select auth.uid())))
  )
);

drop policy if exists conversation_participants_member_select
  on public.conversation_participants;
create policy conversation_participants_member_select
on public.conversation_participants
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_conversation_participant(conversation_id, null))
);

drop policy if exists messages_participant_select on public.messages;
create policy messages_participant_select
on public.messages
for select
to authenticated
using (
  deleted_at is null
  and (
    (select private.is_conversation_participant(conversation_id, null))
    or exists (
      select 1
      from public.conversations conversation
      where conversation.id = messages.conversation_id
        and conversation.conversation_type = 'internal'
        and conversation.project_id is not null
        and (select private.has_permission('messages.read_internal'))
        and (
          select private.can_supervise_project(
            conversation.project_id,
            (select auth.uid())
          )
        )
    )
  )
);

drop policy if exists messages_participant_insert on public.messages;
create policy messages_participant_insert
on public.messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and (select private.is_conversation_participant(conversation_id, null))
);
