-- Correct the qualified column reference in the already-deployed routing
-- function. Fresh databases receive the corrected definition in the preceding
-- migration, so this compatibility migration is intentionally conditional.

do $migration$
declare
  function_definition text;
  ambiguous_expression constant text := 'coalesce(completed_at, now())';
  qualified_expression constant text :=
    'coalesce(action_instance.completed_at, now())';
begin
  select pg_get_functiondef(
    'private.refresh_project_workflow_progress(uuid)'::regprocedure
  )
  into function_definition;

  if strpos(function_definition, ambiguous_expression) > 0 then
    execute replace(
      function_definition,
      ambiguous_expression,
      qualified_expression
    );
  end if;
end;
$migration$;
