/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Download,
  FileText,
  FileChartColumn,
  Gavel,
  Landmark,
  MessageSquareText,
  WalletCards,
  UsersRound,
  Workflow,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  EstateApprovalRequestForm,
  EstateApprovalResponseForm,
  ProposedTaskForm,
  ProposedTaskReviewForm,
  WorkflowActionUpdateForm,
} from "@/components/operations/forms";
import {
  AttentionNoticeAcknowledgeForm,
  AttentionNoticeForm,
  CaseActionStatusForm,
  EstateAssetForm,
  EstateAssetUpdateForm,
  EstateBankAccountForm,
  EstateBankVerificationForm,
  EstateDecisionForm,
  EstateDetailsForm,
  EstateFinancialEntryForm,
  EstateFinancialReviewForm,
  EstateLitigationReferralForm,
  EstatePartyForm,
  EstateProjectMemberForm,
  EstateProjectMemberRemoveForm,
  EstateReportCreateForm,
  EstateReportTransitionForm,
  EstateShareForm,
  HearingForm,
  HearingOutcomeForm,
  LitigationActionResponseForm,
  LitigationActionReviewForm,
  LitigationCaseForm,
  LitigationStageRoutingForm,
  NextActionForm,
  ProjectDocumentForm,
  ProjectDocumentPublicationForm,
  ProjectAssistantForm,
  ProjectMessageForm,
  RemoveProjectAssistantForm,
  StartLitigationActionForm,
  StartWorkflowForm,
  WorkflowActionControl,
} from "@/components/projects/forms";
import { ProjectTeamsPanel } from "@/components/projects/teams-panel";
import { getAccessContext } from "@/lib/auth/access";
import {
  actionStatusTone,
  estateAssetTypeLabels,
  estatePartyTypeLabels,
  estateStageLabels,
  hearingStatusLabels,
  labelFor,
  projectStatusLabels,
  projectStatusTone,
  projectTypeLabels,
  workflowActionStatusLabels,
} from "@/lib/projects/labels";
import { createClient } from "@/lib/supabase/server";

type Profile = { id: string; full_name: string };
type ProjectMemberRow = {
  user_id: string;
  membership_role: string;
  can_contact_client: boolean;
  profiles: Profile | Profile[] | null;
};
type ProjectAssigneeRow = {
  user_id: string;
  assignment_kind: "primary" | "assistant";
  assigned_at: string;
  profiles: Profile | Profile[] | null;
};
type ProjectTeamMemberRow = {
  user_id: string;
  team_role: "leader" | "member" | "observer";
  joined_at: string;
  left_at: string | null;
  profiles: Profile | Profile[] | null;
};
type ProjectTeamRow = {
  id: string;
  code: string;
  name: string;
  leader_id: string | null;
  stage_instance_id: string | null;
  status: "planned" | "active" | "completed" | "cancelled";
  starts_at: string | null;
  ends_at: string | null;
  project_team_members: ProjectTeamMemberRow[] | ProjectTeamMemberRow | null;
};
type AttentionNoticeRow = {
  id: string;
  workflow_action_instance_id: string | null;
  litigation_action_id: string | null;
  target_user_id: string;
  issued_by: string;
  reason: string;
  status: "sent" | "acknowledged";
  acknowledged_at: string | null;
  response_text: string | null;
  created_at: string;
  target: Profile | Profile[] | null;
  issuer: Profile | Profile[] | null;
};
type StageRow = {
  id: string;
  status: string;
  target_due_at: string | null;
  maximum_due_at: string | null;
  workflow_stage_templates:
    | {
        code: string;
        name: string;
        position: number;
        stage_mode: string;
      }
    | {
        code: string;
        name: string;
        position: number;
        stage_mode: string;
      }[];
};
type ActionRow = {
  id: string;
  workflow_stage_instance_id: string;
  status: string;
  due_at: string | null;
  planned_duration: string | null;
  workflow_action_templates:
    | {
        code: string;
        name: string;
        position: number;
        priority: string;
        visibility: string;
        needs_operational_confirmation: boolean;
      }
    | {
        code: string;
        name: string;
        position: number;
        priority: string;
        visibility: string;
        needs_operational_confirmation: boolean;
      }[];
};
type LitigationSubmissionReviewRow = {
  id: string;
  decision: string;
  review_notes: string | null;
  reviewed_by: string;
  reviewed_at: string;
};
type LitigationSubmissionDocumentRow = {
  document_id: string;
  documents:
    | { id: string; title: string; client_visibility_status: string }
    | { id: string; title: string; client_visibility_status: string }[]
    | null;
};
type LitigationSubmissionRow = {
  id: string;
  litigation_action_id: string;
  version_number: number;
  result_summary: string;
  execution_notes: string | null;
  proposed_next_action_title: string;
  proposed_next_action_due_at: string | null;
  proposed_next_action_legal_due_date: string | null;
  proposed_next_action_priority: string;
  submitted_by: string;
  submitted_at: string;
  litigation_action_submission_reviews:
    | LitigationSubmissionReviewRow
    | LitigationSubmissionReviewRow[]
    | null;
  litigation_action_submission_documents:
    | LitigationSubmissionDocumentRow
    | LitigationSubmissionDocumentRow[]
    | null;
};

const dateTime = new Intl.DateTimeFormat("ar-SA", {
  dateStyle: "medium",
  timeStyle: "short",
});
const litigationActionStatusLabels: Record<string, string> = {
  planned: "بانتظار البدء",
  in_progress: "قيد التنفيذ",
  awaiting_approval: "بانتظار الاعتماد",
  returned_for_revision: "معاد للتعديل",
  completed: "مكتمل ومعتمد",
  cancelled: "ملغي",
  superseded: "مستبدل",
};
const estateDecisionTypeLabels: Record<string, string> = {
  consent: "موافقة",
  approval: "اعتماد",
  release: "مخالصة",
  objection: "اعتراض",
};
const estateDecisionStatusLabels: Record<string, string> = {
  pending: "بانتظار الرد",
  accepted: "مقبول",
  rejected: "مرفوض",
  withdrawn: "مسحوب",
};
const estateFinancialTypeLabels: Record<string, string> = {
  income: "إيراد",
  expense: "مصروف",
  reserve: "احتياطي",
  distribution: "توزيع",
  transfer: "تحويل",
};
const estateFinancialStatusLabels: Record<string, string> = {
  draft: "مسودة",
  submitted: "بانتظار الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
  reversed: "معكوس",
};
const estateReportStatusLabels: Record<string, string> = {
  draft: "مسودة",
  submitted: "قيد المراجعة",
  approved: "معتمد",
  published: "منشور للعميل",
  withdrawn: "مسحوب",
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function relationMany<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stageData(stage: StageRow) {
  return relationOne(stage.workflow_stage_templates);
}

function actionData(action: ActionRow) {
  return relationOne(action.workflow_action_templates);
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view = "overview" } = await searchParams;
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, organization_id, client_id, service_request_id, name, project_number, project_type, status, client_stage_label, project_manager_id, primary_assignee_id, parent_project_id, department_id, litigation_case_category_id, needs_category_review, created_at, updated_at, clients(display_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const [
    membersResult,
    workflowResult,
    caseResult,
    documentsResult,
    estateDetailsResult,
    estateAssetsResult,
    estatePartiesResult,
    teamsResult,
    conversationsResult,
    assigneesResult,
    attentionNoticesResult,
    estateBankAccountsResult,
    estateDecisionsResult,
    estateFinanceResult,
    estateReportScheduleResult,
    estateReportsResult,
    estateLitigationProjectsResult,
    staffDirectoryResult,
    litigationCategoriesResult,
  ] = await Promise.all([
    supabase
      .from("project_members")
      .select(
        "user_id, membership_role, can_contact_client, profiles!project_members_user_id_fkey(id, full_name)",
      )
      .eq("project_id", id)
      .is("left_at", null)
      .order("joined_at"),
    supabase
      .from("workflow_instances")
      .select("id, status, started_at, completed_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("litigation_cases")
      .select(
        "id, case_number, court_name, case_level, status, current_next_action_id",
      )
      .eq("project_id", id)
      .maybeSingle(),
    supabase
      .from("documents")
      .select(
        "id, title, document_type, visibility, client_visibility_status, current_version_number, created_at, document_versions(id, version_number, file_name, byte_size)",
      )
      .eq("project_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("estate_details").select("*").eq("project_id", id).maybeSingle(),
    supabase
      .from("estate_assets")
      .select(
        "id, asset_project_id, asset_type, name, description, current_stage, status, valuation_amount, valuation_currency, liquidation_status, marketing_status, updated_at",
      )
      .eq("project_id", id)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("estate_parties")
      .select(
        "id, party_type, full_name, national_id, phone, email, is_minor, status, estate_party_shares(id, numerator, denominator, percentage, effective_at, superseded_at)",
      )
      .eq("estate_project_id", id)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("project_teams")
      .select(
        "id, code, name, leader_id, stage_instance_id, status, starts_at, ends_at, project_team_members(user_id, team_role, joined_at, left_at, profiles!project_team_members_user_id_fkey(id, full_name))",
      )
      .eq("project_id", id)
      .order("created_at"),
    supabase
      .from("conversations")
      .select("id, conversation_type, title")
      .eq("project_id", id)
      .is("archived_at", null)
      .order("conversation_type"),
    supabase
      .from("project_assignees")
      .select(
        "user_id, assignment_kind, assigned_at, profiles!project_assignees_user_id_fkey(id, full_name)",
      )
      .eq("project_id", id)
      .is("ended_at", null)
      .order("assigned_at"),
    supabase
      .from("project_attention_notices")
      .select(
        "id, workflow_action_instance_id, litigation_action_id, target_user_id, issued_by, reason, status, acknowledged_at, response_text, created_at, target:profiles!project_attention_notices_target_user_id_fkey(id, full_name), issuer:profiles!project_attention_notices_issued_by_fkey(id, full_name)",
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    project.project_type === "estate"
      ? supabase
          .from("estate_party_bank_accounts")
          .select(
            "id, estate_party_id, iban, bank_name, is_verified, verified_at, estate_parties!inner(estate_project_id)",
          )
          .eq("estate_parties.estate_project_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    project.project_type === "estate"
      ? supabase
          .from("estate_party_decisions")
          .select(
            "id, estate_party_id, decision_type, subject_type, status, notes, recorded_at, estate_parties!inner(estate_project_id)",
          )
          .eq("estate_parties.estate_project_id", id)
          .order("recorded_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    project.project_type === "estate"
      ? supabase
          .from("estate_financial_entries")
          .select(
            "id, estate_asset_id, estate_party_id, entry_type, amount, currency, occurred_on, description, status, review_notes, created_at",
          )
          .eq("estate_project_id", id)
          .is("archived_at", null)
          .order("occurred_on", { ascending: false })
      : Promise.resolve({ data: [] }),
    project.project_type === "estate"
      ? supabase
          .from("recurring_report_schedules")
          .select(
            "id, interval_days, preparation_business_days, next_period_ends_on, status",
          )
          .eq("project_id", id)
          .eq("report_type", "estate_quarterly")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    project.project_type === "estate"
      ? supabase
          .from("project_reports")
          .select(
            "id, period_start, period_end, due_at, status, current_version_number, approved_at, published_at, project_report_versions(version_number, generated_data, human_notes, created_at)",
          )
          .eq("project_id", id)
          .order("period_end", { ascending: false })
      : Promise.resolve({ data: [] }),
    project.project_type === "estate"
      ? supabase
          .from("projects")
          .select("id, name, project_number, status, client_stage_label")
          .eq("parent_project_id", id)
          .eq("project_type", "estate_litigation")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    project.project_type === "estate"
      ? supabase
          .from("profiles")
          .select(
            "id, full_name, department:departments!profiles_department_id_fkey(name, code), user_roles!user_roles_user_id_fkey(revoked_at, role:roles!user_roles_role_id_fkey(code))",
          )
          .eq("account_kind", "staff")
          .eq("activation_status", "active_staff")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("full_name")
      : Promise.resolve({ data: [] }),
    project.project_type === "estate"
      ? supabase
          .from("litigation_case_categories")
          .select("id, name")
          .eq("is_active", true)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);

  const members = (membersResult.data ?? []) as unknown as ProjectMemberRow[];
  const memberDirectory = members.map((member) => {
    const profile = relationOne(member.profiles);
    return {
      id: member.user_id,
      name: profile?.full_name ?? "عضو فريق",
      membershipRole: member.membership_role,
      canContactClient: member.can_contact_client,
    };
  });
  const projectAssignees = (
    (assigneesResult.data ?? []) as unknown as ProjectAssigneeRow[]
  ).map((assignee) => ({
    id: assignee.user_id,
    name: relationOne(assignee.profiles)?.full_name ?? "موظف",
    kind: assignee.assignment_kind,
    assignedAt: assignee.assigned_at,
  }));
  const activeAssistantIds = new Set(
    projectAssignees
      .filter((assignee) => assignee.kind === "assistant")
      .map((assignee) => assignee.id),
  );
  const attentionNotices =
    (attentionNoticesResult.data ?? []) as unknown as AttentionNoticeRow[];
  const estateBankAccounts = (estateBankAccountsResult.data ?? []) as {
    id: string;
    estate_party_id: string;
    iban: string;
    bank_name: string | null;
    is_verified: boolean;
    verified_at: string | null;
  }[];
  const estateDecisions = (estateDecisionsResult.data ?? []) as {
    id: string;
    estate_party_id: string;
    decision_type: string;
    subject_type: string;
    status: string;
    notes: string | null;
    recorded_at: string;
  }[];
  const estateFinanceEntries = (estateFinanceResult.data ?? []) as {
    id: string;
    estate_asset_id: string | null;
    estate_party_id: string | null;
    entry_type: string;
    amount: number;
    currency: string;
    occurred_on: string;
    description: string;
    status: string;
    review_notes: string | null;
    created_at: string;
  }[];
  const estateReports = (estateReportsResult.data ?? []) as {
    id: string;
    period_start: string;
    period_end: string;
    due_at: string;
    status: string;
    current_version_number: number;
    approved_at: string | null;
    published_at: string | null;
    project_report_versions:
      | {
          version_number: number;
          generated_data: Record<string, unknown>;
          human_notes: string | null;
          created_at: string;
        }
      | {
          version_number: number;
          generated_data: Record<string, unknown>;
          human_notes: string | null;
          created_at: string;
        }[];
  }[];
  const staffDirectory = (staffDirectoryResult.data ?? []).map((employee) => {
    const department = relationOne(
      employee.department as
        | { name: string; code: string }
        | { name: string; code: string }[]
        | null,
    );
    const roleRows = employee.user_roles as unknown as {
      revoked_at: string | null;
      role: { code: string } | { code: string }[] | null;
    }[];
    const roleCodes = roleRows
      .filter((roleRow) => !roleRow.revoked_at)
      .map((roleRow) => relationOne(roleRow.role)?.code)
      .filter((code): code is string => Boolean(code));
    return {
      id: employee.id,
      name: employee.full_name,
      department: department?.name ?? null,
      departmentCode: department?.code ?? null,
      roleCodes,
    };
  });
  const litigationManagers = staffDirectory.filter((employee) =>
    employee.roleCodes.includes("litigation_manager"),
  );
  const litigationAssignees = staffDirectory.filter((employee) =>
    employee.roleCodes.some((roleCode) =>
      ["lawyer", "legal_specialist", "litigation_manager"].includes(roleCode),
    ),
  );
  const activeProjectMemberIds = new Set(
    memberDirectory.map((member) => member.id),
  );
  const availableEstateStaff = staffDirectory.filter(
    (employee) => !activeProjectMemberIds.has(employee.id),
  );

  const { data: eligibleStaffRows } = project.department_id
    ? await supabase
        .from("profiles")
        .select(
          "id, full_name, job_title:job_titles!profiles_job_title_id_fkey(name), user_roles!user_roles_user_id_fkey(revoked_at, role:roles!user_roles_role_id_fkey(code))",
        )
        .eq("account_kind", "staff")
        .eq("activation_status", "active_staff")
        .eq("is_active", true)
        .eq("department_id", project.department_id)
        .is("deleted_at", null)
        .order("full_name")
    : { data: [] };
  const eligibleStaff = (eligibleStaffRows ?? [])
    .filter((employee) => {
      const roleRows = employee.user_roles as unknown as {
        revoked_at: string | null;
        role: { code: string } | { code: string }[] | null;
      }[];
      return roleRows.some((roleRow) => {
        const role = relationOne(roleRow.role);
        return (
          !roleRow.revoked_at &&
          ["lawyer", "legal_specialist", "litigation_manager"].includes(
            role?.code ?? "",
          )
        );
      });
    })
    .filter(
      (employee) =>
        employee.id !== project.primary_assignee_id &&
        !activeAssistantIds.has(employee.id),
    )
    .map((employee) => ({
      id: employee.id,
      name: employee.full_name,
      jobTitle: relationOne(
        employee.job_title as
          | { name: string }
          | { name: string }[]
          | null,
      )?.name,
    }));
  const profileIds = [
    project.project_manager_id,
    project.primary_assignee_id,
  ].filter((value): value is string => Boolean(value));
  const { data: projectProfiles } = profileIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [] as Profile[] };
  const profileNames = new Map(
    (projectProfiles ?? []).map((profile) => [profile.id, profile.full_name]),
  );

  const workflow = workflowResult.data;
  let stages: StageRow[] = [];
  let actions: ActionRow[] = [];
  if (workflow) {
    const { data: stageRows } = await supabase
      .from("workflow_stage_instances")
      .select(
        "id, status, target_due_at, maximum_due_at, workflow_stage_templates(code, name, position, stage_mode)",
      )
      .eq("workflow_instance_id", workflow.id);
    stages = ((stageRows ?? []) as unknown as StageRow[]).sort(
      (a, b) => (stageData(a)?.position ?? 0) - (stageData(b)?.position ?? 0),
    );
    const stageIds = stages.map((stage) => stage.id);
    if (stageIds.length) {
      const { data: actionRows } = await supabase
        .from("workflow_action_instances")
        .select(
          "id, workflow_stage_instance_id, status, due_at, planned_duration, workflow_action_templates(code, name, position, priority, visibility, needs_operational_confirmation)",
        )
        .in("workflow_stage_instance_id", stageIds);
      actions = (actionRows ?? []) as unknown as ActionRow[];
    }
  }
  const workflowActionIds = actions.map((action) => action.id);
  const [
    workflowUpdatesResult,
    proposedWorkflowActionsResult,
    estateApprovalRequestsResult,
  ] = await Promise.all([
    workflowActionIds.length
      ? supabase
          .from("workflow_action_updates")
          .select(
            "id, workflow_action_instance_id, update_type, progress_percent, notes, requested_due_at, status, created_by, created_at",
          )
          .in("workflow_action_instance_id", workflowActionIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("proposed_workflow_actions")
      .select(
        "id, project_id, workflow_stage_instance_id, title, description, proposed_due_at, status, review_notes, created_at",
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    project.project_type === "estate"
      ? supabase
          .from("estate_party_approval_requests")
          .select(
            "id, estate_project_id, estate_asset_id, subject_type, title, description, due_at, status, created_at",
          )
          .eq("estate_project_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const estateApprovalRequestIds = (
    estateApprovalRequestsResult.data ?? []
  ).map((request) => request.id);
  const estateApprovalResponsesResult =
    estateApprovalRequestIds.length && project.project_type === "estate"
      ? await supabase
          .from("estate_party_approval_responses")
          .select(
            "id, approval_request_id, estate_party_id, decision, notes, evidence_document_id, responded_at",
          )
          .in("approval_request_id", estateApprovalRequestIds)
      : { data: [] };

  const litigationCase = caseResult.data;
  const [caseActionsResult, hearingsResult] = litigationCase
    ? await Promise.all([
        supabase
          .from("litigation_case_actions")
          .select(
            "id, title, action_type, due_at, legal_due_date, status, priority, assigned_to, hearing_id, started_at, submitted_at, submitted_by, approved_at, approved_by, returned_at, returned_by, return_reason, created_at",
          )
          .eq("litigation_case_id", litigationCase.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("litigation_hearings")
          .select(
            "id, hearing_at, notified_at, court_reference, status, outcome_summary, next_hearing_at, created_at",
          )
          .eq("litigation_case_id", litigationCase.id)
          .order("hearing_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const litigationActionIds = (caseActionsResult.data ?? []).map(
    (action) => action.id,
  );
  const [
    { data: litigationActionAssigneeRows },
    { data: workflowActionParticipantRows },
  ] = await Promise.all([
    litigationActionIds.length
      ? supabase
          .from("litigation_case_action_assignees")
          .select("litigation_action_id, user_id")
          .in("litigation_action_id", litigationActionIds)
          .is("ended_at", null)
      : Promise.resolve({ data: [] }),
    workflowActionIds.length
      ? supabase
          .from("workflow_action_participants")
          .select("workflow_action_instance_id, user_id")
          .in("workflow_action_instance_id", workflowActionIds)
          .eq("participant_type", "executor")
          .is("unassigned_at", null)
      : Promise.resolve({ data: [] }),
  ]);
  const assigneeDirectory = new Map(
    [...projectAssignees, ...memberDirectory].map((member) => [
      member.id,
      member.name,
    ]),
  );
  const litigationAssigneesByAction = new Map<string, string[]>();
  for (const row of litigationActionAssigneeRows ?? []) {
    const assignees =
      litigationAssigneesByAction.get(row.litigation_action_id) ?? [];
    assignees.push(row.user_id);
    litigationAssigneesByAction.set(row.litigation_action_id, assignees);
  }
  const workflowAssigneesByAction = new Map<string, string[]>();
  for (const row of workflowActionParticipantRows ?? []) {
    const assignees =
      workflowAssigneesByAction.get(row.workflow_action_instance_id) ?? [];
    assignees.push(row.user_id);
    workflowAssigneesByAction.set(row.workflow_action_instance_id, assignees);
  }
  const workflowUpdatesByAction = new Map<string, any[]>();
  for (const update of (workflowUpdatesResult.data ?? []) as any[]) {
    const updates = workflowUpdatesByAction.get(update.workflow_action_instance_id) ?? [];
    updates.push(update);
    workflowUpdatesByAction.set(update.workflow_action_instance_id, updates);
  }
  const proposedActions = (proposedWorkflowActionsResult.data ?? []) as any[];
  const estateApprovalRequests = (estateApprovalRequestsResult.data ?? []) as any[];
  const estateApprovalResponsesByRequest = new Map<string, any[]>();
  for (const response of (estateApprovalResponsesResult.data ?? []) as any[]) {
    const responses = estateApprovalResponsesByRequest.get(response.approval_request_id) ?? [];
    responses.push(response);
    estateApprovalResponsesByRequest.set(response.approval_request_id, responses);
  }
  const { data: litigationSubmissionData } = litigationActionIds.length
    ? await supabase
        .from("litigation_action_submissions")
        .select(
          "id, litigation_action_id, version_number, result_summary, execution_notes, proposed_next_action_title, proposed_next_action_due_at, proposed_next_action_legal_due_date, proposed_next_action_priority, submitted_by, submitted_at, litigation_action_submission_reviews(id, decision, review_notes, reviewed_by, reviewed_at), litigation_action_submission_documents(document_id, documents(id, title, client_visibility_status))",
        )
        .in("litigation_action_id", litigationActionIds)
        .order("version_number", { ascending: false })
    : { data: [] };
  const litigationSubmissions =
    (litigationSubmissionData ?? []) as unknown as LitigationSubmissionRow[];
  const latestSubmissionByAction = new Map<string, LitigationSubmissionRow>();
  for (const submission of litigationSubmissions) {
    if (!latestSubmissionByAction.has(submission.litigation_action_id)) {
      latestSubmissionByAction.set(submission.litigation_action_id, submission);
    }
  }

  const conversationIds = (conversationsResult.data ?? []).map(
    (conversation) => conversation.id,
  );
  const { data: messages } = conversationIds.length
    ? await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, body, visibility, edited_at, created_at, profiles!messages_sender_id_fkey(full_name)",
        )
        .in("conversation_id", conversationIds)
        .is("deleted_at", null)
        .is("hidden_at", null)
        .order("created_at", { ascending: false })
        .limit(40)
    : { data: [] };

  const clientRelation = project.clients as unknown as
    | { display_name: string }
    | { display_name: string }[]
    | null;
  const client = relationOne(clientRelation);
  const currentAction = (caseActionsResult.data ?? []).find(
    (action) => action.id === litigationCase?.current_next_action_id,
  );
  const currentSubmission = currentAction
    ? latestSubmissionByAction.get(currentAction.id) ?? null
    : null;
  const currentSubmissionReview = currentSubmission
    ? relationOne(currentSubmission.litigation_action_submission_reviews)
    : null;
  const currentSubmissionDocuments = currentSubmission
    ? relationMany(
        currentSubmission.litigation_action_submission_documents,
      )
    : [];
  const currentAssigneeName =
    memberDirectory.find((member) => member.id === currentAction?.assigned_to)
      ?.name ?? "غير مسند";
  const currentActionAssigneeIds = currentAction
    ? (litigationAssigneesByAction.get(currentAction.id) ?? [
        currentAction.assigned_to,
      ]).filter((value): value is string => Boolean(value))
    : [];
  const isCurrentActionAssignee = currentActionAssigneeIds.includes(
    access.userId,
  );
  const completedActions = actions.filter((action) =>
    ["approved", "completed"].includes(action.status),
  ).length;
  const progress = actions.length
    ? Math.round((completedActions / actions.length) * 100)
    : 0;
  const canStartWorkflow =
    access.permissions.includes("workflow.start") ||
    access.permissions.includes("system.override") ||
    project.project_manager_id === access.userId;
  const canManageCase = access.permissions.includes("litigation.manage_cases");
  const canSetNextAction = access.permissions.includes(
    "litigation.set_next_action",
  );
  const canRespondToLitigationAction = access.permissions.includes(
    "litigation.actions.respond",
  );
  const canApproveLitigationAction = access.permissions.includes(
    "litigation.actions.approve",
  );
  const canReturnLitigationAction = access.permissions.includes(
    "litigation.actions.return_for_revision",
  );
  const canManageHearings = access.permissions.includes(
    "litigation.manage_hearings",
  );
  const canManageEstate = access.permissions.includes("estates.manage");
  const canManageEstateParties = access.permissions.includes(
    "estates.manage_parties",
  );
  const canManageEstateAssets = access.permissions.includes(
    "estates.manage_assets",
  );
  const canManageTeams = access.permissions.includes("project_teams.manage");
  const canAssignTeams = access.permissions.includes("project_teams.assign");
  const canManageProjectMembers = access.permissions.includes(
    "projects.manage_members",
  );
  const canManageEstateReports = access.permissions.includes(
    "estates.manage_reports",
  );
  const canManageEstateFinance = access.permissions.includes("finance.manage");
  const canReviewEstateFinance =
    access.permissions.includes("estates.manage") ||
    access.permissions.includes("finance.approve_closure") ||
    access.permissions.includes("system.override");
  const canReadEstateFinance =
    access.permissions.includes("finance.read") ||
    access.permissions.includes("estates.manage") ||
    access.permissions.includes("system.override");
  const canAssignAssistants = access.permissions.includes(
    "projects.assign_assistants",
  );
  const canIssueAttentionNotice = access.permissions.includes(
    "supervision.issue_notice",
  );
  const canOperateWorkflow =
    access.permissions.includes("workflow.transition") ||
    access.permissions.includes("system.override") ||
    project.project_manager_id === access.userId;
  const canProposeTasks =
    access.permissions.includes("tasks.propose") ||
    access.permissions.includes("system.override");
  const canApproveProposedTasks =
    access.permissions.includes("tasks.approve_proposed") ||
    access.permissions.includes("system.override") ||
    project.project_manager_id === access.userId;
  const canManageEstateApprovals =
    access.permissions.includes("estate_approvals.manage") ||
    access.permissions.includes("system.override") ||
    project.project_manager_id === access.userId;
  const canUpload = access.permissions.includes("documents.upload");
  const canManagePublication =
    access.permissions.includes("documents.publish") ||
    access.permissions.includes("documents.withdraw");
  const canMessageClient = access.permissions.includes("messages.client");
  const canMessageInternal = access.permissions.includes("messages.internal");
  const isLitigation = ["litigation", "estate_litigation"].includes(
    project.project_type,
  );
  const isEstate = project.project_type === "estate";
  const estateAssetNames = new Map(
    (estateAssetsResult.data ?? []).map((asset) => [asset.id, asset.name]),
  );
  const estateAssetOptions = (estateAssetsResult.data ?? []).map((asset) => ({
    id: asset.id,
    name: asset.name,
  }));
  const documentOptions = (documentsResult.data ?? []).map((document) => ({
    id: document.id,
    name: document.title,
  }));
  const estatePartyNames = new Map(
    (estatePartiesResult.data ?? []).map((party) => [party.id, party.full_name]),
  );
  const approvedFinanceEntries = estateFinanceEntries.filter(
    (entry) => entry.status === "approved",
  );
  const financeTotals = {
    income: approvedFinanceEntries
      .filter((entry) => entry.entry_type === "income")
      .reduce((sum, entry) => sum + Number(entry.amount), 0),
    expense: approvedFinanceEntries
      .filter((entry) => entry.entry_type === "expense")
      .reduce((sum, entry) => sum + Number(entry.amount), 0),
    distribution: approvedFinanceEntries
      .filter((entry) => entry.entry_type === "distribution")
      .reduce((sum, entry) => sum + Number(entry.amount), 0),
  };
  const activeWorkflowStage = stages.find((stage) =>
    ["active", "overdue"].includes(stage.status),
  );
  const teamStageOptions = stages.map((stage) => ({
    id: stage.id,
    name: stageData(stage)?.name ?? "مرحلة Workflow",
  }));
  const projectTeams = (teamsResult.data ?? []) as unknown as ProjectTeamRow[];
  const teamPanelData = projectTeams.map((team) => ({
    id: team.id,
    code: team.code,
    name: team.name,
    leaderId: team.leader_id,
    stageInstanceId: team.stage_instance_id,
    status: team.status,
    startsAt: team.starts_at,
    endsAt: team.ends_at,
    members: relationMany(team.project_team_members)
      .filter((member) => !member.left_at)
      .map((member) => ({
        id: member.user_id,
        name: relationOne(member.profiles)?.full_name ?? "موظف",
        role: member.team_role,
      })),
  }));
  const activeWorkflowStageCode = activeWorkflowStage
    ? stageData(activeWorkflowStage)?.code
    : null;
  const firstInstanceCompleted = stages.some(
    (stage) =>
      stageData(stage)?.code === "first_instance" &&
      stage.status === "completed",
  );
  const canSelectLitigationPath =
    access.permissions.includes("system.override") ||
    access.permissions.includes("workflow.override_transition") ||
    project.project_manager_id === access.userId;
  const litigationRoutingOptions: {
    code: "appeal" | "enforcement" | "closing_collection";
    label: string;
  }[] = [];
  if (stages.some((stage) => stageData(stage)?.code === "appeal" && stage.status === "pending")) {
    litigationRoutingOptions.push({ code: "appeal", label: "بدء الاستئناف" });
  }
  if (
    stages.some(
      (stage) =>
        stageData(stage)?.code === "enforcement" && stage.status === "pending",
    )
  ) {
    litigationRoutingOptions.push({ code: "enforcement", label: "بدء التنفيذ" });
  }
  if (
    stages.some(
      (stage) =>
        stageData(stage)?.code === "closing_collection" &&
        stage.status === "pending",
    )
  ) {
    litigationRoutingOptions.push({
      code: "closing_collection",
      label: "بدء الإقفال والتحصيل",
    });
  }
  const showLitigationRouting =
    isLitigation &&
    workflow?.status === "active" &&
    firstInstanceCompleted &&
    canSelectLitigationPath &&
    litigationRoutingOptions.length > 0 &&
    (!activeWorkflowStage || activeWorkflowStageCode === "closing_collection");

  const tabs = [
    { code: "overview", label: "نظرة عامة", show: true },
    { code: "setup", label: "التأسيس والمسار", show: true },
    { code: "litigation", label: "المرافعة والجلسات", show: isLitigation },
    { code: "estate", label: "التركة والأصول", show: isEstate },
    {
      code: "estate-operations",
      label: "الموافقات والمالية",
      show: isEstate,
    },
    { code: "estate-reports", label: "التقارير", show: isEstate },
    { code: "teams", label: "فرق العمل", show: !isEstate },
    { code: "documents", label: "المستندات", show: true },
    { code: "messages", label: "المحادثات", show: true },
  ].filter((tab) => tab.show);

  return (
    <AppShell
      access={access}
      eyebrow={labelFor(projectTypeLabels, project.project_type)}
      title={project.name}
    >
      <Link
        href="/workspace/projects"
        className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-brand"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        جميع المشاريع
      </Link>

      <section className="border-y border-line bg-surface px-5 py-5">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm font-bold text-brand">
                {project.project_number ?? "دون رقم"}
              </span>
              <span
                className={`rounded-md border px-3 py-1 text-xs font-bold ${projectStatusTone(project.status)}`}
              >
                {labelFor(projectStatusLabels, project.status)}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted">
              العميل: <strong className="text-foreground">{client?.display_name}</strong>
              {" · "}
              مدير المشروع:{" "}
              <strong className="text-foreground">
                {profileNames.get(project.project_manager_id ?? "") ?? "غير محدد"}
              </strong>
              {" · "}
              المكلف الرئيسي:{" "}
              <strong className="text-foreground">
                {profileNames.get(project.primary_assignee_id ?? "") ?? "غير محدد"}
              </strong>
            </p>
          </div>
          <div className="min-w-56">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">تقدم خارطة السير</span>
              <strong className="tabular-nums">{progress}%</strong>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[#e7ebe8]">
              <div
                className="h-full bg-brand"
                style={{ width: `${Math.max(progress, workflow ? 4 : 0)}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-bold text-brand">
              {project.client_stage_label ?? "جاهز لبدء خارطة السير"}
            </p>
          </div>
        </div>
      </section>

      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="أقسام المشروع">
        {tabs.map((tab) => (
          <Link
            key={tab.code}
            href={`/workspace/projects/${project.id}?view=${tab.code}`}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm font-bold transition ${
              view === tab.code
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {view === "overview" ? (
        <div className="mt-6 space-y-7">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "المرحلة الحالية",
                value: project.client_stage_label ?? "لم تبدأ",
                icon: Workflow,
                tone: "bg-[#e5eee9] text-brand",
              },
              {
                label: "أعضاء الفريق",
                value: `${members.length}`,
                icon: UsersRound,
                tone: "bg-[#f5ecd6] text-[#825f17]",
              },
              {
                label: "المهام المفتوحة",
                value: `${actions.length - completedActions}`,
                icon: Clock3,
                tone: "bg-sky-50 text-sky-700",
              },
              {
                label: isLitigation ? "الجلسات المسجلة" : "أصول التركة",
                value: `${isLitigation ? (hearingsResult.data?.length ?? 0) : (estateAssetsResult.data?.length ?? 0)}`,
                icon: isLitigation ? Gavel : Landmark,
                tone: "bg-rose-50 text-rose-700",
              },
            ].map(({ label, value, icon: Icon, tone }) => (
              <article key={label} className="rounded-md border border-line bg-surface p-5">
                <span className={`grid size-10 place-items-center rounded-md ${tone}`}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-5 text-2xl font-bold">{value}</p>
                <p className="mt-1 text-sm text-muted">{label}</p>
              </article>
            ))}
          </section>

          {isLitigation ? (
            <section className="border-y border-line bg-surface px-5 py-5">
              <div>
                <div className="flex items-center gap-3">
                  <UsersRound className="size-5 text-gold" aria-hidden="true" />
                  <h2 className="font-bold">المكلفون بالقضية</h2>
                </div>
                <div className="mt-3 space-y-3">
                  {projectAssignees.length ? (
                    projectAssignees.map((assignee) => (
                      <div
                        key={assignee.id}
                        className="border-r-2 border-line pr-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold">{assignee.name}</p>
                          <span className="text-xs text-muted">
                            {assignee.kind === "primary"
                              ? "المكلف الرئيسي ومدير المشروع"
                              : "مكلف مساعد"}
                          </span>
                        </div>
                        {assignee.kind === "assistant" &&
                        canAssignAssistants ? (
                          <RemoveProjectAssistantForm
                            projectId={project.id}
                            userId={assignee.id}
                          />
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted">
                      لم يسجل مكلف للمشروع بعد.
                    </p>
                  )}
                </div>
                {canAssignAssistants && eligibleStaff.length ? (
                  <div className="mt-5 border-t border-line pt-5">
                    <ProjectAssistantForm
                      projectId={project.id}
                      staff={eligibleStaff}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {attentionNotices.length ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <BellRing className="size-5 text-amber-700" aria-hidden="true" />
                <h2 className="font-bold">سجل لفت النظر</h2>
              </div>
              <div className="divide-y divide-line">
                {attentionNotices.map((notice) => {
                  const target = relationOne(notice.target);
                  const issuer = relationOne(notice.issuer);
                  return (
                    <article key={notice.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{notice.reason}</p>
                          <p className="mt-1 text-xs text-muted">
                            من {issuer?.full_name ?? "المشرف"} إلى{" "}
                            {target?.full_name ?? "المكلف"} ·{" "}
                            {dateTime.format(new Date(notice.created_at))}
                          </p>
                          {notice.response_text ? (
                            <p className="mt-3 border-r-2 border-brand pr-3 text-sm">
                              {notice.response_text}
                            </p>
                          ) : null}
                        </div>
                        <span className="rounded-md border border-line px-3 py-1 text-xs font-bold">
                          {notice.status === "acknowledged"
                            ? "تم الاطلاع"
                            : "بانتظار الاطلاع"}
                        </span>
                      </div>
                      {notice.target_user_id === access.userId &&
                      notice.status === "sent" ? (
                        <AttentionNoticeAcknowledgeForm
                          projectId={project.id}
                          noticeId={notice.id}
                        />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {!workflow ? (
            <section className="flex flex-wrap items-center justify-between gap-4 border-y border-amber-200 bg-amber-50 px-5 py-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 text-amber-700" aria-hidden="true" />
                <div>
                  <h2 className="font-bold">خارطة السير لم تبدأ بعد</h2>
                  <p className="mt-1 text-sm text-amber-800">
                    سيُنشئ النظام مراحل المشروع وإجراءاته وأطرافه من القالب المنشور.
                  </p>
                </div>
              </div>
              {canStartWorkflow ? <StartWorkflowForm projectId={project.id} /> : null}
            </section>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <Workflow className="size-5 text-brand" aria-hidden="true" />
                <h2 className="font-bold">المراحل</h2>
              </div>
              <div className="divide-y divide-line">
                {stages.length ? (
                  stages.map((stage) => {
                    const data = stageData(stage);
                    const stageActions = actions.filter(
                      (action) => action.workflow_stage_instance_id === stage.id,
                    );
                    const done = stageActions.filter((action) =>
                      ["approved", "completed"].includes(action.status),
                    ).length;
                    return (
                      <div key={stage.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[2rem_1fr_auto] sm:items-center">
                        {stage.status === "completed" ? (
                          <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <CircleDot
                            className={`size-5 ${stage.status === "active" ? "text-brand" : "text-line"}`}
                            aria-hidden="true"
                          />
                        )}
                        <div>
                          <p className="font-bold">{data?.name}</p>
                          <p className="mt-1 text-xs text-muted">
                            {done} من {stageActions.length} إجراء مكتمل
                          </p>
                        </div>
                        <span className="text-xs font-bold text-muted">
                          {stage.status === "active"
                            ? "المرحلة الحالية"
                            : stage.status === "completed"
                              ? "مكتملة"
                              : stage.status === "skipped"
                                ? "لم يتطلبها المسار"
                                : "لاحقة"}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="px-5 py-8 text-sm text-muted">
                    شغّل خارطة السير لإنشاء المراحل.
                  </p>
                )}
              </div>
              {showLitigationRouting ? (
                <div className="border-t border-line bg-subtle px-5 py-5">
                  <h3 className="mb-4 font-bold">قرار المسار التالي</h3>
                  <LitigationStageRoutingForm
                    projectId={project.id}
                    options={litigationRoutingOptions}
                  />
                </div>
              ) : null}
            </section>

            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <ArrowRight className="size-5 rotate-180 text-gold" aria-hidden="true" />
                <h2 className="font-bold">الإجراء التالي</h2>
              </div>
              {currentAction ? (
                <div className="p-5">
                  <p className="font-bold">{currentAction.title}</p>
                  <p className="mt-2 text-sm text-muted">
                    {currentAction.due_at
                      ? dateTime.format(new Date(currentAction.due_at))
                      : currentAction.legal_due_date ?? "دون تاريخ"}
                  </p>
                  <span className="mt-4 inline-block rounded-md border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                    {currentAction.priority === "critical" ? "أولوية قصوى" : "أولوية عالية"}
                  </span>
                </div>
              ) : (
                <div className="p-5">
                  <p className="text-sm text-muted">
                    {isLitigation
                      ? "أنشئ بطاقة القضية وثبت الإجراء القادم."
                      : "يظهر هنا أقرب إجراء للمشروع."}
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {view === "setup" ? (
        <div className="mt-6 space-y-7">
          {!workflow ? (
            <section className="border-y border-amber-200 bg-amber-50 px-5 py-6">
              <h2 className="font-bold">ابدأ خارطة السير لعرض مهام التهنئة والتأسيس</h2>
              <p className="mt-2 text-sm text-amber-800">
                القالب المنشور يحفظ المهام والمدد والمسؤول والمتابع والمعتمد.
              </p>
              {canStartWorkflow ? (
                <div className="mt-4">
                  <StartWorkflowForm projectId={project.id} />
                </div>
              ) : null}
            </section>
          ) : (
            stages
              .map((stage) => {
                const data = stageData(stage);
                const stageActions = actions
                  .filter((action) => action.workflow_stage_instance_id === stage.id)
                  .sort(
                    (a, b) =>
                      (actionData(a)?.position ?? 0) -
                      (actionData(b)?.position ?? 0),
                  );
                return (
                  <section key={stage.id} className="rounded-md border border-line bg-surface">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                      <div>
                        <h2 className="font-bold">{data?.name}</h2>
                        <p className="mt-1 text-xs text-muted">
                          {data?.stage_mode === "parallel"
                            ? "إجراءات متوازية"
                            : "إجراءات مرتبة حسب الاعتماد"}
                        </p>
                      </div>
                      <span className={`rounded-md border px-3 py-1 text-xs font-bold ${
                        stage.status === "active"
                          ? "border-brand bg-[#e5eee9] text-brand"
                          : stage.status === "completed"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-line text-muted"
                      }`}>
                        {stage.status === "active"
                          ? "جارية"
                          : stage.status === "completed"
                            ? "مكتملة"
                            : stage.status === "skipped"
                              ? "لم يتطلبها المسار"
                              : "لاحقة"}
                      </span>
                    </div>
                    <div className="divide-y divide-line">
                      {stageActions.map((action) => {
                        const data = actionData(action);
                        const actionUpdates =
                          workflowUpdatesByAction.get(action.id) ?? [];
                        const latestUpdate = actionUpdates[0];
                        const latestProgress = actionUpdates.find(
                          (update) => update.progress_percent !== null,
                        )?.progress_percent;
                        return (
                          <article
                            key={action.id}
                            className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_12rem_auto] lg:items-center"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-bold">{data?.name}</h3>
                                {data?.needs_operational_confirmation ? (
                                  <span
                                    title="يظل قابلًا للضبط التشغيلي"
                                    className="rounded-sm bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800"
                                  >
                                    يحتاج تأكيدًا
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-muted">
                                {action.due_at
                                  ? `الاستحقاق ${dateTime.format(new Date(action.due_at))}`
                                  : "يبدأ موعده عند جاهزية الإجراء"}
                              </p>
                              <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                                <p>
                                  نسبة الإنجاز:{" "}
                                  <strong className="text-ink tabular-nums">
                                    {latestProgress ?? 0}%
                                  </strong>
                                </p>
                                <p>
                                  آخر تحديث:{" "}
                                  <strong className="text-ink">
                                    {latestUpdate
                                      ? dateTime.format(
                                          new Date(latestUpdate.created_at),
                                        )
                                      : "لا يوجد"}
                                  </strong>
                                </p>
                              </div>
                              {latestUpdate?.notes ? (
                                <p className="mt-2 rounded-md bg-[#f4f7f5] px-3 py-2 text-xs leading-6 text-muted">
                                  {latestUpdate.notes}
                                </p>
                              ) : null}
                            </div>
                            <span
                              className={`w-fit rounded-md border px-3 py-1.5 text-xs font-bold ${actionStatusTone(action.status)}`}
                            >
                              {labelFor(workflowActionStatusLabels, action.status)}
                            </span>
                            <div className="space-y-3">
                              {canOperateWorkflow ? (
                                <WorkflowActionControl
                                  projectId={project.id}
                                  actionId={action.id}
                                  status={action.status}
                                />
                              ) : null}
                              {!["approved", "completed", "cancelled"].includes(
                                action.status,
                              ) ? (
                                <details className="rounded-md border border-line bg-white p-3">
                                  <summary className="cursor-pointer text-xs font-bold text-brand">
                                    تحديث/تمديد
                                  </summary>
                                  <div className="mt-3">
                                    <WorkflowActionUpdateForm
                                      projectId={project.id}
                                      actionId={action.id}
                                    />
                                  </div>
                                </details>
                              ) : null}
                              {canIssueAttentionNotice &&
                              !["approved", "completed", "cancelled"].includes(
                                action.status,
                              ) ? (
                                <AttentionNoticeForm
                                  projectId={project.id}
                                  subjectType="workflow"
                                  subjectId={action.id}
                                  assignees={(
                                    workflowAssigneesByAction.get(action.id) ??
                                    []
                                  ).map((userId) => ({
                                    id: userId,
                                    name:
                                      assigneeDirectory.get(userId) ?? "مكلف",
                                  }))}
                                />
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })
          )}
          {workflow ? (
            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="rounded-md border border-line bg-surface">
                <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                  <BadgeCheck className="size-5 text-brand" aria-hidden="true" />
                  <h2 className="font-bold">المهام المقترحة</h2>
                </div>
                <div className="divide-y divide-line">
                  {proposedActions.length ? (
                    proposedActions.map((task) => (
                      <article key={task.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{task.title}</p>
                            <p className="mt-1 text-sm leading-7 text-muted">
                              {task.description ?? "لا يوجد وصف"}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {task.proposed_due_at
                                ? `استحقاق مقترح ${dateTime.format(new Date(task.proposed_due_at))}`
                                : "دون استحقاق مقترح"}
                            </p>
                          </div>
                          <span
                            className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
                              task.status === "pending"
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : task.status === "approved"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "border-line text-muted"
                            }`}
                          >
                            {task.status === "pending"
                              ? "بانتظار الاعتماد"
                              : task.status === "approved"
                                ? "معتمدة"
                                : task.status === "rejected"
                                  ? "مرفوضة"
                                  : "ملغية"}
                          </span>
                        </div>
                        {task.status === "pending" && canApproveProposedTasks ? (
                          <details className="mt-4 border-t border-line pt-4">
                            <summary className="cursor-pointer text-sm font-bold text-brand">
                              اعتماد أو رفض
                            </summary>
                            <div className="mt-4">
                              <ProposedTaskReviewForm
                                projectId={project.id}
                                proposedActionId={task.id}
                              />
                            </div>
                          </details>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <p className="px-5 py-5 text-sm text-muted">
                      لا توجد مهام مقترحة لهذا المشروع.
                    </p>
                  )}
                </div>
              </div>

              {canProposeTasks ? (
                <aside className="h-fit rounded-md border border-line bg-surface p-5">
                  <h2 className="mb-4 font-bold">اقتراح مهمة جديدة</h2>
                  <ProposedTaskForm projectId={project.id} stages={teamStageOptions} />
                </aside>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {view === "litigation" && isLitigation ? (
        <div className="mt-6 space-y-7">
          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Gavel className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">بطاقة القضية</h2>
            </div>
            <div className="p-5">
              {canManageCase ? (
                <LitigationCaseForm projectId={project.id} initial={litigationCase} />
              ) : litigationCase ? (
                <p className="text-sm">
                  {litigationCase.case_number} · {litigationCase.court_name}
                </p>
              ) : (
                <p className="text-sm text-muted">لم تنشأ بطاقة القضية بعد.</p>
              )}
            </div>
          </section>

          {litigationCase ? (
            <div className="grid gap-7 xl:grid-cols-2">
              <section className="rounded-md border border-line bg-surface">
                <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                  <ArrowRight className="size-5 rotate-180 text-gold" aria-hidden="true" />
                  <h2 className="font-bold">الإجراء القادم</h2>
                </div>
                <div className="p-5">
                  {currentAction ? (
                    <div className="space-y-5">
                      <div className="border-r-4 border-gold pr-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{currentAction.title}</p>
                            <p className="mt-1 text-sm text-muted">
                              {currentAction.due_at
                                ? dateTime.format(new Date(currentAction.due_at))
                                : currentAction.legal_due_date}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              المكلف: {currentAssigneeName}
                            </p>
                          </div>
                          <span className="rounded-md border border-line px-3 py-1 text-xs font-bold">
                            {litigationActionStatusLabels[currentAction.status] ??
                              currentAction.status}
                          </span>
                        </div>
                      </div>

                      {currentSubmission ? (
                        <div className="space-y-3 border-t border-line pt-5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-bold">
                              نتيجة التنفيذ، الإصدار {currentSubmission.version_number}
                            </p>
                            <span className="text-xs text-muted">
                              {dateTime.format(
                                new Date(currentSubmission.submitted_at),
                              )}
                            </span>
                          </div>
                          <p className="text-sm leading-7">
                            {currentSubmission.result_summary}
                          </p>
                          {currentSubmission.execution_notes ? (
                            <p className="text-sm leading-7 text-muted">
                              {currentSubmission.execution_notes}
                            </p>
                          ) : null}
                          <div className="border-r-2 border-brand pr-3 text-sm">
                            <p className="font-bold">الإجراء التالي المقترح</p>
                            <p className="mt-1">
                              {currentSubmission.proposed_next_action_title}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {currentSubmission.proposed_next_action_due_at
                                ? dateTime.format(
                                    new Date(
                                      currentSubmission.proposed_next_action_due_at,
                                    ),
                                  )
                                : currentSubmission.proposed_next_action_legal_due_date}
                            </p>
                          </div>
                          {currentSubmissionDocuments.length ? (
                            <div className="flex flex-wrap gap-2">
                              {currentSubmissionDocuments.map((link) => {
                                const document = relationOne(link.documents);
                                return document ? (
                                  <Link
                                    key={link.document_id}
                                    href={`/workspace/projects/${project.id}?view=documents`}
                                    className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs font-bold hover:border-brand"
                                  >
                                    <FileText
                                      className="size-4"
                                      aria-hidden="true"
                                    />
                                    {document.title}
                                  </Link>
                                ) : null;
                              })}
                            </div>
                          ) : null}
                          {currentSubmissionReview ? (
                            <p className="rounded-md border border-line bg-subtle px-3 py-2 text-sm">
                              {currentSubmissionReview.decision === "approved"
                                ? "اعتمدت النتيجة"
                                : `أعيدت للتعديل: ${currentSubmissionReview.review_notes ?? ""}`}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {canIssueAttentionNotice &&
                      !["completed", "cancelled", "superseded"].includes(
                        currentAction.status,
                      ) ? (
                        <div className="border-t border-line pt-5">
                          <AttentionNoticeForm
                            projectId={project.id}
                            subjectType="litigation"
                            subjectId={currentAction.id}
                            assignees={currentActionAssigneeIds.map(
                              (userId) => ({
                                id: userId,
                                name:
                                  assigneeDirectory.get(userId) ?? "مكلف",
                              }),
                            )}
                          />
                        </div>
                      ) : null}

                      {isCurrentActionAssignee &&
                      canRespondToLitigationAction &&
                      currentAction.status === "planned" ? (
                        <div className="border-t border-line pt-5">
                          <StartLitigationActionForm
                            projectId={project.id}
                            actionId={currentAction.id}
                          />
                        </div>
                      ) : null}

                      {isCurrentActionAssignee &&
                      canRespondToLitigationAction &&
                      ["in_progress", "returned_for_revision"].includes(
                        currentAction.status,
                      ) ? (
                        <div className="border-t border-line pt-5">
                          <LitigationActionResponseForm
                            projectId={project.id}
                            actionId={currentAction.id}
                            returnedReason={currentAction.return_reason}
                          />
                        </div>
                      ) : null}

                      {currentAction.status === "awaiting_approval" &&
                      currentSubmission &&
                      !currentSubmissionReview &&
                      currentSubmission.submitted_by !== access.userId &&
                      (canApproveLitigationAction ||
                        canReturnLitigationAction) ? (
                        <div className="border-t border-line pt-5">
                          <LitigationActionReviewForm
                            projectId={project.id}
                            submissionId={currentSubmission.id}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mb-5 text-sm font-bold text-red-700">
                      القضية لا تحتوي على إجراء قادم.
                    </p>
                  )}
                  {!currentAction && canSetNextAction ? (
                    <NextActionForm
                      projectId={project.id}
                      caseId={litigationCase.id}
                      members={memberDirectory}
                    />
                  ) : null}
                </div>
              </section>

              <section className="rounded-md border border-line bg-surface">
                <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                  <CalendarClock className="size-5 text-brand" aria-hidden="true" />
                  <h2 className="font-bold">إضافة جلسة</h2>
                </div>
                <div className="p-5">
                  {canManageHearings ? (
                    <HearingForm projectId={project.id} caseId={litigationCase.id} />
                  ) : (
                    <p className="text-sm text-muted">لا تملك صلاحية إضافة جلسة.</p>
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {litigationCase ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <Gavel className="size-5 text-brand" aria-hidden="true" />
                  <h2 className="font-bold">سجل الجلسات</h2>
                </div>
                <span className="text-xs text-muted">{hearingsResult.data?.length ?? 0} جلسة</span>
              </div>
              <div className="divide-y divide-line">
                {hearingsResult.data?.length ? (
                  hearingsResult.data.map((hearing) => (
                    <article key={hearing.id} className="px-5 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="font-bold">
                            {dateTime.format(new Date(hearing.hearing_at))}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {hearing.court_reference ?? litigationCase.court_name}
                          </p>
                          {hearing.outcome_summary ? (
                            <p className="mt-3 max-w-3xl text-sm leading-7">
                              {hearing.outcome_summary}
                            </p>
                          ) : null}
                        </div>
                        <span className="rounded-md border border-line px-3 py-1 text-xs font-bold">
                          {labelFor(hearingStatusLabels, hearing.status)}
                        </span>
                      </div>
                      {hearing.status === "scheduled" && canManageHearings ? (
                        <div className="mt-4">
                          <HearingOutcomeForm
                            projectId={project.id}
                            hearingId={hearing.id}
                          />
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="px-5 py-8 text-sm text-muted">لا توجد جلسات مسجلة.</p>
                )}
              </div>
            </section>
          ) : null}

          {litigationCase ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <BriefcaseBusiness className="size-5 text-gold" aria-hidden="true" />
                <h2 className="font-bold">ملف المتابعة</h2>
              </div>
              <div className="divide-y divide-line">
                {(caseActionsResult.data ?? []).map((action) => {
                  const submission = latestSubmissionByAction.get(action.id);
                  return (
                    <article
                      key={action.id}
                      className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-center"
                    >
                      <div>
                        <p className="text-sm font-bold">{action.title}</p>
                        <p className="mt-1 text-xs text-muted">
                          {action.due_at
                            ? dateTime.format(new Date(action.due_at))
                            : action.legal_due_date ?? "دون موعد"}
                        </p>
                        {submission ? (
                          <p className="mt-2 line-clamp-2 text-xs leading-6 text-muted">
                            {submission.result_summary}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-xs font-bold text-muted">
                        {litigationActionStatusLabels[action.status] ??
                          action.status}
                      </span>
                      {action.id !== litigationCase.current_next_action_id ? (
                        canManageCase ? (
                          <CaseActionStatusForm
                            projectId={project.id}
                            actionId={action.id}
                            status={action.status}
                          />
                        ) : null
                      ) : (
                        <span className="text-xs font-bold text-gold">
                          الإجراء الحالي
                        </span>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {view === "teams" && !isEstate ? (
        <div className="mt-6">
          <ProjectTeamsPanel
            projectId={project.id}
            teams={teamPanelData}
            projectMembers={memberDirectory}
            stages={teamStageOptions}
            canManage={canManageTeams}
            canAssign={canAssignTeams}
          />
        </div>
      ) : null}

      {view === "estate" && isEstate ? (
        <div className="mt-6 space-y-7">
          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Landmark className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">الملف الرئيسي للتركة</h2>
            </div>
            <div className="p-5">
              {canManageEstate ? (
                <EstateDetailsForm
                  projectId={project.id}
                  initial={estateDetailsResult.data}
                />
              ) : estateDetailsResult.data ? (
                <p className="text-sm">{estateDetailsResult.data.deceased_name}</p>
              ) : (
                <p className="text-sm text-muted">لم تسجل بيانات المورث بعد.</p>
              )}
            </div>
          </section>

          <div className="grid gap-7 xl:grid-cols-2">
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <UsersRound className="size-5 text-brand" aria-hidden="true" />
                  <h2 className="font-bold">الورثة وأصحاب العلاقة</h2>
                </div>
                <span className="text-xs text-muted">
                  {estatePartiesResult.data?.length ?? 0} طرف
                </span>
              </div>
              <div className="divide-y divide-line">
                {(estatePartiesResult.data ?? []).map((party) => {
                  const shares = (
                    party.estate_party_shares as unknown as {
                      id: string;
                      numerator: number;
                      denominator: number;
                      percentage: number | null;
                      superseded_at: string | null;
                    }[]
                  ).filter((share) => !share.superseded_at);
                  return (
                    <article key={party.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{party.full_name}</p>
                          <p className="mt-1 text-xs text-muted">
                            {labelFor(estatePartyTypeLabels, party.party_type)}
                            {party.is_minor ? " · قاصر" : ""}
                          </p>
                        </div>
                        {shares[0] ? (
                          <span className="font-mono text-sm font-bold text-brand">
                            {Number(shares[0].percentage).toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted">دون نصيب مسجل</span>
                        )}
                      </div>
                      {canManageEstateParties ? (
                        <div className="mt-4">
                          <EstateShareForm projectId={project.id} partyId={party.id} />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              {canManageEstateParties ? (
                <div className="border-t border-line p-5">
                  <h3 className="mb-4 text-sm font-bold">إضافة طرف</h3>
                  <EstatePartyForm projectId={project.id} />
                </div>
              ) : null}
            </section>

            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <BriefcaseBusiness className="size-5 text-gold" aria-hidden="true" />
                  <h2 className="font-bold">الأصول والمشاريع الفرعية</h2>
                </div>
                <span className="text-xs text-muted">
                  {estateAssetsResult.data?.length ?? 0} أصل
                </span>
              </div>
              <div className="divide-y divide-line">
                {(estateAssetsResult.data ?? []).map((asset) => (
                  <article key={asset.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{asset.name}</p>
                        <p className="mt-1 text-xs text-muted">
                          {labelFor(estateAssetTypeLabels, asset.asset_type)} ·{" "}
                          {labelFor(estateStageLabels, asset.current_stage)}
                        </p>
                      </div>
                      {asset.valuation_amount ? (
                        <span className="text-sm font-bold tabular-nums">
                          {new Intl.NumberFormat("ar-SA", {
                            style: "currency",
                            currency: asset.valuation_currency.trim(),
                            maximumFractionDigits: 0,
                          }).format(Number(asset.valuation_amount))}
                        </span>
                      ) : null}
                    </div>
                    {asset.asset_project_id ? (
                      <Link
                        href={`/workspace/projects/${asset.asset_project_id}`}
                        className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-brand"
                      >
                        فتح مشروع الأصل
                        <ArrowRight className="size-3 rotate-180" aria-hidden="true" />
                      </Link>
                    ) : null}
                    {canManageEstateAssets ? (
                      <EstateAssetUpdateForm projectId={project.id} asset={asset} />
                    ) : null}
                  </article>
                ))}
              </div>
              {canManageEstateAssets ? (
                <div className="border-t border-line p-5">
                  <h3 className="mb-4 text-sm font-bold">إضافة أصل</h3>
                  <EstateAssetForm projectId={project.id} />
                </div>
              ) : null}
            </section>
          </div>

          <ProjectTeamsPanel
            projectId={project.id}
            teams={teamPanelData}
            projectMembers={memberDirectory}
            stages={teamStageOptions}
            canManage={canManageTeams}
            canAssign={canAssignTeams}
          />
          <section className="rounded-md border border-line bg-surface">
            <div className="border-t border-line p-5">
              <h3 className="text-sm font-bold">أعضاء مشروع التركة</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {memberDirectory.map((member) => (
                  <article key={member.id} className="border-r-2 border-line pr-3">
                    <p className="text-sm font-bold">{member.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {member.membershipRole}
                      {member.canContactClient ? " · مصرح بالتواصل" : ""}
                    </p>
                    {canManageProjectMembers &&
                    ![project.project_manager_id, project.primary_assignee_id].includes(
                      member.id,
                    ) ? (
                      <EstateProjectMemberRemoveForm
                        projectId={project.id}
                        userId={member.id}
                      />
                    ) : null}
                  </article>
                ))}
              </div>
              {canManageProjectMembers && availableEstateStaff.length ? (
                <div className="mt-5 border-t border-line pt-5">
                  <EstateProjectMemberForm
                    projectId={project.id}
                    staff={availableEstateStaff}
                  />
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {view === "estate-operations" && isEstate ? (
        <div className="mt-6 space-y-7">
          {canReadEstateFinance ? (
            <section className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
              {[
                { label: "الإيرادات المعتمدة", value: financeTotals.income },
                { label: "المصروفات المعتمدة", value: financeTotals.expense },
                { label: "التوزيعات المعتمدة", value: financeTotals.distribution },
              ].map((item) => (
                <article key={item.label} className="bg-surface p-5">
                  <p className="text-xs text-muted">{item.label}</p>
                  <p className="mt-2 text-xl font-bold tabular-nums">
                    {new Intl.NumberFormat("ar-SA", {
                      style: "currency",
                      currency: "SAR",
                      maximumFractionDigits: 2,
                    }).format(item.value)}
                  </p>
                </article>
              ))}
            </section>
          ) : null}

          <section className="rounded-md border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <BadgeCheck className="size-5 text-brand" aria-hidden="true" />
                <h2 className="font-bold">طلبات موافقة الورثة</h2>
              </div>
              <span className="text-xs text-muted">
                {estateApprovalRequests.length} طلب
              </span>
            </div>
            <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="space-y-4">
                {estateApprovalRequests.length ? (
                  estateApprovalRequests.map((request) => {
                    const responses =
                      estateApprovalResponsesByRequest.get(request.id) ?? [];
                    const responseByParty = new Map(
                      responses.map((response) => [
                        response.estate_party_id,
                        response,
                      ]),
                    );
                    return (
                      <article
                        key={request.id}
                        className="rounded-md border border-line bg-white p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{request.title}</p>
                            <p className="mt-1 text-sm leading-7 text-muted">
                              {request.description ?? "لا يوجد وصف"} ·{" "}
                              {request.subject_type}
                              {request.estate_asset_id
                                ? ` · ${estateAssetNames.get(request.estate_asset_id) ?? "أصل"}`
                                : ""}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {request.due_at
                                ? `الاستحقاق ${dateTime.format(new Date(request.due_at))}`
                                : "دون تاريخ استحقاق"}
                            </p>
                          </div>
                          <span className="rounded-md border border-line bg-[#f7f8f7] px-3 py-1.5 text-xs font-bold text-muted">
                            {request.status === "open" ? "مفتوح" : request.status}
                          </span>
                        </div>

                        <div className="mt-4 divide-y divide-line rounded-md border border-line">
                          {(estatePartiesResult.data ?? []).map((party) => {
                            const response = responseByParty.get(party.id);
                            return (
                              <div key={party.id} className="px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-bold">
                                      {party.full_name}
                                    </p>
                                    <p className="mt-1 text-xs text-muted">
                                      {labelFor(
                                        estatePartyTypeLabels,
                                        party.party_type,
                                      )}
                                    </p>
                                  </div>
                                  <span
                                    className={`rounded-md border px-3 py-1 text-xs font-bold ${
                                      response?.decision === "approved"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                        : response?.decision === "rejected"
                                          ? "border-red-200 bg-red-50 text-red-800"
                                          : "border-amber-200 bg-amber-50 text-amber-800"
                                    }`}
                                  >
                                    {response?.decision === "approved"
                                      ? "وافق"
                                      : response?.decision === "rejected"
                                        ? "رفض"
                                        : "لم يرد"}
                                  </span>
                                </div>
                                {response?.notes ? (
                                  <p className="mt-2 text-xs leading-6 text-muted">
                                    {response.notes}
                                  </p>
                                ) : null}
                                {canManageEstateApprovals ? (
                                  <details className="mt-3">
                                    <summary className="cursor-pointer text-xs font-bold text-brand">
                                      تسجيل أو تعديل الرد
                                    </summary>
                                    <EstateApprovalResponseForm
                                      projectId={project.id}
                                      approvalRequestId={request.id}
                                      estatePartyId={party.id}
                                      documents={documentOptions}
                                    />
                                  </details>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-md border border-line bg-white px-5 py-8 text-sm text-muted">
                    لا توجد طلبات موافقة مستقلة مسجلة حتى الآن.
                  </p>
                )}
              </div>

              {canManageEstateApprovals ? (
                <aside className="h-fit rounded-md border border-line bg-white p-4">
                  <h3 className="mb-4 font-bold">إنشاء طلب موافقة</h3>
                  <EstateApprovalRequestForm
                    projectId={project.id}
                    assets={estateAssetOptions}
                  />
                </aside>
              ) : null}
            </div>
          </section>

          <div className="grid gap-7 xl:grid-cols-2">
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <WalletCards className="size-5 text-brand" aria-hidden="true" />
                <h2 className="font-bold">حسابات الورثة البنكية</h2>
              </div>
              <div className="divide-y divide-line">
                {(estatePartiesResult.data ?? []).map((party) => {
                  const accounts = estateBankAccounts.filter(
                    (account) => account.estate_party_id === party.id,
                  );
                  return (
                    <article key={party.id} className="px-5 py-4">
                      <p className="font-bold">{party.full_name}</p>
                      <div className="mt-3 space-y-3">
                        {accounts.length ? (
                          accounts.map((account) => (
                            <div key={account.id} className="border-r-2 border-line pr-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="font-mono text-sm" dir="ltr">
                                    {account.iban}
                                  </p>
                                  <p className="mt-1 text-xs text-muted">
                                    {account.bank_name ?? "البنك غير محدد"}
                                  </p>
                                </div>
                                <span
                                  className={`text-xs font-bold ${
                                    account.is_verified
                                      ? "text-emerald-700"
                                      : "text-amber-700"
                                  }`}
                                >
                                  {account.is_verified ? "متحقق" : "بانتظار التحقق"}
                                </span>
                              </div>
                              {canManageEstate ? (
                                <EstateBankVerificationForm
                                  projectId={project.id}
                                  accountId={account.id}
                                  verified={account.is_verified}
                                />
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted">لا يوجد حساب مسجل.</p>
                        )}
                      </div>
                      {canManageEstateParties ? (
                        <EstateBankAccountForm
                          projectId={project.id}
                          partyId={party.id}
                        />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <BadgeCheck className="size-5 text-gold" aria-hidden="true" />
                <h2 className="font-bold">الموافقات والمخالصات</h2>
              </div>
              <div className="divide-y divide-line">
                {(estatePartiesResult.data ?? []).map((party) => {
                  const decisions = estateDecisions.filter(
                    (decision) => decision.estate_party_id === party.id,
                  );
                  return (
                    <article key={party.id} className="px-5 py-4">
                      <p className="font-bold">{party.full_name}</p>
                      <div className="mt-3 space-y-2">
                        {decisions.length ? (
                          decisions.map((decision) => (
                            <div key={decision.id} className="border-r-2 border-line pr-3">
                              <p className="text-sm font-bold">
                                {labelFor(
                                  estateDecisionTypeLabels,
                                  decision.decision_type,
                                )}{" "}
                                · {decision.subject_type}
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                {labelFor(
                                  estateDecisionStatusLabels,
                                  decision.status,
                                )}
                                {decision.notes ? ` · ${decision.notes}` : ""}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted">لا توجد قرارات مسجلة.</p>
                        )}
                      </div>
                      {canManageEstateParties ? (
                        <EstateDecisionForm
                          projectId={project.id}
                          partyId={party.id}
                        />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          {canReadEstateFinance ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <WalletCards className="size-5 text-brand" aria-hidden="true" />
                  <h2 className="font-bold">المركز المالي للتركة</h2>
                </div>
                <span className="text-xs text-muted">
                  {estateFinanceEntries.length} قيد
                </span>
              </div>
              <div className="divide-y divide-line">
                {estateFinanceEntries.length ? (
                  estateFinanceEntries.map((entry) => (
                    <article key={entry.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold">
                            {labelFor(estateFinancialTypeLabels, entry.entry_type)} ·{" "}
                            {entry.description}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {entry.occurred_on}
                            {entry.estate_asset_id
                              ? ` · ${estateAssetNames.get(entry.estate_asset_id) ?? "أصل"}`
                              : ""}
                            {entry.estate_party_id
                              ? ` · ${estatePartyNames.get(entry.estate_party_id) ?? "طرف"}`
                              : ""}
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="font-bold tabular-nums">
                            {new Intl.NumberFormat("ar-SA", {
                              style: "currency",
                              currency: entry.currency.trim(),
                            }).format(Number(entry.amount))}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {labelFor(estateFinancialStatusLabels, entry.status)}
                          </p>
                        </div>
                      </div>
                      {entry.review_notes ? (
                        <p className="mt-3 text-xs text-muted">
                          ملاحظة المراجعة: {entry.review_notes}
                        </p>
                      ) : null}
                      {entry.status === "submitted" && canReviewEstateFinance ? (
                        <EstateFinancialReviewForm
                          projectId={project.id}
                          entryId={entry.id}
                        />
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="px-5 py-8 text-sm text-muted">
                    لم تسجل قيود مالية بعد.
                  </p>
                )}
              </div>
              {canManageEstateFinance ? (
                <div className="border-t border-line p-5">
                  <h3 className="mb-4 text-sm font-bold">إضافة قيد مالي</h3>
                  <EstateFinancialEntryForm
                    projectId={project.id}
                    assets={(estateAssetsResult.data ?? []).map((asset) => ({
                      id: asset.id,
                      name: asset.name,
                    }))}
                    parties={(estatePartiesResult.data ?? []).map((party) => ({
                      id: party.id,
                      name: party.full_name,
                    }))}
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Gavel className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">تقاضي التركة عند الحاجة</h2>
            </div>
            <div className="divide-y divide-line">
              {(estateLitigationProjectsResult.data ?? []).length ? (
                (estateLitigationProjectsResult.data ?? []).map((litigationProject) => (
                  <article
                    key={litigationProject.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div>
                      <p className="text-sm font-bold">{litigationProject.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {litigationProject.project_number} ·{" "}
                        {labelFor(projectStatusLabels, litigationProject.status)}
                      </p>
                    </div>
                    <Link
                      href={`/workspace/projects/${litigationProject.id}`}
                      className="text-xs font-bold text-brand"
                    >
                      فتح مشروع التقاضي
                    </Link>
                  </article>
                ))
              ) : (
                <p className="px-5 py-8 text-sm text-muted">
                  لا يوجد مسار تقاضٍ مرتبط بالتركة.
                </p>
              )}
            </div>
            {canManageEstate &&
            litigationCategoriesResult.data?.length &&
            litigationManagers.length &&
            litigationAssignees.length ? (
              <div className="border-t border-line p-5">
                <EstateLitigationReferralForm
                  projectId={project.id}
                  categories={litigationCategoriesResult.data}
                  managers={litigationManagers}
                  assignees={litigationAssignees}
                />
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {view === "estate-reports" && isEstate ? (
        <div className="mt-6 space-y-7">
          <section className="border-y border-line bg-surface px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted">دورة التقرير</p>
                <h2 className="mt-1 font-bold">تقرير موضوعي وإجرائي ومالي كل 90 يومًا</h2>
              </div>
              <div className="text-left text-xs text-muted">
                <p>
                  الفترة القادمة:{" "}
                  <strong className="text-foreground">
                    {estateReportScheduleResult.data?.next_period_ends_on ??
                      "تُحدد عند إنشاء أول تقرير"}
                  </strong>
                </p>
                <p className="mt-1">الإعداد خلال 15 يوم عمل</p>
              </div>
            </div>
          </section>

          {canManageEstateReports ? (
            <section className="rounded-md border border-line bg-surface p-5">
              <div className="mb-4 flex items-center gap-3">
                <FileChartColumn className="size-5 text-brand" aria-hidden="true" />
                <h2 className="font-bold">إنشاء تقرير دوري</h2>
              </div>
              <EstateReportCreateForm projectId={project.id} />
            </section>
          ) : null}

          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <FileChartColumn className="size-5 text-gold" aria-hidden="true" />
                <h2 className="font-bold">إصدارات التقارير</h2>
              </div>
              <span className="text-xs text-muted">{estateReports.length} تقرير</span>
            </div>
            <div className="divide-y divide-line">
              {estateReports.length ? (
                estateReports.map((report) => {
                  const versions = relationMany(report.project_report_versions);
                  const version =
                    versions.find(
                      (candidate) =>
                        candidate.version_number === report.current_version_number,
                    ) ?? versions.at(-1);
                  const generated = version?.generated_data as
                    | {
                        parties?: { total?: number; heirs?: number; minors?: number };
                        assets?: {
                          total?: number;
                          active?: number;
                          sold?: number;
                          distributed?: number;
                        };
                        workflow?: {
                          completed_actions?: number;
                          open_actions?: number;
                          overdue_actions?: number;
                        };
                      }
                    | undefined;
                  const canTransition =
                    (report.status === "draft" && canManageEstateReports) ||
                    (report.status === "submitted" &&
                      (canManageEstate || access.permissions.includes("system.override"))) ||
                    (report.status === "approved" &&
                      access.permissions.includes("documents.publish")) ||
                    (report.status === "published" &&
                      access.permissions.includes("documents.withdraw"));
                  return (
                    <article key={report.id} className="px-5 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="font-bold">
                            {report.period_start} إلى {report.period_end}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            نسخة {report.current_version_number} ·{" "}
                            {labelFor(estateReportStatusLabels, report.status)}
                          </p>
                        </div>
                        <span className="text-xs text-muted">
                          الاستحقاق {dateTime.format(new Date(report.due_at))}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                        <p>
                          الأطراف: <strong>{generated?.parties?.total ?? 0}</strong>
                        </p>
                        <p>
                          الأصول: <strong>{generated?.assets?.total ?? 0}</strong>
                        </p>
                        <p>
                          الإجراءات المفتوحة:{" "}
                          <strong>{generated?.workflow?.open_actions ?? 0}</strong>
                        </p>
                      </div>
                      {version?.human_notes ? (
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted">
                          {version.human_notes}
                        </p>
                      ) : null}
                      {canTransition ? (
                        <EstateReportTransitionForm
                          projectId={project.id}
                          reportId={report.id}
                          status={report.status}
                        />
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className="px-5 py-10 text-center text-sm text-muted">
                  لم يُنشأ تقرير دوري بعد.
                </p>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {view === "documents" ? (
        <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <FileText className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">مستندات المشروع</h2>
            </div>
            <div className="divide-y divide-line">
              {(documentsResult.data ?? []).length ? (
                (documentsResult.data ?? []).map((document) => {
                  const versions = document.document_versions as unknown as {
                    id: string;
                    version_number: number;
                    file_name: string;
                    byte_size: number;
                  }[];
                  const version = versions.find(
                    (item) => item.version_number === document.current_version_number,
                  );
                  return (
                    <article key={document.id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{document.title}</p>
                        <p className="mt-1 truncate text-xs text-muted">
                          {version?.file_name} · نسخة {document.current_version_number}
                        </p>
                        {canManagePublication ? (
                          <ProjectDocumentPublicationForm
                            projectId={project.id}
                            documentId={document.id}
                            currentStatus={document.client_visibility_status}
                            currentVisibility={document.visibility}
                          />
                        ) : null}
                      </div>
                      <a
                        href={`/documents/${document.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        title="تنزيل المستند"
                        className="grid size-10 shrink-0 place-items-center rounded-md border border-line text-brand hover:border-brand"
                      >
                        <Download className="size-4" aria-hidden="true" />
                        <span className="sr-only">تنزيل</span>
                      </a>
                    </article>
                  );
                })
              ) : (
                <p className="px-5 py-10 text-center text-sm text-muted">
                  لم ترفع مستندات للمشروع بعد.
                </p>
              )}
            </div>
          </section>
          {canUpload ? (
            <aside className="rounded-md border border-line bg-surface">
              <div className="border-b border-line px-5 py-4">
                <h2 className="font-bold">رفع مستند</h2>
              </div>
              <div className="p-5">
                <ProjectDocumentForm projectId={project.id} />
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}

      {view === "messages" ? (
        <div className="mt-6 grid gap-7 xl:grid-cols-2">
          {(conversationsResult.data ?? []).map((conversation) => {
            const channelMessages = (messages ?? []).filter(
              (message) => message.conversation_id === conversation.id,
            );
            const canSend =
              conversation.conversation_type === "client"
                ? canMessageClient
                : canMessageInternal;
            return (
              <section key={conversation.id} className="rounded-md border border-line bg-surface">
                <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="flex items-center gap-3">
                    <MessageSquareText
                      className={`size-5 ${conversation.conversation_type === "client" ? "text-brand" : "text-gold"}`}
                      aria-hidden="true"
                    />
                    <div>
                      <h2 className="font-bold">{conversation.title}</h2>
                      <p className="mt-1 text-xs text-muted">
                        {conversation.conversation_type === "client"
                          ? "قناة العميل"
                          : "قناة داخلية"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted">{channelMessages.length} رسالة</span>
                </div>
                <div className="max-h-[28rem] space-y-3 overflow-y-auto bg-[#fafbfa] p-5">
                  {channelMessages.length ? (
                    [...channelMessages].reverse().map((message) => {
                      const sender = relationOne(
                        message.profiles as unknown as
                          | { full_name: string }
                          | { full_name: string }[],
                      );
                      return (
                        <article
                          key={message.id}
                          className="max-w-[88%] rounded-md border border-line bg-white px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-xs font-bold text-brand">
                              {sender?.full_name ?? "مستخدم"}
                            </p>
                            <time className="text-[10px] text-muted">
                              {dateTime.format(new Date(message.created_at))}
                            </time>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                            {message.body}
                          </p>
                        </article>
                      );
                    })
                  ) : (
                    <p className="py-8 text-center text-sm text-muted">لا توجد رسائل.</p>
                  )}
                </div>
                {canSend ? (
                  <div className="border-t border-line p-5">
                    <ProjectMessageForm
                      projectId={project.id}
                      conversationId={conversation.id}
                    />
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </AppShell>
  );
}
