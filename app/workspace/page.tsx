import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  ClockAlert,
  FileCheck2,
  Gavel,
  UserRoundCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getAccessContext } from "@/lib/auth/access";
import { labelFor, projectTypeLabels } from "@/lib/projects/labels";
import { createClient } from "@/lib/supabase/server";

const dateTime = new Intl.DateTimeFormat("ar-SA", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function WorkspacePage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const supabase = await createClient();
  const canApproveStaff = access.permissions.includes("staff.approve");
  const canManageRequests = access.permissions.includes("requests.manage");
  const canWorkPreContract = [
    "studies.submit",
    "studies.approve_litigation",
    "studies.approve_estates",
  ].some((permission) => access.permissions.includes(permission));
  const canOpenRequests = canManageRequests || canWorkPreContract;

  const [
    projectsResult,
    requestsResult,
    pendingStaffResult,
    hearingsResult,
    tasksResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, project_number, project_type, status, client_stage_label, updated_at, clients(display_name)",
      )
      .eq("status", "active")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("status", "in", '("converted_to_project","cancelled","rejected")'),
    canApproveStaff
      ? supabase
          .from("staff_registration_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : Promise.resolve({ count: 0, data: null, error: null }),
    supabase
      .from("litigation_hearings")
      .select(
        "id, hearing_at, court_reference, litigation_cases(project_id, projects(name))",
      )
      .eq("status", "scheduled")
      .gte("hearing_at", new Date().toISOString())
      .order("hearing_at")
      .limit(4),
    supabase
      .from("workflow_action_instances")
      .select(
        "id, status, due_at, workflow_action_templates(name), workflow_stage_instances(workflow_instances(project_id, projects(name)))",
      )
      .in("status", ["ready", "in_progress", "submitted", "awaiting_approval"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(5),
  ]);

  const projects = projectsResult.data ?? [];
  const openTasks = tasksResult.data ?? [];
  const metrics = [
    {
      label: "المشاريع النشطة",
      value: projects.length,
      icon: BriefcaseBusiness,
      accent: "text-brand bg-[#e5eee9]",
    },
    {
      label: "طلبات قبل التعاقد",
      value: requestsResult.count ?? 0,
      icon: FileCheck2,
      accent: "text-[#825f17] bg-[#f5ecd6]",
    },
    {
      label: "مهام قيد المتابعة",
      value: openTasks.length,
      icon: ClockAlert,
      accent: "text-[#9b3b3b] bg-[#f7e7e7]",
    },
    {
      label: "تفعيل موظفين",
      value: pendingStaffResult.count ?? 0,
      icon: UserRoundCheck,
      accent: "text-sky-700 bg-sky-50",
    },
  ];

  return (
    <AppShell
      access={access}
      eyebrow="مساحة العمل"
      title="لوحة العمليات القانونية"
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, accent }) => (
          <article key={label} className="rounded-md border border-line bg-surface p-5">
            <span className={`grid size-10 place-items-center rounded-md ${accent}`}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-5 text-3xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-sm text-muted">{label}</p>
          </article>
        ))}
      </section>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,1fr)]">
        <section className="rounded-md border border-line bg-surface">
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <BriefcaseBusiness className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">المشاريع النشطة</h2>
            </div>
            <Link
              href="/workspace/projects"
              className="inline-flex items-center gap-2 text-xs font-bold text-brand"
            >
              عرض الكل
              <ArrowLeft className="size-3" aria-hidden="true" />
            </Link>
          </div>
          <div className="divide-y divide-line">
            {projects.length ? (
              projects.map((project) => (
                (() => {
                  const clientRelation = project.clients as unknown as
                    | { display_name: string }
                    | { display_name: string }[]
                    | null;
                  const client = Array.isArray(clientRelation)
                    ? clientRelation[0]
                    : clientRelation;
                  return (
                <Link
                  key={project.id}
                  href={`/workspace/projects/${project.id}`}
                  className="grid gap-3 px-5 py-4 transition hover:bg-[#fafbfa] sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold">{project.name}</p>
                      <span className="shrink-0 text-[11px] text-muted">
                        {project.project_number}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {client?.display_name ?? "عميل غير محدد"} ·{" "}
                      {labelFor(projectTypeLabels, project.project_type)}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-brand">
                    {project.client_stage_label ?? "جاهز للتشغيل"}
                  </p>
                  <ArrowLeft className="size-4 text-muted" aria-hidden="true" />
                </Link>
                  );
                })()
              ))
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted">
                لا توجد مشاريع نشطة في نطاقك.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-md border border-line bg-surface">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <CalendarClock className="size-5 text-gold" aria-hidden="true" />
            <h2 className="font-bold">الجلسات القادمة</h2>
          </div>
          <div className="divide-y divide-line">
            {(hearingsResult.data ?? []).length ? (
              (hearingsResult.data ?? []).map((hearing) => {
                const caseRelation = hearing.litigation_cases as unknown as
                  | { project_id: string; projects: { name: string } | { name: string }[] }
                  | { project_id: string; projects: { name: string } | { name: string }[] }[];
                const caseRow = Array.isArray(caseRelation)
                  ? caseRelation[0]
                  : caseRelation;
                const projectRelation = caseRow?.projects;
                const hearingProject = Array.isArray(projectRelation)
                  ? projectRelation[0]
                  : projectRelation;
                return (
                  <Link
                    key={hearing.id}
                    href={`/workspace/projects/${caseRow?.project_id}?view=litigation`}
                    className="flex items-start gap-3 px-5 py-4 transition hover:bg-[#fafbfa]"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#f5ecd6] text-[#825f17]">
                      <Gavel className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {hearingProject?.name ?? "قضية"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {dateTime.format(new Date(hearing.hearing_at))}
                      </p>
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted">
                لا توجد جلسات قادمة.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-7 rounded-md border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <h2 className="font-bold">إجراءات سريعة</h2>
            <p className="mt-1 text-sm text-muted">
              انتقل مباشرة إلى صندوق الطلبات أو المشاريع أو إدارة الموظفين.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canOpenRequests ? (
              <Link
                href="/workspace/requests"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-4 font-bold text-white hover:bg-brand-strong"
              >
                {canManageRequests
                  ? "طلبات العملاء"
                  : "مهامي قبل التعاقد"}
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
            <Link
              href="/workspace/projects"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-4 font-bold hover:border-brand hover:text-brand"
            >
              المشاريع
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
            {canApproveStaff ? (
              <Link
                href="/admin/staff"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-4 font-bold hover:border-brand hover:text-brand"
              >
                إدارة الموظفين
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
