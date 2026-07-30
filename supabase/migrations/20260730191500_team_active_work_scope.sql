-- Team synchronization may add or remove executors only while work is pending
-- or actively being prepared. Submitted and approved results remain untouched.
do $patch$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'private.sync_workflow_project_team_assignments(uuid)'::regprocedure
  )
  into function_definition;

  if position(
    'and action_instance.status not in (''approved'', ''completed'', ''cancelled'')'
    in function_definition
  ) = 0 then
    raise exception 'Unexpected workflow team action scope definition';
  end if;

  execute replace(
    function_definition,
    'and action_instance.status not in (''approved'', ''completed'', ''cancelled'')',
    'and action_instance.status in ('
    || '''awaiting_assignment'', ''ready'', ''blocked'', '
    || '''in_progress'', ''returned_for_revision'')'
  );
end;
$patch$;

do $patch$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'private.remove_ineligible_project_team_assignments(uuid)'::regprocedure
  )
  into function_definition;

  if position(
    'and action_instance.status in (''awaiting_assignment'', ''ready'', ''blocked'')'
    in function_definition
  ) = 0 then
    raise exception 'Unexpected ineligible team assignment scope definition';
  end if;

  execute replace(
    function_definition,
    'and action_instance.status in (''awaiting_assignment'', ''ready'', ''blocked'')',
    'and action_instance.status in ('
    || '''awaiting_assignment'', ''ready'', ''blocked'', '
    || '''in_progress'', ''returned_for_revision'')'
  );
end;
$patch$;

do $backfill$
declare
  team_row record;
begin
  for team_row in select id from public.project_teams
  loop
    perform private.sync_project_team_assignments(team_row.id);
  end loop;
end;
$backfill$;
