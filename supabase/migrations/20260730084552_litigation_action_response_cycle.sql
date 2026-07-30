-- Litigation next-action execution, submission and approval cycle.
-- This migration is additive. Existing case actions remain intact.

insert into public.permissions (code, description)
values
  ('litigation.actions.respond', 'تنفيذ الإجراء الحالي وتقديم نتيجته'),
  ('litigation.actions.approve', 'اعتماد نتيجة الإجراء الحالي'),
  ('litigation.actions.return_for_revision', 'إعادة نتيجة الإجراء الحالي للتعديل')
on conflict (code) do update set description = excluded.description;

with role_permission_map(role_code, permission_code) as (
  values
    ('litigation_manager', 'litigation.actions.respond'),
    ('litigation_manager', 'litigation.actions.approve'),
    ('litigation_manager', 'litigation.actions.return_for_revision'),
    ('litigation_secretary', 'litigation.actions.respond'),
    ('lawyer', 'litigation.actions.respond'),
    ('legal_specialist', 'litigation.actions.respond')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permission_map mapping
join public.roles role on role.code = mapping.role_code
join public.permissions permission on permission.code = mapping.permission_code
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code = 'super_admin'
  and permission.code in (
    'litigation.actions.respond',
    'litigation.actions.approve',
    'litigation.actions.return_for_revision'
  )
on conflict do nothing;

alter table public.litigation_case_actions
  drop constraint if exists litigation_case_actions_status_check;

alter table public.litigation_case_actions
  add constraint litigation_case_actions_status_check
  check (
    status in (
      'planned',
      'in_progress',
      'awaiting_approval',
      'returned_for_revision',
      'completed',
      'cancelled',
      'superseded'
    )
  );

alter table public.litigation_case_actions
  add column started_at timestamptz,
  add column submitted_at timestamptz,
  add column submitted_by uuid references public.profiles(id) on delete restrict,
  add column approved_at timestamptz,
  add column approved_by uuid references public.profiles(id) on delete restrict,
  add column returned_at timestamptz,
  add column returned_by uuid references public.profiles(id) on delete restrict,
  add column return_reason text;

create table public.litigation_action_submissions (
  id uuid primary key default gen_random_uuid(),
  litigation_action_id uuid not null
    references public.litigation_case_actions(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  result_summary text not null check (length(trim(result_summary)) >= 5),
  execution_notes text,
  proposed_next_action_title text not null
    check (length(trim(proposed_next_action_title)) >= 3),
  proposed_next_action_due_at timestamptz,
  proposed_next_action_legal_due_date date,
  proposed_next_action_priority text not null default 'high'
    check (proposed_next_action_priority in ('normal', 'high', 'critical')),
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (litigation_action_id, version_number),
  check (
    proposed_next_action_due_at is not null
    or proposed_next_action_legal_due_date is not null
  )
);

create table public.litigation_action_submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique
    references public.litigation_action_submissions(id) on delete restrict,
  decision text not null check (decision in ('approved', 'returned_for_revision')),
  review_notes text,
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  check (
    decision <> 'returned_for_revision'
    or length(trim(coalesce(review_notes, ''))) >= 3
  )
);

create table public.litigation_action_submission_documents (
  submission_id uuid not null
    references public.litigation_action_submissions(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  linked_by uuid not null references public.profiles(id) on delete restrict,
  linked_at timestamptz not null default now(),
  primary key (submission_id, document_id)
);

drop index if exists public.litigation_case_actions_due_idx;
create index litigation_case_actions_due_idx
  on public.litigation_case_actions (litigation_case_id, due_at)
  where status in (
    'planned',
    'in_progress',
    'awaiting_approval',
    'returned_for_revision'
  );
create index litigation_action_submissions_action_idx
  on public.litigation_action_submissions (litigation_action_id, version_number desc);
create index litigation_action_submission_documents_document_idx
  on public.litigation_action_submission_documents (document_id);

alter table public.litigation_action_submissions enable row level security;
alter table public.litigation_action_submission_reviews enable row level security;
alter table public.litigation_action_submission_documents enable row level security;

revoke all on public.litigation_action_submissions from anon, authenticated;
revoke all on public.litigation_action_submission_reviews from anon, authenticated;
revoke all on public.litigation_action_submission_documents from anon, authenticated;
grant select on public.litigation_action_submissions to authenticated;
grant select on public.litigation_action_submission_reviews to authenticated;
grant select on public.litigation_action_submission_documents to authenticated;

create policy litigation_action_submissions_staff_select
on public.litigation_action_submissions
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.litigation_case_actions action_record
    join public.litigation_cases case_record
      on case_record.id = action_record.litigation_case_id
    where action_record.id = litigation_action_submissions.litigation_action_id
      and (select private.can_access_project(case_record.project_id))
  )
);

create policy litigation_action_reviews_staff_select
on public.litigation_action_submission_reviews
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.litigation_action_submissions submission
    join public.litigation_case_actions action_record
      on action_record.id = submission.litigation_action_id
    join public.litigation_cases case_record
      on case_record.id = action_record.litigation_case_id
    where submission.id = litigation_action_submission_reviews.submission_id
      and (select private.can_access_project(case_record.project_id))
  )
);

create policy litigation_action_documents_staff_select
on public.litigation_action_submission_documents
for select to authenticated
using (
  (select private.is_active_staff())
  and exists (
    select 1
    from public.litigation_action_submissions submission
    join public.litigation_case_actions action_record
      on action_record.id = submission.litigation_action_id
    join public.litigation_cases case_record
      on case_record.id = action_record.litigation_case_id
    where submission.id = litigation_action_submission_documents.submission_id
      and (select private.can_access_project(case_record.project_id))
  )
);

create trigger litigation_action_submissions_append_only
before update or delete on public.litigation_action_submissions
for each row execute function private.prevent_evidence_mutation();

create trigger litigation_action_reviews_append_only
before update or delete on public.litigation_action_submission_reviews
for each row execute function private.prevent_evidence_mutation();

create trigger litigation_action_documents_append_only
before update or delete on public.litigation_action_submission_documents
for each row execute function private.prevent_evidence_mutation();

create trigger audit_litigation_action_submissions
after insert on public.litigation_action_submissions
for each row execute function private.audit_row_change();

create trigger audit_litigation_action_submission_reviews
after insert on public.litigation_action_submission_reviews
for each row execute function private.audit_row_change();

create trigger audit_litigation_action_submission_documents
after insert on public.litigation_action_submission_documents
for each row execute function private.audit_row_change();

create or replace function public.start_litigation_case_action(
  p_action_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  action_row public.litigation_case_actions;
  case_row public.litigation_cases;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;

  select * into action_row
  from public.litigation_case_actions
  where id = p_action_id
  for update;
  if not found then raise exception 'Case action was not found'; end if;

  select * into case_row
  from public.litigation_cases
  where id = action_row.litigation_case_id;

  if not private.is_active_staff()
    or not private.has_permission('litigation.actions.respond')
    or not private.can_access_project(case_row.project_id)
  then raise exception 'The current user cannot execute this case action'; end if;
  if action_row.assigned_to is distinct from actor_id then
    raise exception 'Only the assigned executor can start this case action';
  end if;
  if case_row.current_next_action_id is distinct from action_row.id then
    raise exception 'Only the current next action can use this execution cycle';
  end if;
  if action_row.status not in ('planned', 'returned_for_revision') then
    raise exception 'The case action cannot be started from its current status';
  end if;

  update public.litigation_case_actions
  set
    status = 'in_progress',
    started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = action_row.id;
end;
$$;

create or replace function public.submit_litigation_action_response(
  p_action_id uuid,
  p_result_summary text,
  p_next_action_title text,
  p_execution_notes text default null,
  p_next_action_due_at timestamptz default null,
  p_next_action_legal_due_date date default null,
  p_next_action_priority text default 'high',
  p_document_title text default null,
  p_document_type text default null,
  p_storage_bucket text default null,
  p_storage_path text default null,
  p_file_name text default null,
  p_mime_type text default null,
  p_byte_size bigint default null,
  p_sha256 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  action_row public.litigation_case_actions;
  case_row public.litigation_cases;
  project_row public.projects;
  submission_id_value uuid;
  document_id_value uuid;
  next_version integer;
  has_file boolean := p_storage_path is not null;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;

  select * into action_row
  from public.litigation_case_actions
  where id = p_action_id
  for update;
  if not found then raise exception 'Case action was not found'; end if;

  select * into case_row
  from public.litigation_cases
  where id = action_row.litigation_case_id;
  select * into project_row
  from public.projects
  where id = case_row.project_id and deleted_at is null;

  if not private.is_active_staff()
    or not private.has_permission('litigation.actions.respond')
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot respond to this case action'; end if;
  if action_row.assigned_to is distinct from actor_id then
    raise exception 'Only the assigned executor can submit this case action';
  end if;
  if case_row.current_next_action_id is distinct from action_row.id then
    raise exception 'Only the current next action can be submitted';
  end if;
  if action_row.status not in ('in_progress', 'returned_for_revision') then
    raise exception 'Start the case action before submitting its result';
  end if;
  if length(trim(coalesce(p_result_summary, ''))) < 5 then
    raise exception 'A result summary is required';
  end if;
  if length(trim(coalesce(p_next_action_title, ''))) < 3 then
    raise exception 'A proposed next action is required';
  end if;
  if p_next_action_due_at is null and p_next_action_legal_due_date is null then
    raise exception 'The proposed next action requires a date';
  end if;
  if p_next_action_priority not in ('normal', 'high', 'critical') then
    raise exception 'Unsupported priority';
  end if;

  if has_file then
    if p_storage_bucket is distinct from 'legal-documents'
      or p_file_name is null
      or p_mime_type is null
      or p_byte_size is null
      or p_sha256 is null
    then raise exception 'Document metadata is incomplete'; end if;
    if p_byte_size < 0 or p_byte_size > 26214400 then
      raise exception 'File exceeds the 25MB limit';
    end if;
    if lower(split_part(
      p_file_name,
      '.',
      array_length(string_to_array(p_file_name, '.'), 1)
    )) not in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png')
    then raise exception 'Unsupported file type'; end if;
    if p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid SHA-256'; end if;
  elsif num_nonnulls(
    p_document_title,
    p_document_type,
    p_storage_bucket,
    p_file_name,
    p_mime_type,
    p_byte_size,
    p_sha256
  ) > 0 then
    raise exception 'Document metadata was supplied without a storage path';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.litigation_action_submissions
  where litigation_action_id = action_row.id;

  insert into public.litigation_action_submissions (
    litigation_action_id,
    version_number,
    result_summary,
    execution_notes,
    proposed_next_action_title,
    proposed_next_action_due_at,
    proposed_next_action_legal_due_date,
    proposed_next_action_priority,
    submitted_by
  )
  values (
    action_row.id,
    next_version,
    trim(p_result_summary),
    nullif(trim(p_execution_notes), ''),
    trim(p_next_action_title),
    p_next_action_due_at,
    p_next_action_legal_due_date,
    p_next_action_priority,
    actor_id
  )
  returning id into submission_id_value;

  if has_file then
    insert into public.documents (
      organization_id,
      project_id,
      client_id,
      title,
      document_type,
      visibility,
      client_visibility_status,
      current_version_number,
      created_by
    )
    values (
      project_row.organization_id,
      project_row.id,
      project_row.client_id,
      coalesce(nullif(trim(p_document_title), ''), p_file_name),
      coalesce(nullif(trim(p_document_type), ''), 'litigation_action_result'),
      'internal',
      'draft',
      1,
      actor_id
    )
    returning id into document_id_value;

    insert into public.document_versions (
      document_id,
      version_number,
      storage_bucket,
      storage_path,
      file_name,
      mime_type,
      byte_size,
      sha256,
      uploaded_by
    )
    values (
      document_id_value,
      1,
      p_storage_bucket,
      p_storage_path,
      p_file_name,
      p_mime_type,
      p_byte_size,
      p_sha256,
      actor_id
    );

    insert into public.litigation_action_submission_documents (
      submission_id,
      document_id,
      linked_by
    )
    values (submission_id_value, document_id_value, actor_id);
  end if;

  update public.litigation_case_actions
  set
    status = 'awaiting_approval',
    submitted_at = now(),
    submitted_by = actor_id,
    returned_at = null,
    returned_by = null,
    return_reason = null,
    updated_at = now()
  where id = action_row.id;

  insert into public.notifications (
    recipient_id,
    notification_type,
    title,
    body,
    data
  )
  select distinct recipient_id, 'litigation_action_submitted',
    'إجراء بانتظار الاعتماد',
    action_row.title,
    jsonb_build_object(
      'project_id', project_row.id,
      'litigation_action_id', action_row.id,
      'submission_id', submission_id_value
    )
  from (
    select project_row.project_manager_id as recipient_id
    union
    select user_role.user_id
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    join public.profiles profile on profile.id = user_role.user_id
    where role.code = 'litigation_manager'
      and user_role.revoked_at is null
      and profile.activation_status = 'active_staff'
      and profile.department_id = project_row.department_id
  ) recipients
  where recipient_id is not null and recipient_id <> actor_id;

  return submission_id_value;
end;
$$;

create or replace function public.review_litigation_action_response(
  p_submission_id uuid,
  p_decision text,
  p_review_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  submission_row public.litigation_action_submissions;
  action_row public.litigation_case_actions;
  case_row public.litigation_cases;
  project_row public.projects;
  next_action_id uuid;
  next_assignee_id uuid;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if p_decision not in ('approved', 'returned_for_revision') then
    raise exception 'Unsupported review decision';
  end if;

  select * into submission_row
  from public.litigation_action_submissions
  where id = p_submission_id
  for update;
  if not found then raise exception 'Action submission was not found'; end if;

  select * into action_row
  from public.litigation_case_actions
  where id = submission_row.litigation_action_id
  for update;
  select * into case_row
  from public.litigation_cases
  where id = action_row.litigation_case_id
  for update;
  select * into project_row
  from public.projects
  where id = case_row.project_id and deleted_at is null;

  if not private.is_active_staff()
    or not private.can_access_project(project_row.id)
  then raise exception 'The current user cannot review this case action'; end if;
  if p_decision = 'approved'
    and not private.has_permission('litigation.actions.approve')
  then raise exception 'The current user cannot approve this case action'; end if;
  if p_decision = 'returned_for_revision'
    and not private.has_permission('litigation.actions.return_for_revision')
  then raise exception 'The current user cannot return this case action'; end if;
  if submission_row.submitted_by = actor_id
    and not private.has_permission('system.override')
  then raise exception 'An executor cannot review their own submission'; end if;
  if case_row.current_next_action_id is distinct from action_row.id
    or action_row.status <> 'awaiting_approval'
  then raise exception 'The submitted action is no longer awaiting approval'; end if;
  if exists (
    select 1 from public.litigation_action_submission_reviews review
    where review.submission_id = submission_row.id
  ) then raise exception 'This submission has already been reviewed'; end if;
  if submission_row.version_number <> (
    select max(submission.version_number)
    from public.litigation_action_submissions submission
    where submission.litigation_action_id = action_row.id
  ) then raise exception 'Only the latest submission can be reviewed'; end if;

  if p_decision = 'returned_for_revision' then
    if length(trim(coalesce(p_review_notes, ''))) < 3 then
      raise exception 'Return notes are required';
    end if;

    insert into public.litigation_action_submission_reviews (
      submission_id,
      decision,
      review_notes,
      reviewed_by
    )
    values (
      submission_row.id,
      'returned_for_revision',
      trim(p_review_notes),
      actor_id
    );

    update public.litigation_case_actions
    set
      status = 'returned_for_revision',
      returned_at = now(),
      returned_by = actor_id,
      return_reason = trim(p_review_notes),
      updated_at = now()
    where id = action_row.id;

    insert into public.notifications (
      recipient_id,
      notification_type,
      title,
      body,
      data
    )
    values (
      action_row.assigned_to,
      'litigation_action_returned',
      'أعيد الإجراء للتعديل',
      trim(p_review_notes),
      jsonb_build_object(
        'project_id', project_row.id,
        'litigation_action_id', action_row.id,
        'submission_id', submission_row.id
      )
    );

    return null;
  end if;

  next_assignee_id := coalesce(project_row.primary_assignee_id, action_row.assigned_to);
  if next_assignee_id is null or not exists (
    select 1
    from public.project_members member
    where member.project_id = project_row.id
      and member.user_id = next_assignee_id
      and member.left_at is null
  ) then raise exception 'The next action requires an active project executor'; end if;
  if not private.user_has_permission(next_assignee_id, 'litigation.actions.respond') then
    raise exception 'The next action executor lacks response permission';
  end if;

  insert into public.litigation_action_submission_reviews (
    submission_id,
    decision,
    review_notes,
    reviewed_by
  )
  values (
    submission_row.id,
    'approved',
    nullif(trim(p_review_notes), ''),
    actor_id
  );

  update public.litigation_case_actions
  set
    status = 'completed',
    completed_at = now(),
    approved_at = now(),
    approved_by = actor_id,
    updated_at = now()
  where id = action_row.id;

  insert into public.litigation_case_actions (
    litigation_case_id,
    title,
    action_type,
    due_at,
    legal_due_date,
    status,
    priority,
    assigned_to,
    source_event,
    created_by
  )
  values (
    case_row.id,
    submission_row.proposed_next_action_title,
    'follow_up',
    submission_row.proposed_next_action_due_at,
    submission_row.proposed_next_action_legal_due_date,
    'planned',
    submission_row.proposed_next_action_priority,
    next_assignee_id,
    'approved_action_response',
    actor_id
  )
  returning id into next_action_id;

  update public.litigation_cases
  set
    current_next_action_id = next_action_id,
    status = 'active',
    updated_at = now()
  where id = case_row.id;

  insert into public.notifications (
    recipient_id,
    notification_type,
    title,
    body,
    data
  )
  values (
    next_assignee_id,
    'litigation_action_assigned',
    'إجراء جديد مسند إليك',
    submission_row.proposed_next_action_title,
    jsonb_build_object(
      'project_id', project_row.id,
      'litigation_action_id', next_action_id,
      'previous_action_id', action_row.id
    )
  );

  return next_action_id;
end;
$$;

create or replace function public.set_litigation_next_action(
  p_case_id uuid,
  p_title text,
  p_action_type text,
  p_due_at timestamptz default null,
  p_legal_due_date date default null,
  p_priority text default 'normal',
  p_assigned_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  case_row public.litigation_cases;
  project_row public.projects;
  current_action_row public.litigation_case_actions;
  action_id uuid;
  assigned_user_id uuid;
begin
  select * into case_row
  from public.litigation_cases
  where id = p_case_id
  for update;
  if not found then raise exception 'Litigation case was not found'; end if;

  select * into project_row
  from public.projects
  where id = case_row.project_id and deleted_at is null;

  if not private.is_active_staff()
    or not private.has_permission('litigation.set_next_action')
    or not private.can_access_project(case_row.project_id)
  then raise exception 'The current user cannot set the next action'; end if;
  if length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'The next action title is required';
  end if;
  if p_due_at is null and p_legal_due_date is null then
    raise exception 'The next action requires a date';
  end if;
  if p_priority not in ('normal', 'high', 'critical') then
    raise exception 'Unsupported priority';
  end if;

  if case_row.current_next_action_id is not null then
    select * into current_action_row
    from public.litigation_case_actions
    where id = case_row.current_next_action_id
    for update;

    if current_action_row.status in (
      'in_progress',
      'awaiting_approval',
      'returned_for_revision'
    ) then
      raise exception 'The current action must finish through its response and approval cycle';
    end if;

    update public.litigation_case_actions
    set status = 'superseded', updated_at = now()
    where id = current_action_row.id
      and current_action_row.status = 'planned';
  end if;

  assigned_user_id := coalesce(p_assigned_to, project_row.primary_assignee_id);
  if assigned_user_id is null or not exists (
    select 1 from public.project_members member
    where member.project_id = project_row.id
      and member.user_id = assigned_user_id
      and member.left_at is null
  ) then raise exception 'The next action requires an active project executor'; end if;
  if not private.user_has_permission(assigned_user_id, 'litigation.actions.respond') then
    raise exception 'The selected executor cannot respond to litigation actions';
  end if;

  insert into public.litigation_case_actions (
    litigation_case_id,
    title,
    action_type,
    due_at,
    legal_due_date,
    priority,
    assigned_to,
    created_by
  )
  values (
    case_row.id,
    trim(p_title),
    p_action_type,
    p_due_at,
    p_legal_due_date,
    p_priority,
    assigned_user_id,
    actor_id
  )
  returning id into action_id;

  update public.litigation_cases
  set current_next_action_id = action_id, status = 'active', updated_at = now()
  where id = case_row.id;

  insert into public.notifications (
    recipient_id,
    notification_type,
    title,
    body,
    data
  )
  values (
    assigned_user_id,
    'litigation_action_assigned',
    'إجراء جديد مسند إليك',
    trim(p_title),
    jsonb_build_object(
      'project_id', project_row.id,
      'litigation_action_id', action_id
    )
  );

  return action_id;
end;
$$;

create or replace function public.set_litigation_action_status(
  p_action_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_row public.litigation_case_actions;
  case_row public.litigation_cases;
begin
  select * into action_row
  from public.litigation_case_actions
  where id = p_action_id
  for update;
  if not found then raise exception 'Case action was not found'; end if;

  select * into case_row
  from public.litigation_cases
  where id = action_row.litigation_case_id;

  if not private.is_active_staff()
    or not private.has_permission('litigation.manage_cases')
    or not private.can_access_project(case_row.project_id)
  then raise exception 'The current user cannot update case actions'; end if;
  if p_status not in ('planned', 'in_progress', 'completed', 'cancelled') then
    raise exception 'Unsupported case action status';
  end if;
  if action_row.id = case_row.current_next_action_id then
    raise exception 'The current action must use its execution and approval cycle';
  end if;

  update public.litigation_case_actions
  set
    status = p_status,
    completed_at = case when p_status = 'completed' then now() else null end,
    updated_at = now()
  where id = action_row.id;
end;
$$;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.start_litigation_case_action(uuid)',
    'public.submit_litigation_action_response(uuid, text, text, text, timestamptz, date, text, text, text, text, text, text, text, bigint, text)',
    'public.review_litigation_action_response(uuid, text, text)',
    'public.set_litigation_next_action(uuid, text, text, timestamptz, date, text, uuid)',
    'public.set_litigation_action_status(uuid, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', function_signature);
    execute format('grant execute on function %s to authenticated', function_signature);
  end loop;
end;
$$;

-- Existing active actions without an executor inherit the project's primary assignee.
update public.litigation_case_actions action_record
set assigned_to = project.primary_assignee_id,
    updated_at = now()
from public.litigation_cases case_record
join public.projects project on project.id = case_record.project_id
where action_record.litigation_case_id = case_record.id
  and action_record.assigned_to is null
  and action_record.status in ('planned', 'in_progress')
  and project.primary_assignee_id is not null
  and exists (
    select 1 from public.project_members member
    where member.project_id = project.id
      and member.user_id = project.primary_assignee_id
      and member.left_at is null
  );
