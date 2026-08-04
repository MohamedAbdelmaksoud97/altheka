-- Expose a tightly scoped audit log reader for executive managers and super admins.

create or replace function public.get_audit_log_entries(
  p_entity_table text default null,
  p_actor_user_id uuid default null,
  p_action text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 200
)
returns table (
  id bigint,
  organization_id uuid,
  actor_user_id uuid,
  actor_name text,
  action text,
  entity_schema text,
  entity_table text,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  request_id text,
  ip_address text,
  user_agent text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('audit.read') then
    raise exception 'The current user cannot read audit logs';
  end if;

  if not private.has_any_role(array['super_admin', 'executive_manager']) then
    raise exception 'The current user cannot read global audit logs';
  end if;

  return query
  select
    audit.id,
    audit.organization_id,
    audit.actor_user_id,
    coalesce(actor.full_name, 'النظام') as actor_name,
    audit.action,
    audit.entity_schema,
    audit.entity_table,
    audit.entity_id,
    audit.old_data,
    audit.new_data,
    audit.request_id,
    audit.ip_address::text,
    audit.user_agent,
    audit.created_at
  from private.audit_logs audit
  left join public.profiles actor on actor.id = audit.actor_user_id
  where (p_entity_table is null or audit.entity_table = p_entity_table)
    and (p_actor_user_id is null or audit.actor_user_id = p_actor_user_id)
    and (p_action is null or audit.action = p_action)
    and (p_from is null or audit.created_at >= p_from)
    and (p_to is null or audit.created_at <= p_to)
  order by audit.created_at desc, audit.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

revoke all on function public.get_audit_log_entries(
  text, uuid, text, timestamptz, timestamptz, integer
) from public, anon;

grant execute on function public.get_audit_log_entries(
  text, uuid, text, timestamptz, timestamptz, integer
) to authenticated;
