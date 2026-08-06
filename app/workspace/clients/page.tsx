import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ContactRound, FolderOpen, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type ClientRow = {
  id: string;
  display_name: string;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  status: string;
  created_at: string;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");
  if (!access.permissions.includes("clients.read")) redirect("/workspace");

  const filters = await searchParams;
  const supabase = await createClient();
  let clientsQuery = supabase
    .from("clients")
    .select(
      "id,display_name,primary_contact_name,primary_contact_phone,status,created_at",
    )
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (filters.q?.trim()) {
    clientsQuery = clientsQuery.ilike("display_name", `%${filters.q.trim()}%`);
  }
  if (filters.status) clientsQuery = clientsQuery.eq("status", filters.status);

  const { data: clients } = await clientsQuery;
  const clientIds = (clients ?? []).map((client) => client.id);
  const [projectsResult, requestsResult] = await Promise.all([
    clientIds.length
      ? supabase
          .from("projects")
          .select("id,client_id,status")
          .in("client_id", clientIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? supabase
          .from("service_requests")
          .select("id,client_id,status")
          .in("client_id", clientIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const counts = new Map<string, { projects: number; active: number; requests: number }>();
  for (const client of clients ?? []) counts.set(client.id, { projects: 0, active: 0, requests: 0 });
  for (const project of projectsResult.data ?? []) {
    const value = counts.get(project.client_id);
    if (!value) continue;
    value.projects += 1;
    if (project.status === "active") value.active += 1;
  }
  for (const request of requestsResult.data ?? []) {
    const value = counts.get(request.client_id ?? "");
    if (value) value.requests += 1;
  }

  return (
    <AppShell access={access} eyebrow="إدارة العلاقات" title="سجل العملاء">
      <form className="grid gap-3 border-y border-line bg-surface px-5 py-4 sm:grid-cols-[1fr_12rem_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted" aria-hidden="true" />
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="اسم العميل أو جهة التواصل"
            className="h-11 w-full rounded-md border border-line bg-white pr-10 pl-3 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <select name="status" defaultValue={filters.status} className="h-11 rounded-md border border-line bg-white px-3 text-sm">
          <option value="">كل الحالات</option>
          <option value="lead">عميل جديد</option>
          <option value="active">عميل نشط</option>
          <option value="inactive">غير نشط</option>
        </select>
        <button className="h-11 rounded-md bg-brand px-5 text-sm font-bold text-white hover:bg-brand-strong">تطبيق</button>
      </form>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ContactRound className="size-5 text-brand" aria-hidden="true" />
          <h2 className="font-bold">ملفات العملاء</h2>
        </div>
        <span className="text-sm text-muted">{clients?.length ?? 0} عميل</span>
      </div>

      <section className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
        {(clients as ClientRow[] | null)?.length ? (
          (clients as ClientRow[]).map((client) => {
            const count = counts.get(client.id) ?? { projects: 0, active: 0, requests: 0 };
            return (
              <Link
                key={client.id}
                href={`/workspace/clients/${client.id}`}
                className="grid gap-4 px-5 py-5 transition hover:bg-[#fafbfa] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{client.display_name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {client.primary_contact_name ?? "جهة التواصل غير محددة"}
                    {client.primary_contact_phone ? ` · ${client.primary_contact_phone}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-md bg-[#e5eee9] px-3 py-1.5 text-brand">{count.projects} مشاريع</span>
                  <span className="rounded-md bg-[#f5ecd6] px-3 py-1.5 text-[#825f17]">{count.active} نشطة</span>
                  <span className="rounded-md bg-[#f4f7f5] px-3 py-1.5 text-muted">{Math.max(0, count.projects - count.active)} غير نشطة</span>
                  <span className="rounded-md bg-[#f4f7f5] px-3 py-1.5 text-muted">{count.requests} طلبات</span>
                </div>
                <ArrowLeft className="size-4 text-muted" aria-hidden="true" />
              </Link>
            );
          })
        ) : (
          <div className="px-5 py-12 text-center">
            <FolderOpen className="mx-auto size-8 text-muted" aria-hidden="true" />
            <p className="mt-4 font-bold">لا توجد ملفات عملاء مطابقة</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
