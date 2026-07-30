-- Complete the staff administration lifecycle without deleting accounts or
-- authorization history. Every mutation is permission checked, transactional,
-- and captured by the existing append-only audit triggers.

alter table public.profiles
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid
    references public.profiles(id) on delete restrict;

create index if not exists profiles_staff_status_updated_idx
  on public.profiles (activation_status, updated_at desc)
  where account_kind = 'staff' and deleted_at is null;

-- user_roles has no id/profile_id column, so the original generic audit
-- function could not associate a role change with its employee.
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
  row_id := coalesce(
    new_row ->> 'id',
    old_row ->> 'id',
    new_row ->> 'profile_id',
    old_row ->> 'profile_id',
    new_row ->> 'user_id',
    old_row ->> 'user_id'
  );
  organization_value := coalesce(
    nullif(new_row ->> 'organization_id', '')::uuid,
    nullif(old_row ->> 'organization_id', '')::uuid
  );

  insert into private.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_schema,
    entity_table,
    entity_id,
    old_data,
    new_data
  )
  values (
    organization_value,
    (select auth.uid()),
    lower(tg_op),
    tg_table_schema,
    tg_table_name,
    row_id,
    old_row,
    new_row
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.audit_row_change()
from public, anon, authenticated;

update private.audit_logs
set entity_id = coalesce(new_data ->> 'user_id', old_data ->> 'user_id')
where entity_schema = 'public'
  and entity_table = 'user_roles'
  and entity_id is null
  and coalesce(new_data ->> 'user_id', old_data ->> 'user_id') is not null;

update public.staff_registration_requests request
set
  status = 'approved',
  reviewed_at = coalesce(request.reviewed_at, profile.approved_at, profile.updated_at),
  reviewed_by = coalesce(request.reviewed_by, profile.approved_by),
  review_notes = coalesce(
    request.review_notes,
    'تمت مواءمة الطلب مع حالة الحساب المعتمدة سابقًا'
  ),
  updated_at = now()
from public.profiles profile
where profile.id = request.profile_id
  and request.status = 'pending'
  and profile.approved_at is not null
  and profile.activation_status in ('active_staff', 'disabled');

create or replace function public.reject_staff_registration(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_row public.staff_registration_requests;
begin
  if actor_id is null or not private.has_permission('staff.approve') then
    raise exception 'The current user cannot reject staff registrations';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A rejection reason is required';
  end if;

  select * into request_row
  from public.staff_registration_requests
  where id = p_request_id and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending registration request was not found';
  end if;

  perform 1
  from public.profiles profile
  where profile.id = request_row.profile_id
    and profile.account_kind = 'staff'
    and profile.activation_status = 'pending_staff_approval'
  for update;
  if not found then
    raise exception 'The staff account is no longer pending approval';
  end if;

  update public.staff_registration_requests
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = actor_id,
    review_notes = trim(p_reason),
    updated_at = now()
  where id = request_row.id;

  update public.profiles
  set
    activation_status = 'rejected_staff',
    is_active = false,
    status_reason = trim(p_reason),
    status_changed_at = now(),
    status_changed_by = actor_id,
    updated_at = now()
  where id = request_row.profile_id
    and account_kind = 'staff'
    and activation_status = 'pending_staff_approval';
end;
$$;

create or replace function public.update_staff_access(
  p_profile_id uuid,
  p_full_name text,
  p_phone text,
  p_department_id uuid,
  p_job_title_id uuid,
  p_role_ids uuid[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_profile public.profiles;
  old_role_ids uuid[];
  normalized_role_ids uuid[];
  valid_role_count integer;
begin
  if actor_id is null
    or not private.has_permission('staff.approve')
    or not private.has_permission('roles.assign')
  then
    raise exception 'The current user cannot update staff access';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'A valid staff name is required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A documented change reason is required';
  end if;

  select * into target_profile
  from public.profiles
  where id = p_profile_id
    and account_kind = 'staff'
    and activation_status in ('active_staff', 'disabled')
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Staff profile was not found';
  end if;

  if exists (
    select 1
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    where user_role.user_id = target_profile.id
      and user_role.revoked_at is null
      and role.code = 'super_admin'
  ) then
    raise exception 'Super Admin access is protected from this interface';
  end if;

  if not exists (
    select 1
    from public.departments department
    where department.id = p_department_id
      and department.organization_id = target_profile.organization_id
      and department.is_active
  ) then
    raise exception 'Selected department is invalid';
  end if;
  if not exists (
    select 1
    from public.job_titles job_title
    where job_title.id = p_job_title_id
      and job_title.organization_id = target_profile.organization_id
      and job_title.is_active
      and (
        job_title.department_id is null
        or job_title.department_id = p_department_id
      )
  ) then
    raise exception 'Selected job title is invalid';
  end if;

  select coalesce(array_agg(distinct role_id), '{}'::uuid[])
  into normalized_role_ids
  from unnest(coalesce(p_role_ids, '{}'::uuid[])) role_id;
  if cardinality(normalized_role_ids) = 0 then
    raise exception 'At least one role is required';
  end if;

  select count(*) into valid_role_count
  from public.roles role
  where role.id = any(normalized_role_ids)
    and role.organization_id = target_profile.organization_id
    and role.is_active
    and role.code <> 'super_admin';
  if valid_role_count <> cardinality(normalized_role_ids) then
    raise exception 'One or more selected roles are invalid';
  end if;

  select coalesce(array_agg(user_role.role_id), '{}'::uuid[])
  into old_role_ids
  from public.user_roles user_role
  where user_role.user_id = target_profile.id
    and user_role.revoked_at is null;

  update public.profiles
  set
    full_name = trim(p_full_name),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    department_id = p_department_id,
    job_title_id = p_job_title_id,
    status_reason = trim(p_reason),
    status_changed_at = now(),
    status_changed_by = actor_id,
    updated_at = now()
  where id = target_profile.id;

  update public.user_roles
  set
    revoked_at = now(),
    revoked_by = actor_id
  where user_id = target_profile.id
    and revoked_at is null
    and not (role_id = any(normalized_role_ids));

  insert into public.user_roles (user_id, role_id, assigned_by)
  select target_profile.id, role_id, actor_id
  from unnest(normalized_role_ids) role_id
  on conflict (user_id, role_id) do update
  set
    assigned_at = now(),
    assigned_by = excluded.assigned_by,
    revoked_at = null,
    revoked_by = null;

  insert into private.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_schema,
    entity_table,
    entity_id,
    old_data,
    new_data
  )
  values (
    target_profile.organization_id,
    actor_id,
    'staff_access_updated',
    'public',
    'profiles',
    target_profile.id::text,
    jsonb_build_object(
      'full_name', target_profile.full_name,
      'phone', target_profile.phone,
      'department_id', target_profile.department_id,
      'job_title_id', target_profile.job_title_id,
      'role_ids', old_role_ids
    ),
    jsonb_build_object(
      'full_name', trim(p_full_name),
      'phone', nullif(trim(coalesce(p_phone, '')), ''),
      'department_id', p_department_id,
      'job_title_id', p_job_title_id,
      'role_ids', normalized_role_ids,
      'reason', trim(p_reason)
    )
  );
end;
$$;

create or replace function public.disable_staff_account(
  p_profile_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_profile public.profiles;
begin
  if actor_id is null or not private.has_permission('staff.approve') then
    raise exception 'The current user cannot disable staff accounts';
  end if;
  if p_profile_id = actor_id then
    raise exception 'You cannot disable your own account';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A disable reason is required';
  end if;

  select * into target_profile
  from public.profiles
  where id = p_profile_id
    and account_kind = 'staff'
    and activation_status = 'active_staff'
    and is_active
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Active staff profile was not found';
  end if;

  if exists (
    select 1
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    where user_role.user_id = target_profile.id
      and user_role.revoked_at is null
      and role.code = 'super_admin'
  ) then
    raise exception 'Super Admin accounts are protected from this interface';
  end if;

  update public.profiles
  set
    activation_status = 'disabled',
    is_active = false,
    status_reason = trim(p_reason),
    status_changed_at = now(),
    status_changed_by = actor_id,
    updated_at = now()
  where id = target_profile.id;
end;
$$;

create or replace function public.reactivate_staff_account(
  p_profile_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_profile public.profiles;
begin
  if actor_id is null or not private.has_permission('staff.approve') then
    raise exception 'The current user cannot reactivate staff accounts';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reactivation reason is required';
  end if;

  select * into target_profile
  from public.profiles
  where id = p_profile_id
    and account_kind = 'staff'
    and activation_status = 'disabled'
    and not is_active
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Disabled staff profile was not found';
  end if;
  if target_profile.department_id is null or target_profile.job_title_id is null then
    raise exception 'Department and job title are required before reactivation';
  end if;
  if not exists (
    select 1
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    where user_role.user_id = target_profile.id
      and user_role.revoked_at is null
      and role.is_active
  ) then
    raise exception 'At least one active role is required before reactivation';
  end if;

  update public.profiles
  set
    activation_status = 'active_staff',
    is_active = true,
    status_reason = trim(p_reason),
    status_changed_at = now(),
    status_changed_by = actor_id,
    updated_at = now()
  where id = target_profile.id;
end;
$$;

create or replace function public.get_staff_change_history(
  p_profile_id uuid default null,
  p_limit integer default 300
)
returns table (
  id bigint,
  staff_profile_id uuid,
  action text,
  actor_name text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('audit.read') then
    raise exception 'The current user cannot read staff audit history';
  end if;

  return query
  select
    audit.id,
    audit.entity_id::uuid,
    audit.action,
    coalesce(actor.full_name, 'النظام'),
    jsonb_build_object(
      'entity_table', audit.entity_table,
      'old', audit.old_data,
      'new', audit.new_data
    ),
    audit.created_at
  from private.audit_logs audit
  left join public.profiles actor on actor.id = audit.actor_user_id
  where audit.entity_schema = 'public'
    and audit.entity_table in (
      'profiles',
      'staff_registration_requests',
      'user_roles'
    )
    and audit.entity_id is not null
    and audit.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (p_profile_id is null or audit.entity_id::uuid = p_profile_id)
  order by audit.created_at desc, audit.id desc
  limit least(greatest(coalesce(p_limit, 300), 1), 1000);
end;
$$;

revoke all on function public.reject_staff_registration(uuid, text)
from public, anon;
revoke all on function public.update_staff_access(
  uuid, text, text, uuid, uuid, uuid[], text
) from public, anon;
revoke all on function public.disable_staff_account(uuid, text)
from public, anon;
revoke all on function public.reactivate_staff_account(uuid, text)
from public, anon;
revoke all on function public.get_staff_change_history(uuid, integer)
from public, anon;

grant execute on function public.reject_staff_registration(uuid, text)
to authenticated;
grant execute on function public.update_staff_access(
  uuid, text, text, uuid, uuid, uuid[], text
) to authenticated;
grant execute on function public.disable_staff_account(uuid, text)
to authenticated;
grant execute on function public.reactivate_staff_account(uuid, text)
to authenticated;
grant execute on function public.get_staff_change_history(uuid, integer)
to authenticated;
