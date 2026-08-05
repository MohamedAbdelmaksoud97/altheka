import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projectPage = readFileSync("app/workspace/projects/[id]/page.tsx", "utf8");

describe("project task board", () => {
  it("exposes litigation tasks as a dedicated project tab with reviewable proposals", () => {
    expect(projectPage).toContain('{ code: "tasks", label: "المهام"');
    expect(projectPage).toContain("مهام القضية");
    expect(projectPage).toContain("رد المحامي");
    expect(projectPage).toContain("المهمة القادمة المقترحة من المحامي");
    expect(projectPage).toContain("قبول الاقتراح أو رفضه");
    expect(projectPage).toContain("LitigationActionReviewForm");
  });
});
