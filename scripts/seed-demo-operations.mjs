import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const adminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD;
const demoClientEmail =
  process.env.DEMO_CLIENT_EMAIL?.trim().toLowerCase() ||
  "demo.client@altheka.example";
const demoClientPassword = process.env.DEMO_CLIENT_PASSWORD;

if (
  !url ||
  !serviceRoleKey ||
  !publishableKey ||
  !adminEmail ||
  !adminPassword ||
  !demoClientPassword
) {
  console.error(
    "Set Supabase keys, INITIAL_SUPER_ADMIN_EMAIL, INITIAL_SUPER_ADMIN_PASSWORD, and DEMO_CLIENT_PASSWORD.",
  );
  process.exit(1);
}

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const adminSession = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ids = {
  client: "10000000-0000-4000-8000-000000000001",
  litigationProject: "20000000-0000-4000-8000-000000000001",
  estateProject: "20000000-0000-4000-8000-000000000002",
  litigationCase: "30000000-0000-4000-8000-000000000001",
  nextAction: "31000000-0000-4000-8000-000000000001",
  hearing: "32000000-0000-4000-8000-000000000001",
  hearingPrep: "31000000-0000-4000-8000-000000000002",
  hearingReport: "31000000-0000-4000-8000-000000000003",
  heirOne: "40000000-0000-4000-8000-000000000001",
  heirTwo: "40000000-0000-4000-8000-000000000002",
  heirThree: "40000000-0000-4000-8000-000000000003",
  shareOne: "41000000-0000-4000-8000-000000000001",
  shareTwo: "41000000-0000-4000-8000-000000000002",
  shareThree: "41000000-0000-4000-8000-000000000003",
  assetOne: "50000000-0000-4000-8000-000000000001",
  assetTwo: "50000000-0000-4000-8000-000000000002",
  assetThree: "50000000-0000-4000-8000-000000000003",
  assetProjectOne: "51000000-0000-4000-8000-000000000001",
  assetProjectTwo: "51000000-0000-4000-8000-000000000002",
  assetProjectThree: "51000000-0000-4000-8000-000000000003",
  inventoryTeam: "60000000-0000-4000-8000-000000000001",
  preparationTeam: "60000000-0000-4000-8000-000000000002",
  litigationClientChannel: "70000000-0000-4000-8000-000000000001",
  litigationInternalChannel: "70000000-0000-4000-8000-000000000002",
  estateClientChannel: "70000000-0000-4000-8000-000000000003",
  estateInternalChannel: "70000000-0000-4000-8000-000000000004",
  litigationWelcome: "71000000-0000-4000-8000-000000000001",
  litigationUpdate: "71000000-0000-4000-8000-000000000002",
  estateWelcome: "71000000-0000-4000-8000-000000000003",
  estateUpdate: "71000000-0000-4000-8000-000000000004",
  document: "80000000-0000-4000-8000-000000000001",
  documentVersion: "81000000-0000-4000-8000-000000000001",
};

async function must(promise, label) {
  const result = await promise;
  if (result.error) {
    console.error(label, result.error);
    process.exit(1);
  }
  return result.data;
}

async function findAuthUser(email) {
  for (let page = 1; page <= 20; page += 1) {
    const data = await must(
      service.auth.admin.listUsers({ page, perPage: 100 }),
      "list auth users",
    );
    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email,
    );
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  return null;
}

const organization = await must(
  service.from("organizations").select("id").eq("slug", "legal-operations").single(),
  "organization",
);
const departments = await must(
  service
    .from("departments")
    .select("id, code")
    .eq("organization_id", organization.id)
    .in("code", ["litigation", "estates"]),
  "departments",
);
const litigationDepartment = departments.find(
  (department) => department.code === "litigation",
);
const estatesDepartment = departments.find(
  (department) => department.code === "estates",
);

const adminUser = await findAuthUser(adminEmail);
if (!adminUser) {
  console.error("The configured Super Admin user does not exist.");
  process.exit(1);
}

let demoClientUser = await findAuthUser(demoClientEmail);
if (!demoClientUser) {
  const created = await must(
    service.auth.admin.createUser({
      email: demoClientEmail,
      password: demoClientPassword,
      email_confirm: true,
      user_metadata: {
        registration_kind: "client",
        full_name: "شركة الرؤية للتطوير",
      },
    }),
    "create demo client",
  );
  demoClientUser = created.user;
} else {
  await must(
    service.auth.admin.updateUserById(demoClientUser.id, {
      password: demoClientPassword,
      email_confirm: true,
    }),
    "refresh demo client password",
  );
}

await must(
  service.from("profiles").upsert(
    {
      id: demoClientUser.id,
      organization_id: organization.id,
      full_name: "شركة الرؤية للتطوير",
      account_kind: "client",
      activation_status: "active_client",
      is_active: true,
      deleted_at: null,
    },
    { onConflict: "id" },
  ),
  "demo client profile",
);
await must(
  service.from("clients").upsert(
    {
      id: ids.client,
      organization_id: organization.id,
      display_name: "شركة الرؤية للتطوير",
      primary_contact_name: "أحمد الرؤية",
      primary_contact_phone: "0500000000",
      status: "active",
      archived_at: null,
    },
    { onConflict: "id" },
  ),
  "demo client record",
);
await must(
  service.from("client_accounts").upsert(
    {
      client_id: ids.client,
      profile_id: demoClientUser.id,
      linked_by: adminUser.id,
      is_primary: true,
    },
    { onConflict: "client_id,profile_id" },
  ),
  "demo client account",
);

await must(
  service.from("projects").upsert(
    [
      {
        id: ids.litigationProject,
        organization_id: organization.id,
        client_id: ids.client,
        name: "مطالبة عقد تطوير مشروع تجاري",
        project_type: "litigation",
        status: "active",
        client_stage_label: "التأسيس والتقييد",
        primary_client_contact_user_id: adminUser.id,
        department_id: litigationDepartment.id,
        project_manager_id: adminUser.id,
        primary_assignee_id: adminUser.id,
        project_number: "DEMO-LIT-2026-001",
        data_version: "v2",
        deleted_at: null,
      },
      {
        id: ids.estateProject,
        organization_id: organization.id,
        client_id: ids.client,
        name: "تصفية تركة عبدالله السالم",
        project_type: "estate",
        status: "active",
        client_stage_label: "الحصر والاستعلام",
        primary_client_contact_user_id: adminUser.id,
        department_id: estatesDepartment.id,
        project_manager_id: adminUser.id,
        primary_assignee_id: adminUser.id,
        project_number: "DEMO-EST-2026-001",
        data_version: "v2",
        deleted_at: null,
      },
    ],
    { onConflict: "id" },
  ),
  "demo projects",
);

await must(
  service.from("project_members").upsert(
    [
      {
        project_id: ids.litigationProject,
        user_id: adminUser.id,
        membership_role: "department_manager",
        can_contact_client: true,
        assigned_by: adminUser.id,
        left_at: null,
      },
      {
        project_id: ids.estateProject,
        user_id: adminUser.id,
        membership_role: "department_manager",
        can_contact_client: true,
        assigned_by: adminUser.id,
        left_at: null,
      },
    ],
    { onConflict: "project_id,user_id" },
  ),
  "demo project members",
);

await must(
  adminSession.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  }),
  "sign in as Super Admin",
);
const litigationWorkflow = await must(
  adminSession.rpc("start_project_operational_workflow", {
    p_project_id: ids.litigationProject,
  }),
  "start litigation workflow",
);
const estateWorkflow = await must(
  adminSession.rpc("start_project_operational_workflow", {
    p_project_id: ids.estateProject,
  }),
  "start estate workflow",
);

async function setWorkflowDemoProgress(
  workflowId,
  completedStageCode,
  activeStageCode,
  stageLabel,
) {
  const stages = await must(
    service
      .from("workflow_stage_instances")
      .select("id, workflow_stage_templates(code)")
      .eq("workflow_instance_id", workflowId),
    "workflow stages",
  );
  for (const stage of stages) {
    const template = Array.isArray(stage.workflow_stage_templates)
      ? stage.workflow_stage_templates[0]
      : stage.workflow_stage_templates;
    const code = template?.code;
    const isCompleted = code === completedStageCode;
    const isActive = code === activeStageCode;
    await must(
      service
        .from("workflow_stage_instances")
        .update({
          status: isCompleted ? "completed" : isActive ? "active" : "pending",
          started_at: isCompleted || isActive ? new Date().toISOString() : null,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .eq("id", stage.id),
      "workflow stage progress",
    );

    const actions = await must(
      service
        .from("workflow_action_instances")
        .select("id, workflow_action_templates(position)")
        .eq("workflow_stage_instance_id", stage.id),
      "workflow actions",
    );
    const sorted = [...actions].sort((left, right) => {
      const leftTemplate = Array.isArray(left.workflow_action_templates)
        ? left.workflow_action_templates[0]
        : left.workflow_action_templates;
      const rightTemplate = Array.isArray(right.workflow_action_templates)
        ? right.workflow_action_templates[0]
        : right.workflow_action_templates;
      return (leftTemplate?.position || 0) - (rightTemplate?.position || 0);
    });
    for (const [index, action] of sorted.entries()) {
      const status = isCompleted
        ? "completed"
        : isActive
          ? index < 2
            ? "completed"
            : index === 2
              ? "in_progress"
              : "blocked"
          : "blocked";
      await must(
        service
          .from("workflow_action_instances")
          .update({
            status,
            started_at: ["in_progress", "completed"].includes(status)
              ? new Date().toISOString()
              : null,
            completed_at: status === "completed" ? new Date().toISOString() : null,
          })
          .eq("id", action.id),
        "workflow action progress",
      );
    }
  }
  await must(
    service
      .from("projects")
      .update({ client_stage_label: stageLabel })
      .eq("id", workflowId === litigationWorkflow ? ids.litigationProject : ids.estateProject),
    "project stage label",
  );
}

await setWorkflowDemoProgress(
  litigationWorkflow,
  "congratulations",
  "foundation_registration",
  "التأسيس والتقييد",
);
await setWorkflowDemoProgress(
  estateWorkflow,
  "preliminary",
  "inventory",
  "الحصر والاستعلام",
);

const hearingAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
hearingAt.setHours(10, 30, 0, 0);
const nextActionDue = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
nextActionDue.setHours(14, 0, 0, 0);

await must(
  service.from("litigation_cases").upsert(
    {
      id: ids.litigationCase,
      organization_id: organization.id,
      project_id: ids.litigationProject,
      case_number: "4567891230",
      court_name: "المحكمة التجارية بالرياض",
      case_level: "first_instance",
      status: "draft",
      created_by: adminUser.id,
    },
    { onConflict: "id" },
  ),
  "demo litigation case",
);
await must(
  service.from("litigation_hearings").upsert(
    {
      id: ids.hearing,
      litigation_case_id: ids.litigationCase,
      hearing_at: hearingAt.toISOString(),
      notified_at: new Date().toISOString(),
      court_reference: "الدائرة التجارية الخامسة",
      status: "scheduled",
      created_by: adminUser.id,
    },
    { onConflict: "id" },
  ),
  "demo hearing",
);
await must(
  service.from("litigation_case_actions").upsert(
    [
      {
        id: ids.nextAction,
        litigation_case_id: ids.litigationCase,
        title: "استكمال مذكرة الرد وتدقيق المستندات",
        action_type: "prepare_response",
        due_at: nextActionDue.toISOString(),
        status: "in_progress",
        priority: "critical",
        assigned_to: adminUser.id,
        created_by: adminUser.id,
      },
      {
        id: ids.hearingPrep,
        litigation_case_id: ids.litigationCase,
        hearing_id: ids.hearing,
        title: "تحضير الجلسة ومراجعة ملف البينات",
        action_type: "hearing_preparation",
        due_at: new Date(hearingAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "planned",
        priority: "critical",
        assigned_to: adminUser.id,
        created_by: adminUser.id,
      },
      {
        id: ids.hearingReport,
        litigation_case_id: ids.litigationCase,
        hearing_id: ids.hearing,
        title: "إرسال تقرير الجلسة المعتمد للعميل",
        action_type: "client_hearing_report",
        due_at: hearingAt.toISOString(),
        status: "planned",
        priority: "critical",
        assigned_to: adminUser.id,
        created_by: adminUser.id,
      },
    ],
    { onConflict: "id" },
  ),
  "demo case actions",
);
await must(
  service
    .from("litigation_cases")
    .update({
      status: "active",
      current_next_action_id: ids.nextAction,
    })
    .eq("id", ids.litigationCase),
  "activate demo case",
);

await must(
  service.from("estate_details").upsert(
    {
      project_id: ids.estateProject,
      deceased_name: "عبدالله بن سالم السالم",
      estate_kind: "regular_estate",
      documents_completed_at: new Date(
        Date.now() - 40 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      agencies_issued_at: new Date(
        Date.now() - 35 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    },
    { onConflict: "project_id" },
  ),
  "demo estate details",
);
await must(
  service.from("estate_parties").upsert(
    [
      {
        id: ids.heirOne,
        organization_id: organization.id,
        estate_project_id: ids.estateProject,
        party_type: "heir",
        full_name: "سارة عبدالله السالم",
        national_id: "1000000001",
        phone: "0500000001",
        email: "sara@example.com",
        is_minor: false,
        created_by: adminUser.id,
      },
      {
        id: ids.heirTwo,
        organization_id: organization.id,
        estate_project_id: ids.estateProject,
        party_type: "heir",
        full_name: "خالد عبدالله السالم",
        national_id: "1000000002",
        phone: "0500000002",
        email: "khaled@example.com",
        is_minor: false,
        created_by: adminUser.id,
      },
      {
        id: ids.heirThree,
        organization_id: organization.id,
        estate_project_id: ids.estateProject,
        party_type: "heir",
        full_name: "ريم عبدالله السالم",
        national_id: "1000000003",
        phone: "0500000003",
        email: "reem@example.com",
        is_minor: true,
        created_by: adminUser.id,
      },
    ],
    { onConflict: "id" },
  ),
  "demo estate parties",
);
await must(
  service.from("estate_party_shares").upsert(
    [
      {
        id: ids.shareOne,
        estate_party_id: ids.heirOne,
        numerator: 1,
        denominator: 2,
        percentage: 50,
        created_by: adminUser.id,
      },
      {
        id: ids.shareTwo,
        estate_party_id: ids.heirTwo,
        numerator: 1,
        denominator: 4,
        percentage: 25,
        created_by: adminUser.id,
      },
      {
        id: ids.shareThree,
        estate_party_id: ids.heirThree,
        numerator: 1,
        denominator: 4,
        percentage: 25,
        created_by: adminUser.id,
      },
    ],
    { onConflict: "id" },
  ),
  "demo estate shares",
);

await must(
  service.from("estate_assets").upsert(
    [
      {
        id: ids.assetOne,
        project_id: ids.estateProject,
        asset_type: "real_estate",
        name: "عمارة حي الياسمين",
        description: "عقار استثماري مكون من 12 وحدة",
        current_stage: "marketing",
        status: "marketed",
        valuation_amount: 6800000,
        valuation_currency: "SAR",
        liquidation_status: "معتمد للتصفية",
        marketing_status: "استقبال العروض",
        asset_project_id: null,
      },
      {
        id: ids.assetTwo,
        project_id: ids.estateProject,
        asset_type: "investment_portfolio",
        name: "المحفظة الاستثمارية",
        description: "محفظة أسهم محلية وصناديق استثمارية",
        current_stage: "preparation",
        status: "active",
        valuation_amount: 1450000,
        valuation_currency: "SAR",
        liquidation_status: "بانتظار الاعتماد",
        asset_project_id: null,
      },
      {
        id: ids.assetThree,
        project_id: ids.estateProject,
        asset_type: "vehicle",
        name: "مركبتان",
        description: "مركبات مسجلة باسم المورث",
        current_stage: "inventory",
        status: "active",
        valuation_amount: 210000,
        valuation_currency: "SAR",
        asset_project_id: null,
      },
    ],
    { onConflict: "id" },
  ),
  "demo estate assets",
);
await must(
  service.from("projects").upsert(
    [
      {
        id: ids.assetProjectOne,
        organization_id: organization.id,
        client_id: ids.client,
        name: "تركة عبدالله السالم - عمارة حي الياسمين",
        project_type: "estate_asset",
        status: "active",
        client_stage_label: "التسويق",
        primary_client_contact_user_id: adminUser.id,
        department_id: estatesDepartment.id,
        parent_project_id: ids.estateProject,
        estate_asset_id: ids.assetOne,
        project_manager_id: adminUser.id,
        primary_assignee_id: adminUser.id,
        project_number: "DEMO-AST-2026-001",
        data_version: "v2",
      },
      {
        id: ids.assetProjectTwo,
        organization_id: organization.id,
        client_id: ids.client,
        name: "تركة عبدالله السالم - المحفظة الاستثمارية",
        project_type: "estate_asset",
        status: "active",
        client_stage_label: "التهيئة",
        primary_client_contact_user_id: adminUser.id,
        department_id: estatesDepartment.id,
        parent_project_id: ids.estateProject,
        estate_asset_id: ids.assetTwo,
        project_manager_id: adminUser.id,
        primary_assignee_id: adminUser.id,
        project_number: "DEMO-AST-2026-002",
        data_version: "v2",
      },
      {
        id: ids.assetProjectThree,
        organization_id: organization.id,
        client_id: ids.client,
        name: "تركة عبدالله السالم - المركبات",
        project_type: "estate_asset",
        status: "active",
        client_stage_label: "الحصر",
        primary_client_contact_user_id: adminUser.id,
        department_id: estatesDepartment.id,
        parent_project_id: ids.estateProject,
        estate_asset_id: ids.assetThree,
        project_manager_id: adminUser.id,
        primary_assignee_id: adminUser.id,
        project_number: "DEMO-AST-2026-003",
        data_version: "v2",
      },
    ],
    { onConflict: "id" },
  ),
  "demo asset projects",
);
await must(
  service
    .from("estate_assets")
    .update({ asset_project_id: ids.assetProjectOne })
    .eq("id", ids.assetOne),
  "link asset project one",
);
await must(
  service
    .from("estate_assets")
    .update({ asset_project_id: ids.assetProjectTwo })
    .eq("id", ids.assetTwo),
  "link asset project two",
);
await must(
  service
    .from("estate_assets")
    .update({ asset_project_id: ids.assetProjectThree })
    .eq("id", ids.assetThree),
  "link asset project three",
);

await must(
  service.from("project_teams").upsert(
    [
      {
        id: ids.inventoryTeam,
        organization_id: organization.id,
        project_id: ids.estateProject,
        code: "inventory",
        name: "فريق الحصر والاستعلام",
        leader_id: adminUser.id,
        status: "active",
        created_by: adminUser.id,
      },
      {
        id: ids.preparationTeam,
        organization_id: organization.id,
        project_id: ids.estateProject,
        code: "preparation",
        name: "فريق التهيئة",
        leader_id: adminUser.id,
        status: "active",
        created_by: adminUser.id,
      },
    ],
    { onConflict: "id" },
  ),
  "demo project teams",
);
await must(
  service.from("project_team_members").upsert(
    [
      {
        project_team_id: ids.inventoryTeam,
        user_id: adminUser.id,
        team_role: "leader",
        assigned_by: adminUser.id,
      },
      {
        project_team_id: ids.preparationTeam,
        user_id: adminUser.id,
        team_role: "leader",
        assigned_by: adminUser.id,
      },
    ],
    { onConflict: "project_team_id,user_id" },
  ),
  "demo team members",
);

const channels = [
  [ids.litigationClientChannel, ids.litigationProject, "client", "محادثة العميل"],
  [ids.litigationInternalChannel, ids.litigationProject, "internal", "فريق القضية"],
  [ids.estateClientChannel, ids.estateProject, "client", "محادثة عميل التركة"],
  [ids.estateInternalChannel, ids.estateProject, "internal", "فريق التركة"],
].map(([id, projectId, type, title]) => ({
  id,
  organization_id: organization.id,
  project_id: projectId,
  conversation_type: type,
  title,
  created_by: adminUser.id,
  archived_at: null,
}));
await must(
  service.from("conversations").upsert(channels, { onConflict: "id" }),
  "demo conversations",
);
await must(
  service.from("conversation_participants").upsert(
    [
      {
        conversation_id: ids.litigationClientChannel,
        user_id: adminUser.id,
        left_at: null,
      },
      {
        conversation_id: ids.litigationClientChannel,
        user_id: demoClientUser.id,
        left_at: null,
      },
      {
        conversation_id: ids.litigationInternalChannel,
        user_id: adminUser.id,
        left_at: null,
      },
      {
        conversation_id: ids.estateClientChannel,
        user_id: adminUser.id,
        left_at: null,
      },
      {
        conversation_id: ids.estateClientChannel,
        user_id: demoClientUser.id,
        left_at: null,
      },
      {
        conversation_id: ids.estateInternalChannel,
        user_id: adminUser.id,
        left_at: null,
      },
    ],
    { onConflict: "conversation_id,user_id" },
  ),
  "demo conversation participants",
);
await must(
  service.from("messages").upsert(
    [
      {
        id: ids.litigationWelcome,
        conversation_id: ids.litigationClientChannel,
        sender_id: adminUser.id,
        body: "مرحبًا بكم. تم بدء المشروع وتعيين المكلف المسؤول للتواصل معكم.",
        visibility: "client_visible",
      },
      {
        id: ids.litigationUpdate,
        conversation_id: ids.litigationInternalChannel,
        sender_id: adminUser.id,
        body: "اكتملت التهنئة وبدأت مرحلة التأسيس والتقييد. الإجراء القادم مثبت في ملف القضية.",
        visibility: "internal",
      },
      {
        id: ids.estateWelcome,
        conversation_id: ids.estateClientChannel,
        sender_id: adminUser.id,
        body: "تم اكتمال الحزمة التمهيدية، وبدأت أعمال الحصر والاستعلام للأصول بالتوازي.",
        visibility: "client_visible",
      },
      {
        id: ids.estateUpdate,
        conversation_id: ids.estateInternalChannel,
        sender_id: adminUser.id,
        body: "العقار في التسويق، والمحفظة في التهيئة، والمركبات ما زالت في الحصر.",
        visibility: "internal",
      },
    ],
    { onConflict: "id" },
  ),
  "demo messages",
);

const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const storagePath = "demo/litigation/project-start-summary.pdf";
await must(
  service.storage
    .from("legal-documents")
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true }),
  "demo document storage",
);
await must(
  service.from("documents").upsert(
    {
      id: ids.document,
      organization_id: organization.id,
      project_id: ids.litigationProject,
      client_id: ids.client,
      title: "ملخص بدء المشروع",
      document_type: "report",
      visibility: "internal",
      client_visibility_status: "draft",
      published_to_client_at: null,
      published_by: null,
      current_version_number: 1,
      created_by: adminUser.id,
      deleted_at: null,
    },
    { onConflict: "id" },
  ),
  "demo document",
);
await must(
  service.from("document_versions").upsert(
    {
      id: ids.documentVersion,
      document_id: ids.document,
      version_number: 1,
      storage_bucket: "legal-documents",
      storage_path: storagePath,
      file_name: "ملخص-بدء-المشروع.pdf",
      mime_type: "application/pdf",
      byte_size: pdf.length,
      sha256: createHash("sha256").update(pdf).digest("hex"),
      uploaded_by: adminUser.id,
      deleted_at: null,
    },
    { onConflict: "id" },
  ),
  "demo document version",
);
await must(
  service
    .from("documents")
    .update({
      visibility: "client_visible",
      client_visibility_status: "published",
      published_to_client_at: new Date().toISOString(),
      published_by: adminUser.id,
    })
    .eq("id", ids.document),
  "publish demo document",
);

console.log(
  JSON.stringify(
    {
      staffProject: ids.litigationProject,
      estateProject: ids.estateProject,
      clientEmail: demoClientEmail,
      message: "Demo operations data is ready.",
    },
    null,
    2,
  ),
);
