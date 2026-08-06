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
    taskStepsResult,
    preContractNoticesResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,project_number,project_type,status,health_status,external_hold_reason,clients(display_name)")
      .eq("status", "active")
      .is("deleted_at", null),
    supabase
      .from("workflow_action_instances")
      .select(
        `
        id,status,due_at,approval_due_at,approval_started_at,approval_reviewed_at,completed_at,
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
      .in("status", ["pending", "active"])
      .limit(200),
    supabase
      .from("project_task_steps")
      .select("id,title,status,due_at,responded_at,reviewed_at,assigned_to,assignee:profiles!project_task_steps_assigned_to_fkey(full_name),project_task_step_extension_requests(status,reason),project_task_threads(id,title,status,projects(id,name,project_number))")
      .limit(500),
    supabase.from("pre_contract_attention_notices").select("id,status").in("status",["pending","active"]).limit(200),
  ]);

  const projectRows = (projectsResult.data ?? []) as any[];
  const activeProjects = projectRows.length;
  const projectHealth = {
    green: projectRows.filter((project) => project.health_status === "green").length,
    yellow: projectRows.filter((project) => project.health_status === "yellow").length,
    red: projectRows.filter((project) => project.health_status === "red").length,
  };
  const overdueByEmployee = new Map<string, number>();
  const overdueByProject = new Map<string, number>();
  let overdueTasks = 0;
  let awaitingApproval = 0;
  let dueThisWeek = 0;
  let completedRecently = 0;
  let completedOnTime = 0;
  let completedLate = 0;
  const overdueDetails: { project:string; task:string; dueAt:string; assignee:string }[] = [];
  const nowMs = new Date().getTime();

  for (const task of (workflowResult.data ?? []) as any[]) {
    const stage = relationOne(task.workflow_stage_instances);
    const workflow = relationOne(stage?.workflow_instances);
    const project = relationOne(workflow?.projects);
    const participants = ((task.workflow_action_participants ?? []) as any[]).filter(
      (participant) => !participant.unassigned_at,
    );
    const operationalDueAt = task.status === "awaiting_approval"
      ? task.approval_due_at
      : task.due_at;
    const accountableParticipants = task.status === "awaiting_approval"
      ? participants.filter((participant) => participant.participant_type === "approver")
      : participants.filter((participant) => ["executor", "responsible"].includes(participant.participant_type));
    if (task.status === "awaiting_approval") awaitingApproval += 1;
    if (isOpen(task.status) && isThisWeek(operationalDueAt)) dueThisWeek += 1;
    if (
      task.completed_at &&
      new Date(task.completed_at).getTime() >= nowMs - 7 * 86_400_000
    ) {
      completedRecently += 1;
    }
    if (task.status === "completed" && task.completed_at && task.due_at) {
      if (new Date(task.completed_at).getTime() <= new Date(task.due_at).getTime()) completedOnTime += 1;
      else completedLate += 1;
    }
    if (isOpen(task.status) && isOverdue(operationalDueAt)) {
      overdueTasks += 1;
      addCount(overdueByProject, project?.name ?? "مشروع غير محدد");
      for (const participant of accountableParticipants) {
        overdueDetails.push({ project: project?.name ?? "مشروع غير محدد", task: `${task.status === "awaiting_approval" ? "اعتماد: " : ""}${relationOne(task.workflow_action_templates)?.name ?? "مرحلة خارطة السير"}`, dueAt: operationalDueAt, assignee: relationOne(participant.profiles)?.full_name ?? "موظف غير محدد" });
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
    if (task.status === "completed" && task.completed_at && dueAt) {
      if (new Date(task.completed_at).getTime() <= new Date(dueAt).getTime()) completedOnTime += 1;
      else completedLate += 1;
    }
    if (isOpen(task.status) && isOverdue(dueAt)) {
      overdueTasks += 1;
      addCount(overdueByProject, project?.name ?? "مشروع غير محدد");
      for (const assignee of assignees) {
        overdueDetails.push({ project: project?.name ?? "مشروع غير محدد", task: task.title, dueAt, assignee: relationOne(assignee.profiles)?.full_name ?? "موظف غير محدد" });
        addCount(
          overdueByEmployee,
          relationOne(assignee.profiles)?.full_name ?? "موظف غير محدد",
        );
      }
    }
  }

  const projectTaskSteps = (taskStepsResult.data ?? []) as any[];
  for (const step of projectTaskSteps) {
    const thread = relationOne(step.project_task_threads);
    const project = relationOne(thread?.projects);
    const assignee = relationOne(step.assignee);
    if (step.status === "awaiting_review") awaitingApproval += 1;
    if (isOpen(step.status) && isThisWeek(step.due_at)) dueThisWeek += 1;
    if (step.reviewed_at && new Date(step.reviewed_at).getTime() >= nowMs - 7 * 86_400_000) completedRecently += 1;
    if (step.status === "completed" && step.reviewed_at && step.due_at) {
      if (new Date(step.reviewed_at).getTime() <= new Date(step.due_at).getTime()) completedOnTime += 1;
      else completedLate += 1;
    }
    if (isOpen(step.status) && isOverdue(step.due_at)) {
      overdueTasks += 1;
      addCount(overdueByProject, project?.name ?? "مشروع غير محدد");
      addCount(overdueByEmployee, assignee?.full_name ?? "موظف غير محدد");
      overdueDetails.push({ project: project?.name ?? "مشروع غير محدد", task: step.title, dueAt: step.due_at, assignee: assignee?.full_name ?? "موظف غير محدد" });
    }
  }

  const proposedPending = ((proposedResult.data ?? []) as any[]).length;
  const openNotices = ((noticesResult.data ?? []) as any[]).length + ((preContractNoticesResult.data ?? []) as any[]).length;
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

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="border-r-4 border-emerald-500 bg-emerald-50 p-4"><p className="text-sm font-bold">ضمن الخطة</p><p className="mt-1 text-2xl font-bold">{projectHealth.green}</p></div>
        <div className="border-r-4 border-amber-500 bg-amber-50 p-4"><p className="text-sm font-bold">توقف خارجي</p><p className="mt-1 text-2xl font-bold">{projectHealth.yellow}</p></div>
        <div className="border-r-4 border-red-500 bg-red-50 p-4"><p className="text-sm font-bold">تأخير داخلي</p><p className="mt-1 text-2xl font-bold">{projectHealth.red}</p></div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="border-r-4 border-emerald-500 bg-emerald-50 p-4"><p className="text-sm font-bold">منجز ضمن الموعد</p><p className="mt-1 text-2xl font-bold">{completedOnTime}</p></div>
        <div className="border-r-4 border-red-500 bg-red-50 p-4"><p className="text-sm font-bold">منجز بعد الموعد</p><p className="mt-1 text-2xl font-bold">{completedLate}</p></div>
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

      <section className="mt-6 rounded-md border border-line bg-surface">
        <div className="border-b border-line px-5 py-4"><h2 className="font-bold">تفاصيل المشاريع والمهام المتأخرة</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[48rem] text-right text-sm"><thead className="bg-[#f7f9f8] text-muted"><tr><th className="px-4 py-3">المشروع</th><th className="px-4 py-3">المرحلة أو المهمة</th><th className="px-4 py-3">موعد الانتهاء</th><th className="px-4 py-3">المسؤول</th></tr></thead><tbody className="divide-y divide-line">{overdueDetails.map((row,index)=><tr key={`${row.project}-${row.task}-${index}`}><td className="px-4 py-3 font-bold">{row.project}</td><td className="px-4 py-3">{row.task}</td><td className="px-4 py-3 text-red-700">{new Intl.DateTimeFormat("ar-EG",{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"}).format(new Date(row.dueAt))}</td><td className="px-4 py-3">{row.assignee}</td></tr>)}{!overdueDetails.length?<tr><td colSpan={4} className="px-5 py-8 text-center text-muted">لا توجد مهام متأخرة حاليًا.</td></tr>:null}</tbody></table></div>
      </section>

      <section className="mt-6 rounded-md border border-line bg-surface">
        <div className="border-b border-line px-5 py-4"><h2 className="font-bold">أرشيف صناديق المهام</h2></div>
        <div className="divide-y divide-line">{projectTaskSteps.filter((step)=>step.status==="completed").slice(0,50).map((step)=>{const thread=relationOne(step.project_task_threads);const project=relationOne(thread?.projects);const late=Boolean(step.reviewed_at&&step.due_at&&new Date(step.reviewed_at)>new Date(step.due_at));const justification=(step.project_task_step_extension_requests??[]).find((item:any)=>item.status==="approved")?.reason;return <div key={step.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-bold">{step.title}</p><p className="mt-1 text-xs text-muted">{project?.name??"مشروع غير محدد"} · {thread?.title}</p>{late?<p className="mt-1 text-xs text-red-700">{justification?`متأخر · تبرير معتمد: ${justification}`:"متأخر · لا يوجد تبرير معتمد"}</p>:null}</div><span className={`text-xs font-bold ${late?"text-red-700":"text-emerald-700"}`}>{late?"منجز بعد الموعد":"منجز دون تأخير"} {step.reviewed_at?new Intl.DateTimeFormat("ar-EG",{timeZone:"Asia/Riyadh"}).format(new Date(step.reviewed_at)):""}</span></div>})}{!projectTaskSteps.some((step)=>step.status==="completed")?<p className="px-5 py-6 text-sm text-muted">لا توجد مهام مؤرشفة بعد.</p>:null}</div>
      </section>
    </AppShell>
  );
}
