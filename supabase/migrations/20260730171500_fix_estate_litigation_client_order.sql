-- Fix the primary client lookup used while creating estate litigation projects.
do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.create_estate_litigation_subproject(uuid,text,uuid,uuid,uuid)'::regprocedure
  )
  into function_definition;

  if position('order by account.created_at' in function_definition) = 0 then
    raise exception 'Unexpected create_estate_litigation_subproject definition';
  end if;

  function_definition := replace(
    function_definition,
    'order by account.created_at',
    'order by account.is_primary desc, account.linked_at'
  );

  execute function_definition;
end;
$migration$;

-- Remove a harmless unused variable so database lint remains clean.
do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.upsert_estate_party_bank_account(uuid,text,text,uuid)'::regprocedure
  )
  into function_definition;

  function_definition := replace(
    function_definition,
    '  actor_id uuid := (select auth.uid());' || chr(10),
    ''
  );

  execute function_definition;
end;
$migration$;
