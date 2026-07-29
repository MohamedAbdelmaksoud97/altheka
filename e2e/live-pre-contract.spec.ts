import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INITIAL_SUPER_ADMIN_EMAIL",
  "INITIAL_SUPER_ADMIN_PASSWORD",
] as const;

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`${name} is required for the live pre-contract test`);
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL!;
const adminPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD!;

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function publicClient() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "دخول آمن" }).click();
}

async function newContextPage(
  browserContextFactory: () => Promise<BrowserContext>,
) {
  const context = await browserContextFactory();
  return { context, page: await context.newPage() };
}

test("completes the registered-client to project journey", async ({
  browser,
}) => {
  test.setTimeout(240_000);

  const runId = Date.now().toString(36);
  const clientEmail = `mohamedhoarra+flow-${runId}@gmail.com`;
  const clientPassword = `FlowAa1!${runId}`;
  const clientName = `عميل مسار ${runId}`;
  let clientUserId: string | null = null;
  let requestId: string | null = null;
  let projectId: string | null = null;

  const { data: createdUser, error: createUserError } =
    await serviceClient.auth.admin.createUser({
      email: clientEmail,
      password: clientPassword,
      email_confirm: true,
      user_metadata: {
        registration_kind: "client",
        full_name: clientName,
        phone: "0500000099",
      },
    });
  if (createUserError) throw createUserError;
  clientUserId = createdUser.user.id;

  const { data: adminSession, error: adminSignInError } =
    await publicClient().auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
  if (adminSignInError) throw adminSignInError;
  const adminUserId = adminSession.user.id;

  const clientUi = await newContextPage(() =>
    browser.newContext({ locale: "ar-EG", timezoneId: "Africa/Cairo" }),
  );
  const adminUi = await newContextPage(() =>
    browser.newContext({ locale: "ar-EG", timezoneId: "Africa/Cairo" }),
  );

  try {
    await login(clientUi.page, clientEmail, clientPassword);
    await expect(clientUi.page).toHaveURL(/\/client$/, { timeout: 30_000 });
    await expect(
      clientUi.page.getByRole("heading", { name: "طلباتك القانونية" }),
    ).toBeVisible();

    await clientUi.page
      .getByLabel("نوع الخدمة")
      .selectOption("litigation");
    await clientUi.page
      .getByLabel("عنوان الطلب")
      .fill(`مطالبة مالية تجريبية ${runId}`);
    await clientUi.page
      .getByLabel("ملخص الطلب")
      .fill("طلب تجريبي متكامل للتحقق من جميع مراحل ما قبل التعاقد.");
    await clientUi.page.getByRole("button", { name: "إرسال الطلب" }).click();
    await expect(clientUi.page).toHaveURL(/\/client\/requests\/[0-9a-f-]+$/, {
      timeout: 30_000,
    });
    requestId = clientUi.page.url().split("/").pop()!;

    await clientUi.page.getByLabel("عنوان المستند").fill("مستند المطالبة");
    await clientUi.page
      .getByLabel("نوع المستند")
      .selectOption("evidence");
    await clientUi.page.getByLabel("الملف").setInputFiles({
      name: "claim.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nAltheka live flow acceptance\n%%EOF"),
    });
    await clientUi.page.getByRole("button", { name: "رفع المستند" }).click();
    await expect(clientUi.page.getByText("تم رفع المستند وحفظ بصمته.")).toBeVisible({
      timeout: 30_000,
    });

    await login(adminUi.page, adminEmail, adminPassword);
    await expect(adminUi.page).toHaveURL(/\/workspace$/, { timeout: 30_000 });
    await adminUi.page.goto(`/workspace/requests/${requestId}`);
    await expect(
      adminUi.page.getByRole("heading", {
        name: `مطالبة مالية تجريبية ${runId}`,
      }),
    ).toBeVisible();
    await expect(adminUi.page.getByText("مستند المطالبة")).toBeVisible();

    const staffUploadForm = adminUi.page.getByTestId(
      "request-document-upload",
    );
    await staffUploadForm
      .getByLabel("عنوان المستند")
      .fill("مذكرة داخلية للاختبار");
    await staffUploadForm
      .getByLabel("نوع المستند")
      .selectOption("correspondence");
    await staffUploadForm.getByLabel("مستوى الرؤية").selectOption("internal");
    await staffUploadForm.getByLabel("حالة النشر").selectOption("draft");
    await staffUploadForm.getByLabel("الملف").setInputFiles({
      name: "internal-note.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nInternal document\n%%EOF"),
    });
    await staffUploadForm
      .getByRole("button", { name: "رفع المستند" })
      .click();
    await expect(
      staffUploadForm.getByText("تم رفع المستند وحفظ بصمته."),
    ).toBeVisible({ timeout: 30_000 });

    let internalDocumentCard = adminUi.page
      .locator("article")
      .filter({ hasText: "مذكرة داخلية للاختبار" });
    await expect(internalDocumentCard).toBeVisible();

    await clientUi.page.goto(`/client/requests/${requestId}`);
    await expect(
      clientUi.page
        .locator("article")
        .filter({ hasText: "مذكرة داخلية للاختبار" }),
    ).toHaveCount(0);

    await internalDocumentCard
      .getByLabel("مستوى الرؤية")
      .selectOption("client_visible");
    await internalDocumentCard
      .getByLabel("حالة النشر")
      .selectOption("published");
    await internalDocumentCard
      .getByRole("button", { name: "حفظ إعدادات الرؤية" })
      .click();
    await expect(
      internalDocumentCard.getByText("تم نشر المستند للعميل."),
    ).toBeVisible({ timeout: 30_000 });

    await clientUi.page.goto(`/client/requests/${requestId}`);
    const publishedDocumentCard = clientUi.page
      .locator("article")
      .filter({ hasText: "مذكرة داخلية للاختبار" });
    await expect(publishedDocumentCard).toBeVisible();
    const downloadHref = await publishedDocumentCard
      .getByRole("link", { name: "تنزيل" })
      .getAttribute("href");
    expect(downloadHref).toMatch(/^\/documents\/[0-9a-f-]+\/download$/);
    const downloadResponse = await clientUi.page.request.get(downloadHref!, {
      maxRedirects: 0,
    });
    expect(downloadResponse.status()).toBe(307);

    const documentId = downloadHref!.split("/")[2];
    const { count: accessEventCount, error: accessEventError } =
      await serviceClient
        .from("document_access_events")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .eq("event_type", "signed_url_issued");
    if (accessEventError) throw accessEventError;
    expect(accessEventCount).toBe(1);

    internalDocumentCard = adminUi.page
      .locator("article")
      .filter({ hasText: "مذكرة داخلية للاختبار" });
    await internalDocumentCard
      .getByLabel("حالة النشر")
      .selectOption("withdrawn");
    await internalDocumentCard
      .getByRole("button", { name: "حفظ إعدادات الرؤية" })
      .click();
    await expect(
      internalDocumentCard.getByText("تم سحب المستند من بوابة العميل."),
    ).toBeVisible({ timeout: 30_000 });

    await clientUi.page.goto(`/client/requests/${requestId}`);
    await expect(
      clientUi.page
        .locator("article")
        .filter({ hasText: "مذكرة داخلية للاختبار" }),
    ).toHaveCount(0);

    await adminUi.page
      .getByRole("button", { name: "ربط العميل بالطلب" })
      .click();
    await expect(adminUi.page.getByLabel("المكلف بالدراسة")).toBeVisible({
      timeout: 30_000,
    });

    await adminUi.page
      .getByLabel("المكلف بالدراسة")
      .selectOption(adminUserId);
    await adminUi.page
      .getByLabel("معتمد الدراسة")
      .selectOption(adminUserId);
    await adminUi.page.getByRole("button", { name: "حفظ التكليف" }).click();
    await expect(
      adminUi.page.getByRole("heading", { name: "إعداد الدراسة القانونية" }),
    ).toBeVisible({ timeout: 30_000 });

    await adminUi.page
      .getByLabel("ملخص الدراسة")
      .fill("تثبت المستندات الأولية وجود مطالبة مالية قابلة للدراسة.");
    await adminUi.page
      .getByLabel("الرأي القانوني")
      .fill("نوصي بالبدء بإخطار نظامي ثم رفع الدعوى عند عدم السداد.");
    await adminUi.page
      .getByLabel("المسار المقترح")
      .selectOption("litigation");
    await adminUi.page
      .getByRole("button", { name: "إرسال الدراسة للاعتماد" })
      .click();
    await expect(
      adminUi.page.getByRole("button", { name: "اعتماد الدراسة" }),
    ).toBeVisible({ timeout: 30_000 });

    await adminUi.page
      .getByRole("button", { name: "اعتماد الدراسة" })
      .click();
    await expect(
      adminUi.page.getByRole("heading", { name: "العرض الفني والمالي" }),
    ).toBeVisible({
      timeout: 30_000,
    });

    await adminUi.page
      .getByLabel("النطاق الفني")
      .fill("دراسة الملف وإعداد الإخطار ورفع الدعوى ومتابعتها حتى الحكم.");
    await adminUi.page.getByLabel("الأتعاب").fill("15000");
    await adminUi.page.getByRole("button", { name: "إرسال العرض" }).click();
    await expect(
      adminUi.page.getByRole("heading", { name: "آخر عرض، الإصدار 1" }),
    ).toBeVisible({ timeout: 30_000 });

    await clientUi.page.goto(`/client/requests/${requestId}`);
    await expect(
      clientUi.page.getByText("العرض الفني والمالي، الإصدار 1"),
    ).toBeVisible();
    await clientUi.page.getByLabel("القرار").selectOption("request_discount");
    await clientUi.page
      .getByLabel("المبلغ المقترح عند طلب التخفيض")
      .fill("12000");
    await clientUi.page.getByLabel("ملاحظتك").fill("نرجو اعتماد التخفيض.");
    await clientUi.page.getByRole("button", { name: "تأكيد الرد" }).click();
    await expect(
      clientUi.page.getByText("طلب تخفيض قيد المراجعة", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    await adminUi.page.goto(`/workspace/requests/${requestId}`);
    await expect(adminUi.page.getByText("المبلغ المقترح من العميل")).toBeVisible({
      timeout: 30_000,
    });
    await adminUi.page.getByLabel("الأتعاب").fill("12500");
    await adminUi.page
      .getByRole("button", { name: "إرسال عرض معدل" })
      .click();
    await expect(
      adminUi.page.getByRole("heading", { name: "آخر عرض، الإصدار 2" }),
    ).toBeVisible({ timeout: 30_000 });

    await clientUi.page.goto(`/client/requests/${requestId}`);
    await expect(
      clientUi.page.getByText("العرض الفني والمالي، الإصدار 2"),
    ).toBeVisible();
    await clientUi.page.getByLabel("القرار").selectOption("accept");
    await clientUi.page.getByRole("button", { name: "تأكيد الرد" }).click();
    await expect(
      clientUi.page.getByText("تم قبول العرض", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    await adminUi.page.goto(`/workspace/requests/${requestId}`);
    await adminUi.page
      .getByLabel("نص العقد")
      .fill(
        "اتفق الطرفان على تقديم الخدمات القانونية الواردة في العرض الفني والمالي المعتمد، مقابل الأتعاب المتفق عليها.",
      );
    await adminUi.page
      .getByRole("button", { name: "إرسال العقد للعميل" })
      .click();
    await expect(
      adminUi.page.getByRole("heading", {
        name: "عقد تقديم خدمات قانونية",
      }),
    ).toBeVisible({ timeout: 30_000 });

    await clientUi.page.goto(`/client/requests/${requestId}`);
    await expect(
      clientUi.page.getByRole("heading", {
        name: "عقد تقديم خدمات قانونية",
      }),
    ).toBeVisible();
    await clientUi.page
      .getByLabel(
        "أوافق على العقد بنسخته المعروضة وأقر باطلاعي على محتواه واعتماده.",
      )
      .check();
    await clientUi.page.getByRole("button", { name: "اعتماد العقد" }).click();
    await expect(
      clientUi.page.getByText("تم توثيق اعتماد هذه النسخة"),
    ).toBeVisible({ timeout: 30_000 });

    await adminUi.page.goto(`/workspace/requests/${requestId}`);
    await adminUi.page
      .getByRole("button", { name: "تحويل إلى مشروع" })
      .click();
    await expect(
      adminUi.page.getByText(
        `المشروع نشط: مطالبة مالية تجريبية ${runId}`,
      ),
    ).toBeVisible({ timeout: 30_000 });

    const { data: project, error: projectError } = await serviceClient
      .from("projects")
      .select("id")
      .eq("service_request_id", requestId)
      .single();
    if (projectError) throw projectError;
    projectId = project.id;

    const { data: acceptance, error: acceptanceError } = await serviceClient
      .from("contract_acceptances")
      .select("accepted_sha256, contract_versions!inner(sha256)")
      .eq("accepted_by", clientUserId)
      .single();
    if (acceptanceError) throw acceptanceError;
    const acceptedVersion = acceptance.contract_versions as unknown as {
      sha256: string;
    };
    expect(acceptance.accepted_sha256).toBe(acceptedVersion.sha256);

    const { count: projectCount } = await serviceClient
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("service_request_id", requestId);
    expect(projectCount).toBe(1);

    const { count: workflowCount } = await serviceClient
      .from("workflow_instances")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    expect(workflowCount).toBeGreaterThanOrEqual(1);

    await clientUi.page.goto(`/client/requests/${requestId}`);
    await expect(clientUi.page.getByText("تم إنشاء المشروع")).toBeVisible();
  } finally {
    await clientUi.context.close();
    await adminUi.context.close();

    const archivedAt = new Date().toISOString();
    if (requestId) {
      await serviceClient
        .from("service_requests")
        .update({
          archived_at: archivedAt,
          retention_status: "archived",
        })
        .eq("id", requestId);
    }
    if (projectId) {
      await serviceClient
        .from("projects")
        .update({
          status: "archived",
          archived_at: archivedAt,
          retention_status: "archived",
        })
        .eq("id", projectId);
    }
    if (clientUserId) {
      const { data: account } = await serviceClient
        .from("client_accounts")
        .select("client_id")
        .eq("profile_id", clientUserId)
        .maybeSingle();
      if (account) {
        await serviceClient
          .from("clients")
          .update({ status: "inactive", archived_at: archivedAt })
          .eq("id", account.client_id);
      }
      await serviceClient
        .from("profiles")
        .update({ activation_status: "disabled", is_active: false })
        .eq("id", clientUserId);
      await serviceClient.auth.admin.updateUserById(clientUserId, {
        ban_duration: "876000h",
      });
    }
  }
});
