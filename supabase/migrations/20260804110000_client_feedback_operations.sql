-- Client-feedback operations: client intake, dynamic archives, operational tasks,
-- appointments, powers of attorney, and independent estate approvals.

insert into public.permissions (code, description)
values
  ('clients.invite', 'Invite client accounts from the workspace'),
  ('client_sources.manage', 'Manage client source list'),
  ('document_categories.manage', 'Manage dynamic document categories'),
  ('appointments.manage', 'Manage linked appointments'),
  ('powers_of_attorney.manage', 'Manage powers of attorney'),
  ('tasks.propose', 'Propose operational workflow actions'),
  ('tasks.approve_proposed', 'Approve proposed operational workflow actions'),
  ('estate_approvals.manage', 'Manage independent estate party approvals')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code in (
  'clients.invite',
  'client_sources.manage',
  'document_categories.manage',
  'appointments.manage',
  'powers_of_attorney.manage',
  'tasks.propose',
  'tasks.approve_proposed',
  'estate_approvals.manage'
)
where role.code = 'super_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = any (
  case role.code
    when 'new_clients_manager' then array[
      'clients.invite', 'client_sources.manage', 'document_categories.manage',
      'appointments.manage', 'powers_of_attorney.manage'
    ]
    when 'litigation_manager' then array[
      'document_categories.manage', 'appointments.manage',
      'powers_of_attorney.manage', 'tasks.approve_proposed'
    ]
    when 'litigation_secretary' then array[
      'document_categories.manage', 'appointments.manage',
      'powers_of_attorney.manage', 'tasks.approve_proposed'
    ]
    when 'estates_manager' then array[
      'document_categories.manage', 'appointments.manage', 'powers_of_attorney.manage',
      'tasks.approve_proposed', 'estate_approvals.manage'
    ]
    when 'estates_secretary' then array[
      'document_categories.manage', 'appointments.manage', 'powers_of_attorney.manage',
      'tasks.approve_proposed', 'estate_approvals.manage'
    ]
    when 'lawyer' then array['tasks.propose']
    when 'legal_specialist' then array['tasks.propose']
    when 'accountant' then array['tasks.propose']
    else array[]::text[]
  end
)
on conflict do nothing;

alter table public.clients
  add column if not exists primary_contact_email text,
  add column if not exists source_id uuid;

create table if not exists public.client_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

alter table public.clients
  add constraint clients_source_id_fkey
  foreign key (source_id) references public.client_sources(id) on delete restrict;

alter table public.service_requests
  add column if not exists client_source_id uuid references public.client_sources(id) on delete restrict;

create index if not exists clients_source_idx on public.clients(source_id);
create index if not exists service_requests_client_source_idx on public.service_requests(client_source_id);

insert into public.client_sources (organization_id, code, name, sort_order)
select organization.id, seed.code, seed.name, seed.sort_order
from public.organizations organization
cross join (
  values
    ('whatsapp', 'WhatsApp', 10),
    ('tiktok', 'TikTok', 20),
    ('referral', 'Referral', 30),
    ('lawyer', 'Lawyer', 40),
    ('visit', 'Office visit', 50),
    ('other', 'Other', 100)
) as seed(code, name, sort_order)
on conflict (organization_id, code) do nothing;

create table if not exists public.document_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  scope text not null default 'all' check (scope in ('all', 'client', 'request', 'project')),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

alter table public.documents
  add column if not exists document_category_id uuid references public.document_categories(id) on delete restrict,
  add column if not exists document_number text,
  add column if not exists document_date date,
  add column if not exists description text,
  add column if not exists page_count integer check (page_count is null or page_count > 0);

create index if not exists documents_category_idx on public.documents(document_category_id);
create index if not exists documents_document_date_idx on public.documents(document_date);

insert into public.document_categories (organization_id, code, name, scope, sort_order)
select organization.id, seed.code, seed.name, seed.scope, seed.sort_order
from public.organizations organization
cross join (
  values
    ('client_attachment', 'Client attachment', 'all', 10),
    ('identity', 'Identity', 'all', 20),
    ('evidence', 'Evidence', 'all', 30),
    ('study', 'Legal study', 'request', 40),
    ('technical_financial_offer', 'Technical and financial offer', 'request', 50),
    ('contract', 'Contract', 'request', 60),
    ('power_of_attorney', 'Power of attorney', 'all', 70),
    ('estate_declaration', 'Estate declaration', 'project', 80),
    ('correspondence', 'Correspondence', 'all', 90),
    ('other', 'Other', 'all', 100)
) as seed(code, name, scope, sort_order)
on conflict (organization_id, code) do nothing;

create table if not exists public.workflow_action_updates (
  id uuid primary key default gen_random_uuid(),
  workflow_action_instance_id uuid not null references public.workflow_action_instances(id) on delete restrict,
  update_type text not null default 'note' check (
    update_type in ('note', 'progress', 'extension_request', 'extension_approved', 'extension_rejected')
  ),
  progress_percent integer check (progress_percent is null or progress_percent between 0 and 100),
  notes text,
  requested_due_at timestamptz,
  status text not null default 'recorded' check (status in ('recorded', 'pending', 'approved', 'rejected')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists workflow_action_updates_action_idx
  on public.workflow_action_updates(workflow_action_instance_id, created_at desc);

create table if not exists public.proposed_workflow_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  workflow_stage_instance_id uuid references public.workflow_stage_instances(id) on delete restrict,
  title text not null,
  description text,
  proposed_due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  proposed_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text,
  created_action_instance_id uuid references public.workflow_action_instances(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposed_workflow_actions_project_idx
  on public.proposed_workflow_actions(project_id, status, created_at desc);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (client_id is not null or service_request_id is not null or project_id is not null)
);

create table if not exists public.appointment_participants (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  participant_user_id uuid references public.profiles(id) on delete restrict,
  participant_name text,
  participant_email text,
  participant_role text not null default 'attendee',
  notify_before_day boolean not null default true,
  notify_same_day boolean not null default true,
  created_at timestamptz not null default now(),
  check (participant_user_id is not null or participant_email is not null or participant_name is not null)
);

create index if not exists appointments_project_idx on public.appointments(project_id, starts_at);
create index if not exists appointments_request_idx on public.appointments(service_request_id, starts_at);
create index if not exists appointment_participants_user_idx on public.appointment_participants(participant_user_id);

create table if not exists public.powers_of_attorney (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  document_id uuid references public.documents(id) on delete restrict,
  power_number text not null,
  issued_on date,
  expires_on date,
  status text not null default 'active' check (status in ('draft', 'active', 'expired', 'cancelled', 'archived')),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id is not null or service_request_id is not null or project_id is not null)
);

create index if not exists powers_of_attorney_expiry_idx
  on public.powers_of_attorney(expires_on) where status = 'active';

create table if not exists public.estate_party_approval_requests (
  id uuid primary key default gen_random_uuid(),
  estate_project_id uuid not null references public.projects(id) on delete restrict,
  estate_asset_id uuid references public.estate_assets(id) on delete restrict,
  subject_type text not null default 'general' check (subject_type in ('general', 'asset', 'distribution', 'settlement')),
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'open' check (status in ('draft', 'open', 'closed', 'cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estate_party_approval_responses (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.estate_party_approval_requests(id) on delete cascade,
  estate_party_id uuid not null references public.estate_parties(id) on delete restrict,
  responder_profile_id uuid references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  notes text,
  evidence_document_id uuid references public.documents(id) on delete restrict,
  responded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (approval_request_id, estate_party_id)
);

create index if not exists estate_party_approval_requests_project_idx
  on public.estate_party_approval_requests(estate_project_id, status, created_at desc);
create index if not exists estate_party_approval_responses_party_idx
  on public.estate_party_approval_responses(estate_party_id, responded_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'client_sources', 'document_categories', 'workflow_action_updates',
    'proposed_workflow_actions', 'appointments', 'appointment_participants',
    'powers_of_attorney', 'estate_party_approval_requests',
    'estate_party_approval_responses'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format(
      'drop trigger if exists %I on public.%I',
      table_name || '_touch_updated_at',
      table_name
    );
    if table_name not in ('appointment_participants', 'workflow_action_updates', 'estate_party_approval_responses') then
      execute format(
        'create trigger %I before update on public.%I for each row execute function private.touch_updated_at()',
        table_name || '_touch_updated_at',
        table_name
      );
    end if;
    execute format(
      'drop trigger if exists %I on public.%I',
      'audit_' || table_name,
      table_name
    );
    execute format(
      'create trigger %I after insert or update on public.%I for each row execute function private.audit_row_change()',
      'audit_' || table_name,
      table_name
    );
  end loop;
end;
$$;

create policy client_sources_staff_select on public.client_sources
for select to authenticated using (
  (select private.is_active_staff()) and organization_id = (select organization_id from public.profiles where id = (select auth.uid()))
);

create policy document_categories_staff_select on public.document_categories
for select to authenticated using (
  (select private.is_active_staff()) and organization_id = (select organization_id from public.profiles where id = (select auth.uid()))
);

create policy workflow_action_updates_access_select on public.workflow_action_updates
for select to authenticated using (
  exists (
    select 1
    from public.workflow_action_instances action
    join public.workflow_stage_instances stage on stage.id = action.workflow_stage_instance_id
    join public.workflow_instances workflow on workflow.id = stage.workflow_instance_id
    where action.id = workflow_action_updates.workflow_action_instance_id
      and (
        (workflow.project_id is not null and (select private.can_access_project(workflow.project_id)))
        or (workflow.service_request_id is not null and (select private.can_manage_pre_contract(workflow.service_request_id)))
      )
  )
);

create policy proposed_workflow_actions_access_select on public.proposed_workflow_actions
for select to authenticated using ((select private.can_access_project(project_id)));

create policy appointments_access_select on public.appointments
for select to authenticated using (
  (
    (select private.is_active_staff())
    and (
      (project_id is not null and (select private.can_access_project(project_id)))
      or (service_request_id is not null and (select private.can_manage_pre_contract(service_request_id)))
      or (client_id is not null and (select private.has_permission('clients.read')))
    )
  )
  or exists (
    select 1 from public.appointment_participants participant
    where participant.appointment_id = appointments.id
      and participant.participant_user_id = (select auth.uid())
  )
);

create policy appointment_participants_access_select on public.appointment_participants
for select to authenticated using (
  participant_user_id = (select auth.uid())
  or exists (
    select 1 from public.appointments appointment
    where appointment.id = appointment_participants.appointment_id
      and (
        (appointment.project_id is not null and (select private.can_access_project(appointment.project_id)))
        or (appointment.service_request_id is not null and (select private.can_manage_pre_contract(appointment.service_request_id)))
        or (appointment.client_id is not null and (select private.has_permission('clients.read')))
      )
  )
);

create policy powers_of_attorney_access_select on public.powers_of_attorney
for select to authenticated using (
  (
    (select private.is_active_staff())
    and (
      (project_id is not null and (select private.can_access_project(project_id)))
      or (service_request_id is not null and (select private.can_manage_pre_contract(service_request_id)))
      or (client_id is not null and (select private.has_permission('clients.read')))
    )
  )
  or exists (
    select 1 from public.client_accounts account
    where account.client_id = powers_of_attorney.client_id
      and account.profile_id = (select auth.uid())
  )
);

create policy estate_party_approval_requests_access_select on public.estate_party_approval_requests
for select to authenticated using (
  (select private.can_access_project(estate_project_id))
  or exists (
    select 1 from public.estate_parties party
    where party.estate_project_id = estate_party_approval_requests.estate_project_id
      and party.linked_profile_id = (select auth.uid())
  )
);

create policy estate_party_approval_responses_access_select on public.estate_party_approval_responses
for select to authenticated using (
  exists (
    select 1
    from public.estate_party_approval_requests request
    where request.id = estate_party_approval_responses.approval_request_id
      and (
        (select private.can_access_project(request.estate_project_id))
        or exists (
          select 1 from public.estate_parties party
          where party.estate_project_id = request.estate_project_id
            and party.linked_profile_id = (select auth.uid())
        )
      )
  )
);

create or replace function public.manage_client_source(
  p_source_id uuid,
  p_code text,
  p_name text,
  p_sort_order integer default 100,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_org_id uuid;
  source_id_value uuid;
begin
  if not private.has_permission('client_sources.manage') then
    raise exception 'The current user cannot manage client sources';
  end if;

  select organization_id into actor_org_id from public.profiles where id = actor_id;
  if actor_org_id is null then raise exception 'Profile was not found'; end if;

  if length(trim(coalesce(p_code, ''))) < 2 or length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Source code and name are required';
  end if;

  if p_source_id is null then
    insert into public.client_sources (
      organization_id, code, name, sort_order, is_active, created_by, updated_by
    )
    values (
      actor_org_id, lower(regexp_replace(trim(p_code), '[^a-zA-Z0-9_]+', '_', 'g')),
      trim(p_name), coalesce(p_sort_order, 100), coalesce(p_is_active, true), actor_id, actor_id
    )
    returning id into source_id_value;
  else
    update public.client_sources
    set code = lower(regexp_replace(trim(p_code), '[^a-zA-Z0-9_]+', '_', 'g')),
        name = trim(p_name),
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active),
        updated_by = actor_id,
        updated_at = now()
    where id = p_source_id
      and organization_id = actor_org_id
    returning id into source_id_value;
  end if;

  if source_id_value is null then raise exception 'Client source was not found'; end if;
  return source_id_value;
end;
$$;

create or replace function public.register_invited_client_profile(
  p_profile_id uuid,
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_source_id uuid default null
)
returns table (profile_id uuid, client_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_org_id uuid;
  linked_client_id uuid;
begin
  if not private.has_permission('clients.invite') then
    raise exception 'The current user cannot invite clients';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 3 then
    raise exception 'Client name is required';
  end if;

  select organization_id into actor_org_id from public.profiles where id = actor_id;
  if actor_org_id is null then raise exception 'Profile was not found'; end if;

  if p_source_id is not null and not exists (
    select 1 from public.client_sources source
    where source.id = p_source_id
      and source.organization_id = actor_org_id
      and source.is_active
  ) then
    raise exception 'Client source is invalid';
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      account_kind = 'client',
      activation_status = 'client_waiting',
      is_active = true,
      updated_at = now()
  where id = p_profile_id
    and organization_id = actor_org_id
  returning id into profile_id;

  if profile_id is null then
    raise exception 'Client profile was not found after invitation';
  end if;

  select account.client_id into linked_client_id
  from public.client_accounts account
  join public.clients client on client.id = account.client_id
  where account.profile_id = p_profile_id
    and client.organization_id = actor_org_id
  order by account.is_primary desc, account.linked_at
  limit 1;

  if linked_client_id is null then
    insert into public.clients (
      organization_id, display_name, primary_contact_name,
      primary_contact_phone, primary_contact_email, source_id, status
    )
    values (
      actor_org_id, trim(p_full_name), trim(p_full_name),
      nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_email, '')), ''),
      p_source_id, 'lead'
    )
    returning id into linked_client_id;

    insert into public.client_accounts (client_id, profile_id, linked_by, is_primary)
    values (linked_client_id, p_profile_id, actor_id, true)
    on conflict do nothing;
  else
    update public.clients
    set display_name = trim(p_full_name),
        primary_contact_name = trim(p_full_name),
        primary_contact_phone = nullif(trim(coalesce(p_phone, '')), ''),
        primary_contact_email = coalesce(nullif(trim(coalesce(p_email, '')), ''), primary_contact_email),
        source_id = coalesce(p_source_id, source_id),
        updated_at = now()
    where id = linked_client_id;
  end if;

  profile_id := p_profile_id;
  client_id := linked_client_id;
  return next;
end;
$$;

create or replace function public.create_staff_service_request_v3(
  p_client_profile_id uuid,
  p_request_type text,
  p_title text,
  p_summary text,
  p_litigation_case_category_id uuid default null,
  p_client_source_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id_value uuid;
  request_org_id uuid;
begin
  request_id_value := public.create_staff_service_request_v2(
    p_client_profile_id,
    p_request_type,
    p_title,
    p_summary,
    p_litigation_case_category_id
  );

  if p_client_source_id is not null then
    select organization_id into request_org_id
    from public.service_requests
    where id = request_id_value;

    if not exists (
      select 1 from public.client_sources source
      where source.id = p_client_source_id
        and source.organization_id = request_org_id
        and source.is_active
    ) then
      raise exception 'Client source is invalid';
    end if;

    update public.service_requests
    set client_source_id = p_client_source_id,
        updated_at = now()
    where id = request_id_value;

    update public.clients client
    set source_id = coalesce(client.source_id, p_client_source_id),
        updated_at = now()
    from public.service_requests request
    where request.id = request_id_value
      and client.id = request.client_id;
  end if;

  return request_id_value;
end;
$$;

create or replace function public.manage_document_category(
  p_category_id uuid,
  p_code text,
  p_name text,
  p_scope text default 'all',
  p_sort_order integer default 100,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_org_id uuid;
  category_id_value uuid;
begin
  if not private.has_permission('document_categories.manage') then
    raise exception 'The current user cannot manage document categories';
  end if;
  if p_scope not in ('all', 'client', 'request', 'project') then
    raise exception 'Unsupported document category scope';
  end if;
  select organization_id into actor_org_id from public.profiles where id = actor_id;

  if p_category_id is null then
    insert into public.document_categories (
      organization_id, code, name, scope, sort_order, is_active, created_by, updated_by
    )
    values (
      actor_org_id, lower(regexp_replace(trim(p_code), '[^a-zA-Z0-9_]+', '_', 'g')),
      trim(p_name), p_scope, coalesce(p_sort_order, 100), coalesce(p_is_active, true), actor_id, actor_id
    )
    returning id into category_id_value;
  else
    update public.document_categories
    set code = lower(regexp_replace(trim(p_code), '[^a-zA-Z0-9_]+', '_', 'g')),
        name = trim(p_name),
        scope = p_scope,
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active),
        updated_by = actor_id,
        updated_at = now()
    where id = p_category_id
      and organization_id = actor_org_id
    returning id into category_id_value;
  end if;

  if category_id_value is null then raise exception 'Document category was not found'; end if;
  return category_id_value;
end;
$$;

create or replace function public.update_document_metadata(
  p_document_id uuid,
  p_document_category_id uuid default null,
  p_document_number text default null,
  p_document_date date default null,
  p_description text default null,
  p_page_count integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_row public.documents;
begin
  if not private.has_permission('documents.upload') then
    raise exception 'The current user cannot update document metadata';
  end if;

  select * into document_row
  from public.documents
  where id = p_document_id
    and deleted_at is null
  for update;
  if not found then raise exception 'Document was not found'; end if;

  if document_row.service_request_id is not null and not private.can_manage_pre_contract(document_row.service_request_id) then
    raise exception 'The current user cannot update this document';
  end if;
  if document_row.project_id is not null and not private.can_access_project(document_row.project_id) then
    raise exception 'The current user cannot update this document';
  end if;
  if p_document_category_id is not null and not exists (
    select 1 from public.document_categories category
    where category.id = p_document_category_id
      and category.organization_id = document_row.organization_id
      and category.is_active
  ) then
    raise exception 'Document category is invalid';
  end if;

  update public.documents
  set document_category_id = p_document_category_id,
      document_number = nullif(trim(coalesce(p_document_number, '')), ''),
      document_date = p_document_date,
      description = nullif(trim(coalesce(p_description, '')), ''),
      page_count = p_page_count,
      updated_at = now()
  where id = p_document_id;
end;
$$;

create or replace function public.record_workflow_action_update(
  p_workflow_action_instance_id uuid,
  p_update_type text,
  p_progress_percent integer default null,
  p_notes text default null,
  p_requested_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  update_id_value uuid;
begin
  if p_update_type not in ('note', 'progress', 'extension_request') then
    raise exception 'Unsupported update type';
  end if;
  if p_update_type = 'extension_request' and not private.has_permission('tasks.extend') then
    raise exception 'The current user cannot request task extensions';
  end if;
  if p_update_type in ('note', 'progress') and not private.has_permission('tasks.submit') then
    raise exception 'The current user cannot update tasks';
  end if;

  insert into public.workflow_action_updates (
    workflow_action_instance_id, update_type, progress_percent, notes,
    requested_due_at, status, created_by
  )
  values (
    p_workflow_action_instance_id, p_update_type, p_progress_percent, nullif(trim(coalesce(p_notes, '')), ''),
    p_requested_due_at, case when p_update_type = 'extension_request' then 'pending' else 'recorded' end, actor_id
  )
  returning id into update_id_value;

  return update_id_value;
end;
$$;

create or replace function public.propose_workflow_action(
  p_project_id uuid,
  p_workflow_stage_instance_id uuid,
  p_title text,
  p_description text default null,
  p_proposed_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_id_value uuid;
begin
  if not private.has_permission('tasks.propose') then
    raise exception 'The current user cannot propose tasks';
  end if;
  if not private.can_access_project(p_project_id) then
    raise exception 'The current user cannot access this project';
  end if;
  if length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'Task title is required';
  end if;

  insert into public.proposed_workflow_actions (
    project_id, workflow_stage_instance_id, title, description, proposed_due_at, proposed_by
  )
  values (
    p_project_id, p_workflow_stage_instance_id, trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''), p_proposed_due_at, actor_id
  )
  returning id into proposal_id_value;

  return proposal_id_value;
end;
$$;

create or replace function public.review_proposed_workflow_action(
  p_proposed_action_id uuid,
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
  proposal_row public.proposed_workflow_actions;
begin
  if not private.has_permission('tasks.approve_proposed') then
    raise exception 'The current user cannot review proposed tasks';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Unsupported review decision';
  end if;

  select * into proposal_row
  from public.proposed_workflow_actions
  where id = p_proposed_action_id
    and status = 'pending'
  for update;
  if not found then raise exception 'Proposed task was not found'; end if;
  if not private.can_access_project(proposal_row.project_id) then
    raise exception 'The current user cannot access this project';
  end if;

  update public.proposed_workflow_actions
  set status = p_decision,
      reviewed_by = actor_id,
      reviewed_at = now(),
      review_notes = nullif(trim(coalesce(p_review_notes, '')), ''),
      updated_at = now()
  where id = p_proposed_action_id;
end;
$$;

create or replace function public.create_appointment(
  p_client_id uuid,
  p_service_request_id uuid,
  p_project_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_participant_user_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_org_id uuid;
  appointment_id_value uuid;
  participant_id uuid;
begin
  if not private.has_permission('appointments.manage') then
    raise exception 'The current user cannot manage appointments';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'Appointment end time must be after start time';
  end if;
  select organization_id into actor_org_id from public.profiles where id = actor_id;

  insert into public.appointments (
    organization_id, client_id, service_request_id, project_id, title,
    description, starts_at, ends_at, location, created_by, updated_by
  )
  values (
    actor_org_id, p_client_id, p_service_request_id, p_project_id, trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''), p_starts_at, p_ends_at,
    nullif(trim(coalesce(p_location, '')), ''), actor_id, actor_id
  )
  returning id into appointment_id_value;

  insert into public.appointment_participants (
    appointment_id, participant_user_id, participant_role
  )
  values (appointment_id_value, actor_id, 'organizer')
  on conflict do nothing;

  foreach participant_id in array coalesce(p_participant_user_ids, array[]::uuid[])
  loop
    insert into public.appointment_participants (
      appointment_id, participant_user_id, participant_role
    )
    values (appointment_id_value, participant_id, 'attendee');

    insert into public.notification_jobs (
      deduplication_key, notification_type, recipient_id, payload, scheduled_for
    )
    values
      (
        'appointment:' || appointment_id_value::text || ':' || participant_id::text || ':day_before',
        'meeting_reminder',
        participant_id,
        jsonb_build_object('appointment_id', appointment_id_value, 'category', 'meetings'),
        p_starts_at - interval '1 day'
      ),
      (
        'appointment:' || appointment_id_value::text || ':' || participant_id::text || ':same_day',
        'meeting_reminder',
        participant_id,
        jsonb_build_object('appointment_id', appointment_id_value, 'category', 'meetings'),
        date_trunc('day', p_starts_at) + interval '8 hours'
      )
    on conflict (deduplication_key) do nothing;
  end loop;

  return appointment_id_value;
end;
$$;

create or replace function public.create_power_of_attorney(
  p_client_id uuid,
  p_service_request_id uuid,
  p_project_id uuid,
  p_document_id uuid,
  p_power_number text,
  p_issued_on date,
  p_expires_on date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_org_id uuid;
  power_id_value uuid;
begin
  if not private.has_permission('powers_of_attorney.manage') then
    raise exception 'The current user cannot manage powers of attorney';
  end if;
  if length(trim(coalesce(p_power_number, ''))) < 2 then
    raise exception 'Power number is required';
  end if;
  select organization_id into actor_org_id from public.profiles where id = actor_id;

  insert into public.powers_of_attorney (
    organization_id, client_id, service_request_id, project_id, document_id,
    power_number, issued_on, expires_on, status, notes, created_by
  )
  values (
    actor_org_id, p_client_id, p_service_request_id, p_project_id, p_document_id,
    trim(p_power_number), p_issued_on, p_expires_on, 'active',
    nullif(trim(coalesce(p_notes, '')), ''), actor_id
  )
  returning id into power_id_value;

  if p_expires_on is not null then
    insert into public.notification_jobs (
      deduplication_key, notification_type, recipient_id, payload, scheduled_for
    )
    values (
      'power_of_attorney:' || power_id_value::text || ':expiry',
      'power_of_attorney_expiry',
      actor_id,
      jsonb_build_object('power_of_attorney_id', power_id_value, 'category', 'powers_of_attorney'),
      (p_expires_on::timestamptz - interval '14 days')
    )
    on conflict (deduplication_key) do nothing;
  end if;

  return power_id_value;
end;
$$;

create or replace function public.create_estate_party_approval_request(
  p_estate_project_id uuid,
  p_estate_asset_id uuid,
  p_subject_type text,
  p_title text,
  p_description text default null,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_id_value uuid;
begin
  if not private.has_permission('estate_approvals.manage') then
    raise exception 'The current user cannot manage estate approvals';
  end if;
  if not private.can_access_project(p_estate_project_id) then
    raise exception 'The current user cannot access this estate project';
  end if;

  insert into public.estate_party_approval_requests (
    estate_project_id, estate_asset_id, subject_type, title, description, due_at, status, created_by
  )
  values (
    p_estate_project_id, p_estate_asset_id, coalesce(p_subject_type, 'general'),
    trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_due_at, 'open', actor_id
  )
  returning id into request_id_value;

  return request_id_value;
end;
$$;

create or replace function public.respond_estate_party_approval(
  p_approval_request_id uuid,
  p_estate_party_id uuid,
  p_decision text,
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
  request_project_id uuid;
  response_id_value uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Unsupported approval decision';
  end if;

  select request.estate_project_id into request_project_id
  from public.estate_party_approval_requests request
  join public.estate_parties party on party.id = p_estate_party_id
  where request.id = p_approval_request_id
    and request.status = 'open'
    and party.estate_project_id = request.estate_project_id;
  if request_project_id is null then
    raise exception 'Estate approval request or party was not found';
  end if;

  if not private.can_access_project(request_project_id) and not exists (
    select 1
    from public.estate_parties party
    where party.id = p_estate_party_id
      and party.linked_profile_id = actor_id
  ) then
    raise exception 'The current user cannot respond to this estate approval';
  end if;

  insert into public.estate_party_approval_responses (
    approval_request_id, estate_party_id, responder_profile_id, decision, notes, evidence_document_id
  )
  values (
    p_approval_request_id, p_estate_party_id, actor_id, p_decision,
    nullif(trim(coalesce(p_notes, '')), ''), p_evidence_document_id
  )
  on conflict (approval_request_id, estate_party_id)
  do update set
    responder_profile_id = excluded.responder_profile_id,
    decision = excluded.decision,
    notes = excluded.notes,
    evidence_document_id = excluded.evidence_document_id,
    responded_at = now()
  returning id into response_id_value;

  return response_id_value;
end;
$$;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.manage_client_source(uuid, text, text, integer, boolean)',
    'public.register_invited_client_profile(uuid, text, text, text, uuid)',
    'public.create_staff_service_request_v3(uuid, text, text, text, uuid, uuid)',
    'public.manage_document_category(uuid, text, text, text, integer, boolean)',
    'public.update_document_metadata(uuid, uuid, text, date, text, integer)',
    'public.record_workflow_action_update(uuid, text, integer, text, timestamptz)',
    'public.propose_workflow_action(uuid, uuid, text, text, timestamptz)',
    'public.review_proposed_workflow_action(uuid, text, text)',
    'public.create_appointment(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, uuid[])',
    'public.create_power_of_attorney(uuid, uuid, uuid, uuid, text, date, date, text)',
    'public.create_estate_party_approval_request(uuid, uuid, text, text, text, timestamptz)',
    'public.respond_estate_party_approval(uuid, uuid, text, text, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', function_signature);
    execute format('grant execute on function %s to authenticated', function_signature);
  end loop;
end;
$$;
