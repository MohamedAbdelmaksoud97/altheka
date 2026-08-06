create table public.project_task_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  title text not null check (length(trim(title)) between 3 and 200),
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  closed_by uuid references public.profiles(id) on delete restrict,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_task_steps (
  id uuid primary key default gen_random_uuid(),
  task_thread_id uuid not null references public.project_task_threads(id) on delete restrict,
  sequence_number integer not null check (sequence_number > 0),
  title text not null check (length(trim(title)) between 3 and 300),
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','awaiting_review','completed','returned')),
  response_text text,
  response_by uuid references public.profiles(id) on delete restrict,
  responded_at timestamptz,
  proposed_next_title text,
  proposed_next_due_at timestamptz,
  review_notes text,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_thread_id, sequence_number)
);

create index project_task_threads_project_idx on public.project_task_threads(project_id,status,created_at desc);
create index project_task_steps_assignee_idx on public.project_task_steps(assigned_to,status,due_at);
alter table public.project_task_threads enable row level security;
alter table public.project_task_steps enable row level security;
revoke all on public.project_task_threads, public.project_task_steps from anon, authenticated;
grant select on public.project_task_threads, public.project_task_steps to authenticated;

create policy project_task_threads_read on public.project_task_threads for select to authenticated
using ((select private.is_active_staff()) and (select private.can_access_project(project_id)));
create policy project_task_steps_read on public.project_task_steps for select to authenticated
using (exists (select 1 from public.project_task_threads thread where thread.id=project_task_steps.task_thread_id));

create or replace function public.create_project_task_thread(
  p_project_id uuid,p_title text,p_step_title text,p_assigned_to uuid,p_due_at timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid()); project_row public.projects; thread_id uuid; step_id uuid;
begin
  if actor_id is null or not private.is_active_staff() or not private.has_permission('tasks.manage_threads') then raise exception 'The current user cannot create task threads'; end if;
  select * into project_row from public.projects where id=p_project_id and deleted_at is null;
  if not found or not private.can_access_project(p_project_id) then raise exception 'Project was not found'; end if;
  if not exists(select 1 from public.project_members member where member.project_id=p_project_id and member.user_id=p_assigned_to and member.left_at is null) then raise exception 'Assignee must be an active project member'; end if;
  insert into public.project_task_threads(organization_id,project_id,title,created_by) values(project_row.organization_id,p_project_id,trim(p_title),actor_id) returning id into thread_id;
  insert into public.project_task_steps(task_thread_id,sequence_number,title,assigned_to,due_at,created_by) values(thread_id,1,trim(p_step_title),p_assigned_to,p_due_at,actor_id) returning id into step_id;
  insert into public.notifications(recipient_id,notification_type,title,body,data) values(p_assigned_to,'project_task_assigned','مهمة جديدة',trim(p_step_title),jsonb_build_object('project_id',p_project_id,'task_thread_id',thread_id,'task_step_id',step_id,'category',case when project_row.project_type in ('estate','estate_litigation') then 'estates' else 'litigation' end));
  return thread_id;
end; $$;

create or replace function public.submit_project_task_step(
  p_step_id uuid,p_response_text text,p_proposed_next_title text default null,p_proposed_next_due_at timestamptz default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid()); step_row public.project_task_steps;
begin
  select * into step_row from public.project_task_steps where id=p_step_id and status in ('open','returned') for update;
  if not found or step_row.assigned_to<>actor_id then raise exception 'Only the assigned employee can submit this task'; end if;
  if length(trim(coalesce(p_response_text,'')))<3 then raise exception 'Task response is required'; end if;
  update public.project_task_steps set status='awaiting_review',response_text=trim(p_response_text),response_by=actor_id,responded_at=now(),proposed_next_title=nullif(trim(coalesce(p_proposed_next_title,'')),''),proposed_next_due_at=p_proposed_next_due_at,updated_at=now() where id=step_row.id;
  return step_row.id;
end; $$;

create or replace function public.review_project_task_step(
  p_step_id uuid,p_decision text,p_review_notes text default null,p_next_title text default null,p_next_due_at timestamptz default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid()); step_row public.project_task_steps; thread_row public.project_task_threads; next_id uuid; next_title text; next_due timestamptz;
begin
  if actor_id is null or not private.has_permission('tasks.manage_threads') then raise exception 'The current user cannot review task steps'; end if;
  select * into step_row from public.project_task_steps where id=p_step_id and status='awaiting_review' for update;
  if not found or p_decision not in ('approved','returned') then raise exception 'Task response is unavailable'; end if;
  select * into thread_row from public.project_task_threads where id=step_row.task_thread_id and status='open';
  if p_decision='returned' then
    if length(trim(coalesce(p_review_notes,'')))<3 then raise exception 'Return reason is required'; end if;
    update public.project_task_steps set status='returned',review_notes=trim(p_review_notes),reviewed_by=actor_id,reviewed_at=now(),updated_at=now() where id=step_row.id;
    return step_row.id;
  end if;
  update public.project_task_steps set status='completed',review_notes=nullif(trim(coalesce(p_review_notes,'')),''),reviewed_by=actor_id,reviewed_at=now(),updated_at=now() where id=step_row.id;
  next_title:=coalesce(nullif(trim(coalesce(p_next_title,'')),''),step_row.proposed_next_title);
  next_due:=coalesce(p_next_due_at,step_row.proposed_next_due_at);
  if next_title is not null then
    if next_due is null then raise exception 'Next task due date is required'; end if;
    insert into public.project_task_steps(task_thread_id,sequence_number,title,assigned_to,due_at,created_by) values(step_row.task_thread_id,step_row.sequence_number+1,next_title,step_row.assigned_to,next_due,actor_id) returning id into next_id;
    insert into public.notifications(recipient_id,notification_type,title,body,data) values(step_row.assigned_to,'project_task_assigned','مهمة تالية معتمدة',next_title,jsonb_build_object('project_id',thread_row.project_id,'task_thread_id',thread_row.id,'task_step_id',next_id,'category','operational'));
  end if;
  return coalesce(next_id,step_row.id);
end; $$;

create or replace function public.close_project_task_thread(p_thread_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not private.has_permission('tasks.manage_threads') then raise exception 'The current user cannot close task threads'; end if;
  if exists(select 1 from public.project_task_steps where task_thread_id=p_thread_id and status in ('open','awaiting_review','returned')) then raise exception 'Complete or review all task steps before closing the thread'; end if;
  update public.project_task_threads set status='closed',closed_by=actor_id,closed_at=now(),updated_at=now() where id=p_thread_id and status='open';
  if not found then raise exception 'Task thread is unavailable'; end if;
  return p_thread_id;
end; $$;

revoke all on function public.create_project_task_thread(uuid,text,text,uuid,timestamptz) from public,anon;
revoke all on function public.submit_project_task_step(uuid,text,text,timestamptz) from public,anon;
revoke all on function public.review_project_task_step(uuid,text,text,text,timestamptz) from public,anon;
revoke all on function public.close_project_task_thread(uuid) from public,anon;
grant execute on function public.create_project_task_thread(uuid,text,text,uuid,timestamptz) to authenticated;
grant execute on function public.submit_project_task_step(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.review_project_task_step(uuid,text,text,text,timestamptz) to authenticated;
grant execute on function public.close_project_task_thread(uuid) to authenticated;
