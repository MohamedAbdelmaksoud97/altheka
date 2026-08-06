create or replace function private.enforce_workflow_action_controls()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid()); is_executor boolean; is_approver boolean;
begin
  if new.status='ready' and new.started_at is null then new.due_at:=null; end if;
  if new.status='in_progress' and old.status is distinct from 'in_progress' then
    select exists(select 1 from public.workflow_action_participants participant where participant.workflow_action_instance_id=new.id and participant.user_id=actor_id and participant.unassigned_at is null and participant.participant_type in('executor','responsible')) into is_executor;
    if actor_id is not null and not is_executor then raise exception 'Only the assigned executor can start this workflow step'; end if;
    new.started_at:=coalesce(new.started_at,now());
    new.due_at:=private.workflow_action_due_at(new.id,new.started_at);
  end if;
  if new.status='submitted' and old.status is distinct from 'submitted' then
    select exists(select 1 from public.workflow_action_participants participant where participant.workflow_action_instance_id=new.id and participant.user_id=actor_id and participant.unassigned_at is null and participant.participant_type in('executor','responsible')) into is_executor;
    if actor_id is not null and not is_executor then raise exception 'Only the assigned executor can submit this workflow step'; end if;
    if new.requires_attachment and not exists(select 1 from public.documents document where document.workflow_action_instance_id=new.id and document.deleted_at is null and document.archived_at is null) then raise exception 'This workflow step requires an attachment before submission'; end if;
  end if;
  if new.status in('approved','returned_for_revision') and old.status is distinct from new.status then
    select exists(select 1 from public.workflow_action_participants participant where participant.workflow_action_instance_id=new.id and participant.user_id=actor_id and participant.unassigned_at is null and participant.participant_type='approver') into is_approver;
    if actor_id is not null and (not is_approver or not private.has_any_role(array['litigation_manager','estates_manager'])) then raise exception 'Only the assigned department manager can review this workflow step'; end if;
    if new.status='returned_for_revision' and length(trim(coalesce(new.return_reason,'')))<5 then raise exception 'Return reason is required'; end if;
  end if;
  return new;
end $$;

create or replace function public.set_project_health(p_project_id uuid,p_health_status text,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not private.has_permission('attention_notices.review') then raise exception 'Only a department manager can change project health'; end if;
  if not private.can_access_project(p_project_id) then raise exception 'The current user cannot access this project'; end if;
  if p_health_status not in('green','yellow') then raise exception 'Unsupported manual health status'; end if;
  if p_health_status='yellow' and length(trim(coalesce(p_reason,'')))<5 then raise exception 'External hold reason is required'; end if;
  update public.projects set health_status=p_health_status,external_hold_reason=case when p_health_status='yellow' then trim(p_reason) end,external_hold_started_at=case when p_health_status='yellow' then coalesce(external_hold_started_at,now()) end,health_updated_by=actor_id,health_updated_at=now(),updated_at=now() where id=p_project_id and deleted_at is null;
  if not found then raise exception 'Project was not found'; end if;
  return p_project_id;
end $$;

revoke all on function public.set_project_health(uuid,text,text) from public,anon;
grant execute on function public.set_project_health(uuid,text,text) to authenticated;
