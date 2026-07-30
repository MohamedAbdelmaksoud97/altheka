import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Download,
  FileText,
  Gavel,
  Landmark,
  MessageSquareText,
  UsersRound,
  Workflow,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  CaseActionStatusForm,
  EstateAssetForm,
  EstateAssetUpdateForm,
  EstateDetailsForm,
  EstatePartyForm,
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
  ProjectMessageForm,
  ProjectTeamForm,
  StartLitigationActionForm,
  StartWorkflowForm,
  WorkflowActionControl,
} from "@/components/projects/forms";
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
      "id, organization_id, client_id, service_request_id, name, project_number, project_type, status, client_stage_label, project_manager_id, primary_assignee_id, parent_project_id, created_at, updated_at, clients(display_name)",
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
      .select("id, code, name, leader_id, status, project_team_members(user_id, team_role)")
      .eq("project_id", id)
      .order("created_at"),
    supabase
      .from("conversations")
      .select("id, conversation_type, title")
      .eq("project_id", id)
      .is("archived_at", null)
      .order("conversation_type"),
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
  const activeWorkflowStage = stages.find((stage) =>
    ["active", "overdue"].includes(stage.status),
  );
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
                            </div>
                            <span
                              className={`w-fit rounded-md border px-3 py-1.5 text-xs font-bold ${actionStatusTone(action.status)}`}
                            >
                              {labelFor(workflowActionStatusLabels, action.status)}
                            </span>
                            <WorkflowActionControl
                              projectId={project.id}
                              actionId={action.id}
                              status={action.status}
                            />
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })
          )}
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

                      {currentAction.assigned_to === access.userId &&
                      canRespondToLitigationAction &&
                      currentAction.status === "planned" ? (
                        <div className="border-t border-line pt-5">
                          <StartLitigationActionForm
                            projectId={project.id}
                            actionId={currentAction.id}
                          />
                        </div>
                      ) : null}

                      {currentAction.assigned_to === access.userId &&
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

          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <UsersRound className="size-5 text-brand" aria-hidden="true" />
                <h2 className="font-bold">فرق العمل</h2>
              </div>
              <span className="text-xs text-muted">{teamsResult.data?.length ?? 0} فريق</span>
            </div>
            <div className="grid gap-px bg-line sm:grid-cols-2">
              {(teamsResult.data ?? []).map((team) => (
                <article key={team.id} className="bg-surface p-5">
                  <p className="font-bold">{team.name}</p>
                  <p className="mt-1 text-xs text-muted">{team.code}</p>
                  <p className="mt-4 text-sm">
                    {(team.project_team_members as unknown as unknown[])?.length ?? 0} عضو
                  </p>
                </article>
              ))}
            </div>
            {canManageTeams ? (
              <div className="border-t border-line p-5">
                <ProjectTeamForm projectId={project.id} members={memberDirectory} />
              </div>
            ) : null}
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
