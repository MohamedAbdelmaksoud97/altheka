-- Review workflow task extension requests without introducing a parallel task system.

insert into public.permissions (code, description)
values ('tasks.review_extensions', 'Review and decide workflow task extension requests')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'tasks.review_extensions'
where role.code in (
  'super_admin',
  'executive_manager',
  'litigation_manager',
  'estates_manager'
)
on conflict do nothing;

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
  workflow_row public.workflow_instances;
  project_id_value uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Unsupported extension decision';
  end if;
  if not private.is_active_staff() or not private.has_permission('tasks.review_extensions') then
    raise exception 'The current user cannot review task extensions';
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
  select workflow.* into workflow_row
  from public.workflow_stage_instances stage
  join public.workflow_instances workflow on workflow.id = stage.workflow_instance_id
  where stage.id = action_row.workflow_stage_instance_id;
  project_id_value := workflow_row.project_id;

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

revoke all on function public.review_workflow_action_extension(uuid, text, text) from public, anon;
grant execute on function public.review_workflow_action_extension(uuid, text, text) to authenticated;
