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
  contract_row public.contracts;
  department_id_value uuid;
  client_profile_id uuid;
  project_id_value uuid;
  client_channel_id uuid;
  internal_channel_id uuid;
  project_number_value text;
begin
  if not private.has_permission('projects.create') then
    raise exception 'The current user cannot convert requests to projects';
  end if;

  select id into project_id_value
  from public.projects where service_request_id = p_request_id;
  if project_id_value is not null then return project_id_value; end if;

  select * into request_row
  from public.service_requests
  where id = p_request_id
    and status = 'contract_accepted'
    and client_id is not null
    and deleted_at is null
  for update;
  if not found then raise exception 'A linked client and accepted contract are required'; end if;

  select * into case_row
  from public.pre_contract_cases
  where service_request_id = request_row.id;
  if case_row.executor_id is null then
    raise exception 'A primary assignee is required before conversion';
  end if;

  if request_row.request_type = 'litigation' and not exists (
    select 1
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    where user_role.user_id = case_row.executor_id
      and user_role.revoked_at is null
      and role.code in ('lawyer', 'legal_specialist', 'litigation_manager')
  ) then
    raise exception 'Litigation project manager must be a lawyer or legal specialist';
  end if;

  select contract.* into contract_row
  from public.contracts contract
  where contract.service_request_id = request_row.id
    and exists (
      select 1
      from public.contract_versions version
      join public.contract_acceptances acceptance
        on acceptance.contract_version_id = version.id
       and acceptance.accepted_sha256 = version.sha256
      where version.contract_id = contract.id
        and version.version_number = contract.current_version_number
        and version.status = 'accepted'
    );
  if not found then
    raise exception 'The current contract version does not have valid acceptance evidence';
  end if;

  select id into department_id_value
  from public.departments
  where organization_id = request_row.organization_id
    and code = case
      when request_row.request_type = 'estate' then 'estates'
      else 'litigation'
    end
  limit 1;
  if department_id_value is null then raise exception 'Target department is not configured'; end if;

  select profile_id into client_profile_id
  from public.client_accounts
  where client_id = request_row.client_id
  order by is_primary desc, linked_at
  limit 1;
  if client_profile_id is null then raise exception 'Primary client account is required'; end if;

  project_number_value := private.next_operation_number(
    request_row.organization_id,
    case when request_row.request_type = 'estate' then 'EST' else 'CASE' end
  );

  insert into public.projects (
    organization_id, client_id, service_request_id, name, project_type,
    status, client_stage_label, primary_client_contact_user_id,
    department_id, project_manager_id, primary_assignee_id, project_number
  )
  values (
    request_row.organization_id, request_row.client_id, request_row.id,
    request_row.title, request_row.request_type, 'active', 'تم بدء المشروع',
    case_row.executor_id, department_id_value, case_row.executor_id,
    case_row.executor_id, project_number_value
  )
  on conflict (service_request_id) where service_request_id is not null
  do update set updated_at = now()
  returning id into project_id_value;

  insert into public.project_members (
    project_id, user_id, membership_role, can_contact_client, assigned_by
  )
  values (
    project_id_value, case_row.executor_id, 'project_manager', true, actor_id
  )
  on conflict (project_id, user_id) do update
  set left_at = null, membership_role = 'project_manager', can_contact_client = true;

  with participant_candidates(user_id, membership_role, can_contact_client, role_priority) as (
    values
      (case_row.responsible_id, 'department_manager', true, 1),
      (case_row.follower_id, 'follower', false, 2)
  ),
  unique_participants as (
    select distinct on (user_id)
      user_id, membership_role, can_contact_client
    from participant_candidates
    where user_id is not null and user_id <> case_row.executor_id
    order by user_id, role_priority
  )
  insert into public.project_members (
    project_id, user_id, membership_role, can_contact_client, assigned_by
  )
  select project_id_value, participant.user_id, participant.membership_role,
    participant.can_contact_client, actor_id
  from unique_participants participant
  on conflict (project_id, user_id) do update
  set left_at = null,
      membership_role = excluded.membership_role,
      can_contact_client = excluded.can_contact_client;

  insert into public.conversations (
    organization_id, project_id, conversation_type, title, channel_key, created_by
  )
  values (
    request_row.organization_id, project_id_value, 'client',
    'محادثة العميل', 'client', actor_id
  )
  returning id into client_channel_id;

  insert into public.conversations (
    organization_id, project_id, conversation_type, title, channel_key, created_by
  )
  values (
    request_row.organization_id, project_id_value, 'internal',
    'محادثة فريق المشروع', 'internal', actor_id
  )
  returning id into internal_channel_id;

  insert into public.conversation_participants (conversation_id, user_id)
  select client_channel_id, participant_id
  from (
    select client_profile_id as participant_id
    union select case_row.executor_id
    union select case_row.responsible_id
    union select actor_id
  ) participants
  where participant_id is not null
  on conflict do nothing;

  insert into public.conversation_participants (conversation_id, user_id)
  select internal_channel_id, project_member.user_id
  from public.project_members project_member
  where project_member.project_id = project_id_value and project_member.left_at is null
  on conflict do nothing;

  insert into public.messages (conversation_id, sender_id, body, visibility)
  values (
    client_channel_id, actor_id,
    'مرحبًا بكم، تم بدء المشروع وتعيين المكلف المسؤول للتواصل معكم.',
    'client_visible'
  );

  update public.contracts
  set status = 'converted',
      contract_number = coalesce(
        contract_number,
        private.next_operation_number(request_row.organization_id, 'CON')
      ),
      updated_at = now()
  where id = contract_row.id;

  update public.service_requests
  set status = 'converted_to_project', updated_at = now()
  where id = request_row.id;

  insert into public.pre_contract_events (
    service_request_id, event_code, title, visibility, actor_id, metadata
  )
  values (
    request_row.id, 'converted_to_project', 'تم تحويل الطلب إلى مشروع',
    'client_visible', actor_id,
    jsonb_build_object(
      'project_id', project_id_value,
      'project_number', project_number_value,
      'workflow_template', case
        when request_row.request_type = 'estate' then 'estate-v2'
        else 'litigation-v2'
      end,
      'workflow_status', 'awaiting_template_publication'
    )
  );

  if request_row.request_type = 'estate' then
    insert into public.recurring_report_schedules (
      organization_id, project_id, report_type, interval_days,
      preparation_business_days, next_period_ends_on, created_by
    )
    values (
      request_row.organization_id, project_id_value, 'estate_quarterly',
      90, 15, current_date + 90, actor_id
    )
    on conflict (project_id, report_type) do nothing;
  end if;

  return project_id_value;
end;
$$;
