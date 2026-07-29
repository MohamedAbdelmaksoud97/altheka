create or replace function private.next_operation_number(
  p_organization_id uuid,
  p_counter_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  counter_value bigint;
  operation_year integer := extract(year from current_date)::integer;
begin
  insert into private.operation_counters (
    organization_id, counter_code, counter_year, current_value
  )
  values (p_organization_id, p_counter_code, operation_year, 1)
  on conflict (organization_id, counter_code, counter_year) do update
  set current_value = private.operation_counters.current_value + 1
  returning current_value into counter_value;

  return upper(p_counter_code) || '-' || operation_year::text || '-' ||
    lpad(counter_value::text, 6, '0');
end;
$$;

revoke all on function private.next_operation_number(uuid, text)
from public, anon, authenticated;
