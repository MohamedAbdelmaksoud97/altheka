-- Store instants as timestamptz while making Saudi Arabia the database session
-- timezone for date-based business rules, reporting, and scheduled jobs.
alter database postgres set timezone to 'Asia/Riyadh';

create or replace function private.add_business_days(
  p_organization_id uuid,
  p_start_at timestamptz,
  p_days integer
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_at timestamptz := p_start_at;
  days_added integer := 0;
  calendar_row public.business_calendars;
  local_date date;
begin
  if p_days < 0 then raise exception 'Business-day count cannot be negative'; end if;
  select * into calendar_row
  from public.business_calendars
  where organization_id = p_organization_id and is_default
  order by created_at
  limit 1;
  if not found then raise exception 'Default business calendar is not configured'; end if;

  while days_added < p_days loop
    result_at := ((result_at at time zone calendar_row.timezone) + interval '1 day')
      at time zone calendar_row.timezone;
    local_date := (result_at at time zone calendar_row.timezone)::date;
    if extract(dow from result_at at time zone calendar_row.timezone)::smallint = any(calendar_row.working_weekdays)
      and not exists (
        select 1
        from public.business_calendar_holidays holiday
        where holiday.business_calendar_id = calendar_row.id
          and holiday.holiday_date = local_date
      )
    then
      days_added := days_added + 1;
    end if;
  end loop;
  return result_at;
end;
$$;

revoke all on function private.add_business_days(uuid, timestamptz, integer)
from public, anon;
grant execute on function private.add_business_days(uuid, timestamptz, integer)
to authenticated;
