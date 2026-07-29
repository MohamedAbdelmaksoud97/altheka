import { expect, test } from "@playwright/test";

test("renders an Arabic RTL login journey with separate registration paths", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "مرحبًا بعودتك" })).toBeVisible();
  await expect(page.getByRole("img", { name: "أساس الثقة" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "تسجيل عميل" })).toBeVisible();
  await expect(page.getByRole("link", { name: "تسجيل موظف" })).toBeVisible();

  await page.getByRole("link", { name: "تسجيل موظف" }).click();
  await expect(page).toHaveURL(/\/register\/staff$/);
  await expect(page.getByRole("heading", { name: "طلب حساب موظف" })).toBeVisible();
  await expect(page.getByLabel("الإدارة المطلوبة")).toBeVisible();
  await expect(page.getByLabel("المسمى الوظيفي")).toBeVisible();
});

test("keeps the longest registration controls inside the mobile viewport", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile-only layout assertion");
  await page.goto("/register/staff");

  const viewport = page.viewportSize();
  const submitBox = await page.getByRole("button", { name: "إنشاء الحساب" }).boundingBox();
  const headingBox = await page
    .getByRole("heading", { name: "طلب حساب موظف" })
    .boundingBox();

  expect(viewport).not.toBeNull();
  expect(submitBox).not.toBeNull();
  expect(headingBox).not.toBeNull();
  expect(submitBox!.x).toBeGreaterThanOrEqual(0);
  expect(submitBox!.x + submitBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(headingBox!.x).toBeGreaterThanOrEqual(0);
  expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(viewport!.width);
});
