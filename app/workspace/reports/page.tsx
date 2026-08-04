/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  BriefcaseBusiness,
  ClipboardList,
  FileWarning,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isOpen(status?: string | null) {
  return !["completed", "cancelled", "rejected", "superseded", "closed"].includes(
    status ?? "",
  );
}

function isOverdue(dueAt?: string | null) {
  return Boolean(dueAt && new Date(dueAt).getTime() < Date.now());
}

function isThisWeek(dueAt?: string | null) {
  if (!dueAt) return false;
  const time = new Date(dueAt).getTime();
  const now = Date.now();
  return time >= now && time <= now + 7 * 86_400_000;
}

function addCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function TopList({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-bold">{title}</h2>
      </div>
      <div className="divide-y divide-line">
        {rows.length ? (
          rows.map(([name, count]) => (
            <div key={name} className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="text-sm font-bold">{name}</span>
              <span className="rounded-md bg-[#eef1ef] px-3 py-1 text-sm font-bold tabular-nums">
                {count}
              </span>
            </div>
          ))
        ) : (
          <p className="px-5 py-5 text-sm text-muted">لا توجد بيانات حالية.</p>
        )}
      </div>
    </section>
  );
}

export default async function ReportsPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const canReadReports = [
    "supervision.read",
    "projects.read_all",
    "tasks.approve_proposed",
    "system.override",
  ].some((permission) => access.permissions.includes(permission));
  if (!canReadReports) redirect("/workspace");

  const supabase = await createClient();
  const [
    projectsResult,
    workflowResult,
    litigationResult,
    proposedResult,
    noticesResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,project_number,project_type,status,clients(display_name)")
      .eq("status", "active")
      .is("deleted_at", null),
    supabase
      .from("workflow_action_instances")
      .select(
        `
        id,status,due_at,completed_at,
        workflow_action_templates(name),
        workflow_stage_instances(workflow_instances(projects(id,name,project_number))),
        workflow_action_participants(participant_type,user_id,unassigned_at,profiles(full_name))
      `,
      )
      .limit(500),
    supabase
      .from("litigation_case_actions")
      .select(
        `
        id,title,status,due_at,legal_due_date,completed_at,
        litigation_cases(projects(id,name,project_number)),
        litigation_case_action_assignees(user_id,ended_at,profiles(full_name))
      `,
      )
      .limit(500),
    supabase
      .from("proposed_workflow_actions")
      .select("id,status,project_id,projects(id,name,project_number)")
      .eq("status", "pending")
      .limit(200),
    supabase
      .from("project_attention_notices")
      .select("id,status,project_id,target_user_id,projects(name,project_number)")
      .eq("status", "sent")
      .limit(200),
  ]);

  const activeProjects = ((projectsResult.data ?? []) as any[]).length;
  const overdueByEmployee = new Map<string, number>();
  const overdueByProject = new Map<string, number>();
  let overdueTasks = 0;
  let awaitingApproval = 0;
  let dueThisWeek = 0;
  let completedRecently = 0;
  const nowMs = new Date().getTime();

  for (const task of (workflowResult.data ?? []) as any[]) {
    const stage = relationOne(task.workflow_stage_instances);
    const workflow = relationOne(stage?.workflow_instances);
    const project = relationOne(workflow?.projects);
    const participants = ((task.workflow_action_participants ?? []) as any[]).filter(
      (participant) => !participant.unassigned_at,
    );
    if (task.status === "awaiting_approval") awaitingApproval += 1;
    if (isOpen(task.status) && isThisWeek(task.due_at)) dueThisWeek += 1;
    if (
      task.completed_at &&
      new Date(task.completed_at).getTime() >= nowMs - 7 * 86_400_000
    ) {
      completedRecently += 1;
    }
    if (isOpen(task.status) && isOverdue(task.due_at)) {
      overdueTasks += 1;
      addCount(overdueByProject, project?.name ?? "مشروع غير محدد");
      for (const participant of participants) {
        addCount(
          overdueByEmployee,
          relationOne(participant.profiles)?.full_name ?? "موظف غير محدد",
        );
      }
    }
  }

  for (const task of (litigationResult.data ?? []) as any[]) {
    const litigationCase = relationOne(task.litigation_cases);
    const project = relationOne(litigationCase?.projects);
    const assignees = ((task.litigation_case_action_assignees ?? []) as any[]).filter(
      (assignee) => !assignee.ended_at,
    );
    const dueAt = task.due_at ?? task.legal_due_date;
    if (isOpen(task.status) && isThisWeek(dueAt)) dueThisWeek += 1;
    if (
      task.completed_at &&
      new Date(task.completed_at).getTime() >= nowMs - 7 * 86_400_000
    ) {
      completedRecently += 1;
    }
    if (isOpen(task.status) && isOverdue(dueAt)) {
      overdueTasks += 1;
      addCount(overdueByProject, project?.name ?? "مشروع غير محدد");
      for (const assignee of assignees) {
        addCount(
          overdueByEmployee,
          relationOne(assignee.profiles)?.full_name ?? "موظف غير محدد",
        );
      }
    }
  }

  const proposedPending = ((proposedResult.data ?? []) as any[]).length;
  const openNotices = ((noticesResult.data ?? []) as any[]).length;
  const overdueEmployees = [...overdueByEmployee.entries()].sort((a, b) => b[1] - a[1]);
  const overdueProjects = [...overdueByProject.entries()].sort((a, b) => b[1] - a[1]);

  const metrics = [
    {
      label: "مشاريع نشطة",
      value: activeProjects,
      icon: BriefcaseBusiness,
      href: "/workspace/projects?status=active",
    },
    {
      label: "مهام متأخرة",
      value: overdueTasks,
      icon: AlertTriangle,
      href: "/workspace/tasks?filter=overdue",
    },
    {
      label: "بانتظار الاعتماد",
      value: awaitingApproval,
      icon: BadgeCheck,
      href: "/workspace/tasks?filter=awaiting-approval",
    },
    {
      label: "مهام مقترحة",
      value: proposedPending,
      icon: ClipboardList,
      href: "/workspace/tasks?filter=proposed",
    },
    {
      label: "لفت نظر مفتوح",
      value: openNotices,
      icon: FileWarning,
      href: "/workspace/supervision",
    },
    {
      label: "مستحق هذا الأسبوع",
      value: dueThisWeek,
      icon: TrendingUp,
      href: "/workspace/tasks",
    },
  ];

  return (
    <AppShell access={access} eyebrow="متابعة الأداء" title="تقارير التشغيل">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link
              key={metric.label}
              href={metric.href}
              className="rounded-md border border-line bg-surface p-5 transition hover:border-brand"
            >
              <Icon className="size-5 text-brand" aria-hidden="true" />
              <p className="mt-4 text-sm text-muted">{metric.label}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{metric.value}</p>
            </Link>
          );
        })}
      </section>

      <section className="mt-6 rounded-md border border-line bg-surface p-5">
        <h2 className="font-bold">التقرير الأسبوعي المختصر</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-[#f4f7f5] p-4">
            <p className="text-sm text-muted">مستحق خلال 7 أيام</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{dueThisWeek}</p>
          </div>
          <div className="rounded-md bg-[#f4f7f5] p-4">
            <p className="text-sm text-muted">اكتمل آخر 7 أيام</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{completedRecently}</p>
          </div>
          <div className="rounded-md bg-[#fff7ed] p-4">
            <p className="text-sm text-muted">متأخر ومفتوح</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{overdueTasks}</p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TopList title="المهام المتأخرة حسب الموظف" rows={overdueEmployees} />
        <TopList title="المهام المتأخرة حسب المشروع" rows={overdueProjects} />
      </div>
    </AppShell>
  );
}
