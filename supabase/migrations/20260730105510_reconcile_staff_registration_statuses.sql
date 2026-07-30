-- Historical demo and test accounts were approved directly by idempotent seed
-- scripts, leaving their registration request rows pending. Align those rows
-- and reject only accounts that are genuinely waiting for approval.

update public.staff_registration_requests request
set
  status = 'approved',
  reviewed_at = coalesce(request.reviewed_at, profile.approved_at, profile.updated_at),
  reviewed_by = coalesce(request.reviewed_by, profile.approved_by),
  review_notes = coalesce(
    request.review_notes,
    'تمت مواءمة الطلب مع حالة الحساب المعتمدة سابقًا'
  ),
  updated_at = now()
from public.profiles profile
where profile.id = request.profile_id
  and request.status = 'pending'
  and profile.approved_at is not null
  and profile.activation_status in ('active_staff', 'disabled');

create or replace function public.reject_staff_registration(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_row public.staff_registration_requests;
begin
  if actor_id is null or not private.has_permission('staff.approve') then
    raise exception 'The current user cannot reject staff registrations';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A rejection reason is required';
  end if;

  select * into request_row
  from public.staff_registration_requests
  where id = p_request_id and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending registration request was not found';
  end if;

  perform 1
  from public.profiles profile
  where profile.id = request_row.profile_id
    and profile.account_kind = 'staff'
    and profile.activation_status = 'pending_staff_approval'
  for update;
  if not found then
    raise exception 'The staff account is no longer pending approval';
  end if;

  update public.staff_registration_requests
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = actor_id,
    review_notes = trim(p_reason),
    updated_at = now()
  where id = request_row.id;

  update public.profiles
  set
    activation_status = 'rejected_staff',
    is_active = false,
    status_reason = trim(p_reason),
    status_changed_at = now(),
    status_changed_by = actor_id,
    updated_at = now()
  where id = request_row.profile_id;
end;
$$;

revoke all on function public.reject_staff_registration(uuid, text)
from public, anon;
grant execute on function public.reject_staff_registration(uuid, text)
to authenticated;
