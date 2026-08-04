-- Allow client-side request uploads to save metadata for the document they just uploaded.

create or replace function public.update_document_metadata(
  p_document_id uuid,
  p_document_category_id uuid default null,
  p_document_number text default null,
  p_document_date date default null,
  p_description text default null,
  p_page_count integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  document_row public.documents;
begin
  select * into document_row
  from public.documents
  where id = p_document_id
    and deleted_at is null
  for update;
  if not found then raise exception 'Document was not found'; end if;

  if not (
    private.has_permission('documents.upload')
    or document_row.created_by = actor_id
    or (
      document_row.service_request_id is not null
      and exists (
        select 1
        from public.service_requests request
        join public.client_accounts account on account.client_id = request.client_id
        where request.id = document_row.service_request_id
          and account.profile_id = actor_id
      )
    )
  ) then
    raise exception 'The current user cannot update document metadata';
  end if;

  if document_row.service_request_id is not null
    and private.has_permission('documents.upload')
    and not private.can_manage_pre_contract(document_row.service_request_id)
    and document_row.created_by <> actor_id
  then
    raise exception 'The current user cannot update this document';
  end if;

  if document_row.project_id is not null
    and private.has_permission('documents.upload')
    and not private.can_access_project(document_row.project_id)
    and document_row.created_by <> actor_id
  then
    raise exception 'The current user cannot update this document';
  end if;

  if p_document_category_id is not null and not exists (
    select 1 from public.document_categories category
    where category.id = p_document_category_id
      and category.organization_id = document_row.organization_id
      and category.is_active
  ) then
    raise exception 'Document category is invalid';
  end if;

  update public.documents
  set document_category_id = p_document_category_id,
      document_number = nullif(trim(coalesce(p_document_number, '')), ''),
      document_date = p_document_date,
      description = nullif(trim(coalesce(p_description, '')), ''),
      page_count = p_page_count,
      updated_at = now()
  where id = p_document_id;
end;
$$;

revoke all on function public.update_document_metadata(uuid, uuid, text, date, text, integer)
from public, anon;
grant execute on function public.update_document_metadata(uuid, uuid, text, date, text, integer)
to authenticated;
