create or replace function private.is_request_client(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_requests request
    join public.profiles actor_profile on actor_profile.id = (select auth.uid())
    left join public.client_accounts account
      on account.client_id = request.client_id
     and account.profile_id = actor_profile.id
    where request.id = p_request_id
      and request.deleted_at is null
      and actor_profile.account_kind = 'client'
      and actor_profile.is_active
      and actor_profile.deleted_at is null
      and (
        account.profile_id is not null
        or (
          request.data_version = 'legacy'
          and request.created_by = actor_profile.id
        )
      )
  );
$$;

revoke all on function private.is_request_client(uuid) from public, anon;
grant execute on function private.is_request_client(uuid) to authenticated;
