import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Inbox, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getAccessContext } from "@/lib/auth/access";
import {
  labelFor,
  requestStatusLabels,
  requestStatusTone,
  requestTypeLabels,
} from "@/lib/pre-contract/status";
import { createClient } from "@/lib/supabase/server";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const filters = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("service_requests")
    .select("id, request_type, title, status, created_at, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.q?.trim()) {
    query = query.ilike("title", `%${filters.q.trim()}%`);
  }
  const { data: requests } = await query;

  return (
    <AppShell
      access={access}
      eyebrow="ما قبل التعاقد"
      title="طلبات العملاء"
    >
      <form className="grid gap-3 border-y border-line bg-surface px-5 py-4 sm:grid-cols-[1fr_15rem_auto]">
        <label className="relative">
          <Search
            className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="البحث بعنوان الطلب"
            className="h-11 w-full rounded-md border border-line bg-white pr-10 pl-3 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <select
          name="status"
          defaultValue={filters.status}
          className="h-11 rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none"
        >
          <option value="">كل الحالات</option>
          {Object.entries(requestStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="h-11 rounded-md bg-brand px-5 font-bold text-white hover:bg-brand-strong">
          تطبيق
        </button>
      </form>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Inbox className="size-5 text-brand" aria-hidden="true" />
            <h2 className="font-bold">صندوق الطلبات</h2>
          </div>
          <span className="text-sm tabular-nums text-muted">
            {requests?.length ?? 0} طلب
          </span>
        </div>

        {requests?.length ? (
          <div className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/workspace/requests/${request.id}`}
                className="grid gap-4 px-5 py-4 transition hover:bg-[#fafbfa] sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gold">
                    {labelFor(requestTypeLabels, request.request_type)}
                  </p>
                  <h3 className="mt-1 truncate font-bold">{request.title}</h3>
                  <p className="mt-1 text-xs text-muted">
                    آخر تحديث{" "}
                    {new Intl.DateTimeFormat("ar-EG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(request.updated_at))}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold ${requestStatusTone(request.status)}`}
                  >
                    {labelFor(requestStatusLabels, request.status)}
                  </span>
                  <ArrowLeft className="size-4 text-muted" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 border-y border-line bg-surface px-5 py-10 text-center text-sm text-muted">
            لا توجد طلبات متاحة لك بهذه المرشحات.
          </div>
        )}
      </section>
    </AppShell>
  );
}
