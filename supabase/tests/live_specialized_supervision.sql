begin;

do $$
declare
  project_id_value uuid := '20000000-0000-4000-8000-000000000001';
  action_id_value uuid := '31000000-0000-4000-8000-000000000001';
  commercial_supervisor_id uuid;
  labor_supervisor_id uuid;
  assistant_id uuid;
  notice_id_value uuid;
  submission_id_value uuid;
begin
  select id into strict commercial_supervisor_id
  from auth.users
  where email = 'demo.supervisor-commercial@altheka.example';

  select id into strict labor_supervisor_id
  from auth.users
  where email = 'demo.supervisor-labor@altheka.example';

  select id into strict assistant_id
  from auth.users
  where email = 'demo.legal-specialist@altheka.example';

  if not private.can_supervise_project(
    project_id_value,
    commercial_supervisor_id
  ) then
    raise exception 'Commercial supervisor cannot see the commercial project';
  end if;

  if private.can_supervise_project(project_id_value, labor_supervisor_id) then
    raise exception 'Mismatched labor supervisor can see the commercial project';
  end if;

  if not exists (
    select 1
    from public.project_assignees assignee
    where assignee.project_id = project_id_value
      and assignee.user_id = assistant_id
      and assignee.assignment_kind = 'assistant'
      and assignee.ended_at is null
  ) then
    raise exception 'The demo assistant assignment is missing';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    commercial_supervisor_id::text,
    true
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  notice_id_value := public.issue_project_attention_notice(
    project_id_value,
    assistant_id,
    'اختبار لفت النظر داخل معاملة متراجعة',
    null,
    action_id_value
  );

  perform set_config('request.jwt.claim.sub', assistant_id::text, true);
  perform public.acknowledge_project_attention_notice(
    notice_id_value,
    'تم الاطلاع في الاختبار'
  );

  submission_id_value := public.submit_litigation_action_response_v2(
    action_id_value,
    'نتيجة اختبار المساعد داخل معاملة متراجعة',
    'إجراء تال تجريبي للمساعد',
    'لا تحفظ هذه النتيجة',
    now() + interval '2 days',
    null,
    'high'
  );

  if not exists (
    select 1
    from public.litigation_action_submissions submission
    where submission.id = submission_id_value
      and submission.submitted_by = assistant_id
  ) then
    raise exception 'Assistant submission did not record the actual executor';
  end if;
end;
$$;

rollback;
