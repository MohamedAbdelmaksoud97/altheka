import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INITIAL_SUPER_ADMIN_EMAIL",
  "INITIAL_SUPER_ADMIN_PASSWORD",
] as const;

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`${name} is required for the live Auth acceptance test`);
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

async function findUserByEmail(email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw error;
    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (user) return user;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Registered Auth user was not created");
}

async function maybeFindUserByEmail(email: string) {
  const { data, error } = await serviceClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  return (
    data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    ) ?? null
  );
}

async function confirmEmail(user: User) {
  const { error } = await serviceClient.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });
  if (error) throw error;
}

async function signIn(email: string, password: string) {
  const client = publicClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function expectVisibleRows(
  client: SupabaseClient,
  table: string,
  column: string,
  value: string,
  expectedCount: number,
  context?: string,
) {
  const { data, error } = await client.from(table).select("id").eq(column, value);
  if (error) throw error;
  expect(data, context).toHaveLength(expectedCount);
}

test("runs live registration, activation, and role access acceptance", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const runId = process.env.LIVE_AUTH_RUN_ID || Date.now().toString(36);
  const staffEmail = `mohamedhoarra+altheka-staff-${runId}@gmail.com`;
  const clientEmail = `mohamedhoarra+altheka-client-${runId}@gmail.com`;
  const staffPassword = `StaffAa1!${runId}`;
  const clientPassword = `ClientAa1!${runId}`;

  const existingStaffUser = await maybeFindUserByEmail(staffEmail);
  const existingClientUser = await maybeFindUserByEmail(clientEmail);

  if (!existingStaffUser || !existingClientUser) {
    const registrationContext = await browser.newContext({
      locale: "ar-EG",
      timezoneId: "Africa/Cairo",
    });
    const registrationPage = await registrationContext.newPage();

    await registrationPage.goto("/register/staff");
    await registrationPage.getByLabel("الاسم الكامل").fill("موظف اختبار الصلاحيات");
    await registrationPage.getByLabel("رقم التواصل").fill("0500000001");
    await registrationPage.getByLabel("البريد الإلكتروني").fill(staffEmail);
    await registrationPage.getByLabel("الإدارة المطلوبة").fill("إدارة التقاضي");
    await registrationPage.getByLabel("المسمى الوظيفي").fill("محام");
    await registrationPage
      .getByLabel("كلمة المرور", { exact: true })
      .fill(staffPassword);
    await registrationPage.getByLabel("تأكيد كلمة المرور").fill(staffPassword);
    await registrationPage.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(
      registrationPage.getByText("تم إنشاء الحساب. افتح رسالة التأكيد"),
    ).toBeVisible({ timeout: 30_000 });

    await registrationPage.goto("/register/client");
    await registrationPage.getByLabel("الاسم الكامل").fill("عميل اختبار الصلاحيات");
    await registrationPage.getByLabel("رقم التواصل").fill("0500000002");
    await registrationPage.getByLabel("البريد الإلكتروني").fill(clientEmail);
    await registrationPage
      .getByLabel("كلمة المرور", { exact: true })
      .fill(clientPassword);
    await registrationPage.getByLabel("تأكيد كلمة المرور").fill(clientPassword);
    await registrationPage.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(
      registrationPage.getByText("تم إنشاء الحساب. افتح رسالة التأكيد"),
    ).toBeVisible({ timeout: 30_000 });
    await registrationContext.close();
  }

  const staffUser = existingStaffUser ?? (await findUserByEmail(staffEmail));
  const clientUser = existingClientUser ?? (await findUserByEmail(clientEmail));
  await confirmEmail(staffUser);
  await confirmEmail(clientUser);

  const { data: staffProfileBefore } = await serviceClient
    .from("profiles")
    .select("activation_status")
    .eq("id", staffUser.id)
    .single();
  const { data: clientProfileBefore } = await serviceClient
    .from("profiles")
    .select("activation_status")
    .eq("id", clientUser.id)
    .single();
  expect(staffProfileBefore?.activation_status).toBe("pending_staff_approval");
  expect(clientProfileBefore?.activation_status).toBe("client_waiting");

  const pendingStaffClient = await signIn(staffEmail, staffPassword);
  const { data: pendingTemplates, error: pendingTemplatesError } =
    await pendingStaffClient.from("workflow_templates").select("id");
  expect(pendingTemplatesError).toBeNull();
  expect(pendingTemplates).toEqual([]);

  const adminClient = await signIn(adminEmail, adminPassword);
  const {
    data: { user: signedInAdmin },
  } = await adminClient.auth.getUser();
  const { data: adminProfile } = await adminClient
    .from("profiles")
    .select("id")
    .eq("id", signedInAdmin!.id)
    .single();
  expect(adminProfile?.id).toBeTruthy();

  const { data: request } = await adminClient
    .from("staff_registration_requests")
    .select("id")
    .eq("profile_id", staffUser.id)
    .eq("status", "pending")
    .single();
  const { data: department } = await adminClient
    .from("departments")
    .select("id")
    .eq("code", "litigation")
    .single();
  const { data: jobTitle } = await adminClient
    .from("job_titles")
    .select("id")
    .eq("code", "lawyer")
    .single();
  const { data: lawyerRole } = await adminClient
    .from("roles")
    .select("id")
    .eq("code", "lawyer")
    .single();
  expect(request && department && jobTitle && lawyerRole).toBeTruthy();

  const { error: approvalError } = await adminClient.rpc(
    "approve_staff_registration",
    {
      p_request_id: request!.id,
      p_department_id: department!.id,
      p_job_title_id: jobTitle!.id,
      p_role_ids: [lawyerRole!.id],
      p_review_notes: "Live Auth acceptance test",
    },
  );
  expect(approvalError).toBeNull();

  const { data: activeStaffProfile } = await serviceClient
    .from("profiles")
    .select("organization_id, activation_status")
    .eq("id", staffUser.id)
    .single();
  expect(activeStaffProfile?.activation_status).toBe("active_staff");

  const organizationId = activeStaffProfile!.organization_id;
  const { data: linkedClient, error: linkedClientError } = await serviceClient
    .from("clients")
    .insert({
      organization_id: organizationId,
      display_name: "عميل اختبار الوصول",
      status: "active",
    })
    .select("id")
    .single();
  if (linkedClientError) throw linkedClientError;

  const { error: clientLinkError } = await serviceClient
    .from("client_accounts")
    .insert({
      client_id: linkedClient.id,
      profile_id: clientUser.id,
      linked_by: adminProfile!.id,
    });
  if (clientLinkError) throw clientLinkError;

  const { error: clientActivationError } = await serviceClient
    .from("profiles")
    .update({ activation_status: "active_client" })
    .eq("id", clientUser.id);
  if (clientActivationError) throw clientActivationError;

  const requestBase = {
    organization_id: organizationId,
    client_id: linkedClient.id,
    created_by: clientUser.id,
    request_type: "litigation",
    visibility: "client_visible",
  };
  const { data: assignedRequest, error: assignedRequestError } =
    await serviceClient
      .from("service_requests")
      .insert({ ...requestBase, title: "طلب مرتبط بمشروع الاختبار" })
      .select("id")
      .single();
  if (assignedRequestError) throw assignedRequestError;

  const { data: unassignedRequest, error: unassignedRequestError } =
    await serviceClient
      .from("service_requests")
      .insert({ ...requestBase, title: "طلب غير مسند لاختبار الأدوار" })
      .select("id")
      .single();
  if (unassignedRequestError) throw unassignedRequestError;

  const { data: project, error: projectError } = await serviceClient
    .from("projects")
    .insert({
      organization_id: organizationId,
      client_id: linkedClient.id,
      service_request_id: assignedRequest.id,
      name: "مشروع اختبار مصفوفة الوصول",
      project_type: "litigation",
      status: "active",
    })
    .select("id")
    .single();
  if (projectError) throw projectError;

  const { error: membershipError } = await serviceClient
    .from("project_members")
    .insert({
      project_id: project.id,
      user_id: staffUser.id,
      membership_role: "executor",
      assigned_by: adminProfile!.id,
    });
  if (membershipError) throw membershipError;

  const activeStaffClient = await signIn(staffEmail, staffPassword);
  const { data: templates, error: templatesError } = await activeStaffClient
    .from("workflow_templates")
    .select("id");
  expect(templatesError).toBeNull();
  expect(templates?.length).toBeGreaterThanOrEqual(3);

  const roleCodes = [
    "new_clients_manager",
    "litigation_manager",
    "litigation_secretary",
    "lawyer",
    "legal_specialist",
    "estates_manager",
    "estates_secretary",
    "accountant",
    "executive_manager",
  ];
  const { data: roles, error: rolesError } = await serviceClient
    .from("roles")
    .select("id, code")
    .in("code", roleCodes);
  if (rolesError) throw rolesError;

  for (const roleCode of roleCodes) {
    const role = roles.find((candidate) => candidate.code === roleCode);
    expect(role).toBeTruthy();

    await serviceClient
      .from("user_roles")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: adminProfile!.id,
      })
      .eq("user_id", staffUser.id)
      .is("revoked_at", null);
    const { error: roleAssignmentError } = await serviceClient
      .from("user_roles")
      .upsert(
        {
          user_id: staffUser.id,
          role_id: role!.id,
          assigned_by: adminProfile!.id,
          assigned_at: new Date().toISOString(),
          revoked_at: null,
          revoked_by: null,
        },
        { onConflict: "user_id,role_id" },
      );
    if (roleAssignmentError) throw roleAssignmentError;

    await expectVisibleRows(
      activeStaffClient,
      "projects",
      "id",
      project.id,
      1,
    );
    await expectVisibleRows(
      activeStaffClient,
      "service_requests",
      "id",
      unassignedRequest.id,
      [
        "new_clients_manager",
        "litigation_manager",
        "estates_manager",
      ].includes(roleCode)
        ? 1
        : 0,
      `service request visibility for ${roleCode}`,
    );
  }

  const lawyerRoleForRestore = roles.find((role) => role.code === "lawyer")!;
  await serviceClient
    .from("user_roles")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: adminProfile!.id,
    })
    .eq("user_id", staffUser.id)
    .is("revoked_at", null);
  await serviceClient.from("user_roles").upsert(
    {
      user_id: staffUser.id,
      role_id: lawyerRoleForRestore.id,
      assigned_by: adminProfile!.id,
      assigned_at: new Date().toISOString(),
      revoked_at: null,
      revoked_by: null,
    },
    { onConflict: "user_id,role_id" },
  );

  const { error: unauthorizedApprovalError } = await activeStaffClient.rpc(
    "approve_staff_registration",
    {
      p_request_id: crypto.randomUUID(),
      p_department_id: department!.id,
      p_job_title_id: jobTitle!.id,
      p_role_ids: [lawyerRole!.id],
      p_review_notes: "Must be rejected",
    },
  );
  expect(unauthorizedApprovalError).not.toBeNull();

  const clientSession = await signIn(clientEmail, clientPassword);
  await expectVisibleRows(clientSession, "projects", "id", project.id, 1);
  await expectVisibleRows(
    clientSession,
    "service_requests",
    "id",
    unassignedRequest.id,
    1,
  );
  const { data: clientTemplates, error: clientTemplatesError } =
    await clientSession.from("workflow_templates").select("id");
  expect(clientTemplatesError).toBeNull();
  expect(clientTemplates).toEqual([]);

  const staffUiContext = await browser.newContext({ locale: "ar-EG" });
  const staffUiPage = await staffUiContext.newPage();
  await staffUiPage.goto("/login");
  await staffUiPage.getByLabel("البريد الإلكتروني").fill(staffEmail);
  await staffUiPage.getByLabel("كلمة المرور").fill(staffPassword);
  await staffUiPage.getByRole("button", { name: "دخول آمن" }).click();
  await expect(staffUiPage).toHaveURL(/\/workspace$/, { timeout: 30_000 });
  await staffUiContext.close();

  const clientUiContext = await browser.newContext({ locale: "ar-EG" });
  const clientUiPage = await clientUiContext.newPage();
  await clientUiPage.goto("/login");
  await clientUiPage.getByLabel("البريد الإلكتروني").fill(clientEmail);
  await clientUiPage.getByLabel("كلمة المرور").fill(clientPassword);
  await clientUiPage.getByRole("button", { name: "دخول آمن" }).click();
  await expect(clientUiPage).toHaveURL(/\/client$/, { timeout: 30_000 });
  await clientUiContext.close();

  const disabledAt = new Date().toISOString();
  await serviceClient
    .from("profiles")
    .update({ activation_status: "disabled", is_active: false })
    .in("id", [staffUser.id, clientUser.id]);
  await serviceClient
    .from("projects")
    .update({ status: "archived", archived_at: disabledAt })
    .eq("id", project.id);
  await serviceClient
    .from("clients")
    .update({ status: "inactive", archived_at: disabledAt })
    .eq("id", linkedClient.id);
  await serviceClient.auth.admin.updateUserById(staffUser.id, {
    ban_duration: "876000h",
  });
  await serviceClient.auth.admin.updateUserById(clientUser.id, {
    ban_duration: "876000h",
  });
});

test("allows the first Super Admin to reach staff administration", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(adminEmail);
  await page.getByLabel("كلمة المرور").fill(adminPassword);
  await page.getByRole("button", { name: "دخول آمن" }).click();
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 30_000 });

  await page.getByTitle("إدارة الموظفين").click();
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(
    page.getByRole("heading", { name: "إدارة الموظفين" }),
  ).toBeVisible();
});
