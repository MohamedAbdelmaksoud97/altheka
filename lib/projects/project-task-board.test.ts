import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projectPage = readFileSync("app/workspace/projects/[id]/page.tsx", "utf8");
const clientPage = readFileSync("app/workspace/clients/[id]/page.tsx", "utf8");
const completionMigration = readFileSync(
  "supabase/migrations/20260806210159_complete_remaining_client_requirements.sql",
  "utf8",
);

describe("project task board", () => {
  it("exposes litigation tasks as a dedicated project tab with reviewable proposals", () => {
    expect(projectPage).toContain('{ code: "tasks", label: "المهام"');
    expect(projectPage).toContain("مهام القضية");
    expect(projectPage).toContain("رد المحامي");
    expect(projectPage).toContain("المهمة القادمة المقترحة من المحامي");
    expect(projectPage).toContain("قبول الاقتراح أو رفضه");
    expect(projectPage).toContain("LitigationActionReviewForm");
  });

  it("shows the requested task movement summary inside every project", () => {
    expect(projectPage).toContain("مهام أُنشئت خلال آخر 7 أيام");
    expect(projectPage).toContain("المهام الحالية");
    expect(projectPage).toContain("المهام القادمة");
  });

  it("shows and measures the department manager approval window", () => {
    expect(projectPage).toContain("مدة اعتماد مدير الإدارة");
    expect(projectPage).toContain("approval_due_at");
    expect(completionMigration).toContain("approval_target_business_days");
    expect(completionMigration).toContain("generate_due_soon_notifications");
  });

  it("supports searching projects inside the unified client file", () => {
    expect(clientPage).toContain('name="project_q"');
    expect(clientPage).toContain("visibleProjects");
  });
});
