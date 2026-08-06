create or replace function public.create_power_of_attorney(
  p_client_id uuid,
  p_service_request_id uuid,
  p_project_id uuid,
  p_document_id uuid,
  p_power_number text,
  p_issued_on date,
  p_expires_on date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_org_id uuid;
  power_id_value uuid;
  power_status text := 'active';
begin
  if actor_id is null or not private.has_permission('powers_of_attorney.manage') then
    raise exception 'POA_PERMISSION_DENIED';
  end if;
  select organization_id into actor_org_id
  from public.profiles
  where id = actor_id and activation_status = 'active_staff';
  if actor_org_id is null then raise exception 'POA_PROFILE_INVALID'; end if;
  if p_client_id is null then raise exception 'POA_CLIENT_REQUIRED'; end if;
  if length(trim(coalesce(p_power_number, ''))) < 2 then
    raise exception 'POA_NUMBER_REQUIRED';
  end if;
  if p_issued_on is not null and p_expires_on is not null and p_expires_on < p_issued_on then
    raise exception 'POA_EXPIRY_BEFORE_ISSUE';
  end if;
  if not exists (
    select 1 from public.clients client
    where client.id = p_client_id and client.organization_id = actor_org_id
  ) then raise exception 'POA_CLIENT_INVALID'; end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects project
    where project.id = p_project_id
      and project.client_id = p_client_id
      and project.organization_id = actor_org_id
      and project.deleted_at is null
  ) then raise exception 'POA_PROJECT_CLIENT_MISMATCH'; end if;
  if p_service_request_id is not null and not exists (
    select 1 from public.service_requests request
    where request.id = p_service_request_id
      and request.client_id = p_client_id
      and request.organization_id = actor_org_id
  ) then raise exception 'POA_REQUEST_CLIENT_MISMATCH'; end if;
  if p_document_id is not null and not exists (
    select 1
    from public.documents document
    left join public.projects document_project on document_project.id = document.project_id
    left join public.service_requests document_request on document_request.id = document.service_request_id
    where document.id = p_document_id
      and document.organization_id = actor_org_id
      and document.deleted_at is null
      and document.archived_at is null
      and (
        document.client_id = p_client_id
        or document_project.client_id = p_client_id
        or document_request.client_id = p_client_id
      )
  ) then raise exception 'POA_DOCUMENT_CLIENT_MISMATCH'; end if;

  if p_expires_on is not null
    and p_expires_on < (now() at time zone 'Asia/Riyadh')::date then
    power_status := 'expired';
  end if;

  insert into public.powers_of_attorney (
    organization_id, client_id, service_request_id, project_id, document_id,
    power_number, issued_on, expires_on, status, notes, created_by
  ) values (
    actor_org_id, p_client_id, p_service_request_id, p_project_id, p_document_id,
    trim(p_power_number), p_issued_on, p_expires_on, power_status,
    nullif(trim(coalesce(p_notes, '')), ''), actor_id
  ) returning id into power_id_value;

  if p_expires_on is not null and power_status = 'active' then
    insert into public.notification_jobs (
      deduplication_key, notification_type, recipient_id, payload, scheduled_for
    ) values (
      'power_of_attorney:' || power_id_value::text || ':expiry',
      'power_of_attorney_expiry',
      actor_id,
      jsonb_build_object('power_of_attorney_id', power_id_value, 'category', 'powers_of_attorney'),
      greatest(
        now(),
        (p_expires_on::timestamp at time zone 'Asia/Riyadh') - interval '14 days'
      )
    ) on conflict (deduplication_key) do nothing;
  end if;

  return power_id_value;
end;
$$;

revoke all on function public.create_power_of_attorney(
  uuid, uuid, uuid, uuid, text, date, date, text
) from public, anon;
grant execute on function public.create_power_of_attorney(
  uuid, uuid, uuid, uuid, text, date, date, text
) to authenticated;
