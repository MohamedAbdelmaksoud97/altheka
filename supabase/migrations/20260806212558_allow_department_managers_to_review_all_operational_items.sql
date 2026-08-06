create or replace function private.enforce_workflow_action_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  is_executor boolean;
  organization_id_value uuid;
begin
  if new.status = 'ready' and new.started_at is null then
    new.due_at := null;
  end if;

  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    select exists(
      select 1
      from public.workflow_action_participants participant
      where participant.workflow_action_instance_id = new.id
        and participant.user_id = actor_id
        and participant.unassigned_at is null
        and participant.participant_type in ('executor', 'responsible')
    ) into is_executor;
    if actor_id is not null and not is_executor then
      raise exception 'Only the assigned executor can start this workflow step';
    end if;
    new.started_at := coalesce(new.started_at, now());
    new.due_at := private.workflow_action_due_at(new.id, new.started_at);
  end if;

  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    select exists(
      select 1
      from public.workflow_action_participants participant
      where participant.workflow_action_instance_id = new.id
        and participant.user_id = actor_id
        and participant.unassigned_at is null
        and participant.participant_type in ('executor', 'responsible')
    ) into is_executor;
    if actor_id is not null and not is_executor then
      raise exception 'Only the assigned executor can submit this workflow step';
    end if;
    if new.requires_attachment and not exists(
      select 1
      from public.documents document
      where document.workflow_action_instance_id = new.id
        and document.deleted_at is null
        and document.archived_at is null
    ) then
      raise exception 'This workflow step requires an attachment before submission';
    end if;
  end if;

  if new.status = 'awaiting_approval' and old.status is distinct from 'awaiting_approval' then
    select project.organization_id into organization_id_value
    from public.workflow_stage_instances stage_instance
    join public.workflow_instances workflow_instance
      on workflow_instance.id = stage_instance.workflow_instance_id
    join public.projects project on project.id = workflow_instance.project_id
    where stage_instance.id = new.workflow_stage_instance_id;

    new.approval_started_at := now();
    new.approval_due_at := private.add_business_days(
      organization_id_value,
      new.approval_started_at,
      new.approval_target_business_days
    );
    new.approval_reviewed_at := null;
  end if;

  if new.status in ('approved', 'returned_for_revision')
    and old.status is distinct from new.status then
    if actor_id is not null
      and not private.has_any_role(array['litigation_manager', 'estates_manager']) then
      raise exception 'Only a department manager can review this workflow step';
    end if;
    if new.status = 'returned_for_revision'
      and length(trim(coalesce(new.return_reason, ''))) < 5 then
      raise exception 'Return reason is required';
    end if;
    new.approval_reviewed_at := now();
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_workflow_action_controls() from public, anon, authenticated;
