create or replace function public.update_litigation_project_category(
  p_project_id uuid,
  p_category_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  project_row public.projects;
  old_category_id uuid;
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A documented category change reason is required';
  end if;

  select * into project_row
  from public.projects
  where id = p_project_id
    and project_type in ('litigation', 'estate_litigation')
    and deleted_at is null
  for update;
  if not found then raise exception 'Litigation project was not found'; end if;

  if not (
    private.has_permission('litigation.manage_cases')
    or private.has_permission('system.override')
  ) or not private.can_access_project(project_row.id) then
    raise exception 'Only litigation management can classify this project';
  end if;

  if not exists (
    select 1
    from public.litigation_case_categories category
    where category.id = p_category_id
      and category.organization_id = project_row.organization_id
      and category.is_active
  ) then raise exception 'Selected case category is not active'; end if;

  old_category_id := project_row.litigation_case_category_id;

  update public.projects
  set litigation_case_category_id = p_category_id,
      needs_category_review = false,
      updated_at = now()
  where id = project_row.id;

  if project_row.service_request_id is not null then
    update public.service_requests
    set litigation_case_category_id = p_category_id,
        needs_category_review = false,
        updated_at = now()
    where id = project_row.service_request_id;
  end if;

  if old_category_id is distinct from p_category_id then
    insert into public.notifications (
      recipient_id, notification_type, title, body, data
    )
    select specialty.supervisor_id,
      'specialized_case_available',
      'أضيفت قضية إلى نطاق إشرافك',
      project_row.name,
      jsonb_build_object(
        'project_id', project_row.id,
        'category_id', p_category_id,
        'reclassified', true
      )
    from public.litigation_supervisor_specialties specialty
    join public.profiles profile on profile.id = specialty.supervisor_id
    where specialty.category_id = p_category_id
      and specialty.revoked_at is null
      and profile.activation_status = 'active_staff'
      and profile.is_active
      and profile.deleted_at is null
      and specialty.supervisor_id <> actor_id;
  end if;

  insert into private.audit_logs (
    organization_id, actor_user_id, action,
    entity_schema, entity_table, entity_id,
    old_data, new_data
  )
  values (
    project_row.organization_id, actor_id,
    'litigation_project_category_updated',
    'public', 'projects', project_row.id::text,
    jsonb_build_object('category_id', old_category_id),
    jsonb_build_object(
      'category_id', p_category_id,
      'reason', trim(p_reason)
    )
  );
end;
$$;

revoke all on function public.update_litigation_project_category(
  uuid, uuid, text
) from public, anon;
grant execute on function public.update_litigation_project_category(
  uuid, uuid, text
) to authenticated;
