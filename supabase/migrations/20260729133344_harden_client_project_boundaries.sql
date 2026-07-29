-- Client project access is intentionally DTO-only. Internal workflow, team,
-- litigation and estate rows remain staff-only even when the client owns the
-- parent project.

drop policy if exists projects_access_select on public.projects;
create policy projects_staff_access_select on public.projects
for select to authenticated
using (
  deleted_at is null
  and (select private.is_active_staff())
  and (select private.can_access_project(id))
);

drop policy if exists project_members_access_select on public.project_members;
create policy project_members_staff_access_select on public.project_members
for select to authenticated
using (
  (select private.is_active_staff())
  and (select private.can_access_project(project_id))
);

drop policy if exists estate_details_project_access on public.estate_details;
create policy estate_details_staff_access on public.estate_details
for select to authenticated
using (
  (select private.is_active_staff())
  and (select private.can_access_project(project_id))
);

drop policy if exists estate_assets_project_access on public.estate_assets;
create policy estate_assets_staff_access on public.estate_assets
for select to authenticated
using (
  deleted_at is null
  and (select private.is_active_staff())
  and (select private.can_access_project(project_id))
);

drop policy if exists workflow_instances_project_access on public.workflow_instances;
create policy workflow_instances_staff_access on public.workflow_instances
for select to authenticated
using (
  (select private.is_active_staff())
  and (
    (project_id is not null and (select private.can_access_project(project_id)))
    or (
      service_request_id is not null
      and (select private.can_manage_pre_contract(service_request_id))
    )
  )
);

drop policy if exists workflow_stage_instances_project_access on public.workflow_stage_instances;
create policy workflow_stage_instances_staff_access on public.workflow_stage_instances
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.workflow_instances workflow_instance
    where workflow_instance.id = workflow_stage_instances.workflow_instance_id
      and (
        (
          workflow_instance.project_id is not null
          and (select private.can_access_project(workflow_instance.project_id))
        )
        or (
          workflow_instance.service_request_id is not null
          and (select private.can_manage_pre_contract(workflow_instance.service_request_id))
        )
      )
  )
);

drop policy if exists workflow_action_instances_project_access on public.workflow_action_instances;
create policy workflow_action_instances_staff_access on public.workflow_action_instances
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.workflow_stage_instances stage_instance
    join public.workflow_instances workflow_instance
      on workflow_instance.id = stage_instance.workflow_instance_id
    where stage_instance.id = workflow_action_instances.workflow_stage_instance_id
      and (
        (
          workflow_instance.project_id is not null
          and (select private.can_access_project(workflow_instance.project_id))
        )
        or (
          workflow_instance.service_request_id is not null
          and (select private.can_manage_pre_contract(workflow_instance.service_request_id))
        )
      )
  )
);

drop policy if exists workflow_action_participants_project_access
  on public.workflow_action_participants;
create policy workflow_action_participants_staff_access
on public.workflow_action_participants
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.workflow_action_instances action_instance
    join public.workflow_stage_instances stage_instance
      on stage_instance.id = action_instance.workflow_stage_instance_id
    join public.workflow_instances workflow_instance
      on workflow_instance.id = stage_instance.workflow_instance_id
    where action_instance.id = workflow_action_participants.workflow_action_instance_id
      and (
        (
          workflow_instance.project_id is not null
          and (select private.can_access_project(workflow_instance.project_id))
        )
        or (
          workflow_instance.service_request_id is not null
          and (select private.can_manage_pre_contract(workflow_instance.service_request_id))
        )
      )
  )
);

drop policy if exists project_teams_access_select on public.project_teams;
create policy project_teams_staff_select on public.project_teams
for select to authenticated
using (
  (select private.is_active_staff())
  and (select private.can_access_project(project_id))
);

drop policy if exists project_team_members_access_select on public.project_team_members;
create policy project_team_members_staff_select on public.project_team_members
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.project_teams team
    where team.id = project_team_members.project_team_id
      and (select private.can_access_project(team.project_id))
  )
);

drop policy if exists workflow_occurrences_access_select on public.workflow_action_occurrences;
create policy workflow_occurrences_staff_select on public.workflow_action_occurrences
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.workflow_action_instances action_instance
    join public.workflow_stage_instances stage_instance
      on stage_instance.id = action_instance.workflow_stage_instance_id
    join public.workflow_instances workflow_instance
      on workflow_instance.id = stage_instance.workflow_instance_id
    where action_instance.id = workflow_action_occurrences.workflow_action_instance_id
      and (
        (
          workflow_instance.project_id is not null
          and (select private.can_access_project(workflow_instance.project_id))
        )
        or (
          workflow_instance.service_request_id is not null
          and (select private.can_manage_pre_contract(workflow_instance.service_request_id))
        )
      )
  )
);

drop policy if exists workflow_transitions_access_select on public.workflow_transition_events;
create policy workflow_transitions_staff_select on public.workflow_transition_events
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.workflow_instances workflow_instance
    where workflow_instance.id = workflow_transition_events.workflow_instance_id
      and (
        (
          workflow_instance.project_id is not null
          and (select private.can_access_project(workflow_instance.project_id))
        )
        or (
          workflow_instance.service_request_id is not null
          and (select private.can_manage_pre_contract(workflow_instance.service_request_id))
        )
      )
  )
);

drop policy if exists litigation_cases_access_select on public.litigation_cases;
create policy litigation_cases_staff_select on public.litigation_cases
for select to authenticated
using (
  (select private.is_active_staff())
  and (select private.can_access_project(project_id))
);

drop policy if exists litigation_case_actions_access_select
  on public.litigation_case_actions;
create policy litigation_case_actions_staff_select on public.litigation_case_actions
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.litigation_cases litigation_case
    where litigation_case.id = litigation_case_actions.litigation_case_id
      and (select private.can_access_project(litigation_case.project_id))
  )
);

drop policy if exists litigation_hearings_access_select on public.litigation_hearings;
create policy litigation_hearings_staff_select on public.litigation_hearings
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.litigation_cases litigation_case
    where litigation_case.id = litigation_hearings.litigation_case_id
      and (select private.can_access_project(litigation_case.project_id))
  )
);

drop policy if exists estate_shares_access_select on public.estate_party_shares;
create policy estate_shares_staff_select on public.estate_party_shares
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.estate_parties party
    where party.id = estate_party_shares.estate_party_id
      and (select private.can_access_project(party.estate_project_id))
  )
);

drop policy if exists estate_decisions_access_select on public.estate_party_decisions;
create policy estate_decisions_staff_select on public.estate_party_decisions
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.estate_parties party
    where party.id = estate_party_decisions.estate_party_id
      and (select private.can_access_project(party.estate_project_id))
  )
);

drop policy if exists report_schedules_access_select on public.recurring_report_schedules;
create policy report_schedules_staff_select on public.recurring_report_schedules
for select to authenticated
using (
  (select private.is_active_staff())
  and (select private.can_access_project(project_id))
);

drop policy if exists project_reports_access_select on public.project_reports;
create policy project_reports_staff_select on public.project_reports
for select to authenticated
using (
  (select private.is_active_staff())
  and (select private.can_access_project(project_id))
);

drop policy if exists project_report_versions_access_select
  on public.project_report_versions;
create policy project_report_versions_staff_select on public.project_report_versions
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.project_reports report
    where report.id = project_report_versions.project_report_id
      and (select private.can_access_project(report.project_id))
  )
);

create or replace function public.get_my_client_projects(
  p_project_id uuid default null
)
returns table (
  id uuid,
  name text,
  project_number text,
  project_type text,
  status text,
  client_stage_label text,
  primary_contact_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    project.id,
    project.name,
    project.project_number,
    project.project_type,
    project.status,
    project.client_stage_label,
    contact.full_name,
    project.created_at,
    project.updated_at
  from public.projects project
  join public.client_accounts account
    on account.client_id = project.client_id
   and account.profile_id = (select auth.uid())
  join public.profiles client_profile
    on client_profile.id = account.profile_id
   and client_profile.account_kind = 'client'
   and client_profile.activation_status in ('client_waiting', 'active_client')
   and client_profile.is_active
   and client_profile.deleted_at is null
  left join public.profiles contact
    on contact.id = project.primary_client_contact_user_id
  where project.deleted_at is null
    and (p_project_id is null or project.id = p_project_id)
  order by project.updated_at desc;
$$;

revoke all on function public.get_my_client_projects(uuid) from public, anon;
grant execute on function public.get_my_client_projects(uuid) to authenticated;
