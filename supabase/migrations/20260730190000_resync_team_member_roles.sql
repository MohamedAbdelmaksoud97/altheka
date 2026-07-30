-- Revoke not-yet-started team assignments whenever a member becomes an
-- observer, loses execution permission, or leaves the scoped project.
create or replace function private.remove_ineligible_project_team_assignments(
  p_project_team_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team_row public.project_teams;
begin
  select * into team_row
  from public.project_teams
  where id = p_project_team_id;

  if not found then
    return;
  end if;

  update public.workflow_action_participants participant
  set unassigned_at = now(),
      unassigned_by = coalesce((select auth.uid()), team_row.created_by),
      assignment_reason = participant.assignment_reason || ':ineligible'
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance
    on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow
    on workflow.id = stage_instance.workflow_instance_id
  where participant.workflow_action_instance_id = action_instance.id
    and participant.unassigned_at is null
    and participant.assignment_reason =
      'resolved_from_project_team:' || team_row.id::text
    and action_instance.status in ('awaiting_assignment', 'ready', 'blocked')
    and (
      not exists (
        select 1
        from public.project_team_members team_member
        where team_member.project_team_id = team_row.id
          and team_member.user_id = participant.user_id
          and team_member.team_role in ('leader', 'member')
          and team_member.left_at is null
      )
      or not exists (
        select 1
        from public.project_members project_member
        where project_member.project_id = workflow.project_id
          and project_member.user_id = participant.user_id
          and project_member.left_at is null
      )
      or not private.user_has_permission(participant.user_id, 'tasks.submit')
    );
end;
$$;

do $patch$
declare
  function_definition text;
  old_block text :=
    '  perform private.prepare_project_team_scope(team_row.id);'
    || chr(10) || chr(10)
    || '  if team_row.status <> ''active''';
  new_block text :=
    '  perform private.prepare_project_team_scope(team_row.id);'
    || chr(10)
    || '  perform private.remove_ineligible_project_team_assignments(team_row.id);'
    || chr(10) || chr(10)
    || '  if team_row.status <> ''active''';
begin
  select pg_get_functiondef(
    'private.sync_project_team_assignments(uuid)'::regprocedure
  )
  into function_definition;

  if position(old_block in function_definition) = 0 then
    raise exception 'Unexpected project team synchronization definition';
  end if;

  execute replace(function_definition, old_block, new_block);
end;
$patch$;

revoke all on function private.remove_ineligible_project_team_assignments(uuid)
from public, anon, authenticated;

do $backfill$
declare
  team_row record;
begin
  for team_row in select id from public.project_teams
  loop
    perform private.sync_project_team_assignments(team_row.id);
  end loop;
end;
$backfill$;
