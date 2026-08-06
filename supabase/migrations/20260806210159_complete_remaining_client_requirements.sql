alter table public.workflow_action_instances
  add column if not exists approval_target_business_days integer not null default 1
    check (approval_target_business_days between 1 and 30),
  add column if not exists approval_started_at timestamptz,
  add column if not exists approval_due_at timestamptz,
  add column if not exists approval_reviewed_at timestamptz;

create index if not exists workflow_actions_approval_due_idx
  on public.workflow_action_instances (approval_due_at, id)
  where status = 'awaiting_approval';

update public.workflow_action_instances action_instance
set approval_started_at = coalesce(action_instance.approval_started_at, action_instance.submitted_at, action_instance.updated_at),
    approval_due_at = coalesce(
      action_instance.approval_due_at,
      private.add_business_days(
        project.organization_id,
        coalesce(action_instance.submitted_at, action_instance.updated_at),
        action_instance.approval_target_business_days
      )
    )
from public.workflow_stage_instances stage_instance
join public.workflow_instances workflow_instance
  on workflow_instance.id = stage_instance.workflow_instance_id
join public.projects project on project.id = workflow_instance.project_id
where action_instance.workflow_stage_instance_id = stage_instance.id
  and action_instance.status = 'awaiting_approval';

create or replace function private.enforce_workflow_action_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  is_executor boolean;
  is_approver boolean;
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
    select exists(
      select 1
      from public.workflow_action_participants participant
      where participant.workflow_action_instance_id = new.id
        and participant.user_id = actor_id
        and participant.unassigned_at is null
        and participant.participant_type = 'approver'
    ) into is_approver;
    if actor_id is not null and (
      not is_approver
      or not private.has_any_role(array['litigation_manager', 'estates_manager'])
    ) then
      raise exception 'Only the assigned department manager can review this workflow step';
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

create or replace function public.generate_due_soon_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  batch_count integer := 0;
begin
  insert into public.notifications (recipient_id, notification_type, title, body, data)
  select participant.user_id,
    case when project.project_type in ('estate', 'estate_asset', 'estate_litigation')
      then 'estate_workflow_task_due_soon'
      else 'litigation_workflow_task_due_soon'
    end,
    'موعد المهمة يقترب',
    'تنتهي مهمة «' || action_template.name || '» خلال أقل من 24 ساعة.',
    jsonb_build_object(
      'project_id', project.id,
      'workflow_action_instance_id', action_instance.id,
      'due_at', action_instance.due_at,
      'category', case when project.project_type in ('estate', 'estate_asset', 'estate_litigation') then 'estates' else 'litigation' end,
      'reminder_key', 'workflow:' || action_instance.id::text || ':' || action_instance.due_at::text
    )
  from public.workflow_action_instances action_instance
  join public.workflow_action_templates action_template on action_template.id = action_instance.action_template_id
  join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow_instance on workflow_instance.id = stage_instance.workflow_instance_id
  join public.projects project on project.id = workflow_instance.project_id
  join public.workflow_action_participants participant
    on participant.workflow_action_instance_id = action_instance.id
   and participant.participant_type in ('executor', 'responsible')
   and participant.unassigned_at is null
  where action_instance.status in ('in_progress', 'returned_for_revision')
    and action_instance.due_at > now()
    and action_instance.due_at <= now() + interval '24 hours'
    and project.health_status <> 'yellow'
    and not exists (
      select 1 from public.notifications notification
      where notification.recipient_id = participant.user_id
        and notification.data ->> 'reminder_key' = 'workflow:' || action_instance.id::text || ':' || action_instance.due_at::text
    );
  get diagnostics inserted_count = row_count;

  insert into public.notifications (recipient_id, notification_type, title, body, data)
  select participant.user_id,
    case when project.project_type in ('estate', 'estate_asset', 'estate_litigation')
      then 'estate_approval_due_soon'
      else 'litigation_approval_due_soon'
    end,
    'مهلة الاعتماد تقترب',
    'تنتهي مهلة اعتماد «' || action_template.name || '» خلال أقل من 24 ساعة.',
    jsonb_build_object(
      'project_id', project.id,
      'workflow_action_instance_id', action_instance.id,
      'approval_due_at', action_instance.approval_due_at,
      'category', case when project.project_type in ('estate', 'estate_asset', 'estate_litigation') then 'estates' else 'litigation' end,
      'reminder_key', 'approval:' || action_instance.id::text || ':' || action_instance.approval_due_at::text
    )
  from public.workflow_action_instances action_instance
  join public.workflow_action_templates action_template on action_template.id = action_instance.action_template_id
  join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow_instance on workflow_instance.id = stage_instance.workflow_instance_id
  join public.projects project on project.id = workflow_instance.project_id
  join public.workflow_action_participants participant
    on participant.workflow_action_instance_id = action_instance.id
   and participant.participant_type = 'approver'
   and participant.unassigned_at is null
  where action_instance.status = 'awaiting_approval'
    and action_instance.approval_due_at > now()
    and action_instance.approval_due_at <= now() + interval '24 hours'
    and project.health_status <> 'yellow'
    and not exists (
      select 1 from public.notifications notification
      where notification.recipient_id = participant.user_id
        and notification.data ->> 'reminder_key' = 'approval:' || action_instance.id::text || ':' || action_instance.approval_due_at::text
    );
  get diagnostics batch_count = row_count;
  inserted_count := inserted_count + batch_count;

  insert into public.notifications (recipient_id, notification_type, title, body, data)
  select step.assigned_to,
    case when project.project_type in ('estate', 'estate_asset', 'estate_litigation')
      then 'estate_task_due_soon'
      else 'litigation_task_due_soon'
    end,
    'موعد المهمة يقترب',
    'تنتهي مهمة «' || step.title || '» خلال أقل من 24 ساعة.',
    jsonb_build_object(
      'project_id', project.id,
      'task_step_id', step.id,
      'due_at', step.due_at,
      'category', case when project.project_type in ('estate', 'estate_asset', 'estate_litigation') then 'estates' else 'litigation' end,
      'reminder_key', 'thread-step:' || step.id::text || ':' || step.due_at::text
    )
  from public.project_task_steps step
  join public.project_task_threads thread on thread.id = step.task_thread_id
  join public.projects project on project.id = thread.project_id
  where step.status in ('open', 'returned')
    and step.due_at > now()
    and step.due_at <= now() + interval '24 hours'
    and project.health_status <> 'yellow'
    and not exists (
      select 1 from public.notifications notification
      where notification.recipient_id = step.assigned_to
        and notification.data ->> 'reminder_key' = 'thread-step:' || step.id::text || ':' || step.due_at::text
    );
  get diagnostics batch_count = row_count;
  inserted_count := inserted_count + batch_count;

  insert into public.notifications (recipient_id, notification_type, title, body, data)
  select assignee.user_id,
    'litigation_task_due_soon',
    'موعد المهمة القانونية يقترب',
    'تنتهي مهمة «' || action.title || '» خلال أقل من 24 ساعة.',
    jsonb_build_object(
      'project_id', project.id,
      'litigation_action_id', action.id,
      'due_at', coalesce(action.due_at, action.legal_due_date),
      'category', 'litigation',
      'reminder_key', 'litigation:' || action.id::text || ':' || coalesce(action.due_at, action.legal_due_date)::text
    )
  from public.litigation_case_actions action
  join public.litigation_cases litigation_case on litigation_case.id = action.litigation_case_id
  join public.projects project on project.id = litigation_case.project_id
  join public.litigation_case_action_assignees assignee
    on assignee.litigation_action_id = action.id
   and assignee.ended_at is null
  where action.status in ('planned', 'in_progress', 'returned_for_revision')
    and coalesce(action.due_at, action.legal_due_date) > now()
    and coalesce(action.due_at, action.legal_due_date) <= now() + interval '24 hours'
    and project.health_status <> 'yellow'
    and not exists (
      select 1 from public.notifications notification
      where notification.recipient_id = assignee.user_id
        and notification.data ->> 'reminder_key' = 'litigation:' || action.id::text || ':' || coalesce(action.due_at, action.legal_due_date)::text
    );
  get diagnostics batch_count = row_count;
  inserted_count := inserted_count + batch_count;

  return inserted_count;
end;
$$;

revoke all on function public.generate_due_soon_notifications() from public, anon, authenticated;
grant execute on function public.generate_due_soon_notifications() to service_role;

create or replace function public.generate_overdue_attention_notices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  batch_count integer := 0;
begin
  insert into public.project_attention_notices (
    organization_id, project_id, workflow_action_instance_id,
    target_user_id, issued_by, reason, status
  )
  select project.organization_id, project.id, action_instance.id,
    participant.user_id,
    coalesce(project.project_manager_id, participant.user_id),
    'تجاوزت مهمة خارطة السير موعد التنفيذ دون إتمام أو تمديد معتمد.',
    'pending'
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow_instance on workflow_instance.id = stage_instance.workflow_instance_id
  join public.projects project on project.id = workflow_instance.project_id
  join public.workflow_action_participants participant
    on participant.workflow_action_instance_id = action_instance.id
   and participant.participant_type in ('executor', 'responsible')
   and participant.unassigned_at is null
  where action_instance.due_at < now()
    and action_instance.status in ('in_progress', 'returned_for_revision')
    and project.health_status <> 'yellow'
    and not exists (
      select 1 from public.project_attention_notices notice
      where notice.workflow_action_instance_id = action_instance.id
        and notice.target_user_id = participant.user_id
    );
  get diagnostics inserted_count = row_count;

  insert into public.project_attention_notices (
    organization_id, project_id, workflow_action_instance_id,
    target_user_id, issued_by, reason, status
  )
  select project.organization_id, project.id, action_instance.id,
    participant.user_id,
    participant.user_id,
    'تجاوزت مهلة اعتماد إجراء خارطة السير المحددة بيوم عمل واحد.',
    'pending'
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow_instance on workflow_instance.id = stage_instance.workflow_instance_id
  join public.projects project on project.id = workflow_instance.project_id
  join public.workflow_action_participants participant
    on participant.workflow_action_instance_id = action_instance.id
   and participant.participant_type = 'approver'
   and participant.unassigned_at is null
  where action_instance.status = 'awaiting_approval'
    and action_instance.approval_due_at < now()
    and project.health_status <> 'yellow'
    and not exists (
      select 1 from public.project_attention_notices notice
      where notice.workflow_action_instance_id = action_instance.id
        and notice.target_user_id = participant.user_id
    );
  get diagnostics batch_count = row_count;
  inserted_count := inserted_count + batch_count;

  insert into public.project_attention_notices (
    organization_id, project_id, litigation_action_id,
    target_user_id, issued_by, reason, status
  )
  select project.organization_id, project.id, action.id,
    assignee.user_id,
    coalesce(project.project_manager_id, assignee.user_id),
    'تجاوزت المهمة القانونية موعدها المحدد دون رد أو تمديد معتمد.',
    'pending'
  from public.litigation_case_actions action
  join public.litigation_cases litigation_case on litigation_case.id = action.litigation_case_id
  join public.projects project on project.id = litigation_case.project_id
  join public.litigation_case_action_assignees assignee
    on assignee.litigation_action_id = action.id
   and assignee.ended_at is null
  where coalesce(action.due_at, action.legal_due_date) < now()
    and action.status in ('planned', 'in_progress', 'returned_for_revision')
    and project.health_status <> 'yellow'
    and not exists (
      select 1 from public.project_attention_notices notice
      where notice.litigation_action_id = action.id
        and notice.target_user_id = assignee.user_id
    );
  get diagnostics batch_count = row_count;
  inserted_count := inserted_count + batch_count;

  update public.projects project
  set health_status = 'red',
      health_updated_at = now(),
      updated_at = now()
  where project.health_status = 'green'
    and exists (
      select 1
      from public.project_attention_notices notice
      where notice.project_id = project.id
        and notice.status in ('pending', 'active')
    );

  return inserted_count;
end;
$$;

revoke all on function public.generate_overdue_attention_notices() from public, anon, authenticated;
grant execute on function public.generate_overdue_attention_notices() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'generate-due-soon-notifications';
    perform cron.schedule(
      'generate-due-soon-notifications',
      '*/15 * * * *',
      'select public.generate_due_soon_notifications()'
    );
  end if;
exception
  when undefined_table or invalid_schema_name then null;
end;
$$;
