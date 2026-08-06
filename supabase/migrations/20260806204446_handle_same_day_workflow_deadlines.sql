create or replace function private.workflow_action_due_at(
  p_action_instance_id uuid,
  p_started_at timestamptz
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  organization_id_value uuid;
  duration_value interval;
  basis_value text;
  day_count integer;
begin
  select project.organization_id, action_instance.planned_duration, action_template.duration_basis
  into organization_id_value, duration_value, basis_value
  from public.workflow_action_instances action_instance
  join public.workflow_action_templates action_template on action_template.id = action_instance.action_template_id
  join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow on workflow.id = stage_instance.workflow_instance_id
  join public.projects project on project.id = workflow.project_id
  where action_instance.id = p_action_instance_id;

  if duration_value is null then
    return null;
  end if;

  -- A zero duration in the litigation map means "during the same Saudi day".
  if duration_value = interval '0 seconds' then
    return (
      date_trunc('day', p_started_at at time zone 'Asia/Riyadh')
      + interval '1 day'
      - interval '1 second'
    ) at time zone 'Asia/Riyadh';
  end if;

  if basis_value = 'business_days' then
    day_count := greatest(0, ceil(extract(epoch from duration_value) / 86400.0)::integer);
    return private.add_business_days(organization_id_value, p_started_at, day_count);
  end if;

  return p_started_at + duration_value;
end;
$$;

revoke all on function private.workflow_action_due_at(uuid,timestamptz) from public,anon,authenticated;
