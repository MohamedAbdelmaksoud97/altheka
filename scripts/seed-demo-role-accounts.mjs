import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const staffPassword = process.env.DEMO_ROLE_PASSWORD;
const superAdminPassword =
  process.env.DEMO_SUPER_ADMIN_PASSWORD || staffPassword;
const clientPassword = process.env.DEMO_CLIENT_PASSWORD;

if (
  !url ||
  !serviceRoleKey ||
  !publishableKey ||
  !staffPassword ||
  !superAdminPassword ||
  !clientPassword
) {
  console.error(
    "Set Supabase keys plus DEMO_ROLE_PASSWORD, DEMO_SUPER_ADMIN_PASSWORD, and DEMO_CLIENT_PASSWORD.",
  );
  process.exit(1);
}

const organizationId = "00000000-0000-0000-0000-000000000001";
const supervisorCategoryAccounts = [
  ["commercial", "commercial", "مشرف القضايا التجارية"],
  ["labor", "labor", "مشرف القضايا العمالية"],
  ["medical_malpractice", "medical", "مشرف قضايا الأخطاء الطبية"],
  ["enforcement", "enforcement", "مشرف قضايا التنفيذ"],
  ["personal_status", "personal-status", "مشرف قضايا الأحوال الشخصية"],
  ["civil_rights", "civil-rights", "مشرف القضايا الحقوقية"],
  ["administrative", "administrative", "مشرف القضايا الإدارية"],
];
const staffAccounts = [
  {
    roleCode: "super_admin",
    email: "demo.super-admin@altheka.example",
    fullName: "مدير النظام التجريبي",
    departmentCode: "executive",
    jobTitleCode: "executive_manager",
    password: superAdminPassword,
  },
  {
    roleCode: "new_clients_manager",
    email: "demo.clients-manager@altheka.example",
    fullName: "مدير العملاء الجدد التجريبي",
    departmentCode: "new_clients",
    jobTitleCode: "new_clients_manager",
    password: staffPassword,
  },
  {
    roleCode: "litigation_manager",
    email: "demo.litigation-manager@altheka.example",
    fullName: "مدير التقاضي التجريبي",
    departmentCode: "litigation",
    jobTitleCode: "litigation_manager",
    password: staffPassword,
  },
  {
    roleCode: "litigation_secretary",
    email: "demo.litigation-secretary@altheka.example",
    fullName: "سكرتير التقاضي التجريبي",
    departmentCode: "litigation",
    jobTitleCode: "litigation_secretary",
    password: staffPassword,
  },
  {
    roleCode: "lawyer",
    email: "demo.lawyer@altheka.example",
    fullName: "المحامي التجريبي",
    departmentCode: "litigation",
    jobTitleCode: "lawyer",
    password: staffPassword,
  },
  {
    roleCode: "legal_specialist",
    email: "demo.legal-specialist@altheka.example",
    fullName: "الأخصائي القانوني التجريبي",
    departmentCode: "litigation",
    jobTitleCode: "legal_specialist",
    password: staffPassword,
  },
  ...supervisorCategoryAccounts.map(
    ([specialtyCode, emailSlug, fullName]) => ({
      roleCode: "litigation_supervisor",
      email: `demo.supervisor-${emailSlug}@altheka.example`,
      fullName,
      departmentCode: "litigation",
      jobTitleCode: "litigation_supervisor",
      specialtyCode,
      password: staffPassword,
    }),
  ),
  {
    roleCode: "estates_manager",
    email: "demo.estates-manager@altheka.example",
    fullName: "مدير التركات التجريبي",
    departmentCode: "estates",
    jobTitleCode: "estates_manager",
    password: staffPassword,
  },
  {
    roleCode: "estates_secretary",
    email: "demo.estates-secretary@altheka.example",
    fullName: "سكرتير التركات التجريبي",
    departmentCode: "estates",
    jobTitleCode: "estates_secretary",
    password: staffPassword,
  },
  {
    roleCode: "accountant",
    email: "demo.accountant@altheka.example",
    fullName: "المحاسب التجريبي",
    departmentCode: "finance",
    jobTitleCode: "accountant",
    password: staffPassword,
  },
  {
    roleCode: "executive_manager",
    email: "demo.executive-manager@altheka.example",
    fullName: "المدير التنفيذي التجريبي",
    departmentCode: "executive",
    jobTitleCode: "executive_manager",
    password: staffPassword,
  },
];

const clientAccount = {
  email: process.env.DEMO_CLIENT_EMAIL || "demo.client@altheka.example",
  fullName: "العميل التجريبي",
  password: clientPassword,
};

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(targetEmail) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === targetEmail,
    );
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  return null;
}

async function ensureAuthUser(account, registrationKind) {
  let user = await findUserByEmail(account.email);
  const userMetadata = {
    registration_kind: registrationKind,
    full_name: account.fullName,
    demo_account: true,
    demo_seed_nonce: randomBytes(8).toString("hex"),
  };

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password: account.password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) throw error;
    user = data.user;
  }

  return user;
}

const [
  { data: roles, error: rolesError },
  { data: departments, error: departmentsError },
  { data: jobTitles, error: jobTitlesError },
  { data: categories, error: categoriesError },
] = await Promise.all([
  admin
    .from("roles")
    .select("id, code, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true),
  admin
    .from("departments")
    .select("id, code, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true),
  admin
    .from("job_titles")
    .select("id, code, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true),
  admin
    .from("litigation_case_categories")
    .select("id, code, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true),
]);

if (rolesError) throw rolesError;
if (departmentsError) throw departmentsError;
if (jobTitlesError) throw jobTitlesError;
if (categoriesError) throw categoriesError;

const roleByCode = new Map(roles.map((role) => [role.code, role]));
const departmentByCode = new Map(
  departments.map((department) => [department.code, department]),
);
const jobTitleByCode = new Map(
  jobTitles.map((jobTitle) => [jobTitle.code, jobTitle]),
);
const categoryByCode = new Map(
  categories.map((category) => [category.code, category]),
);

for (const account of staffAccounts) {
  if (!roleByCode.has(account.roleCode)) {
    throw new Error(`Missing role: ${account.roleCode}`);
  }
  if (!departmentByCode.has(account.departmentCode)) {
    throw new Error(`Missing department: ${account.departmentCode}`);
  }
  if (!jobTitleByCode.has(account.jobTitleCode)) {
    throw new Error(`Missing job title: ${account.jobTitleCode}`);
  }
  if (
    account.specialtyCode &&
    !categoryByCode.has(account.specialtyCode)
  ) {
    throw new Error(`Missing litigation category: ${account.specialtyCode}`);
  }
}

let demoSuperAdminId = null;
const seededStaff = [];

for (const account of staffAccounts) {
  const user = await ensureAuthUser(account, "staff");
  const role = roleByCode.get(account.roleCode);
  const department = departmentByCode.get(account.departmentCode);
  const jobTitle = jobTitleByCode.get(account.jobTitleCode);

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      organization_id: organizationId,
      full_name: account.fullName,
      account_kind: "staff",
      activation_status: "active_staff",
      department_id: department.id,
      job_title_id: jobTitle.id,
      is_active: true,
      approved_at: new Date().toISOString(),
      approved_by: demoSuperAdminId,
      archived_at: null,
      archived_by: null,
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
      retention_status: "retained",
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  if (account.roleCode === "super_admin") {
    demoSuperAdminId = user.id;
  }

  const { error: revokeError } = await admin
    .from("user_roles")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: demoSuperAdminId,
    })
    .eq("user_id", user.id)
    .neq("role_id", role.id)
    .is("revoked_at", null);
  if (revokeError) throw revokeError;

  const { error: roleError } = await admin.from("user_roles").upsert(
    {
      user_id: user.id,
      role_id: role.id,
      assigned_at: new Date().toISOString(),
      assigned_by: demoSuperAdminId,
      revoked_at: null,
      revoked_by: null,
    },
    { onConflict: "user_id,role_id" },
  );
  if (roleError) throw roleError;

  if (account.specialtyCode) {
    const category = categoryByCode.get(account.specialtyCode);
    const { error: revokeSpecialtiesError } = await admin
      .from("litigation_supervisor_specialties")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: demoSuperAdminId,
      })
      .eq("supervisor_id", user.id)
      .neq("category_id", category.id)
      .is("revoked_at", null);
    if (revokeSpecialtiesError) throw revokeSpecialtiesError;

    const { data: activeSpecialty, error: specialtyLookupError } = await admin
      .from("litigation_supervisor_specialties")
      .select("id")
      .eq("supervisor_id", user.id)
      .eq("category_id", category.id)
      .is("revoked_at", null)
      .maybeSingle();
    if (specialtyLookupError) throw specialtyLookupError;
    if (!activeSpecialty) {
      const { error: specialtyError } = await admin
        .from("litigation_supervisor_specialties")
        .insert({
          organization_id: organizationId,
          supervisor_id: user.id,
          category_id: category.id,
          assigned_by: demoSuperAdminId,
        });
      if (specialtyError) throw specialtyError;
    }
  }

  const { error: registrationError } = await admin
    .from("staff_registration_requests")
    .upsert(
      {
        organization_id: organizationId,
        profile_id: user.id,
        requested_department_text: department.name,
        requested_job_title_text: jobTitle.name,
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: demoSuperAdminId,
        review_notes: "Demo account seed",
      },
      { onConflict: "profile_id" },
    );
  if (registrationError) throw registrationError;

  seededStaff.push({
    userId: user.id,
    email: account.email,
    roleCode: account.roleCode,
  });
}

const clientUser = await ensureAuthUser(clientAccount, "client");
const { error: clientProfileError } = await admin.from("profiles").upsert(
  {
    id: clientUser.id,
    organization_id: organizationId,
    full_name: clientAccount.fullName,
    account_kind: "client",
    activation_status: "active_client",
    is_active: true,
    archived_at: null,
    archived_by: null,
    deleted_at: null,
    deleted_by: null,
    deletion_reason: null,
    retention_status: "retained",
  },
  { onConflict: "id" },
);
if (clientProfileError) throw clientProfileError;

const { data: linkedClientAccount, error: linkedClientError } = await admin
  .from("client_accounts")
  .select("client_id")
  .eq("profile_id", clientUser.id)
  .maybeSingle();
if (linkedClientError) throw linkedClientError;

if (!linkedClientAccount) {
  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({
      organization_id: organizationId,
      display_name: clientAccount.fullName,
      primary_contact_name: clientAccount.fullName,
      status: "active",
    })
    .select("id")
    .single();
  if (clientError) throw clientError;

  const { error: accountLinkError } = await admin
    .from("client_accounts")
    .insert({
      client_id: client.id,
      profile_id: clientUser.id,
      linked_by: demoSuperAdminId,
      is_primary: true,
    });
  if (accountLinkError) throw accountLinkError;
}

async function verifyAccount(account, expectedRoleCode, accountKind) {
  const client = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInError } =
    await client.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
  if (signInError) throw signInError;

  const [
    { data: profile, error: profileError },
    { data: permissions, error: permissionsError },
  ] = await Promise.all([
    client
      .from("profiles")
      .select("account_kind, activation_status")
      .eq("id", signIn.user.id)
      .single(),
    client.rpc("get_my_permissions"),
  ]);
  if (profileError) throw profileError;
  if (permissionsError) throw permissionsError;

  if (
    profile.account_kind !== accountKind ||
    !["active_staff", "active_client"].includes(profile.activation_status)
  ) {
    throw new Error(`Invalid profile state for ${account.email}`);
  }

  if (expectedRoleCode) {
    const { data: roleRows, error: roleError } = await client
      .from("user_roles")
      .select("roles(code)")
      .eq("user_id", signIn.user.id)
      .is("revoked_at", null);
    if (roleError) throw roleError;

    const activeCodes = roleRows.map((row) => row.roles?.code).filter(Boolean);
    if (
      activeCodes.length !== 1 ||
      activeCodes[0] !== expectedRoleCode
    ) {
      throw new Error(`Unexpected role assignment for ${account.email}`);
    }
  }

  await client.auth.signOut();
  return Array.isArray(permissions) ? permissions.length : 0;
}

const verification = [];
for (const account of staffAccounts) {
  verification.push({
    email: account.email,
    roleCode: account.roleCode,
    permissionCount: await verifyAccount(
      account,
      account.roleCode,
      "staff",
    ),
  });
}
verification.push({
  email: clientAccount.email,
  roleCode: "client",
  permissionCount: await verifyAccount(clientAccount, null, "client"),
});

console.log(
  JSON.stringify(
    {
      staffAccounts: seededStaff.length,
      clientAccounts: 1,
      verification,
    },
    null,
    2,
  ),
);
