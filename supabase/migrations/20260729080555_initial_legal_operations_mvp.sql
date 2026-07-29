create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.job_titles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  code text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete restrict,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null,
  phone text,
  account_kind text not null check (account_kind in ('staff', 'client')),
  activation_status text not null check (
    activation_status in ('pending_staff_approval', 'active_staff', 'rejected_staff', 'client_waiting', 'active_client', 'disabled')
  ),
  department_id uuid references public.departments(id) on delete restrict,
  job_title_id uuid references public.job_titles(id) on delete restrict,
  is_active boolean not null default true,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  deletion_reason text,
  retention_status text not null default 'retained' check (retention_status in ('retained', 'archived', 'legal_hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_registration_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  requested_department_text text,
  requested_job_title_text text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete restrict,
  primary key (user_id, role_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null,
  primary_contact_name text,
  primary_contact_phone text,
  status text not null default 'lead' check (status in ('lead', 'active', 'inactive')),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_accounts (
  client_id uuid not null references public.clients(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  linked_at timestamptz not null default now(),
  linked_by uuid references public.profiles(id) on delete restrict,
  is_primary boolean not null default true,
  primary key (client_id, profile_id)
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  request_type text not null check (request_type in ('litigation', 'estate', 'consultation', 'other')),
  title text not null,
  summary text,
  status text not null default 'received',
  visibility text not null default 'internal' check (visibility in ('internal', 'client_visible', 'requires_client_action')),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  deletion_reason text,
  retention_status text not null default 'retained' check (retention_status in ('retained', 'archived', 'legal_hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete restrict,
  name text not null,
  project_type text not null check (project_type in ('litigation', 'estate', 'consultation', 'other')),
  status text not null default 'active' check (status in ('active', 'on_hold', 'completed', 'archived')),
  client_stage_label text,
  primary_client_contact_user_id uuid references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  deletion_reason text,
  retention_status text not null default 'retained' check (retention_status in ('retained', 'archived', 'legal_hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  membership_role text not null,
  can_contact_client boolean not null default false,
  joined_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete restrict,
  left_at timestamptz,
  primary key (project_id, user_id)
);

create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  slug text not null,
  workflow_type text not null check (workflow_type in ('pre_contract', 'litigation', 'estate', 'estate_asset', 'financial', 'closing')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.workflow_template_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_template_id uuid not null references public.workflow_templates(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  transition_dsl jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workflow_template_id, version_number)
);

create unique index workflow_template_one_published_version
  on public.workflow_template_versions (workflow_template_id)
  where status = 'published';

create table public.workflow_stage_templates (
  id uuid primary key default gen_random_uuid(),
  workflow_template_version_id uuid not null references public.workflow_template_versions(id) on delete restrict,
  code text not null,
  name text not null,
  position integer not null check (position > 0),
  target_duration interval,
  maximum_duration interval,
  is_optional boolean not null default false,
  close_rule text not null default 'required_actions' check (close_rule in ('required_actions', 'manual_approval', 'continuous')),
  created_at timestamptz not null default now(),
  unique (workflow_template_version_id, code),
  unique (workflow_template_version_id, position)
);

create table public.workflow_action_templates (
  id uuid primary key default gen_random_uuid(),
  workflow_stage_template_id uuid not null references public.workflow_stage_templates(id) on delete restrict,
  code text not null,
  name text not null,
  position integer not null check (position > 0),
  planned_duration interval,
  duration_start_rule text not null default 'when_ready' check (duration_start_rule in ('when_stage_starts', 'when_ready', 'when_assigned')),
  is_required boolean not null default true,
  visibility text not null default 'internal' check (visibility in ('internal', 'client_visible', 'requires_client_action')),
  completion_dsl jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workflow_stage_template_id, code),
  unique (workflow_stage_template_id, position)
);

create table public.workflow_action_assignment_rules (
  id uuid primary key default gen_random_uuid(),
  workflow_action_template_id uuid not null references public.workflow_action_templates(id) on delete restrict,
  participant_type text not null check (participant_type in ('responsible', 'executor', 'follower', 'approver')),
  selector_type text not null check (selector_type in ('role', 'job_title', 'project_membership', 'manual')),
  role_id uuid references public.roles(id) on delete restrict,
  job_title_id uuid references public.job_titles(id) on delete restrict,
  project_membership_role text,
  allowed_role_ids uuid[] not null default '{}',
  minimum_participants integer not null default 1 check (minimum_participants >= 0),
  maximum_participants integer not null default 1 check (maximum_participants >= minimum_participants),
  allow_self_assignment boolean not null default false,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  check (
    (selector_type = 'role' and role_id is not null)
    or (selector_type = 'job_title' and job_title_id is not null)
    or (selector_type = 'project_membership' and project_membership_role is not null)
    or selector_type = 'manual'
  ),
  unique (workflow_action_template_id, participant_type, priority)
);

create table public.workflow_action_dependencies (
  action_template_id uuid not null references public.workflow_action_templates(id) on delete restrict,
  depends_on_action_template_id uuid not null references public.workflow_action_templates(id) on delete restrict,
  dependency_type text not null default 'finish_to_start' check (dependency_type in ('finish_to_start', 'finish_to_finish')),
  created_at timestamptz not null default now(),
  primary key (action_template_id, depends_on_action_template_id),
  check (action_template_id <> depends_on_action_template_id)
);

create table public.estate_details (
  project_id uuid primary key references public.projects(id) on delete restrict,
  deceased_name text not null,
  documents_completed_at timestamptz,
  agencies_issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.estate_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  asset_type text not null,
  name text not null,
  description text,
  current_stage text,
  status text not null default 'active' check (status in ('active', 'under_guardianship', 'in_litigation', 'marketed', 'sold', 'distributed', 'closed')),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  deletion_reason text,
  retention_status text not null default 'retained' check (retention_status in ('retained', 'archived', 'legal_hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);

create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  estate_asset_id uuid,
  workflow_template_version_id uuid not null references public.workflow_template_versions(id) on delete restrict,
  name text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'on_hold', 'completed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (estate_asset_id, project_id)
    references public.estate_assets(id, project_id) on delete restrict
);

create table public.workflow_stage_instances (
  id uuid primary key default gen_random_uuid(),
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete restrict,
  stage_template_id uuid not null references public.workflow_stage_templates(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'active', 'overdue', 'completed', 'skipped')),
  target_due_at timestamptz,
  maximum_due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  exception_reason text,
  exception_approved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_instance_id, stage_template_id)
);

create table public.workflow_action_instances (
  id uuid primary key default gen_random_uuid(),
  workflow_stage_instance_id uuid not null references public.workflow_stage_instances(id) on delete restrict,
  action_template_id uuid not null references public.workflow_action_templates(id) on delete restrict,
  status text not null default 'awaiting_assignment' check (
    status in ('awaiting_assignment', 'blocked', 'ready', 'in_progress', 'awaiting_approval', 'returned', 'completed', 'cancelled')
  ),
  planned_duration interval,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  visibility text not null default 'internal' check (visibility in ('internal', 'client_visible', 'requires_client_action')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_stage_instance_id, action_template_id)
);

create table public.workflow_action_participants (
  id uuid primary key default gen_random_uuid(),
  workflow_action_instance_id uuid not null references public.workflow_action_instances(id) on delete restrict,
  participant_type text not null check (participant_type in ('responsible', 'executor', 'follower', 'approver')),
  user_id uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  unassigned_at timestamptz,
  unassigned_by uuid references public.profiles(id) on delete restrict,
  assignment_reason text,
  created_at timestamptz not null default now()
);

create unique index workflow_action_participant_active_unique
  on public.workflow_action_participants (workflow_action_instance_id, participant_type, user_id)
  where unassigned_at is null;

create unique index workflow_action_singleton_participant_unique
  on public.workflow_action_participants (workflow_action_instance_id, participant_type)
  where unassigned_at is null and participant_type in ('responsible', 'follower', 'approver');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete restrict,
  title text not null,
  document_type text not null,
  visibility text not null default 'internal' check (visibility in ('internal', 'client_visible', 'requires_client_action')),
  client_visibility_status text not null default 'draft' check (
    client_visibility_status in ('draft', 'awaiting_approval', 'published', 'withdrawn')
  ),
  published_to_client_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles(id) on delete restrict,
  current_version_number integer not null default 1 check (current_version_number > 0),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  deletion_reason text,
  retention_status text not null default 'retained' check (retention_status in ('retained', 'archived', 'legal_hold')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (client_visibility_status <> 'published')
    or (visibility <> 'internal' and published_to_client_at is not null and published_by is not null)
  )
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  storage_bucket text not null default 'legal-documents',
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  deletion_reason text,
  unique (document_id, version_number)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete restrict,
  conversation_type text not null check (conversation_type in ('internal', 'client')),
  title text not null,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) > 0),
  visibility text not null default 'internal' check (visibility in ('internal', 'client_visible', 'requires_client_action')),
  hidden_at timestamptz,
  hidden_by uuid references public.profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  deletion_reason text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  notification_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  deduplication_key text not null unique,
  notification_type text not null,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table private.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_schema text not null,
  entity_table text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  request_id text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index profiles_organization_status_idx on public.profiles (organization_id, activation_status) where deleted_at is null;
create index profiles_department_idx on public.profiles (department_id) where is_active and deleted_at is null;
create index profiles_job_title_idx on public.profiles (job_title_id) where is_active and deleted_at is null;
create index user_roles_active_user_idx on public.user_roles (user_id) where revoked_at is null;
create index user_roles_active_role_idx on public.user_roles (role_id, user_id) where revoked_at is null;
create index client_accounts_profile_idx on public.client_accounts (profile_id, client_id);
create index service_requests_client_idx on public.service_requests (client_id, created_at desc) where deleted_at is null;
create index projects_client_idx on public.projects (client_id, created_at desc) where deleted_at is null;
create index project_members_user_idx on public.project_members (user_id, project_id) where left_at is null;
create index workflow_stages_version_idx on public.workflow_stage_templates (workflow_template_version_id, position);
create index workflow_actions_stage_idx on public.workflow_action_templates (workflow_stage_template_id, position);
create index assignment_rules_action_idx on public.workflow_action_assignment_rules (workflow_action_template_id, participant_type, priority);
create index workflow_dependencies_parent_idx on public.workflow_action_dependencies (depends_on_action_template_id);
create index estate_assets_project_idx on public.estate_assets (project_id, status) where deleted_at is null;
create index workflow_instances_project_idx on public.workflow_instances (project_id, status);
create index workflow_instances_asset_idx on public.workflow_instances (estate_asset_id, status) where estate_asset_id is not null;
create index workflow_stage_instances_workflow_idx on public.workflow_stage_instances (workflow_instance_id, status);
create index workflow_action_instances_stage_idx on public.workflow_action_instances (workflow_stage_instance_id, status);
create index workflow_participants_user_idx on public.workflow_action_participants (user_id, participant_type) where unassigned_at is null;
create index documents_project_visibility_idx on public.documents (project_id, client_visibility_status) where deleted_at is null;
create index documents_client_visibility_idx on public.documents (client_id, client_visibility_status) where deleted_at is null;
create index document_versions_document_idx on public.document_versions (document_id, version_number desc) where deleted_at is null;
create index conversations_project_idx on public.conversations (project_id, conversation_type) where archived_at is null;
create index conversation_participants_user_idx on public.conversation_participants (user_id, conversation_id) where left_at is null;
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc) where deleted_at is null;
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notification_jobs_due_idx on public.notification_jobs (scheduled_for, id) where status = 'pending';
create index audit_logs_entity_idx on private.audit_logs (entity_schema, entity_table, entity_id, created_at desc);
create index audit_logs_actor_idx on private.audit_logs (actor_user_id, created_at desc);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.has_role(role_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.revoked_at is null
      and r.code = role_code
      and r.is_active
      and p.activation_status = 'active_staff'
      and p.is_active
      and p.deleted_at is null
  );
$$;

create or replace function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_kind = 'staff'
      and p.activation_status = 'active_staff'
      and p.is_active
      and p.deleted_at is null
  );
$$;

create or replace function private.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_role('super_admin')
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = (select auth.uid())
        and pm.left_at is null
    )
    or exists (
      select 1
      from public.projects p
      join public.client_accounts ca on ca.client_id = p.client_id
      where p.id = target_project_id
        and ca.profile_id = (select auth.uid())
        and p.deleted_at is null
    );
$$;

create or replace function private.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.id = (select auth.uid()) and not private.has_role('super_admin') then
    if new.account_kind is distinct from old.account_kind
      or new.activation_status is distinct from old.activation_status
      or new.organization_id is distinct from old.organization_id
      or new.department_id is distinct from old.department_id
      or new.job_title_id is distinct from old.job_title_id
      or new.is_active is distinct from old.is_active
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
    then
      raise exception 'Profile authorization fields cannot be changed by the account owner';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_kind text;
  default_organization_id uuid;
  new_status text;
begin
  registration_kind := coalesce(new.raw_user_meta_data ->> 'registration_kind', 'client');
  if registration_kind not in ('staff', 'client') then
    registration_kind := 'client';
  end if;

  select id into default_organization_id
  from public.organizations
  where is_active
  order by created_at
  limit 1;

  if default_organization_id is null then
    raise exception 'No active organization is configured';
  end if;

  new_status := case
    when registration_kind = 'staff' then 'pending_staff_approval'
    else 'client_waiting'
  end;

  insert into public.profiles (
    id, organization_id, full_name, phone, account_kind, activation_status
  )
  values (
    new.id,
    default_organization_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, 'user'), '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    registration_kind,
    new_status
  )
  on conflict (id) do nothing;

  if registration_kind = 'staff' then
    insert into public.staff_registration_requests (
      organization_id,
      profile_id,
      requested_department_text,
      requested_job_title_text
    )
    values (
      default_organization_id,
      new.id,
      nullif(trim(new.raw_user_meta_data ->> 'requested_department'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'requested_job_title'), '')
    )
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  row_id text;
  organization_value uuid;
begin
  old_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_id := coalesce(new_row ->> 'id', old_row ->> 'id', new_row ->> 'profile_id', old_row ->> 'profile_id');
  organization_value := coalesce(
    nullif(new_row ->> 'organization_id', '')::uuid,
    nullif(old_row ->> 'organization_id', '')::uuid
  );

  insert into private.audit_logs (
    organization_id, actor_user_id, action, entity_schema, entity_table, entity_id, old_data, new_data
  )
  values (
    organization_value, (select auth.uid()), lower(tg_op), tg_table_schema, tg_table_name, row_id, old_row, new_row
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.protect_profile_security_fields() from public, anon, authenticated;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
revoke all on function private.audit_row_change() from public, anon, authenticated;
revoke all on function private.has_role(text) from public, anon;
revoke all on function private.is_active_staff() from public, anon;
revoke all on function private.can_access_project(uuid) from public, anon;
grant execute on function private.has_role(text) to authenticated;
grant execute on function private.is_active_staff() to authenticated;
grant execute on function private.can_access_project(uuid) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'departments', 'job_titles', 'profiles', 'staff_registration_requests',
    'clients', 'service_requests', 'projects', 'workflow_templates', 'estate_details',
    'estate_assets', 'workflow_instances', 'workflow_stage_instances', 'workflow_action_instances',
    'documents', 'conversations'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.touch_updated_at()',
      table_name || '_touch_updated_at',
      table_name
    );
  end loop;
end;
$$;

create trigger profiles_protect_security_fields
before update on public.profiles
for each row execute function private.protect_profile_security_fields();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create trigger audit_profiles after insert or update on public.profiles
for each row execute function private.audit_row_change();
create trigger audit_staff_requests after insert or update on public.staff_registration_requests
for each row execute function private.audit_row_change();
create trigger audit_user_roles after insert or update on public.user_roles
for each row execute function private.audit_row_change();
create trigger audit_workflow_participants after insert or update on public.workflow_action_participants
for each row execute function private.audit_row_change();
create trigger audit_documents after insert or update on public.documents
for each row execute function private.audit_row_change();

insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'منصة العمليات القانونية', 'legal-operations')
on conflict (slug) do nothing;

insert into public.departments (organization_id, name, code)
values
  ('00000000-0000-0000-0000-000000000001', 'إدارة العملاء الجدد', 'new_clients'),
  ('00000000-0000-0000-0000-000000000001', 'إدارة التقاضي', 'litigation'),
  ('00000000-0000-0000-0000-000000000001', 'إدارة التركات', 'estates'),
  ('00000000-0000-0000-0000-000000000001', 'الإدارة المالية', 'finance'),
  ('00000000-0000-0000-0000-000000000001', 'الإدارة التنفيذية', 'executive')
on conflict (organization_id, code) do nothing;

insert into public.job_titles (organization_id, department_id, name, code)
select
  '00000000-0000-0000-0000-000000000001',
  d.id,
  values_list.name,
  values_list.code
from (
  values
    ('new_clients', 'مدير إدارة العملاء الجدد', 'new_clients_manager'),
    ('litigation', 'مدير إدارة التقاضي', 'litigation_manager'),
    ('litigation', 'سكرتير إدارة التقاضي', 'litigation_secretary'),
    ('litigation', 'محام', 'lawyer'),
    ('litigation', 'أخصائي قانوني', 'legal_specialist'),
    ('estates', 'مدير إدارة التركات', 'estates_manager'),
    ('estates', 'سكرتير إدارة التركات', 'estates_secretary'),
    ('finance', 'محاسب مالي', 'accountant'),
    ('executive', 'مدير تنفيذي', 'executive_manager')
) as values_list(department_code, name, code)
join public.departments d on d.code = values_list.department_code
where d.organization_id = '00000000-0000-0000-0000-000000000001'
on conflict (organization_id, code) do nothing;

insert into public.roles (organization_id, name, code, is_system)
values
  ('00000000-0000-0000-0000-000000000001', 'مدير النظام', 'super_admin', true),
  ('00000000-0000-0000-0000-000000000001', 'مدير العملاء الجدد', 'new_clients_manager', true),
  ('00000000-0000-0000-0000-000000000001', 'مدير التقاضي', 'litigation_manager', true),
  ('00000000-0000-0000-0000-000000000001', 'سكرتير التقاضي', 'litigation_secretary', true),
  ('00000000-0000-0000-0000-000000000001', 'محام', 'lawyer', true),
  ('00000000-0000-0000-0000-000000000001', 'أخصائي قانوني', 'legal_specialist', true),
  ('00000000-0000-0000-0000-000000000001', 'مدير التركات', 'estates_manager', true),
  ('00000000-0000-0000-0000-000000000001', 'سكرتير التركات', 'estates_secretary', true),
  ('00000000-0000-0000-0000-000000000001', 'محاسب مالي', 'accountant', true),
  ('00000000-0000-0000-0000-000000000001', 'مدير تنفيذي', 'executive_manager', true)
on conflict (organization_id, code) do nothing;

insert into public.permissions (code, description)
values
  ('staff.approve', 'تفعيل الموظفين وتحديد إداراتهم ومسمياتهم'),
  ('roles.assign', 'إسناد الأدوار وسحبها'),
  ('workflow.manage', 'إنشاء وتشغيل وإسناد إجراءات سير العمل'),
  ('documents.publish', 'نشر المستندات إلى العميل وسحبها'),
  ('audit.read', 'قراءة سجل التدقيق')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'super_admin'
  and r.organization_id = '00000000-0000-0000-0000-000000000001'
on conflict do nothing;

with template_row as (
  insert into public.workflow_templates (organization_id, name, slug, workflow_type)
  values ('00000000-0000-0000-0000-000000000001', 'المسار التجريبي لما قبل التعاقد', 'pre-contract-pilot', 'pre_contract')
  on conflict (organization_id, slug) do update set name = excluded.name
  returning id
), version_row as (
  insert into public.workflow_template_versions (workflow_template_id, version_number, status, published_at)
  select id, 1, 'published', now() from template_row
  on conflict (workflow_template_id, version_number) do update set status = excluded.status
  returning id
), stage_row as (
  insert into public.workflow_stage_templates (workflow_template_version_id, code, name, position, target_duration)
  select id, 'study', 'دراسة الطلب', 1, interval '5 days' from version_row
  returning id
), action_row as (
  insert into public.workflow_action_templates (
    workflow_stage_template_id, code, name, position, planned_duration, duration_start_rule
  )
  select id, 'prepare_study', 'إعداد دراسة الطلب', 1, interval '3 days', 'when_assigned' from stage_row
  returning id
)
insert into public.workflow_action_assignment_rules (
  workflow_action_template_id, participant_type, selector_type, role_id, priority
)
select
  a.id,
  rules.participant_type,
  'role',
  r.id,
  rules.priority
from action_row a
cross join (
  values
    ('responsible', 'new_clients_manager', 10),
    ('executor', 'legal_specialist', 20),
    ('follower', 'new_clients_manager', 30),
    ('approver', 'litigation_manager', 40)
) as rules(participant_type, role_code, priority)
join public.roles r on r.code = rules.role_code
  and r.organization_id = '00000000-0000-0000-0000-000000000001';

with template_row as (
  insert into public.workflow_templates (organization_id, name, slug, workflow_type)
  values ('00000000-0000-0000-0000-000000000001', 'المسار التجريبي للتقاضي', 'litigation-pilot', 'litigation')
  on conflict (organization_id, slug) do update set name = excluded.name
  returning id
), version_row as (
  insert into public.workflow_template_versions (workflow_template_id, version_number, status, published_at)
  select id, 1, 'published', now() from template_row
  on conflict (workflow_template_id, version_number) do update set status = excluded.status
  returning id
), stage_row as (
  insert into public.workflow_stage_templates (workflow_template_version_id, code, name, position, target_duration)
  select id, 'case_start', 'بدء ملف القضية', 1, interval '3 days' from version_row
  returning id
), action_row as (
  insert into public.workflow_action_templates (
    workflow_stage_template_id, code, name, position, planned_duration, duration_start_rule
  )
  select id, 'register_case', 'تسجيل ومراجعة ملف القضية', 1, interval '2 days', 'when_assigned' from stage_row
  returning id
)
insert into public.workflow_action_assignment_rules (
  workflow_action_template_id, participant_type, selector_type, role_id, priority
)
select
  a.id,
  rules.participant_type,
  'role',
  r.id,
  rules.priority
from action_row a
cross join (
  values
    ('responsible', 'litigation_manager', 10),
    ('executor', 'lawyer', 20),
    ('follower', 'litigation_secretary', 30),
    ('approver', 'litigation_manager', 40)
) as rules(participant_type, role_code, priority)
join public.roles r on r.code = rules.role_code
  and r.organization_id = '00000000-0000-0000-0000-000000000001';

with template_row as (
  insert into public.workflow_templates (organization_id, name, slug, workflow_type)
  values ('00000000-0000-0000-0000-000000000001', 'مسار أصل التركة التجريبي', 'estate-asset-pilot', 'estate_asset')
  on conflict (organization_id, slug) do update set name = excluded.name
  returning id
), version_row as (
  insert into public.workflow_template_versions (workflow_template_id, version_number, status, published_at)
  select id, 1, 'published', now() from template_row
  on conflict (workflow_template_id, version_number) do update set status = excluded.status
  returning id
), inventory_stage as (
  insert into public.workflow_stage_templates (
    workflow_template_version_id, code, name, position, maximum_duration
  )
  select id, 'inventory', 'الحصر والاستعلام', 1, interval '60 days' from version_row
  returning id
), inventory_actions as (
  insert into public.workflow_action_templates (
    workflow_stage_template_id, code, name, position, planned_duration, duration_start_rule
  )
  select inventory_stage.id, actions.code, actions.name, actions.position, actions.duration, 'when_ready'
  from inventory_stage
  cross join (
    values
      ('real_estate_inquiry', 'الاستعلام العقاري', 1, interval '15 days'),
      ('bank_accounts_inquiry', 'الاستعلام عن الحسابات', 2, interval '15 days'),
      ('liability_notice', 'إعلان إبراء الذمة', 3, interval '30 days')
  ) as actions(code, name, position, duration)
  returning id
), marketing_stage as (
  insert into public.workflow_stage_templates (
    workflow_template_version_id, code, name, position, target_duration
  )
  select id, 'marketing', 'التسويق', 2, interval '90 days' from version_row
  returning id
), marketing_action as (
  insert into public.workflow_action_templates (
    workflow_stage_template_id, code, name, position, planned_duration, duration_start_rule
  )
  select id, 'market_asset', 'تسويق الأصل', 1, interval '90 days', 'when_ready' from marketing_stage
  returning id
)
insert into public.workflow_action_assignment_rules (
  workflow_action_template_id, participant_type, selector_type, role_id, minimum_participants, maximum_participants, allow_self_assignment, priority
)
select
  action_ids.id,
  rules.participant_type,
  'role',
  r.id,
  rules.minimum_participants,
  rules.maximum_participants,
  rules.allow_self_assignment,
  rules.priority
from (
  select id from inventory_actions
  union all
  select id from marketing_action
) action_ids
cross join (
  values
    ('responsible', 'estates_manager', 1, 1, true, 10),
    ('executor', 'legal_specialist', 1, 5, true, 20),
    ('follower', 'estates_secretary', 1, 1, true, 30),
    ('approver', 'estates_manager', 1, 1, true, 40)
) as rules(participant_type, role_code, minimum_participants, maximum_participants, allow_self_assignment, priority)
join public.roles r on r.code = rules.role_code
  and r.organization_id = '00000000-0000-0000-0000-000000000001';

insert into public.workflow_action_dependencies (
  action_template_id, depends_on_action_template_id, dependency_type
)
select market.id, inquiry.id, 'finish_to_start'
from public.workflow_action_templates market
join public.workflow_stage_templates market_stage on market_stage.id = market.workflow_stage_template_id
join public.workflow_template_versions version_row on version_row.id = market_stage.workflow_template_version_id
join public.workflow_templates template_row on template_row.id = version_row.workflow_template_id
join public.workflow_stage_templates inventory_stage on inventory_stage.workflow_template_version_id = version_row.id
join public.workflow_action_templates inquiry on inquiry.workflow_stage_template_id = inventory_stage.id
where template_row.slug = 'estate-asset-pilot'
  and market.code = 'market_asset'
  and inquiry.code = 'real_estate_inquiry'
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('legal-documents', 'legal-documents', false, 52428800),
  ('message-attachments', 'message-attachments', false, 26214400),
  ('generated-reports', 'generated-reports', false, 52428800)
on conflict (id) do update set public = false;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'departments', 'job_titles', 'roles', 'permissions', 'role_permissions',
    'profiles', 'staff_registration_requests', 'user_roles', 'clients', 'client_accounts',
    'service_requests', 'projects', 'project_members', 'workflow_templates',
    'workflow_template_versions', 'workflow_stage_templates', 'workflow_action_templates',
    'workflow_action_assignment_rules', 'workflow_action_dependencies', 'estate_details',
    'estate_assets', 'workflow_instances', 'workflow_stage_instances', 'workflow_action_instances',
    'workflow_action_participants', 'documents', 'document_versions', 'conversations',
    'conversation_participants', 'messages', 'notifications', 'notification_jobs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.has_role(''super_admin''))) with check ((select private.has_role(''super_admin'')))',
      table_name || '_super_admin_all',
      table_name
    );
  end loop;
end;
$$;

alter table private.audit_logs enable row level security;
create policy audit_logs_super_admin_select on private.audit_logs
for select to authenticated
using ((select private.has_role('super_admin')));

create policy profiles_select_self on public.profiles
for select to authenticated
using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));
create policy profiles_staff_directory on public.profiles
for select to authenticated
using ((select private.is_active_staff()) and account_kind = 'staff' and is_active and deleted_at is null);

create policy staff_requests_select_self on public.staff_registration_requests
for select to authenticated
using (profile_id = (select auth.uid()));

create policy reference_organizations_staff on public.organizations
for select to authenticated
using ((select private.is_active_staff()));
create policy reference_departments_staff on public.departments
for select to authenticated
using ((select private.is_active_staff()) and is_active);
create policy reference_job_titles_staff on public.job_titles
for select to authenticated
using ((select private.is_active_staff()) and is_active);
create policy reference_roles_self_or_staff on public.roles
for select to authenticated
using (
  (select private.is_active_staff())
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role_id = roles.id and ur.revoked_at is null
  )
);
create policy user_roles_select_self on public.user_roles
for select to authenticated
using (user_id = (select auth.uid()));

create policy clients_staff_select on public.clients
for select to authenticated
using ((select private.is_active_staff()) and archived_at is null);
create policy clients_account_select on public.clients
for select to authenticated
using (
  exists (
    select 1 from public.client_accounts ca
    where ca.client_id = clients.id and ca.profile_id = (select auth.uid())
  )
);
create policy client_accounts_own_select on public.client_accounts
for select to authenticated
using (profile_id = (select auth.uid()));

create policy service_requests_staff_select on public.service_requests
for select to authenticated
using ((select private.is_active_staff()) and deleted_at is null);
create policy service_requests_client_select on public.service_requests
for select to authenticated
using (
  deleted_at is null
  and (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.client_accounts ca
      where ca.client_id = service_requests.client_id
        and ca.profile_id = (select auth.uid())
    )
  )
  and visibility <> 'internal'
);
create policy service_requests_client_insert on public.service_requests
for insert to authenticated
with check (created_by = (select auth.uid()));

create policy projects_access_select on public.projects
for select to authenticated
using ((select private.can_access_project(id)) and deleted_at is null);
create policy project_members_access_select on public.project_members
for select to authenticated
using ((select private.can_access_project(project_id)));

create policy workflow_templates_staff_select on public.workflow_templates
for select to authenticated
using ((select private.is_active_staff()) and is_active);
create policy workflow_template_versions_staff_select on public.workflow_template_versions
for select to authenticated
using (
  (select private.is_active_staff())
  and (
    status = 'published'
    or exists (
      select 1 from public.workflow_templates wt
      where wt.id = workflow_template_versions.workflow_template_id
        and wt.created_by = (select auth.uid())
    )
  )
);
create policy workflow_stages_staff_select on public.workflow_stage_templates
for select to authenticated
using ((select private.is_active_staff()));
create policy workflow_actions_staff_select on public.workflow_action_templates
for select to authenticated
using ((select private.is_active_staff()));
create policy assignment_rules_staff_select on public.workflow_action_assignment_rules
for select to authenticated
using ((select private.is_active_staff()));
create policy action_dependencies_staff_select on public.workflow_action_dependencies
for select to authenticated
using ((select private.is_active_staff()));

create policy estate_details_project_access on public.estate_details
for select to authenticated
using ((select private.can_access_project(project_id)));
create policy estate_assets_project_access on public.estate_assets
for select to authenticated
using ((select private.can_access_project(project_id)) and deleted_at is null);
create policy workflow_instances_project_access on public.workflow_instances
for select to authenticated
using ((select private.can_access_project(project_id)));
create policy workflow_stage_instances_project_access on public.workflow_stage_instances
for select to authenticated
using (
  exists (
    select 1 from public.workflow_instances wi
    where wi.id = workflow_stage_instances.workflow_instance_id
      and (select private.can_access_project(wi.project_id))
  )
);
create policy workflow_action_instances_project_access on public.workflow_action_instances
for select to authenticated
using (
  exists (
    select 1
    from public.workflow_stage_instances wsi
    join public.workflow_instances wi on wi.id = wsi.workflow_instance_id
    where wsi.id = workflow_action_instances.workflow_stage_instance_id
      and (select private.can_access_project(wi.project_id))
  )
);
create policy workflow_action_participants_project_access on public.workflow_action_participants
for select to authenticated
using (
  exists (
    select 1
    from public.workflow_action_instances wai
    join public.workflow_stage_instances wsi on wsi.id = wai.workflow_stage_instance_id
    join public.workflow_instances wi on wi.id = wsi.workflow_instance_id
    where wai.id = workflow_action_participants.workflow_action_instance_id
      and (select private.can_access_project(wi.project_id))
  )
);

create policy documents_staff_project_select on public.documents
for select to authenticated
using (
  deleted_at is null
  and (
    created_by = (select auth.uid())
    or (project_id is not null and (select private.can_access_project(project_id)) and (select private.is_active_staff()))
  )
);
create policy documents_client_published_select on public.documents
for select to authenticated
using (
  deleted_at is null
  and client_visibility_status = 'published'
  and visibility in ('client_visible', 'requires_client_action')
  and (
    exists (
      select 1 from public.client_accounts ca
      where ca.client_id = documents.client_id
        and ca.profile_id = (select auth.uid())
    )
    or (
      project_id is not null
      and exists (
        select 1
        from public.projects p
        join public.client_accounts ca on ca.client_id = p.client_id
        where p.id = documents.project_id
          and ca.profile_id = (select auth.uid())
      )
    )
  )
);
create policy document_versions_document_select on public.document_versions
for select to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.documents d
    where d.id = document_versions.document_id
  )
);

create policy conversations_participant_select on public.conversations
for select to authenticated
using (
  exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversations.id
      and cp.user_id = (select auth.uid())
      and cp.left_at is null
  )
);
create policy conversation_participants_member_select on public.conversation_participants
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.conversation_participants self_cp
    where self_cp.conversation_id = conversation_participants.conversation_id
      and self_cp.user_id = (select auth.uid())
      and self_cp.left_at is null
  )
);
create policy messages_participant_select on public.messages
for select to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = (select auth.uid())
      and cp.left_at is null
  )
);
create policy messages_participant_insert on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = (select auth.uid())
      and cp.left_at is null
  )
);
create policy notifications_own_select on public.notifications
for select to authenticated
using (recipient_id = (select auth.uid()));
create policy notifications_own_update on public.notifications
for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

create policy storage_legal_documents_select on storage.objects
for select to authenticated
using (
  bucket_id in ('legal-documents', 'message-attachments', 'generated-reports')
  and (
    owner_id = (select auth.uid()::text)
    or exists (
      select 1
      from public.document_versions dv
      join public.documents d on d.id = dv.document_id
      where dv.storage_bucket = storage.objects.bucket_id
        and dv.storage_path = storage.objects.name
    )
  )
);
create policy storage_authenticated_insert on storage.objects
for insert to authenticated
with check (
  bucket_id in ('legal-documents', 'message-attachments')
  and (
    (select private.is_active_staff())
    or (storage.foldername(name))[1] = (select auth.uid()::text)
  )
);

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on private.audit_logs from anon, authenticated;
grant select on private.audit_logs to authenticated;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
