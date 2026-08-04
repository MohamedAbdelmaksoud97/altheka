import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260804110000_client_feedback_operations.sql",
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
