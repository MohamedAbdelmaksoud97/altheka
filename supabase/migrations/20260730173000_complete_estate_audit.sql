-- Keep every sensitive estate operation in the append-only audit log.
do $migration$
declare
  table_name text;
begin
  foreach table_name in array array[
    'estate_parties',
    'estate_party_bank_accounts',
    'estate_party_shares',
    'estate_party_decisions',
    'project_teams',
    'project_team_members',
    'recurring_report_schedules',
    'project_reports',
    'project_report_versions'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'audit_' || table_name,
      table_name
    );
    execute format(
      'create trigger %I after insert or update on public.%I '
      || 'for each row execute function private.audit_row_change()',
      'audit_' || table_name,
      table_name
    );
  end loop;
end;
$migration$;
