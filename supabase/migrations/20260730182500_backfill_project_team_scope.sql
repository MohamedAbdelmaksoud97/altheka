-- Reconcile legacy project memberships and generic executor assignments before
-- synchronizing an operational project team.
create or replace function private.prepare_project_team_scope(
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

  -- Root estate teams operate across asset subprojects. Ensure their active
  -- members have the underlying project membership required by RLS.
  insert into public.project_members (
    project_id,
    user_id,
    membership_role,
    can_contact_client,
    assigned_by
  )
  select
    child.id,
    team_member.user_id,
    root_member.membership_role,
    root_member.can_contact_client,
    coalesce((select auth.uid()), team_row.created_by)
  from public.project_team_members team_member
  join public.project_members root_member
    on root_member.project_id = team_row.project_id
   and root_member.user_id = team_member.user_id
   and root_member.left_at is null
  join public.projects child
    on child.parent_project_id = team_row.project_id
   and child.project_type = 'estate_asset'
   and child.deleted_at is null
  where team_member.project_team_id = team_row.id
    and team_member.left_at is null
  on conflict (project_id, user_id) do update
  set membership_role = excluded.membership_role,
      can_contact_client = excluded.can_contact_client,
      assigned_by = excluded.assigned_by,
      joined_at = now(),
      left_at = null;

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    joined_at,
    left_at
  )
  select
    conversation.id,
    team_member.user_id,
    now(),
    null
  from public.project_team_members team_member
  join public.project_members root_member
    on root_member.project_id = team_row.project_id
   and root_member.user_id = team_member.user_id
   and root_member.left_at is null
  join public.projects child
    on child.parent_project_id = team_row.project_id
   and child.project_type = 'estate_asset'
   and child.deleted_at is null
  join public.conversations conversation
    on conversation.project_id = child.id
   and conversation.archived_at is null
   and (
     conversation.conversation_type = 'internal'
     or (
       conversation.conversation_type = 'client'
       and root_member.can_contact_client
     )
   )
  where team_member.project_team_id = team_row.id
    and team_member.left_at is null
  on conflict (conversation_id, user_id) do update
  set joined_at = now(), left_at = null;

  if team_row.status <> 'active'
    or (team_row.starts_at is not null and team_row.starts_at > now())
    or (team_row.ends_at is not null and team_row.ends_at < now())
  then
    return;
  end if;

  -- When the legacy generic executor is already a member of the matching team,
  -- preserve the assignment and classify its source correctly.
  update public.workflow_action_participants participant
  set assignment_reason = 'resolved_from_project_team:' || team_row.id::text
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance
    on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_stage_templates stage_template
    on stage_template.id = stage_instance.stage_template_id
  join public.workflow_instances workflow
    on workflow.id = stage_instance.workflow_instance_id
  join public.projects project on project.id = workflow.project_id
  join public.workflow_action_assignment_rules rule
    on rule.workflow_action_template_id = action_instance.action_template_id
   and rule.participant_type = 'executor'
   and rule.selector_type = 'project_team'
   and rule.project_team_code = team_row.code
  join public.project_team_members team_member
    on team_member.project_team_id = team_row.id
   and team_member.left_at is null
  join public.profiles profile
    on profile.id = team_member.user_id
   and profile.activation_status = 'active_staff'
   and profile.is_active
   and profile.deleted_at is null
  join public.project_members project_member
    on project_member.project_id = workflow.project_id
   and project_member.user_id = team_member.user_id
   and project_member.left_at is null
  where participant.workflow_action_instance_id = action_instance.id
    and participant.user_id = team_member.user_id
    and participant.participant_type = 'executor'
    and participant.unassigned_at is null
    and participant.assignment_reason in (
      'operational_project_default',
      'project_primary_assignee',
      'assistant_assignee'
    )
    and action_instance.status in ('awaiting_assignment', 'ready', 'blocked')
    and team_row.project_id in (workflow.project_id, project.parent_project_id)
    and (
      team_row.stage_instance_id is null
      or exists (
        select 1
        from public.workflow_stage_instances team_stage
        join public.workflow_stage_templates team_stage_template
          on team_stage_template.id = team_stage.stage_template_id
        where team_stage.id = team_row.stage_instance_id
          and team_stage_template.code = stage_template.code
      )
    )
    and (
      cardinality(rule.allowed_role_ids) = 0
      or exists (
        select 1
        from public.user_roles user_role
        where user_role.user_id = profile.id
          and user_role.role_id = any(rule.allowed_role_ids)
          and user_role.revoked_at is null
      )
    )
    and private.user_has_permission(profile.id, 'tasks.submit');
end;
$$;

do $patch$
declare
  function_definition text;
  anchor_text text :=
    '  if not found then' || chr(10)
    || '    return;' || chr(10)
    || '  end if;' || chr(10) || chr(10)
    || '  if team_row.status <> ''active''';
begin
  select pg_get_functiondef(
    'private.sync_project_team_assignments(uuid)'::regprocedure
  )
  into function_definition;

  if position(anchor_text in function_definition) = 0 then
    raise exception 'Unexpected sync_project_team_assignments definition';
  end if;

  function_definition := replace(
    function_definition,
    anchor_text,
    '  if not found then' || chr(10)
    || '    return;' || chr(10)
    || '  end if;' || chr(10) || chr(10)
    || '  perform private.prepare_project_team_scope(team_row.id);'
    || chr(10) || chr(10)
    || '  if team_row.status <> ''active'''
  );

  function_definition := replace(
    function_definition,
    'and default_participant.assignment_reason = ''operational_project_default''',
    'and default_participant.assignment_reason in ('
    || '''operational_project_default'', '
    || '''project_primary_assignee'', '
    || '''assistant_assignee'')'
  );

  execute function_definition;
end;
$patch$;

revoke all on function private.prepare_project_team_scope(uuid)
from public, anon, authenticated;

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
