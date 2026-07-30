begin;

do $$
declare
  project_id_value uuid := '6f49d178-b6ef-472e-af67-ec5b26fe2138';
  workflow_id_value uuid := 'c73b6fcb-94ec-4716-96ef-a2c683a15556';
  actor_id_value uuid;
  first_instance_stage_id uuid;
  appeal_stage_id uuid;
  closing_stage_id uuid;
begin
  select project.project_manager_id into strict actor_id_value
  from public.projects project
  where project.id = project_id_value;

  select stage_instance.id into strict first_instance_stage_id
  from public.workflow_stage_instances stage_instance
  join public.workflow_stage_templates stage_template
    on stage_template.id = stage_instance.stage_template_id
  where stage_instance.workflow_instance_id = workflow_id_value
    and stage_template.code = 'first_instance';

  update public.workflow_stage_instances stage_instance
  set
    status = case
      when stage_instance.id = first_instance_stage_id then 'active'
      else 'pending'
    end,
    completed_at = case
      when stage_instance.id = first_instance_stage_id then null
      else completed_at
    end
  from public.workflow_stage_templates stage_template
  where stage_template.id = stage_instance.stage_template_id
    and stage_instance.workflow_instance_id = workflow_id_value
    and stage_template.code in (
      'first_instance',
      'appeal',
      'enforcement',
      'closing_collection'
    );

  update public.workflow_action_instances action_instance
  set status = 'completed', completed_at = now()
  where action_instance.workflow_stage_instance_id = first_instance_stage_id;

  perform private.refresh_project_workflow_progress(workflow_id_value);

  if exists (
    select 1
    from public.workflow_stage_instances stage_instance
    where stage_instance.workflow_instance_id = workflow_id_value
      and stage_instance.status in ('active', 'overdue')
  ) then
    raise exception 'The workflow did not pause for a litigation path decision';
  end if;

  if not exists (
    select 1
    from public.projects project
    where project.id = project_id_value
      and project.client_stage_label = 'بانتظار تحديد المسار التالي'
  ) then
    raise exception 'The project does not show the path-decision state';
  end if;

  perform set_config('request.jwt.claim.sub', actor_id_value::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  appeal_stage_id := public.activate_litigation_workflow_stage(
    project_id_value,
    'appeal',
    'ورد الحكم الابتدائي وقرر المكتب البدء في مسار الاستئناف'
  );

  if not exists (
    select 1
    from public.workflow_stage_instances stage_instance
    where stage_instance.id = appeal_stage_id
      and stage_instance.status = 'active'
  ) then
    raise exception 'Appeal was not activated';
  end if;

  if not exists (
    select 1
    from public.workflow_action_instances action_instance
    where action_instance.workflow_stage_instance_id = appeal_stage_id
      and action_instance.status in ('ready', 'blocked', 'awaiting_assignment')
  ) then
    raise exception 'Appeal actions were not made operational';
  end if;

  if not exists (
    select 1
    from public.workflow_transition_events transition_event
    where transition_event.workflow_instance_id = workflow_id_value
      and transition_event.stage_instance_id = appeal_stage_id
      and transition_event.transition_type = 'transition'
      and transition_event.actor_id = actor_id_value
  ) then
    raise exception 'Appeal activation was not audited';
  end if;

  select stage_instance.id into strict closing_stage_id
  from public.workflow_stage_instances stage_instance
  join public.workflow_stage_templates stage_template
    on stage_template.id = stage_instance.stage_template_id
  where stage_instance.workflow_instance_id = workflow_id_value
    and stage_template.code = 'closing_collection';

  update public.workflow_stage_instances stage_instance
  set
    status = case
      when stage_instance.id = closing_stage_id then 'active'
      else 'pending'
    end,
    completed_at = null
  from public.workflow_stage_templates stage_template
  where stage_template.id = stage_instance.stage_template_id
    and stage_instance.workflow_instance_id = workflow_id_value
    and stage_template.code in ('appeal', 'enforcement', 'closing_collection');

  update public.workflow_action_instances action_instance
  set status = 'completed', completed_at = now()
  where action_instance.workflow_stage_instance_id = closing_stage_id;

  perform private.refresh_project_workflow_progress(workflow_id_value);

  if not exists (
    select 1
    from public.workflow_instances workflow_instance
    where workflow_instance.id = workflow_id_value
      and workflow_instance.status = 'completed'
  ) then
    raise exception 'Completing closing and collection did not complete the workflow';
  end if;

  if exists (
    select 1
    from public.workflow_stage_instances stage_instance
    join public.workflow_stage_templates stage_template
      on stage_template.id = stage_instance.stage_template_id
    where stage_instance.workflow_instance_id = workflow_id_value
      and stage_template.is_optional
      and stage_instance.status <> 'skipped'
  ) then
    raise exception 'Unused optional litigation stages were not skipped at closure';
  end if;
end;
$$;

rollback;
