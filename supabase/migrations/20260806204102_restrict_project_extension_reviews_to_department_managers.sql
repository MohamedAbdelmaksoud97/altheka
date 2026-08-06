create or replace function public.review_workflow_action_extension(
  p_update_id uuid,
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
  update_row public.workflow_action_updates;
  action_row public.workflow_action_instances;
  project_id_value uuid;
begin
  if actor_id is null or not private.is_active_staff()
    or not private.has_permission('attention_notices.review') then
    raise exception 'Only department managers can review workflow extensions';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Unsupported extension decision';
  end if;

  select * into update_row
  from public.workflow_action_updates
  where id = p_update_id
  for update;

  if not found or update_row.update_type <> 'extension_request' or update_row.status <> 'pending' then
    raise exception 'The extension request is no longer pending';
  end if;

  select * into action_row
  from public.workflow_action_instances
  where id = update_row.workflow_action_instance_id
  for update;

  select workflow.project_id into project_id_value
  from public.workflow_stage_instances stage
  join public.workflow_instances workflow on workflow.id = stage.workflow_instance_id
  where stage.id = action_row.workflow_stage_instance_id;

  if project_id_value is null or not private.can_access_project(project_id_value) then
    raise exception 'The current user cannot access this task';
  end if;

  if p_decision = 'approved' then
    if update_row.requested_due_at is null then
      raise exception 'The extension request has no proposed due date';
    end if;
    if action_row.due_at is not null and update_row.requested_due_at <= action_row.due_at then
      raise exception 'The requested due date must be later than the current due date';
    end if;

    update public.workflow_action_instances
    set due_at = update_row.requested_due_at,
        updated_at = now()
    where id = action_row.id;
  elsif length(trim(coalesce(p_review_notes, ''))) < 3 then
    raise exception 'Review notes are required when rejecting an extension request';
  end if;

  update public.workflow_action_updates
  set status = p_decision,
      reviewed_by = actor_id,
      reviewed_at = now(),
      notes = coalesce(nullif(trim(p_review_notes), ''), notes)
  where id = update_row.id;

  insert into public.notifications (recipient_id, notification_type, title, body, data)
  values (
    update_row.created_by,
    case when p_decision = 'approved' then 'workflow_extension_approved' else 'workflow_extension_rejected' end,
    case when p_decision = 'approved' then 'تم اعتماد طلب التمديد' else 'تم رفض طلب التمديد' end,
    coalesce(nullif(trim(p_review_notes), ''), 'راجع تفاصيل المهمة لمعرفة القرار.'),
    jsonb_build_object(
      'project_id', project_id_value,
      'workflow_action_instance_id', action_row.id,
      'workflow_action_update_id', update_row.id,
      'category', 'operations'
    )
  );

  return update_row.id;
end;
$$;

create or replace function public.review_project_task_step_extension(
  p_extension_id uuid,
  p_decision text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  item public.project_task_step_extension_requests;
  project_id_value uuid;
begin
  if actor_id is null or not private.is_active_staff()
    or not private.has_permission('attention_notices.review') then
    raise exception 'Only department managers can review task extensions';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Unsupported extension decision';
  end if;

  select extension.* into item
  from public.project_task_step_extension_requests extension
  where extension.id = p_extension_id
    and extension.status = 'pending'
  for update;

  if not found then
    raise exception 'Extension is unavailable';
  end if;

  select thread.project_id into project_id_value
  from public.project_task_steps step
  join public.project_task_threads thread on thread.id = step.task_thread_id
  where step.id = item.task_step_id;

  if project_id_value is null or not private.can_access_project(project_id_value) then
    raise exception 'The current user cannot access this task';
  end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'Review notes are required when rejecting an extension request';
  end if;

  update public.project_task_step_extension_requests
  set status = p_decision,
      reviewed_by = actor_id,
      review_notes = nullif(trim(coalesce(p_notes, '')), ''),
      reviewed_at = now()
  where id = item.id;

  if p_decision = 'approved' then
    update public.project_task_steps
    set due_at = item.requested_due_at,
        updated_at = now()
    where id = item.task_step_id;
  end if;

  insert into public.notifications (recipient_id, notification_type, title, body, data)
  values (
    item.requested_by,
    'project_task_extension_' || p_decision,
    case when p_decision = 'approved' then 'تم اعتماد تمديد المهمة' else 'تم رفض تمديد المهمة' end,
    coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'راجع صندوق المهمة.'),
    jsonb_build_object(
      'project_id', project_id_value,
      'task_step_id', item.task_step_id,
      'category', 'operational'
    )
  );

  return item.id;
end;
$$;

revoke all on function public.review_workflow_action_extension(uuid,text,text) from public,anon;
revoke all on function public.review_project_task_step_extension(uuid,text,text) from public,anon;
grant execute on function public.review_workflow_action_extension(uuid,text,text) to authenticated;
grant execute on function public.review_project_task_step_extension(uuid,text,text) to authenticated;
