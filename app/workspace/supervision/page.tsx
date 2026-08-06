import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CalendarClock,
  Gavel,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type PortfolioRow = {
  project_id: string;
  project_number: string | null;
  project_name: string;
  category_id: string;
  category_name: string;
  project_status: string;
  client_stage_label: string | null;
  current_action_id: string | null;
  current_action_title: string | null;
  current_action_due_at: string | null;
  current_action_legal_due_date: string | null;
  current_action_status: string | null;
  next_hearing_at: string | null;
  open_notice_count: number;
  updated_at: string;
};

const dateTime = new Intl.DateTimeFormat("ar-SA", {
  timeZone: "Asia/Riyadh",
  dateStyle: "medium",
  timeStyle: "short",
});

function isOverdue(row: PortfolioRow) {
  if (
    row.current_action_status &&
    ["completed", "cancelled", "superseded"].includes(
      row.current_action_status,
    )
  ) {
    return false;
  }
  const deadline =
    row.current_action_due_at ?? row.current_action_legal_due_date;
  return deadline ? new Date(deadline).getTime() < Date.now() : false;
}

export default async function SupervisionPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    status?: string;
    timing?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("supervision.read")) redirect("/workspace");

  const filters = await searchParams;
  const supabase = await createClient();
  const [{ data: portfolioData, error }, { data: specialties }] =
    await Promise.all([
      supabase.rpc("get_supervision_portfolio"),
      supabase
        .from("litigation_supervisor_specialties")
        .select(
          "category_id, litigation_case_categories!litigation_supervisor_specialties_category_id_fkey(name)",
        )
        .eq("supervisor_id", access.userId)
        .is("revoked_at", null),
    ]);

  const rows = ((portfolioData ?? []) as PortfolioRow[]).filter((row) => {
    const query = filters.q?.trim().toLocaleLowerCase("ar") ?? "";
    if (
      query &&
      !`${row.project_name} ${row.project_number ?? ""} ${row.current_action_title ?? ""}`
        .toLocaleLowerCase("ar")
        .includes(query)
    ) {
      return false;
    }
    if (filters.category && row.category_id !== filters.category) return false;
    if (filters.status && row.project_status !== filters.status) return false;
    if (filters.timing === "overdue" && !isOverdue(row)) return false;
    if (filters.timing === "on_time" && isOverdue(row)) return false;
    return true;
  });

  const categories = (specialties ?? []).map((specialty) => {
    const relation = specialty.litigation_case_categories as unknown as
      | { name: string }
      | { name: string }[]
      | null;
    return {
      id: specialty.category_id,
      name: Array.isArray(relation)
        ? (relation[0]?.name ?? "تخصص")
        : (relation?.name ?? "تخصص"),
    };
  });

  return (
    <AppShell
      access={access}
      eyebrow="الإشراف المتخصص"
      title="متابعة قضايا التخصص"
    >
      <form className="grid gap-3 border-y border-line bg-surface px-5 py-4 md:grid-cols-[minmax(0,1fr)_14rem_12rem_12rem_auto]">
        <label className="relative">
          <Search
            className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="المشروع أو الرقم أو الإجراء"
            className="h-11 w-full rounded-md border border-line bg-white pr-10 pl-3 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <select
          name="category"
          defaultValue={filters.category}
          className="h-11 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">كل تخصصاتي</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={filters.status}
          className="h-11 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">كل حالات المشروع</option>
          <option value="active">نشط</option>
          <option value="on_hold">متوقف مؤقتًا</option>
          <option value="completed">مكتمل</option>
          <option value="archived">مؤرشف</option>
        </select>
        <select
          name="timing"
          defaultValue={filters.timing}
          className="h-11 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">كل المواعيد</option>
          <option value="overdue">متأخر</option>
          <option value="on_time">ضمن الموعد</option>
        </select>
        <button className="h-11 rounded-md bg-brand px-5 text-sm font-bold text-white hover:bg-brand-strong">
          تطبيق
        </button>
      </form>

      {error ? (
        <div className="mt-6 border-y border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          تعذر تحميل محفظة الإشراف.
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Gavel className="size-5 text-brand" aria-hidden="true" />
          <h2 className="font-bold">القضايا المطابقة لتخصصك</h2>
        </div>
        <span className="text-sm tabular-nums text-muted">
          {rows.length} قضية
        </span>
      </div>

      {rows.length ? (
        <div className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
          {rows.map((row) => {
            const overdue = isOverdue(row);
            const deadline =
              row.current_action_due_at ?? row.current_action_legal_due_date;
            return (
              <Link
                key={row.project_id}
                href={`/workspace/projects/${row.project_id}`}
                className="grid gap-4 px-5 py-5 transition hover:bg-[#fafbfa] lg:grid-cols-[minmax(0,1.2fr)_12rem_minmax(15rem,1fr)_11rem_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-bold">{row.project_name}</p>
                    <span className="text-xs text-muted">
                      {row.project_number ?? "دون رقم"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{row.category_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">المرحلة</p>
                  <p className="mt-1 text-sm font-bold">
                    {row.client_stage_label ?? "لم تبدأ"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">الإجراء القادم</p>
                  <p className="mt-1 text-sm font-bold">
                    {row.current_action_title ?? "لا يوجد إجراء قادم"}
                  </p>
                  {deadline ? (
                    <p
                      className={`mt-1 text-xs ${
                        overdue ? "font-bold text-red-700" : "text-muted"
                      }`}
                    >
                      {dateTime.format(new Date(deadline))}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2 text-xs">
                  {row.next_hearing_at ? (
                    <span className="flex items-center gap-2">
                      <CalendarClock className="size-4 text-brand" />
                      {dateTime.format(new Date(row.next_hearing_at))}
                    </span>
                  ) : null}
                  {row.open_notice_count > 0 ? (
                    <span className="flex items-center gap-2 font-bold text-amber-800">
                      <BellRing className="size-4" />
                      {row.open_notice_count} لفت نظر مفتوح
                    </span>
                  ) : null}
                  {overdue ? (
                    <span className="flex items-center gap-2 font-bold text-red-700">
                      <AlertTriangle className="size-4" />
                      متأخر
                    </span>
                  ) : null}
                </div>
                <ArrowLeft className="size-4 text-muted" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 border-y border-line bg-surface px-5 py-12 text-center">
          <p className="font-bold">لا توجد قضايا مطابقة لهذه المرشحات</p>
          <p className="mt-2 text-sm text-muted">
            تظهر القضية هنا فور اعتماد نوعها إذا كان ضمن تخصصاتك النشطة.
          </p>
        </div>
      )}
    </AppShell>
  );
}
