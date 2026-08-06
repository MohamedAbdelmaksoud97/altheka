-- Complete the client-requested workflow controls and scheduled supervision.

create extension if not exists pg_cron with schema pg_catalog;

insert into public.permissions(code, description)
values ('attention_notices.review', 'Review and decide automatic attention notices')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'attention_notices.review'
where role.code in ('litigation_manager', 'estates_manager')
on conflict do nothing;

alter table public.workflow_action_instances
  add column if not exists requires_attachment boolean not null default false,
  add column if not exists requires_manager_approval boolean not null default false;

alter table public.project_team_members
  add column if not exists work_type text
  check (work_type is null or work_type in ('inventory', 'study', 'pleading', 'follow_up', 'drafting', 'other'));

-- Requirements extracted from public/خارطة_السير_لادارة_التقاضي_اخر_تعديل_1_1.docx.
update public.workflow_action_instances action_instance
set
  requires_attachment = action.code in (
    'prepare_congratulations_package', 'prepare_timeline', 'detailed_case_study',
    'file_claim', 'prepare_hearing_form', 'prepare_briefs', 'send_hearing_report',
    'review_minutes_correct', 'archive_minutes_next_date', 'prepare_evidence_witnesses',
    'archive_judgment_documents', 'draft_appeal', 'review_file_appeal',
    'prepare_appeal_hearing', 'cassation_or_review', 'respond_to_opponent',
    'verify_executory_wording', 'submit_enforcement', 'prepare_final_invoice',
    'comprehensive_report', 'closing_letter_release_invoice'
  ),
  requires_manager_approval = action.code in (
    'prepare_congratulations_package', 'prepare_timeline', 'detailed_case_study',
    'file_claim', 'prepare_hearing_form', 'prepare_briefs', 'send_hearing_report',
    'review_minutes_correct', 'prepare_evidence_witnesses', 'archive_judgment_documents',
    'draft_appeal', 'review_file_appeal', 'prepare_appeal_hearing',
    'cassation_or_review', 'respond_to_opponent', 'prepare_final_invoice',
    'comprehensive_report', 'closing_letter_release_invoice'
  )
from public.workflow_action_templates action
join public.workflow_stage_templates stage on stage.id = action.workflow_stage_template_id
join public.workflow_template_versions version on version.id = stage.workflow_template_version_id
join public.workflow_templates template on template.id = version.workflow_template_id
where action_instance.action_template_id = action.id
  and template.slug = 'litigation-v2'
  and version.status = 'published';

create or replace function private.initialize_workflow_action_requirements()
returns trigger language plpgsql security definer set search_path='' as $$
declare action_code text;
begin
  select code into action_code from public.workflow_action_templates where id = new.action_template_id;
  new.requires_attachment := action_code in (
    'prepare_congratulations_package','prepare_timeline','detailed_case_study','file_claim',
    'prepare_hearing_form','prepare_briefs','send_hearing_report','review_minutes_correct',
    'archive_minutes_next_date','prepare_evidence_witnesses','archive_judgment_documents',
    'draft_appeal','review_file_appeal','prepare_appeal_hearing','cassation_or_review',
    'respond_to_opponent','verify_executory_wording','submit_enforcement','prepare_final_invoice',
    'comprehensive_report','closing_letter_release_invoice'
  );
  new.requires_manager_approval := action_code in (
    'prepare_congratulations_package','prepare_timeline','detailed_case_study','file_claim',
    'prepare_hearing_form','prepare_briefs','send_hearing_report','review_minutes_correct',
    'prepare_evidence_witnesses','archive_judgment_documents','draft_appeal','review_file_appeal',
    'prepare_appeal_hearing','cassation_or_review','respond_to_opponent','prepare_final_invoice',
    'comprehensive_report','closing_letter_release_invoice'
  );
  return new;
end $$;

drop trigger if exists initialize_workflow_action_requirements on public.workflow_action_instances;
create trigger initialize_workflow_action_requirements
before insert on public.workflow_action_instances
for each row execute function private.initialize_workflow_action_requirements();

create or replace function private.workflow_action_due_at(
  p_action_instance_id uuid,
  p_started_at timestamptz
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  organization_id_value uuid;
  duration_value interval;
  basis_value text;
  day_count integer;
begin
  select project.organization_id, action_instance.planned_duration, action_template.duration_basis
  into organization_id_value, duration_value, basis_value
  from public.workflow_action_instances action_instance
  join public.workflow_action_templates action_template on action_template.id = action_instance.action_template_id
  join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow on workflow.id = stage_instance.workflow_instance_id
  join public.projects project on project.id = workflow.project_id
  where action_instance.id = p_action_instance_id;

  if duration_value is null then return null; end if;
  if basis_value = 'business_days' then
    day_count := greatest(0, ceil(extract(epoch from duration_value) / 86400.0)::integer);
    return private.add_business_days(organization_id_value, p_started_at, day_count);
  end if;
  return p_started_at + duration_value;
end;
$$;

revoke all on function private.workflow_action_due_at(uuid,timestamptz) from public,anon,authenticated;

create or replace function private.enforce_workflow_action_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  is_executor boolean;
  is_approver boolean;
begin
  if new.status = 'ready' and new.started_at is null then
    new.due_at := null;
  end if;

  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    select exists(select 1 from public.workflow_action_participants participant
      where participant.workflow_action_instance_id = new.id
        and participant.user_id = actor_id and participant.unassigned_at is null
        and participant.participant_type in ('executor','responsible')) into is_executor;
    if actor_id is not null and not is_executor and not private.has_permission('system.override') then
      raise exception 'Only the assigned executor can start this workflow step';
    end if;
    new.started_at := coalesce(new.started_at, now());
    new.due_at := private.workflow_action_due_at(new.id, new.started_at);
  end if;

  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    select exists(select 1 from public.workflow_action_participants participant
      where participant.workflow_action_instance_id = new.id
        and participant.user_id = actor_id and participant.unassigned_at is null
        and participant.participant_type in ('executor','responsible')) into is_executor;
    if actor_id is not null and not is_executor and not private.has_permission('system.override') then
      raise exception 'Only the assigned executor can submit this workflow step';
    end if;
    if new.requires_attachment and not exists(
      select 1 from public.documents document
      where document.workflow_action_instance_id = new.id
        and document.deleted_at is null and document.archived_at is null
    ) then raise exception 'This workflow step requires an attachment before submission'; end if;
  end if;

  if new.status in ('approved','returned_for_revision') and old.status is distinct from new.status then
    select exists(select 1 from public.workflow_action_participants participant
      where participant.workflow_action_instance_id = new.id
        and participant.user_id = actor_id and participant.unassigned_at is null
        and participant.participant_type = 'approver') into is_approver;
    if actor_id is not null and (not is_approver or not private.has_any_role(array['litigation_manager','estates_manager'])) and not private.has_permission('system.override') then
      raise exception 'Only the assigned department approver can review this workflow step';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_workflow_action_controls on public.workflow_action_instances;
create trigger enforce_workflow_action_controls
before update on public.workflow_action_instances
for each row execute function private.enforce_workflow_action_controls();

create or replace function public.link_document_to_workflow_action(
  p_document_id uuid,
  p_workflow_action_instance_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  document_project_id uuid;
  action_project_id uuid;
begin
  if actor_id is null or not private.has_permission('documents.upload') then
    raise exception 'The current user cannot link workflow documents';
  end if;
  select project_id into document_project_id from public.documents
  where id = p_document_id and deleted_at is null;
  select workflow.project_id into action_project_id
  from public.workflow_action_instances action_instance
  join public.workflow_stage_instances stage_instance on stage_instance.id = action_instance.workflow_stage_instance_id
  join public.workflow_instances workflow on workflow.id = stage_instance.workflow_instance_id
  where action_instance.id = p_workflow_action_instance_id;
  if document_project_id is null or document_project_id is distinct from action_project_id
    or not private.can_access_project(action_project_id)
  then raise exception 'Document and workflow step must belong to the same accessible project'; end if;
  update public.documents set workflow_action_instance_id = p_workflow_action_instance_id, updated_at = now()
  where id = p_document_id;
end;
$$;
revoke all on function public.link_document_to_workflow_action(uuid,uuid) from public,anon;
grant execute on function public.link_document_to_workflow_action(uuid,uuid) to authenticated;

create or replace function public.set_project_team_member_work_type(
  p_project_team_id uuid,
  p_user_id uuid,
  p_work_type text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare team_row public.project_teams;
begin
  select * into team_row from public.project_teams where id = p_project_team_id;
  if not found or not private.has_permission('project_teams.assign')
    or not private.can_access_project(team_row.project_id)
  then raise exception 'The current user cannot update this team member'; end if;
  if p_work_type is not null and p_work_type not in ('inventory','study','pleading','follow_up','drafting','other') then
    raise exception 'Unsupported work type';
  end if;
  update public.project_team_members set work_type = p_work_type
  where project_team_id = p_project_team_id and user_id = p_user_id and left_at is null;
  if not found then raise exception 'Active team member was not found'; end if;
end;
$$;
revoke all on function public.set_project_team_member_work_type(uuid,uuid,text) from public,anon;
grant execute on function public.set_project_team_member_work_type(uuid,uuid,text) to authenticated;

-- Attention decisions are deliberately restricted to department managers.
create or replace function public.review_project_task_step_attention_notice(
  p_notice_id uuid,p_decision text,p_reason text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid()); item public.project_task_step_attention_notices;
begin
  if actor_id is null or not private.has_permission('attention_notices.review') then raise exception 'Only a department manager can review notices'; end if;
  select * into item from public.project_task_step_attention_notices where id=p_notice_id and status='pending' for update;
  if not found or p_decision not in('active','rejected') then raise exception 'Notice is unavailable'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Rejection reason is required'; end if;
  update public.project_task_step_attention_notices set status=p_decision,reviewed_by=actor_id,reviewed_at=now(),rejection_reason=case when p_decision='rejected' then trim(p_reason) end,updated_at=now() where id=item.id;
  insert into public.notifications(recipient_id,notification_type,title,body,data) values(item.target_user_id,'project_task_attention_'||p_decision,case when p_decision='active' then 'لفت نظر قائم' else 'تم رفض لفت النظر' end,coalesce(nullif(trim(coalesce(p_reason,'')),''),item.reason),jsonb_build_object('task_step_id',item.task_step_id,'notice_id',item.id,'category','attention'));
  return item.id;
end $$;

create or replace function public.review_pre_contract_attention_notice(
  p_notice_id uuid,p_decision text,p_reason text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid()); item public.pre_contract_attention_notices;
begin
  if actor_id is null or not private.has_permission('attention_notices.review') then raise exception 'Only a department manager can review notices'; end if;
  select * into item from public.pre_contract_attention_notices where id=p_notice_id and status='pending' for update;
  if not found or p_decision not in('active','rejected') then raise exception 'Notice is unavailable'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Rejection reason is required'; end if;
  update public.pre_contract_attention_notices set status=p_decision,reviewed_by=actor_id,reviewed_at=now(),rejection_reason=case when p_decision='rejected' then trim(p_reason) end,updated_at=now() where id=item.id;
  insert into public.notifications(recipient_id,notification_type,title,body,data) values(item.target_user_id,'pre_contract_attention_'||p_decision,case when p_decision='active' then 'لفت نظر قائم' else 'تم رفض لفت النظر' end,coalesce(nullif(trim(coalesce(p_reason,'')),''),item.reason),jsonb_build_object('service_request_id',item.service_request_id,'notice_id',item.id,'category','attention'));
  return item.id;
end $$;

revoke all on function public.review_project_task_step_attention_notice(uuid,text,text) from public,anon;
revoke all on function public.review_pre_contract_attention_notice(uuid,text,text) from public,anon;
grant execute on function public.review_project_task_step_attention_notice(uuid,text,text) to authenticated;
grant execute on function public.review_pre_contract_attention_notice(uuid,text,text) to authenticated;

do $$
declare existing_job bigint;
begin
  for existing_job in select jobid from cron.job where jobname in (
    'generate-project-task-attention-notices','generate-pre-contract-attention-notices'
  ) loop
    perform cron.unschedule(existing_job);
  end loop;
  perform cron.schedule('generate-project-task-attention-notices','*/5 * * * *','select public.generate_project_task_step_attention_notices()');
  perform cron.schedule('generate-pre-contract-attention-notices','*/5 * * * *','select public.generate_pre_contract_attention_notices()');
end $$;
