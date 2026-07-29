create or replace function public.get_my_client_project_for_request(
  p_service_request_id uuid
)
returns table (
  id uuid,
  name text,
  status text,
  client_stage_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    project.id,
    project.name,
    project.status,
    project.client_stage_label
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
  where project.service_request_id = p_service_request_id
    and project.deleted_at is null
  order by project.created_at desc
  limit 1;
$$;

revoke all on function public.get_my_client_project_for_request(uuid)
from public, anon;
grant execute on function public.get_my_client_project_for_request(uuid)
to authenticated;
