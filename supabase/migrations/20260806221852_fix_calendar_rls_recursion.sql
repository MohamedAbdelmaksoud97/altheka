-- Both calendar policies used to select from each other, which caused
-- "infinite recursion detected in policy" for authenticated calendar reads.
-- Keep the lookup private and bind it to auth.uid() so callers cannot inspect
-- another user's appointment access.
create or replace function private.can_read_appointment(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.appointments appointment
      where appointment.id = p_appointment_id
        and (
          (
            private.is_active_staff()
            and (
              (
                appointment.project_id is not null
                and private.can_access_project(appointment.project_id)
              )
              or (
                appointment.service_request_id is not null
                and private.can_manage_pre_contract(appointment.service_request_id)
              )
              or (
                appointment.client_id is not null
                and private.has_permission('clients.read')
              )
            )
          )
          or exists (
            select 1
            from public.appointment_participants participant
            where participant.appointment_id = appointment.id
              and participant.participant_user_id = (select auth.uid())
          )
        )
    );
$$;

revoke all on function private.can_read_appointment(uuid)
from public, anon;
grant execute on function private.can_read_appointment(uuid)
to authenticated;

drop policy if exists appointments_access_select on public.appointments;
create policy appointments_access_select on public.appointments
for select to authenticated
using ((select private.can_read_appointment(id)));

drop policy if exists appointment_participants_access_select
on public.appointment_participants;
create policy appointment_participants_access_select
on public.appointment_participants
for select to authenticated
using ((select private.can_read_appointment(appointment_id)));
