insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code = 'estates_manager'
  and permission.code in ('litigation.actions.approve', 'litigation.actions.return_for_revision')
on conflict do nothing;

create or replace function public.review_litigation_action_response(
  p_submission_id uuid,
  p_decision text,
  p_review_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  submission_row public.litigation_action_submissions;
  action_row public.litigation_case_actions;
  case_row public.litigation_cases;
  project_row public.projects;
  next_action_id uuid;
  next_assignee_id uuid;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if p_decision not in ('approved', 'returned_for_revision') then
    raise exception 'Unsupported review decision';
  end if;

  select * into submission_row from public.litigation_action_submissions
  where id = p_submission_id for update;
  if not found then raise exception 'Action submission was not found'; end if;
  select * into action_row from public.litigation_case_actions
  where id = submission_row.litigation_action_id for update;
  select * into case_row from public.litigation_cases
  where id = action_row.litigation_case_id for update;
  select * into project_row from public.projects
  where id = case_row.project_id and deleted_at is null;

  if not private.is_active_staff() or not private.can_access_project(project_row.id) then
    raise exception 'The current user cannot review this case action';
  end if;
  if p_decision = 'approved' and not private.has_permission('litigation.actions.approve') then
    raise exception 'The current user cannot approve this case action';
  end if;
  if p_decision = 'returned_for_revision'
    and not private.has_permission('litigation.actions.return_for_revision') then
    raise exception 'The current user cannot return this case action';
  end if;
  if submission_row.submitted_by = actor_id
    and not private.has_any_role(array['litigation_manager', 'estates_manager']) then
    raise exception 'Only a department manager can review their own submission';
  end if;
  if case_row.current_next_action_id is distinct from action_row.id
    or action_row.status <> 'awaiting_approval' then
    raise exception 'The submitted action is no longer awaiting approval';
  end if;
  if exists (
    select 1 from public.litigation_action_submission_reviews review
    where review.submission_id = submission_row.id
  ) then raise exception 'This submission has already been reviewed'; end if;
  if submission_row.version_number <> (
    select max(submission.version_number) from public.litigation_action_submissions submission
    where submission.litigation_action_id = action_row.id
  ) then raise exception 'Only the latest submission can be reviewed'; end if;

  if p_decision = 'returned_for_revision' then
    if length(trim(coalesce(p_review_notes, ''))) < 3 then
      raise exception 'Return notes are required';
    end if;
    insert into public.litigation_action_submission_reviews (
      submission_id, decision, review_notes, reviewed_by
    ) values (
      submission_row.id, 'returned_for_revision', trim(p_review_notes), actor_id
    );
    update public.litigation_case_actions
    set status = 'returned_for_revision', returned_at = now(), returned_by = actor_id,
        return_reason = trim(p_review_notes), updated_at = now()
    where id = action_row.id;
    insert into public.notifications (recipient_id, notification_type, title, body, data)
    values (
      action_row.assigned_to, 'litigation_action_returned', 'Action returned for revision',
      trim(p_review_notes), jsonb_build_object(
        'project_id', project_row.id,
        'litigation_action_id', action_row.id,
        'submission_id', submission_row.id
      )
    );
    return null;
  end if;

  next_assignee_id := coalesce(project_row.primary_assignee_id, action_row.assigned_to);
  if next_assignee_id is null or not exists (
    select 1 from public.project_members member
    where member.project_id = project_row.id
      and member.user_id = next_assignee_id and member.left_at is null
  ) then raise exception 'The next action requires an active project executor'; end if;
  if not private.user_has_permission(next_assignee_id, 'litigation.actions.respond') then
    raise exception 'The next action executor lacks response permission';
  end if;

  insert into public.litigation_action_submission_reviews (
    submission_id, decision, review_notes, reviewed_by
  ) values (
    submission_row.id, 'approved', nullif(trim(p_review_notes), ''), actor_id
  );
  update public.litigation_case_actions
  set status = 'completed', completed_at = now(), approved_at = now(),
      approved_by = actor_id, updated_at = now()
  where id = action_row.id;
  insert into public.litigation_case_actions (
    litigation_case_id, title, action_type, due_at, legal_due_date, status,
    priority, assigned_to, source_event, created_by
  ) values (
    case_row.id, submission_row.proposed_next_action_title, 'follow_up',
    submission_row.proposed_next_action_due_at,
    submission_row.proposed_next_action_legal_due_date, 'planned',
    submission_row.proposed_next_action_priority, next_assignee_id,
    'approved_action_response', actor_id
  ) returning id into next_action_id;
  update public.litigation_cases
  set current_next_action_id = next_action_id, status = 'active', updated_at = now()
  where id = case_row.id;
  insert into public.notifications (recipient_id, notification_type, title, body, data)
  values (
    next_assignee_id, 'litigation_action_assigned', 'New assigned action',
    submission_row.proposed_next_action_title, jsonb_build_object(
      'project_id', project_row.id,
      'litigation_action_id', next_action_id,
      'previous_action_id', action_row.id
    )
  );
  return next_action_id;
end;
$$;

revoke all on function public.review_litigation_action_response(uuid, text, text)
from public, anon;
grant execute on function public.review_litigation_action_response(uuid, text, text)
to authenticated;
