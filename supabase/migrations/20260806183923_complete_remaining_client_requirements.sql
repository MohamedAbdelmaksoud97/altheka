insert into public.permissions (code, description)
values
  ('team_chats.manage', 'Create and manage internal workspace chat channels'),
  ('client_approvals.manage', 'Create and review documented client approvals'),
  ('consultations.manage', 'Create and publish written legal consultations'),
  ('tasks.manage_threads', 'Create and close operational task threads')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code in (
  'team_chats.manage', 'client_approvals.manage', 'consultations.manage', 'tasks.manage_threads'
)
where role.code in (
  'super_admin', 'executive_manager', 'litigation_manager', 'litigation_secretary',
  'estates_manager', 'estates_secretary', 'new_clients_manager'
)
on conflict do nothing;

alter table public.conversations
  drop constraint if exists conversations_scope_check;

alter table public.conversations
  add constraint conversations_scope_check check (
    num_nonnulls(project_id, service_request_id) <= 1
  );

create table public.client_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  title text not null check (length(trim(title)) >= 3),
  description text,
  document_id uuid references public.documents(id) on delete restrict,
  status text not null default 'sent' check (status in ('draft', 'sent', 'approved', 'rejected', 'cancelled')),
  due_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_request_id is not null or project_id is not null)
);

create table public.client_approval_responses (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null unique references public.client_approval_requests(id) on delete restrict,
  responder_profile_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  notes text,
  responded_at timestamptz not null default now()
);

create table public.legal_consultation_responses (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null unique references public.service_requests(id) on delete restrict,
  body text,
  document_id uuid references public.documents(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'published')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (body is not null or document_id is not null)
);

create index client_approval_requests_client_idx on public.client_approval_requests(client_id, created_at desc);

alter table public.client_approval_requests enable row level security;
alter table public.client_approval_responses enable row level security;
alter table public.legal_consultation_responses enable row level security;
revoke all on public.client_approval_requests, public.client_approval_responses, public.legal_consultation_responses from anon, authenticated;
grant select on public.client_approval_requests, public.client_approval_responses, public.legal_consultation_responses to authenticated;

create policy client_approval_requests_read on public.client_approval_requests
for select to authenticated using (
  (select private.is_active_staff())
  or exists (
    select 1 from public.client_accounts account
    where account.client_id = client_approval_requests.client_id
      and account.profile_id = (select auth.uid())
  )
);

create policy client_approval_responses_read on public.client_approval_responses
for select to authenticated using (
  exists (
    select 1 from public.client_approval_requests request
    where request.id = client_approval_responses.approval_request_id
  )
);

create policy legal_consultation_responses_read on public.legal_consultation_responses
for select to authenticated using (
  (select private.is_active_staff())
  or exists (
    select 1 from public.service_requests request
    join public.client_accounts account on account.client_id = request.client_id
    where request.id = legal_consultation_responses.service_request_id
      and account.profile_id = (select auth.uid())
      and legal_consultation_responses.status = 'published'
  )
);

create or replace function public.create_workspace_conversation(
  p_title text,
  p_participant_ids uuid[]
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  organization_id_value uuid;
  conversation_id_value uuid;
begin
  if actor_id is null or not private.is_active_staff() or not private.has_permission('team_chats.manage') then
    raise exception 'The current user cannot create workspace conversations';
  end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'Conversation title is required'; end if;
  select organization_id into organization_id_value from public.profiles where id = actor_id;
  insert into public.conversations (organization_id, conversation_type, title, channel_key, created_by)
  values (organization_id_value, 'internal', trim(p_title), 'workspace', actor_id)
  returning id into conversation_id_value;
  insert into public.conversation_participants (conversation_id, user_id)
  select conversation_id_value, participant_id
  from unnest(array_append(coalesce(p_participant_ids, '{}'::uuid[]), actor_id)) participant_id
  join public.profiles profile on profile.id = participant_id
    and profile.organization_id = organization_id_value
    and profile.account_kind = 'staff'
    and profile.activation_status = 'active_staff'
  on conflict do nothing;
  return conversation_id_value;
end;
$$;

create or replace function public.create_client_approval_request(
  p_client_id uuid, p_service_request_id uuid, p_project_id uuid, p_title text,
  p_description text default null, p_document_id uuid default null, p_due_at timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); organization_id_value uuid; approval_id uuid;
begin
  if actor_id is null or not private.is_active_staff() or not private.has_permission('client_approvals.manage') then raise exception 'The current user cannot manage client approvals'; end if;
  if p_service_request_id is null and p_project_id is null then raise exception 'An approval must be linked to a request or project'; end if;
  select organization_id into organization_id_value from public.profiles where id = actor_id;
  insert into public.client_approval_requests (organization_id, client_id, service_request_id, project_id, title, description, document_id, due_at, created_by)
  values (organization_id_value, p_client_id, p_service_request_id, p_project_id, trim(p_title), nullif(trim(coalesce(p_description,'')),''), p_document_id, p_due_at, actor_id)
  returning id into approval_id;
  return approval_id;
end;
$$;

create or replace function public.respond_client_approval_request(p_approval_request_id uuid, p_decision text, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); request_row public.client_approval_requests; response_id uuid;
begin
  if actor_id is null or p_decision not in ('approved','rejected') then raise exception 'Invalid approval response'; end if;
  select * into request_row from public.client_approval_requests where id = p_approval_request_id and status = 'sent' for update;
  if not found then raise exception 'Approval request is not available'; end if;
  if not exists (select 1 from public.client_accounts where client_id = request_row.client_id and profile_id = actor_id) then raise exception 'The current user cannot respond to this approval'; end if;
  insert into public.client_approval_responses (approval_request_id, responder_profile_id, decision, notes) values (request_row.id, actor_id, p_decision, nullif(trim(coalesce(p_notes,'')),'')) returning id into response_id;
  update public.client_approval_requests set status = p_decision, updated_at = now() where id = request_row.id;
  return response_id;
end;
$$;

revoke all on function public.create_workspace_conversation(text, uuid[]) from public, anon;
revoke all on function public.create_client_approval_request(uuid, uuid, uuid, text, text, uuid, timestamptz) from public, anon;
revoke all on function public.respond_client_approval_request(uuid, text, text) from public, anon;
grant execute on function public.create_workspace_conversation(text, uuid[]) to authenticated;
grant execute on function public.create_client_approval_request(uuid, uuid, uuid, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.respond_client_approval_request(uuid, text, text) to authenticated;
