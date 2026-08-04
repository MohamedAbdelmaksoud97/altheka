-- Allow project-scoped staff to resolve the client name for projects they can access.

drop policy if exists clients_staff_select on public.clients;
create policy clients_staff_select on public.clients
for select to authenticated using (
  archived_at is null
  and (
    (select private.has_permission('clients.read'))
    or exists (
      select 1
      from public.client_accounts account
      where account.client_id = clients.id
        and account.profile_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.projects project
      where project.client_id = clients.id
        and project.deleted_at is null
        and (select private.can_access_project(project.id))
    )
  )
);
