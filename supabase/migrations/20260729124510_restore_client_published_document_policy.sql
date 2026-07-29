create policy documents_client_published_select
on public.documents
for select
to authenticated
using (
  deleted_at is null
  and client_visibility_status = 'published'
  and visibility in ('client_visible', 'requires_client_action')
  and (
    estate_party_id is null
    or exists (
      select 1 from public.estate_parties party
      where party.id = documents.estate_party_id
        and party.linked_profile_id = (select auth.uid())
        and party.deleted_at is null
    )
  )
  and (
    exists (
      select 1 from public.client_accounts account
      where account.client_id = documents.client_id
        and account.profile_id = (select auth.uid())
    )
    or (
      service_request_id is not null
      and exists (
        select 1
        from public.service_requests request
        join public.client_accounts account on account.client_id = request.client_id
        where request.id = documents.service_request_id
          and account.profile_id = (select auth.uid())
          and request.deleted_at is null
      )
    )
    or (
      project_id is not null
      and exists (
        select 1
        from public.projects project
        join public.client_accounts account on account.client_id = project.client_id
        where project.id = documents.project_id
          and account.profile_id = (select auth.uid())
          and project.deleted_at is null
      )
    )
  )
);
