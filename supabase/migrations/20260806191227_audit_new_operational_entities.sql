alter function private.add_working_days(timestamptz, integer) stable;

drop trigger if exists audit_client_approval_requests on public.client_approval_requests;
create trigger audit_client_approval_requests after insert or update on public.client_approval_requests
for each row execute function private.audit_row_change();

drop trigger if exists audit_client_approval_responses on public.client_approval_responses;
create trigger audit_client_approval_responses after insert or update on public.client_approval_responses
for each row execute function private.audit_row_change();

drop trigger if exists audit_legal_consultation_responses on public.legal_consultation_responses;
create trigger audit_legal_consultation_responses after insert or update on public.legal_consultation_responses
for each row execute function private.audit_row_change();

drop trigger if exists audit_pre_contract_extension_requests on public.pre_contract_extension_requests;
create trigger audit_pre_contract_extension_requests after insert or update on public.pre_contract_extension_requests
for each row execute function private.audit_row_change();

drop trigger if exists audit_project_task_threads on public.project_task_threads;
create trigger audit_project_task_threads after insert or update on public.project_task_threads
for each row execute function private.audit_row_change();

drop trigger if exists audit_project_task_steps on public.project_task_steps;
create trigger audit_project_task_steps after insert or update on public.project_task_steps
for each row execute function private.audit_row_change();
