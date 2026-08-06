import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260804110000_client_feedback_operations.sql",
  "utf8",
);
const operationsActions = readFileSync("app/actions/operations.ts", "utf8");
const appShell = readFileSync("components/app-shell.tsx", "utf8");
const calendarPage = readFileSync("app/workspace/calendar/page.tsx", "utf8");
const agenciesPage = readFileSync(
  "app/workspace/powers-of-attorney/page.tsx",
  "utf8",
);
const agenciesForm = readFileSync("components/operations/forms.tsx", "utf8");
const agenciesFix = readFileSync(
  "supabase/migrations/20260806220806_fix_power_of_attorney_creation_and_link_validation.sql",
  "utf8",
);
const calendarRlsFix = readFileSync(
  "supabase/migrations/20260806221852_fix_calendar_rls_recursion.sql",
  "utf8",
);

describe("client feedback operations migration", () => {
  it("adds the client-intake and document archive model", () => {
    expect(migration).toContain("create table if not exists public.client_sources");
    expect(migration).toContain("create table if not exists public.document_categories");
    expect(migration).toContain("add column if not exists document_number");
    expect(migration).toContain("add column if not exists page_count");
    expect(migration).toContain("public.register_invited_client_profile");
    expect(migration).toContain("public.create_staff_service_request_v3");
    expect(migration).toContain("public.update_document_metadata");
  });

  it("adds operational tasks, proposed actions, and approvals", () => {
    expect(migration).toContain("create table if not exists public.workflow_action_updates");
    expect(migration).toContain("create table if not exists public.proposed_workflow_actions");
    expect(migration).toContain("public.record_workflow_action_update");
    expect(migration).toContain("public.propose_workflow_action");
    expect(migration).toContain("public.review_proposed_workflow_action");
    expect(migration).toContain("tasks.approve_proposed");
  });

  it("adds calendar, powers of attorney, and independent estate approvals", () => {
    expect(migration).toContain("create table if not exists public.appointments");
    expect(migration).toContain("create table if not exists public.appointment_participants");
    expect(migration).toContain("create table if not exists public.powers_of_attorney");
    expect(migration).toContain("create table if not exists public.estate_party_approval_requests");
    expect(migration).toContain("create table if not exists public.estate_party_approval_responses");
    expect(migration).toContain("notification_type, recipient_id, payload, scheduled_for");
    expect(migration).toContain("public.respond_estate_party_approval");
  });

  it("refreshes the calendar and agencies interface after a valid creation", () => {
    expect(operationsActions).toContain("createAppointmentAction");
    expect(operationsActions).toContain("createPowerOfAttorneyAction");
    expect(operationsActions).toContain("refreshOperations(parsed.data.projectId || null, parsed.data.requestId || null);");
    expect(operationsActions).toContain("refresh();");
    expect(operationsActions).toContain("اختر العميل أو الطلب أو المشروع المرتبط بالموعد.");
    expect(operationsActions).toContain("اختر العميل المرتبط بالوكالة.");
    expect(appShell).toContain('label: "وكالات"');
    expect(operationsActions).toContain(
      "/workspace/calendar?view=week&filter=all&date=${appointmentDate}&created=1",
    );
    expect(calendarPage).toContain('from("appointment_participants")');
    expect(calendarPage).toContain("participantsByAppointment");
    expect(calendarPage).not.toContain("participant_role,profiles(full_name)");
    expect(calendarRlsFix).toContain("private.can_read_appointment");
    expect(calendarRlsFix).toContain("drop policy if exists appointments_access_select");
    expect(calendarRlsFix).toContain("drop policy if exists appointment_participants_access_select");
    expect(agenciesPage).not.toContain("documents(title,file_name)");
    expect(agenciesPage).toContain('select("id,title,client_id,project_id,service_request_id")');
    expect(agenciesForm).toContain("clientProjects");
    expect(agenciesForm).toContain("clientRequests");
    expect(agenciesForm).toContain("clientDocuments");
    expect(agenciesFix).toContain("POA_PROJECT_CLIENT_MISMATCH");
    expect(agenciesFix).toContain("POA_DOCUMENT_CLIENT_MISMATCH");
  });

  it("keeps the new surfaces behind explicit permissions, RLS, and audit", () => {
    for (const permission of [
      "clients.invite",
      "client_sources.manage",
      "document_categories.manage",
      "appointments.manage",
      "powers_of_attorney.manage",
      "estate_approvals.manage",
    ]) {
      expect(migration).toContain(permission);
    }
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("private.audit_row_change()");
    expect(migration).toContain("private.has_permission");
  });
});
