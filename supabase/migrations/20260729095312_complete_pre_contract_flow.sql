create table public.pre_contract_cases (
  service_request_id uuid primary key references public.service_requests(id) on delete restrict,
  responsible_id uuid not null references public.profiles(id) on delete restrict,
  executor_id uuid references public.profiles(id) on delete restrict,
  follower_id uuid not null references public.profiles(id) on delete restrict,
  approver_id uuid references public.profiles(id) on delete restrict,
  expected_project_type text not null check (
    expected_project_type in ('litigation', 'estate', 'consultation', 'other')
  ),
  assigned_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.legal_studies (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  summary text not null check (length(trim(summary)) >= 10),
  legal_opinion text not null check (length(trim(legal_opinion)) >= 10),
  recommended_path text not null check (
    recommended_path in ('litigation', 'estate', 'consultation', 'decline')
  ),
  status text not null default 'submitted' check (
    status in ('submitted', 'approved', 'returned', 'superseded')
  ),
  prepared_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_request_id, version_number)
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  technical_scope text not null check (length(trim(technical_scope)) >= 10),
  fee_amount numeric(14, 2) not null check (fee_amount >= 0),
  currency char(3) not null default 'SAR',
  valid_until date,
  status text not null default 'sent' check (
    status in (
      'sent',
      'discount_requested',
      'negotiating',
      'accepted',
      'rejected',
      'superseded',
      'expired'
    )
  ),
  created_by uuid not null references public.profiles(id) on delete restrict,
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_request_id, version_number)
);

create table public.proposal_responses (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete restrict,
  response_type text not null check (
    response_type in ('accept', 'request_discount', 'negotiate', 'reject')
  ),
  requested_amount numeric(14, 2) check (requested_amount is null or requested_amount >= 0),
  message text,
  responded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null unique references public.service_requests(id) on delete restrict,
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'accepted', 'converted', 'withdrawn')
  ),
  current_version_number integer not null default 0 check (current_version_number >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  retention_status text not null default 'retained' check (
    retention_status in ('retained', 'archived', 'legal_hold')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  title text not null check (length(trim(title)) >= 3),
  contract_body text not null check (length(trim(contract_body)) >= 20),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'sent' check (
    status in ('sent', 'accepted', 'superseded', 'withdrawn')
  ),
  created_by uuid not null references public.profiles(id) on delete restrict,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (contract_id, version_number)
);

create table public.contract_acceptances (
  id uuid primary key default gen_random_uuid(),
  contract_version_id uuid not null references public.contract_versions(id) on delete restrict,
  accepted_by uuid not null references public.profiles(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  accepted_sha256 text not null check (accepted_sha256 ~ '^[a-f0-9]{64}$'),
  ip_address inet,
  user_agent text,
  acceptance_text text not null,
  created_at timestamptz not null default now(),
  unique (contract_version_id, accepted_by)
);

create table public.pre_contract_events (
  id bigint generated always as identity primary key,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  event_code text not null,
  title text not null,
  details text,
  visibility text not null default 'internal' check (
    visibility in ('internal', 'client_visible', 'requires_client_action')
  ),
  actor_id uuid references public.profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index projects_service_request_unique
  on public.projects (service_request_id)
  where service_request_id is not null;
create index pre_contract_cases_executor_idx on public.pre_contract_cases (executor_id);
create index pre_contract_cases_approver_idx on public.pre_contract_cases (approver_id);
create index legal_studies_request_idx on public.legal_studies (service_request_id, version_number desc);
create index proposals_request_idx on public.proposals (service_request_id, version_number desc);
create index proposal_responses_proposal_idx on public.proposal_responses (proposal_id, created_at desc);
create index contract_versions_contract_idx on public.contract_versions (contract_id, version_number desc);
create index contract_acceptances_version_idx on public.contract_acceptances (contract_version_id);
create index pre_contract_events_request_idx on public.pre_contract_events (service_request_id, created_at);

create trigger pre_contract_cases_touch_updated_at
before update on public.pre_contract_cases
for each row execute function private.touch_updated_at();
create trigger legal_studies_touch_updated_at
before update on public.legal_studies
for each row execute function private.touch_updated_at();
create trigger proposals_touch_updated_at
before update on public.proposals
for each row execute function private.touch_updated_at();
create trigger contracts_touch_updated_at
before update on public.contracts
for each row execute function private.touch_updated_at();

create trigger audit_pre_contract_cases after insert or update on public.pre_contract_cases
for each row execute function private.audit_row_change();
create trigger audit_legal_studies after insert or update on public.legal_studies
for each row execute function private.audit_row_change();
create trigger audit_proposals after insert or update on public.proposals
for each row execute function private.audit_row_change();
create trigger audit_contracts after insert or update on public.contracts
for each row execute function private.audit_row_change();
create trigger audit_contract_versions after insert or update on public.contract_versions
for each row execute function private.audit_row_change();
create trigger audit_contract_acceptances after insert on public.contract_acceptances
for each row execute function private.audit_row_change();

create or replace function private.is_request_client(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_requests request
    left join public.client_accounts account on account.client_id = request.client_id
    where request.id = p_request_id
      and request.deleted_at is null
      and (
        request.created_by = (select auth.uid())
        or account.profile_id = (select auth.uid())
      )
  );
$$;

create or replace function private.can_manage_pre_contract(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_any_role(array[
      'super_admin',
      'new_clients_manager',
      'executive_manager'
    ])
    or exists (
      select 1
      from public.pre_contract_cases case_record
      where case_record.service_request_id = p_request_id
        and (select auth.uid()) in (
          case_record.responsible_id,
          case_record.executor_id,
          case_record.follower_id,
          case_record.approver_id
        )
    );
$$;

revoke all on function private.is_request_client(uuid) from public, anon;
revoke all on function private.can_manage_pre_contract(uuid) from public, anon;
grant execute on function private.is_request_client(uuid) to authenticated;
grant execute on function private.can_manage_pre_contract(uuid) to authenticated;

create or replace function public.create_client_service_request(
  p_request_type text,
  p_title text,
  p_summary text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  profile_row public.profiles;
  linked_client_id uuid;
  new_request_id uuid;
begin
  select *
  into profile_row
  from public.profiles
  where id = actor_id
    and account_kind = 'client'
    and activation_status in ('client_waiting', 'active_client')
    and is_active
    and deleted_at is null;

  if not found then
    raise exception 'Only an active client account can create a request';
  end if;
  if p_request_type not in ('litigation', 'estate', 'consultation', 'other') then
    raise exception 'Unsupported request type';
  end if;
  if length(trim(p_title)) < 5 or length(trim(p_summary)) < 10 then
    raise exception 'Request title and summary are required';
  end if;

  select account.client_id
  into linked_client_id
  from public.client_accounts account
  where account.profile_id = actor_id
  order by account.is_primary desc, account.linked_at
  limit 1;

  insert into public.service_requests (
    organization_id,
    client_id,
    created_by,
    request_type,
    title,
    summary,
    status,
    visibility
  )
  values (
    profile_row.organization_id,
    linked_client_id,
    actor_id,
    p_request_type,
    trim(p_title),
    trim(p_summary),
    'received',
    'client_visible'
  )
  returning id into new_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id
  )
  values (
    new_request_id,
    'request_received',
    'تم استلام طلبكم',
    'client_visible',
    actor_id
  );

  return new_request_id;
end;
$$;

create or replace function public.link_client_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_row public.service_requests;
  client_profile public.profiles;
  linked_client_id uuid;
begin
  if not private.has_any_role(array['super_admin', 'new_clients_manager']) then
    raise exception 'Only the new clients manager can link requests';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = p_request_id
    and deleted_at is null
  for update;
  if not found then raise exception 'Request was not found'; end if;

  select *
  into client_profile
  from public.profiles
  where id = request_row.created_by
    and account_kind = 'client'
    and activation_status in ('client_waiting', 'active_client')
    and is_active
    and deleted_at is null;
  if not found then raise exception 'The request creator is not an active client account'; end if;

  select account.client_id
  into linked_client_id
  from public.client_accounts account
  where account.profile_id = client_profile.id
  order by account.is_primary desc, account.linked_at
  limit 1;

  if linked_client_id is null then
    insert into public.clients (
      organization_id, display_name, primary_contact_name, primary_contact_phone, status
    )
    values (
      request_row.organization_id,
      client_profile.full_name,
      client_profile.full_name,
      client_profile.phone,
      'active'
    )
    returning id into linked_client_id;

    insert into public.client_accounts (
      client_id, profile_id, linked_by, is_primary
    )
    values (linked_client_id, client_profile.id, actor_id, true);
  end if;

  update public.profiles
  set activation_status = 'active_client', updated_at = now()
  where id = client_profile.id;

  update public.service_requests
  set client_id = linked_client_id, status = 'linked', updated_at = now()
  where id = request_row.id;

  insert into public.pre_contract_cases (
    service_request_id,
    responsible_id,
    follower_id,
    expected_project_type
  )
  values (
    request_row.id,
    actor_id,
    actor_id,
    request_row.request_type
  )
  on conflict (service_request_id) do update
  set responsible_id = excluded.responsible_id,
      follower_id = excluded.follower_id,
      updated_at = now();

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id
  )
  values (
    request_row.id,
    'client_linked',
    'تم ربط الطلب بملف العميل',
    'client_visible',
    actor_id
  );

  return linked_client_id;
end;
$$;

create or replace function public.assign_pre_contract_request(
  p_request_id uuid,
  p_executor_id uuid,
  p_approver_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if not private.has_any_role(array['super_admin', 'new_clients_manager']) then
    raise exception 'Only the new clients manager can assign requests';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_executor_id
      and activation_status = 'active_staff'
      and is_active and deleted_at is null
  ) then raise exception 'Executor must be an active staff member'; end if;
  if not exists (
    select 1 from public.profiles
    where id = p_approver_id
      and activation_status = 'active_staff'
      and is_active and deleted_at is null
  ) then raise exception 'Approver must be an active staff member'; end if;

  update public.pre_contract_cases
  set executor_id = p_executor_id,
      approver_id = p_approver_id,
      assigned_at = now(),
      assigned_by = actor_id,
      updated_at = now()
  where service_request_id = p_request_id;
  if not found then raise exception 'Link the client before assignment'; end if;

  update public.service_requests
  set status = 'assigned', updated_at = now()
  where id = p_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id,
    metadata
  )
  values (
    p_request_id,
    'specialist_assigned',
    'تم تحويل الطلب إلى المختص',
    'client_visible',
    actor_id,
    jsonb_build_object('executor_id', p_executor_id, 'approver_id', p_approver_id)
  );
end;
$$;

create or replace function public.submit_legal_study(
  p_request_id uuid,
  p_summary text,
  p_legal_opinion text,
  p_recommended_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  next_version integer;
  new_study_id uuid;
begin
  if not exists (
    select 1
    from public.pre_contract_cases case_record
    where case_record.service_request_id = p_request_id
      and (
        case_record.executor_id = actor_id
        or private.has_any_role(array['super_admin', 'new_clients_manager'])
      )
  ) then raise exception 'Only the assigned executor can submit the study'; end if;
  if p_recommended_path not in ('litigation', 'estate', 'consultation', 'decline') then
    raise exception 'Unsupported recommended path';
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.legal_studies
  where service_request_id = p_request_id;

  update public.legal_studies
  set status = 'superseded', updated_at = now()
  where service_request_id = p_request_id
    and status in ('submitted', 'returned');

  insert into public.legal_studies (
    service_request_id,
    version_number,
    summary,
    legal_opinion,
    recommended_path,
    prepared_by
  )
  values (
    p_request_id,
    next_version,
    trim(p_summary),
    trim(p_legal_opinion),
    p_recommended_path,
    actor_id
  )
  returning id into new_study_id;

  update public.service_requests
  set status = 'study_pending_approval', updated_at = now()
  where id = p_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id
  )
  values (
    p_request_id,
    'study_submitted',
    'جارٍ تدقيق الدراسة من الإدارة',
    'client_visible',
    actor_id
  );

  return new_study_id;
end;
$$;

create or replace function public.review_legal_study(
  p_study_id uuid,
  p_decision text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  study_row public.legal_studies;
begin
  select *
  into study_row
  from public.legal_studies
  where id = p_study_id and status = 'submitted'
  for update;
  if not found then raise exception 'Submitted study was not found'; end if;
  if not exists (
    select 1
    from public.pre_contract_cases case_record
    where case_record.service_request_id = study_row.service_request_id
      and (
        case_record.approver_id = actor_id
        or private.has_role('super_admin')
      )
  ) then raise exception 'Only the assigned approver can review the study'; end if;
  if p_decision not in ('approve', 'return') then raise exception 'Unsupported review decision'; end if;

  update public.legal_studies
  set status = case when p_decision = 'approve' then 'approved' else 'returned' end,
      reviewed_by = actor_id,
      reviewed_at = now(),
      review_notes = nullif(trim(p_notes), ''),
      updated_at = now()
  where id = study_row.id;

  update public.service_requests
  set status = case
      when p_decision = 'approve' then 'study_approved'
      else 'study_returned'
    end,
    updated_at = now()
  where id = study_row.service_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, details, visibility, actor_id
  )
  values (
    study_row.service_request_id,
    case when p_decision = 'approve' then 'study_approved' else 'study_returned' end,
    case
      when p_decision = 'approve' then 'تم اعتماد الدراسة وجارٍ إعداد العرض'
      else 'أعيدت الدراسة للمختص لاستكمالها'
    end,
    nullif(trim(p_notes), ''),
    case when p_decision = 'approve' then 'client_visible' else 'internal' end,
    actor_id
  );
end;
$$;

create or replace function public.send_pre_contract_proposal(
  p_request_id uuid,
  p_technical_scope text,
  p_fee_amount numeric,
  p_currency text default 'SAR',
  p_valid_until date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_status text;
  next_version integer;
  new_proposal_id uuid;
begin
  if not private.has_any_role(array['super_admin', 'new_clients_manager']) then
    raise exception 'Only the new clients manager can send proposals';
  end if;
  select status into request_status
  from public.service_requests
  where id = p_request_id and deleted_at is null
  for update;
  if request_status not in (
    'study_approved', 'discount_requested', 'negotiating', 'proposal_sent'
  ) then raise exception 'The request is not ready for a proposal'; end if;

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.proposals
  where service_request_id = p_request_id;

  update public.proposals
  set status = 'superseded', updated_at = now()
  where service_request_id = p_request_id
    and status in ('sent', 'discount_requested', 'negotiating');

  insert into public.proposals (
    service_request_id,
    version_number,
    technical_scope,
    fee_amount,
    currency,
    valid_until,
    created_by
  )
  values (
    p_request_id,
    next_version,
    trim(p_technical_scope),
    p_fee_amount,
    upper(p_currency)::char(3),
    p_valid_until,
    actor_id
  )
  returning id into new_proposal_id;

  update public.service_requests
  set status = 'proposal_sent', updated_at = now()
  where id = p_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id,
    metadata
  )
  values (
    p_request_id,
    'proposal_sent',
    case when next_version = 1 then 'تم إرسال العرض الفني والمالي' else 'تم إرسال عرض معدل' end,
    'requires_client_action',
    actor_id,
    jsonb_build_object('proposal_id', new_proposal_id, 'version', next_version)
  );

  return new_proposal_id;
end;
$$;

create or replace function public.respond_to_pre_contract_proposal(
  p_proposal_id uuid,
  p_response_type text,
  p_requested_amount numeric default null,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.proposals;
  next_status text;
begin
  select *
  into proposal_row
  from public.proposals
  where id = p_proposal_id and status = 'sent'
  for update;
  if not found then raise exception 'Active proposal was not found'; end if;
  if not private.is_request_client(proposal_row.service_request_id) then
    raise exception 'Only the request client can respond to the proposal';
  end if;
  if p_response_type not in ('accept', 'request_discount', 'negotiate', 'reject') then
    raise exception 'Unsupported proposal response';
  end if;
  if p_response_type = 'request_discount' and p_requested_amount is null then
    raise exception 'Requested amount is required';
  end if;

  next_status := case p_response_type
    when 'accept' then 'accepted'
    when 'request_discount' then 'discount_requested'
    when 'negotiate' then 'negotiating'
    else 'rejected'
  end;

  insert into public.proposal_responses (
    proposal_id, response_type, requested_amount, message, responded_by
  )
  values (
    proposal_row.id,
    p_response_type,
    p_requested_amount,
    nullif(trim(p_message), ''),
    actor_id
  );

  update public.proposals
  set status = next_status, responded_at = now(), updated_at = now()
  where id = proposal_row.id;

  update public.service_requests
  set status = case p_response_type
      when 'accept' then 'proposal_accepted'
      when 'request_discount' then 'discount_requested'
      when 'negotiate' then 'negotiating'
      else 'proposal_rejected'
    end,
    updated_at = now()
  where id = proposal_row.service_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, details, visibility, actor_id
  )
  values (
    proposal_row.service_request_id,
    'proposal_' || p_response_type,
    case p_response_type
      when 'accept' then 'تمت الموافقة على العرض'
      when 'request_discount' then 'تم استلام طلب التخفيض'
      when 'negotiate' then 'جارٍ التفاوض'
      else 'تم رفض العرض'
    end,
    nullif(trim(p_message), ''),
    'client_visible',
    actor_id
  );
end;
$$;

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

  body_hash := encode(digest(convert_to(trim(p_contract_body), 'UTF8'), 'sha256'), 'hex');

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

create or replace function public.accept_pre_contract_contract(
  p_contract_version_id uuid,
  p_acceptance_text text,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  version_row public.contract_versions;
  contract_row public.contracts;
  acceptance_id uuid;
begin
  select *
  into version_row
  from public.contract_versions
  where id = p_contract_version_id and status = 'sent'
  for update;
  if not found then raise exception 'Active contract version was not found'; end if;

  select *
  into contract_row
  from public.contracts
  where id = version_row.contract_id
  for update;
  if not private.is_request_client(contract_row.service_request_id) then
    raise exception 'Only the request client can accept the contract';
  end if;
  if length(trim(p_acceptance_text)) < 10 then
    raise exception 'Documented acceptance text is required';
  end if;

  insert into public.contract_acceptances (
    contract_version_id,
    accepted_by,
    accepted_sha256,
    ip_address,
    user_agent,
    acceptance_text
  )
  values (
    version_row.id,
    actor_id,
    version_row.sha256,
    p_ip_address,
    left(p_user_agent, 1000),
    trim(p_acceptance_text)
  )
  on conflict (contract_version_id, accepted_by) do update
  set accepted_at = excluded.accepted_at,
      accepted_sha256 = excluded.accepted_sha256,
      ip_address = excluded.ip_address,
      user_agent = excluded.user_agent,
      acceptance_text = excluded.acceptance_text
  returning id into acceptance_id;

  update public.contract_versions
  set status = 'accepted'
  where id = version_row.id;
  update public.contracts
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = contract_row.id;
  update public.service_requests
  set status = 'contract_accepted', updated_at = now()
  where id = contract_row.service_request_id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id
  )
  values (
    contract_row.service_request_id,
    'contract_accepted',
    'تم اعتماد العقد',
    'client_visible',
    actor_id
  );

  return acceptance_id;
end;
$$;

create or replace function public.convert_request_to_project(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_row public.service_requests;
  case_row public.pre_contract_cases;
  project_id_value uuid;
  published_version_id uuid;
begin
  if not private.has_any_role(array['super_admin', 'new_clients_manager']) then
    raise exception 'Only the new clients manager can convert requests';
  end if;

  select id into project_id_value
  from public.projects
  where service_request_id = p_request_id;
  if project_id_value is not null then return project_id_value; end if;

  select *
  into request_row
  from public.service_requests
  where id = p_request_id
    and status = 'contract_accepted'
    and client_id is not null
    and deleted_at is null
  for update;
  if not found then raise exception 'An accepted contract and linked client are required'; end if;

  select * into case_row
  from public.pre_contract_cases
  where service_request_id = p_request_id;

  insert into public.projects (
    organization_id,
    client_id,
    service_request_id,
    name,
    project_type,
    status,
    client_stage_label,
    primary_client_contact_user_id
  )
  values (
    request_row.organization_id,
    request_row.client_id,
    request_row.id,
    request_row.title,
    request_row.request_type,
    'active',
    'تم بدء المشروع',
    case_row.responsible_id
  )
  on conflict (service_request_id) where service_request_id is not null
  do update set updated_at = now()
  returning id into project_id_value;

  insert into public.project_members (
    project_id, user_id, membership_role, can_contact_client, assigned_by
  )
  values (
    project_id_value, case_row.responsible_id, 'project_manager', true, actor_id
  )
  on conflict (project_id, user_id) do update
  set left_at = null,
      membership_role = 'project_manager',
      can_contact_client = true;

  if case_row.executor_id is not null then
    insert into public.project_members (
      project_id, user_id, membership_role, can_contact_client, assigned_by
    )
    values (
      project_id_value, case_row.executor_id, 'executor', false, actor_id
    )
    on conflict (project_id, user_id) do update
    set left_at = null, membership_role = 'executor';
  end if;

  update public.service_requests
  set status = 'converted_to_project', updated_at = now()
  where id = request_row.id;
  update public.contracts
  set status = 'converted', updated_at = now()
  where service_request_id = request_row.id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id,
    metadata
  )
  values (
    request_row.id,
    'converted_to_project',
    'تم تحويل الطلب إلى مشروع',
    'client_visible',
    actor_id,
    jsonb_build_object('project_id', project_id_value)
  );

  if request_row.request_type = 'litigation' then
    select version.id
    into published_version_id
    from public.workflow_template_versions version
    join public.workflow_templates template on template.id = version.workflow_template_id
    where template.organization_id = request_row.organization_id
      and template.slug = 'litigation-pilot'
      and version.status = 'published'
    limit 1;

    if published_version_id is not null
      and not exists (
        select 1 from public.workflow_instances
        where project_id = project_id_value
          and workflow_template_version_id = published_version_id
      )
    then
      perform public.start_workflow_instance(
        project_id_value,
        published_version_id,
        'مسار التقاضي',
        null
      );
    end if;
  end if;

  return project_id_value;
end;
$$;

create or replace function public.register_request_document(
  p_request_id uuid,
  p_title text,
  p_document_type text,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_publish_to_client boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_row public.service_requests;
  actor_is_client boolean;
  new_document_id uuid;
  publish_document boolean;
begin
  actor_is_client := private.is_request_client(p_request_id);
  if not actor_is_client and not private.can_manage_pre_contract(p_request_id) then
    raise exception 'The current user cannot upload documents for this request';
  end if;

  select * into request_row
  from public.service_requests
  where id = p_request_id and deleted_at is null;
  if not found then raise exception 'Request was not found'; end if;
  if p_storage_bucket <> 'legal-documents' then raise exception 'Unsupported storage bucket'; end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = p_storage_bucket and name = p_storage_path
  ) then raise exception 'Uploaded storage object was not found'; end if;

  publish_document := actor_is_client or p_publish_to_client;

  insert into public.documents (
    organization_id,
    service_request_id,
    client_id,
    title,
    document_type,
    visibility,
    client_visibility_status,
    current_version_number,
    created_by
  )
  values (
    request_row.organization_id,
    request_row.id,
    request_row.client_id,
    trim(p_title),
    trim(p_document_type),
    case when publish_document then 'client_visible' else 'internal' end,
    'draft',
    1,
    actor_id
  )
  returning id into new_document_id;

  insert into public.document_versions (
    document_id,
    version_number,
    storage_bucket,
    storage_path,
    file_name,
    mime_type,
    byte_size,
    sha256,
    uploaded_by
  )
  values (
    new_document_id,
    1,
    p_storage_bucket,
    p_storage_path,
    p_file_name,
    p_mime_type,
    p_byte_size,
    lower(p_sha256),
    actor_id
  );

  if publish_document then
    update public.documents
    set client_visibility_status = 'published',
        published_to_client_at = now(),
        published_by = actor_id,
        updated_at = now()
    where id = new_document_id;
  end if;

  if request_row.status in ('received', 'linked') then
    update public.service_requests
    set status = case when request_row.status = 'received' then 'received' else 'collecting_documents' end,
        updated_at = now()
    where id = request_row.id;
  end if;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id,
    metadata
  )
  values (
    request_row.id,
    'document_uploaded',
    'تم رفع مستند',
    case when publish_document then 'client_visible' else 'internal' end,
    actor_id,
    jsonb_build_object('document_id', new_document_id, 'file_name', p_file_name)
  );

  return new_document_id;
end;
$$;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.create_client_service_request(text, text, text)',
    'public.link_client_request(uuid)',
    'public.assign_pre_contract_request(uuid, uuid, uuid)',
    'public.submit_legal_study(uuid, text, text, text)',
    'public.review_legal_study(uuid, text, text)',
    'public.send_pre_contract_proposal(uuid, text, numeric, text, date)',
    'public.respond_to_pre_contract_proposal(uuid, text, numeric, text)',
    'public.send_pre_contract_contract(uuid, text, text)',
    'public.accept_pre_contract_contract(uuid, text, inet, text)',
    'public.convert_request_to_project(uuid)',
    'public.register_request_document(uuid, text, text, text, text, text, text, bigint, text, boolean)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', function_signature);
    execute format('grant execute on function %s to authenticated', function_signature);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'pre_contract_cases',
    'legal_studies',
    'proposals',
    'proposal_responses',
    'contracts',
    'contract_versions',
    'contract_acceptances',
    'pre_contract_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
  end loop;
end;
$$;
grant usage, select on sequence public.pre_contract_events_id_seq to authenticated;

create policy pre_contract_cases_staff_select on public.pre_contract_cases
for select to authenticated
using ((select private.can_manage_pre_contract(service_request_id)));

create policy legal_studies_staff_select on public.legal_studies
for select to authenticated
using ((select private.can_manage_pre_contract(service_request_id)));

create policy proposals_authorized_select on public.proposals
for select to authenticated
using (
  (select private.can_manage_pre_contract(service_request_id))
  or (
    status in ('sent', 'discount_requested', 'negotiating', 'accepted', 'rejected', 'superseded')
    and (select private.is_request_client(service_request_id))
  )
);

create policy proposal_responses_authorized_select on public.proposal_responses
for select to authenticated
using (
  exists (
    select 1 from public.proposals proposal
    where proposal.id = proposal_responses.proposal_id
      and (
        (select private.can_manage_pre_contract(proposal.service_request_id))
        or (select private.is_request_client(proposal.service_request_id))
      )
  )
);

create policy contracts_authorized_select on public.contracts
for select to authenticated
using (
  (select private.can_manage_pre_contract(service_request_id))
  or (
    status in ('sent', 'accepted', 'converted')
    and (select private.is_request_client(service_request_id))
  )
);

create policy contract_versions_authorized_select on public.contract_versions
for select to authenticated
using (
  exists (
    select 1 from public.contracts contract
    where contract.id = contract_versions.contract_id
      and (
        (select private.can_manage_pre_contract(contract.service_request_id))
        or (
          contract_versions.status in ('sent', 'accepted', 'superseded')
          and (select private.is_request_client(contract.service_request_id))
        )
      )
  )
);

create policy contract_acceptances_authorized_select on public.contract_acceptances
for select to authenticated
using (
  accepted_by = (select auth.uid())
  or exists (
    select 1
    from public.contract_versions version
    join public.contracts contract on contract.id = version.contract_id
    where version.id = contract_acceptances.contract_version_id
      and (select private.can_manage_pre_contract(contract.service_request_id))
  )
);

create policy pre_contract_events_authorized_select on public.pre_contract_events
for select to authenticated
using (
  (select private.can_manage_pre_contract(service_request_id))
  or (
    visibility <> 'internal'
    and (select private.is_request_client(service_request_id))
  )
);
