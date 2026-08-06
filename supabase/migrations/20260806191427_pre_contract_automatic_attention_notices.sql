create table public.pre_contract_attention_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  phase text not null check(phase in ('offer','client_response','contract')),
  target_user_id uuid not null references public.profiles(id) on delete restrict,
  due_at timestamptz not null,
  reason text not null,
  status text not null default 'pending' check(status in ('pending','active','rejected','acknowledged')),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  rejection_reason text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_request_id,phase,due_at)
);
alter table public.pre_contract_attention_notices enable row level security;
revoke all on public.pre_contract_attention_notices from anon,authenticated;
grant select on public.pre_contract_attention_notices to authenticated;
create policy pre_contract_attention_read on public.pre_contract_attention_notices for select to authenticated
using ((select private.is_active_staff()) and ((select private.can_manage_pre_contract(service_request_id)) or target_user_id=(select auth.uid())));

create or replace function public.generate_pre_contract_attention_notices()
returns integer language plpgsql security definer set search_path='' as $$
declare inserted_count integer;
begin
  insert into public.pre_contract_attention_notices(organization_id,service_request_id,phase,target_user_id,due_at,reason)
  select request.organization_id,request.id,phase_data.phase,case_record.executor_id,phase_data.due_at,
    'تجاوزت المدة المحددة في مرحلة '||case phase_data.phase when 'offer' then 'إعداد العرض الفني والمالي' when 'client_response' then 'انتظار رد العميل' else 'إعداد العقد' end||' دون تمديد معتمد.'
  from public.service_requests request
  join public.pre_contract_cases case_record on case_record.service_request_id=request.id
  cross join lateral (
    select 'offer'::text,case_record.offer_due_at where request.status in ('assigned','study_returned','study_pending_approval','study_approved')
    union all select 'client_response',case_record.client_response_due_at where request.status='proposal_sent'
    union all select 'contract',case_record.contract_due_at where request.status='proposal_accepted'
  ) phase_data(phase,due_at)
  where case_record.executor_id is not null and phase_data.due_at<now()
  on conflict(service_request_id,phase,due_at) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end; $$;

create or replace function public.review_pre_contract_attention_notice(p_notice_id uuid,p_decision text,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=(select auth.uid()); item public.pre_contract_attention_notices;
begin
  if actor_id is null or not private.has_any_role(array['super_admin','executive_manager','litigation_manager','estates_manager']) then raise exception 'Only a department manager can review notices'; end if;
  select * into item from public.pre_contract_attention_notices where id=p_notice_id and status='pending' for update;
  if not found or p_decision not in ('active','rejected') then raise exception 'Notice is unavailable'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Rejection reason is required'; end if;
  update public.pre_contract_attention_notices set status=p_decision,reviewed_by=actor_id,reviewed_at=now(),rejection_reason=case when p_decision='rejected' then trim(p_reason) end,updated_at=now() where id=item.id;
  insert into public.notifications(recipient_id,notification_type,title,body,data) values(item.target_user_id,'pre_contract_attention_'||p_decision,case when p_decision='active' then 'لفت نظر قائم' else 'تم رفض لفت النظر' end,coalesce(nullif(trim(coalesce(p_reason,'')),''),item.reason),jsonb_build_object('service_request_id',item.service_request_id,'notice_id',item.id,'category','attention'));
  return item.id;
end; $$;

create trigger audit_pre_contract_attention_notices after insert or update on public.pre_contract_attention_notices for each row execute function private.audit_row_change();
revoke all on function public.generate_pre_contract_attention_notices() from public,anon,authenticated;
grant execute on function public.generate_pre_contract_attention_notices() to service_role;
revoke all on function public.review_pre_contract_attention_notice(uuid,text,text) from public,anon;
grant execute on function public.review_pre_contract_attention_notice(uuid,text,text) to authenticated;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='generate-pre-contract-attention-notices';
    perform cron.schedule('generate-pre-contract-attention-notices','*/5 * * * *','select public.generate_pre_contract_attention_notices()');
  end if;
exception when undefined_table or invalid_schema_name then null;
end $$;
