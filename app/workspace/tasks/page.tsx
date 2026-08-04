/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Hourglass,
  PenLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  ProposedTaskForm,
  ProposedTaskReviewForm,
  WorkflowActionUpdateForm,
} from "@/components/operations/forms";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type Filter = "mine" | "overdue" | "awaiting-approval" | "proposed" | "completed";
type Option = { id: string; name: string };

const filterTabs: { key: Filter; label: string; icon: LucideIcon }[] = [
  { key: "mine", label: "مهامي", icon: ClipboardList },
  { key: "overdue", label: "المتأخر", icon: AlertTriangle },
  { key: "awaiting-approval", label: "بانتظار اعتمادي", icon: BadgeCheck },
  { key: "proposed", label: "مهام مقترحة", icon: PenLine },
  { key: "completed", label: "مكتمل", icon: CheckCircle2 },
];

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatDate(value?: string | null) {
  if (!value) return "دون موعد";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    awaiting_assignment: "بانتظار التكليف",
    blocked: "متوقف",
    ready: "جاهز",
    in_progress: "قيد التنفيذ",
    awaiting_approval: "بانتظار اعتماد",
    returned: "معاد",
    completed: "مكتمل",
    cancelled: "ملغي",
    planned: "مخطط",
    pending: "بانتظار الاعتماد",
    approved: "معتمد",
    rejected: "مرفوض",
  };
  return labels[status ?? ""] ?? status ?? "غير محدد";
}

function isOpen(status?: string | null) {
  return !["completed", "cancelled", "rejected", "superseded"].includes(
    status ?? "",
  );
}

function isOverdue(dueAt?: string | null) {
  return Boolean(dueAt && new Date(dueAt).getTime() < Date.now());
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const { filter = "mine" } = await searchParams;
  const activeFilter = filterTabs.some((tab) => tab.key === filter)
    ? filter
    : "mine";
  const supabase = await createClient();

  const [
    workflowResult,
    litigationResult,
    proposedResult,
    stagesResult,
    projectsResult,
  ] = await Promise.all([
    supabase
      .from("workflow_action_instances")
      .select(
        `
        id,status,due_at,updated_at,
        workflow_action_templates(name,code,priority),
        workflow_stage_instances(
          id,
          workflow_stage_templates(name),
          workflow_instances(
            project_id,
            projects(id,name,project_number,clients(display_name))
          )
        ),
        workflow_action_participants(participant_type,user_id,unassigned_at,profiles(full_name)),
        workflow_action_updates(update_type,progress_percent,notes,requested_due_at,status,created_at)
      `,
      )
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(120),
    supabase
      .from("litigation_case_actions")
      .select(
        `
        id,title,status,due_at,legal_due_date,priority,updated_at,assigned_to,
        litigation_cases(projects(id,name,project_number,clients(display_name))),
        litigation_case_action_assignees(user_id,ended_at,profiles(full_name))
      `,
      )
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(120),
    supabase
      .from("proposed_workflow_actions")
      .select(
        `
        id,project_id,workflow_stage_instance_id,title,description,proposed_due_at,status,created_at,review_notes,
        projects(id,name,project_number,clients(display_name)),
        workflow_stage_instances(workflow_stage_templates(name))
      `,
      )
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("workflow_stage_instances")
      .select("id,workflow_stage_templates(name)")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("projects")
      .select("id,name,project_number")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(80),
  ]);

  const workflowTasks = ((workflowResult.data ?? []) as any[]).map((task) => {
    const stage = relationOne(task.workflow_stage_instances);
    const workflow = relationOne(stage?.workflow_instances);
    const project = relationOne(workflow?.projects);
    const client = relationOne(project?.clients);
    const template = relationOne(task.workflow_action_templates);
    const participants = ((task.workflow_action_participants ?? []) as any[]).filter(
      (participant) => !participant.unassigned_at,
    );
    const latestUpdate = [...((task.workflow_action_updates ?? []) as any[])].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
    const mine = participants.some(
      (participant) => participant.user_id === access.userId,
    );
    const approver = participants.some(
      (participant) =>
        participant.user_id === access.userId &&
        participant.participant_type === "approver",
    );

    return {
      id: task.id as string,
      kind: "workflow" as const,
      title: template?.name ?? "إجراء تشغيل",
      projectId: project?.id as string | undefined,
      projectName: project?.name ?? "مشروع غير محدد",
      projectNumber: project?.project_number,
      clientName: client?.display_name ?? "عميل غير محدد",
      stageName:
        relationOne(stage?.workflow_stage_templates)?.name ?? "مرحلة غير محددة",
      dueAt: task.due_at as string | null,
      status: task.status as string,
      assignees: participants
        .map((participant) => relationOne(participant.profiles)?.full_name)
        .filter(Boolean),
      latestUpdate,
      progress:
        latestUpdate?.progress_percent ??
        [...((task.workflow_action_updates ?? []) as any[])]
          .reverse()
          .find((update) => update.progress_percent !== null)?.progress_percent,
      mine,
      approver,
      completed: task.status === "completed",
    };
  });

  const litigationTasks = ((litigationResult.data ?? []) as any[]).map((task) => {
    const litigationCase = relationOne(task.litigation_cases);
    const project = relationOne(litigationCase?.projects);
    const client = relationOne(project?.clients);
    const assignees = ((task.litigation_case_action_assignees ?? []) as any[]).filter(
      (assignee) => !assignee.ended_at,
    );
    const mine =
      task.assigned_to === access.userId ||
      assignees.some((assignee) => assignee.user_id === access.userId);

    return {
      id: task.id as string,
      kind: "litigation" as const,
      title: task.title as string,
      projectId: project?.id as string | undefined,
      projectName: project?.name ?? "مشروع غير محدد",
      projectNumber: project?.project_number,
      clientName: client?.display_name ?? "عميل غير محدد",
      stageName: "تقاضي",
      dueAt: task.due_at ?? task.legal_due_date,
      status: task.status as string,
      assignees: assignees
        .map((assignee) => relationOne(assignee.profiles)?.full_name)
        .filter(Boolean),
      mine,
      approver: false,
      completed: task.status === "completed",
    };
  });

  const proposedTasks = ((proposedResult.data ?? []) as any[]).map((task) => {
    const project = relationOne(task.projects);
    const client = relationOne(project?.clients);
    const stage = relationOne(task.workflow_stage_instances);
    return {
      id: task.id as string,
      kind: "proposed" as const,
      title: task.title as string,
      projectId: project?.id as string | undefined,
      projectName: project?.name ?? "مشروع غير محدد",
      projectNumber: project?.project_number,
      clientName: client?.display_name ?? "عميل غير محدد",
      stageName:
        relationOne(stage?.workflow_stage_templates)?.name ?? "اقتراح حر",
      dueAt: task.proposed_due_at as string | null,
      status: task.status as string,
      assignees: ["مقترح"],
      mine: true,
      approver: access.permissions.includes("tasks.approve_proposed"),
      completed: ["approved", "rejected", "cancelled"].includes(task.status),
      description: task.description as string | null,
    };
  });

  const allTasks = [...workflowTasks, ...litigationTasks, ...proposedTasks];
  const visibleTasks = allTasks.filter((task) => {
    if (activeFilter === "mine") return task.mine && isOpen(task.status);
    if (activeFilter === "overdue") return isOpen(task.status) && isOverdue(task.dueAt);
    if (activeFilter === "awaiting-approval") {
      return (
        (task.kind === "workflow" &&
          task.status === "awaiting_approval" &&
          task.approver) ||
        (task.kind === "proposed" &&
          task.status === "pending" &&
          task.approver)
      );
    }
    if (activeFilter === "proposed") return task.kind === "proposed";
    return task.completed;
  });

  const stageOptions: Option[] = ((stagesResult.data ?? []) as any[]).map(
    (stage) => ({
      id: stage.id,
      name: relationOne(stage.workflow_stage_templates)?.name ?? "مرحلة",
    }),
  );
  const projectOptions: Option[] = ((projectsResult.data ?? []) as any[]).map(
    (project) => ({
      id: project.id,
      name: `${project.name}${project.project_number ? ` - ${project.project_number}` : ""}`,
    }),
  );

  return (
    <AppShell access={access} eyebrow="التشغيل اليومي" title="مهامي التشغيلية">
      <nav className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-5">
        {filterTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeFilter === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/workspace/tasks?filter=${tab.key}`}
              className={`flex min-h-14 items-center justify-center gap-2 bg-surface px-3 text-sm font-bold ${
                active ? "text-brand" : "text-muted hover:text-brand"
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">القائمة الحالية</h2>
            <span className="text-sm text-muted">{visibleTasks.length} مهمة</span>
          </div>

          {visibleTasks.length ? (
            visibleTasks.map((task) => (
              <article
                key={`${task.kind}-${task.id}`}
                className="rounded-md border border-line bg-surface p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-brand">
                      {task.projectNumber ?? "دون رقم"} · {task.stageName}
                    </p>
                    <h3 className="mt-1 font-bold">{task.title}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {task.clientName} · {task.projectName}
                    </p>
                  </div>
                  <span
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
                      isOverdue(task.dueAt) && isOpen(task.status)
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-line bg-[#f7f8f7] text-muted"
                    }`}
                  >
                    {statusLabel(task.status)}
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted">الاستحقاق</dt>
                    <dd className="mt-1 font-bold">{formatDate(task.dueAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">المكلفون</dt>
                    <dd className="mt-1 font-bold">
                      {task.assignees.length ? task.assignees.join("، ") : "غير محدد"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">نسبة الإنجاز</dt>
                    <dd className="mt-1 font-bold tabular-nums">
                      {"progress" in task ? (task.progress ?? 0) : 0}%
                    </dd>
                  </div>
                </dl>

                {"latestUpdate" in task && task.latestUpdate ? (
                  <p className="mt-4 rounded-md bg-[#f4f7f5] px-4 py-3 text-sm leading-7 text-muted">
                    آخر تحديث: {task.latestUpdate.notes ?? statusLabel(task.latestUpdate.update_type)}
                  </p>
                ) : null}

                {task.projectId ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/workspace/projects/${task.projectId}`}
                      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-bold text-brand"
                    >
                      فتح المشروع
                    </Link>
                  </div>
                ) : null}

                {task.kind === "workflow" && isOpen(task.status) ? (
                  <details className="mt-4 border-t border-line pt-4">
                    <summary className="cursor-pointer text-sm font-bold text-brand">
                      تحديث المهمة أو طلب تمديد
                    </summary>
                    <div className="mt-4">
                      <WorkflowActionUpdateForm
                        projectId={task.projectId ?? ""}
                        actionId={task.id}
                      />
                    </div>
                  </details>
                ) : null}

                {task.kind === "proposed" &&
                task.status === "pending" &&
                access.permissions.includes("tasks.approve_proposed") ? (
                  <details className="mt-4 border-t border-line pt-4">
                    <summary className="cursor-pointer text-sm font-bold text-brand">
                      اعتماد أو رفض المهمة المقترحة
                    </summary>
                    <div className="mt-4">
                      <ProposedTaskReviewForm
                        projectId={task.projectId ?? ""}
                        proposedActionId={task.id}
                      />
                    </div>
                  </details>
                ) : null}
              </article>
            ))
          ) : (
            <div className="rounded-md border border-line bg-surface px-5 py-12 text-center">
              <Hourglass className="mx-auto size-8 text-muted" aria-hidden="true" />
              <h2 className="mt-4 font-bold">لا توجد مهام في هذا التصنيف</h2>
            </div>
          )}
        </section>

        {access.permissions.includes("tasks.propose") ? (
          <aside className="h-fit rounded-md border border-line bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <Clock3 className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">اقتراح مهمة</h2>
            </div>
            <p className="mb-4 text-sm leading-7 text-muted">
              تظهر المهمة كمقترح حتى يعتمدها السكرتير أو المدير.
            </p>
            <ProposedTaskForm stages={stageOptions} projects={projectOptions} />
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}
