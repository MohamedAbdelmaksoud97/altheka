alter table public.pre_contract_cases
  add column if not exists offer_due_at timestamptz,
  add column if not exists client_response_due_at timestamptz,
  add column if not exists contract_due_at timestamptz;

update public.pre_contract_cases
set offer_due_at = coalesce(offer_due_at, assigned_at + interval '3 days')
where assigned_at is not null;

create table public.pre_contract_extension_requests (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  phase text not null check (phase in ('offer','client_response','contract')),
  current_due_at timestamptz not null,
  requested_due_at timestamptz not null,
  reason text not null check (length(trim(reason)) >= 5),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (requested_due_at > current_due_at)
);
alter table public.pre_contract_extension_requests enable row level security;
revoke all on public.pre_contract_extension_requests from anon, authenticated;
grant select on public.pre_contract_extension_requests to authenticated;
create policy pre_contract_extensions_read on public.pre_contract_extension_requests for select to authenticated
using ((select private.is_active_staff()) and (select private.can_manage_pre_contract(service_request_id)));

create or replace function public.request_pre_contract_extension(p_service_request_id uuid, p_phase text, p_requested_due_at timestamptz, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); case_row public.pre_contract_cases; due_value timestamptz; result_id uuid;
begin
  select * into case_row from public.pre_contract_cases where service_request_id=p_service_request_id;
  if actor_id is null or case_row.executor_id is distinct from actor_id then raise exception 'Only the assigned executor can request an extension'; end if;
  if p_phase='offer' then due_value:=case_row.offer_due_at; elsif p_phase='client_response' then due_value:=case_row.client_response_due_at; elsif p_phase='contract' then due_value:=case_row.contract_due_at; else raise exception 'Unsupported phase'; end if;
  if due_value is null or p_requested_due_at<=due_value or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Invalid extension request'; end if;
  insert into public.pre_contract_extension_requests(service_request_id,phase,current_due_at,requested_due_at,reason,requested_by) values(p_service_request_id,p_phase,due_value,p_requested_due_at,trim(p_reason),actor_id) returning id into result_id;
  return result_id;
end; $$;

create or replace function public.review_pre_contract_extension(p_extension_id uuid,p_decision text,p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); item public.pre_contract_extension_requests;
begin
  if actor_id is null or not private.has_any_role(array['super_admin','executive_manager','litigation_manager','estates_manager']) then raise exception 'The current user cannot review extensions'; end if;
  select * into item from public.pre_contract_extension_requests where id=p_extension_id and status='pending' for update;
  if not found or p_decision not in ('approved','rejected') then raise exception 'Extension request is unavailable'; end if;
  update public.pre_contract_extension_requests set status=p_decision,reviewed_by=actor_id,reviewed_at=now(),review_notes=nullif(trim(coalesce(p_notes,'')),'') where id=item.id;
  if p_decision='approved' then
    if item.phase='offer' then update public.pre_contract_cases set offer_due_at=item.requested_due_at where service_request_id=item.service_request_id;
    elsif item.phase='client_response' then update public.pre_contract_cases set client_response_due_at=item.requested_due_at where service_request_id=item.service_request_id;
    else update public.pre_contract_cases set contract_due_at=item.requested_due_at where service_request_id=item.service_request_id; end if;
  end if;
  insert into public.notifications(recipient_id,notification_type,title,body,data) values(item.requested_by,'pre_contract_extension_'||p_decision,case when p_decision='approved' then 'تم اعتماد التمديد' else 'تم رفض التمديد' end,coalesce(nullif(trim(coalesce(p_notes,'')),''),'راجع ملف الطلب.'),jsonb_build_object('service_request_id',item.service_request_id,'category','new_clients'));
  return item.id;
end; $$;

create or replace function public.upsert_legal_consultation_response(p_service_request_id uuid,p_body text,p_document_id uuid default null,p_publish boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); response_id uuid;
begin
  if actor_id is null or not private.is_active_staff() or not private.has_permission('consultations.manage') then raise exception 'The current user cannot manage consultations'; end if;
  if length(trim(coalesce(p_body,'')))<10 and p_document_id is null then raise exception 'Consultation response is required'; end if;
  insert into public.legal_consultation_responses(service_request_id,body,document_id,status,created_by)
  values(p_service_request_id,nullif(trim(coalesce(p_body,'')),''),p_document_id,case when p_publish then 'published' else 'draft' end,actor_id)
  on conflict(service_request_id) do update set body=excluded.body,document_id=excluded.document_id,status=excluded.status,approved_by=case when p_publish then actor_id else legal_consultation_responses.approved_by end,updated_at=now()
  returning id into response_id; return response_id;
end; $$;

alter table public.project_attention_notices drop constraint if exists project_attention_notices_status_check;
alter table public.project_attention_notices drop constraint if exists project_attention_notices_check1;
alter table public.project_attention_notices drop constraint if exists project_attention_notices_check;
update public.project_attention_notices set status='pending' where status='sent';
alter table public.project_attention_notices add constraint project_attention_notices_status_check check(status in ('pending','active','rejected','acknowledged'));
alter table public.project_attention_notices alter column status set default 'pending';
alter table public.project_attention_notices add column if not exists reviewed_by uuid references public.profiles(id) on delete restrict;
alter table public.project_attention_notices add column if not exists reviewed_at timestamptz;
alter table public.project_attention_notices add column if not exists rejection_reason text;

create or replace function public.review_project_attention_notice(p_notice_id uuid,p_decision text,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid()); item public.project_attention_notices;
begin
  if actor_id is null or not private.has_any_role(array['super_admin','executive_manager','litigation_manager','estates_manager']) then raise exception 'The current user cannot review notices'; end if;
  select * into item from public.project_attention_notices where id=p_notice_id and status='pending' for update;
  if not found or p_decision not in ('active','rejected') then raise exception 'Notice is unavailable'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Rejection reason is required'; end if;
  update public.project_attention_notices set status=p_decision,reviewed_by=actor_id,reviewed_at=now(),rejection_reason=case when p_decision='rejected' then trim(p_reason) end,updated_at=now() where id=item.id;
  insert into public.notifications(recipient_id,notification_type,title,body,data) values(item.target_user_id,'project_attention_notice_'||p_decision,case when p_decision='active' then 'لفت نظر قائم' else 'تم رفض لفت النظر' end,coalesce(nullif(trim(coalesce(p_reason,'')),''),item.reason),jsonb_build_object('project_id',item.project_id,'notice_id',item.id,'category','attention'));
  return item.id;
end; $$;

create or replace function public.acknowledge_project_attention_notice(p_notice_id uuid,p_response_text text default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid()); item public.project_attention_notices;
begin
  select * into item from public.project_attention_notices where id=p_notice_id and status='active' for update;
  if not found or item.target_user_id<>actor_id or not private.has_permission('attention_notices.acknowledge') then raise exception 'Only the target assignee can acknowledge an active notice'; end if;
  update public.project_attention_notices set status='acknowledged',acknowledged_at=now(),response_text=nullif(trim(coalesce(p_response_text,'')),''),responded_at=now(),updated_at=now() where id=item.id;
end; $$;

revoke all on function public.request_pre_contract_extension(uuid,text,timestamptz,text) from public,anon;
revoke all on function public.review_pre_contract_extension(uuid,text,text) from public,anon;
revoke all on function public.upsert_legal_consultation_response(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.request_pre_contract_extension(uuid,text,timestamptz,text) to authenticated;
grant execute on function public.review_pre_contract_extension(uuid,text,text) to authenticated;
grant execute on function public.upsert_legal_consultation_response(uuid,text,uuid,boolean) to authenticated;
revoke all on function public.review_project_attention_notice(uuid,text,text) from public,anon;
grant execute on function public.review_project_attention_notice(uuid,text,text) to authenticated;
