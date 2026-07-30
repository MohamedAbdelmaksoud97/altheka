-- Explicit routing for the conditional litigation stages.
-- The engine pauses after first instance, appeal and enforcement until an
-- authorized project owner selects the next legal path.

create or replace function private.refresh_project_workflow_progress(
  p_workflow_instance_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  workflow_row public.workflow_instances;
  active_stage record;
  next_stage record;
  is_litigation_workflow boolean;
begin
  select * into workflow_row
  from public.workflow_instances
  where id = p_workflow_instance_id
  for update;

  if not found or workflow_row.project_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.workflow_template_versions version
    join public.workflow_templates template
      on template.id = version.workflow_template_id
    where version.id = workflow_row.workflow_template_version_id
      and template.slug = 'litigation-v2'
  ) into is_litigation_workflow;

  select
    stage_instance.id,
    stage_template.position,
    stage_template.code,
    stage_template.name
  into active_stage
  from public.workflow_stage_instances stage_instance
  join public.workflow_stage_templates stage_template
    on stage_template.id = stage_instance.stage_template_id
  where stage_instance.workflow_instance_id = workflow_row.id
    and stage_instance.status in ('active', 'overdue')
  order by stage_template.position
  limit 1;

  if not found then
    return;
  end if;

  update public.workflow_action_instances action_instance
  set
    status = 'ready',
    due_at = case
      when action_instance.planned_duration is null then null
      else now() + action_instance.planned_duration
    end,
    updated_at = now()
  where action_instance.workflow_stage_instance_id = active_stage.id
    and action_instance.status = 'blocked'
    and exists (
      select 1
      from public.workflow_action_participants participant
      where participant.workflow_action_instance_id = action_instance.id
        and participant.participant_type = 'executor'
        and participant.unassigned_at is null
    )
    and not exists (
      select 1
      from public.workflow_action_dependencies dependency
      join public.workflow_action_instances prerequisite
        on prerequisite.action_template_id = dependency.depends_on_action_template_id
       and prerequisite.workflow_stage_instance_id = active_stage.id
      where dependency.action_template_id = action_instance.action_template_id
        and prerequisite.status not in ('approved', 'completed', 'cancelled')
    );

  if exists (
    select 1
    from public.workflow_action_instances action_instance
    join public.workflow_action_templates action_template
      on action_template.id = action_instance.action_template_id
    where action_instance.workflow_stage_instance_id = active_stage.id
      and action_template.is_required
      and action_instance.status not in ('approved', 'completed', 'cancelled')
  ) then
    update public.projects
    set client_stage_label = active_stage.name, updated_at = now()
    where id = workflow_row.project_id;
    return;
  end if;

  update public.workflow_stage_instances
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = active_stage.id;

  if is_litigation_workflow
    and active_stage.code in ('first_instance', 'appeal', 'enforcement')
  then
    update public.projects
    set
      client_stage_label = 'بانتظار تحديد المسار التالي',
      updated_at = now()
    where id = workflow_row.project_id;
    return;
  end if;

  select
    stage_instance.id,
    stage_template.name,
    stage_template.target_duration,
    stage_template.maximum_duration
  into next_stage
  from public.workflow_stage_instances stage_instance
  join public.workflow_stage_templates stage_template
    on stage_template.id = stage_instance.stage_template_id
  where stage_instance.workflow_instance_id = workflow_row.id
    and stage_instance.status = 'pending'
    and stage_template.position > active_stage.position
    and not stage_template.is_optional
  order by stage_template.position
  limit 1;

  if found then
    update public.workflow_stage_instances
    set
      status = 'active',
      started_at = now(),
      target_due_at = case
        when next_stage.target_duration is null then null
        else now() + next_stage.target_duration
      end,
      maximum_due_at = case
        when next_stage.maximum_duration is null then null
        else now() + next_stage.maximum_duration
      end,
      updated_at = now()
    where id = next_stage.id;

    update public.projects
    set client_stage_label = next_stage.name, updated_at = now()
    where id = workflow_row.project_id;

    update public.workflow_action_instances action_instance
    set
      status = case
        when exists (
          select 1
          from public.workflow_action_dependencies dependency
          where dependency.action_template_id = action_instance.action_template_id
        ) then 'blocked'
        when exists (
          select 1
          from public.workflow_action_participants participant
          where participant.workflow_action_instance_id = action_instance.id
            and participant.participant_type = 'executor'
            and participant.unassigned_at is null
        ) then 'ready'
        else 'awaiting_assignment'
      end,
      due_at = case
        when action_instance.planned_duration is null then null
        else now() + action_instance.planned_duration
      end,
      updated_at = now()
    where action_instance.workflow_stage_instance_id = next_stage.id;
  else
    if is_litigation_workflow and active_stage.code = 'closing_collection' then
      update public.workflow_action_instances action_instance
      set
        status = 'cancelled',
        completed_at = coalesce(action_instance.completed_at, now()),
        updated_at = now()
      from public.workflow_stage_instances stage_instance
      join public.workflow_stage_templates stage_template
        on stage_template.id = stage_instance.stage_template_id
      where action_instance.workflow_stage_instance_id = stage_instance.id
        and stage_instance.workflow_instance_id = workflow_row.id
        and stage_instance.status = 'pending'
        and stage_template.is_optional
        and action_instance.status not in ('approved', 'completed', 'cancelled');

      update public.workflow_stage_instances stage_instance
      set
        status = 'skipped',
        completed_at = now(),
        exception_reason = 'لم يتطلب مسار القضية تشغيل المرحلة الاختيارية قبل الإقفال',
        updated_at = now()
      from public.workflow_stage_templates stage_template
      where stage_template.id = stage_instance.stage_template_id
        and stage_instance.workflow_instance_id = workflow_row.id
        and stage_instance.status = 'pending'
        and stage_template.is_optional;
    end if;

    update public.workflow_instances
    set status = 'completed', completed_at = now(), updated_at = now()
    where id = workflow_row.id;
  end if;
end;
$$;

revoke all on function private.refresh_project_workflow_progress(uuid)
from public, anon, authenticated;

create or replace function public.activate_litigation_workflow_stage(
  p_project_id uuid,
  p_stage_code text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  actor_profile public.profiles;
  workflow_row public.workflow_instances;
  target_stage record;
  active_stage record;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if p_stage_code not in ('appeal', 'enforcement', 'closing_collection') then
    raise exception 'Unsupported litigation stage';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A documented routing reason is required';
  end if;

  select * into actor_profile
  from public.profiles
  where id = actor_id
    and activation_status = 'active_staff'
    and is_active
    and deleted_at is null;
  if not found then raise exception 'An active staff account is required'; end if;

  select * into project_row
  from public.projects
  where id = p_project_id
    and project_type in ('litigation', 'estate_litigation')
    and status in ('active', 'on_hold')
    and deleted_at is null
  for update;
  if not found then raise exception 'Litigation project was not found'; end if;

  if not private.can_access_project(project_row.id) or not (
    private.has_permission('system.override')
    or project_row.project_manager_id = actor_id
    or (
      actor_profile.department_id = project_row.department_id
      and private.has_permission('workflow.override_transition')
    )
  ) then
    raise exception 'The current user cannot select the litigation path';
  end if;

  select workflow_instance.* into workflow_row
  from public.workflow_instances workflow_instance
  join public.workflow_template_versions version
    on version.id = workflow_instance.workflow_template_version_id
  join public.workflow_templates template
    on template.id = version.workflow_template_id
  where workflow_instance.project_id = project_row.id
    and workflow_instance.status = 'active'
    and template.slug = 'litigation-v2'
  order by workflow_instance.created_at desc
  limit 1
  for update of workflow_instance;
  if not found then raise exception 'An active litigation workflow was not found'; end if;

  if not exists (
    select 1
    from public.workflow_stage_instances stage_instance
    join public.workflow_stage_templates stage_template
      on stage_template.id = stage_instance.stage_template_id
    where stage_instance.workflow_instance_id = workflow_row.id
      and stage_template.code = 'first_instance'
      and stage_instance.status = 'completed'
  ) then
    raise exception 'First-instance litigation must be completed before routing';
  end if;

  select
    stage_instance.id,
    stage_instance.status,
    stage_template.code,
    stage_template.name,
    stage_template.target_duration,
    stage_template.maximum_duration
  into target_stage
  from public.workflow_stage_instances stage_instance
  join public.workflow_stage_templates stage_template
    on stage_template.id = stage_instance.stage_template_id
  where stage_instance.workflow_instance_id = workflow_row.id
    and stage_template.code = p_stage_code
  for update of stage_instance;
  if not found then raise exception 'The selected stage was not found'; end if;
  if target_stage.status = 'active' then return target_stage.id; end if;
  if target_stage.status <> 'pending' then
    raise exception 'The selected stage cannot be activated from its current status';
  end if;

  select
    stage_instance.id,
    stage_template.code,
    stage_template.name
  into active_stage
  from public.workflow_stage_instances stage_instance
  join public.workflow_stage_templates stage_template
    on stage_template.id = stage_instance.stage_template_id
  where stage_instance.workflow_instance_id = workflow_row.id
    and stage_instance.status in ('active', 'overdue')
  order by stage_template.position
  limit 1
  for update of stage_instance;

  if found and active_stage.id <> target_stage.id then
    if active_stage.code <> 'closing_collection' then
      raise exception 'Complete the current stage before selecting another path';
    end if;
    if exists (
      select 1
      from public.workflow_action_instances action_instance
      where action_instance.workflow_stage_instance_id = active_stage.id
        and action_instance.status in (
          'in_progress',
          'submitted',
          'awaiting_approval',
          'returned',
          'returned_for_revision'
        )
    ) then
      raise exception 'Finish or return the active closing tasks before changing the path';
    end if;

    update public.workflow_action_instances
    set
      status = 'blocked',
      due_at = null,
      updated_at = now()
    where workflow_stage_instance_id = active_stage.id
      and status in ('ready', 'awaiting_assignment', 'blocked');

    update public.workflow_stage_instances
    set
      status = 'pending',
      target_due_at = null,
      maximum_due_at = null,
      started_at = null,
      completed_at = null,
      exception_reason = trim(p_reason),
      exception_approved_by = actor_id,
      updated_at = now()
    where id = active_stage.id;
  end if;

  update public.workflow_stage_instances
  set
    status = 'active',
    started_at = now(),
    completed_at = null,
    target_due_at = case
      when target_stage.target_duration is null then null
      else now() + target_stage.target_duration
    end,
    maximum_due_at = case
      when target_stage.maximum_duration is null then null
      else now() + target_stage.maximum_duration
    end,
    exception_reason = trim(p_reason),
    exception_approved_by = actor_id,
    updated_at = now()
  where id = target_stage.id;

  update public.workflow_action_instances action_instance
  set
    status = case
      when action_instance.status in ('approved', 'completed', 'cancelled')
        then action_instance.status
      when exists (
        select 1
        from public.workflow_action_dependencies dependency
        join public.workflow_action_instances prerequisite
          on prerequisite.action_template_id = dependency.depends_on_action_template_id
         and prerequisite.workflow_stage_instance_id = target_stage.id
        where dependency.action_template_id = action_instance.action_template_id
          and prerequisite.status not in ('approved', 'completed', 'cancelled')
      ) then 'blocked'
      when exists (
        select 1
        from public.workflow_action_participants participant
        where participant.workflow_action_instance_id = action_instance.id
          and participant.participant_type = 'executor'
          and participant.unassigned_at is null
      ) then 'ready'
      else 'awaiting_assignment'
    end,
    due_at = case
      when action_instance.status in ('approved', 'completed', 'cancelled') then due_at
      when action_instance.planned_duration is null then null
      else now() + action_instance.planned_duration
    end,
    updated_at = now()
  where action_instance.workflow_stage_instance_id = target_stage.id;

  update public.projects
  set client_stage_label = target_stage.name, updated_at = now()
  where id = project_row.id;

  if p_stage_code in ('appeal', 'enforcement') then
    update public.litigation_cases
    set case_level = p_stage_code, updated_at = now()
    where project_id = project_row.id;
  end if;

  insert into public.workflow_transition_events (
    workflow_instance_id,
    stage_instance_id,
    transition_type,
    previous_status,
    new_status,
    reason,
    impact,
    actor_id
  )
  values (
    workflow_row.id,
    target_stage.id,
    'transition',
    target_stage.status,
    'active',
    trim(p_reason),
    jsonb_build_object(
      'selected_stage', p_stage_code,
      'previous_active_stage', active_stage.code,
      'project_id', project_row.id
    ),
    actor_id
  );

  insert into public.notifications (
    recipient_id,
    notification_type,
    title,
    body,
    data
  )
  select distinct recipient_id,
    'litigation_stage_activated',
    'تم تشغيل مرحلة ' || target_stage.name,
    trim(p_reason),
    jsonb_build_object(
      'project_id', project_row.id,
      'workflow_id', workflow_row.id,
      'stage_id', target_stage.id,
      'stage_code', p_stage_code
    )
  from (
    values
      (project_row.project_manager_id),
      (project_row.primary_assignee_id)
  ) recipients(recipient_id)
  where recipient_id is not null and recipient_id <> actor_id;

  return target_stage.id;
end;
$$;

revoke all on function public.activate_litigation_workflow_stage(uuid, text, text)
from public, anon;
grant execute on function public.activate_litigation_workflow_stage(uuid, text, text)
to authenticated;
