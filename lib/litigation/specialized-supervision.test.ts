import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultLitigationCategoryLabels } from "./categories";

const migration = readFileSync(
  "supabase/migrations/20260730114944_specialized_litigation_supervision.sql",
  "utf8",
);
const projectPage = readFileSync(
  "app/workspace/projects/[id]/page.tsx",
  "utf8",
);
const submissionMigration = readFileSync(
  "supabase/migrations/20260730124600_multi_assignee_submission.sql",
  "utf8",
);
const supervisionPage = readFileSync(
  "app/workspace/supervision/page.tsx",
  "utf8",
);

describe("specialized litigation supervision", () => {
  it("seeds every approved category and requires classification for new cases", () => {
    const categoryCodes = Object.keys(defaultLitigationCategoryLabels);
    expect(categoryCodes).toHaveLength(7);
    for (const categoryCode of categoryCodes) {
      expect(migration).toContain(`'${categoryCode}'`);
    }
    expect(migration).toContain("create_staff_service_request_v2");
    expect(migration).toContain("A litigation case category is required");
    expect(migration).toContain("needs_category_review");
  });

  it("scopes supervisors by an active specialty rather than role name alone", () => {
    expect(migration).toContain("private.can_supervise_project");
    expect(migration).toContain("litigation_supervisor_specialties");
    expect(migration).toContain(
      "private.user_has_permission(target_user_id, 'projects.read_specialty')",
    );
    expect(migration).toContain("project.litigation_case_category_id");
    expect(supervisionPage).toContain("get_supervision_portfolio");
  });

  it("supports multiple assignees while preserving one primary assignee", () => {
    expect(migration).toContain("create table public.project_assignees");
    expect(migration).toContain("project_assignees_single_primary_idx");
    expect(migration).toContain(
      "create table public.litigation_case_action_assignees",
    );
    expect(migration).toContain("assign_project_assignee");
    expect(migration).toContain("remove_project_assignee");
    expect(projectPage).toContain("isCurrentActionAssignee");
    expect(submissionMigration).toContain(
      "submit_litigation_action_response_v2",
    );
    expect(submissionMigration).toContain(
      "litigation_case_action_assignees",
    );
  });

  it("keeps attention notices internal, auditable, and tied to an open action", () => {
    expect(migration).toContain("create table public.project_attention_notices");
    expect(migration).toContain("issue_project_attention_notice");
    expect(migration).toContain("acknowledge_project_attention_notice");
    expect(migration).toContain("The selected user is not an active assignee");
    expect(migration).toContain("audit_project_attention_notices");
    expect(projectPage).toContain("AttentionNoticeForm");
  });
});
