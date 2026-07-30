import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const adminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL;
const adminPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD;

test.beforeEach(() => {
  if (!adminEmail || !adminPassword) {
    throw new Error(
      "Staff management UI test requires the initial Super Admin credentials.",
    );
  }
  mkdirSync("artifacts/screenshots", { recursive: true });
});

test("Super Admin can inspect and filter the staff directory", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(adminEmail!);
  await page.locator('input[name="password"]').fill(adminPassword!);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/workspace$/);
  await page.goto("/admin/staff");

  await expect(
    page.getByRole("heading", { name: "إدارة الموظفين" }),
  ).toBeVisible();
  await expect(page.getByTestId("staff-tab-pending")).toBeVisible();
  await expect(page.getByTestId("staff-tab-active")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("staff-tab-inactive")).toBeVisible();

  const rows = page.getByTestId("staff-employee-row");
  await expect(rows.first()).toBeVisible();
  await rows.first().getByRole("button").click();
  await expect(
    page.getByRole("heading", { name: "بيانات الموظف والوصول" }),
  ).toBeVisible();

  await page
    .getByTestId("staff-search")
    .fill("demo.legal-specialist@altheka.example");
  await expect(rows).toHaveCount(1);

  await page.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-staff-management.png`,
    fullPage: true,
  });
});
