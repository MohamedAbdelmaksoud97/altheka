-- Operational project interfaces: published v2 workflows, litigation hearings,
-- estate records, and guarded project-document operations.

-- The source-aligned versions were verified as drafts in the previous sprint.
-- Publishing is additive and only affects workflows started after this release.
update public.workflow_template_versions version
set
  status = 'published',
  published_at = now()
from public.workflow_templates template
where template.id = version.workflow_template_id
  and version.version_number = 2
  and version.status = 'draft'
  and template.slug in ('litigation-v2', 'estate-v2', 'estate-asset-v2');

alter table public.litigation_case_actions
  add column hearing_id uuid references public.litigation_hearings(id) on delete restrict;

alter table public.litigation_hearings
  add column outcome_summary text,
  add column minutes_reviewed_at timestamptz,
  add column client_report_sent_at timestamptz;

create index litigation_case_actions_hearing_idx
  on public.litigation_case_actions (hearing_id)
  where hearing_id is not null;

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
begin
  select * into workflow_row
  from public.workflow_instances
  where id = p_workflow_instance_id
  for update;

  if not found or workflow_row.project_id is null then
    return;
  end if;

  select
    stage_instance.id,
    stage_template.position,
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
    update public.workflow_instances
    set status = 'completed', completed_at = now(), updated_at = now()
    where id = workflow_row.id;
  end if;
end;
$$;

revoke all on function private.refresh_project_workflow_progress(uuid)
from public, anon, authenticated;

create or replace function public.start_project_operational_workflow(
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  template_slug text;
  template_version_id uuid;
  workflow_id uuid;
  responsible_id uuid;
  executor_id uuid;
  follower_id uuid;
  approver_id uuid;
begin
  select * into project_row
  from public.projects
  where id = p_project_id
    and deleted_at is null
    and status in ('active', 'on_hold')
  for update;

  if not found then
    raise exception 'Project was not found';
  end if;

  if not (
    private.has_permission('workflow.start')
    or private.has_permission('system.override')
    or project_row.project_manager_id = actor_id
  ) or not private.can_access_project(project_row.id) then
    raise exception 'The current user cannot start this project workflow';
  end if;

  select id into workflow_id
  from public.workflow_instances
  where project_id = project_row.id
    and estate_asset_id is null
    and status in ('draft', 'active', 'on_hold')
  order by created_at desc
  limit 1;

  if workflow_id is not null then
    return workflow_id;
  end if;

  template_slug := case
    when project_row.project_type = 'litigation' then 'litigation-v2'
    when project_row.project_type = 'estate' then 'estate-v2'
    when project_row.project_type = 'estate_asset' then 'estate-asset-v2'
    else null
  end;

  if template_slug is null then
    raise exception 'No operational workflow is available for this project type';
  end if;

  select version.id into template_version_id
  from public.workflow_template_versions version
  join public.workflow_templates template
    on template.id = version.workflow_template_id
  where template.organization_id = project_row.organization_id
    and template.slug = template_slug
    and version.version_number = 2
    and version.status = 'published';

  if template_version_id is null then
    raise exception 'The source-aligned workflow template is not published';
  end if;

  workflow_id := public.start_workflow_instance(
    project_row.id,
    template_version_id,
    project_row.name,
    project_row.estate_asset_id
  );

  select coalesce(
    (
      select member.user_id
      from public.project_members member
      where member.project_id = project_row.id
        and member.membership_role = 'department_manager'
        and member.left_at is null
      order by member.joined_at
      limit 1
    ),
    project_row.project_manager_id,
    actor_id
  ) into responsible_id;

  executor_id := coalesce(project_row.primary_assignee_id, project_row.project_manager_id, actor_id);

  select coalesce(
    (
      select member.user_id
      from public.project_members member
      where member.project_id = project_row.id
        and member.membership_role = 'follower'
        and member.left_at is null
      order by member.joined_at
      limit 1
    ),
    project_row.project_manager_id,
    actor_id
  ) into follower_id;

  select coalesce(
    (
      select member.user_id
      from public.project_members member
      where member.project_id = project_row.id
        and member.membership_role in ('approver', 'department_manager')
        and member.left_at is null
      order by
        case when member.membership_role = 'approver' then 1 else 2 end,
        member.joined_at
      limit 1
    ),
    project_row.project_manager_id,
    actor_id
  ) into approver_id;

  insert into public.workflow_action_participants (
    workflow_action_instance_id,
    participant_type,
    user_id,
    assigned_by,
    assignment_reason
  )
  select
    action_instance.id,
    participant.participant_type,
    participant.user_id,
    actor_id,
    'operational_project_default'
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance
    on stage_instance.id = action_instance.workflow_stage_instance_id
  cross join lateral (
    values
      ('responsible', responsible_id),
      ('executor', executor_id),
      ('follower', follower_id),
      ('approver', approver_id)
  ) as participant(participant_type, user_id)
  where stage_instance.workflow_instance_id = workflow_id
    and participant.user_id is not null
  on conflict do nothing;

  update public.workflow_action_instances action_instance
  set
    status = case
      when stage_instance.status <> 'active' then 'blocked'
      when exists (
        select 1
        from public.workflow_action_dependencies dependency
        where dependency.action_template_id = action_instance.action_template_id
      ) then 'blocked'
      else 'ready'
    end,
    due_at = case
      when stage_instance.status = 'active'
        and action_instance.planned_duration is not null
      then now() + action_instance.planned_duration
      else null
    end,
    updated_at = now()
  from public.workflow_stage_instances stage_instance
  where stage_instance.id = action_instance.workflow_stage_instance_id
    and stage_instance.workflow_instance_id = workflow_id;

  perform private.refresh_project_workflow_progress(workflow_id);
  return workflow_id;
end;
$$;

create or replace function public.operate_workflow_action(
  p_action_instance_id uuid,
  p_new_status text,
  p_reason text default null,
  p_is_override boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  workflow_id uuid;
begin
  select workflow_instance.id into workflow_id
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance
    on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow_instance
    on workflow_instance.id = stage_instance.workflow_instance_id
  where action_instance.id = p_action_instance_id;

  if workflow_id is null then
    raise exception 'Workflow action was not found';
  end if;

  perform public.transition_workflow_action(
    p_action_instance_id,
    p_new_status,
    p_reason,
    p_is_override
  );

  perform private.refresh_project_workflow_progress(workflow_id);
end;
$$;

create or replace function public.upsert_litigation_case(
  p_project_id uuid,
  p_case_number text,
  p_court_name text,
  p_case_level text default 'first_instance'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  case_id uuid;
begin
  select * into project_row
  from public.projects
  where id = p_project_id
    and project_type in ('litigation', 'estate_litigation')
    and deleted_at is null;

  if not found then raise exception 'Litigation project was not found'; end if;
  if not private.has_permission('litigation.manage_cases')
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot manage this case'; end if;
  if p_case_level not in ('first_instance', 'appeal', 'cassation', 'enforcement') then
    raise exception 'Unsupported case level';
  end if;
  if length(trim(coalesce(p_court_name, ''))) < 2 then
    raise exception 'Court name is required';
  end if;

  insert into public.litigation_cases (
    organization_id, project_id, case_number, court_name,
    case_level, status, created_by
  )
  values (
    project_row.organization_id, project_row.id,
    nullif(trim(p_case_number), ''), trim(p_court_name),
    p_case_level, 'draft', actor_id
  )
  on conflict (project_id) do update
  set
    case_number = excluded.case_number,
    court_name = excluded.court_name,
    case_level = excluded.case_level,
    updated_at = now()
  returning id into case_id;

  return case_id;
end;
$$;

create or replace function public.schedule_litigation_hearing(
  p_case_id uuid,
  p_hearing_at timestamptz,
  p_notified_at timestamptz default null,
  p_court_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  case_row public.litigation_cases;
  project_row public.projects;
  hearing_id uuid;
begin
  select * into case_row
  from public.litigation_cases
  where id = p_case_id;
  if not found then raise exception 'Litigation case was not found'; end if;

  select * into project_row
  from public.projects
  where id = case_row.project_id and deleted_at is null;

  if not private.has_permission('litigation.manage_hearings')
    or not private.can_access_project(case_row.project_id)
  then raise exception 'The current user cannot schedule hearings'; end if;
  if p_hearing_at <= now() - interval '1 day' then
    raise exception 'Hearing date is not valid';
  end if;

  insert into public.litigation_hearings (
    litigation_case_id, hearing_at, notified_at,
    court_reference, status, created_by
  )
  values (
    case_row.id, p_hearing_at, p_notified_at,
    nullif(trim(p_court_reference), ''), 'scheduled', actor_id
  )
  returning id into hearing_id;

  insert into public.litigation_case_actions (
    litigation_case_id, hearing_id, title, action_type, due_at,
    status, priority, assigned_to, source_event, created_by
  )
  values
    (
      case_row.id, hearing_id, 'إعداد نموذج وتحضير الجلسة',
      'hearing_preparation', p_hearing_at - interval '7 days',
      'planned', 'critical', project_row.primary_assignee_id,
      'hearing_scheduled', actor_id
    ),
    (
      case_row.id, hearing_id, 'إرسال تقرير الجلسة المعتمد للعميل',
      'client_hearing_report', date_trunc('day', p_hearing_at) + interval '14 hours',
      'planned', 'critical', project_row.primary_assignee_id,
      'hearing_scheduled', actor_id
    ),
    (
      case_row.id, hearing_id, 'مراجعة ضبط الجلسة وتوثيق الإجراء التالي',
      'minutes_review', p_hearing_at + interval '1 day',
      'planned', 'high', project_row.primary_assignee_id,
      'hearing_scheduled', actor_id
    );

  perform public.set_litigation_next_action(
    case_row.id,
    'حضور الجلسة وتسجيل نتيجتها',
    'attend_hearing',
    p_hearing_at,
    null,
    'critical',
    project_row.primary_assignee_id
  );

  return hearing_id;
end;
$$;

create or replace function public.record_litigation_hearing_outcome(
  p_hearing_id uuid,
  p_status text,
  p_outcome_summary text,
  p_next_action_title text,
  p_next_action_due_at timestamptz default null,
  p_next_action_legal_due_date date default null,
  p_next_hearing_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hearing_row public.litigation_hearings;
  project_row public.projects;
begin
  select * into hearing_row
  from public.litigation_hearings
  where id = p_hearing_id
  for update;
  if not found then raise exception 'Hearing was not found'; end if;

  select project.* into project_row
  from public.litigation_cases litigation_case
  join public.projects project on project.id = litigation_case.project_id
  where litigation_case.id = hearing_row.litigation_case_id;

  if not private.has_permission('litigation.manage_hearings')
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot record hearing outcomes'; end if;
  if p_status not in ('held', 'adjourned', 'cancelled') then
    raise exception 'Unsupported hearing status';
  end if;
  if length(trim(coalesce(p_outcome_summary, ''))) < 5 then
    raise exception 'Hearing outcome is required';
  end if;
  if p_status = 'adjourned' and p_next_hearing_at is null then
    raise exception 'The adjourned hearing requires a new date';
  end if;
  if p_status <> 'adjourned'
    and (
      length(trim(coalesce(p_next_action_title, ''))) < 3
      or (p_next_action_due_at is null and p_next_action_legal_due_date is null)
    )
  then raise exception 'The case requires a dated next action'; end if;

  update public.litigation_hearings
  set
    status = p_status,
    outcome_summary = trim(p_outcome_summary),
    next_hearing_at = p_next_hearing_at,
    updated_at = now()
  where id = hearing_row.id;

  update public.litigation_case_actions
  set status = 'completed', completed_at = now(), updated_at = now()
  where hearing_id = hearing_row.id
    and action_type = 'attend_hearing'
    and status in ('planned', 'in_progress');

  if p_status = 'adjourned' then
    perform public.schedule_litigation_hearing(
      hearing_row.litigation_case_id,
      p_next_hearing_at,
      now(),
      hearing_row.court_reference
    );
  else
    perform public.set_litigation_next_action(
      hearing_row.litigation_case_id,
      trim(p_next_action_title),
      'post_hearing',
      p_next_action_due_at,
      p_next_action_legal_due_date,
      'high',
      project_row.primary_assignee_id
    );
  end if;
end;
$$;

create or replace function public.set_litigation_action_status(
  p_action_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_row public.litigation_case_actions;
  case_row public.litigation_cases;
begin
  select * into action_row
  from public.litigation_case_actions
  where id = p_action_id
  for update;
  if not found then raise exception 'Case action was not found'; end if;

  select * into case_row
  from public.litigation_cases
  where id = action_row.litigation_case_id;

  if not private.has_permission('litigation.manage_cases')
    or not private.can_access_project(case_row.project_id)
  then raise exception 'The current user cannot update case actions'; end if;
  if p_status not in ('planned', 'in_progress', 'completed', 'cancelled') then
    raise exception 'Unsupported case action status';
  end if;
  if action_row.id = case_row.current_next_action_id
    and p_status in ('completed', 'cancelled')
  then raise exception 'Set a new dated next action before closing the current one'; end if;

  update public.litigation_case_actions
  set
    status = p_status,
    completed_at = case when p_status = 'completed' then now() else null end,
    updated_at = now()
  where id = action_row.id;
end;
$$;

create or replace function public.upsert_estate_details(
  p_project_id uuid,
  p_deceased_name text,
  p_estate_kind text default 'regular_estate',
  p_documents_completed_at timestamptz default null,
  p_agencies_issued_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_row public.projects;
begin
  select * into project_row
  from public.projects
  where id = p_project_id
    and project_type = 'estate'
    and deleted_at is null;
  if not found then raise exception 'Estate project was not found'; end if;
  if not private.has_permission('estates.manage')
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot manage this estate'; end if;
  if length(trim(coalesce(p_deceased_name, ''))) < 3 then
    raise exception 'Deceased name is required';
  end if;
  if p_estate_kind not in ('regular_estate', 'isnad_estate') then
    raise exception 'Unsupported estate kind';
  end if;

  insert into public.estate_details (
    project_id, deceased_name, estate_kind,
    documents_completed_at, agencies_issued_at
  )
  values (
    project_row.id, trim(p_deceased_name), p_estate_kind,
    p_documents_completed_at, p_agencies_issued_at
  )
  on conflict (project_id) do update
  set
    deceased_name = excluded.deceased_name,
    estate_kind = excluded.estate_kind,
    documents_completed_at = excluded.documents_completed_at,
    agencies_issued_at = excluded.agencies_issued_at,
    updated_at = now();
end;
$$;

create or replace function public.create_estate_party(
  p_project_id uuid,
  p_party_type text,
  p_full_name text,
  p_national_id text default null,
  p_phone text default null,
  p_email text default null,
  p_is_minor boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  party_id uuid;
begin
  select * into project_row
  from public.projects
  where id = p_project_id
    and project_type = 'estate'
    and deleted_at is null;
  if not found then raise exception 'Estate project was not found'; end if;
  if not private.has_permission('estates.manage_parties')
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot manage estate parties'; end if;
  if p_party_type not in ('heir', 'representative', 'beneficiary', 'guardian', 'creditor', 'other') then
    raise exception 'Unsupported estate party type';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 3 then
    raise exception 'Party name is required';
  end if;

  insert into public.estate_parties (
    organization_id, estate_project_id, party_type, full_name,
    national_id, phone, email, is_minor, created_by
  )
  values (
    project_row.organization_id, project_row.id, p_party_type, trim(p_full_name),
    nullif(trim(p_national_id), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_email), ''), p_is_minor, actor_id
  )
  returning id into party_id;
  return party_id;
end;
$$;

create or replace function public.record_estate_party_share(
  p_party_id uuid,
  p_numerator numeric,
  p_denominator numeric,
  p_percentage numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  party_row public.estate_parties;
  share_id uuid;
begin
  select * into party_row
  from public.estate_parties
  where id = p_party_id and deleted_at is null;
  if not found then raise exception 'Estate party was not found'; end if;
  if not private.has_permission('estates.manage_parties')
    or not private.can_access_project(party_row.estate_project_id)
  then raise exception 'The current user cannot manage estate shares'; end if;
  if p_numerator < 0 or p_denominator <= 0 then
    raise exception 'Share values are not valid';
  end if;

  update public.estate_party_shares
  set superseded_at = now()
  where estate_party_id = party_row.id and superseded_at is null;

  insert into public.estate_party_shares (
    estate_party_id, numerator, denominator, percentage, created_by
  )
  values (
    party_row.id, p_numerator, p_denominator,
    coalesce(p_percentage, round((p_numerator / p_denominator) * 100, 6)),
    actor_id
  )
  returning id into share_id;
  return share_id;
end;
$$;

create or replace function public.update_estate_asset(
  p_asset_id uuid,
  p_current_stage text,
  p_status text,
  p_valuation_amount numeric default null,
  p_liquidation_status text default null,
  p_marketing_status text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_row public.estate_assets;
begin
  select * into asset_row
  from public.estate_assets
  where id = p_asset_id and deleted_at is null
  for update;
  if not found then raise exception 'Estate asset was not found'; end if;
  if not private.has_permission('estates.manage_assets')
    or not private.can_access_project(asset_row.project_id)
  then raise exception 'The current user cannot manage this estate asset'; end if;
  if p_current_stage not in (
    'inventory', 'preparation', 'guardianship', 'litigation',
    'liquidation', 'marketing', 'completed'
  ) then raise exception 'Unsupported estate asset stage'; end if;
  if p_status not in (
    'active', 'under_guardianship', 'in_litigation',
    'marketed', 'sold', 'distributed', 'closed'
  ) then raise exception 'Unsupported estate asset status'; end if;
  if p_valuation_amount is not null and p_valuation_amount < 0 then
    raise exception 'Asset valuation is not valid';
  end if;

  update public.estate_assets
  set
    current_stage = p_current_stage,
    status = p_status,
    valuation_amount = p_valuation_amount,
    liquidation_status = nullif(trim(p_liquidation_status), ''),
    marketing_status = nullif(trim(p_marketing_status), ''),
    guardianship_ended_at = case
      when status = 'under_guardianship' and p_status <> 'under_guardianship'
      then now()
      else guardianship_ended_at
    end,
    updated_at = now()
  where id = asset_row.id;
end;
$$;

create or replace function public.register_project_document(
  p_project_id uuid,
  p_title text,
  p_document_type text,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  document_id uuid;
begin
  select * into project_row
  from public.projects
  where id = p_project_id and deleted_at is null;
  if not found then raise exception 'Project was not found'; end if;
  if not private.has_permission('documents.upload')
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot upload project documents'; end if;
  if p_storage_bucket <> 'legal-documents' then
    raise exception 'Unsupported storage bucket';
  end if;
  if p_byte_size < 0 or p_byte_size > 26214400 then
    raise exception 'File exceeds the 25MB limit';
  end if;
  if lower(split_part(p_file_name, '.', array_length(string_to_array(p_file_name, '.'), 1)))
    not in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png')
  then raise exception 'Unsupported file type'; end if;
  if p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid SHA-256'; end if;

  insert into public.documents (
    organization_id, project_id, client_id, title, document_type,
    visibility, client_visibility_status, current_version_number, created_by
  )
  values (
    project_row.organization_id, project_row.id, project_row.client_id,
    trim(p_title), trim(p_document_type), 'internal', 'draft', 1, actor_id
  )
  returning id into document_id;

  insert into public.document_versions (
    document_id, version_number, storage_bucket, storage_path,
    file_name, mime_type, byte_size, sha256, uploaded_by
  )
  values (
    document_id, 1, p_storage_bucket, p_storage_path,
    p_file_name, p_mime_type, p_byte_size, p_sha256, actor_id
  );
  return document_id;
end;
$$;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.start_project_operational_workflow(uuid)',
    'public.operate_workflow_action(uuid, text, text, boolean)',
    'public.upsert_litigation_case(uuid, text, text, text)',
    'public.schedule_litigation_hearing(uuid, timestamptz, timestamptz, text)',
    'public.record_litigation_hearing_outcome(uuid, text, text, text, timestamptz, date, timestamptz)',
    'public.set_litigation_action_status(uuid, text)',
    'public.upsert_estate_details(uuid, text, text, timestamptz, timestamptz)',
    'public.create_estate_party(uuid, text, text, text, text, text, boolean)',
    'public.record_estate_party_share(uuid, numeric, numeric, numeric)',
    'public.update_estate_asset(uuid, text, text, numeric, text, text)',
    'public.register_project_document(uuid, text, text, text, text, text, text, bigint, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', function_signature);
    execute format('grant execute on function %s to authenticated', function_signature);
  end loop;
end;
$$;
