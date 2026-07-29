create or replace function private.has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    join public.profiles profile on profile.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.revoked_at is null
      and r.is_active
      and p.code = permission_code
      and profile.activation_status = 'active_staff'
      and profile.is_active
      and profile.deleted_at is null
  );
$$;

revoke all on function private.has_permission(text) from public, anon;
grant execute on function private.has_permission(text) to authenticated;

create or replace function private.guard_published_template_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'Published workflow template versions are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.guard_published_template_child()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  version_id uuid;
  related_id uuid;
  version_status text;
begin
  if tg_table_name = 'workflow_stage_templates' then
    version_id := case
      when tg_op = 'DELETE' then old.workflow_template_version_id
      else new.workflow_template_version_id
    end;
  elsif tg_table_name = 'workflow_action_templates' then
    related_id := case
      when tg_op = 'DELETE' then old.workflow_stage_template_id
      else new.workflow_stage_template_id
    end;
    select workflow_template_version_id into version_id
    from public.workflow_stage_templates
    where id = related_id;
  elsif tg_table_name = 'workflow_action_assignment_rules' then
    related_id := case
      when tg_op = 'DELETE' then old.workflow_action_template_id
      else new.workflow_action_template_id
    end;
    select stage.workflow_template_version_id into version_id
    from public.workflow_action_templates action
    join public.workflow_stage_templates stage on stage.id = action.workflow_stage_template_id
    where action.id = related_id;
  elsif tg_table_name = 'workflow_action_dependencies' then
    related_id := case
      when tg_op = 'DELETE' then old.action_template_id
      else new.action_template_id
    end;
    select stage.workflow_template_version_id into version_id
    from public.workflow_action_templates action
    join public.workflow_stage_templates stage on stage.id = action.workflow_stage_template_id
    where action.id = related_id;
  end if;

  select status into version_status
  from public.workflow_template_versions
  where id = version_id;

  if version_status = 'published' then
    raise exception 'Children of published workflow template versions are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_published_template_version() from public, anon, authenticated;
revoke all on function private.guard_published_template_child() from public, anon, authenticated;

create trigger workflow_template_versions_immutable
before update or delete on public.workflow_template_versions
for each row execute function private.guard_published_template_version();

create trigger workflow_stage_templates_immutable
before insert or update or delete on public.workflow_stage_templates
for each row execute function private.guard_published_template_child();
create trigger workflow_action_templates_immutable
before insert or update or delete on public.workflow_action_templates
for each row execute function private.guard_published_template_child();
create trigger workflow_assignment_rules_immutable
before insert or update or delete on public.workflow_action_assignment_rules
for each row execute function private.guard_published_template_child();
create trigger workflow_dependencies_immutable
before insert or update or delete on public.workflow_action_dependencies
for each row execute function private.guard_published_template_child();

create or replace function public.set_document_client_publication(
  p_document_id uuid,
  p_status text,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_row public.documents;
begin
  if not private.has_permission('documents.publish') then
    raise exception 'The current user cannot publish client documents';
  end if;

  if p_status not in ('awaiting_approval', 'published', 'withdrawn') then
    raise exception 'Unsupported publication status';
  end if;

  if p_visibility not in ('client_visible', 'requires_client_action') then
    raise exception 'Published client documents cannot be internal';
  end if;

  select *
  into document_row
  from public.documents
  where id = p_document_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Document was not found';
  end if;

  if p_status = 'published' and document_row.current_version_number < 1 then
    raise exception 'A document version is required before publication';
  end if;

  update public.documents
  set
    visibility = p_visibility,
    client_visibility_status = p_status,
    published_to_client_at = case
      when p_status = 'published' then now()
      else published_to_client_at
    end,
    published_by = case
      when p_status = 'published' then (select auth.uid())
      else published_by
    end,
    withdrawn_at = case
      when p_status = 'withdrawn' then now()
      when p_status = 'published' then null
      else withdrawn_at
    end,
    withdrawn_by = case
      when p_status = 'withdrawn' then (select auth.uid())
      when p_status = 'published' then null
      else withdrawn_by
    end,
    updated_at = now()
  where id = p_document_id;
end;
$$;

revoke all on function public.set_document_client_publication(uuid, text, text)
from public, anon;
grant execute on function public.set_document_client_publication(uuid, text, text)
to authenticated;

create or replace function public.start_workflow_instance(
  p_project_id uuid,
  p_template_version_id uuid,
  p_name text,
  p_estate_asset_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_instance_id uuid;
  actor_id uuid := (select auth.uid());
  rule_row public.workflow_action_assignment_rules;
  candidate_row record;
  inserted_count integer;
begin
  if not private.is_active_staff() or not private.can_access_project(p_project_id) then
    raise exception 'The current user cannot start this project workflow';
  end if;

  if not exists (
    select 1
    from public.workflow_template_versions version
    join public.workflow_templates template on template.id = version.workflow_template_id
    join public.projects project on project.organization_id = template.organization_id
    where version.id = p_template_version_id
      and version.status = 'published'
      and template.is_active
      and project.id = p_project_id
  ) then
    raise exception 'A published workflow template version is required';
  end if;

  insert into public.workflow_instances (
    project_id,
    estate_asset_id,
    workflow_template_version_id,
    name,
    status,
    started_at,
    created_by
  )
  values (
    p_project_id,
    p_estate_asset_id,
    p_template_version_id,
    nullif(trim(p_name), ''),
    'active',
    now(),
    actor_id
  )
  returning id into new_instance_id;

  insert into public.workflow_stage_instances (
    workflow_instance_id,
    stage_template_id,
    status,
    target_due_at,
    maximum_due_at,
    started_at
  )
  select
    new_instance_id,
    stage.id,
    case when stage.position = 1 then 'active' else 'pending' end,
    case when stage.position = 1 then now() + stage.target_duration else null end,
    case when stage.position = 1 then now() + stage.maximum_duration else null end,
    case when stage.position = 1 then now() else null end
  from public.workflow_stage_templates stage
  where stage.workflow_template_version_id = p_template_version_id;

  insert into public.workflow_action_instances (
    workflow_stage_instance_id,
    action_template_id,
    status,
    planned_duration,
    visibility
  )
  select
    stage_instance.id,
    action.id,
    'awaiting_assignment',
    action.planned_duration,
    action.visibility
  from public.workflow_stage_instances stage_instance
  join public.workflow_stage_templates stage on stage.id = stage_instance.stage_template_id
  join public.workflow_action_templates action on action.workflow_stage_template_id = stage.id
  where stage_instance.workflow_instance_id = new_instance_id;

  for rule_row in
    select rule.*
    from public.workflow_action_assignment_rules rule
    join public.workflow_action_templates action on action.id = rule.workflow_action_template_id
    join public.workflow_stage_templates stage on stage.id = action.workflow_stage_template_id
    where stage.workflow_template_version_id = p_template_version_id
    order by rule.priority
  loop
    inserted_count := 0;

    for candidate_row in
      select profile.id as user_id
      from public.project_members member
      join public.profiles profile on profile.id = member.user_id
      where member.project_id = p_project_id
        and member.left_at is null
        and profile.activation_status = 'active_staff'
        and profile.is_active
        and profile.deleted_at is null
        and (rule_row.allow_self_assignment or profile.id <> actor_id)
        and (
          cardinality(rule_row.allowed_role_ids) = 0
          or exists (
            select 1
            from public.user_roles allowed_user_role
            where allowed_user_role.user_id = profile.id
              and allowed_user_role.role_id = any(rule_row.allowed_role_ids)
              and allowed_user_role.revoked_at is null
          )
        )
        and (
          (
            rule_row.selector_type = 'role'
            and exists (
              select 1
              from public.user_roles selected_user_role
              where selected_user_role.user_id = profile.id
                and selected_user_role.role_id = rule_row.role_id
                and selected_user_role.revoked_at is null
            )
          )
          or (
            rule_row.selector_type = 'job_title'
            and profile.job_title_id = rule_row.job_title_id
          )
          or (
            rule_row.selector_type = 'project_membership'
            and member.membership_role = rule_row.project_membership_role
          )
        )
      order by member.joined_at, profile.id
      limit rule_row.maximum_participants
    loop
      insert into public.workflow_action_participants (
        workflow_action_instance_id,
        participant_type,
        user_id,
        assigned_by,
        assignment_reason
      )
      select
        action_instance.id,
        rule_row.participant_type,
        candidate_row.user_id,
        actor_id,
        'resolved_from_template_rule'
      from public.workflow_action_instances action_instance
      where action_instance.action_template_id = rule_row.workflow_action_template_id
        and action_instance.workflow_stage_instance_id in (
          select id
          from public.workflow_stage_instances
          where workflow_instance_id = new_instance_id
        )
      on conflict do nothing;

      inserted_count := inserted_count + 1;
    end loop;
  end loop;

  update public.workflow_action_instances action_instance
  set
    status = case
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
      when exists (
        select 1
        from public.workflow_action_dependencies dependency
        where dependency.action_template_id = action_instance.action_template_id
      ) then 'blocked'
      when exists (
        select 1
        from public.workflow_stage_instances stage_instance
        join public.workflow_stage_templates stage on stage.id = stage_instance.stage_template_id
        where stage_instance.id = action_instance.workflow_stage_instance_id
          and stage.position > 1
      ) then 'blocked'
      else 'ready'
    end,
    due_at = null,
    updated_at = now()
  where action_instance.workflow_stage_instance_id in (
    select id
    from public.workflow_stage_instances
    where workflow_instance_id = new_instance_id
  );

  update public.workflow_action_instances action_instance
  set due_at = now() + action_instance.planned_duration
  from public.workflow_action_templates action_template
  where action_template.id = action_instance.action_template_id
    and action_instance.status = 'ready'
    and action_template.duration_start_rule in ('when_ready', 'when_assigned')
    and action_instance.workflow_stage_instance_id in (
      select id
      from public.workflow_stage_instances
      where workflow_instance_id = new_instance_id
    );

  return new_instance_id;
end;
$$;

revoke all on function public.start_workflow_instance(uuid, uuid, text, uuid)
from public, anon;
grant execute on function public.start_workflow_instance(uuid, uuid, text, uuid)
to authenticated;

create trigger audit_workflow_instances after insert or update on public.workflow_instances
for each row execute function private.audit_row_change();
create trigger audit_workflow_stage_instances after insert or update on public.workflow_stage_instances
for each row execute function private.audit_row_change();
create trigger audit_workflow_action_instances after insert or update on public.workflow_action_instances
for each row execute function private.audit_row_change();
