import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  Gavel,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getAccessContext } from "@/lib/auth/access";
import {
  labelFor,
  projectStatusLabels,
  projectStatusTone,
  projectTypeLabels,
} from "@/lib/projects/labels";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const filters = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select(
      "id, name, project_number, project_type, status, client_stage_label, updated_at, clients(display_name)",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (filters.q?.trim()) query = query.ilike("name", `%${filters.q.trim()}%`);
  if (filters.type) query = query.eq("project_type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);

  const { data: projects } = await query;

  return (
    <AppShell
      access={access}
      eyebrow="إدارة المشاريع"
      title="محفظة القضايا والتركات"
    >
      <form className="grid gap-3 border-y border-line bg-surface px-5 py-4 sm:grid-cols-[1fr_13rem_13rem_auto]">
        <label className="relative">
          <Search
            className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="اسم المشروع أو القضية"
            className="h-11 w-full rounded-md border border-line bg-white pr-10 pl-3 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <select
          name="type"
          defaultValue={filters.type}
          className="h-11 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">كل أنواع المشاريع</option>
          <option value="litigation">التقاضي</option>
          <option value="estate">التركات</option>
          <option value="estate_asset">مشاريع الأصول</option>
          <option value="estate_litigation">تقاضي التركات</option>
        </select>
        <select
          name="status"
          defaultValue={filters.status}
          className="h-11 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="on_hold">متوقف مؤقتًا</option>
          <option value="completed">مكتمل</option>
          <option value="archived">مؤرشف</option>
        </select>
        <button className="h-11 rounded-md bg-brand px-5 font-bold text-white hover:bg-brand-strong">
          تطبيق
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BriefcaseBusiness className="size-5 text-brand" aria-hidden="true" />
          <h2 className="font-bold">المشاريع المتاحة</h2>
        </div>
        <span className="text-sm tabular-nums text-muted">
          {projects?.length ?? 0} مشروع
        </span>
      </div>

      {projects?.length ? (
        <div className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
          {projects.map((project) => {
            const clientRelation = project.clients as unknown as
              | { display_name: string }
              | { display_name: string }[]
              | null;
            const client = Array.isArray(clientRelation)
              ? clientRelation[0]
              : clientRelation;
            const TypeIcon =
              project.project_type === "estate" ||
              project.project_type === "estate_asset"
                ? Building2
                : Gavel;
            return (
              <Link
                key={project.id}
                href={`/workspace/projects/${project.id}`}
                className="grid gap-4 px-5 py-5 transition hover:bg-[#fafbfa] md:grid-cols-[3rem_minmax(0,1fr)_15rem_auto] md:items-center"
              >
                <span className="grid size-11 place-items-center rounded-md bg-[#e5eee9] text-brand">
                  <TypeIcon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-bold">{project.name}</p>
                    <span className="text-xs text-muted">
                      {project.project_number ?? "دون رقم"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {client?.display_name ?? "عميل غير محدد"} ·{" "}
                    {labelFor(projectTypeLabels, project.project_type)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">المرحلة الحالية</p>
                  <p className="mt-1 text-sm font-bold">
                    {project.client_stage_label ?? "جاهز لبدء خارطة السير"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold ${projectStatusTone(project.status)}`}
                  >
                    {labelFor(projectStatusLabels, project.status)}
                  </span>
                  <ArrowLeft className="size-4 text-muted" aria-hidden="true" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 border-y border-line bg-surface px-5 py-12 text-center">
          <p className="font-bold">لا توجد مشاريع بهذه المرشحات</p>
          <p className="mt-2 text-sm text-muted">
            تتحول طلبات العملاء إلى مشاريع بعد اعتماد العقد.
          </p>
        </div>
      )}
    </AppShell>
  );
}
