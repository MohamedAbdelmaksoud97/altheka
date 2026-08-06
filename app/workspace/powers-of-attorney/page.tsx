/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, FileText, Plus, ScrollText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PowerOfAttorneyForm } from "@/components/operations/forms";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type PowerFilter = "active" | "expiring" | "expired" | "project" | "request";
type Option = { id: string; name: string };

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatDate(value?: string | null) {
  if (!value) return "غير محدد";
  return new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "medium" }).format(
    new Date(value),
  );
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    draft: "مسودة",
    active: "نشطة",
    expired: "منتهية",
    cancelled: "ملغية",
    archived: "مؤرشفة",
  };
  return labels[status ?? ""] ?? status ?? "غير محدد";
}

export default async function PowersOfAttorneyPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const params = await searchParams;
  const filter: PowerFilter = ["expiring", "expired", "project", "request"].includes(
    params.filter ?? "",
  )
    ? (params.filter as PowerFilter)
    : "active";
  const supabase = await createClient();

  const [
    powersResult,
    clientsResult,
    projectsResult,
    requestsResult,
    documentsResult,
  ] = await Promise.all([
    supabase
      .from("powers_of_attorney")
      .select(
        `
        id,power_number,issued_on,expires_on,status,notes,project_id,service_request_id,
        clients(display_name),
        projects(name,project_number),
        service_requests(title,request_number),
        documents(title,file_name)
      `,
      )
      .order("expires_on", { ascending: true, nullsFirst: false }),
    supabase.from("clients").select("id,display_name").order("display_name"),
    supabase
      .from("projects")
      .select("id,name,project_number")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(120),
    supabase
      .from("service_requests")
      .select("id,title,request_number")
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .from("documents")
      .select("id,title,file_name")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const powers = ((powersResult.data ?? []) as any[]).map((power) => {
    const project = relationOne(power.projects);
    const request = relationOne(power.service_requests);
    const client = relationOne(power.clients);
    const document = relationOne(power.documents);
    const remainingDays = daysUntil(power.expires_on);
    const expiredByDate = remainingDays !== null && remainingDays < 0;
    const expiringSoon =
      power.status === "active" &&
      remainingDays !== null &&
      remainingDays >= 0 &&
      remainingDays <= 14;
    return {
      id: power.id as string,
      powerNumber: power.power_number as string,
      issuedOn: power.issued_on as string | null,
      expiresOn: power.expires_on as string | null,
      status: expiredByDate ? "expired" : (power.status as string),
      notes: power.notes as string | null,
      projectId: power.project_id as string | null,
      requestId: power.service_request_id as string | null,
      projectName: project?.name,
      projectNumber: project?.project_number,
      requestName: request?.title,
      requestNumber: request?.request_number,
      clientName: client?.display_name ?? "عميل غير محدد",
      documentName: document?.title ?? document?.file_name,
      expiringSoon,
      remainingDays,
    };
  });

  const visiblePowers = powers.filter((power) => {
    if (filter === "expiring") return power.expiringSoon;
    if (filter === "expired") return power.status === "expired";
    if (filter === "project") return Boolean(power.projectId);
    if (filter === "request") return Boolean(power.requestId);
    return power.status === "active";
  });

  const clients: Option[] = ((clientsResult.data ?? []) as any[]).map((client) => ({
    id: client.id,
    name: client.display_name,
  }));
  const projects: Option[] = ((projectsResult.data ?? []) as any[]).map((project) => ({
    id: project.id,
    name: `${project.name}${project.project_number ? ` - ${project.project_number}` : ""}`,
  }));
  const requests: Option[] = ((requestsResult.data ?? []) as any[]).map((request) => ({
    id: request.id,
    name: `${request.title}${request.request_number ? ` - ${request.request_number}` : ""}`,
  }));
  const documents: Option[] = ((documentsResult.data ?? []) as any[]).map((document) => ({
    id: document.id,
    name: document.title ?? document.file_name ?? "مستند",
  }));

  return (
    <AppShell access={access} eyebrow="الأرشفة القانونية" title="الوكالات">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section>
          <nav className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-5">
            {[
              ["active", "نشطة"],
              ["expiring", "قاربت على الانتهاء"],
              ["expired", "منتهية"],
              ["project", "مرتبطة بمشروع"],
              ["request", "مرتبطة بطلب"],
            ].map(([key, label]) => (
              <Link
                key={key}
                href={`/workspace/powers-of-attorney?filter=${key}`}
                className={`flex min-h-14 items-center justify-center bg-surface px-3 text-sm font-bold ${
                  filter === key ? "text-brand" : "text-muted hover:text-brand"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-5 space-y-3">
            {visiblePowers.length ? (
              visiblePowers.map((power) => (
                <article
                  key={power.id}
                  className={`rounded-md border bg-surface p-5 ${
                    power.expiringSoon ? "border-amber-300" : "border-line"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold text-brand">رقم الوكالة</p>
                      <h2 className="mt-1 font-bold">{power.powerNumber}</h2>
                      <p className="mt-1 text-sm text-muted">
                        {power.clientName} ·{" "}
                        {power.projectName ?? power.requestName ?? "ارتباط عام"}
                      </p>
                    </div>
                    <span
                      className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
                        power.expiringSoon
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : power.status === "expired"
                            ? "border-red-200 bg-red-50 text-red-800"
                            : "border-line bg-[#f7f8f7] text-muted"
                      }`}
                    >
                      {power.expiringSoon
                        ? `تنتهي خلال ${power.remainingDays} يوم`
                        : statusLabel(power.status)}
                    </span>
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted">تاريخ الإصدار</dt>
                      <dd className="mt-1 font-bold">{formatDate(power.issuedOn)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">تاريخ الانتهاء</dt>
                      <dd className="mt-1 font-bold">{formatDate(power.expiresOn)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">المستند</dt>
                      <dd className="mt-1 font-bold">
                        {power.documentName ?? "غير مرتبط"}
                      </dd>
                    </div>
                  </dl>

                  {power.notes ? (
                    <p className="mt-4 rounded-md bg-[#f4f7f5] px-4 py-3 text-sm leading-7 text-muted">
                      {power.notes}
                    </p>
                  ) : null}

                  {power.projectId ? (
                    <Link
                      href={`/workspace/projects/${power.projectId}`}
                      className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-bold text-brand"
                    >
                      <FileText className="size-4" aria-hidden="true" />
                      فتح المشروع
                    </Link>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="rounded-md border border-line bg-surface px-5 py-12 text-center">
                <ScrollText className="mx-auto size-8 text-muted" aria-hidden="true" />
                <h2 className="mt-4 font-bold">لا توجد وكالات في هذا التصنيف</h2>
              </div>
            )}
          </div>
        </section>

        {access.permissions.includes("powers_of_attorney.manage") ? (
          <aside className="h-fit rounded-md border border-line bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">إضافة وكالة</h2>
            </div>
            <PowerOfAttorneyForm
              clients={clients}
              projects={projects}
              requests={requests}
              documents={documents}
            />
          </aside>
        ) : (
          <aside className="h-fit rounded-md border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-800">
            <AlertTriangle className="mb-3 size-5" aria-hidden="true" />
            لا تملك صلاحية إنشاء الوكالات، لكن يمكنك متابعة الوكالات المتاحة حسب نطاقك.
          </aside>
        )}
      </div>
    </AppShell>
  );
}
