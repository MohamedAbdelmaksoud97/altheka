insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'documents.publish'
where role.code in (
  'new_clients_manager',
  'litigation_manager',
  'estates_manager',
  'executive_manager'
)
on conflict do nothing;

create table public.document_access_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('signed_url_issued')),
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index document_access_events_document_idx
  on public.document_access_events (document_id, created_at desc);
create index document_access_events_actor_idx
  on public.document_access_events (actor_user_id, created_at desc);

alter table public.document_access_events enable row level security;
revoke all on public.document_access_events from anon, authenticated;
grant select on public.document_access_events to authenticated;

create policy document_access_events_authorized_select
on public.document_access_events
for select
to authenticated
using (
  actor_user_id = (select auth.uid())
  or (
    (select private.is_active_staff())
    and exists (
      select 1
      from public.documents document
      where document.id = document_access_events.document_id
        and document.deleted_at is null
        and (
          document.created_by = (select auth.uid())
          or (
            document.service_request_id is not null
            and (select private.can_manage_pre_contract(document.service_request_id))
          )
          or (
            document.project_id is not null
            and (select private.can_access_project(document.project_id))
          )
        )
    )
  )
);

create trigger audit_document_versions
after insert or update on public.document_versions
for each row execute function private.audit_row_change();

create or replace function private.validate_document_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
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

    if actor_id is not null
      and not (
        new.created_by = actor_id
        and new.service_request_id is not null
        and private.is_request_client(new.service_request_id)
      )
      and not private.has_permission('documents.publish')
    then
      raise exception 'The current user cannot publish client documents';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.set_document_client_publication(
  p_document_id uuid,
  p_status text,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  document_row public.documents;
  can_access boolean;
  event_title text;
  event_visibility text;
begin
  if actor_id is null or not private.is_active_staff() then
    raise exception 'Only active staff can manage document publication';
  end if;

  if p_status not in ('draft', 'awaiting_approval', 'published', 'withdrawn') then
    raise exception 'Unsupported publication status';
  end if;

  if p_visibility not in ('internal', 'client_visible', 'requires_client_action') then
    raise exception 'Unsupported document visibility';
  end if;

  if p_visibility = 'internal' and p_status <> 'draft' then
    raise exception 'Internal documents must remain drafts';
  end if;

  select *
  into document_row
  from public.documents
  where id = p_document_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Document was not found';
  end if;

  can_access :=
    document_row.created_by = actor_id
    or (
      document_row.service_request_id is not null
      and private.can_manage_pre_contract(document_row.service_request_id)
    )
    or (
      document_row.project_id is not null
      and private.can_access_project(document_row.project_id)
    );

  if not can_access then
    raise exception 'The current user cannot manage this document';
  end if;

  if (
    p_status in ('published', 'withdrawn')
    or document_row.client_visibility_status in ('published', 'withdrawn')
  ) and not private.has_permission('documents.publish') then
    raise exception 'The current user cannot publish or withdraw client documents';
  end if;

  if p_status = 'published' and not exists (
    select 1
    from public.document_versions version
    where version.document_id = document_row.id
      and version.version_number = document_row.current_version_number
      and version.deleted_at is null
  ) then
    raise exception 'A current document version is required before publication';
  end if;

  update public.documents
  set
    visibility = p_visibility,
    client_visibility_status = p_status,
    published_to_client_at = case
      when p_status = 'published' then now()
      else published_to_client_at
    end,
    published_by = case
      when p_status = 'published' then actor_id
      else published_by
    end,
    withdrawn_at = case
      when p_status = 'withdrawn' then now()
      when p_status = 'published' then null
      else withdrawn_at
    end,
    withdrawn_by = case
      when p_status = 'withdrawn' then actor_id
      when p_status = 'published' then null
      else withdrawn_by
    end,
    updated_at = now()
  where id = document_row.id;

  if document_row.service_request_id is not null then
    event_title := case p_status
      when 'published' then 'تم نشر مستند للعميل'
      when 'withdrawn' then 'تم سحب مستند من بوابة العميل'
      when 'awaiting_approval' then 'المستند بانتظار اعتماد النشر'
      else 'تم تحديث مستوى رؤية المستند'
    end;
    event_visibility := case
      when p_status = 'published' then p_visibility
      else 'internal'
    end;

    insert into public.pre_contract_events (
      service_request_id,
      event_code,
      title,
      details,
      visibility,
      actor_id,
      metadata
    )
    values (
      document_row.service_request_id,
      'document_' || p_status,
      event_title,
      document_row.title,
      event_visibility,
      actor_id,
      jsonb_build_object(
        'document_id', document_row.id,
        'status', p_status,
        'visibility', p_visibility
      )
    );
  end if;
end;
$$;

revoke all on function public.set_document_client_publication(uuid, text, text)
from public, anon;
grant execute on function public.set_document_client_publication(uuid, text, text)
to authenticated;

create or replace function public.record_document_signed_url(
  p_document_id uuid,
  p_document_version_id uuid,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  document_row public.documents;
  new_event_id bigint;
  is_authorized boolean;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;

  select document.*
  into document_row
  from public.documents document
  join public.document_versions version
    on version.document_id = document.id
   and version.id = p_document_version_id
   and version.version_number = document.current_version_number
   and version.deleted_at is null
  where document.id = p_document_id
    and document.deleted_at is null;

  if not found then
    raise exception 'Current document version was not found';
  end if;

  if private.is_active_staff() then
    is_authorized :=
      document_row.created_by = actor_id
      or (
        document_row.service_request_id is not null
        and private.can_manage_pre_contract(document_row.service_request_id)
      )
      or (
        document_row.project_id is not null
        and private.can_access_project(document_row.project_id)
      );
  else
    is_authorized :=
      document_row.client_visibility_status = 'published'
      and document_row.visibility in ('client_visible', 'requires_client_action')
      and (
        (
          document_row.service_request_id is not null
          and private.is_request_client(document_row.service_request_id)
        )
        or (
          document_row.project_id is not null
          and private.can_access_project(document_row.project_id)
        )
      );
  end if;

  if not is_authorized then
    raise exception 'The current user cannot download this document';
  end if;

  insert into public.document_access_events (
    organization_id,
    document_id,
    document_version_id,
    actor_user_id,
    event_type,
    ip_address,
    user_agent
  )
  values (
    document_row.organization_id,
    document_row.id,
    p_document_version_id,
    actor_id,
    'signed_url_issued',
    p_ip_address,
    left(p_user_agent, 1000)
  )
  returning id into new_event_id;

  return new_event_id;
end;
$$;

revoke all on function public.record_document_signed_url(uuid, uuid, inet, text)
from public, anon;
grant execute on function public.record_document_signed_url(uuid, uuid, inet, text)
to authenticated;
