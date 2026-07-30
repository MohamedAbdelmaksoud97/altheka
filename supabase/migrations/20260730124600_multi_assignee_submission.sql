create or replace function public.submit_litigation_action_response_v2(
  p_action_id uuid,
  p_result_summary text,
  p_next_action_title text,
  p_execution_notes text default null,
  p_next_action_due_at timestamptz default null,
  p_next_action_legal_due_date date default null,
  p_next_action_priority text default 'high',
  p_document_title text default null,
  p_document_type text default null,
  p_storage_bucket text default null,
  p_storage_path text default null,
  p_file_name text default null,
  p_mime_type text default null,
  p_byte_size bigint default null,
  p_sha256 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  action_row public.litigation_case_actions;
  project_id_value uuid;
begin
  select action.*
  into action_row
  from public.litigation_case_actions action
  where action.id = p_action_id
  for update;
  if not found then raise exception 'Case action was not found'; end if;

  select litigation_case.project_id
  into project_id_value
  from public.litigation_cases litigation_case
  where litigation_case.id = action_row.litigation_case_id;

  if not private.is_active_staff()
    or not private.has_permission('litigation.actions.respond')
    or not private.can_access_project(project_id_value)
    or not exists (
      select 1
      from public.litigation_case_action_assignees assignee
      where assignee.litigation_action_id = action_row.id
        and assignee.user_id = actor_id
        and assignee.ended_at is null
    )
  then raise exception 'The current user is not an active assignee of this action'; end if;

  if action_row.status not in ('in_progress', 'returned_for_revision') then
    raise exception 'Start the case action before submitting its result';
  end if;

  update public.litigation_case_action_assignees
  set is_lead = user_id = actor_id
  where litigation_action_id = action_row.id
    and ended_at is null;

  update public.litigation_case_actions
  set assigned_to = actor_id,
      updated_at = now()
  where id = action_row.id;

  return public.submit_litigation_action_response(
    p_action_id,
    p_result_summary,
    p_next_action_title,
    p_execution_notes,
    p_next_action_due_at,
    p_next_action_legal_due_date,
    p_next_action_priority,
    p_document_title,
    p_document_type,
    p_storage_bucket,
    p_storage_path,
    p_file_name,
    p_mime_type,
    p_byte_size,
    p_sha256
  );
end;
$$;

revoke all on function public.submit_litigation_action_response_v2(
  uuid, text, text, text, timestamptz, date, text,
  text, text, text, text, text, text, bigint, text
) from public, anon;
grant execute on function public.submit_litigation_action_response_v2(
  uuid, text, text, text, timestamptz, date, text,
  text, text, text, text, text, text, bigint, text
) to authenticated;
