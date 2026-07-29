create or replace function private.is_client_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.account_kind = 'client'
      and profile.activation_status in ('client_waiting', 'active_client')
      and profile.is_active
      and profile.deleted_at is null
  );
$$;

revoke all on function private.is_client_account() from public, anon;
grant execute on function private.is_client_account() to authenticated;

alter policy service_requests_client_insert on public.service_requests
with check (
  (select private.has_role('super_admin'))
  or (
    created_by = (select auth.uid())
    and (select private.is_client_account())
  )
);

drop policy storage_authenticated_insert on storage.objects;
create policy storage_authenticated_insert on storage.objects
for insert to authenticated
with check (
  bucket_id in ('legal-documents', 'message-attachments')
  and (
    (select private.is_active_staff())
    or (
      (select private.is_client_account())
      and (storage.foldername(name))[1] = (select auth.uid()::text)
    )
  )
);

create or replace function private.validate_document_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_visibility_status = 'published' then
    if new.visibility = 'internal'
      or new.published_to_client_at is null
      or new.published_by is null
    then
      raise exception 'Published documents require explicit client visibility and publication metadata';
    end if;

    if not exists (
      select 1
      from public.document_versions version
      where version.document_id = new.id
        and version.version_number = new.current_version_number
        and version.deleted_at is null
    ) then
      raise exception 'The current document version must exist before publication';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_document_publication()
from public, anon, authenticated;

create trigger documents_validate_publication
before insert or update of client_visibility_status, visibility, current_version_number
on public.documents
for each row execute function private.validate_document_publication();

alter table public.workflow_instances
add constraint workflow_instances_name_not_blank
check (length(trim(name)) > 0);
