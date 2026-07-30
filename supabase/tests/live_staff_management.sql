begin;

do $$
declare
  actor_id_value uuid;
  target_profile public.profiles;
  target_role_ids uuid[];
  pending_request_id uuid;
  history_count integer;
begin
  select profile.id into strict actor_id_value
  from public.profiles profile
  join public.user_roles user_role
    on user_role.user_id = profile.id and user_role.revoked_at is null
  join public.roles role on role.id = user_role.role_id
  where role.code = 'super_admin'
    and profile.activation_status = 'active_staff'
    and profile.is_active
  order by profile.created_at
  limit 1;

  perform set_config('request.jwt.claim.sub', actor_id_value::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select profile.* into strict target_profile
  from public.profiles profile
  where profile.account_kind = 'staff'
    and profile.activation_status = 'active_staff'
    and profile.is_active
    and profile.department_id is not null
    and profile.job_title_id is not null
    and not exists (
      select 1
      from public.user_roles user_role
      join public.roles role on role.id = user_role.role_id
      where user_role.user_id = profile.id
        and user_role.revoked_at is null
        and role.code = 'super_admin'
    )
  order by profile.created_at
  limit 1
  for update;

  select array_agg(user_role.role_id order by user_role.role_id)
  into strict target_role_ids
  from public.user_roles user_role
  where user_role.user_id = target_profile.id
    and user_role.revoked_at is null;

  perform public.update_staff_access(
    target_profile.id,
    target_profile.full_name,
    target_profile.phone,
    target_profile.department_id,
    target_profile.job_title_id,
    target_role_ids,
    'اختبار تحديث بيانات وصلاحيات الموظف'
  );

  perform public.disable_staff_account(
    target_profile.id,
    'اختبار تعطيل حساب الموظف مؤقتًا'
  );

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = target_profile.id
      and profile.activation_status = 'disabled'
      and not profile.is_active
  ) then
    raise exception 'Staff account was not disabled';
  end if;

  perform public.reactivate_staff_account(
    target_profile.id,
    'اختبار إعادة تفعيل حساب الموظف'
  );

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = target_profile.id
      and profile.activation_status = 'active_staff'
      and profile.is_active
  ) then
    raise exception 'Staff account was not reactivated';
  end if;

  select count(*) into history_count
  from public.get_staff_change_history(target_profile.id, 50);
  if history_count < 3 then
    raise exception 'Staff audit history did not include the tested changes';
  end if;

  select request.id into pending_request_id
  from public.staff_registration_requests request
  where request.status = 'pending'
  order by request.created_at
  limit 1
  for update;

  if pending_request_id is not null then
    perform public.reject_staff_registration(
      pending_request_id,
      'اختبار رفض طلب تسجيل غير مكتمل'
    );

    if not exists (
      select 1
      from public.staff_registration_requests request
      join public.profiles profile on profile.id = request.profile_id
      where request.id = pending_request_id
        and request.status = 'rejected'
        and profile.activation_status = 'rejected_staff'
        and not profile.is_active
    ) then
      raise exception 'Pending staff registration was not rejected correctly';
    end if;
  end if;

  begin
    perform public.disable_staff_account(
      actor_id_value,
      'يجب منع تعطيل المستخدم لحسابه الشخصي'
    );
    raise exception 'Self-disable was unexpectedly allowed';
  exception
    when others then
      if sqlerrm = 'Self-disable was unexpectedly allowed' then
        raise;
      end if;
  end;
end;
$$;

rollback;
