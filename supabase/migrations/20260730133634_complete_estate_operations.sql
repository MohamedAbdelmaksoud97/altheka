-- Complete the operational estate path without deleting or rewriting existing data.

-- The current starter only detects instances whose estate_asset_id is null and
-- does not recognize estate litigation projects. Patch the published function
-- definition in place while preserving its established assignment logic.
do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.start_project_operational_workflow(uuid)'::regprocedure
  )
  into function_definition;

  if position('and estate_asset_id is null' in function_definition) = 0 then
    raise exception 'Unexpected start_project_operational_workflow definition';
  end if;
  if position(
    'when project_row.project_type = ''litigation'' then ''litigation-v2'''
    in function_definition
  ) = 0 then
    raise exception 'Unexpected project type routing definition';
  end if;

  function_definition := replace(
    function_definition,
    'and estate_asset_id is null',
    'and estate_asset_id is not distinct from project_row.estate_asset_id'
  );
  function_definition := replace(
    function_definition,
    'when project_row.project_type = ''litigation'' then ''litigation-v2''',
    'when project_row.project_type in (''litigation'', ''estate_litigation'') then ''litigation-v2'''
  );

  execute function_definition;
end;
$migration$;

create table public.estate_financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  estate_project_id uuid not null references public.projects(id) on delete restrict,
  estate_asset_id uuid references public.estate_assets(id) on delete restrict,
  estate_party_id uuid references public.estate_parties(id) on delete restrict,
  entry_type text not null check (
    entry_type in ('income', 'expense', 'reserve', 'distribution', 'transfer')
  ),
  amount numeric(16, 2) not null check (amount > 0),
  currency char(3) not null default 'SAR',
  occurred_on date not null,
  description text not null check (length(trim(description)) >= 3),
  evidence_document_id uuid references public.documents(id) on delete restrict,
  status text not null default 'submitted' check (
    status in ('draft', 'submitted', 'approved', 'rejected', 'reversed')
  ),
  review_notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  reversal_of_id uuid references public.estate_financial_entries(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  retention_status text not null default 'retained'
    check (retention_status in ('retained', 'archived', 'legal_hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estate_asset_id is null or estate_party_id is null or entry_type = 'distribution')
);

create index estate_financial_entries_project_idx
  on public.estate_financial_entries (estate_project_id, status, occurred_on desc)
  where archived_at is null;
create index estate_financial_entries_asset_idx
  on public.estate_financial_entries (estate_asset_id, occurred_on desc)
  where estate_asset_id is not null and archived_at is null;
create index estate_financial_entries_party_idx
  on public.estate_financial_entries (estate_party_id, occurred_on desc)
  where estate_party_id is not null and archived_at is null;
create unique index estate_financial_entries_reversal_unique
  on public.estate_financial_entries (reversal_of_id)
  where reversal_of_id is not null;

create unique index estate_party_bank_accounts_party_iban_unique
  on public.estate_party_bank_accounts (estate_party_id, iban);
create unique index project_reports_schedule_period_unique
  on public.project_reports (schedule_id, period_end)
  where schedule_id is not null;

alter table public.estate_financial_entries enable row level security;

create policy estate_financial_entries_staff_select
on public.estate_financial_entries
for select to authenticated
using (
  (select private.is_active_staff())
  and (select private.can_access_project(estate_project_id))
  and (
    (select private.has_permission('finance.read'))
    or (select private.has_permission('estates.manage'))
    or (select private.has_permission('system.override'))
  )
);

revoke all on public.estate_financial_entries from public, anon;
grant select on public.estate_financial_entries to authenticated;

create trigger estate_financial_entries_touch_updated_at
before update on public.estate_financial_entries
for each row execute function private.touch_updated_at();

create trigger audit_estate_financial_entries
after insert or update on public.estate_financial_entries
for each row execute function private.audit_row_change();

create or replace function private.ensure_estate_report_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule_actor uuid;
begin
  if new.project_type <> 'estate' or new.deleted_at is not null then
    return new;
  end if;

  schedule_actor := coalesce(
    (select auth.uid()),
    new.project_manager_id,
    new.primary_assignee_id
  );
  if schedule_actor is null then
    return new;
  end if;

  insert into public.recurring_report_schedules (
    organization_id,
    project_id,
    report_type,
    interval_days,
    preparation_business_days,
    next_period_ends_on,
    status,
    created_by
  )
  values (
    new.organization_id,
    new.id,
    'estate_quarterly',
    90,
    15,
    current_date + 90,
    'active',
    schedule_actor
  )
  on conflict (project_id, report_type) do nothing;

  return new;
end;
$$;

drop trigger if exists projects_ensure_estate_report_schedule on public.projects;
create trigger projects_ensure_estate_report_schedule
after insert or update of project_type, deleted_at on public.projects
for each row execute function private.ensure_estate_report_schedule();

insert into public.recurring_report_schedules (
  organization_id,
  project_id,
  report_type,
  interval_days,
  preparation_business_days,
  next_period_ends_on,
  status,
  created_by
)
select
  project.organization_id,
  project.id,
  'estate_quarterly',
  90,
  15,
  greatest(project.created_at::date + 90, current_date),
  'active',
  coalesce(project.project_manager_id, project.primary_assignee_id)
from public.projects project
where project.project_type = 'estate'
  and project.deleted_at is null
  and coalesce(project.project_manager_id, project.primary_assignee_id) is not null
on conflict (project_id, report_type) do nothing;

create or replace function public.upsert_estate_party_bank_account(
  p_estate_party_id uuid,
  p_iban text,
  p_bank_name text default null,
  p_certificate_document_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  party_row public.estate_parties;
  account_id uuid;
  normalized_iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s+', '', 'g'));
begin
  select * into party_row
  from public.estate_parties
  where id = p_estate_party_id and deleted_at is null;

  if not found then
    raise exception 'Estate party was not found';
  end if;
  if not private.has_permission('estates.manage_parties')
    or not private.can_access_project(party_row.estate_project_id)
  then
    raise exception 'The current user cannot manage estate party accounts';
  end if;
  if length(normalized_iban) < 15 or length(normalized_iban) > 34 then
    raise exception 'A valid IBAN is required';
  end if;
  if p_certificate_document_id is not null and not exists (
    select 1
    from public.documents document
    where document.id = p_certificate_document_id
      and document.project_id = party_row.estate_project_id
      and document.deleted_at is null
  ) then
    raise exception 'The bank certificate must belong to the estate project';
  end if;

  insert into public.estate_party_bank_accounts (
    estate_party_id,
    iban,
    bank_name,
    certificate_document_id,
    is_verified
  )
  values (
    party_row.id,
    normalized_iban,
    nullif(trim(coalesce(p_bank_name, '')), ''),
    p_certificate_document_id,
    false
  )
  on conflict (estate_party_id, iban) do update
  set bank_name = excluded.bank_name,
      certificate_document_id = excluded.certificate_document_id,
      is_verified = case
        when public.estate_party_bank_accounts.certificate_document_id
          is not distinct from excluded.certificate_document_id
        then public.estate_party_bank_accounts.is_verified
        else false
      end,
      verified_by = case
        when public.estate_party_bank_accounts.certificate_document_id
          is not distinct from excluded.certificate_document_id
        then public.estate_party_bank_accounts.verified_by
        else null
      end,
      verified_at = case
        when public.estate_party_bank_accounts.certificate_document_id
          is not distinct from excluded.certificate_document_id
        then public.estate_party_bank_accounts.verified_at
        else null
      end
  returning id into account_id;

  return account_id;
end;
$$;

create or replace function public.verify_estate_party_bank_account(
  p_account_id uuid,
  p_verified boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  estate_project_id_value uuid;
begin
  select party.estate_project_id
  into estate_project_id_value
  from public.estate_party_bank_accounts account
  join public.estate_parties party on party.id = account.estate_party_id
  where account.id = p_account_id
    and party.deleted_at is null;

  if estate_project_id_value is null then
    raise exception 'Estate bank account was not found';
  end if;
  if not (
    private.has_permission('estates.manage')
    or private.has_permission('system.override')
  ) or not private.can_access_project(estate_project_id_value) then
    raise exception 'The current user cannot verify estate bank accounts';
  end if;

  update public.estate_party_bank_accounts
  set is_verified = p_verified,
      verified_by = case when p_verified then actor_id else null end,
      verified_at = case when p_verified then now() else null end
  where id = p_account_id;
end;
$$;

create or replace function public.record_estate_party_decision(
  p_estate_party_id uuid,
  p_decision_type text,
  p_subject_type text,
  p_subject_id uuid default null,
  p_status text default 'pending',
  p_notes text default null,
  p_evidence_document_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  party_row public.estate_parties;
  decision_id uuid;
begin
  select * into party_row
  from public.estate_parties
  where id = p_estate_party_id and deleted_at is null;

  if not found then
    raise exception 'Estate party was not found';
  end if;
  if not private.has_permission('estates.manage_parties')
    or not private.can_access_project(party_row.estate_project_id)
  then
    raise exception 'The current user cannot record estate decisions';
  end if;
  if p_decision_type not in ('consent', 'approval', 'release', 'objection') then
    raise exception 'Unsupported estate decision type';
  end if;
  if p_status not in ('pending', 'accepted', 'rejected', 'withdrawn') then
    raise exception 'Unsupported estate decision status';
  end if;
  if length(trim(coalesce(p_subject_type, ''))) < 2 then
    raise exception 'Decision subject is required';
  end if;
  if p_evidence_document_id is not null and not exists (
    select 1
    from public.documents document
    where document.id = p_evidence_document_id
      and document.project_id = party_row.estate_project_id
      and document.deleted_at is null
  ) then
    raise exception 'Decision evidence must belong to the estate project';
  end if;

  insert into public.estate_party_decisions (
    estate_party_id,
    decision_type,
    subject_type,
    subject_id,
    status,
    evidence_document_id,
    recorded_by,
    notes
  )
  values (
    party_row.id,
    p_decision_type,
    trim(p_subject_type),
    p_subject_id,
    p_status,
    p_evidence_document_id,
    actor_id,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into decision_id;

  return decision_id;
end;
$$;

create or replace function public.record_estate_financial_entry(
  p_estate_project_id uuid,
  p_entry_type text,
  p_amount numeric,
  p_currency text,
  p_occurred_on date,
  p_description text,
  p_estate_asset_id uuid default null,
  p_estate_party_id uuid default null,
  p_evidence_document_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  entry_id uuid;
  normalized_currency text := upper(trim(coalesce(p_currency, 'SAR')));
begin
  select * into project_row
  from public.projects
  where id = p_estate_project_id
    and project_type = 'estate'
    and deleted_at is null;

  if not found then
    raise exception 'Estate project was not found';
  end if;
  if not private.has_permission('finance.manage')
    or not private.can_access_project(project_row.id)
  then
    raise exception 'The current user cannot record estate financial entries';
  end if;
  if p_entry_type not in ('income', 'expense', 'reserve', 'distribution', 'transfer') then
    raise exception 'Unsupported estate financial entry type';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Financial amount must be greater than zero';
  end if;
  if normalized_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must use a three-letter code';
  end if;
  if p_occurred_on is null or p_occurred_on > current_date then
    raise exception 'A valid occurrence date is required';
  end if;
  if length(trim(coalesce(p_description, ''))) < 3 then
    raise exception 'Financial entry description is required';
  end if;
  if p_estate_asset_id is not null and not exists (
    select 1
    from public.estate_assets asset
    where asset.id = p_estate_asset_id
      and asset.project_id = project_row.id
      and asset.deleted_at is null
  ) then
    raise exception 'Financial asset does not belong to the estate project';
  end if;
  if p_estate_party_id is not null and not exists (
    select 1
    from public.estate_parties party
    where party.id = p_estate_party_id
      and party.estate_project_id = project_row.id
      and party.deleted_at is null
  ) then
    raise exception 'Financial party does not belong to the estate project';
  end if;
  if p_entry_type = 'distribution' and p_estate_party_id is null then
    raise exception 'Distribution entries require an estate party';
  end if;
  if p_evidence_document_id is not null and not exists (
    select 1
    from public.documents document
    where document.id = p_evidence_document_id
      and document.project_id = project_row.id
      and document.deleted_at is null
  ) then
    raise exception 'Financial evidence must belong to the estate project';
  end if;

  insert into public.estate_financial_entries (
    organization_id,
    estate_project_id,
    estate_asset_id,
    estate_party_id,
    entry_type,
    amount,
    currency,
    occurred_on,
    description,
    evidence_document_id,
    status,
    created_by,
    submitted_at
  )
  values (
    project_row.organization_id,
    project_row.id,
    p_estate_asset_id,
    p_estate_party_id,
    p_entry_type,
    p_amount,
    normalized_currency,
    p_occurred_on,
    trim(p_description),
    p_evidence_document_id,
    'submitted',
    actor_id,
    now()
  )
  returning id into entry_id;

  return entry_id;
end;
$$;

create or replace function public.review_estate_financial_entry(
  p_entry_id uuid,
  p_decision text,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  entry_row public.estate_financial_entries;
begin
  select * into entry_row
  from public.estate_financial_entries
  where id = p_entry_id and archived_at is null
  for update;

  if not found then
    raise exception 'Estate financial entry was not found';
  end if;
  if not (
    private.has_permission('estates.manage')
    or private.has_permission('finance.approve_closure')
    or private.has_permission('system.override')
  ) or not private.can_access_project(entry_row.estate_project_id) then
    raise exception 'The current user cannot review estate financial entries';
  end if;
  if entry_row.status <> 'submitted' then
    raise exception 'Only submitted financial entries can be reviewed';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Unsupported financial review decision';
  end if;
  if p_decision = 'rejected'
    and length(trim(coalesce(p_review_notes, ''))) < 5
  then
    raise exception 'Rejection notes are required';
  end if;

  update public.estate_financial_entries
  set status = p_decision,
      review_notes = nullif(trim(coalesce(p_review_notes, '')), ''),
      reviewed_by = actor_id,
      reviewed_at = now(),
      updated_at = now()
  where id = entry_row.id;
end;
$$;

create or replace function public.create_estate_periodic_report(
  p_estate_project_id uuid,
  p_period_end date default current_date,
  p_human_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  schedule_row public.recurring_report_schedules;
  report_id uuid;
  period_start_value date;
  generated_data_value jsonb;
begin
  select * into project_row
  from public.projects
  where id = p_estate_project_id
    and project_type = 'estate'
    and deleted_at is null;

  if not found then
    raise exception 'Estate project was not found';
  end if;
  if not private.has_permission('estates.manage_reports')
    or not private.can_access_project(project_row.id)
  then
    raise exception 'The current user cannot create estate reports';
  end if;
  if p_period_end is null or p_period_end > current_date then
    raise exception 'Report period end cannot be in the future';
  end if;

  insert into public.recurring_report_schedules (
    organization_id,
    project_id,
    report_type,
    interval_days,
    preparation_business_days,
    next_period_ends_on,
    status,
    created_by
  )
  values (
    project_row.organization_id,
    project_row.id,
    'estate_quarterly',
    90,
    15,
    p_period_end + 90,
    'active',
    actor_id
  )
  on conflict (project_id, report_type) do nothing;

  select * into schedule_row
  from public.recurring_report_schedules
  where project_id = project_row.id
    and report_type = 'estate_quarterly'
  for update;

  select coalesce(max(report.period_end) + 1, project_row.created_at::date)
  into period_start_value
  from public.project_reports report
  where report.project_id = project_row.id
    and report.period_end < p_period_end;

  if period_start_value > p_period_end then
    raise exception 'Report period is already covered';
  end if;

  select jsonb_build_object(
    'project_id', project_row.id,
    'project_number', project_row.project_number,
    'period_start', period_start_value,
    'period_end', p_period_end,
    'generated_at', now(),
    'parties', (
      select jsonb_build_object(
        'total', count(*),
        'heirs', count(*) filter (where party.party_type = 'heir'),
        'minors', count(*) filter (where party.is_minor)
      )
      from public.estate_parties party
      where party.estate_project_id = project_row.id
        and party.deleted_at is null
    ),
    'assets', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (
          where asset.status in ('active', 'under_guardianship', 'in_litigation', 'marketed')
        ),
        'sold', count(*) filter (where asset.status = 'sold'),
        'distributed', count(*) filter (where asset.status = 'distributed'),
        'valuation_total', coalesce(sum(asset.valuation_amount), 0)
      )
      from public.estate_assets asset
      where asset.project_id = project_row.id
        and asset.deleted_at is null
    ),
    'finance', (
      select jsonb_build_object(
        'income', coalesce(sum(entry.amount) filter (where entry.entry_type = 'income'), 0),
        'expenses', coalesce(sum(entry.amount) filter (where entry.entry_type = 'expense'), 0),
        'reserves', coalesce(sum(entry.amount) filter (where entry.entry_type = 'reserve'), 0),
        'distributions', coalesce(sum(entry.amount) filter (where entry.entry_type = 'distribution'), 0)
      )
      from public.estate_financial_entries entry
      where entry.estate_project_id = project_row.id
        and entry.status = 'approved'
        and entry.archived_at is null
        and entry.occurred_on between period_start_value and p_period_end
    ),
    'workflow', (
      select jsonb_build_object(
        'completed_actions', count(*) filter (where action.status in ('approved', 'completed')),
        'open_actions', count(*) filter (
          where action.status not in ('approved', 'completed', 'cancelled')
        ),
        'overdue_actions', count(*) filter (
          where action.due_at < now()
            and action.status not in ('approved', 'completed', 'cancelled')
        )
      )
      from public.workflow_action_instances action
      join public.workflow_stage_instances stage
        on stage.id = action.workflow_stage_instance_id
      join public.workflow_instances workflow
        on workflow.id = stage.workflow_instance_id
      where workflow.project_id = project_row.id
    )
  )
  into generated_data_value;

  insert into public.project_reports (
    organization_id,
    project_id,
    schedule_id,
    period_start,
    period_end,
    due_at,
    status,
    current_version_number,
    created_by
  )
  values (
    project_row.organization_id,
    project_row.id,
    schedule_row.id,
    period_start_value,
    p_period_end,
    private.add_business_days(
      project_row.organization_id,
      now(),
      schedule_row.preparation_business_days
    ),
    'draft',
    1,
    actor_id
  )
  on conflict (schedule_id, period_end) where schedule_id is not null
  do update set updated_at = public.project_reports.updated_at
  returning id into report_id;

  insert into public.project_report_versions (
    project_report_id,
    version_number,
    generated_data,
    human_notes,
    created_by
  )
  values (
    report_id,
    1,
    generated_data_value,
    nullif(trim(coalesce(p_human_notes, '')), ''),
    actor_id
  )
  on conflict (project_report_id, version_number) do nothing;

  update public.recurring_report_schedules
  set next_period_ends_on = greatest(next_period_ends_on, p_period_end + interval_days),
      status = 'active'
  where id = schedule_row.id;

  return report_id;
end;
$$;

create or replace function public.transition_estate_report(
  p_report_id uuid,
  p_new_status text,
  p_human_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  report_row public.project_reports;
  next_version integer;
  latest_generated_data jsonb;
begin
  select * into report_row
  from public.project_reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'Estate report was not found';
  end if;
  if not private.can_access_project(report_row.project_id) then
    raise exception 'Estate report is not accessible';
  end if;
  if p_new_status not in ('submitted', 'approved', 'published', 'withdrawn') then
    raise exception 'Unsupported estate report transition';
  end if;

  if p_new_status = 'submitted' then
    if report_row.status <> 'draft'
      or not private.has_permission('estates.manage_reports')
    then
      raise exception 'The current user cannot submit this estate report';
    end if;

    select version.generated_data
    into latest_generated_data
    from public.project_report_versions version
    where version.project_report_id = report_row.id
    order by version.version_number desc
    limit 1;

    if length(trim(coalesce(p_human_notes, ''))) > 0 then
      next_version := report_row.current_version_number + 1;
      insert into public.project_report_versions (
        project_report_id,
        version_number,
        generated_data,
        human_notes,
        created_by
      )
      values (
        report_row.id,
        next_version,
        coalesce(latest_generated_data, '{}'::jsonb),
        trim(p_human_notes),
        actor_id
      );
      update public.project_reports
      set current_version_number = next_version
      where id = report_row.id;
    end if;
  elsif p_new_status = 'approved' then
    if report_row.status <> 'submitted'
      or not (
        private.has_permission('estates.manage')
        or private.has_permission('system.override')
      )
    then
      raise exception 'The current user cannot approve this estate report';
    end if;
  elsif p_new_status = 'published' then
    if report_row.status <> 'approved'
      or not private.has_permission('documents.publish')
    then
      raise exception 'The current user cannot publish this estate report';
    end if;
  elsif p_new_status = 'withdrawn' then
    if report_row.status <> 'published'
      or not private.has_permission('documents.withdraw')
    then
      raise exception 'The current user cannot withdraw this estate report';
    end if;
  end if;

  update public.project_reports
  set status = p_new_status,
      approved_by = case when p_new_status = 'approved' then actor_id else approved_by end,
      approved_at = case when p_new_status = 'approved' then now() else approved_at end,
      published_at = case
        when p_new_status = 'published' then now()
        when p_new_status = 'withdrawn' then published_at
        else published_at
      end,
      updated_at = now()
  where id = report_row.id;
end;
$$;

create or replace function public.get_my_client_estate_reports(
  p_project_id uuid
)
returns table (
  id uuid,
  period_start date,
  period_end date,
  published_at timestamptz,
  human_notes text,
  generated_data jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    report.id,
    report.period_start,
    report.period_end,
    report.published_at,
    version.human_notes,
    version.generated_data
  from public.project_reports report
  join public.projects project on project.id = report.project_id
  join public.client_accounts account
    on account.client_id = project.client_id
   and account.profile_id = (select auth.uid())
  join public.profiles profile
    on profile.id = account.profile_id
   and profile.account_kind = 'client'
   and profile.activation_status in ('client_waiting', 'active_client')
   and profile.is_active
   and profile.deleted_at is null
  join public.project_report_versions version
    on version.project_report_id = report.id
   and version.version_number = report.current_version_number
  where report.project_id = p_project_id
    and project.project_type = 'estate'
    and project.deleted_at is null
    and report.status = 'published'
  order by report.period_end desc;
$$;

create or replace function public.assign_estate_project_member(
  p_estate_project_id uuid,
  p_user_id uuid,
  p_membership_role text,
  p_can_contact_client boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  target_profile public.profiles;
begin
  select * into project_row
  from public.projects
  where id = p_estate_project_id
    and project_type = 'estate'
    and deleted_at is null;

  if not found then
    raise exception 'Estate project was not found';
  end if;
  if not private.has_permission('projects.manage_members')
    or not private.can_access_project(project_row.id)
  then
    raise exception 'The current user cannot manage estate project members';
  end if;
  if p_membership_role not in (
    'department_manager', 'project_manager', 'executor', 'follower',
    'finance', 'litigation', 'observer'
  ) then
    raise exception 'Unsupported estate membership role';
  end if;

  select * into target_profile
  from public.profiles
  where id = p_user_id
    and account_kind = 'staff'
    and activation_status = 'active_staff'
    and is_active
    and deleted_at is null;

  if not found then
    raise exception 'Active staff member was not found';
  end if;
  if actor_id = p_user_id
    and project_row.project_manager_id is distinct from actor_id
    and not private.has_permission('system.override')
  then
    raise exception 'Estate secretaries and team members cannot assign themselves';
  end if;

  insert into public.project_members (
    project_id,
    user_id,
    membership_role,
    can_contact_client,
    assigned_by
  )
  select
    scoped_project.id,
    target_profile.id,
    p_membership_role,
    p_can_contact_client,
    actor_id
  from public.projects scoped_project
  where scoped_project.id = project_row.id
     or (
       scoped_project.parent_project_id = project_row.id
       and scoped_project.project_type = 'estate_asset'
       and scoped_project.deleted_at is null
     )
  on conflict (project_id, user_id) do update
  set membership_role = excluded.membership_role,
      can_contact_client = excluded.can_contact_client,
      assigned_by = excluded.assigned_by,
      joined_at = now(),
      left_at = null;

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    joined_at,
    left_at
  )
  select conversation.id, target_profile.id, now(), null
  from public.conversations conversation
  join public.projects scoped_project on scoped_project.id = conversation.project_id
  where (
      scoped_project.id = project_row.id
      or scoped_project.parent_project_id = project_row.id
    )
    and conversation.archived_at is null
    and (
      conversation.conversation_type = 'internal'
      or (conversation.conversation_type = 'client' and p_can_contact_client)
    )
  on conflict (conversation_id, user_id) do update
  set joined_at = now(), left_at = null;

  insert into public.notifications (
    recipient_id,
    notification_type,
    title,
    body,
    data
  )
  values (
    target_profile.id,
    'estate_project_assignment',
    'تمت إضافتك إلى مشروع تركة',
    project_row.name,
    jsonb_build_object(
      'project_id', project_row.id,
      'membership_role', p_membership_role
    )
  );
end;
$$;

create or replace function public.remove_estate_project_member(
  p_estate_project_id uuid,
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
begin
  select * into project_row
  from public.projects
  where id = p_estate_project_id
    and project_type = 'estate'
    and deleted_at is null;

  if not found then
    raise exception 'Estate project was not found';
  end if;
  if not private.has_permission('projects.manage_members')
    or not private.can_access_project(project_row.id)
  then
    raise exception 'The current user cannot manage estate project members';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A removal reason is required';
  end if;
  if p_user_id in (project_row.project_manager_id, project_row.primary_assignee_id) then
    raise exception 'Project manager and primary assignee cannot be removed here';
  end if;
  if p_user_id = actor_id and not private.has_permission('system.override') then
    raise exception 'Users cannot remove their own estate membership';
  end if;

  update public.project_members member
  set left_at = now()
  from public.projects scoped_project
  where member.project_id = scoped_project.id
    and member.user_id = p_user_id
    and member.left_at is null
    and (
      scoped_project.id = project_row.id
      or scoped_project.parent_project_id = project_row.id
    );

  update public.project_team_members team_member
  set left_at = now()
  from public.project_teams team
  where team_member.project_team_id = team.id
    and team_member.user_id = p_user_id
    and team_member.left_at is null
    and team.project_id = project_row.id;

  update public.conversation_participants participant
  set left_at = now()
  from public.conversations conversation, public.projects scoped_project
  where participant.conversation_id = conversation.id
    and conversation.project_id = scoped_project.id
    and participant.user_id = p_user_id
    and participant.left_at is null
    and (
      scoped_project.id = project_row.id
      or scoped_project.parent_project_id = project_row.id
    );

  insert into private.audit_logs (
    actor_user_id,
    action,
    entity_schema,
    entity_table,
    entity_id,
    new_data
  )
  values (
    actor_id,
    'estate_member_removed',
    'public',
    'project_members',
    p_estate_project_id::text,
    jsonb_build_object('user_id', p_user_id, 'reason', trim(p_reason))
  );
end;
$$;

create or replace function public.create_estate_litigation_subproject(
  p_estate_project_id uuid,
  p_name text,
  p_category_id uuid,
  p_project_manager_id uuid,
  p_primary_assignee_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  estate_project public.projects;
  litigation_department_id uuid;
  new_project_id uuid;
  client_profile_id uuid;
  client_channel_id uuid;
  internal_channel_id uuid;
begin
  select * into estate_project
  from public.projects
  where id = p_estate_project_id
    and project_type = 'estate'
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Estate project was not found';
  end if;
  if not private.has_permission('estates.manage')
    or not private.can_access_project(estate_project.id)
  then
    raise exception 'The current user cannot refer estate litigation';
  end if;
  if length(trim(coalesce(p_name, ''))) < 3 then
    raise exception 'Estate litigation title is required';
  end if;
  if not exists (
    select 1
    from public.litigation_case_categories category
    where category.id = p_category_id and category.is_active
  ) then
    raise exception 'An active litigation specialty is required';
  end if;

  select department.id into litigation_department_id
  from public.departments department
  where department.organization_id = estate_project.organization_id
    and department.code = 'litigation'
    and department.is_active;

  if litigation_department_id is null then
    raise exception 'Litigation department was not found';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_project_manager_id
      and profile.department_id = litigation_department_id
      and profile.activation_status = 'active_staff'
      and profile.is_active
      and profile.deleted_at is null
      and private.user_has_permission(profile.id, 'litigation.manage_cases')
  ) then
    raise exception 'An active litigation manager is required';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_primary_assignee_id
      and profile.department_id = litigation_department_id
      and profile.activation_status = 'active_staff'
      and profile.is_active
      and profile.deleted_at is null
      and private.user_has_permission(profile.id, 'litigation.actions.respond')
  ) then
    raise exception 'An eligible litigation assignee is required';
  end if;

  insert into public.projects (
    organization_id,
    client_id,
    name,
    project_type,
    status,
    client_stage_label,
    primary_client_contact_user_id,
    department_id,
    parent_project_id,
    project_manager_id,
    primary_assignee_id,
    project_number,
    litigation_case_category_id,
    needs_category_review
  )
  values (
    estate_project.organization_id,
    estate_project.client_id,
    trim(p_name),
    'estate_litigation',
    'active',
    'بدء تقاضي التركة',
    p_project_manager_id,
    litigation_department_id,
    estate_project.id,
    p_project_manager_id,
    p_primary_assignee_id,
    private.next_operation_number(estate_project.organization_id, 'ELT'),
    p_category_id,
    false
  )
  returning id into new_project_id;

  insert into public.project_members (
    project_id,
    user_id,
    membership_role,
    can_contact_client,
    assigned_by
  )
  select new_project_id, participant.user_id, participant.membership_role,
    participant.can_contact_client, actor_id
  from (
    select distinct on (candidate.user_id)
      candidate.user_id,
      candidate.membership_role,
      candidate.can_contact_client
    from (
      values
        (p_project_manager_id, 'department_manager'::text, true, 1),
        (p_primary_assignee_id, 'executor'::text, true, 2),
        (actor_id, 'referring_manager'::text, false, 3)
    ) candidate(user_id, membership_role, can_contact_client, priority)
    where candidate.user_id is not null
    order by candidate.user_id, candidate.priority
  ) participant
  on conflict (project_id, user_id) do update
  set membership_role = excluded.membership_role,
      can_contact_client = excluded.can_contact_client,
      left_at = null;

  insert into public.conversations (
    organization_id,
    project_id,
    conversation_type,
    title,
    channel_key,
    created_by
  )
  values (
    estate_project.organization_id,
    new_project_id,
    'client',
    'محادثة تقاضي التركة',
    'client',
    actor_id
  )
  returning id into client_channel_id;

  insert into public.conversations (
    organization_id,
    project_id,
    conversation_type,
    title,
    channel_key,
    created_by
  )
  values (
    estate_project.organization_id,
    new_project_id,
    'internal',
    'محادثة فريق تقاضي التركة',
    'internal',
    actor_id
  )
  returning id into internal_channel_id;

  select account.profile_id into client_profile_id
  from public.client_accounts account
  where account.client_id = estate_project.client_id
  order by account.created_at
  limit 1;

  insert into public.conversation_participants (conversation_id, user_id)
  select client_channel_id, participant_id
  from (
    select client_profile_id as participant_id
    union select p_project_manager_id
    union select p_primary_assignee_id
  ) participants
  where participant_id is not null
  on conflict do nothing;

  insert into public.conversation_participants (conversation_id, user_id)
  select internal_channel_id, member.user_id
  from public.project_members member
  where member.project_id = new_project_id and member.left_at is null
  on conflict do nothing;

  perform public.start_project_operational_workflow(new_project_id);

  insert into public.notifications (
    recipient_id,
    notification_type,
    title,
    body,
    data
  )
  select
    participant_id,
    'estate_litigation_referral',
    'إحالة نزاع تركة جديد',
    trim(p_name),
    jsonb_build_object(
      'project_id', new_project_id,
      'estate_project_id', estate_project.id
    )
  from (
    select p_project_manager_id as participant_id
    union select p_primary_assignee_id
  ) participants;

  return new_project_id;
end;
$$;

create or replace function public.create_estate_asset_subproject(
  p_estate_project_id uuid,
  p_asset_type text,
  p_name text,
  p_description text default null
)
returns table (estate_asset_id uuid, asset_project_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  estate_project public.projects;
  new_asset_id uuid;
  new_project_id uuid;
  client_channel_id uuid;
  internal_channel_id uuid;
begin
  select * into estate_project
  from public.projects
  where id = p_estate_project_id
    and project_type = 'estate'
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Estate project was not found';
  end if;
  if not private.has_permission('estates.manage_assets')
    or not private.can_access_project(estate_project.id)
  then
    raise exception 'The current user cannot create estate asset projects';
  end if;
  if p_asset_type not in (
    'real_estate', 'vehicle', 'bank_account', 'investment_portfolio',
    'commercial_register', 'movable', 'cash', 'debt', 'litigation'
  ) then
    raise exception 'Unsupported estate asset type';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Asset name is required';
  end if;

  insert into public.estate_assets (
    project_id,
    asset_type,
    name,
    description,
    current_stage,
    status
  )
  values (
    estate_project.id,
    p_asset_type,
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    'preparation',
    'active'
  )
  returning id into new_asset_id;

  insert into public.projects (
    organization_id,
    client_id,
    name,
    project_type,
    status,
    client_stage_label,
    primary_client_contact_user_id,
    department_id,
    parent_project_id,
    estate_asset_id,
    project_manager_id,
    primary_assignee_id,
    project_number
  )
  values (
    estate_project.organization_id,
    estate_project.client_id,
    estate_project.name || ' - ' || trim(p_name),
    'estate_asset',
    'active',
    'تهيئة الأصل',
    estate_project.primary_client_contact_user_id,
    estate_project.department_id,
    estate_project.id,
    new_asset_id,
    estate_project.project_manager_id,
    estate_project.primary_assignee_id,
    private.next_operation_number(estate_project.organization_id, 'AST')
  )
  returning id into new_project_id;

  update public.estate_assets
  set asset_project_id = new_project_id, updated_at = now()
  where id = new_asset_id;

  insert into public.project_members (
    project_id,
    user_id,
    membership_role,
    can_contact_client,
    assigned_by
  )
  select
    new_project_id,
    member.user_id,
    member.membership_role,
    member.can_contact_client,
    actor_id
  from public.project_members member
  where member.project_id = estate_project.id
    and member.left_at is null
  on conflict do nothing;

  insert into public.conversations (
    organization_id,
    project_id,
    conversation_type,
    title,
    channel_key,
    created_by
  )
  values (
    estate_project.organization_id,
    new_project_id,
    'client',
    'محادثة الأصل مع العميل',
    'client',
    actor_id
  )
  returning id into client_channel_id;

  insert into public.conversations (
    organization_id,
    project_id,
    conversation_type,
    title,
    channel_key,
    created_by
  )
  values (
    estate_project.organization_id,
    new_project_id,
    'internal',
    'محادثة فريق الأصل',
    'internal',
    actor_id
  )
  returning id into internal_channel_id;

  insert into public.conversation_participants (conversation_id, user_id)
  select internal_channel_id, member.user_id
  from public.project_members member
  where member.project_id = new_project_id and member.left_at is null
  on conflict do nothing;

  insert into public.conversation_participants (conversation_id, user_id)
  select client_channel_id, participant_id
  from (
    select account.profile_id as participant_id
    from public.client_accounts account
    where account.client_id = estate_project.client_id
    union
    select member.user_id
    from public.project_members member
    where member.project_id = new_project_id
      and member.left_at is null
      and member.can_contact_client
  ) participants
  where participant_id is not null
  on conflict do nothing;

  perform public.start_project_operational_workflow(new_project_id);

  return query select new_asset_id, new_project_id;
end;
$$;

revoke all on function private.ensure_estate_report_schedule()
from public, anon, authenticated;

revoke all on function public.upsert_estate_party_bank_account(uuid, text, text, uuid)
from public, anon;
revoke all on function public.verify_estate_party_bank_account(uuid, boolean)
from public, anon;
revoke all on function public.record_estate_party_decision(uuid, text, text, uuid, text, text, uuid)
from public, anon;
revoke all on function public.record_estate_financial_entry(uuid, text, numeric, text, date, text, uuid, uuid, uuid)
from public, anon;
revoke all on function public.review_estate_financial_entry(uuid, text, text)
from public, anon;
revoke all on function public.create_estate_periodic_report(uuid, date, text)
from public, anon;
revoke all on function public.transition_estate_report(uuid, text, text)
from public, anon;
revoke all on function public.get_my_client_estate_reports(uuid)
from public, anon;
revoke all on function public.assign_estate_project_member(uuid, uuid, text, boolean)
from public, anon;
revoke all on function public.remove_estate_project_member(uuid, uuid, text)
from public, anon;
revoke all on function public.create_estate_litigation_subproject(uuid, text, uuid, uuid, uuid)
from public, anon;
revoke all on function public.create_estate_asset_subproject(uuid, text, text, text)
from public, anon;

grant execute on function public.upsert_estate_party_bank_account(uuid, text, text, uuid)
to authenticated;
grant execute on function public.verify_estate_party_bank_account(uuid, boolean)
to authenticated;
grant execute on function public.record_estate_party_decision(uuid, text, text, uuid, text, text, uuid)
to authenticated;
grant execute on function public.record_estate_financial_entry(uuid, text, numeric, text, date, text, uuid, uuid, uuid)
to authenticated;
grant execute on function public.review_estate_financial_entry(uuid, text, text)
to authenticated;
grant execute on function public.create_estate_periodic_report(uuid, date, text)
to authenticated;
grant execute on function public.transition_estate_report(uuid, text, text)
to authenticated;
grant execute on function public.get_my_client_estate_reports(uuid)
to authenticated;
grant execute on function public.assign_estate_project_member(uuid, uuid, text, boolean)
to authenticated;
grant execute on function public.remove_estate_project_member(uuid, uuid, text)
to authenticated;
grant execute on function public.create_estate_litigation_subproject(uuid, text, uuid, uuid, uuid)
to authenticated;
grant execute on function public.create_estate_asset_subproject(uuid, text, text, text)
to authenticated;
