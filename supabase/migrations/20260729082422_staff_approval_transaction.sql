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
  if not private.has_role('super_admin') then
    raise exception 'Only a system administrator can approve staff registrations';
  end if;

  select *
  into request_row
  from public.staff_registration_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending staff registration request was not found';
  end if;

  if not exists (
    select 1
    from public.departments d
    where d.id = p_department_id
      and d.organization_id = request_row.organization_id
      and d.is_active
  ) then
    raise exception 'The selected department is invalid';
  end if;

  if not exists (
    select 1
    from public.job_titles jt
    where jt.id = p_job_title_id
      and jt.organization_id = request_row.organization_id
      and jt.is_active
      and (jt.department_id is null or jt.department_id = p_department_id)
  ) then
    raise exception 'The selected job title is invalid for this department';
  end if;

  if coalesce(cardinality(p_role_ids), 0) = 0 then
    raise exception 'At least one role is required';
  end if;

  select count(distinct r.id)
  into valid_role_count
  from public.roles r
  where r.id = any(p_role_ids)
    and r.organization_id = request_row.organization_id
    and r.is_active;

  if valid_role_count <> (
    select count(distinct role_id)
    from unnest(p_role_ids) as role_id
  ) then
    raise exception 'One or more selected roles are invalid';
  end if;

  update public.profiles
  set
    department_id = p_department_id,
    job_title_id = p_job_title_id,
    activation_status = 'active_staff',
    is_active = true,
    approved_at = now(),
    approved_by = (select auth.uid()),
    updated_at = now()
  where id = request_row.profile_id;

  update public.staff_registration_requests
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = (select auth.uid()),
    review_notes = nullif(trim(p_review_notes), ''),
    updated_at = now()
  where id = request_row.id;

  update public.user_roles
  set
    revoked_at = now(),
    revoked_by = (select auth.uid())
  where user_id = request_row.profile_id
    and revoked_at is null
    and not (role_id = any(p_role_ids));

  insert into public.user_roles (user_id, role_id, assigned_by)
  select request_row.profile_id, role_id, (select auth.uid())
  from unnest(p_role_ids) as role_id
  on conflict (user_id, role_id)
  do update set
    assigned_at = now(),
    assigned_by = excluded.assigned_by,
    revoked_at = null,
    revoked_by = null;
end;
$$;

revoke all on function public.approve_staff_registration(uuid, uuid, uuid, uuid[], text)
from public, anon;
grant execute on function public.approve_staff_registration(uuid, uuid, uuid, uuid[], text)
to authenticated;
