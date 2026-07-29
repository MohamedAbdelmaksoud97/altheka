drop policy if exists service_requests_client_insert on public.service_requests;
revoke insert on public.service_requests from authenticated;

alter policy service_requests_staff_select on public.service_requests
using (
  deleted_at is null
  and (
    (select private.has_any_role(array[
      'super_admin',
      'new_clients_manager',
      'executive_manager'
    ]))
    or (select private.can_manage_pre_contract(id))
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

alter policy documents_staff_project_select on public.documents
using (
  deleted_at is null
  and (
    created_by = (select auth.uid())
    or (
      service_request_id is not null
      and (select private.can_manage_pre_contract(service_request_id))
    )
    or (
      project_id is not null
      and (select private.can_access_project(project_id))
      and (select private.is_active_staff())
    )
    or (
      client_visibility_status = 'published'
      and visibility in ('client_visible', 'requires_client_action')
      and (
        (
          service_request_id is not null
          and exists (
            select 1
            from public.service_requests request
            where request.id = documents.service_request_id
              and request.created_by = (select auth.uid())
              and request.deleted_at is null
          )
        )
        or exists (
          select 1
          from public.client_accounts account
          where account.client_id = documents.client_id
            and account.profile_id = (select auth.uid())
        )
        or (
          project_id is not null
          and exists (
            select 1
            from public.projects project
            join public.client_accounts account on account.client_id = project.client_id
            where project.id = documents.project_id
              and account.profile_id = (select auth.uid())
          )
        )
      )
    )
  )
);
