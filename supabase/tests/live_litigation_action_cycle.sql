begin;

do $$
declare
  project_id_value uuid := '20000000-0000-4000-8000-000000000001';
  case_id_value uuid := '30000000-0000-4000-8000-000000000001';
  action_id_value uuid := '31000000-0000-4000-8000-000000000001';
  lawyer_id uuid;
  manager_id uuid;
  first_submission_id uuid;
  second_submission_id uuid;
  next_action_id uuid;
begin
  select profile.id into strict lawyer_id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where auth_user.email = 'demo.lawyer@altheka.example';

  select profile.id into strict manager_id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where auth_user.email = 'demo.litigation-manager@altheka.example';

  insert into public.project_members (
    project_id,
    user_id,
    membership_role,
    can_contact_client,
    assigned_by,
    left_at
  )
  values (
    project_id_value,
    lawyer_id,
    'primary_assignee',
    true,
    manager_id,
    null
  )
  on conflict (project_id, user_id) do update
  set membership_role = excluded.membership_role,
      can_contact_client = excluded.can_contact_client,
      left_at = null;

  update public.projects
  set primary_assignee_id = lawyer_id
  where id = project_id_value;

  update public.litigation_cases
  set current_next_action_id = action_id_value
  where id = case_id_value;

  update public.litigation_case_actions
  set status = 'planned',
      assigned_to = lawyer_id,
      started_at = null,
      submitted_at = null,
      submitted_by = null,
      approved_at = null,
      approved_by = null,
      returned_at = null,
      returned_by = null,
      return_reason = null,
      completed_at = null
  where id = action_id_value;

  perform set_config('request.jwt.claim.sub', lawyer_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.start_litigation_case_action(action_id_value);

  first_submission_id := public.submit_litigation_action_response(
    action_id_value,
    'تم إعداد النتيجة القانونية ومراجعة المستندات.',
    'مخاطبة الجهة المختصة بالرد',
    'الإصدار الأول للاختبار',
    now() + interval '2 days',
    null,
    'high'
  );

  if not exists (
    select 1
    from public.litigation_case_actions action_record
    where action_record.id = action_id_value
      and action_record.status = 'awaiting_approval'
  ) then
    raise exception 'The action was not submitted for approval';
  end if;

  begin
    perform public.review_litigation_action_response(
      first_submission_id,
      'approved',
      null
    );
    raise exception 'assertion_failed_executor_self_approval';
  exception
    when others then
      if sqlerrm = 'assertion_failed_executor_self_approval' then
        raise;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', manager_id::text, true);
  perform public.review_litigation_action_response(
    first_submission_id,
    'returned_for_revision',
    'استكمل سند النتيجة وأرفق النسخة النهائية.'
  );

  perform set_config('request.jwt.claim.sub', lawyer_id::text, true);
  perform public.start_litigation_case_action(action_id_value);

  second_submission_id := public.submit_litigation_action_response(
    action_id_value,
    'تم استكمال السند وإعداد النسخة النهائية للمراجعة.',
    'إرسال الخطاب المعتمد إلى الجهة المختصة',
    'الإصدار الثاني بعد ملاحظات المدير',
    now() + interval '3 days',
    null,
    'critical',
    'مذكرة النتيجة النهائية',
    'litigation_action_result',
    'legal-documents',
    lawyer_id::text || '/tests/litigation-action-result.pdf',
    'litigation-action-result.pdf',
    'application/pdf',
    128,
    repeat('a', 64)
  );

  if not exists (
    select 1
    from public.litigation_action_submission_documents link
    where link.submission_id = second_submission_id
  ) then
    raise exception 'The action attachment was not linked';
  end if;

  perform set_config('request.jwt.claim.sub', manager_id::text, true);
  next_action_id := public.review_litigation_action_response(
    second_submission_id,
    'approved',
    'النتيجة مستوفية ومعتمدة.'
  );

  if not exists (
    select 1
    from public.litigation_case_actions action_record
    where action_record.id = action_id_value
      and action_record.status = 'completed'
      and action_record.approved_by = manager_id
  ) then
    raise exception 'The approved action was not completed';
  end if;

  if not exists (
    select 1
    from public.litigation_cases case_record
    join public.litigation_case_actions action_record
      on action_record.id = case_record.current_next_action_id
    where case_record.id = case_id_value
      and action_record.id = next_action_id
      and action_record.status = 'planned'
      and action_record.assigned_to = lawyer_id
      and (
        action_record.due_at is not null
        or action_record.legal_due_date is not null
      )
  ) then
    raise exception 'The approved response did not create a dated next action';
  end if;
end;
$$;

rollback;
