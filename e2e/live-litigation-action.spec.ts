import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const lawyerEmail =
  process.env.DEMO_LAWYER_EMAIL || "demo.lawyer@altheka.example";
const lawyerPassword = process.env.DEMO_ROLE_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const routingProjectId = "6f49d178-b6ef-472e-af67-ec5b26fe2138";

test.beforeEach(() => {
  if (!lawyerPassword || !supabaseUrl || !publishableKey) {
    throw new Error(
      "Litigation action UI test requires DEMO_ROLE_PASSWORD and Supabase public configuration.",
    );
  }
  mkdirSync("artifacts/screenshots", { recursive: true });
});

test("assigned lawyer sees the current action execution control", async ({
  page,
}, testInfo) => {
  const api = createClient(supabaseUrl!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: signInError } =
    await api.auth.signInWithPassword({
      email: lawyerEmail,
      password: lawyerPassword!,
    });
  expect(signInError).toBeNull();
  expect(authData.user).not.toBeNull();

  const { data: actionRows, error: actionError } = await api
    .from("litigation_case_actions")
    .select(
      "id, status, case_record:litigation_cases!litigation_case_actions_litigation_case_id_fkey!inner(project_id, current_next_action_id)",
    )
    .eq("assigned_to", authData.user!.id)
    .in("status", ["planned", "in_progress", "returned_for_revision"]);
  expect(actionError).toBeNull();

  const currentAction = (actionRows ?? []).find((row) => {
    const caseRelation = row.case_record as unknown as
      | { project_id: string; current_next_action_id: string | null }
      | { project_id: string; current_next_action_id: string | null }[];
    const litigationCase = Array.isArray(caseRelation)
      ? caseRelation[0]
      : caseRelation;
    return litigationCase?.current_next_action_id === row.id;
  });
  expect(currentAction).toBeTruthy();

  const caseRelation = currentAction!.case_record as unknown as
    | { project_id: string }
    | { project_id: string }[];
  const projectId = Array.isArray(caseRelation)
    ? caseRelation[0]?.project_id
    : caseRelation.project_id;
  expect(projectId).toBeTruthy();

  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(lawyerEmail);
  await page.getByLabel("كلمة المرور").fill(lawyerPassword!);
  await page.getByRole("button", { name: "دخول آمن" }).click();
  await page.waitForURL(/\/workspace/);
  await page.goto(`/workspace/projects/${projectId}?view=litigation`);

  await expect(page.getByRole("heading", { name: "الإجراء القادم" })).toBeVisible();
  if (currentAction!.status === "planned") {
    await expect(
      page.getByRole("button", { name: "بدء تنفيذ الإجراء" }),
    ).toBeVisible();
  } else {
    await expect(page.locator('textarea[name="result_summary"]')).toBeVisible();
    await expect(
      page.getByRole("button", { name: "إرسال النتيجة للاعتماد" }),
    ).toBeVisible();
  }

  await page.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-litigation-action.png`,
    fullPage: true,
  });
});

test("litigation project manager sees the conditional stage routing control", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(lawyerEmail);
  await page.locator('input[name="password"]').fill(lawyerPassword!);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/workspace/);
  await page.goto(`/workspace/projects/${routingProjectId}`);

  const routingForm = page.getByTestId("litigation-stage-routing");
  const stageSelect = page.getByTestId("litigation-stage-select");
  await expect(routingForm).toBeVisible();
  await expect(stageSelect.locator('option[value="appeal"]')).toHaveCount(1);
  await expect(stageSelect.locator('option[value="enforcement"]')).toHaveCount(1);

  await page.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-stage-routing.png`,
    fullPage: true,
  });
});
