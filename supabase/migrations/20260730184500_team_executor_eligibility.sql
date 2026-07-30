-- Observers follow team work but never become workflow executors. Accountants
-- need task submission when explicitly assigned as members of finance teams.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'tasks.submit'
where role.code = 'accountant'
on conflict do nothing;

do $patch$
declare
  function_definition text;
  old_condition text :=
    'and (' || chr(10)
    || '          target.participant_type <> ''executor''' || chr(10)
    || '          or private.user_has_permission(profile.id, ''tasks.submit'')'
    || chr(10) || '        )';
  new_condition text :=
    'and (' || chr(10)
    || '          target.participant_type <> ''executor''' || chr(10)
    || '          or (' || chr(10)
    || '            team_member.team_role in (''leader'', ''member'')'
    || chr(10)
    || '            and private.user_has_permission(profile.id, ''tasks.submit'')'
    || chr(10) || '          )' || chr(10)
    || '        )';
begin
  select pg_get_functiondef(
    'private.sync_workflow_project_team_assignments(uuid)'::regprocedure
  )
  into function_definition;

  if position(old_condition in function_definition) = 0 then
    raise exception 'Unexpected team executor eligibility definition';
  end if;

  execute replace(function_definition, old_condition, new_condition);
end;
$patch$;

-- Remove only unstarted observer assignments created by the earlier resolver.
update public.workflow_action_participants participant
set unassigned_at = now(),
    unassigned_by = coalesce((select auth.uid()), team.created_by),
    assignment_reason = participant.assignment_reason || ':observer'
from public.project_teams team
join public.project_team_members team_member
  on team_member.project_team_id = team.id
 and team_member.team_role = 'observer'
 and team_member.left_at is null
, public.workflow_action_instances action_instance
where action_instance.id = participant.workflow_action_instance_id
  and participant.user_id = team_member.user_id
  and participant.unassigned_at is null
  and participant.assignment_reason =
    'resolved_from_project_team:' || team.id::text
  and action_instance.status in ('awaiting_assignment', 'ready', 'blocked');

do $backfill$
declare
  team_row record;
begin
  for team_row in
    select id from public.project_teams where status = 'active'
  loop
    perform private.sync_project_team_assignments(team_row.id);
  end loop;
end;
$backfill$;
