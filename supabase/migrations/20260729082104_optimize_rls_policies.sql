do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'departments', 'job_titles', 'roles', 'permissions', 'role_permissions',
    'profiles', 'staff_registration_requests', 'user_roles', 'clients', 'client_accounts',
    'service_requests', 'projects', 'project_members', 'workflow_templates',
    'workflow_template_versions', 'workflow_stage_templates', 'workflow_action_templates',
    'workflow_action_assignment_rules', 'workflow_action_dependencies', 'estate_details',
    'estate_assets', 'workflow_instances', 'workflow_stage_instances', 'workflow_action_instances',
    'workflow_action_participants', 'documents', 'document_versions', 'conversations',
    'conversation_participants', 'messages', 'notifications', 'notification_jobs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_super_admin_all', table_name);

    if table_name not in ('service_requests', 'messages') then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check ((select private.has_role(''super_admin'')))',
        table_name || '_super_admin_insert',
        table_name
      );
    end if;

    if table_name not in ('profiles', 'notifications') then
      execute format(
        'create policy %I on public.%I for update to authenticated using ((select private.has_role(''super_admin''))) with check ((select private.has_role(''super_admin'')))',
        table_name || '_super_admin_update',
        table_name
      );
    end if;
  end loop;
end;
$$;

drop policy profiles_staff_directory on public.profiles;
alter policy profiles_select_self on public.profiles
using (
  id = (select auth.uid())
  or (
    (select private.is_active_staff())
    and account_kind = 'staff'
    and is_active
    and deleted_at is null
  )
);
alter policy profiles_update_self on public.profiles
using (
  id = (select auth.uid())
  or (select private.has_role('super_admin'))
)
with check (
  id = (select auth.uid())
  or (select private.has_role('super_admin'))
);

alter policy staff_requests_select_self on public.staff_registration_requests
using (
  profile_id = (select auth.uid())
  or (select private.has_role('super_admin'))
);

alter policy user_roles_select_self on public.user_roles
using (
  user_id = (select auth.uid())
  or (select private.has_role('super_admin'))
);

drop policy clients_account_select on public.clients;
alter policy clients_staff_select on public.clients
using (
  (
    (select private.is_active_staff())
    and archived_at is null
  )
  or exists (
    select 1
    from public.client_accounts ca
    where ca.client_id = clients.id
      and ca.profile_id = (select auth.uid())
  )
);

alter policy client_accounts_own_select on public.client_accounts
using (
  profile_id = (select auth.uid())
  or (select private.has_role('super_admin'))
);

drop policy service_requests_client_select on public.service_requests;
alter policy service_requests_staff_select on public.service_requests
using (
  (
    (select private.is_active_staff())
    and deleted_at is null
  )
  or (
    deleted_at is null
    and visibility <> 'internal'
    and (
      created_by = (select auth.uid())
      or exists (
        select 1
        from public.client_accounts ca
        where ca.client_id = service_requests.client_id
          and ca.profile_id = (select auth.uid())
      )
    )
  )
);
alter policy service_requests_client_insert on public.service_requests
with check (
  created_by = (select auth.uid())
  or (select private.has_role('super_admin'))
);

drop policy documents_client_published_select on public.documents;
alter policy documents_staff_project_select on public.documents
using (
  deleted_at is null
  and (
    (select private.has_role('super_admin'))
    or created_by = (select auth.uid())
    or (
      project_id is not null
      and (select private.can_access_project(project_id))
      and (select private.is_active_staff())
    )
    or (
      client_visibility_status = 'published'
      and visibility in ('client_visible', 'requires_client_action')
      and (
        exists (
          select 1
          from public.client_accounts ca
          where ca.client_id = documents.client_id
            and ca.profile_id = (select auth.uid())
        )
        or (
          project_id is not null
          and exists (
            select 1
            from public.projects p
            join public.client_accounts ca on ca.client_id = p.client_id
            where p.id = documents.project_id
              and ca.profile_id = (select auth.uid())
          )
        )
      )
    )
  )
);

alter policy conversations_participant_select on public.conversations
using (
  (select private.has_role('super_admin'))
  or exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = conversations.id
      and cp.user_id = (select auth.uid())
      and cp.left_at is null
  )
);

alter policy conversation_participants_member_select on public.conversation_participants
using (
  (select private.has_role('super_admin'))
  or user_id = (select auth.uid())
  or exists (
    select 1
    from public.conversation_participants self_cp
    where self_cp.conversation_id = conversation_participants.conversation_id
      and self_cp.user_id = (select auth.uid())
      and self_cp.left_at is null
  )
);

alter policy messages_participant_select on public.messages
using (
  (select private.has_role('super_admin'))
  or (
    deleted_at is null
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id = (select auth.uid())
        and cp.left_at is null
    )
  )
);
alter policy messages_participant_insert on public.messages
with check (
  (select private.has_role('super_admin'))
  or (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id = (select auth.uid())
        and cp.left_at is null
    )
  )
);

alter policy notifications_own_select on public.notifications
using (
  recipient_id = (select auth.uid())
  or (select private.has_role('super_admin'))
);
alter policy notifications_own_update on public.notifications
using (
  recipient_id = (select auth.uid())
  or (select private.has_role('super_admin'))
)
with check (
  recipient_id = (select auth.uid())
  or (select private.has_role('super_admin'))
);

create policy permissions_super_admin_select on public.permissions
for select to authenticated
using ((select private.has_role('super_admin')));
create policy role_permissions_super_admin_select on public.role_permissions
for select to authenticated
using ((select private.has_role('super_admin')));
create policy notification_jobs_super_admin_select on public.notification_jobs
for select to authenticated
using ((select private.has_role('super_admin')));
