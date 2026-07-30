-- Specialized litigation supervision and multiple project assignees.
-- This migration is additive. Existing requests and projects are preserved and
-- remain unclassified until an authorized user reviews them.

-- ---------------------------------------------------------------------------
-- Categories, role and permissions
-- ---------------------------------------------------------------------------

create table public.litigation_case_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text not null check (length(trim(name)) >= 2),
  sort_order integer not null default 100 check (sort_order >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

insert into public.litigation_case_categories (
  organization_id, code, name, sort_order
)
select organization.id, category.code, category.name, category.sort_order
from public.organizations organization
cross join (
  values
    ('commercial', 'القضايا التجارية', 10),
    ('labor', 'القضايا العمالية', 20),
    ('medical_malpractice', 'قضايا الأخطاء الطبية', 30),
    ('enforcement', 'قضايا التنفيذ', 40),
    ('personal_status', 'قضايا الأحوال الشخصية', 50),
    ('civil_rights', 'القضايا الحقوقية', 60),
    ('administrative', 'القضايا الإدارية', 70)
) as category(code, name, sort_order)
on conflict (organization_id, code) do update
set name = excluded.name,
    sort_order = excluded.sort_order;

alter table public.service_requests
  add column litigation_case_category_id uuid
    references public.litigation_case_categories(id) on delete restrict,
  add column needs_category_review boolean not null default false;

alter table public.projects
  add column litigation_case_category_id uuid
    references public.litigation_case_categories(id) on delete restrict,
  add column needs_category_review boolean not null default false;

create index service_requests_litigation_category_idx
  on public.service_requests (litigation_case_category_id, status)
  where request_type = 'litigation' and deleted_at is null;
create index projects_litigation_category_idx
  on public.projects (litigation_case_category_id, status)
  where project_type in ('litigation', 'estate_litigation') and deleted_at is null;

update public.service_requests
set needs_category_review = true
where request_type = 'litigation'
  and litigation_case_category_id is null
  and deleted_at is null;

update public.projects
set needs_category_review = true
where project_type in ('litigation', 'estate_litigation')
  and litigation_case_category_id is null
  and deleted_at is null;

insert into public.roles (organization_id, name, code, is_system)
select organization.id, 'مشرف القضايا', 'litigation_supervisor', true
from public.organizations organization
on conflict (organization_id, code) do update
set name = excluded.name,
    is_active = true;

insert into public.job_titles (organization_id, department_id, name, code)
select organization.id, department.id, 'مشرف القضايا', 'litigation_supervisor'
from public.organizations organization
join public.departments department
  on department.organization_id = organization.id
 and department.code = 'litigation'
on conflict (organization_id, code) do update
set name = excluded.name,
    department_id = excluded.department_id,
    is_active = true;

insert into public.permissions (code, description)
values
  ('clients.read_specialty', 'قراءة بيانات عملاء القضايا الواقعة ضمن تخصص المشرف'),
  ('projects.read_specialty', 'قراءة مشاريع التقاضي الواقعة ضمن تخصص المشرف'),
  ('supervision.read', 'فتح لوحة الإشراف وقراءة تطورات القضايا المطابقة'),
  ('supervision.issue_notice', 'إصدار لفت نظر تشغيلي موثق للمكلف'),
  ('supervision.manage_specialties', 'إدارة تخصصات مشرفي القضايا'),
  ('attention_notices.acknowledge', 'تأكيد الاطلاع والرد على لفت النظر'),
  ('case_categories.manage', 'إدارة قائمة أنواع القضايا'),
  ('projects.assign_assistants', 'إضافة وإزالة المكلفين المساعدين'),
  ('messages.read_internal', 'قراءة المحادثة الداخلية دون حق الإرسال')
on conflict (code) do update set description = excluded.description;

with role_permission_map(role_code, permission_code) as (
  values
    ('litigation_supervisor', 'clients.read_specialty'),
    ('litigation_supervisor', 'projects.read_specialty'),
    ('litigation_supervisor', 'supervision.read'),
    ('litigation_supervisor', 'supervision.issue_notice'),
    ('litigation_supervisor', 'documents.read_internal'),
    ('litigation_supervisor', 'messages.read_internal'),
    ('litigation_manager', 'projects.assign_assistants'),
    ('litigation_secretary', 'projects.assign_assistants'),
    ('lawyer', 'attention_notices.acknowledge'),
    ('legal_specialist', 'attention_notices.acknowledge'),
    ('litigation_manager', 'attention_notices.acknowledge'),
    ('litigation_secretary', 'attention_notices.acknowledge'),
    ('super_admin', 'clients.read_specialty'),
    ('super_admin', 'projects.read_specialty'),
    ('super_admin', 'supervision.read'),
    ('super_admin', 'supervision.issue_notice'),
    ('super_admin', 'supervision.manage_specialties'),
    ('super_admin', 'attention_notices.acknowledge'),
    ('super_admin', 'case_categories.manage'),
    ('super_admin', 'projects.assign_assistants'),
    ('super_admin', 'messages.read_internal')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permission_map mapping
join public.roles role on role.code = mapping.role_code
join public.permissions permission on permission.code = mapping.permission_code
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Supervisor specialties, assignees and notices
-- ---------------------------------------------------------------------------

create table public.litigation_supervisor_specialties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  supervisor_id uuid not null references public.profiles(id) on delete restrict,
  category_id uuid not null references public.litigation_case_categories(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete restrict,
  unique (supervisor_id, category_id)
);

create unique index litigation_supervisor_specialties_active_idx
  on public.litigation_supervisor_specialties (supervisor_id, category_id)
  where revoked_at is null;
create index litigation_supervisor_specialties_category_idx
  on public.litigation_supervisor_specialties (category_id, supervisor_id)
  where revoked_at is null;

create table public.project_assignees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  assignment_kind text not null
    check (assignment_kind in ('primary', 'assistant')),
  can_contact_client boolean not null default true,
  assigned_by uuid references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete restrict,
  end_reason text
);

create unique index project_assignees_active_user_idx
  on public.project_assignees (project_id, user_id)
  where ended_at is null;
create unique index project_assignees_single_primary_idx
  on public.project_assignees (project_id)
  where assignment_kind = 'primary' and ended_at is null;
create index project_assignees_user_idx
  on public.project_assignees (user_id, project_id)
  where ended_at is null;

create table public.litigation_case_action_assignees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  litigation_action_id uuid not null
    references public.litigation_case_actions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  is_lead boolean not null default false,
  assigned_by uuid references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete restrict,
  unique (litigation_action_id, user_id)
);

create index litigation_action_assignees_user_idx
  on public.litigation_case_action_assignees (user_id, litigation_action_id)
  where ended_at is null;

create table public.project_attention_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  workflow_action_instance_id uuid
    references public.workflow_action_instances(id) on delete restrict,
  litigation_action_id uuid
    references public.litigation_case_actions(id) on delete restrict,
  target_user_id uuid not null references public.profiles(id) on delete restrict,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 5 and 1000),
  status text not null default 'sent'
    check (status in ('sent', 'acknowledged')),
  acknowledged_at timestamptz,
  response_text text check (
    response_text is null or length(trim(response_text)) between 1 and 2000
  ),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(workflow_action_instance_id, litigation_action_id) = 1),
  check (
    (status = 'sent' and acknowledged_at is null)
    or (status = 'acknowledged' and acknowledged_at is not null)
  )
);

create index project_attention_notices_project_idx
  on public.project_attention_notices (project_id, created_at desc);
create index project_attention_notices_target_idx
  on public.project_attention_notices (target_user_id, status, created_at desc);

insert into public.project_assignees (
  organization_id, project_id, user_id, assignment_kind,
  can_contact_client, assigned_by, assigned_at
)
select project.organization_id, project.id, project.primary_assignee_id,
  'primary', true, project.primary_assignee_id, project.created_at
from public.projects project
where project.primary_assignee_id is not null
  and project.deleted_at is null
on conflict do nothing;

insert into public.litigation_case_action_assignees (
  organization_id, litigation_action_id, user_id, is_lead,
  assigned_by, assigned_at
)
select litigation_case.organization_id, action.id, action.assigned_to, true,
  action.created_by, action.created_at
from public.litigation_case_actions action
join public.litigation_cases litigation_case
  on litigation_case.id = action.litigation_case_id
where action.assigned_to is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Scope helpers and category synchronization
-- ---------------------------------------------------------------------------

create or replace function private.can_supervise_project(
  target_project_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects project
    join public.litigation_supervisor_specialties specialty
      on specialty.category_id = project.litigation_case_category_id
     and specialty.supervisor_id = target_user_id
     and specialty.revoked_at is null
    join public.profiles profile
      on profile.id = target_user_id
     and profile.organization_id = project.organization_id
     and profile.activation_status = 'active_staff'
     and profile.is_active
     and profile.deleted_at is null
    where project.id = target_project_id
      and project.project_type in ('litigation', 'estate_litigation')
      and project.deleted_at is null
      and private.user_has_permission(target_user_id, 'projects.read_specialty')
      and private.user_has_permission(target_user_id, 'supervision.read')
  );
$$;

revoke all on function private.can_supervise_project(uuid, uuid)
from public, anon;
grant execute on function private.can_supervise_project(uuid, uuid)
to authenticated;

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
    or private.can_supervise_project(target_project_id, (select auth.uid()))
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

create or replace function private.sync_project_litigation_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_category_id uuid;
begin
  if new.project_type not in ('litigation', 'estate_litigation') then
    return new;
  end if;

  if new.litigation_case_category_id is null
    and new.service_request_id is not null
  then
    select request.litigation_case_category_id
    into request_category_id
    from public.service_requests request
    where request.id = new.service_request_id;
    new.litigation_case_category_id := request_category_id;
  end if;

  if new.service_request_id is not null
    and new.litigation_case_category_id is null
  then
    raise exception 'A litigation case category is required before conversion';
  end if;

  new.needs_category_review := new.litigation_case_category_id is null;
  return new;
end;
$$;

create trigger projects_sync_litigation_category
before insert or update of service_request_id, project_type,
  litigation_case_category_id
on public.projects
for each row execute function private.sync_project_litigation_category();

create or replace function private.notify_matching_supervisors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_type not in ('litigation', 'estate_litigation')
    or new.litigation_case_category_id is null
  then
    return new;
  end if;

  insert into public.notifications (
    recipient_id, notification_type, title, body, data
  )
  select specialty.supervisor_id,
    'specialized_case_available',
    'قضية جديدة ضمن تخصصك',
    new.name,
    jsonb_build_object(
      'project_id', new.id,
      'category_id', new.litigation_case_category_id
    )
  from public.litigation_supervisor_specialties specialty
  join public.profiles profile on profile.id = specialty.supervisor_id
  where specialty.category_id = new.litigation_case_category_id
    and specialty.revoked_at is null
    and profile.activation_status = 'active_staff'
    and profile.is_active
    and profile.deleted_at is null;

  return new;
end;
$$;

create trigger projects_notify_matching_supervisors
after insert on public.projects
for each row execute function private.notify_matching_supervisors();

-- Keep the compatibility primary-assignee fields and the assignment ledger aligned.
create or replace function private.sync_primary_project_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.primary_assignee_id is not null
    and old.primary_assignee_id is distinct from new.primary_assignee_id
  then
    update public.project_assignees
    set ended_at = now(),
        ended_by = (select auth.uid()),
        end_reason = 'primary_assignee_changed'
    where project_id = new.id
      and assignment_kind = 'primary'
      and ended_at is null;
  end if;

  if new.primary_assignee_id is not null then
    insert into public.project_assignees (
      organization_id, project_id, user_id, assignment_kind,
      can_contact_client, assigned_by
    )
    values (
      new.organization_id, new.id, new.primary_assignee_id, 'primary',
      true, coalesce((select auth.uid()), new.primary_assignee_id)
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger projects_sync_primary_assignee
after insert or update of primary_assignee_id on public.projects
for each row execute function private.sync_primary_project_assignee();

create or replace function private.seed_litigation_action_assignees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_id_value uuid;
  organization_id_value uuid;
begin
  select litigation_case.project_id, litigation_case.organization_id
  into project_id_value, organization_id_value
  from public.litigation_cases litigation_case
  where litigation_case.id = new.litigation_case_id;

  insert into public.litigation_case_action_assignees (
    organization_id, litigation_action_id, user_id, is_lead,
    assigned_by
  )
  select organization_id_value, new.id, assignee.user_id,
    assignee.user_id = new.assigned_to,
    coalesce((select auth.uid()), new.created_by)
  from public.project_assignees assignee
  where assignee.project_id = project_id_value
    and assignee.ended_at is null
  on conflict do nothing;

  if new.assigned_to is not null then
    insert into public.litigation_case_action_assignees (
      organization_id, litigation_action_id, user_id, is_lead,
      assigned_by
    )
    values (
      organization_id_value, new.id, new.assigned_to, true,
      coalesce((select auth.uid()), new.created_by)
    )
    on conflict (litigation_action_id, user_id) do update
    set is_lead = true,
        ended_at = null,
        ended_by = null;
  end if;
  return new;
end;
$$;

create trigger litigation_actions_seed_assignees
after insert on public.litigation_case_actions
for each row execute function private.seed_litigation_action_assignees();

create or replace function private.seed_workflow_action_assignees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_id_value uuid;
begin
  select workflow_instance.project_id
  into project_id_value
  from public.workflow_stage_instances stage_instance
  join public.workflow_instances workflow_instance
    on workflow_instance.id = stage_instance.workflow_instance_id
  where stage_instance.id = new.workflow_stage_instance_id;

  if project_id_value is null then return new; end if;

  insert into public.workflow_action_participants (
    workflow_action_instance_id, participant_type, user_id,
    assigned_by, assignment_reason
  )
  select new.id, 'executor', assignee.user_id,
    coalesce((select auth.uid()), assignee.assigned_by, assignee.user_id),
    case
      when assignee.assignment_kind = 'assistant' then 'assistant_assignee'
      else 'project_primary_assignee'
    end
  from public.project_assignees assignee
  where assignee.project_id = project_id_value
    and assignee.ended_at is null
  on conflict do nothing;

  return new;
end;
$$;

create trigger workflow_actions_seed_project_assignees
after insert on public.workflow_action_instances
for each row execute function private.seed_workflow_action_assignees();

-- ---------------------------------------------------------------------------
-- Guarded operations
-- ---------------------------------------------------------------------------

create or replace function public.create_staff_service_request_v2(
  p_client_profile_id uuid,
  p_request_type text,
  p_title text,
  p_summary text,
  p_litigation_case_category_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id_value uuid;
  request_row public.service_requests;
begin
  request_id_value := public.create_staff_service_request(
    p_client_profile_id,
    p_request_type,
    p_title,
    p_summary
  );

  select * into request_row
  from public.service_requests
  where id = request_id_value
  for update;

  if p_request_type = 'litigation' then
    if p_litigation_case_category_id is null or not exists (
      select 1
      from public.litigation_case_categories category
      where category.id = p_litigation_case_category_id
        and category.organization_id = request_row.organization_id
        and category.is_active
    ) then
      raise exception 'An active litigation case category is required';
    end if;
  elsif p_litigation_case_category_id is not null then
    raise exception 'Case categories are only available for litigation requests';
  end if;

  update public.service_requests
  set litigation_case_category_id = p_litigation_case_category_id,
      needs_category_review = false,
      updated_at = now()
  where id = request_id_value;

  return request_id_value;
end;
$$;

create or replace function public.update_litigation_case_category(
  p_request_id uuid,
  p_category_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_row public.service_requests;
  project_row public.projects;
  old_category_id uuid;
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A documented category change reason is required';
  end if;

  select * into request_row
  from public.service_requests
  where id = p_request_id
    and request_type = 'litigation'
    and deleted_at is null
  for update;
  if not found then raise exception 'Litigation request was not found'; end if;

  if not exists (
    select 1 from public.litigation_case_categories category
    where category.id = p_category_id
      and category.organization_id = request_row.organization_id
      and category.is_active
  ) then raise exception 'Selected case category is not active'; end if;

  select * into project_row
  from public.projects project
  where project.service_request_id = request_row.id
    and project.deleted_at is null
  for update;

  if project_row.id is null then
    if not private.has_permission('requests.manage')
      or not private.can_manage_pre_contract(request_row.id)
    then raise exception 'The current user cannot classify this request'; end if;
  elsif not (
    private.has_permission('litigation.manage_cases')
    or private.has_permission('system.override')
  ) or not private.can_access_project(project_row.id) then
    raise exception 'Only litigation management can reclassify a project';
  end if;

  old_category_id := request_row.litigation_case_category_id;

  update public.service_requests
  set litigation_case_category_id = p_category_id,
      needs_category_review = false,
      updated_at = now()
  where id = request_row.id;

  if project_row.id is not null then
    update public.projects
    set litigation_case_category_id = p_category_id,
        needs_category_review = false,
        updated_at = now()
    where id = project_row.id;

    if old_category_id is distinct from p_category_id then
      insert into public.notifications (
        recipient_id, notification_type, title, body, data
      )
      select specialty.supervisor_id,
        'specialized_case_available',
        'أضيفت قضية إلى نطاق إشرافك',
        project_row.name,
        jsonb_build_object(
          'project_id', project_row.id,
          'category_id', p_category_id,
          'reclassified', true
        )
      from public.litigation_supervisor_specialties specialty
      join public.profiles profile on profile.id = specialty.supervisor_id
      where specialty.category_id = p_category_id
        and specialty.revoked_at is null
        and profile.activation_status = 'active_staff'
        and profile.is_active
        and profile.deleted_at is null
        and specialty.supervisor_id <> actor_id;
    end if;
  end if;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, details,
    visibility, actor_id, metadata
  )
  values (
    request_row.id, 'litigation_category_updated',
    'تم تحديث نوع القضية', trim(p_reason),
    'internal', actor_id,
    jsonb_build_object(
      'old_category_id', old_category_id,
      'new_category_id', p_category_id
    )
  );
end;
$$;

create or replace function private.replace_supervisor_specialties(
  p_profile_id uuid,
  p_category_ids uuid[],
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_row public.profiles;
  normalized_ids uuid[];
  is_supervisor boolean;
  valid_count integer;
begin
  select * into profile_row
  from public.profiles
  where id = p_profile_id
    and account_kind = 'staff'
    and deleted_at is null;
  if not found then raise exception 'Staff profile was not found'; end if;

  select exists (
    select 1
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    where user_role.user_id = profile_row.id
      and user_role.revoked_at is null
      and role.code = 'litigation_supervisor'
  ) into is_supervisor;

  select coalesce(array_agg(distinct category_id), '{}'::uuid[])
  into normalized_ids
  from unnest(coalesce(p_category_ids, '{}'::uuid[])) category_id;

  if is_supervisor and cardinality(normalized_ids) = 0 then
    raise exception 'A litigation supervisor requires at least one specialty';
  end if;
  if not is_supervisor and cardinality(normalized_ids) > 0 then
    raise exception 'Specialties require the litigation supervisor role';
  end if;

  select count(*) into valid_count
  from public.litigation_case_categories category
  where category.id = any(normalized_ids)
    and category.organization_id = profile_row.organization_id
    and category.is_active;
  if valid_count <> cardinality(normalized_ids) then
    raise exception 'One or more supervisor specialties are invalid';
  end if;

  update public.litigation_supervisor_specialties
  set revoked_at = now(), revoked_by = p_actor_id
  where supervisor_id = profile_row.id
    and revoked_at is null
    and not (category_id = any(normalized_ids));

  insert into public.litigation_supervisor_specialties (
    organization_id, supervisor_id, category_id, assigned_by
  )
  select profile_row.organization_id, profile_row.id, category_id, p_actor_id
  from unnest(normalized_ids) category_id
  on conflict (supervisor_id, category_id) do update
  set assigned_by = excluded.assigned_by,
      assigned_at = now(),
      revoked_at = null,
      revoked_by = null;
end;
$$;

revoke all on function private.replace_supervisor_specialties(uuid, uuid[], uuid)
from public, anon, authenticated;

create or replace function public.approve_staff_registration_v2(
  p_request_id uuid,
  p_department_id uuid,
  p_job_title_id uuid,
  p_role_ids uuid[],
  p_specialty_ids uuid[] default '{}'::uuid[],
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_id_value uuid;
  actor_id uuid := (select auth.uid());
begin
  select request.profile_id into profile_id_value
  from public.staff_registration_requests request
  where request.id = p_request_id
    and request.status = 'pending'
  for update;
  if profile_id_value is null then
    raise exception 'Pending staff registration request was not found';
  end if;

  perform public.approve_staff_registration(
    p_request_id, p_department_id, p_job_title_id,
    p_role_ids, p_review_notes
  );
  perform private.replace_supervisor_specialties(
    profile_id_value, p_specialty_ids, actor_id
  );
end;
$$;

create or replace function public.update_staff_access_v2(
  p_profile_id uuid,
  p_full_name text,
  p_phone text,
  p_department_id uuid,
  p_job_title_id uuid,
  p_role_ids uuid[],
  p_specialty_ids uuid[] default '{}'::uuid[],
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  perform public.update_staff_access(
    p_profile_id, p_full_name, p_phone, p_department_id,
    p_job_title_id, p_role_ids, p_reason
  );
  perform private.replace_supervisor_specialties(
    p_profile_id, p_specialty_ids, actor_id
  );
end;
$$;

create or replace function public.manage_litigation_case_category(
  p_category_id uuid,
  p_code text,
  p_name text,
  p_sort_order integer,
  p_is_active boolean,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  organization_id_value uuid;
  category_id_value uuid;
begin
  if not private.has_permission('case_categories.manage') then
    raise exception 'The current user cannot manage case categories';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A documented category change reason is required';
  end if;
  if trim(coalesce(p_code, '')) !~ '^[a-z][a-z0-9_]{1,63}$'
    or length(trim(coalesce(p_name, ''))) < 2
    or p_sort_order < 0
  then raise exception 'Category data is invalid'; end if;

  select profile.organization_id into organization_id_value
  from public.profiles profile
  where profile.id = actor_id
    and profile.activation_status = 'active_staff'
    and profile.is_active;
  if organization_id_value is null then raise exception 'Active staff is required'; end if;

  if p_category_id is null then
    insert into public.litigation_case_categories (
      organization_id, code, name, sort_order, is_active, created_by
    )
    values (
      organization_id_value, trim(p_code), trim(p_name),
      p_sort_order, p_is_active, actor_id
    )
    returning id into category_id_value;
  else
    update public.litigation_case_categories
    set code = trim(p_code),
        name = trim(p_name),
        sort_order = p_sort_order,
        is_active = p_is_active,
        updated_at = now()
    where id = p_category_id
      and organization_id = organization_id_value
    returning id into category_id_value;
    if category_id_value is null then raise exception 'Case category was not found'; end if;
  end if;

  insert into private.audit_logs (
    organization_id, actor_user_id, action,
    entity_schema, entity_table, entity_id, new_data
  )
  values (
    organization_id_value, actor_id, 'case_category_managed',
    'public', 'litigation_case_categories', category_id_value::text,
    jsonb_build_object(
      'code', trim(p_code),
      'name', trim(p_name),
      'sort_order', p_sort_order,
      'is_active', p_is_active,
      'reason', trim(p_reason)
    )
  );
  return category_id_value;
end;
$$;

create or replace function public.assign_project_assignee(
  p_project_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  assignment_id uuid;
begin
  select * into project_row
  from public.projects
  where id = p_project_id
    and project_type in ('litigation', 'estate_litigation')
    and deleted_at is null
  for update;
  if not found then raise exception 'Litigation project was not found'; end if;

  if not private.has_permission('projects.assign_assistants')
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot assign project assistants'; end if;
  if p_user_id = project_row.primary_assignee_id then
    raise exception 'The selected user is already the primary assignee';
  end if;
  if p_user_id = actor_id and not (
    private.has_permission('projects.assign_manager')
    or private.has_permission('system.override')
  ) then raise exception 'A secretary cannot assign themselves'; end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and profile.organization_id = project_row.organization_id
      and profile.department_id = project_row.department_id
      and profile.activation_status = 'active_staff'
      and profile.is_active
      and profile.deleted_at is null
      and private.user_has_permission(profile.id, 'litigation.actions.respond')
  ) then raise exception 'The assistant must be an active eligible litigation staff member'; end if;

  insert into public.project_assignees (
    organization_id, project_id, user_id, assignment_kind,
    can_contact_client, assigned_by
  )
  values (
    project_row.organization_id, project_row.id, p_user_id,
    'assistant', true, actor_id
  )
  on conflict do nothing
  returning id into assignment_id;

  if assignment_id is null then
    select id into assignment_id
    from public.project_assignees
    where project_id = project_row.id
      and user_id = p_user_id
      and ended_at is null;
  end if;

  insert into public.project_members (
    project_id, user_id, membership_role, can_contact_client, assigned_by
  )
  values (
    project_row.id, p_user_id, 'assistant_assignee', true, actor_id
  )
  on conflict (project_id, user_id) do update
  set left_at = null,
      can_contact_client = true,
      assigned_by = excluded.assigned_by,
      membership_role = case
        when project_members.left_at is not null
          or project_members.membership_role = 'assistant_assignee'
        then 'assistant_assignee'
        else project_members.membership_role
      end;

  insert into public.conversation_participants (
    conversation_id, user_id
  )
  select conversation.id, p_user_id
  from public.conversations conversation
  where conversation.project_id = project_row.id
    and conversation.archived_at is null
  on conflict (conversation_id, user_id) do update
  set left_at = null,
      joined_at = now();

  insert into public.litigation_case_action_assignees (
    organization_id, litigation_action_id, user_id,
    is_lead, assigned_by
  )
  select project_row.organization_id, action.id, p_user_id,
    false, actor_id
  from public.litigation_case_actions action
  join public.litigation_cases litigation_case
    on litigation_case.id = action.litigation_case_id
  where litigation_case.project_id = project_row.id
    and action.status in (
      'planned', 'in_progress', 'awaiting_approval', 'returned_for_revision'
    )
  on conflict (litigation_action_id, user_id) do update
  set ended_at = null,
      ended_by = null,
      assigned_by = excluded.assigned_by,
      assigned_at = now();

  insert into public.workflow_action_participants (
    workflow_action_instance_id, participant_type, user_id,
    assigned_by, assignment_reason
  )
  select action_instance.id, 'executor', p_user_id,
    actor_id, 'assistant_assignee'
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance
    on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow_instance
    on workflow_instance.id = stage_instance.workflow_instance_id
  where workflow_instance.project_id = project_row.id
    and action_instance.status not in ('approved', 'completed', 'cancelled')
  on conflict do nothing;

  insert into public.notifications (
    recipient_id, notification_type, title, body, data
  )
  values (
    p_user_id, 'project_assistant_assigned',
    'تم تكليفك بالمساعدة في مشروع',
    project_row.name,
    jsonb_build_object('project_id', project_row.id)
  );

  return assignment_id;
end;
$$;

create or replace function public.remove_project_assignee(
  p_project_id uuid,
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
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A removal reason is required';
  end if;

  select * into project_row
  from public.projects
  where id = p_project_id and deleted_at is null
  for update;
  if not found then raise exception 'Project was not found'; end if;
  if not private.has_permission('projects.assign_assistants')
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot remove project assistants'; end if;
  if p_user_id = project_row.primary_assignee_id then
    raise exception 'The primary assignee cannot be removed as an assistant';
  end if;

  update public.project_assignees
  set ended_at = now(),
      ended_by = actor_id,
      end_reason = trim(p_reason)
  where project_id = project_row.id
    and user_id = p_user_id
    and assignment_kind = 'assistant'
    and ended_at is null;
  if not found then raise exception 'Active assistant assignment was not found'; end if;

  update public.litigation_case_action_assignees action_assignee
  set ended_at = now(), ended_by = actor_id
  where action_assignee.user_id = p_user_id
    and action_assignee.ended_at is null
    and exists (
      select 1
      from public.litigation_case_actions action
      join public.litigation_cases litigation_case
        on litigation_case.id = action.litigation_case_id
      where action.id = action_assignee.litigation_action_id
        and litigation_case.project_id = project_row.id
        and action.status not in ('completed', 'cancelled', 'superseded')
    );

  update public.workflow_action_participants participant
  set unassigned_at = now(), unassigned_by = actor_id
  where participant.user_id = p_user_id
    and participant.participant_type = 'executor'
    and participant.assignment_reason = 'assistant_assignee'
    and participant.unassigned_at is null
    and exists (
      select 1
      from public.workflow_action_instances action_instance
      join public.workflow_stage_instances stage_instance
        on stage_instance.id = action_instance.workflow_stage_instance_id
      join public.workflow_instances workflow_instance
        on workflow_instance.id = stage_instance.workflow_instance_id
      where action_instance.id = participant.workflow_action_instance_id
        and workflow_instance.project_id = project_row.id
    );

  update public.project_members
  set left_at = now(),
      can_contact_client = false
  where project_id = project_row.id
    and user_id = p_user_id
    and membership_role = 'assistant_assignee';

  update public.conversation_participants participant
  set left_at = now()
  where participant.user_id = p_user_id
    and participant.left_at is null
    and exists (
      select 1
      from public.conversations conversation
      where conversation.id = participant.conversation_id
        and conversation.project_id = project_row.id
        and (
          conversation.conversation_type = 'client'
          or exists (
            select 1 from public.project_members member
            where member.project_id = project_row.id
              and member.user_id = p_user_id
              and member.left_at is not null
          )
        )
    );

  insert into public.notifications (
    recipient_id, notification_type, title, body, data
  )
  values (
    p_user_id, 'project_assistant_removed',
    'انتهى تكليفك بالمساعدة في مشروع',
    trim(p_reason),
    jsonb_build_object('project_id', project_row.id)
  );
end;
$$;

create or replace function public.issue_project_attention_notice(
  p_project_id uuid,
  p_target_user_id uuid,
  p_reason text,
  p_workflow_action_instance_id uuid default null,
  p_litigation_action_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  notice_id uuid;
  subject_title text;
begin
  if num_nonnulls(
    p_workflow_action_instance_id,
    p_litigation_action_id
  ) <> 1 then raise exception 'Select exactly one open action'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'An attention notice reason is required';
  end if;

  select * into project_row
  from public.projects
  where id = p_project_id
    and deleted_at is null;
  if not found then raise exception 'Project was not found'; end if;
  if not private.has_permission('supervision.issue_notice')
    or not (
      private.can_supervise_project(project_row.id, actor_id)
      or private.has_permission('system.override')
    )
  then raise exception 'The current user cannot issue notices for this project'; end if;

  if p_litigation_action_id is not null then
    select action.title into subject_title
    from public.litigation_case_actions action
    join public.litigation_cases litigation_case
      on litigation_case.id = action.litigation_case_id
    join public.litigation_case_action_assignees assignee
      on assignee.litigation_action_id = action.id
     and assignee.user_id = p_target_user_id
     and assignee.ended_at is null
    where action.id = p_litigation_action_id
      and litigation_case.project_id = project_row.id
      and action.status in (
        'planned', 'in_progress', 'awaiting_approval', 'returned_for_revision'
      );
  else
    select action_template.name into subject_title
    from public.workflow_action_instances action_instance
    join public.workflow_stage_instances stage_instance
      on stage_instance.id = action_instance.workflow_stage_instance_id
    join public.workflow_instances workflow_instance
      on workflow_instance.id = stage_instance.workflow_instance_id
    join public.workflow_action_templates action_template
      on action_template.id = action_instance.action_template_id
    join public.workflow_action_participants participant
      on participant.workflow_action_instance_id = action_instance.id
     and participant.participant_type = 'executor'
     and participant.user_id = p_target_user_id
     and participant.unassigned_at is null
    where action_instance.id = p_workflow_action_instance_id
      and workflow_instance.project_id = project_row.id
      and action_instance.status not in ('approved', 'completed', 'cancelled');
  end if;

  if subject_title is null then
    raise exception 'The selected user is not an active assignee of this open action';
  end if;

  insert into public.project_attention_notices (
    organization_id, project_id, workflow_action_instance_id,
    litigation_action_id, target_user_id, issued_by, reason
  )
  values (
    project_row.organization_id, project_row.id,
    p_workflow_action_instance_id, p_litigation_action_id,
    p_target_user_id, actor_id, trim(p_reason)
  )
  returning id into notice_id;

  insert into public.notifications (
    recipient_id, notification_type, title, body, data
  )
  select distinct recipient_id,
    'project_attention_notice',
    case
      when recipient_id = p_target_user_id then 'لفت نظر على إجراء'
      else 'تم إصدار لفت نظر داخل مشروع'
    end,
    trim(p_reason),
    jsonb_build_object(
      'project_id', project_row.id,
      'notice_id', notice_id,
      'subject_title', subject_title,
      'target_user_id', p_target_user_id
    )
  from (
    select p_target_user_id as recipient_id
    union select project_row.project_manager_id
    union
    select user_role.user_id
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    join public.profiles profile on profile.id = user_role.user_id
    where role.code = 'litigation_manager'
      and user_role.revoked_at is null
      and profile.department_id = project_row.department_id
      and profile.activation_status = 'active_staff'
      and profile.is_active
  ) recipients
  where recipient_id is not null
    and recipient_id <> actor_id;

  return notice_id;
end;
$$;

create or replace function public.acknowledge_project_attention_notice(
  p_notice_id uuid,
  p_response_text text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  notice_row public.project_attention_notices;
begin
  select * into notice_row
  from public.project_attention_notices
  where id = p_notice_id
  for update;
  if not found then raise exception 'Attention notice was not found'; end if;
  if notice_row.target_user_id <> actor_id
    or not private.has_permission('attention_notices.acknowledge')
  then raise exception 'Only the target assignee can acknowledge this notice'; end if;
  if p_response_text is not null
    and length(trim(p_response_text)) > 2000
  then raise exception 'Attention notice response is too long'; end if;

  update public.project_attention_notices
  set status = 'acknowledged',
      acknowledged_at = coalesce(acknowledged_at, now()),
      response_text = nullif(trim(p_response_text), ''),
      responded_at = case
        when nullif(trim(p_response_text), '') is not null then now()
        else responded_at
      end,
      updated_at = now()
  where id = notice_row.id;

  insert into public.notifications (
    recipient_id, notification_type, title, body, data
  )
  values (
    notice_row.issued_by,
    'project_attention_notice_acknowledged',
    'تم الاطلاع على لفت النظر',
    coalesce(nullif(trim(p_response_text), ''), 'تم تأكيد الاطلاع دون إضافة رد.'),
    jsonb_build_object(
      'project_id', notice_row.project_id,
      'notice_id', notice_row.id,
      'target_user_id', actor_id
    )
  );
end;
$$;

create or replace function public.start_litigation_case_action_v2(
  p_action_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  action_row public.litigation_case_actions;
  project_id_value uuid;
begin
  select action.*
  into action_row
  from public.litigation_case_actions action
  where action.id = p_action_id
  for update;
  if not found then raise exception 'Case action was not found'; end if;

  select litigation_case.project_id
  into project_id_value
  from public.litigation_cases litigation_case
  where litigation_case.id = action_row.litigation_case_id;

  if not private.is_active_staff()
    or not private.has_permission('litigation.actions.respond')
    or not private.can_access_project(project_id_value)
    or not exists (
      select 1
      from public.litigation_case_action_assignees assignee
      where assignee.litigation_action_id = action_row.id
        and assignee.user_id = actor_id
        and assignee.ended_at is null
    )
  then raise exception 'The current user is not an active assignee of this action'; end if;

  update public.litigation_case_action_assignees
  set is_lead = user_id = actor_id
  where litigation_action_id = action_row.id
    and ended_at is null;

  update public.litigation_case_actions
  set assigned_to = actor_id,
      updated_at = now()
  where id = action_row.id;

  perform public.start_litigation_case_action(action_row.id);
end;
$$;

create or replace function public.get_supervision_portfolio()
returns table (
  project_id uuid,
  project_number text,
  project_name text,
  category_id uuid,
  category_name text,
  project_status text,
  client_stage_label text,
  project_manager_id uuid,
  primary_assignee_id uuid,
  current_action_id uuid,
  current_action_title text,
  current_action_due_at timestamptz,
  current_action_legal_due_date date,
  current_action_status text,
  next_hearing_at timestamptz,
  open_notice_count bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select project.id,
    project.project_number,
    project.name,
    category.id,
    category.name,
    project.status,
    project.client_stage_label,
    project.project_manager_id,
    project.primary_assignee_id,
    current_action.id,
    current_action.title,
    current_action.due_at,
    current_action.legal_due_date,
    current_action.status,
    (
      select min(hearing.hearing_at)
      from public.litigation_hearings hearing
      where hearing.litigation_case_id = litigation_case.id
        and hearing.status = 'scheduled'
        and hearing.hearing_at >= now()
    ),
    (
      select count(*)
      from public.project_attention_notices notice
      where notice.project_id = project.id
        and notice.status = 'sent'
    ),
    project.updated_at
  from public.projects project
  join public.litigation_case_categories category
    on category.id = project.litigation_case_category_id
  left join public.litigation_cases litigation_case
    on litigation_case.project_id = project.id
  left join public.litigation_case_actions current_action
    on current_action.id = litigation_case.current_next_action_id
  where project.deleted_at is null
    and private.can_supervise_project(project.id, (select auth.uid()))
  order by
    case
      when current_action.due_at is not null and current_action.due_at < now() then 0
      else 1
    end,
    project.updated_at desc;
$$;

-- ---------------------------------------------------------------------------
-- RLS and read boundaries
-- ---------------------------------------------------------------------------

alter table public.litigation_case_categories enable row level security;
alter table public.litigation_supervisor_specialties enable row level security;
alter table public.project_assignees enable row level security;
alter table public.litigation_case_action_assignees enable row level security;
alter table public.project_attention_notices enable row level security;

revoke all on public.litigation_case_categories from anon, authenticated;
revoke all on public.litigation_supervisor_specialties from anon, authenticated;
revoke all on public.project_assignees from anon, authenticated;
revoke all on public.litigation_case_action_assignees from anon, authenticated;
revoke all on public.project_attention_notices from anon, authenticated;

grant select on public.litigation_case_categories to authenticated;
grant select on public.litigation_supervisor_specialties to authenticated;
grant select on public.project_assignees to authenticated;
grant select on public.litigation_case_action_assignees to authenticated;
grant select on public.project_attention_notices to authenticated;

create policy litigation_case_categories_staff_select
on public.litigation_case_categories
for select to authenticated
using ((select private.is_active_staff()));

create policy supervisor_specialties_scoped_select
on public.litigation_supervisor_specialties
for select to authenticated
using (
  supervisor_id = (select auth.uid())
  or (select private.has_permission('supervision.manage_specialties'))
);

create policy project_assignees_project_select
on public.project_assignees
for select to authenticated
using (
  (select private.is_active_staff())
  and (select private.can_access_project(project_id))
);

create policy litigation_action_assignees_project_select
on public.litigation_case_action_assignees
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.litigation_case_actions action
    join public.litigation_cases litigation_case
      on litigation_case.id = action.litigation_case_id
    where action.id = litigation_case_action_assignees.litigation_action_id
      and (select private.can_access_project(litigation_case.project_id))
  )
);

create policy project_attention_notices_scoped_select
on public.project_attention_notices
for select to authenticated
using (
  target_user_id = (select auth.uid())
  or issued_by = (select auth.uid())
  or (
    (select private.is_active_staff())
    and (select private.can_access_project(project_id))
  )
);

drop policy if exists clients_staff_select on public.clients;
create policy clients_staff_select on public.clients
for select to authenticated using (
  archived_at is null
  and (
    (select private.has_permission('clients.read'))
    or exists (
      select 1 from public.client_accounts account
      where account.client_id = clients.id
        and account.profile_id = (select auth.uid())
    )
    or (
      (select private.has_permission('clients.read_specialty'))
      and exists (
        select 1
        from public.projects project
        where project.client_id = clients.id
          and (select private.can_supervise_project(project.id, (select auth.uid())))
      )
    )
  )
);

drop policy if exists profiles_client_directory on public.profiles;
create policy profiles_client_directory on public.profiles
for select to authenticated using (
  account_kind = 'client'
  and is_active
  and deleted_at is null
  and (
    (select private.has_permission('clients.read'))
    or (
      (select private.has_permission('clients.read_specialty'))
      and exists (
        select 1
        from public.client_accounts account
        join public.projects project on project.client_id = account.client_id
        where account.profile_id = profiles.id
          and (select private.can_supervise_project(project.id, (select auth.uid())))
      )
    )
  )
);

drop policy if exists conversations_participant_select on public.conversations;
create policy conversations_participant_select on public.conversations
for select to authenticated
using (
  exists (
    select 1 from public.conversation_participants participant
    where participant.conversation_id = conversations.id
      and participant.user_id = (select auth.uid())
      and participant.left_at is null
  )
  or (
    conversations.conversation_type = 'internal'
    and conversations.project_id is not null
    and (select private.has_permission('messages.read_internal'))
    and (select private.can_supervise_project(
      conversations.project_id,
      (select auth.uid())
    ))
  )
);

drop policy if exists conversation_participants_member_select
on public.conversation_participants;
create policy conversation_participants_member_select
on public.conversation_participants
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.conversation_participants self_participant
    where self_participant.conversation_id =
      conversation_participants.conversation_id
      and self_participant.user_id = (select auth.uid())
      and self_participant.left_at is null
  )
  or exists (
    select 1
    from public.conversations conversation
    where conversation.id = conversation_participants.conversation_id
      and conversation.conversation_type = 'internal'
      and conversation.project_id is not null
      and (select private.has_permission('messages.read_internal'))
      and (select private.can_supervise_project(
        conversation.project_id,
        (select auth.uid())
      ))
  )
);

drop policy if exists messages_participant_select on public.messages;
create policy messages_participant_select on public.messages
for select to authenticated
using (
  deleted_at is null
  and (
    exists (
      select 1 from public.conversation_participants participant
      where participant.conversation_id = messages.conversation_id
        and participant.user_id = (select auth.uid())
        and participant.left_at is null
    )
    or exists (
      select 1
      from public.conversations conversation
      where conversation.id = messages.conversation_id
        and conversation.conversation_type = 'internal'
        and conversation.project_id is not null
        and (select private.has_permission('messages.read_internal'))
        and (select private.can_supervise_project(
          conversation.project_id,
          (select auth.uid())
        ))
    )
  )
);

-- Audit every sensitive change. Mutations remain RPC-only.
create trigger audit_litigation_case_categories
after insert or update on public.litigation_case_categories
for each row execute function private.audit_row_change();
create trigger audit_litigation_supervisor_specialties
after insert or update on public.litigation_supervisor_specialties
for each row execute function private.audit_row_change();
create trigger audit_project_assignees
after insert or update on public.project_assignees
for each row execute function private.audit_row_change();
create trigger audit_litigation_action_assignees
after insert or update on public.litigation_case_action_assignees
for each row execute function private.audit_row_change();
create trigger audit_project_attention_notices
after insert or update on public.project_attention_notices
for each row execute function private.audit_row_change();

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.create_staff_service_request_v2(uuid, text, text, text, uuid)',
    'public.update_litigation_case_category(uuid, uuid, text)',
    'public.approve_staff_registration_v2(uuid, uuid, uuid, uuid[], uuid[], text)',
    'public.update_staff_access_v2(uuid, text, text, uuid, uuid, uuid[], uuid[], text)',
    'public.manage_litigation_case_category(uuid, text, text, integer, boolean, text)',
    'public.assign_project_assignee(uuid, uuid)',
    'public.remove_project_assignee(uuid, uuid, text)',
    'public.issue_project_attention_notice(uuid, uuid, text, uuid, uuid)',
    'public.acknowledge_project_attention_notice(uuid, text)',
    'public.start_litigation_case_action_v2(uuid)',
    'public.get_supervision_portfolio()'
  ]
  loop
    execute format('revoke all on function %s from public, anon', function_signature);
    execute format('grant execute on function %s to authenticated', function_signature);
  end loop;
end;
$$;
