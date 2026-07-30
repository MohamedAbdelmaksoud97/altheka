import { expect, test, type Page } from "@playwright/test";

const password = process.env.DEMO_ROLE_PASSWORD;
const projectId = "20000000-0000-4000-8000-000000000001";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password ?? "");
  await page.getByRole("button", { name: "دخول آمن" }).click();
  await page.waitForURL(/\/(waiting|workspace)/, { timeout: 20_000 });
}

test.describe("specialized litigation supervision", () => {
  test.skip(!password, "DEMO_ROLE_PASSWORD is required");

  test("matching supervisor sees the case and can open its internal view", async ({
    page,
  }, testInfo) => {
    await login(page, "demo.supervisor-commercial@altheka.example");
    await page.goto("/workspace/supervision");

    await expect(page.getByText("متابعة قضايا التخصص")).toBeVisible();
    const projectLink = page.getByRole("link", {
      name: /مطالبة عقد تطوير مشروع تجاري/,
    });
    await expect(projectLink).toBeVisible();
    await expect(
      projectLink.getByText("القضايا التجارية", { exact: true }),
    ).toBeVisible();

    await page.screenshot({
      path: `artifacts/supervision-${testInfo.project.name}.png`,
      fullPage: true,
    });

    await page.goto(`/workspace/projects/${projectId}`);
    await expect(page.getByText("تصنيف القضية")).toBeVisible();
    await expect(page.getByText("سجل لفت النظر")).toBeVisible();
    await page.goto(`/workspace/projects/${projectId}?view=litigation`);
    await expect(
      page.getByRole("button", { name: "إصدار لفت نظر" }),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });

  test("mismatched supervisor cannot see or directly read the case", async ({
    page,
  }) => {
    await login(page, "demo.supervisor-labor@altheka.example");
    await page.goto("/workspace/supervision");
    await expect(
      page.getByText("مطالبة عقد تطوير مشروع تجاري"),
    ).toHaveCount(0);

    const response = await page.goto(`/workspace/projects/${projectId}`);
    expect(response?.status()).toBe(404);
  });

  test("litigation manager sees the primary and assistant assignees", async ({
    page,
  }) => {
    await login(page, "demo.litigation-manager@altheka.example");
    await page.goto(`/workspace/projects/${projectId}`);
    await expect(page.getByText("المكلفون بالقضية")).toBeVisible();
    await expect(
      page.getByText("الأخصائي القانوني التجريبي", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("مكلف مساعد")).toBeVisible();
  });
});
