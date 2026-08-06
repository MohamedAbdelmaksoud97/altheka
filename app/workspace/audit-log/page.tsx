import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, Filter, History, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type AuditRow = {
  id: number;
  organization_id: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_schema: string;
  entity_table: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type ProfileOption = {
  id: string;
  full_name: string;
};

const actionLabels: Record<string, string> = {
  insert: "إنشاء",
  update: "تحديث",
  delete: "حذف",
  staff_access_updated: "تعديل وصول موظف",
  project_category_changed: "تغيير تصنيف مشروع",
};

const tableLabels: Record<string, string> = {
  profiles: "الحسابات",
  user_roles: "أدوار المستخدمين",
  staff_registration_requests: "طلبات الموظفين",
  clients: "العملاء",
  service_requests: "طلبات العملاء",
  projects: "المشاريع",
  documents: "المستندات",
  document_versions: "إصدارات المستندات",
  workflow_instances: "مسارات العمل",
  workflow_stage_instances: "مراحل المسار",
  workflow_action_instances: "إجراءات المسار",
  workflow_action_participants: "مكلفو الإجراءات",
  workflow_action_updates: "تحديثات المهام",
  proposed_workflow_actions: "المهام المقترحة",
  appointments: "المواعيد",
  powers_of_attorney: "الوكالات",
  estate_party_approval_requests: "طلبات موافقة الورثة",
  estate_party_approval_responses: "ردود موافقة الورثة",
  estate_parties: "أطراف التركة",
  estate_assets: "أصول التركة",
  estate_party_decisions: "قرارات الورثة",
  estate_financial_entries: "قيود مالية للتركة",
  litigation_cases: "بطاقات القضايا",
  litigation_case_actions: "إجراءات التقاضي",
  litigation_hearings: "الجلسات",
  project_attention_notices: "لفت النظر",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function compactJson(value: Record<string, unknown> | null) {
  if (!value) return "لا توجد بيانات";
  return JSON.stringify(value, null, 2);
}

function auditTone(action: string) {
  if (action.includes("delete") || action.includes("disable")) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (action === "insert") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-line bg-[#f7f8f7] text-muted";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    table?: string;
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
    limit?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const canReadAudit =
    access.permissions.includes("audit.read") &&
    (access.roleCodes.includes("super_admin") ||
      access.roleCodes.includes("executive_manager"));
  if (!canReadAudit) redirect("/workspace");

  const params = await searchParams;
  const limit = Math.min(Math.max(Number(params.limit) || 200, 1), 1000);
  const fromDate = params.from ? new Date(params.from) : null;
  const toDate = params.to ? new Date(params.to) : null;
  const supabase = await createClient();

  const [{ data: auditRows, error }, { data: profiles }] = await Promise.all([
    supabase.rpc("get_audit_log_entries", {
      p_entity_table: params.table || null,
      p_actor_user_id: params.actor || null,
      p_action: params.action || null,
      p_from:
        fromDate && !Number.isNaN(fromDate.getTime())
          ? fromDate.toISOString()
          : null,
      p_to:
        toDate && !Number.isNaN(toDate.getTime()) ? toDate.toISOString() : null,
      p_limit: limit,
    }),
    supabase
      .from("profiles")
      .select("id,full_name")
      .eq("account_kind", "staff")
      .order("full_name"),
  ]);

  const rows = (auditRows ?? []) as AuditRow[];
  const staff = (profiles ?? []) as ProfileOption[];
  const tables = [...new Set(rows.map((row) => row.entity_table))].sort();
  const actions = [...new Set(rows.map((row) => row.action))].sort();

  return (
    <AppShell access={access} eyebrow="الحوكمة والرقابة" title="سجل التدقيق">
      <section className="rounded-md border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-brand" aria-hidden="true" />
            <div>
              <h2 className="font-bold">Audit Log</h2>
              <p className="mt-1 text-sm text-muted">
                السجل الكامل للتغييرات الحساسة داخل النظام.
              </p>
            </div>
          </div>
          <span className="rounded-md bg-[#eef1ef] px-3 py-1.5 text-sm font-bold tabular-nums">
            {rows.length} عملية
          </span>
        </div>

        <form className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_13rem_10rem_10rem_7rem_auto]">
          <select
            name="table"
            defaultValue={params.table ?? ""}
            className="h-11 rounded-md border border-line bg-white px-3 text-sm"
          >
            <option value="">كل الجداول</option>
            {Object.entries(tableLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            {tables
              .filter((table) => !tableLabels[table])
              .map((table) => (
                <option key={table} value={table}>
                  {table}
                </option>
              ))}
          </select>
          <select
            name="action"
            defaultValue={params.action ?? ""}
            className="h-11 rounded-md border border-line bg-white px-3 text-sm"
          >
            <option value="">كل العمليات</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {actionLabels[action] ?? action}
              </option>
            ))}
          </select>
          <select
            name="actor"
            defaultValue={params.actor ?? ""}
            className="h-11 rounded-md border border-line bg-white px-3 text-sm"
          >
            <option value="">كل المستخدمين</option>
            {staff.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ""}
            className="h-11 rounded-md border border-line bg-white px-3 text-sm"
          />
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ""}
            className="h-11 rounded-md border border-line bg-white px-3 text-sm"
          />
          <input
            type="number"
            name="limit"
            min={1}
            max={1000}
            defaultValue={limit}
            className="h-11 rounded-md border border-line bg-white px-3 text-sm"
          />
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-bold text-white">
            <Filter className="size-4" aria-hidden="true" />
            تطبيق
          </button>
        </form>
      </section>

      {error ? (
        <section className="mt-5 rounded-md border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          تعذر تحميل سجل التدقيق.
        </section>
      ) : null}

      <section className="mt-5 rounded-md border border-line bg-surface">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <History className="size-5 text-brand" aria-hidden="true" />
          <h2 className="font-bold">الأحداث الأخيرة</h2>
        </div>
        <div className="divide-y divide-line">
          {rows.length ? (
            rows.map((row) => (
              <article key={row.id} className="px-5 py-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md border px-3 py-1 text-xs font-bold ${auditTone(row.action)}`}
                      >
                        {actionLabels[row.action] ?? row.action}
                      </span>
                      <h3 className="font-bold">
                        {tableLabels[row.entity_table] ?? row.entity_table}
                      </h3>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {row.entity_schema}.{row.entity_table}
                      {row.entity_id ? ` · ${row.entity_id}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {row.ip_address ? `IP: ${row.ip_address}` : "دون IP"}
                      {row.request_id ? ` · Request: ${row.request_id}` : ""}
                    </p>
                  </div>

                  <div className="text-sm text-muted">
                    <p className="font-bold text-ink">
                      {row.actor_name ?? "النظام"}
                    </p>
                    <p className="mt-1">{formatDate(row.created_at)}</p>
                  </div>

                  <details className="rounded-md border border-line bg-white">
                    <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-brand">
                      <Database className="size-4" aria-hidden="true" />
                      التفاصيل
                    </summary>
                    <div className="grid gap-px bg-line md:grid-cols-2">
                      <div className="bg-white p-4">
                        <p className="mb-2 text-xs font-bold text-muted">
                          قبل التغيير
                        </p>
                        <pre
                          dir="ltr"
                          className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-[#f7f8f7] p-3 text-xs leading-6"
                        >
                          {compactJson(row.old_data)}
                        </pre>
                      </div>
                      <div className="bg-white p-4">
                        <p className="mb-2 text-xs font-bold text-muted">
                          بعد التغيير
                        </p>
                        <pre
                          dir="ltr"
                          className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-[#f7f8f7] p-3 text-xs leading-6"
                        >
                          {compactJson(row.new_data)}
                        </pre>
                      </div>
                    </div>
                  </details>
                </div>
              </article>
            ))
          ) : (
            <div className="px-5 py-12 text-center">
              <History className="mx-auto size-8 text-muted" aria-hidden="true" />
              <h2 className="mt-4 font-bold">لا توجد أحداث مطابقة</h2>
              <Link
                href="/workspace/audit-log"
                className="mt-4 inline-flex min-h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-bold text-brand"
              >
                مسح الفلاتر
              </Link>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
