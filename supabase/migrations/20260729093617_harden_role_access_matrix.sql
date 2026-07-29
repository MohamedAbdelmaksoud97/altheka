create or replace function private.has_any_role(role_codes text[])
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
    join public.profiles profile on profile.id = user_role.user_id
    where user_role.user_id = (select auth.uid())
      and user_role.revoked_at is null
      and role.code = any(role_codes)
      and role.is_active
      and profile.activation_status = 'active_staff'
      and profile.is_active
      and profile.deleted_at is null
  );
$$;

revoke all on function private.has_any_role(text[]) from public, anon;
grant execute on function private.has_any_role(text[]) to authenticated;

create or replace function private.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_any_role(array['super_admin', 'executive_manager'])
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
      join public.client_accounts account on account.client_id = project.client_id
      where project.id = target_project_id
        and account.profile_id = (select auth.uid())
        and project.deleted_at is null
    );
$$;

alter policy clients_staff_select on public.clients
using (
  archived_at is null
  and (
    (select private.has_any_role(array[
      'super_admin',
      'new_clients_manager',
      'executive_manager'
    ]))
    or exists (
      select 1
      from public.client_accounts account
      where account.client_id = clients.id
        and account.profile_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.projects project
      join public.project_members member on member.project_id = project.id
      where project.client_id = clients.id
        and member.user_id = (select auth.uid())
        and member.left_at is null
        and project.deleted_at is null
    )
  )
);

alter policy service_requests_staff_select on public.service_requests
using (
  deleted_at is null
  and (
    (select private.has_any_role(array[
      'super_admin',
      'new_clients_manager',
      'executive_manager'
    ]))
    or (
      visibility <> 'internal'
      and (
        created_by = (select auth.uid())
        or exists (
          select 1
          from public.client_accounts account
          where account.client_id = service_requests.client_id
            and account.profile_id = (select auth.uid())
        )
      )
    )
    or exists (
      select 1
      from public.projects project
      join public.project_members member on member.project_id = project.id
      where project.service_request_id = service_requests.id
        and member.user_id = (select auth.uid())
        and member.left_at is null
        and project.deleted_at is null
    )
  )
);
