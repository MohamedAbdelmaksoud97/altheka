create or replace function public.send_pre_contract_contract(
  p_request_id uuid,
  p_title text,
  p_contract_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  contract_id_value uuid;
  next_version integer;
  new_version_id uuid;
  body_hash text;
begin
  if not private.has_any_role(array['super_admin', 'new_clients_manager']) then
    raise exception 'Only the new clients manager can send contracts';
  end if;
  if not exists (
    select 1 from public.service_requests
    where id = p_request_id
      and status = 'proposal_accepted'
      and deleted_at is null
  ) then raise exception 'An accepted proposal is required before the contract'; end if;

  insert into public.contracts (
    service_request_id, status, current_version_number, created_by
  )
  values (p_request_id, 'draft', 0, actor_id)
  on conflict (service_request_id) do update
  set updated_at = now()
  returning id, current_version_number + 1
  into contract_id_value, next_version;

  update public.contract_versions
  set status = 'superseded'
  where contract_id = contract_id_value and status = 'sent';

  body_hash := encode(
    extensions.digest(convert_to(trim(p_contract_body), 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.contract_versions (
    contract_id,
    version_number,
    title,
    contract_body,
    sha256,
    created_by
  )
  values (
    contract_id_value,
    next_version,
    trim(p_title),
    trim(p_contract_body),
    body_hash,
    actor_id
  )
  returning id into new_version_id;

  update public.contracts
  set status = 'sent',
      current_version_number = next_version,
      updated_at = now()
  where id = contract_id_value;

  update public.service_requests
  set status = 'contract_sent', updated_at = now()
  where id = p_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id,
    metadata
  )
  values (
    p_request_id,
    'contract_sent',
    'تم إرسال العقد وبانتظار موافقتكم',
    'requires_client_action',
    actor_id,
    jsonb_build_object('contract_version_id', new_version_id, 'sha256', body_hash)
  );

  return new_version_id;
end;
$$;
