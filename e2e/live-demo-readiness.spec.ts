import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// This suite validates seeded live data and is intentionally excluded by default.
const adminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL;
const adminPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD;
const demoClientEmail =
  process.env.DEMO_CLIENT_EMAIL || "demo.client@altheka.example";
const demoClientPassword = process.env.DEMO_CLIENT_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const litigationProjectId = "20000000-0000-4000-8000-000000000001";
const estateProjectId = "20000000-0000-4000-8000-000000000002";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "دخول آمن" }).click();
  await page.waitForURL(/\/(workspace|client)/);
}

test.beforeEach(() => {
  if (
    !adminEmail ||
    !adminPassword ||
    !demoClientPassword ||
    !supabaseUrl ||
    !publishableKey
  ) {
    throw new Error(
      "Demo readiness requires Super Admin credentials and DEMO_CLIENT_PASSWORD.",
    );
  }
  mkdirSync("artifacts/screenshots", { recursive: true });
});

test("staff can present litigation and estate operations", async ({
  page,
}, testInfo) => {
  await login(page, adminEmail!, adminPassword!);

  await page.goto(`/workspace/projects/${litigationProjectId}`);
  await expect(
    page.getByRole("heading", { name: "مطالبة عقد تطوير مشروع تجاري" }),
  ).toBeVisible();
  await expect(page.getByText("التأسيس والتقييد").first()).toBeVisible();
  await expect(page.getByText("استكمال مذكرة الرد وتدقيق المستندات")).toBeVisible();

  await page.getByRole("link", { name: "التأسيس والمسار" }).click();
  await expect(
    page.getByRole("heading", { name: "التهنئة", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "التأسيس والتقييد", exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "المرافعة والجلسات" }).click();
  await expect(page.getByRole("heading", { name: "بطاقة القضية" })).toBeVisible();
  await expect(page.locator('input[name="court_name"]')).toHaveValue(
    "المحكمة التجارية بالرياض",
  );
  await expect(page.getByText("الدائرة التجارية الخامسة")).toBeVisible();

  await page.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-litigation.png`,
    fullPage: true,
  });

  await page.goto(`/workspace/projects/${estateProjectId}?view=estate`);
  await expect(
    page.getByRole("heading", { name: "تصفية تركة عبدالله السالم" }),
  ).toBeVisible();
  await expect(page.getByText("سارة عبدالله السالم")).toBeVisible();
  await expect(page.getByText("عمارة حي الياسمين")).toBeVisible();
  await expect(page.getByText("المحفظة الاستثمارية")).toBeVisible();

  await page.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-estate.png`,
    fullPage: true,
  });
});

test("client sees only the simplified published project view", async ({
  page,
}, testInfo) => {
  await login(page, demoClientEmail, demoClientPassword!);

  await expect(
    page.getByRole("heading", { name: "ملفك القانوني" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /مطالبة عقد تطوير مشروع تجاري/ }).click();

  await expect(page.getByText("التأسيس والتقييد")).toBeVisible();
  await expect(page.getByText("مسؤول التواصل")).toBeVisible();
  await expect(page.getByText("ملخص بدء المشروع")).toBeVisible();
  await expect(page.getByRole("heading", { name: "محادثة المشروع" })).toBeVisible();
  await expect(page.getByText("بطاقة القضية")).toHaveCount(0);
  await expect(page.getByText("أعضاء الفريق")).toHaveCount(0);
  await expect(page.getByText("المرافعة والجلسات")).toHaveCount(0);

  const client = createClient(supabaseUrl!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email: demoClientEmail,
    password: demoClientPassword!,
  });
  expect(signInError).toBeNull();

  const [
    projectRows,
    memberRows,
    workflowRows,
    litigationRows,
    litigationSubmissionRows,
    litigationReviewRows,
    estatePartyRows,
    clientProjectRows,
  ] = await Promise.all([
    client.from("projects").select("id").eq("id", litigationProjectId),
    client
      .from("project_members")
      .select("project_id")
      .eq("project_id", litigationProjectId),
    client
      .from("workflow_instances")
      .select("id")
      .eq("project_id", litigationProjectId),
    client
      .from("litigation_cases")
      .select("id")
      .eq("project_id", litigationProjectId),
    client.from("litigation_action_submissions").select("id"),
    client.from("litigation_action_submission_reviews").select("id"),
    client
      .from("estate_parties")
      .select("id")
      .eq("estate_project_id", estateProjectId),
    client.rpc("get_my_client_projects", {
      p_project_id: litigationProjectId,
    }),
  ]);
  expect(projectRows.data).toEqual([]);
  expect(memberRows.data).toEqual([]);
  expect(workflowRows.data).toEqual([]);
  expect(litigationRows.data).toEqual([]);
  expect(litigationSubmissionRows.data).toEqual([]);
  expect(litigationReviewRows.data).toEqual([]);
  expect(estatePartyRows.data).toEqual([]);
  expect(clientProjectRows.data).toHaveLength(1);

  await page.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-client.png`,
    fullPage: true,
  });
});
