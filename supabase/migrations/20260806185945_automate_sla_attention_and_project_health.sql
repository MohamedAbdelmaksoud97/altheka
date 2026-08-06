create or replace function private.add_working_days(p_start timestamptz, p_days integer)
returns timestamptz
language plpgsql immutable
set search_path = ''
as $$
declare
  result_value timestamptz := p_start;
  remaining integer := greatest(p_days, 0);
begin
  while remaining > 0 loop
    result_value := result_value + interval '1 day';
    if extract(isodow from result_value at time zone 'Asia/Riyadh') not in (5, 6) then
      remaining := remaining - 1;
    end if;
  end loop;
  return result_value;
end;
$$;

create or replace function private.sync_pre_contract_sla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_at is not null and tg_op = 'INSERT' then
    new.offer_due_at := private.add_working_days(new.assigned_at, 3);
  elsif new.assigned_at is not null and (new.offer_due_at is null or old.assigned_at is distinct from new.assigned_at) then
    new.offer_due_at := private.add_working_days(new.assigned_at, 3);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_pre_contract_sla_trigger on public.pre_contract_cases;
create trigger sync_pre_contract_sla_trigger
before insert or update of assigned_at on public.pre_contract_cases
for each row execute function private.sync_pre_contract_sla();

update public.pre_contract_cases
set offer_due_at = private.add_working_days(assigned_at, 3)
where assigned_at is not null
  and not exists (
    select 1 from public.pre_contract_extension_requests extension_request
    where extension_request.service_request_id = pre_contract_cases.service_request_id
      and extension_request.phase = 'offer'
      and extension_request.status = 'approved'
  );

create or replace function private.sync_proposal_sla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pre_contract_cases
  set client_response_due_at = private.add_working_days(coalesce(new.sent_at, new.created_at, now()), 3),
      updated_at = now()
  where service_request_id = new.service_request_id;
  return new;
end;
$$;

drop trigger if exists sync_proposal_sla_trigger on public.proposals;
create trigger sync_proposal_sla_trigger
after insert on public.proposals
for each row execute function private.sync_proposal_sla();

create or replace function private.sync_contract_sla_after_proposal_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare request_id_value uuid;
begin
  if new.response_type = 'accept' then
    select service_request_id into request_id_value from public.proposals where id = new.proposal_id;
    update public.pre_contract_cases
    set contract_due_at = private.add_working_days(new.created_at, 1), updated_at = now()
    where service_request_id = request_id_value;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_contract_sla_trigger on public.proposal_responses;
create trigger sync_contract_sla_trigger
after insert on public.proposal_responses
for each row execute function private.sync_contract_sla_after_proposal_response();

alter table public.projects
  add column if not exists health_status text not null default 'green'
    check (health_status in ('green', 'yellow', 'red')),
  add column if not exists external_hold_reason text,
  add column if not exists external_hold_started_at timestamptz,
  add column if not exists health_updated_by uuid references public.profiles(id) on delete restrict,
  add column if not exists health_updated_at timestamptz;

create or replace function public.set_project_health(
  p_project_id uuid,
  p_health_status text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not private.has_any_role(array['super_admin','executive_manager','litigation_manager','estates_manager']) then
    raise exception 'Only a department manager can change project health';
  end if;
  if p_health_status not in ('green','yellow') then raise exception 'Unsupported manual health status'; end if;
  if p_health_status = 'yellow' and length(trim(coalesce(p_reason,''))) < 5 then raise exception 'External hold reason is required'; end if;
  update public.projects
  set health_status = p_health_status,
      external_hold_reason = case when p_health_status = 'yellow' then trim(p_reason) end,
      external_hold_started_at = case when p_health_status = 'yellow' then coalesce(external_hold_started_at, now()) end,
      health_updated_by = actor_id,
      health_updated_at = now(),
      updated_at = now()
  where id = p_project_id and deleted_at is null;
  if not found then raise exception 'Project was not found'; end if;
  return p_project_id;
end;
$$;

create or replace function public.generate_overdue_attention_notices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare inserted_count integer := 0; litigation_inserted_count integer := 0;
begin
  insert into public.project_attention_notices (
    organization_id, project_id, workflow_action_instance_id,
    target_user_id, issued_by, reason, status
  )
  select project.organization_id, project.id, action_instance.id,
    participant.user_id,
    coalesce(project.project_manager_id, participant.user_id),
    'تجاوزت المهمة موعدها المحدد دون إتمام أو تمديد معتمد.',
    'pending'
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow_instance on workflow_instance.id = stage_instance.workflow_instance_id
  join public.projects project on project.id = workflow_instance.project_id
  join public.workflow_action_participants participant
    on participant.workflow_action_instance_id = action_instance.id
   and participant.participant_type = 'executor' and participant.unassigned_at is null
  where action_instance.due_at < now()
    and action_instance.status not in ('approved','completed','cancelled')
    and project.health_status <> 'yellow'
    and not exists (
      select 1 from public.project_attention_notices notice
      where notice.workflow_action_instance_id = action_instance.id
        and notice.target_user_id = participant.user_id
    );
  get diagnostics inserted_count = row_count;

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
    on assignee.litigation_action_id = action.id and assignee.ended_at is null
  where coalesce(action.due_at, action.legal_due_date) < now()
    and action.status in ('planned','in_progress','awaiting_approval','returned_for_revision')
    and project.health_status <> 'yellow'
    and not exists (
      select 1 from public.project_attention_notices notice
      where notice.litigation_action_id = action.id
        and notice.target_user_id = assignee.user_id
    );
  get diagnostics litigation_inserted_count = row_count;
  inserted_count := inserted_count + litigation_inserted_count;

  update public.projects project
  set health_status = 'red', health_updated_at = now(), updated_at = now()
  where project.health_status = 'green'
    and exists (
      select 1 from public.project_attention_notices notice
      where notice.project_id = project.id and notice.status in ('pending','active')
    );
  return inserted_count;
end;
$$;

revoke all on function public.set_project_health(uuid,text,text) from public, anon;
grant execute on function public.set_project_health(uuid,text,text) to authenticated;
revoke all on function public.generate_overdue_attention_notices() from public, anon, authenticated;
grant execute on function public.generate_overdue_attention_notices() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'generate-overdue-attention-notices';
    perform cron.schedule('generate-overdue-attention-notices', '*/5 * * * *', 'select public.generate_overdue_attention_notices()');
  end if;
exception when undefined_table or invalid_schema_name then
  null;
end;
$$;
