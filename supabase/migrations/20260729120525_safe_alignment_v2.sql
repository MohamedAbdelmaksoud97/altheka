-- Safe alignment v2: additive schema, PBAC, operational runtime, and reversible backfill.

-- ---------------------------------------------------------------------------
-- Permission-based access control
-- ---------------------------------------------------------------------------

insert into public.permissions (code, description)
values
  ('clients.read', 'قراءة بيانات العملاء ضمن النطاق'),
  ('clients.manage', 'إدارة بيانات العملاء ضمن النطاق'),
  ('requests.create', 'إنشاء طلب خدمة وربطه بعميل'),
  ('requests.link_client', 'ربط طلب الخدمة بحساب العميل'),
  ('requests.manage', 'إدارة طلبات ما قبل التعاقد'),
  ('studies.assign', 'إسناد الدراسة إلى مكلف ومعتمد'),
  ('studies.submit', 'تقديم الدراسة القانونية'),
  ('studies.approve_litigation', 'اعتماد دراسات التقاضي'),
  ('studies.approve_estates', 'اعتماد دراسات التركات'),
  ('offers.create', 'إنشاء إصدار عرض'),
  ('offers.send', 'إرسال العرض للعميل'),
  ('offers.negotiate', 'إدارة التخفيض والتفاوض'),
  ('contracts.create', 'إنشاء وإصدار العقود'),
  ('contracts.send', 'إرسال العقد للعميل'),
  ('contracts.accept', 'تسجيل قبول عقد مصرح'),
  ('contracts.upload_signed', 'رفع وتسجيل نسخة عقد موقعة يدويًا'),
  ('projects.create', 'تحويل الطلب إلى مشروع'),
  ('projects.read_department', 'قراءة مشاريع الإدارة'),
  ('projects.read_all', 'قراءة جميع المشاريع'),
  ('projects.manage_members', 'إدارة عضوية المشروع'),
  ('projects.assign_manager', 'تعيين مدير المشروع'),
  ('projects.assign_primary_assignee', 'تعيين المكلف الرئيسي'),
  ('project_teams.manage', 'إدارة فرق العمل داخل المشروع'),
  ('project_teams.assign', 'إسناد أعضاء فرق المشروع'),
  ('workflow.start', 'بدء Workflow ضمن النطاق'),
  ('workflow.transition', 'تنفيذ انتقالات Workflow'),
  ('workflow.override_transition', 'تجاوز انتقال Workflow بسبب موثق'),
  ('workflow.reopen', 'إعادة فتح مرحلة أو مهمة بسبب موثق'),
  ('tasks.create', 'إنشاء مهمة'),
  ('tasks.assign', 'إسناد مهمة'),
  ('tasks.reassign', 'إعادة إسناد مهمة'),
  ('tasks.submit', 'تقديم نتيجة مهمة'),
  ('tasks.approve', 'اعتماد نتيجة مهمة'),
  ('tasks.return_for_revision', 'إعادة مهمة للتعديل'),
  ('tasks.extend', 'تمديد مهمة بسبب موثق'),
  ('documents.upload', 'رفع مستند أو إصدار جديد'),
  ('documents.read_internal', 'قراءة المستندات الداخلية ضمن النطاق'),
  ('documents.withdraw', 'سحب مستند من بوابة العميل'),
  ('documents.archive', 'أرشفة أو إخفاء مستند منطقيًا'),
  ('messages.client', 'المشاركة في قناة العميل'),
  ('messages.internal', 'المشاركة في القناة الداخلية'),
  ('messages.moderate', 'إخفاء رسالة إداريًا'),
  ('litigation.manage_cases', 'إدارة بيانات القضايا'),
  ('litigation.manage_hearings', 'إدارة الجلسات والمواعيد القضائية'),
  ('litigation.set_next_action', 'تحديد الإجراء القادم للقضية'),
  ('estates.manage', 'إدارة مشروع التركة'),
  ('estates.manage_parties', 'إدارة الورثة والأطراف والأنصبة'),
  ('estates.manage_assets', 'إدارة أصول التركة ومشاريعها الفرعية'),
  ('estates.manage_reports', 'إدارة التقارير الدورية للتركة'),
  ('finance.read', 'قراءة السجلات المالية ضمن النطاق'),
  ('finance.manage', 'إدارة الفواتير والدفعات والتحصيل'),
  ('finance.approve_closure', 'اعتماد فاتورة وإقفال المشروع'),
  ('collections.escalate', 'رفع توصية تصعيد التحصيل'),
  ('roles.manage', 'إدارة الأدوار والصلاحيات'),
  ('system.override', 'التدخل الاستثنائي الموثق في النظام')
on conflict (code) do update set description = excluded.description;

with role_permission_map(role_code, permission_code) as (
  values
    ('new_clients_manager', 'clients.read'),
    ('new_clients_manager', 'clients.manage'),
    ('new_clients_manager', 'requests.create'),
    ('new_clients_manager', 'requests.link_client'),
    ('new_clients_manager', 'requests.manage'),
    ('new_clients_manager', 'studies.assign'),
    ('new_clients_manager', 'offers.create'),
    ('new_clients_manager', 'offers.send'),
    ('new_clients_manager', 'offers.negotiate'),
    ('new_clients_manager', 'contracts.create'),
    ('new_clients_manager', 'contracts.send'),
    ('new_clients_manager', 'contracts.upload_signed'),
    ('new_clients_manager', 'projects.create'),
    ('new_clients_manager', 'projects.assign_primary_assignee'),
    ('new_clients_manager', 'documents.upload'),
    ('new_clients_manager', 'documents.read_internal'),
    ('new_clients_manager', 'documents.publish'),
    ('new_clients_manager', 'documents.withdraw'),
    ('new_clients_manager', 'documents.archive'),
    ('new_clients_manager', 'messages.client'),
    ('new_clients_manager', 'messages.internal'),

    ('litigation_manager', 'clients.read'),
    ('litigation_manager', 'requests.manage'),
    ('litigation_manager', 'studies.assign'),
    ('litigation_manager', 'studies.submit'),
    ('litigation_manager', 'studies.approve_litigation'),
    ('litigation_manager', 'projects.read_department'),
    ('litigation_manager', 'projects.manage_members'),
    ('litigation_manager', 'projects.assign_manager'),
    ('litigation_manager', 'projects.assign_primary_assignee'),
    ('litigation_manager', 'project_teams.manage'),
    ('litigation_manager', 'project_teams.assign'),
    ('litigation_manager', 'workflow.start'),
    ('litigation_manager', 'workflow.transition'),
    ('litigation_manager', 'workflow.override_transition'),
    ('litigation_manager', 'workflow.reopen'),
    ('litigation_manager', 'tasks.create'),
    ('litigation_manager', 'tasks.assign'),
    ('litigation_manager', 'tasks.reassign'),
    ('litigation_manager', 'tasks.submit'),
    ('litigation_manager', 'tasks.approve'),
    ('litigation_manager', 'tasks.return_for_revision'),
    ('litigation_manager', 'tasks.extend'),
    ('litigation_manager', 'documents.upload'),
    ('litigation_manager', 'documents.read_internal'),
    ('litigation_manager', 'documents.publish'),
    ('litigation_manager', 'documents.withdraw'),
    ('litigation_manager', 'documents.archive'),
    ('litigation_manager', 'messages.client'),
    ('litigation_manager', 'messages.internal'),
    ('litigation_manager', 'messages.moderate'),
    ('litigation_manager', 'litigation.manage_cases'),
    ('litigation_manager', 'litigation.manage_hearings'),
    ('litigation_manager', 'litigation.set_next_action'),
    ('litigation_manager', 'finance.read'),
    ('litigation_manager', 'finance.approve_closure'),
    ('litigation_manager', 'collections.escalate'),
    ('litigation_manager', 'audit.read'),

    ('litigation_secretary', 'clients.read'),
    ('litigation_secretary', 'projects.read_department'),
    ('litigation_secretary', 'projects.manage_members'),
    ('litigation_secretary', 'project_teams.manage'),
    ('litigation_secretary', 'project_teams.assign'),
    ('litigation_secretary', 'workflow.transition'),
    ('litigation_secretary', 'tasks.create'),
    ('litigation_secretary', 'tasks.assign'),
    ('litigation_secretary', 'tasks.reassign'),
    ('litigation_secretary', 'tasks.submit'),
    ('litigation_secretary', 'tasks.extend'),
    ('litigation_secretary', 'documents.upload'),
    ('litigation_secretary', 'documents.read_internal'),
    ('litigation_secretary', 'documents.publish'),
    ('litigation_secretary', 'documents.withdraw'),
    ('litigation_secretary', 'messages.client'),
    ('litigation_secretary', 'messages.internal'),
    ('litigation_secretary', 'litigation.manage_hearings'),
    ('litigation_secretary', 'litigation.set_next_action'),

    ('lawyer', 'studies.submit'),
    ('lawyer', 'workflow.transition'),
    ('lawyer', 'tasks.create'),
    ('lawyer', 'tasks.submit'),
    ('lawyer', 'documents.upload'),
    ('lawyer', 'documents.read_internal'),
    ('lawyer', 'messages.client'),
    ('lawyer', 'messages.internal'),
    ('lawyer', 'litigation.manage_cases'),
    ('lawyer', 'litigation.manage_hearings'),
    ('lawyer', 'litigation.set_next_action'),

    ('legal_specialist', 'studies.submit'),
    ('legal_specialist', 'workflow.transition'),
    ('legal_specialist', 'tasks.create'),
    ('legal_specialist', 'tasks.submit'),
    ('legal_specialist', 'documents.upload'),
    ('legal_specialist', 'documents.read_internal'),
    ('legal_specialist', 'messages.client'),
    ('legal_specialist', 'messages.internal'),
    ('legal_specialist', 'litigation.manage_cases'),
    ('legal_specialist', 'litigation.manage_hearings'),
    ('legal_specialist', 'litigation.set_next_action'),

    ('estates_manager', 'clients.read'),
    ('estates_manager', 'requests.manage'),
    ('estates_manager', 'studies.assign'),
    ('estates_manager', 'studies.submit'),
    ('estates_manager', 'studies.approve_estates'),
    ('estates_manager', 'projects.read_department'),
    ('estates_manager', 'projects.manage_members'),
    ('estates_manager', 'projects.assign_manager'),
    ('estates_manager', 'projects.assign_primary_assignee'),
    ('estates_manager', 'project_teams.manage'),
    ('estates_manager', 'project_teams.assign'),
    ('estates_manager', 'workflow.start'),
    ('estates_manager', 'workflow.transition'),
    ('estates_manager', 'workflow.override_transition'),
    ('estates_manager', 'workflow.reopen'),
    ('estates_manager', 'tasks.create'),
    ('estates_manager', 'tasks.assign'),
    ('estates_manager', 'tasks.reassign'),
    ('estates_manager', 'tasks.submit'),
    ('estates_manager', 'tasks.approve'),
    ('estates_manager', 'tasks.return_for_revision'),
    ('estates_manager', 'tasks.extend'),
    ('estates_manager', 'documents.upload'),
    ('estates_manager', 'documents.read_internal'),
    ('estates_manager', 'documents.publish'),
    ('estates_manager', 'documents.withdraw'),
    ('estates_manager', 'documents.archive'),
    ('estates_manager', 'messages.client'),
    ('estates_manager', 'messages.internal'),
    ('estates_manager', 'messages.moderate'),
    ('estates_manager', 'estates.manage'),
    ('estates_manager', 'estates.manage_parties'),
    ('estates_manager', 'estates.manage_assets'),
    ('estates_manager', 'estates.manage_reports'),
    ('estates_manager', 'finance.read'),
    ('estates_manager', 'finance.approve_closure'),
    ('estates_manager', 'audit.read'),

    ('estates_secretary', 'clients.read'),
    ('estates_secretary', 'projects.read_department'),
    ('estates_secretary', 'projects.manage_members'),
    ('estates_secretary', 'project_teams.manage'),
    ('estates_secretary', 'project_teams.assign'),
    ('estates_secretary', 'workflow.transition'),
    ('estates_secretary', 'tasks.create'),
    ('estates_secretary', 'tasks.assign'),
    ('estates_secretary', 'tasks.reassign'),
    ('estates_secretary', 'tasks.submit'),
    ('estates_secretary', 'tasks.extend'),
    ('estates_secretary', 'documents.upload'),
    ('estates_secretary', 'documents.read_internal'),
    ('estates_secretary', 'documents.publish'),
    ('estates_secretary', 'documents.withdraw'),
    ('estates_secretary', 'messages.client'),
    ('estates_secretary', 'messages.internal'),
    ('estates_secretary', 'estates.manage_parties'),
    ('estates_secretary', 'estates.manage_assets'),
    ('estates_secretary', 'estates.manage_reports'),

    ('accountant', 'documents.upload'),
    ('accountant', 'documents.read_internal'),
    ('accountant', 'messages.internal'),
    ('accountant', 'finance.read'),
    ('accountant', 'finance.manage'),

    ('executive_manager', 'projects.read_all'),
    ('executive_manager', 'documents.read_internal'),
    ('executive_manager', 'finance.read'),
    ('executive_manager', 'finance.approve_closure'),
    ('executive_manager', 'collections.escalate'),
    ('executive_manager', 'audit.read'),

    ('super_admin', 'roles.manage'),
    ('super_admin', 'system.override')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permission_map mapping
join public.roles role on role.code = mapping.role_code
join public.permissions permission on permission.code = mapping.permission_code
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code = 'super_admin'
on conflict do nothing;

delete from public.role_permissions role_permission
using public.roles role, public.permissions permission
where role_permission.role_id = role.id
  and role_permission.permission_id = permission.id
  and role.code = 'executive_manager'
  and permission.code = 'documents.publish';

create or replace function private.user_has_permission(target_user_id uuid, permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
    join public.profiles profile on profile.id = user_role.user_id
    where user_role.user_id = target_user_id
      and user_role.revoked_at is null
      and role.is_active
      and permission.code = permission_code
      and profile.activation_status = 'active_staff'
      and profile.is_active
      and profile.deleted_at is null
  );
$$;

revoke all on function private.user_has_permission(uuid, text) from public, anon;
grant execute on function private.user_has_permission(uuid, text) to authenticated;

create or replace function public.get_my_permissions()
returns table (permission_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct permission.code
  from public.user_roles user_role
  join public.roles role on role.id = user_role.role_id and role.is_active
  join public.role_permissions role_permission on role_permission.role_id = role.id
  join public.permissions permission on permission.id = role_permission.permission_id
  join public.profiles profile on profile.id = user_role.user_id
  where user_role.user_id = (select auth.uid())
    and user_role.revoked_at is null
    and profile.activation_status = 'active_staff'
    and profile.is_active
    and profile.deleted_at is null
  order by permission.code;
$$;

revoke all on function public.get_my_permissions() from public, anon;
grant execute on function public.get_my_permissions() to authenticated;

-- ---------------------------------------------------------------------------
-- Additive project, workflow, estate, litigation, communication and finance data
-- ---------------------------------------------------------------------------

alter table public.service_requests
  add column request_number text,
  add column data_version text not null default 'v2',
  add column legacy_at timestamptz,
  add column needs_manager_review boolean not null default false;

create unique index service_requests_number_unique
  on public.service_requests (organization_id, request_number)
  where request_number is not null;

create table private.operation_counters (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  counter_code text not null,
  counter_year integer not null,
  current_value bigint not null default 0 check (current_value >= 0),
  primary key (organization_id, counter_code, counter_year)
);

create or replace function private.next_operation_number(
  p_organization_id uuid,
  p_counter_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  counter_value bigint;
  counter_year integer := extract(year from current_date)::integer;
begin
  insert into private.operation_counters (
    organization_id, counter_code, counter_year, current_value
  )
  values (p_organization_id, p_counter_code, counter_year, 1)
  on conflict (organization_id, counter_code, counter_year) do update
  set current_value = private.operation_counters.current_value + 1
  returning current_value into counter_value;

  return upper(p_counter_code) || '-' || counter_year::text || '-' ||
    lpad(counter_value::text, 6, '0');
end;
$$;

revoke all on private.operation_counters from public, anon, authenticated;
revoke all on function private.next_operation_number(uuid, text)
from public, anon, authenticated;

alter table public.projects drop constraint projects_project_type_check;
alter table public.projects
  add constraint projects_project_type_check check (
    project_type in (
      'litigation', 'estate', 'estate_asset', 'estate_litigation',
      'estate_financial', 'consultation', 'other'
    )
  ),
  add column department_id uuid references public.departments(id) on delete restrict,
  add column parent_project_id uuid references public.projects(id) on delete restrict,
  add column estate_asset_id uuid references public.estate_assets(id) on delete restrict,
  add column project_manager_id uuid references public.profiles(id) on delete restrict,
  add column primary_assignee_id uuid references public.profiles(id) on delete restrict,
  add column project_number text,
  add column data_version text not null default 'v2',
  add column legacy_at timestamptz;

create unique index projects_number_unique
  on public.projects (organization_id, project_number)
  where project_number is not null;
create unique index projects_estate_asset_unique
  on public.projects (estate_asset_id)
  where estate_asset_id is not null;
create index projects_department_status_idx
  on public.projects (department_id, status) where deleted_at is null;
create index projects_parent_idx
  on public.projects (parent_project_id, status) where parent_project_id is not null;

alter table public.estate_details
  add column estate_kind text not null default 'regular_estate'
    check (estate_kind in ('regular_estate', 'isnad_estate')),
  add column source_judgment_document_id uuid references public.documents(id) on delete restrict,
  add column liquidator_guide_document_id uuid references public.documents(id) on delete restrict,
  add column isnad_contract_document_id uuid references public.documents(id) on delete restrict;

alter table public.estate_assets
  add column asset_project_id uuid references public.projects(id) on delete restrict,
  add column valuation_amount numeric(16, 2),
  add column valuation_currency char(3) not null default 'SAR',
  add column liquidation_status text,
  add column marketing_status text,
  add column guardianship_ended_at timestamptz;

create unique index estate_assets_asset_project_unique
  on public.estate_assets (asset_project_id) where asset_project_id is not null;

alter table public.workflow_action_assignment_rules
  drop constraint workflow_action_assignment_rules_selector_type_check;
alter table public.workflow_action_assignment_rules
  add constraint workflow_action_assignment_rules_selector_type_check
    check (selector_type in ('role', 'job_title', 'project_membership', 'project_team', 'manual')),
  add column project_team_code text,
  add column selector_config jsonb not null default '{}'::jsonb,
  drop constraint workflow_action_assignment_rules_check1,
  add constraint workflow_action_assignment_rules_selector_value_check check (
    (selector_type = 'role' and role_id is not null)
    or (selector_type = 'job_title' and job_title_id is not null)
    or (selector_type = 'project_membership' and project_membership_role is not null)
    or (selector_type = 'project_team' and project_team_code is not null)
    or selector_type = 'manual'
  );

alter table public.workflow_action_dependencies
  drop constraint workflow_action_dependencies_dependency_type_check;
alter table public.workflow_action_dependencies
  add constraint workflow_action_dependencies_dependency_type_check
    check (dependency_type in ('finish_to_start', 'finish_to_finish', 'start_to_start', 'start_to_finish'));

alter table public.workflow_stage_templates
  add column stage_mode text not null default 'sequential'
    check (stage_mode in ('sequential', 'parallel', 'continuous', 'optional', 'conditional')),
  add column source_reference text,
  add column needs_operational_confirmation boolean not null default false;

alter table public.workflow_action_templates
  add column priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  add column schedule_type text not null default 'once'
    check (schedule_type in ('once', 'event', 'recurring', 'legal_deadline')),
  add column duration_basis text not null default 'business_days'
    check (duration_basis in ('business_days', 'calendar_days', 'legal_date')),
  add column recurrence_rule jsonb not null default '{}'::jsonb,
  add column event_trigger_code text,
  add column source_reference text,
  add column needs_operational_confirmation boolean not null default false;

alter table public.workflow_instances
  alter column project_id drop not null,
  add column service_request_id uuid references public.service_requests(id) on delete restrict,
  add column current_stage_instance_id uuid,
  add column forecast_completed_at timestamptz,
  add column data_version text not null default 'v2',
  add column legacy_at timestamptz,
  add constraint workflow_instance_single_scope check (
    num_nonnulls(project_id, service_request_id) = 1
  );

create index workflow_instances_request_idx
  on public.workflow_instances (service_request_id, status)
  where service_request_id is not null;

alter table public.workflow_stage_instances
  add column reopened_at timestamptz,
  add column reopened_by uuid references public.profiles(id) on delete restrict,
  add column reopen_reason text,
  add column overdue_escalated_at timestamptz;

alter table public.workflow_action_instances
  drop constraint workflow_action_instances_status_check;
alter table public.workflow_action_instances
  add constraint workflow_action_instances_status_check check (
    status in (
      'awaiting_assignment', 'blocked', 'ready', 'in_progress', 'submitted',
      'awaiting_approval', 'returned', 'returned_for_revision', 'approved',
      'completed', 'cancelled'
    )
  ),
  add column occurrence_number integer not null default 1 check (occurrence_number > 0),
  add column scheduled_for timestamptz,
  add column legal_due_date date,
  add column extended_until timestamptz,
  add column extension_reason text,
  add column submitted_at timestamptz,
  add column approved_at timestamptz,
  add column approved_by uuid references public.profiles(id) on delete restrict,
  add column returned_at timestamptz,
  add column returned_by uuid references public.profiles(id) on delete restrict,
  add column return_reason text,
  add column reopened_at timestamptz,
  add column reopened_by uuid references public.profiles(id) on delete restrict,
  add column reopen_reason text,
  add column escalation_level integer not null default 0 check (escalation_level >= 0);

create table public.project_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  stage_instance_id uuid references public.workflow_stage_instances(id) on delete restrict,
  code text not null,
  name text not null,
  leader_id uuid references public.profiles(id) on delete restrict,
  permissions jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('planned', 'active', 'completed', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);

create table public.project_team_members (
  project_team_id uuid not null references public.project_teams(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  team_role text not null default 'member' check (team_role in ('leader', 'member', 'observer')),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (project_team_id, user_id)
);

create table public.workflow_action_occurrences (
  id uuid primary key default gen_random_uuid(),
  workflow_action_instance_id uuid not null references public.workflow_action_instances(id) on delete restrict,
  occurrence_number integer not null check (occurrence_number > 0),
  scheduled_for timestamptz not null,
  due_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'created', 'completed', 'skipped', 'cancelled')),
  action_instance_id uuid references public.workflow_action_instances(id) on delete restrict,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  unique (workflow_action_instance_id, occurrence_number)
);

create table public.workflow_transition_events (
  id bigint generated always as identity primary key,
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete restrict,
  stage_instance_id uuid references public.workflow_stage_instances(id) on delete restrict,
  action_instance_id uuid references public.workflow_action_instances(id) on delete restrict,
  transition_type text not null check (
    transition_type in (
      'start', 'transition', 'submit', 'approve', 'return', 'extend',
      'override', 'reopen', 'complete', 'cancel'
    )
  ),
  previous_status text,
  new_status text not null,
  reason text,
  impact jsonb not null default '{}'::jsonb,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.business_calendars (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  working_weekdays smallint[] not null default array[0,1,2,3,4],
  timezone text not null default 'Asia/Riyadh',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.business_calendar_holidays (
  business_calendar_id uuid not null references public.business_calendars(id) on delete restrict,
  holiday_date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (business_calendar_id, holiday_date)
);

insert into public.business_calendars (
  organization_id, code, name, working_weekdays, timezone, is_default
)
select id, 'sa-default', 'تقويم العمل الافتراضي', array[0,1,2,3,4]::smallint[], 'Asia/Riyadh', true
from public.organizations
on conflict (organization_id, code) do nothing;

create table public.litigation_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null unique references public.projects(id) on delete restrict,
  case_number text,
  court_name text,
  case_level text not null default 'first_instance'
    check (case_level in ('first_instance', 'appeal', 'cassation', 'enforcement')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'stayed', 'closed')),
  current_next_action_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.litigation_case_actions (
  id uuid primary key default gen_random_uuid(),
  litigation_case_id uuid not null references public.litigation_cases(id) on delete restrict,
  title text not null,
  action_type text not null,
  due_at timestamptz,
  legal_due_date date,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'cancelled', 'superseded')),
  priority text not null default 'normal'
    check (priority in ('normal', 'high', 'critical')),
  assigned_to uuid references public.profiles(id) on delete restrict,
  source_event text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.litigation_cases
  add constraint litigation_cases_current_next_action_fk
  foreign key (current_next_action_id) references public.litigation_case_actions(id) on delete restrict;

create table public.litigation_hearings (
  id uuid primary key default gen_random_uuid(),
  litigation_case_id uuid not null references public.litigation_cases(id) on delete restrict,
  hearing_at timestamptz not null,
  notified_at timestamptz,
  court_reference text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'held', 'adjourned', 'cancelled')),
  minutes_document_id uuid references public.documents(id) on delete restrict,
  client_report_document_id uuid references public.documents(id) on delete restrict,
  next_hearing_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.estate_parties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  estate_project_id uuid not null references public.projects(id) on delete restrict,
  linked_profile_id uuid references public.profiles(id) on delete restrict,
  party_type text not null check (
    party_type in ('heir', 'representative', 'beneficiary', 'guardian', 'creditor', 'other')
  ),
  full_name text not null,
  national_id text,
  phone text,
  email text,
  national_address text,
  passport_number text,
  is_minor boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'deceased')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.estate_party_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  estate_party_id uuid not null references public.estate_parties(id) on delete restrict,
  iban text not null,
  bank_name text,
  certificate_document_id uuid references public.documents(id) on delete restrict,
  is_verified boolean not null default false,
  verified_by uuid references public.profiles(id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.estate_party_shares (
  id uuid primary key default gen_random_uuid(),
  estate_party_id uuid not null references public.estate_parties(id) on delete restrict,
  numerator numeric(18, 6) not null check (numerator >= 0),
  denominator numeric(18, 6) not null check (denominator > 0),
  percentage numeric(9, 6) check (percentage between 0 and 100),
  source_document_id uuid references public.documents(id) on delete restrict,
  effective_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.estate_party_decisions (
  id uuid primary key default gen_random_uuid(),
  estate_party_id uuid not null references public.estate_parties(id) on delete restrict,
  decision_type text not null check (decision_type in ('consent', 'approval', 'release', 'objection')),
  subject_type text not null,
  subject_id uuid,
  status text not null check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  evidence_document_id uuid references public.documents(id) on delete restrict,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  notes text
);

create table public.recurring_report_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  report_type text not null check (report_type in ('estate_quarterly', 'project_periodic')),
  interval_days integer not null default 90 check (interval_days > 0),
  preparation_business_days integer not null default 15 check (preparation_business_days > 0),
  next_period_ends_on date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, report_type)
);

create table public.project_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  schedule_id uuid references public.recurring_report_schedules(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  due_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'published', 'withdrawn')),
  current_version_number integer not null default 1,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_report_versions (
  id uuid primary key default gen_random_uuid(),
  project_report_id uuid not null references public.project_reports(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  generated_data jsonb not null default '{}'::jsonb,
  human_notes text,
  document_version_id uuid references public.document_versions(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_report_id, version_number)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  invoice_number text,
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_approval', 'approved', 'sent', 'partially_paid', 'paid', 'void')),
  currency char(3) not null default 'SAR',
  total_amount numeric(16, 2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(16, 2) not null default 0 check (paid_amount >= 0),
  current_version_number integer not null default 1,
  due_date date,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  sent_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  retention_status text not null default 'retained'
    check (retention_status in ('retained', 'archived', 'legal_hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_amount <= total_amount)
);

create table public.invoice_versions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  line_items jsonb not null default '[]'::jsonb,
  total_amount numeric(16, 2) not null check (total_amount >= 0),
  entitlement_basis text,
  document_version_id uuid references public.document_versions(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (invoice_id, version_number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(16, 2) not null check (amount > 0),
  paid_at timestamptz not null,
  payment_method text,
  reference_number text,
  attachment_document_id uuid references public.documents(id) on delete restrict,
  notes text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.collection_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  event_type text not null check (
    event_type in ('follow_up', 'promise_to_pay', 'escalation_recommended', 'escalation_decided', 'note')
  ),
  details text,
  next_follow_up_at timestamptz,
  executive_decision text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.conversations
  add column channel_key text,
  add column last_message_at timestamptz,
  add constraint conversations_scope_check check (
    num_nonnulls(project_id, service_request_id) = 1
  );

create unique index conversations_project_channel_unique
  on public.conversations (project_id, conversation_type)
  where project_id is not null and archived_at is null;
create unique index conversations_request_channel_unique
  on public.conversations (service_request_id, conversation_type)
  where service_request_id is not null and archived_at is null;

alter table public.messages
  add column reply_to_message_id uuid references public.messages(id) on delete restrict,
  add column edited_at timestamptz,
  add column edit_deadline_at timestamptz not null default (now() + interval '15 minutes'),
  add column moderation_reason text;

create table public.message_attachments (
  message_id uuid not null references public.messages(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (message_id, document_version_id)
);

create table public.message_receipts (
  message_id uuid not null references public.messages(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.documents
  add column workflow_action_instance_id uuid references public.workflow_action_instances(id) on delete restrict,
  add column estate_asset_id uuid references public.estate_assets(id) on delete restrict,
  add column estate_party_id uuid references public.estate_parties(id) on delete restrict;

alter table public.document_versions
  add constraint document_versions_mvp_size_check check (byte_size <= 26214400) not valid,
  add constraint document_versions_mvp_type_check check (
    lower(split_part(file_name, '.', array_length(string_to_array(file_name, '.'), 1)))
      in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png')
  ) not valid;
alter table public.document_versions validate constraint document_versions_mvp_size_check;
alter table public.document_versions validate constraint document_versions_mvp_type_check;

alter table public.contract_acceptances
  add column acceptance_method text not null default 'electronic'
    check (acceptance_method in ('electronic', 'manual_signed_copy')),
  add column evidence_document_version_id uuid references public.document_versions(id) on delete restrict,
  add column recorded_by uuid references public.profiles(id) on delete restrict;

update public.contract_acceptances
set acceptance_method = 'electronic',
    recorded_by = accepted_by
where recorded_by is null;

alter table public.contracts add column contract_number text;
create unique index contracts_number_unique
  on public.contracts (contract_number) where contract_number is not null;

-- ---------------------------------------------------------------------------
-- Audit, timestamps, indexes and RLS for new tables
-- ---------------------------------------------------------------------------

create index project_teams_project_idx on public.project_teams (project_id, status);
create index project_team_members_user_idx on public.project_team_members (user_id) where left_at is null;
create index workflow_transition_instance_idx on public.workflow_transition_events (workflow_instance_id, created_at desc);
create index litigation_case_actions_due_idx on public.litigation_case_actions (litigation_case_id, due_at) where status in ('planned', 'in_progress');
create index litigation_hearings_due_idx on public.litigation_hearings (hearing_at) where status = 'scheduled';
create index estate_parties_project_idx on public.estate_parties (estate_project_id, party_type) where deleted_at is null;
create index project_reports_project_idx on public.project_reports (project_id, period_end desc);
create index invoices_project_idx on public.invoices (project_id, status);
create index payments_invoice_idx on public.payments (invoice_id, paid_at desc);
create index message_receipts_user_idx on public.message_receipts (user_id, read_at);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_teams', 'workflow_action_occurrences', 'workflow_transition_events',
    'litigation_cases', 'litigation_case_actions', 'litigation_hearings',
    'estate_parties', 'estate_party_bank_accounts', 'estate_party_shares',
    'estate_party_decisions', 'recurring_report_schedules', 'project_reports',
    'project_report_versions', 'invoices', 'invoice_versions', 'payments',
    'collection_events'
  ]
  loop
    execute format(
      'create trigger audit_%I after insert or update on public.%I for each row execute function private.audit_row_change()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create trigger project_teams_touch_updated_at before update on public.project_teams
for each row execute function private.touch_updated_at();
create trigger litigation_cases_touch_updated_at before update on public.litigation_cases
for each row execute function private.touch_updated_at();
create trigger litigation_case_actions_touch_updated_at before update on public.litigation_case_actions
for each row execute function private.touch_updated_at();
create trigger litigation_hearings_touch_updated_at before update on public.litigation_hearings
for each row execute function private.touch_updated_at();
create trigger estate_parties_touch_updated_at before update on public.estate_parties
for each row execute function private.touch_updated_at();
create trigger project_reports_touch_updated_at before update on public.project_reports
for each row execute function private.touch_updated_at();
create trigger invoices_touch_updated_at before update on public.invoices
for each row execute function private.touch_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_teams', 'project_team_members', 'workflow_action_occurrences',
    'workflow_transition_events', 'business_calendars', 'business_calendar_holidays',
    'litigation_cases', 'litigation_case_actions', 'litigation_hearings',
    'estate_parties', 'estate_party_bank_accounts', 'estate_party_shares',
    'estate_party_decisions', 'recurring_report_schedules', 'project_reports',
    'project_report_versions', 'invoices', 'invoice_versions', 'payments',
    'collection_events', 'message_attachments', 'message_receipts'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
  end loop;
end;
$$;

create policy project_teams_access_select on public.project_teams
for select to authenticated using ((select private.can_access_project(project_id)));
create policy project_team_members_access_select on public.project_team_members
for select to authenticated using (
  exists (
    select 1 from public.project_teams team
    where team.id = project_team_members.project_team_id
      and (select private.can_access_project(team.project_id))
  )
);

create policy workflow_occurrences_access_select on public.workflow_action_occurrences
for select to authenticated using (
  exists (
    select 1
    from public.workflow_action_instances action_instance
    join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
    join public.workflow_instances workflow_instance on workflow_instance.id = stage_instance.workflow_instance_id
    where action_instance.id = workflow_action_occurrences.workflow_action_instance_id
      and (
        (workflow_instance.project_id is not null and (select private.can_access_project(workflow_instance.project_id)))
        or (workflow_instance.service_request_id is not null and (select private.can_manage_pre_contract(workflow_instance.service_request_id)))
      )
  )
);

create policy workflow_transitions_access_select on public.workflow_transition_events
for select to authenticated using (
  exists (
    select 1 from public.workflow_instances workflow_instance
    where workflow_instance.id = workflow_transition_events.workflow_instance_id
      and (
        (workflow_instance.project_id is not null and (select private.can_access_project(workflow_instance.project_id)))
        or (workflow_instance.service_request_id is not null and (select private.can_manage_pre_contract(workflow_instance.service_request_id)))
      )
  )
);

create policy litigation_cases_access_select on public.litigation_cases
for select to authenticated using ((select private.can_access_project(project_id)));
create policy litigation_case_actions_access_select on public.litigation_case_actions
for select to authenticated using (
  exists (
    select 1 from public.litigation_cases litigation_case
    where litigation_case.id = litigation_case_actions.litigation_case_id
      and (select private.can_access_project(litigation_case.project_id))
  )
);
create policy litigation_hearings_access_select on public.litigation_hearings
for select to authenticated using (
  exists (
    select 1 from public.litigation_cases litigation_case
    where litigation_case.id = litigation_hearings.litigation_case_id
      and (select private.can_access_project(litigation_case.project_id))
  )
);

create policy estate_parties_access_select on public.estate_parties
for select to authenticated using (
  (select private.is_active_staff()) and (select private.can_access_project(estate_project_id))
);
create policy estate_bank_accounts_access_select on public.estate_party_bank_accounts
for select to authenticated using (
  exists (
    select 1 from public.estate_parties party
    where party.id = estate_party_bank_accounts.estate_party_id
      and (select private.is_active_staff())
      and (select private.can_access_project(party.estate_project_id))
  )
);
create policy estate_shares_access_select on public.estate_party_shares
for select to authenticated using (
  exists (
    select 1 from public.estate_parties party
    where party.id = estate_party_shares.estate_party_id
      and (select private.can_access_project(party.estate_project_id))
  )
);
create policy estate_decisions_access_select on public.estate_party_decisions
for select to authenticated using (
  exists (
    select 1 from public.estate_parties party
    where party.id = estate_party_decisions.estate_party_id
      and (select private.can_access_project(party.estate_project_id))
  )
);

create policy report_schedules_access_select on public.recurring_report_schedules
for select to authenticated using ((select private.can_access_project(project_id)));
create policy project_reports_access_select on public.project_reports
for select to authenticated using ((select private.can_access_project(project_id)));
create policy project_report_versions_access_select on public.project_report_versions
for select to authenticated using (
  exists (
    select 1 from public.project_reports report
    where report.id = project_report_versions.project_report_id
      and (select private.can_access_project(report.project_id))
  )
);
create policy invoices_access_select on public.invoices
for select to authenticated using (
  (select private.is_active_staff())
  and (select private.has_permission('finance.read'))
  and (select private.can_access_project(project_id))
);
create policy invoice_versions_access_select on public.invoice_versions
for select to authenticated using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_versions.invoice_id
      and (select private.has_permission('finance.read'))
      and (select private.can_access_project(invoice.project_id))
  )
);
create policy payments_access_select on public.payments
for select to authenticated using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = payments.invoice_id
      and (select private.has_permission('finance.read'))
      and (select private.can_access_project(invoice.project_id))
  )
);
create policy collection_events_access_select on public.collection_events
for select to authenticated using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = collection_events.invoice_id
      and (select private.has_permission('finance.read'))
      and (select private.can_access_project(invoice.project_id))
  )
);

create policy message_attachments_member_select on public.message_attachments
for select to authenticated using (
  exists (
    select 1
    from public.messages message
    join public.conversation_participants participant on participant.conversation_id = message.conversation_id
    where message.id = message_attachments.message_id
      and participant.user_id = (select auth.uid())
      and participant.left_at is null
  )
);
create policy message_receipts_member_select on public.message_receipts
for select to authenticated using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.messages message
    join public.conversation_participants participant on participant.conversation_id = message.conversation_id
    where message.id = message_receipts.message_id
      and participant.user_id = (select auth.uid())
      and participant.left_at is null
  )
);

-- ---------------------------------------------------------------------------
-- Scope helpers, immutable evidence and guarded operations
-- ---------------------------------------------------------------------------

create or replace function private.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_permission('projects.read_all')
    or private.has_permission('system.override')
    or exists (
      select 1
      from public.project_members member
      where member.project_id = target_project_id
        and member.user_id = (select auth.uid())
        and member.left_at is null
    )
    or exists (
      select 1
      from public.projects project
      join public.profiles profile on profile.id = (select auth.uid())
      where project.id = target_project_id
        and project.department_id = profile.department_id
        and private.has_permission('projects.read_department')
        and project.deleted_at is null
    )
    or exists (
      select 1
      from public.projects project
      join public.client_accounts account on account.client_id = project.client_id
      where project.id = target_project_id
        and account.profile_id = (select auth.uid())
        and project.deleted_at is null
    );
$$;

create or replace function private.can_manage_pre_contract(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_permission('requests.manage')
    or private.has_permission('system.override')
    or exists (
      select 1
      from public.pre_contract_cases case_record
      where case_record.service_request_id = p_request_id
        and (select auth.uid()) in (
          case_record.responsible_id,
          case_record.executor_id,
          case_record.follower_id,
          case_record.approver_id
        )
    );
$$;

create or replace function private.prevent_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Legal evidence is append only';
end;
$$;

create trigger contract_acceptances_append_only
before update or delete on public.contract_acceptances
for each row execute function private.prevent_evidence_mutation();

create or replace function private.guard_workflow_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.project_id is not null and not (
    private.has_permission('workflow.start')
    or private.has_permission('system.override')
    or exists (
      select 1 from public.projects project
      where project.id = new.project_id
        and project.project_manager_id = (select auth.uid())
    )
  ) then
    raise exception 'The current user cannot start this workflow';
  end if;
  if new.service_request_id is not null and not (
    private.has_permission('workflow.start')
    or private.has_permission('requests.manage')
    or private.has_permission('system.override')
  ) then
    raise exception 'The current user cannot start this request workflow';
  end if;
  return new;
end;
$$;

create trigger workflow_instances_guard_start
before insert on public.workflow_instances
for each row execute function private.guard_workflow_start();

create or replace function private.guard_active_case_next_action()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and new.current_next_action_id is null then
    raise exception 'An active litigation case requires a next action and date';
  end if;
  if new.status = 'active' and not exists (
    select 1 from public.litigation_case_actions action
    where action.id = new.current_next_action_id
      and action.litigation_case_id = new.id
      and action.status in ('planned', 'in_progress')
      and (action.due_at is not null or action.legal_due_date is not null)
  ) then
    raise exception 'The next action must be active and dated';
  end if;
  return new;
end;
$$;

create constraint trigger litigation_cases_require_next_action
after insert or update of status, current_next_action_id on public.litigation_cases
deferrable initially deferred
for each row execute function private.guard_active_case_next_action();

-- ---------------------------------------------------------------------------
-- Secure RPCs
-- ---------------------------------------------------------------------------

revoke execute on function public.create_client_service_request(text, text, text)
from authenticated;

create or replace function public.approve_staff_registration(
  p_request_id uuid,
  p_department_id uuid,
  p_job_title_id uuid,
  p_role_ids uuid[],
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.staff_registration_requests;
  valid_role_count integer;
begin
  if not private.has_permission('staff.approve') then
    raise exception 'The current user cannot approve staff registrations';
  end if;
  select * into request_row
  from public.staff_registration_requests
  where id = p_request_id and status = 'pending'
  for update;
  if not found then raise exception 'Pending registration request was not found'; end if;

  if not exists (
    select 1 from public.departments department
    where department.id = p_department_id
      and department.organization_id = request_row.organization_id
      and department.is_active
  ) then raise exception 'Selected department is invalid'; end if;
  if not exists (
    select 1 from public.job_titles job_title
    where job_title.id = p_job_title_id
      and job_title.organization_id = request_row.organization_id
      and job_title.is_active
      and (job_title.department_id is null or job_title.department_id = p_department_id)
  ) then raise exception 'Selected job title is invalid'; end if;
  if coalesce(cardinality(p_role_ids), 0) = 0 then raise exception 'At least one role is required'; end if;

  select count(distinct role.id) into valid_role_count
  from public.roles role
  where role.id = any(p_role_ids)
    and role.organization_id = request_row.organization_id
    and role.is_active;
  if valid_role_count <> (
    select count(distinct role_id) from unnest(p_role_ids) role_id
  ) then raise exception 'One or more selected roles are invalid'; end if;

  update public.profiles
  set department_id = p_department_id,
      job_title_id = p_job_title_id,
      activation_status = 'active_staff',
      is_active = true,
      approved_at = now(),
      approved_by = (select auth.uid()),
      updated_at = now()
  where id = request_row.profile_id;

  update public.staff_registration_requests
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      review_notes = nullif(trim(p_review_notes), ''),
      updated_at = now()
  where id = request_row.id;

  update public.user_roles
  set revoked_at = now(), revoked_by = (select auth.uid())
  where user_id = request_row.profile_id
    and revoked_at is null
    and not (role_id = any(p_role_ids));

  insert into public.user_roles (user_id, role_id, assigned_by)
  select request_row.profile_id, role_id, (select auth.uid())
  from unnest(p_role_ids) role_id
  on conflict (user_id, role_id) do update
  set assigned_at = now(),
      assigned_by = excluded.assigned_by,
      revoked_at = null,
      revoked_by = null;
end;
$$;

create or replace function public.create_staff_service_request(
  p_client_profile_id uuid,
  p_request_type text,
  p_title text,
  p_summary text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  client_profile public.profiles;
  linked_client_id uuid;
  new_request_id uuid;
begin
  if not private.has_permission('requests.create') then
    raise exception 'The current user cannot create service requests';
  end if;
  if p_request_type not in ('litigation', 'estate', 'consultation', 'other') then
    raise exception 'Unsupported request type';
  end if;
  if length(trim(p_title)) < 5 or length(trim(p_summary)) < 10 then
    raise exception 'Request title and summary are required';
  end if;

  select * into client_profile
  from public.profiles
  where id = p_client_profile_id
    and account_kind = 'client'
    and activation_status in ('client_waiting', 'active_client')
    and is_active and deleted_at is null
  for update;
  if not found then raise exception 'Client account was not found'; end if;

  select client_id into linked_client_id
  from public.client_accounts
  where profile_id = client_profile.id
  order by is_primary desc, linked_at
  limit 1;

  if linked_client_id is null then
    insert into public.clients (
      organization_id, display_name, primary_contact_name, primary_contact_phone, status
    )
    values (
      client_profile.organization_id, client_profile.full_name,
      client_profile.full_name, client_profile.phone, 'active'
    )
    returning id into linked_client_id;

    insert into public.client_accounts (client_id, profile_id, linked_by, is_primary)
    values (linked_client_id, client_profile.id, actor_id, true);
  end if;

  update public.profiles
  set activation_status = 'active_client', updated_at = now()
  where id = client_profile.id;

  insert into public.service_requests (
    organization_id, client_id, created_by, request_type, title, summary,
    status, visibility, request_number
  )
  values (
    client_profile.organization_id, linked_client_id, actor_id, p_request_type,
    trim(p_title), trim(p_summary), 'linked', 'client_visible',
    private.next_operation_number(client_profile.organization_id, 'REQ')
  )
  returning id into new_request_id;

  insert into public.pre_contract_cases (
    service_request_id, responsible_id, follower_id, expected_project_type
  )
  values (new_request_id, actor_id, actor_id, p_request_type);

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id
  )
  values (
    new_request_id, 'request_received', 'تم استلام طلبكم', 'client_visible', actor_id
  );

  return new_request_id;
end;
$$;

revoke all on function public.create_staff_service_request(uuid, text, text, text)
from public, anon;
grant execute on function public.create_staff_service_request(uuid, text, text, text)
to authenticated;

create or replace function public.link_client_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_row public.service_requests;
  client_profile public.profiles;
  linked_client_id uuid;
begin
  if not private.has_permission('requests.link_client') then
    raise exception 'The current user cannot link client requests';
  end if;

  select * into request_row
  from public.service_requests
  where id = p_request_id and status = 'received' and deleted_at is null
  for update;
  if not found then raise exception 'Received request was not found'; end if;

  select * into client_profile
  from public.profiles
  where id = request_row.created_by
    and account_kind = 'client'
    and activation_status in ('client_waiting', 'active_client')
    and is_active and deleted_at is null;
  if not found then raise exception 'Legacy request creator is not an active client account'; end if;

  select client_id into linked_client_id
  from public.client_accounts
  where profile_id = client_profile.id
  order by is_primary desc, linked_at
  limit 1;

  if linked_client_id is null then
    insert into public.clients (
      organization_id, display_name, primary_contact_name, primary_contact_phone, status
    )
    values (
      request_row.organization_id, client_profile.full_name,
      client_profile.full_name, client_profile.phone, 'active'
    )
    returning id into linked_client_id;

    insert into public.client_accounts (client_id, profile_id, linked_by, is_primary)
    values (linked_client_id, client_profile.id, actor_id, true);
  end if;

  update public.profiles
  set activation_status = 'active_client', updated_at = now()
  where id = client_profile.id;

  update public.service_requests
  set client_id = linked_client_id,
      status = 'linked',
      needs_manager_review = false,
      updated_at = now()
  where id = request_row.id;

  insert into public.pre_contract_cases (
    service_request_id, responsible_id, follower_id, expected_project_type
  )
  values (request_row.id, actor_id, actor_id, request_row.request_type)
  on conflict (service_request_id) do update
  set responsible_id = excluded.responsible_id,
      follower_id = excluded.follower_id,
      updated_at = now();

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id
  )
  values (
    request_row.id, 'client_linked', 'تم ربط الطلب بملف العميل',
    'client_visible', actor_id
  );

  return linked_client_id;
end;
$$;

create or replace function public.list_eligible_study_staff(p_request_id uuid)
returns table (
  id uuid,
  full_name text,
  can_execute boolean,
  can_approve boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with request_scope as (
    select
      case when pre_contract_case.expected_project_type = 'estate'
        then 'estates' else 'litigation'
      end as department_code,
      case when pre_contract_case.expected_project_type = 'estate'
        then 'studies.approve_estates' else 'studies.approve_litigation'
      end as approval_permission
    from public.pre_contract_cases pre_contract_case
    where pre_contract_case.service_request_id = p_request_id
      and (
        private.has_permission('studies.assign')
        or private.has_permission('system.override')
      )
  )
  select
    profile.id,
    profile.full_name,
    bool_or(
      department.code = request_scope.department_code
      and role.code in (
        'lawyer', 'legal_specialist', 'litigation_secretary', 'litigation_manager',
        'estates_secretary', 'estates_manager'
      )
    ) as can_execute,
    private.user_has_permission(profile.id, request_scope.approval_permission) as can_approve
  from request_scope
  join public.profiles profile
    on profile.activation_status = 'active_staff'
   and profile.is_active
   and profile.deleted_at is null
  join public.departments department on department.id = profile.department_id
  join public.user_roles user_role on user_role.user_id = profile.id and user_role.revoked_at is null
  join public.roles role on role.id = user_role.role_id and role.is_active
  group by profile.id, profile.full_name, request_scope.approval_permission
  having
    bool_or(
      department.code = request_scope.department_code
      and role.code in (
        'lawyer', 'legal_specialist', 'litigation_secretary', 'litigation_manager',
        'estates_secretary', 'estates_manager'
      )
    )
    or private.user_has_permission(profile.id, request_scope.approval_permission)
  order by profile.full_name;
$$;

revoke all on function public.list_eligible_study_staff(uuid) from public, anon;
grant execute on function public.list_eligible_study_staff(uuid) to authenticated;

create or replace function public.assign_pre_contract_request(
  p_request_id uuid,
  p_executor_id uuid,
  p_approver_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  case_row public.pre_contract_cases;
  required_approval text;
  target_department_code text;
begin
  if not private.has_permission('studies.assign') then
    raise exception 'The current user cannot assign studies';
  end if;

  select * into case_row
  from public.pre_contract_cases
  where service_request_id = p_request_id
  for update;
  if not found then raise exception 'Link the client before assignment'; end if;

  required_approval := case
    when case_row.expected_project_type = 'estate' then 'studies.approve_estates'
    else 'studies.approve_litigation'
  end;
  target_department_code := case
    when case_row.expected_project_type = 'estate' then 'estates'
    else 'litigation'
  end;

  if not exists (
    select 1
    from public.profiles profile
    join public.departments department on department.id = profile.department_id
    join public.user_roles user_role on user_role.user_id = profile.id and user_role.revoked_at is null
    join public.roles role on role.id = user_role.role_id
    where profile.id = p_executor_id
      and profile.activation_status = 'active_staff'
      and profile.is_active and profile.deleted_at is null
      and department.code = target_department_code
      and role.code in (
        'lawyer', 'legal_specialist', 'litigation_secretary', 'litigation_manager',
        'estates_secretary', 'estates_manager'
      )
  ) then
    raise exception 'Executor is not eligible for the request department and type';
  end if;

  if not private.user_has_permission(p_approver_id, required_approval) then
    raise exception 'Approver cannot approve studies for this department';
  end if;

  update public.pre_contract_cases
  set executor_id = p_executor_id,
      approver_id = p_approver_id,
      assigned_at = now(),
      assigned_by = actor_id,
      updated_at = now()
  where service_request_id = p_request_id;

  update public.service_requests
  set status = 'assigned', updated_at = now()
  where id = p_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id, metadata
  )
  values (
    p_request_id, 'specialist_assigned', 'تم تحويل الطلب إلى المختص',
    'client_visible', actor_id,
    jsonb_build_object('executor_id', p_executor_id, 'approver_id', p_approver_id)
  );
end;
$$;

create or replace function public.submit_legal_study(
  p_request_id uuid,
  p_summary text,
  p_legal_opinion text,
  p_recommended_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  next_version integer;
  new_study_id uuid;
begin
  if not private.has_permission('studies.submit') or not exists (
    select 1 from public.pre_contract_cases case_record
    where case_record.service_request_id = p_request_id
      and case_record.executor_id = actor_id
  ) then raise exception 'Only the assigned eligible executor can submit the study'; end if;
  if p_recommended_path not in ('litigation', 'estate', 'consultation', 'decline') then
    raise exception 'Unsupported recommended path';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.legal_studies where service_request_id = p_request_id;

  update public.legal_studies
  set status = 'superseded', updated_at = now()
  where service_request_id = p_request_id and status in ('submitted', 'returned');

  insert into public.legal_studies (
    service_request_id, version_number, summary, legal_opinion,
    recommended_path, prepared_by
  )
  values (
    p_request_id, next_version, trim(p_summary), trim(p_legal_opinion),
    p_recommended_path, actor_id
  )
  returning id into new_study_id;

  update public.service_requests
  set status = 'study_pending_approval', updated_at = now()
  where id = p_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id
  )
  values (
    p_request_id, 'study_submitted', 'جارٍ تدقيق الدراسة من الإدارة',
    'client_visible', actor_id
  );

  return new_study_id;
end;
$$;

create or replace function public.review_legal_study(
  p_study_id uuid,
  p_decision text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  study_row public.legal_studies;
  case_row public.pre_contract_cases;
  required_approval text;
begin
  select * into study_row
  from public.legal_studies
  where id = p_study_id and status = 'submitted'
  for update;
  if not found then raise exception 'Submitted study was not found'; end if;

  select * into case_row
  from public.pre_contract_cases
  where service_request_id = study_row.service_request_id;

  required_approval := case
    when study_row.recommended_path = 'estate'
      or case_row.expected_project_type = 'estate'
    then 'studies.approve_estates'
    else 'studies.approve_litigation'
  end;

  if case_row.approver_id <> actor_id
    or not private.has_permission(required_approval)
  then
    raise exception 'The assigned approver cannot approve this department study';
  end if;
  if p_decision not in ('approve', 'return') then
    raise exception 'Unsupported review decision';
  end if;

  update public.legal_studies
  set status = case when p_decision = 'approve' then 'approved' else 'returned' end,
      reviewed_by = actor_id,
      reviewed_at = now(),
      review_notes = nullif(trim(p_notes), ''),
      updated_at = now()
  where id = study_row.id;

  update public.service_requests
  set status = case when p_decision = 'approve' then 'study_approved' else 'study_returned' end,
      updated_at = now()
  where id = study_row.service_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, details, visibility, actor_id
  )
  values (
    study_row.service_request_id,
    case when p_decision = 'approve' then 'study_approved' else 'study_returned' end,
    case when p_decision = 'approve'
      then 'تم اعتماد الدراسة وجارٍ إعداد العرض'
      else 'أعيدت الدراسة للمختص لاستكمالها'
    end,
    nullif(trim(p_notes), ''),
    case when p_decision = 'approve' then 'client_visible' else 'internal' end,
    actor_id
  );
end;
$$;

create or replace function public.send_pre_contract_proposal(
  p_request_id uuid,
  p_technical_scope text,
  p_fee_amount numeric,
  p_currency text default 'SAR',
  p_valid_until date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_status text;
  next_version integer;
  new_proposal_id uuid;
begin
  if not private.has_permission('offers.send') then
    raise exception 'The current user cannot send proposals';
  end if;
  select status into request_status
  from public.service_requests
  where id = p_request_id and deleted_at is null
  for update;
  if request_status not in (
    'study_approved', 'discount_requested', 'negotiating', 'proposal_sent'
  ) then raise exception 'The request is not ready for a proposal'; end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.proposals where service_request_id = p_request_id;

  update public.proposals
  set status = 'superseded', updated_at = now()
  where service_request_id = p_request_id
    and status in ('sent', 'discount_requested', 'negotiating');

  insert into public.proposals (
    service_request_id, version_number, technical_scope, fee_amount,
    currency, valid_until, created_by
  )
  values (
    p_request_id, next_version, trim(p_technical_scope), p_fee_amount,
    upper(p_currency)::char(3), coalesce(p_valid_until, current_date + 3), actor_id
  )
  returning id into new_proposal_id;

  update public.service_requests
  set status = 'proposal_sent', updated_at = now() where id = p_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id, metadata
  )
  values (
    p_request_id, 'proposal_sent',
    case when next_version = 1
      then 'تم إرسال العرض الفني والمالي' else 'تم إرسال عرض معدل'
    end,
    'requires_client_action', actor_id,
    jsonb_build_object('proposal_id', new_proposal_id, 'version', next_version)
  );

  return new_proposal_id;
end;
$$;

create or replace function public.send_pre_contract_contract(
  p_request_id uuid,
  p_title text,
  p_contract_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  contract_id_value uuid;
  next_version integer;
  new_version_id uuid;
  body_hash text;
begin
  if not private.has_permission('contracts.send') then
    raise exception 'The current user cannot send contracts';
  end if;
  if not exists (
    select 1 from public.service_requests
    where id = p_request_id and status = 'proposal_accepted' and deleted_at is null
  ) then raise exception 'An accepted proposal is required before the contract'; end if;

  insert into public.contracts (
    service_request_id, status, current_version_number, created_by
  )
  values (p_request_id, 'draft', 0, actor_id)
  on conflict (service_request_id) do update set updated_at = now()
  returning id, current_version_number + 1 into contract_id_value, next_version;

  update public.contract_versions
  set status = 'superseded'
  where contract_id = contract_id_value and status = 'sent';

  body_hash := encode(
    extensions.digest(convert_to(trim(p_contract_body), 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.contract_versions (
    contract_id, version_number, title, contract_body, sha256, created_by
  )
  values (
    contract_id_value, next_version, trim(p_title), trim(p_contract_body),
    body_hash, actor_id
  )
  returning id into new_version_id;

  update public.contracts
  set status = 'sent', current_version_number = next_version, updated_at = now()
  where id = contract_id_value;
  update public.service_requests
  set status = 'contract_sent', updated_at = now() where id = p_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id, metadata
  )
  values (
    p_request_id, 'contract_sent', 'تم إرسال العقد وبانتظار موافقتكم',
    'requires_client_action', actor_id,
    jsonb_build_object('contract_version_id', new_version_id, 'sha256', body_hash)
  );

  return new_version_id;
end;
$$;

create or replace function public.accept_pre_contract_contract(
  p_contract_version_id uuid,
  p_acceptance_text text,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  version_row public.contract_versions;
  contract_row public.contracts;
  acceptance_id uuid;
begin
  select * into version_row
  from public.contract_versions
  where id = p_contract_version_id and status in ('sent', 'accepted')
  for update;
  if not found then raise exception 'Active contract version was not found'; end if;

  select * into contract_row
  from public.contracts where id = version_row.contract_id
  for update;
  if not private.is_request_client(contract_row.service_request_id) then
    raise exception 'Only the request client can accept the contract';
  end if;
  if length(trim(p_acceptance_text)) < 10 then
    raise exception 'Documented acceptance text is required';
  end if;

  select id into acceptance_id
  from public.contract_acceptances
  where contract_version_id = version_row.id and accepted_by = actor_id;
  if acceptance_id is not null then
    return acceptance_id;
  end if;

  insert into public.contract_acceptances (
    contract_version_id, accepted_by, accepted_sha256, ip_address,
    user_agent, acceptance_text, acceptance_method, recorded_by
  )
  values (
    version_row.id, actor_id, version_row.sha256, p_ip_address,
    left(p_user_agent, 1000), trim(p_acceptance_text), 'electronic', actor_id
  )
  returning id into acceptance_id;

  update public.contract_versions set status = 'accepted' where id = version_row.id;
  update public.contracts
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = contract_row.id;
  update public.service_requests
  set status = 'contract_accepted', updated_at = now()
  where id = contract_row.service_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id,
    metadata
  )
  values (
    contract_row.service_request_id, 'contract_accepted', 'تم اعتماد العقد',
    'client_visible', actor_id,
    jsonb_build_object('contract_version_id', version_row.id, 'sha256', version_row.sha256)
  );

  return acceptance_id;
end;
$$;

create or replace function public.record_manual_contract_acceptance(
  p_contract_version_id uuid,
  p_client_profile_id uuid,
  p_document_version_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  version_row public.contract_versions;
  contract_row public.contracts;
  acceptance_id uuid;
begin
  if not private.has_permission('contracts.upload_signed') then
    raise exception 'The current user cannot record signed contracts';
  end if;

  select * into version_row
  from public.contract_versions
  where id = p_contract_version_id and status = 'sent'
  for update;
  if not found then raise exception 'Sent contract version was not found'; end if;

  select * into contract_row from public.contracts
  where id = version_row.contract_id for update;

  if not exists (
    select 1
    from public.client_accounts account
    join public.service_requests request on request.client_id = account.client_id
    where request.id = contract_row.service_request_id
      and account.profile_id = p_client_profile_id
  ) then raise exception 'The signer is not linked to the request client'; end if;

  if not exists (
    select 1 from public.document_versions document_version
    where document_version.id = p_document_version_id
      and document_version.deleted_at is null
  ) then raise exception 'Signed document version was not found'; end if;

  insert into public.contract_acceptances (
    contract_version_id, accepted_by, accepted_sha256, acceptance_text,
    acceptance_method, evidence_document_version_id, recorded_by
  )
  values (
    version_row.id, p_client_profile_id, version_row.sha256,
    coalesce(nullif(trim(p_notes), ''), 'تم استلام نسخة عقد موقعة يدويًا'),
    'manual_signed_copy', p_document_version_id, actor_id
  )
  returning id into acceptance_id;

  update public.contract_versions set status = 'accepted' where id = version_row.id;
  update public.contracts
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = contract_row.id;
  update public.service_requests
  set status = 'contract_accepted', updated_at = now()
  where id = contract_row.service_request_id;

  return acceptance_id;
end;
$$;

revoke all on function public.record_manual_contract_acceptance(uuid, uuid, uuid, text)
from public, anon;
grant execute on function public.record_manual_contract_acceptance(uuid, uuid, uuid, text)
to authenticated;

create or replace function public.convert_request_to_project(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_row public.service_requests;
  case_row public.pre_contract_cases;
  contract_row public.contracts;
  department_id_value uuid;
  client_profile_id uuid;
  project_id_value uuid;
  client_channel_id uuid;
  internal_channel_id uuid;
  project_number_value text;
begin
  if not private.has_permission('projects.create') then
    raise exception 'The current user cannot convert requests to projects';
  end if;

  select id into project_id_value
  from public.projects where service_request_id = p_request_id;
  if project_id_value is not null then return project_id_value; end if;

  select * into request_row
  from public.service_requests
  where id = p_request_id
    and status = 'contract_accepted'
    and client_id is not null
    and deleted_at is null
  for update;
  if not found then raise exception 'A linked client and accepted contract are required'; end if;

  select * into case_row
  from public.pre_contract_cases
  where service_request_id = request_row.id;
  if case_row.executor_id is null then
    raise exception 'A primary assignee is required before conversion';
  end if;

  if request_row.request_type = 'litigation' and not exists (
    select 1
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    where user_role.user_id = case_row.executor_id
      and user_role.revoked_at is null
      and role.code in ('lawyer', 'legal_specialist', 'litigation_manager')
  ) then
    raise exception 'Litigation project manager must be a lawyer or legal specialist';
  end if;

  select contract.*
  into contract_row
  from public.contracts contract
  where contract.service_request_id = request_row.id
    and exists (
      select 1
      from public.contract_versions version
      join public.contract_acceptances acceptance
        on acceptance.contract_version_id = version.id
       and acceptance.accepted_sha256 = version.sha256
      where version.contract_id = contract.id
        and version.version_number = contract.current_version_number
        and version.status = 'accepted'
    );
  if not found then
    raise exception 'The current contract version does not have valid acceptance evidence';
  end if;

  select id into department_id_value
  from public.departments
  where organization_id = request_row.organization_id
    and code = case
      when request_row.request_type = 'estate' then 'estates'
      else 'litigation'
    end
  limit 1;
  if department_id_value is null then raise exception 'Target department is not configured'; end if;

  select profile_id into client_profile_id
  from public.client_accounts
  where client_id = request_row.client_id
  order by is_primary desc, linked_at
  limit 1;
  if client_profile_id is null then raise exception 'Primary client account is required'; end if;

  project_number_value := private.next_operation_number(
    request_row.organization_id,
    case when request_row.request_type = 'estate' then 'EST' else 'CASE' end
  );

  insert into public.projects (
    organization_id, client_id, service_request_id, name, project_type,
    status, client_stage_label, primary_client_contact_user_id,
    department_id, project_manager_id, primary_assignee_id, project_number
  )
  values (
    request_row.organization_id, request_row.client_id, request_row.id,
    request_row.title, request_row.request_type, 'active', 'تم بدء المشروع',
    case_row.executor_id, department_id_value, case_row.executor_id,
    case_row.executor_id, project_number_value
  )
  on conflict (service_request_id) where service_request_id is not null
  do update set updated_at = now()
  returning id into project_id_value;

  insert into public.project_members (
    project_id, user_id, membership_role, can_contact_client, assigned_by
  )
  values (
    project_id_value, case_row.executor_id, 'project_manager', true, actor_id
  )
  on conflict (project_id, user_id) do update
  set left_at = null, membership_role = 'project_manager', can_contact_client = true;

  insert into public.project_members (
    project_id, user_id, membership_role, can_contact_client, assigned_by
  )
  select project_id_value, participant.user_id, participant.membership_role,
    participant.can_contact_client, actor_id
  from (
    values
      (case_row.responsible_id, 'department_manager', true),
      (case_row.follower_id, 'follower', false)
  ) as participant(user_id, membership_role, can_contact_client)
  where participant.user_id is not null
    and participant.user_id <> case_row.executor_id
  on conflict (project_id, user_id) do update
  set left_at = null,
      membership_role = excluded.membership_role,
      can_contact_client = excluded.can_contact_client;

  insert into public.conversations (
    organization_id, project_id, conversation_type, title, channel_key, created_by
  )
  values (
    request_row.organization_id, project_id_value, 'client',
    'محادثة العميل', 'client', actor_id
  )
  returning id into client_channel_id;

  insert into public.conversations (
    organization_id, project_id, conversation_type, title, channel_key, created_by
  )
  values (
    request_row.organization_id, project_id_value, 'internal',
    'محادثة فريق المشروع', 'internal', actor_id
  )
  returning id into internal_channel_id;

  insert into public.conversation_participants (conversation_id, user_id)
  select client_channel_id, participant_id
  from (
    select client_profile_id as participant_id
    union
    select case_row.executor_id
    union
    select case_row.responsible_id
    union
    select actor_id
  ) participants
  where participant_id is not null
  on conflict do nothing;

  insert into public.conversation_participants (conversation_id, user_id)
  select internal_channel_id, project_member.user_id
  from public.project_members project_member
  where project_member.project_id = project_id_value and project_member.left_at is null
  on conflict do nothing;

  insert into public.messages (
    conversation_id, sender_id, body, visibility
  )
  values (
    client_channel_id, actor_id,
    'مرحبًا بكم، تم بدء المشروع وتعيين المكلف المسؤول للتواصل معكم.',
    'client_visible'
  );

  update public.contracts
  set status = 'converted',
      contract_number = coalesce(
        contract_number,
        private.next_operation_number(request_row.organization_id, 'CON')
      ),
      updated_at = now()
  where id = contract_row.id;

  update public.service_requests
  set status = 'converted_to_project', updated_at = now()
  where id = request_row.id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id, metadata
  )
  values (
    request_row.id, 'converted_to_project', 'تم تحويل الطلب إلى مشروع',
    'client_visible', actor_id,
    jsonb_build_object(
      'project_id', project_id_value,
      'project_number', project_number_value,
      'workflow_template', case
        when request_row.request_type = 'estate' then 'estate-v2'
        else 'litigation-v2'
      end,
      'workflow_status', 'awaiting_template_publication'
    )
  );

  if request_row.request_type = 'estate' then
    insert into public.recurring_report_schedules (
      organization_id, project_id, report_type, interval_days,
      preparation_business_days, next_period_ends_on, created_by
    )
    values (
      request_row.organization_id, project_id_value, 'estate_quarterly',
      90, 15, current_date + 90, actor_id
    )
    on conflict (project_id, report_type) do nothing;
  end if;

  return project_id_value;
end;
$$;

create or replace function public.set_litigation_next_action(
  p_case_id uuid,
  p_title text,
  p_action_type text,
  p_due_at timestamptz default null,
  p_legal_due_date date default null,
  p_priority text default 'normal',
  p_assigned_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  case_row public.litigation_cases;
  action_id uuid;
begin
  select * into case_row from public.litigation_cases where id = p_case_id for update;
  if not found then raise exception 'Litigation case was not found'; end if;
  if not private.has_permission('litigation.set_next_action')
    or not private.can_access_project(case_row.project_id)
  then raise exception 'The current user cannot set the next action'; end if;
  if p_due_at is null and p_legal_due_date is null then
    raise exception 'The next action requires a date';
  end if;
  if p_priority not in ('normal', 'high', 'critical') then
    raise exception 'Unsupported priority';
  end if;

  update public.litigation_case_actions
  set status = 'superseded', updated_at = now()
  where id = case_row.current_next_action_id
    and status in ('planned', 'in_progress');

  insert into public.litigation_case_actions (
    litigation_case_id, title, action_type, due_at, legal_due_date,
    priority, assigned_to, created_by
  )
  values (
    case_row.id, trim(p_title), p_action_type, p_due_at, p_legal_due_date,
    p_priority, p_assigned_to, actor_id
  )
  returning id into action_id;

  update public.litigation_cases
  set current_next_action_id = action_id, status = 'active', updated_at = now()
  where id = case_row.id;

  return action_id;
end;
$$;

revoke all on function public.set_litigation_next_action(uuid, text, text, timestamptz, date, text, uuid)
from public, anon;
grant execute on function public.set_litigation_next_action(uuid, text, text, timestamptz, date, text, uuid)
to authenticated;

create or replace function public.transition_workflow_action(
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
  actor_id uuid := (select auth.uid());
  action_row public.workflow_action_instances;
  workflow_row public.workflow_instances;
  previous_status text;
  allowed boolean := false;
begin
  select * into action_row
  from public.workflow_action_instances
  where id = p_action_instance_id
  for update;
  if not found then raise exception 'Workflow action was not found'; end if;

  select workflow_instance.* into workflow_row
  from public.workflow_stage_instances stage_instance
  join public.workflow_instances workflow_instance on workflow_instance.id = stage_instance.workflow_instance_id
  where stage_instance.id = action_row.workflow_stage_instance_id;

  if workflow_row.project_id is not null and not private.can_access_project(workflow_row.project_id) then
    raise exception 'The current user cannot access this workflow';
  end if;
  if workflow_row.service_request_id is not null
    and not private.can_manage_pre_contract(workflow_row.service_request_id)
  then raise exception 'The current user cannot access this request workflow'; end if;

  if p_is_override then
    if not (
      private.has_permission('workflow.override_transition')
      or private.has_permission('system.override')
      or exists (
        select 1 from public.projects project
        where project.id = workflow_row.project_id
          and project.project_manager_id = actor_id
      )
    ) then raise exception 'The current user cannot override workflow transitions'; end if;
    if length(trim(coalesce(p_reason, ''))) < 5 then
      raise exception 'Override reason is required';
    end if;
  elsif not private.has_permission('workflow.transition') then
    raise exception 'The current user cannot transition workflow actions';
  end if;

  allowed := p_is_override or (action_row.status, p_new_status) in (
    ('awaiting_assignment', 'ready'),
    ('blocked', 'ready'),
    ('ready', 'in_progress'),
    ('in_progress', 'submitted'),
    ('submitted', 'awaiting_approval'),
    ('submitted', 'completed'),
    ('awaiting_approval', 'approved'),
    ('awaiting_approval', 'returned_for_revision'),
    ('returned_for_revision', 'in_progress'),
    ('approved', 'completed')
  );
  if not allowed then raise exception 'Unsupported workflow transition'; end if;

  previous_status := action_row.status;
  update public.workflow_action_instances
  set status = p_new_status,
      started_at = case when p_new_status = 'in_progress' then coalesce(started_at, now()) else started_at end,
      submitted_at = case when p_new_status in ('submitted', 'awaiting_approval') then now() else submitted_at end,
      approved_at = case when p_new_status = 'approved' then now() else approved_at end,
      approved_by = case when p_new_status = 'approved' then actor_id else approved_by end,
      returned_at = case when p_new_status = 'returned_for_revision' then now() else returned_at end,
      returned_by = case when p_new_status = 'returned_for_revision' then actor_id else returned_by end,
      return_reason = case when p_new_status = 'returned_for_revision' then trim(p_reason) else return_reason end,
      completed_at = case when p_new_status = 'completed' then now() else completed_at end,
      updated_at = now()
  where id = action_row.id;

  insert into public.workflow_transition_events (
    workflow_instance_id, action_instance_id, transition_type,
    previous_status, new_status, reason, actor_id
  )
  values (
    workflow_row.id, action_row.id,
    case when p_is_override then 'override' else 'transition' end,
    previous_status, p_new_status, nullif(trim(p_reason), ''), actor_id
  );
end;
$$;

revoke all on function public.transition_workflow_action(uuid, text, text, boolean)
from public, anon;
grant execute on function public.transition_workflow_action(uuid, text, text, boolean)
to authenticated;

create or replace function public.add_document_version(
  p_document_id uuid,
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
  document_row public.documents;
  next_version integer;
  version_id uuid;
begin
  if not private.has_permission('documents.upload') then
    raise exception 'The current user cannot upload document versions';
  end if;
  if p_storage_bucket <> 'legal-documents' then raise exception 'Unsupported storage bucket'; end if;
  if p_byte_size < 0 or p_byte_size > 26214400 then raise exception 'File exceeds the 25MB limit'; end if;
  if lower(split_part(p_file_name, '.', array_length(string_to_array(p_file_name, '.'), 1)))
    not in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png')
  then raise exception 'Unsupported file type'; end if;
  if p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid SHA-256'; end if;

  select * into document_row
  from public.documents where id = p_document_id and deleted_at is null
  for update;
  if not found then raise exception 'Document was not found'; end if;
  if document_row.project_id is not null and not private.can_access_project(document_row.project_id) then
    raise exception 'The current user cannot access this project';
  end if;
  if document_row.service_request_id is not null
    and not private.can_manage_pre_contract(document_row.service_request_id)
  then raise exception 'The current user cannot access this request'; end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.document_versions where document_id = document_row.id;

  insert into public.document_versions (
    document_id, version_number, storage_bucket, storage_path, file_name,
    mime_type, byte_size, sha256, uploaded_by
  )
  values (
    document_row.id, next_version, p_storage_bucket, p_storage_path, p_file_name,
    p_mime_type, p_byte_size, p_sha256, actor_id
  )
  returning id into version_id;

  update public.documents
  set current_version_number = next_version,
      client_visibility_status = case
        when client_visibility_status = 'published' then 'awaiting_approval'
        else client_visibility_status
      end,
      updated_at = now()
  where id = document_row.id;

  return version_id;
end;
$$;

revoke all on function public.add_document_version(uuid, text, text, text, text, bigint, text)
from public, anon;
grant execute on function public.add_document_version(uuid, text, text, text, text, bigint, text)
to authenticated;

create or replace function public.set_document_client_publication(
  p_document_id uuid,
  p_status text,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  document_row public.documents;
  event_title text;
begin
  if actor_id is null or not private.is_active_staff() then
    raise exception 'Only active staff can manage document publication';
  end if;
  if p_status not in ('draft', 'awaiting_approval', 'published', 'withdrawn') then
    raise exception 'Unsupported publication status';
  end if;
  if p_visibility not in ('internal', 'client_visible', 'requires_client_action') then
    raise exception 'Unsupported document visibility';
  end if;
  if p_visibility = 'internal' and p_status <> 'draft' then
    raise exception 'Internal documents must remain drafts';
  end if;

  select * into document_row
  from public.documents where id = p_document_id and deleted_at is null
  for update;
  if not found then raise exception 'Document was not found'; end if;

  if document_row.project_id is not null and not private.can_access_project(document_row.project_id) then
    raise exception 'The current user cannot manage this document';
  end if;
  if document_row.service_request_id is not null
    and not private.can_manage_pre_contract(document_row.service_request_id)
  then raise exception 'The current user cannot manage this document'; end if;

  if p_status = 'published' and not private.has_permission('documents.publish') then
    raise exception 'The current user cannot publish client documents';
  end if;
  if p_status = 'withdrawn' and not private.has_permission('documents.withdraw') then
    raise exception 'The current user cannot withdraw client documents';
  end if;
  if p_status = 'published' and not exists (
    select 1 from public.document_versions version
    where version.document_id = document_row.id
      and version.version_number = document_row.current_version_number
      and version.deleted_at is null
  ) then raise exception 'A current document version is required before publication'; end if;

  update public.documents
  set visibility = p_visibility,
      client_visibility_status = p_status,
      published_to_client_at = case when p_status = 'published' then now() else published_to_client_at end,
      published_by = case when p_status = 'published' then actor_id else published_by end,
      withdrawn_at = case when p_status = 'withdrawn' then now() when p_status = 'published' then null else withdrawn_at end,
      withdrawn_by = case when p_status = 'withdrawn' then actor_id when p_status = 'published' then null else withdrawn_by end,
      updated_at = now()
  where id = document_row.id;

  if document_row.service_request_id is not null then
    event_title := case p_status
      when 'published' then 'تم نشر مستند للعميل'
      when 'withdrawn' then 'تم سحب مستند من بوابة العميل'
      when 'awaiting_approval' then 'المستند بانتظار اعتماد النشر'
      else 'تم تحديث مستوى رؤية المستند'
    end;
    insert into public.pre_contract_events (
      service_request_id, event_code, title, details, visibility, actor_id, metadata
    )
    values (
      document_row.service_request_id, 'document_' || p_status, event_title,
      document_row.title,
      case when p_status = 'published' then p_visibility else 'internal' end,
      actor_id,
      jsonb_build_object('document_id', document_row.id, 'status', p_status, 'visibility', p_visibility)
    );
  end if;
end;
$$;

create or replace function private.can_access_workflow(target_workflow_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workflow_instances workflow_instance
    where workflow_instance.id = target_workflow_id
      and (
        (workflow_instance.project_id is not null and private.can_access_project(workflow_instance.project_id))
        or (
          workflow_instance.service_request_id is not null
          and private.can_manage_pre_contract(workflow_instance.service_request_id)
        )
      )
  );
$$;

revoke all on function private.can_access_workflow(uuid) from public, anon;
grant execute on function private.can_access_workflow(uuid) to authenticated;

create or replace function private.add_business_days(
  p_organization_id uuid,
  p_start_at timestamptz,
  p_days integer
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_at timestamptz := p_start_at;
  days_added integer := 0;
  calendar_row public.business_calendars;
begin
  if p_days < 0 then raise exception 'Business-day count cannot be negative'; end if;
  select * into calendar_row
  from public.business_calendars
  where organization_id = p_organization_id and is_default
  order by created_at
  limit 1;
  if not found then raise exception 'Default business calendar is not configured'; end if;

  while days_added < p_days loop
    result_at := result_at + interval '1 day';
    if extract(dow from result_at)::smallint = any(calendar_row.working_weekdays)
      and not exists (
        select 1 from public.business_calendar_holidays holiday
        where holiday.business_calendar_id = calendar_row.id
          and holiday.holiday_date = result_at::date
      )
    then
      days_added := days_added + 1;
    end if;
  end loop;
  return result_at;
end;
$$;

revoke all on function private.add_business_days(uuid, timestamptz, integer)
from public, anon;
grant execute on function private.add_business_days(uuid, timestamptz, integer)
to authenticated;

create or replace function public.create_project_team(
  p_project_id uuid,
  p_code text,
  p_name text,
  p_stage_instance_id uuid default null,
  p_leader_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  team_id uuid;
begin
  select * into project_row from public.projects
  where id = p_project_id and deleted_at is null;
  if not found then raise exception 'Project was not found'; end if;
  if not private.has_permission('project_teams.manage')
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot manage project teams'; end if;
  if length(trim(p_code)) < 2 or length(trim(p_name)) < 2 then
    raise exception 'Team code and name are required';
  end if;
  if p_leader_id is not null and not exists (
    select 1 from public.project_members member
    where member.project_id = project_row.id
      and member.user_id = p_leader_id and member.left_at is null
  ) then raise exception 'Team leader must be an active project member'; end if;

  insert into public.project_teams (
    organization_id, project_id, stage_instance_id, code, name,
    leader_id, status, created_by
  )
  values (
    project_row.organization_id, project_row.id, p_stage_instance_id,
    trim(p_code), trim(p_name), p_leader_id, 'active', actor_id
  )
  returning id into team_id;

  if p_leader_id is not null then
    insert into public.project_team_members (
      project_team_id, user_id, team_role, assigned_by
    )
    values (team_id, p_leader_id, 'leader', actor_id);
  end if;
  return team_id;
end;
$$;

create or replace function public.assign_project_team_member(
  p_project_team_id uuid,
  p_user_id uuid,
  p_team_role text default 'member'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  team_row public.project_teams;
  project_row public.projects;
begin
  select * into team_row from public.project_teams
  where id = p_project_team_id and status in ('planned', 'active')
  for update;
  if not found then raise exception 'Active project team was not found'; end if;
  select * into project_row from public.projects where id = team_row.project_id;

  if not private.has_permission('project_teams.assign')
    or not private.can_access_project(team_row.project_id)
  then raise exception 'The current user cannot assign project teams'; end if;
  if p_team_role not in ('leader', 'member', 'observer') then
    raise exception 'Unsupported team role';
  end if;
  if not exists (
    select 1 from public.project_members member
    where member.project_id = team_row.project_id
      and member.user_id = p_user_id and member.left_at is null
  ) then raise exception 'Team member must already belong to the project'; end if;

  if p_user_id = actor_id and not (
    project_row.project_manager_id = actor_id
    or private.has_permission('system.override')
    or exists (
      select 1 from public.profiles profile
      where profile.id = actor_id
        and profile.department_id = project_row.department_id
        and private.has_permission('projects.assign_manager')
    )
  ) then raise exception 'Self-assignment requires project or department manager authority'; end if;

  insert into public.project_team_members (
    project_team_id, user_id, team_role, assigned_by
  )
  values (team_row.id, p_user_id, p_team_role, actor_id)
  on conflict (project_team_id, user_id) do update
  set team_role = excluded.team_role,
      assigned_by = excluded.assigned_by,
      joined_at = now(),
      left_at = null;

  if p_team_role = 'leader' then
    update public.project_teams set leader_id = p_user_id, updated_at = now()
    where id = team_row.id;
  end if;
end;
$$;

revoke all on function public.create_project_team(uuid, text, text, uuid, uuid)
from public, anon;
grant execute on function public.create_project_team(uuid, text, text, uuid, uuid)
to authenticated;
revoke all on function public.assign_project_team_member(uuid, uuid, text)
from public, anon;
grant execute on function public.assign_project_team_member(uuid, uuid, text)
to authenticated;

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
begin
  select * into estate_project
  from public.projects
  where id = p_estate_project_id
    and project_type = 'estate'
    and deleted_at is null
  for update;
  if not found then raise exception 'Estate project was not found'; end if;
  if not private.has_permission('estates.manage_assets')
    or not private.can_access_project(estate_project.id)
  then raise exception 'The current user cannot create estate asset projects'; end if;
  if length(trim(p_asset_type)) < 2 or length(trim(p_name)) < 2 then
    raise exception 'Asset type and name are required';
  end if;

  insert into public.estate_assets (
    project_id, asset_type, name, description, current_stage, status
  )
  values (
    estate_project.id, trim(p_asset_type), trim(p_name),
    nullif(trim(p_description), ''), 'preparation', 'active'
  )
  returning id into new_asset_id;

  insert into public.projects (
    organization_id, client_id, name, project_type, status,
    client_stage_label, primary_client_contact_user_id, department_id,
    parent_project_id, estate_asset_id, project_manager_id,
    primary_assignee_id, project_number
  )
  values (
    estate_project.organization_id, estate_project.client_id,
    estate_project.name || ' - ' || trim(p_name), 'estate_asset', 'active',
    'تهيئة الأصل', estate_project.primary_client_contact_user_id,
    estate_project.department_id, estate_project.id, new_asset_id,
    estate_project.project_manager_id, estate_project.primary_assignee_id,
    private.next_operation_number(estate_project.organization_id, 'AST')
  )
  returning id into new_project_id;

  update public.estate_assets
  set asset_project_id = new_project_id, updated_at = now()
  where id = new_asset_id;

  insert into public.project_members (
    project_id, user_id, membership_role, can_contact_client, assigned_by
  )
  select new_project_id, member.user_id, member.membership_role,
    member.can_contact_client, actor_id
  from public.project_members member
  where member.project_id = estate_project.id
    and member.left_at is null
    and (
      member.user_id in (
        estate_project.project_manager_id,
        estate_project.primary_assignee_id
      )
      or member.membership_role in ('department_manager', 'follower')
    )
  on conflict do nothing;

  return query select new_asset_id, new_project_id;
end;
$$;

revoke all on function public.create_estate_asset_subproject(uuid, text, text, text)
from public, anon;
grant execute on function public.create_estate_asset_subproject(uuid, text, text, text)
to authenticated;

create or replace function public.reassign_workflow_action_participant(
  p_action_instance_id uuid,
  p_participant_type text,
  p_user_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workflow_id_value uuid;
  project_id_value uuid;
  action_template_id_value uuid;
  allow_self boolean;
  participant_id uuid;
begin
  if p_participant_type not in ('responsible', 'executor', 'follower', 'approver') then
    raise exception 'Unsupported participant type';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Reassignment reason is required';
  end if;
  if not private.has_permission('tasks.reassign') then
    raise exception 'The current user cannot reassign workflow actions';
  end if;

  select workflow_instance.id, workflow_instance.project_id, action_instance.action_template_id
  into workflow_id_value, project_id_value, action_template_id_value
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance
    on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow_instance
    on workflow_instance.id = stage_instance.workflow_instance_id
  where action_instance.id = p_action_instance_id;
  if not found or not private.can_access_workflow(workflow_id_value) then
    raise exception 'Workflow action was not found or is not accessible';
  end if;

  if project_id_value is not null and not exists (
    select 1 from public.project_members member
    where member.project_id = project_id_value
      and member.user_id = p_user_id and member.left_at is null
  ) then raise exception 'Assigned user must be an active project member'; end if;
  if not private.user_has_permission(p_user_id, 'tasks.submit')
    and p_participant_type = 'executor'
  then raise exception 'Executor lacks task submission permission'; end if;

  select coalesce(bool_or(rule.allow_self_assignment), false)
  into allow_self
  from public.workflow_action_assignment_rules rule
  where rule.workflow_action_template_id = action_template_id_value
    and rule.participant_type = p_participant_type;
  if p_user_id = actor_id and not allow_self
    and not private.has_permission('system.override')
  then raise exception 'Self-assignment is not allowed by the workflow template'; end if;

  update public.workflow_action_participants
  set unassigned_at = now(), unassigned_by = actor_id,
      assignment_reason = trim(p_reason)
  where workflow_action_instance_id = p_action_instance_id
    and participant_type = p_participant_type
    and unassigned_at is null;

  insert into public.workflow_action_participants (
    workflow_action_instance_id, participant_type, user_id,
    assigned_by, assignment_reason
  )
  values (
    p_action_instance_id, p_participant_type, p_user_id,
    actor_id, trim(p_reason)
  )
  returning id into participant_id;

  if p_participant_type = 'executor' then
    update public.workflow_action_instances
    set status = case when status = 'awaiting_assignment' then 'ready' else status end,
        updated_at = now()
    where id = p_action_instance_id;
  end if;
  return participant_id;
end;
$$;

create or replace function public.extend_workflow_action(
  p_action_instance_id uuid,
  p_extended_until timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workflow_id_value uuid;
begin
  if not private.has_permission('tasks.extend') then
    raise exception 'The current user cannot extend tasks';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Extension reason is required'; end if;
  select workflow_instance.id into workflow_id_value
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow_instance on workflow_instance.id = stage_instance.workflow_instance_id
  where action_instance.id = p_action_instance_id;
  if not found or not private.can_access_workflow(workflow_id_value) then
    raise exception 'Workflow action was not found or is not accessible';
  end if;
  if p_extended_until <= now() then raise exception 'Extension must be in the future'; end if;

  update public.workflow_action_instances
  set extended_until = p_extended_until, extension_reason = trim(p_reason),
      due_at = greatest(coalesce(due_at, p_extended_until), p_extended_until),
      updated_at = now()
  where id = p_action_instance_id;

  insert into public.workflow_transition_events (
    workflow_instance_id, action_instance_id, transition_type,
    new_status, reason, impact, actor_id
  )
  select workflow_id_value, action.id, 'extend', action.status, trim(p_reason),
    jsonb_build_object('extended_until', p_extended_until), actor_id
  from public.workflow_action_instances action where action.id = p_action_instance_id;
end;
$$;

create or replace function public.reopen_workflow_action(
  p_action_instance_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workflow_id_value uuid;
  previous_status text;
  project_manager_value uuid;
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Reopen reason is required'; end if;

  select workflow_instance.id, action_instance.status, project.project_manager_id
  into workflow_id_value, previous_status, project_manager_value
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow_instance on workflow_instance.id = stage_instance.workflow_instance_id
  left join public.projects project on project.id = workflow_instance.project_id
  where action_instance.id = p_action_instance_id
  for update of action_instance;
  if not found or not private.can_access_workflow(workflow_id_value) then
    raise exception 'Workflow action was not found or is not accessible';
  end if;
  if not (
    private.has_permission('workflow.reopen')
    or private.has_permission('system.override')
    or project_manager_value = actor_id
  ) then raise exception 'The current user cannot reopen workflow actions'; end if;
  if previous_status not in ('approved', 'completed', 'cancelled') then
    raise exception 'Only closed actions can be reopened';
  end if;

  update public.workflow_action_instances
  set status = 'in_progress', completed_at = null, approved_at = null,
      approved_by = null, reopened_at = now(), reopened_by = actor_id,
      reopen_reason = trim(p_reason), updated_at = now()
  where id = p_action_instance_id;

  insert into public.workflow_transition_events (
    workflow_instance_id, action_instance_id, transition_type,
    previous_status, new_status, reason, actor_id
  )
  values (
    workflow_id_value, p_action_instance_id, 'reopen',
    previous_status, 'in_progress', trim(p_reason), actor_id
  );
end;
$$;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.reassign_workflow_action_participant(uuid, text, uuid, text)',
    'public.extend_workflow_action(uuid, timestamptz, text)',
    'public.reopen_workflow_action(uuid, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', function_signature);
    execute format('grant execute on function %s to authenticated', function_signature);
  end loop;
end;
$$;

create or replace function public.send_conversation_message(
  p_conversation_id uuid,
  p_body text,
  p_reply_to_message_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  conversation_row public.conversations;
  message_id uuid;
begin
  select * into conversation_row
  from public.conversations
  where id = p_conversation_id and archived_at is null;
  if not found then raise exception 'Conversation was not found'; end if;
  if not exists (
    select 1 from public.conversation_participants participant
    where participant.conversation_id = conversation_row.id
      and participant.user_id = actor_id and participant.left_at is null
  ) then raise exception 'The current user is not a conversation participant'; end if;
  if length(trim(p_body)) < 1 or length(trim(p_body)) > 10000 then
    raise exception 'Message body is invalid';
  end if;
  if conversation_row.conversation_type = 'internal' then
    if not private.has_permission('messages.internal') then
      raise exception 'The current user cannot send internal messages';
    end if;
    if exists (
      select 1 from public.profiles profile
      where profile.id = actor_id and profile.account_kind = 'client'
    ) then raise exception 'Clients cannot access internal conversations'; end if;
  elsif not (
    private.has_permission('messages.client')
    or exists (
      select 1 from public.profiles profile
      where profile.id = actor_id and profile.account_kind = 'client'
    )
  ) then raise exception 'The current user cannot send client messages'; end if;
  if p_reply_to_message_id is not null and not exists (
    select 1 from public.messages message
    where message.id = p_reply_to_message_id
      and message.conversation_id = conversation_row.id
      and message.deleted_at is null
  ) then raise exception 'Reply target is not in this conversation'; end if;

  insert into public.messages (
    conversation_id, sender_id, body, visibility, reply_to_message_id
  )
  values (
    conversation_row.id, actor_id, trim(p_body),
    case when conversation_row.conversation_type = 'client'
      then 'client_visible' else 'internal'
    end,
    p_reply_to_message_id
  )
  returning id into message_id;

  update public.conversations
  set last_message_at = now(), updated_at = now()
  where id = conversation_row.id;

  insert into public.message_receipts (message_id, user_id, delivered_at)
  select message_id, participant.user_id, null
  from public.conversation_participants participant
  where participant.conversation_id = conversation_row.id
    and participant.left_at is null
    and participant.user_id <> actor_id
  on conflict do nothing;

  return message_id;
end;
$$;

create or replace function public.edit_conversation_message(
  p_message_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(trim(p_body)) < 1 or length(trim(p_body)) > 10000 then
    raise exception 'Message body is invalid';
  end if;
  update public.messages
  set body = trim(p_body), edited_at = now()
  where id = p_message_id
    and sender_id = (select auth.uid())
    and deleted_at is null
    and hidden_at is null
    and now() <= edit_deadline_at;
  if not found then raise exception 'Message cannot be edited after 15 minutes'; end if;
end;
$$;

create or replace function public.mark_message_receipt(
  p_message_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('delivered', 'read') then raise exception 'Unsupported receipt status'; end if;
  if not exists (
    select 1
    from public.messages message
    join public.conversation_participants participant
      on participant.conversation_id = message.conversation_id
    where message.id = p_message_id
      and participant.user_id = (select auth.uid())
      and participant.left_at is null
  ) then raise exception 'Message is not accessible'; end if;

  insert into public.message_receipts (
    message_id, user_id, delivered_at, read_at
  )
  values (
    p_message_id, (select auth.uid()), now(),
    case when p_status = 'read' then now() else null end
  )
  on conflict (message_id, user_id) do update
  set delivered_at = coalesce(message_receipts.delivered_at, excluded.delivered_at),
      read_at = case
        when p_status = 'read' then coalesce(message_receipts.read_at, excluded.read_at)
        else message_receipts.read_at
      end;
end;
$$;

create or replace function public.moderate_conversation_message(
  p_message_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('messages.moderate') then
    raise exception 'The current user cannot moderate messages';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Moderation reason is required';
  end if;
  update public.messages
  set hidden_at = now(), hidden_by = (select auth.uid()),
      moderation_reason = trim(p_reason)
  where id = p_message_id and hidden_at is null;
  if not found then raise exception 'Message was not found or is already hidden'; end if;
end;
$$;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.send_conversation_message(uuid, text, uuid)',
    'public.edit_conversation_message(uuid, text)',
    'public.mark_message_receipt(uuid, text)',
    'public.moderate_conversation_message(uuid, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', function_signature);
    execute format('grant execute on function %s to authenticated', function_signature);
  end loop;
end;
$$;

create trigger audit_conversations_v2 after insert or update on public.conversations
for each row execute function private.audit_row_change();
create trigger audit_messages_v2 after insert or update on public.messages
for each row execute function private.audit_row_change();
create trigger audit_workflow_participants_v2 after insert or update on public.workflow_action_participants
for each row execute function private.audit_row_change();
create trigger audit_message_receipts_v2 after insert or update on public.message_receipts
for each row execute function private.audit_row_change();

create or replace function private.broadcast_message_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'conversation:' || coalesce(new.conversation_id, old.conversation_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return coalesce(new, old);
end;
$$;

create trigger messages_private_broadcast
after insert or update on public.messages
for each row execute function private.broadcast_message_change();

create policy conversation_private_broadcast_read
on realtime.messages for select to authenticated
using (
  exists (
    select 1
    from public.conversation_participants participant
    where 'conversation:' || participant.conversation_id::text = (select realtime.topic())
      and participant.user_id = (select auth.uid())
      and participant.left_at is null
  )
);

revoke all on function private.broadcast_message_change()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policy alignment and safe backfill
-- ---------------------------------------------------------------------------

drop policy if exists audit_logs_super_admin_select on private.audit_logs;
create policy audit_logs_permission_select on private.audit_logs
for select to authenticated using ((select private.has_permission('audit.read')));

drop policy if exists clients_staff_select on public.clients;
create policy clients_staff_select on public.clients
for select to authenticated using (
  archived_at is null
  and (
    (select private.has_permission('clients.read'))
    or exists (
      select 1 from public.client_accounts account
      where account.client_id = clients.id and account.profile_id = (select auth.uid())
    )
  )
);

create policy profiles_client_directory on public.profiles
for select to authenticated using (
  (select private.has_permission('clients.read'))
  and account_kind = 'client'
  and is_active
  and deleted_at is null
);

drop policy if exists service_requests_staff_select on public.service_requests;
create policy service_requests_staff_select on public.service_requests
for select to authenticated using (
  deleted_at is null
  and (
    (select private.can_manage_pre_contract(id))
    or (
      visibility <> 'internal'
      and exists (
        select 1 from public.client_accounts account
        where account.client_id = service_requests.client_id
          and account.profile_id = (select auth.uid())
      )
    )
    or exists (
      select 1 from public.projects project
      where project.service_request_id = service_requests.id
        and (select private.can_access_project(project.id))
    )
  )
);

drop policy if exists documents_staff_project_select on public.documents;
create policy documents_staff_project_select on public.documents
for select to authenticated using (
  deleted_at is null
  and (select private.is_active_staff())
  and (
    (
      (select private.has_permission('documents.read_internal'))
      and (
        (service_request_id is not null and (select private.can_manage_pre_contract(service_request_id)))
        or (project_id is not null and (select private.can_access_project(project_id)))
        or created_by = (select auth.uid())
      )
    )
  )
);

update public.service_requests
set data_version = 'legacy',
    legacy_at = coalesce(legacy_at, now()),
    needs_manager_review = status = 'received'
where legacy_at is null;

update public.projects project
set data_version = 'legacy',
    legacy_at = coalesce(project.legacy_at, now()),
    department_id = coalesce(
      project.department_id,
      (
        select department.id
        from public.departments department
        where department.organization_id = project.organization_id
          and department.code = case
            when project.project_type = 'litigation' then 'litigation'
            when project.project_type = 'estate' then 'estates'
            else null
          end
        limit 1
      )
    )
where project.legacy_at is null;

update public.workflow_instances
set data_version = 'legacy',
    legacy_at = coalesce(legacy_at, now())
where legacy_at is null;

update storage.buckets
set public = false,
    file_size_limit = 26214400,
    allowed_mime_types = array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png'
    ]::text[]
where id = 'legal-documents';

revoke all on function private.prevent_evidence_mutation() from public, anon, authenticated;
revoke all on function private.guard_workflow_start() from public, anon, authenticated;
revoke all on function private.guard_active_case_next_action() from public, anon, authenticated;
