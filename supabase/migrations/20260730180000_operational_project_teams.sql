-- Make project teams an operational workflow assignment source.

create or replace function private.refresh_team_managed_action_status(
  p_action_instance_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_status text;
begin
  select status into action_status
  from public.workflow_action_instances
  where id = p_action_instance_id
  for update;

  if not found or action_status not in ('awaiting_assignment', 'ready', 'blocked') then
    return;
  end if;

  update public.workflow_action_instances action_instance
  set status = case
        when exists (
          select 1
          from public.workflow_action_assignment_rules rule
          where rule.workflow_action_template_id = action_instance.action_template_id
            and (
              select count(*)
              from public.workflow_action_participants participant
              where participant.workflow_action_instance_id = action_instance.id
                and participant.participant_type = rule.participant_type
                and participant.unassigned_at is null
            ) < rule.minimum_participants
        ) then 'awaiting_assignment'
        when stage_instance.status not in ('active', 'overdue') then 'blocked'
        when exists (
          select 1
          from public.workflow_action_dependencies dependency
          join public.workflow_action_instances prerequisite
            on prerequisite.action_template_id = dependency.depends_on_action_template_id
          join public.workflow_stage_instances prerequisite_stage
            on prerequisite_stage.id = prerequisite.workflow_stage_instance_id
          where dependency.action_template_id = action_instance.action_template_id
            and prerequisite_stage.workflow_instance_id = stage_instance.workflow_instance_id
            and prerequisite.status not in ('approved', 'completed', 'cancelled')
        ) then 'blocked'
        else 'ready'
      end,
      due_at = case
        when not exists (
          select 1
          from public.workflow_action_assignment_rules rule
          where rule.workflow_action_template_id = action_instance.action_template_id
            and (
              select count(*)
              from public.workflow_action_participants participant
              where participant.workflow_action_instance_id = action_instance.id
                and participant.participant_type = rule.participant_type
                and participant.unassigned_at is null
            ) < rule.minimum_participants
        )
          and stage_instance.status in ('active', 'overdue')
          and action_instance.planned_duration is not null
        then coalesce(action_instance.due_at, now() + action_instance.planned_duration)
        else null
      end,
      updated_at = now()
  from public.workflow_stage_instances stage_instance
  where action_instance.id = p_action_instance_id
    and stage_instance.id = action_instance.workflow_stage_instance_id;
end;
$$;

create or replace function private.sync_workflow_project_team_assignments(
  p_workflow_instance_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  candidate record;
  active_count integer;
  assignment_actor uuid;
begin
  select coalesce((select auth.uid()), workflow.created_by)
  into assignment_actor
  from public.workflow_instances workflow
  where workflow.id = p_workflow_instance_id;

  if assignment_actor is null then
    return;
  end if;

  for target in
    select
      action_instance.id as action_instance_id,
      workflow.project_id,
      project.parent_project_id,
      rule.participant_type,
      rule.project_team_code,
      rule.allowed_role_ids,
      rule.maximum_participants,
      stage_template.code as stage_code
    from public.workflow_instances workflow
    join public.projects project on project.id = workflow.project_id
    join public.workflow_stage_instances stage_instance
      on stage_instance.workflow_instance_id = workflow.id
    join public.workflow_stage_templates stage_template
      on stage_template.id = stage_instance.stage_template_id
    join public.workflow_action_instances action_instance
      on action_instance.workflow_stage_instance_id = stage_instance.id
    join public.workflow_action_assignment_rules rule
      on rule.workflow_action_template_id = action_instance.action_template_id
    where workflow.id = p_workflow_instance_id
      and workflow.project_id is not null
      and rule.selector_type = 'project_team'
      and action_instance.status not in ('approved', 'completed', 'cancelled')
    order by action_instance.id, rule.priority
  loop
    select count(*) into active_count
    from public.workflow_action_participants participant
    where participant.workflow_action_instance_id = target.action_instance_id
      and participant.participant_type = target.participant_type
      and participant.unassigned_at is null;

    if active_count >= target.maximum_participants then
      continue;
    end if;

    for candidate in
      select
        team.id as team_id,
        team_member.user_id
      from public.project_teams team
      join public.project_team_members team_member
        on team_member.project_team_id = team.id
       and team_member.left_at is null
      join public.profiles profile
        on profile.id = team_member.user_id
       and profile.activation_status = 'active_staff'
       and profile.is_active
       and profile.deleted_at is null
      join public.project_members project_member
        on project_member.project_id = target.project_id
       and project_member.user_id = team_member.user_id
       and project_member.left_at is null
      where team.code = target.project_team_code
        and team.status = 'active'
        and team.project_id in (target.project_id, target.parent_project_id)
        and (team.starts_at is null or team.starts_at <= now())
        and (team.ends_at is null or team.ends_at >= now())
        and (
          team.stage_instance_id is null
          or exists (
            select 1
            from public.workflow_stage_instances team_stage
            join public.workflow_stage_templates team_stage_template
              on team_stage_template.id = team_stage.stage_template_id
            where team_stage.id = team.stage_instance_id
              and team_stage_template.code = target.stage_code
          )
        )
        and (
          cardinality(target.allowed_role_ids) = 0
          or exists (
            select 1
            from public.user_roles user_role
            where user_role.user_id = profile.id
              and user_role.role_id = any(target.allowed_role_ids)
              and user_role.revoked_at is null
          )
        )
        and (
          target.participant_type <> 'executor'
          or private.user_has_permission(profile.id, 'tasks.submit')
        )
      order by
        case team_member.team_role
          when 'leader' then 1
          when 'member' then 2
          else 3
        end,
        team_member.joined_at,
        profile.id
    loop
      exit when active_count >= target.maximum_participants;

      insert into public.workflow_action_participants (
        workflow_action_instance_id,
        participant_type,
        user_id,
        assigned_by,
        assignment_reason
      )
      values (
        target.action_instance_id,
        target.participant_type,
        candidate.user_id,
        assignment_actor,
        'resolved_from_project_team:' || candidate.team_id::text
      )
      on conflict do nothing;

      if found then
        active_count := active_count + 1;
      end if;
    end loop;

    perform private.refresh_team_managed_action_status(target.action_instance_id);
  end loop;
end;
$$;

create or replace function private.sync_project_team_assignments(
  p_project_team_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team_row public.project_teams;
  workflow_row record;
  action_row record;
begin
  select * into team_row
  from public.project_teams
  where id = p_project_team_id;

  if not found then
    return;
  end if;

  if team_row.status <> 'active'
    or (team_row.starts_at is not null and team_row.starts_at > now())
    or (team_row.ends_at is not null and team_row.ends_at < now())
  then
    update public.workflow_action_participants participant
    set unassigned_at = now(),
        unassigned_by = coalesce((select auth.uid()), team_row.created_by),
        assignment_reason = participant.assignment_reason || ':team_inactive'
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
        workflow.project_id = team_row.project_id
        or exists (
          select 1 from public.projects child
          where child.id = workflow.project_id
            and child.parent_project_id = team_row.project_id
        )
      );
  end if;

  for workflow_row in
    select workflow.id
    from public.workflow_instances workflow
    join public.projects project on project.id = workflow.project_id
    where workflow.status in ('draft', 'active', 'on_hold')
      and (
        workflow.project_id = team_row.project_id
        or project.parent_project_id = team_row.project_id
      )
  loop
    perform private.sync_workflow_project_team_assignments(workflow_row.id);
  end loop;

  -- Replace the old generic executor only when a real team executor exists.
  update public.workflow_action_participants default_participant
  set unassigned_at = now(),
      unassigned_by = coalesce((select auth.uid()), team_row.created_by),
      assignment_reason = default_participant.assignment_reason || ':replaced_by_team'
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance
    on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow
    on workflow.id = stage_instance.workflow_instance_id
  join public.workflow_action_assignment_rules rule
    on rule.workflow_action_template_id = action_instance.action_template_id
   and rule.participant_type = 'executor'
   and rule.selector_type = 'project_team'
   and rule.project_team_code = team_row.code
  where default_participant.workflow_action_instance_id = action_instance.id
    and default_participant.participant_type = 'executor'
    and default_participant.unassigned_at is null
    and default_participant.assignment_reason = 'operational_project_default'
    and action_instance.status in ('awaiting_assignment', 'ready', 'blocked')
    and (
      workflow.project_id = team_row.project_id
      or exists (
        select 1 from public.projects child
        where child.id = workflow.project_id
          and child.parent_project_id = team_row.project_id
      )
    )
    and exists (
      select 1
      from public.workflow_action_participants team_participant
      where team_participant.workflow_action_instance_id = action_instance.id
        and team_participant.participant_type = 'executor'
        and team_participant.unassigned_at is null
        and team_participant.assignment_reason like 'resolved_from_project_team:%'
    );

  for action_row in
    select distinct action_instance.id
    from public.workflow_action_instances action_instance
    join public.workflow_stage_instances stage_instance
      on stage_instance.id = action_instance.workflow_stage_instance_id
    join public.workflow_instances workflow
      on workflow.id = stage_instance.workflow_instance_id
    join public.workflow_action_assignment_rules rule
      on rule.workflow_action_template_id = action_instance.action_template_id
    where rule.selector_type = 'project_team'
      and rule.project_team_code = team_row.code
      and (
        workflow.project_id = team_row.project_id
        or exists (
          select 1 from public.projects child
          where child.id = workflow.project_id
            and child.parent_project_id = team_row.project_id
        )
      )
  loop
    perform private.refresh_team_managed_action_status(action_row.id);
  end loop;
end;
$$;

create or replace function public.create_project_team_v2(
  p_project_id uuid,
  p_code text,
  p_name text,
  p_stage_instance_id uuid default null,
  p_leader_id uuid default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  team_id uuid;
begin
  select * into project_row
  from public.projects
  where id = p_project_id and deleted_at is null;

  if not found then raise exception 'Project was not found'; end if;
  if not private.has_permission('project_teams.manage')
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot manage project teams'; end if;
  if length(trim(coalesce(p_code, ''))) < 2
    or length(trim(coalesce(p_name, ''))) < 2
  then raise exception 'Team code and name are required'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Team end date must be after its start date';
  end if;
  if p_stage_instance_id is not null and not exists (
    select 1
    from public.workflow_stage_instances stage_instance
    join public.workflow_instances workflow
      on workflow.id = stage_instance.workflow_instance_id
    where stage_instance.id = p_stage_instance_id
      and workflow.project_id = project_row.id
  ) then raise exception 'Team stage must belong to the project workflow'; end if;
  if p_leader_id is not null and not exists (
    select 1 from public.project_members member
    where member.project_id = project_row.id
      and member.user_id = p_leader_id
      and member.left_at is null
  ) then raise exception 'Team leader must be an active project member'; end if;

  insert into public.project_teams (
    organization_id,
    project_id,
    stage_instance_id,
    code,
    name,
    leader_id,
    status,
    starts_at,
    ends_at,
    created_by
  )
  values (
    project_row.organization_id,
    project_row.id,
    p_stage_instance_id,
    lower(trim(p_code)),
    trim(p_name),
    p_leader_id,
    'active',
    p_starts_at,
    p_ends_at,
    actor_id
  )
  returning id into team_id;

  if p_leader_id is not null then
    insert into public.project_team_members (
      project_team_id, user_id, team_role, assigned_by
    )
    values (team_id, p_leader_id, 'leader', actor_id);
  end if;

  perform private.sync_project_team_assignments(team_id);
  return team_id;
end;
$$;

create or replace function public.assign_project_team_member(
  p_project_team_id uuid,
  p_user_id uuid,
  p_team_role text default 'member'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  team_row public.project_teams;
  project_row public.projects;
begin
  select * into team_row
  from public.project_teams
  where id = p_project_team_id
    and status in ('planned', 'active')
  for update;

  if not found then raise exception 'Active project team was not found'; end if;
  select * into project_row from public.projects where id = team_row.project_id;

  if not private.has_permission('project_teams.assign')
    or not private.can_access_project(team_row.project_id)
  then raise exception 'The current user cannot assign project teams'; end if;
  if p_team_role not in ('leader', 'member', 'observer') then
    raise exception 'Unsupported team role';
  end if;
  if not exists (
    select 1 from public.project_members member
    where member.project_id = team_row.project_id
      and member.user_id = p_user_id
      and member.left_at is null
  ) then raise exception 'Team member must already belong to the project'; end if;
  if p_user_id = actor_id and not (
    project_row.project_manager_id = actor_id
    or private.has_permission('system.override')
    or (
      exists (
        select 1 from public.profiles profile
        where profile.id = actor_id
          and profile.department_id = project_row.department_id
      )
      and private.has_permission('projects.assign_manager')
    )
  ) then raise exception 'Self-assignment requires project or department manager authority'; end if;
  if team_row.leader_id = p_user_id and p_team_role <> 'leader' then
    raise exception 'Change the team leader before changing this member role';
  end if;

  if p_team_role = 'leader' then
    update public.project_team_members
    set team_role = 'member'
    where project_team_id = team_row.id
      and team_role = 'leader'
      and user_id <> p_user_id
      and left_at is null;
  end if;

  insert into public.project_team_members (
    project_team_id, user_id, team_role, assigned_by
  )
  values (team_row.id, p_user_id, p_team_role, actor_id)
  on conflict (project_team_id, user_id) do update
  set team_role = excluded.team_role,
      assigned_by = excluded.assigned_by,
      joined_at = now(),
      left_at = null;

  if p_team_role = 'leader' then
    update public.project_teams
    set leader_id = p_user_id, updated_at = now()
    where id = team_row.id;
  end if;

  perform private.sync_project_team_assignments(team_row.id);
end;
$$;

create or replace function public.update_project_team(
  p_project_team_id uuid,
  p_name text,
  p_status text,
  p_stage_instance_id uuid default null,
  p_leader_id uuid default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  team_row public.project_teams;
begin
  select * into team_row
  from public.project_teams
  where id = p_project_team_id
  for update;

  if not found then raise exception 'Project team was not found'; end if;
  if not private.has_permission('project_teams.manage')
    or not private.can_access_project(team_row.project_id)
  then raise exception 'The current user cannot manage project teams'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Team name is required';
  end if;
  if p_status not in ('planned', 'active', 'completed', 'cancelled') then
    raise exception 'Unsupported project team status';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Team end date must be after its start date';
  end if;
  if p_stage_instance_id is not null and not exists (
    select 1
    from public.workflow_stage_instances stage_instance
    join public.workflow_instances workflow
      on workflow.id = stage_instance.workflow_instance_id
    where stage_instance.id = p_stage_instance_id
      and workflow.project_id = team_row.project_id
  ) then raise exception 'Team stage must belong to the project workflow'; end if;
  if p_leader_id is not null and not exists (
    select 1 from public.project_members member
    where member.project_id = team_row.project_id
      and member.user_id = p_leader_id
      and member.left_at is null
  ) then raise exception 'Team leader must be an active project member'; end if;

  update public.project_team_members
  set team_role = 'member'
  where project_team_id = team_row.id
    and team_role = 'leader'
    and user_id is distinct from p_leader_id
    and left_at is null;

  if p_leader_id is not null then
    insert into public.project_team_members (
      project_team_id, user_id, team_role, assigned_by
    )
    values (team_row.id, p_leader_id, 'leader', actor_id)
    on conflict (project_team_id, user_id) do update
    set team_role = 'leader',
        assigned_by = actor_id,
        joined_at = now(),
        left_at = null;
  end if;

  update public.project_teams
  set name = trim(p_name),
      status = p_status,
      stage_instance_id = p_stage_instance_id,
      leader_id = p_leader_id,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_at = now()
  where id = team_row.id;

  perform private.sync_project_team_assignments(team_row.id);
end;
$$;

create or replace function public.remove_project_team_member(
  p_project_team_id uuid,
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  team_row public.project_teams;
  action_row record;
begin
  select * into team_row
  from public.project_teams
  where id = p_project_team_id
  for update;

  if not found then raise exception 'Project team was not found'; end if;
  if not private.has_permission('project_teams.assign')
    or not private.can_access_project(team_row.project_id)
  then raise exception 'The current user cannot assign project teams'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A team member removal reason is required';
  end if;
  if team_row.leader_id = p_user_id then
    raise exception 'Change the team leader before removing this member';
  end if;

  update public.project_team_members
  set left_at = now()
  where project_team_id = team_row.id
    and user_id = p_user_id
    and left_at is null;

  if not found then raise exception 'Active team member was not found'; end if;

  update public.workflow_action_participants participant
  set unassigned_at = now(),
      unassigned_by = actor_id,
      assignment_reason = participant.assignment_reason || ':member_removed'
  from public.workflow_action_instances action_instance
  where participant.workflow_action_instance_id = action_instance.id
    and participant.user_id = p_user_id
    and participant.unassigned_at is null
    and participant.assignment_reason =
      'resolved_from_project_team:' || team_row.id::text
    and action_instance.status in ('awaiting_assignment', 'ready', 'blocked');

  insert into private.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_schema,
    entity_table,
    entity_id,
    new_data
  )
  values (
    team_row.organization_id,
    actor_id,
    'project_team_member_removed',
    'public',
    'project_team_members',
    team_row.id::text || ':' || p_user_id::text,
    jsonb_build_object('reason', trim(p_reason))
  );

  perform private.sync_project_team_assignments(team_row.id);

  for action_row in
    select distinct action_instance.id
    from public.workflow_action_instances action_instance
    join public.workflow_stage_instances stage_instance
      on stage_instance.id = action_instance.workflow_stage_instance_id
    join public.workflow_instances workflow
      on workflow.id = stage_instance.workflow_instance_id
    join public.workflow_action_assignment_rules rule
      on rule.workflow_action_template_id = action_instance.action_template_id
    where rule.selector_type = 'project_team'
      and rule.project_team_code = team_row.code
      and (
        workflow.project_id = team_row.project_id
        or exists (
          select 1 from public.projects child
          where child.id = workflow.project_id
            and child.parent_project_id = team_row.project_id
        )
      )
  loop
    perform private.refresh_team_managed_action_status(action_row.id);
  end loop;
end;
$$;

-- Replace the project starter so team-managed actions never receive the generic
-- primary assignee when the template requires a project team.
create or replace function public.start_project_operational_workflow(
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  template_slug text;
  template_version_id uuid;
  workflow_id uuid;
  responsible_id uuid;
  executor_id uuid;
  follower_id uuid;
  approver_id uuid;
begin
  select * into project_row
  from public.projects
  where id = p_project_id
    and deleted_at is null
    and status in ('active', 'on_hold')
  for update;

  if not found then raise exception 'Project was not found'; end if;
  if not (
    private.has_permission('workflow.start')
    or private.has_permission('system.override')
    or project_row.project_manager_id = actor_id
  ) or not private.can_access_project(project_row.id) then
    raise exception 'The current user cannot start this project workflow';
  end if;

  select id into workflow_id
  from public.workflow_instances
  where project_id = project_row.id
    and estate_asset_id is not distinct from project_row.estate_asset_id
    and status in ('draft', 'active', 'on_hold')
  order by created_at desc
  limit 1;

  if workflow_id is not null then
    return workflow_id;
  end if;

  template_slug := case
    when project_row.project_type in ('litigation', 'estate_litigation') then 'litigation-v2'
    when project_row.project_type = 'estate' then 'estate-v2'
    when project_row.project_type = 'estate_asset' then 'estate-asset-v2'
    else null
  end;
  if template_slug is null then
    raise exception 'No operational workflow is available for this project type';
  end if;

  select version.id into template_version_id
  from public.workflow_template_versions version
  join public.workflow_templates template
    on template.id = version.workflow_template_id
  where template.organization_id = project_row.organization_id
    and template.slug = template_slug
    and version.version_number = 2
    and version.status = 'published';
  if template_version_id is null then
    raise exception 'The source-aligned workflow template is not published';
  end if;

  workflow_id := public.start_workflow_instance(
    project_row.id,
    template_version_id,
    project_row.name,
    project_row.estate_asset_id
  );

  select coalesce(
    (
      select member.user_id from public.project_members member
      where member.project_id = project_row.id
        and member.membership_role = 'department_manager'
        and member.left_at is null
      order by member.joined_at limit 1
    ),
    project_row.project_manager_id,
    actor_id
  ) into responsible_id;

  executor_id := coalesce(
    project_row.primary_assignee_id,
    project_row.project_manager_id,
    actor_id
  );

  select coalesce(
    (
      select member.user_id from public.project_members member
      where member.project_id = project_row.id
        and member.membership_role = 'follower'
        and member.left_at is null
      order by member.joined_at limit 1
    ),
    project_row.project_manager_id,
    actor_id
  ) into follower_id;

  select coalesce(
    (
      select member.user_id from public.project_members member
      where member.project_id = project_row.id
        and member.membership_role in ('approver', 'department_manager')
        and member.left_at is null
      order by
        case when member.membership_role = 'approver' then 1 else 2 end,
        member.joined_at
      limit 1
    ),
    project_row.project_manager_id,
    actor_id
  ) into approver_id;

  insert into public.workflow_action_participants (
    workflow_action_instance_id,
    participant_type,
    user_id,
    assigned_by,
    assignment_reason
  )
  select
    action_instance.id,
    participant.participant_type,
    participant.user_id,
    actor_id,
    'operational_project_default'
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance
    on stage_instance.id = action_instance.workflow_stage_instance_id
  cross join lateral (
    values
      ('responsible', responsible_id),
      ('executor', executor_id),
      ('follower', follower_id),
      ('approver', approver_id)
  ) as participant(participant_type, user_id)
  where stage_instance.workflow_instance_id = workflow_id
    and participant.user_id is not null
    and not exists (
      select 1
      from public.workflow_action_participants existing
      where existing.workflow_action_instance_id = action_instance.id
        and existing.participant_type = participant.participant_type
        and existing.unassigned_at is null
    )
    and not (
      participant.participant_type = 'executor'
      and exists (
        select 1
        from public.workflow_action_assignment_rules rule
        where rule.workflow_action_template_id = action_instance.action_template_id
          and rule.participant_type = 'executor'
          and rule.selector_type = 'project_team'
      )
    )
  on conflict do nothing;

  perform private.sync_workflow_project_team_assignments(workflow_id);

  update public.workflow_action_instances action_instance
  set status = case
        when exists (
          select 1
          from public.workflow_action_assignment_rules rule
          where rule.workflow_action_template_id = action_instance.action_template_id
            and (
              select count(*)
              from public.workflow_action_participants participant
              where participant.workflow_action_instance_id = action_instance.id
                and participant.participant_type = rule.participant_type
                and participant.unassigned_at is null
            ) < rule.minimum_participants
        ) then 'awaiting_assignment'
        when stage_instance.status <> 'active' then 'blocked'
        when exists (
          select 1
          from public.workflow_action_dependencies dependency
          where dependency.action_template_id = action_instance.action_template_id
        ) then 'blocked'
        else 'ready'
      end,
      due_at = case
        when stage_instance.status = 'active'
          and action_instance.planned_duration is not null
          and not exists (
            select 1
            from public.workflow_action_assignment_rules rule
            where rule.workflow_action_template_id = action_instance.action_template_id
              and (
                select count(*)
                from public.workflow_action_participants participant
                where participant.workflow_action_instance_id = action_instance.id
                  and participant.participant_type = rule.participant_type
                  and participant.unassigned_at is null
              ) < rule.minimum_participants
          )
        then now() + action_instance.planned_duration
        else null
      end,
      updated_at = now()
  from public.workflow_stage_instances stage_instance
  where stage_instance.id = action_instance.workflow_stage_instance_id
    and stage_instance.workflow_instance_id = workflow_id;

  perform private.refresh_project_workflow_progress(workflow_id);
  return workflow_id;
end;
$$;

revoke all on function private.refresh_team_managed_action_status(uuid)
from public, anon, authenticated;
revoke all on function private.sync_workflow_project_team_assignments(uuid)
from public, anon, authenticated;
revoke all on function private.sync_project_team_assignments(uuid)
from public, anon, authenticated;

revoke all on function public.create_project_team_v2(
  uuid, text, text, uuid, uuid, timestamptz, timestamptz
) from public, anon;
revoke all on function public.update_project_team(
  uuid, text, text, uuid, uuid, timestamptz, timestamptz
) from public, anon;
revoke all on function public.remove_project_team_member(uuid, uuid, text)
from public, anon;

grant execute on function public.create_project_team_v2(
  uuid, text, text, uuid, uuid, timestamptz, timestamptz
) to authenticated;
grant execute on function public.update_project_team(
  uuid, text, text, uuid, uuid, timestamptz, timestamptz
) to authenticated;
grant execute on function public.remove_project_team_member(uuid, uuid, text)
to authenticated;

-- Safe backfill: only open, not-yet-started actions are moved from the old
-- generic executor to an existing active project team.
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
