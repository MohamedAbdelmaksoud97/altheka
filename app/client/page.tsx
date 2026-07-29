import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  FolderOpen,
  MessageSquareText,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getAccessContext } from "@/lib/auth/access";
import {
  labelFor,
  requestStatusLabels,
  requestStatusTone,
  requestTypeLabels,
} from "@/lib/pre-contract/status";
import {
  projectStatusLabels,
  projectStatusTone,
  projectTypeLabels,
} from "@/lib/projects/labels";
import { createClient } from "@/lib/supabase/server";

type ClientProject = {
  id: string;
  name: string;
  project_number: string | null;
  project_type: string;
  status: string;
  client_stage_label: string | null;
  primary_contact_name: string | null;
};

export default async function ClientPortalPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (
    access.accountKind !== "client" ||
    !["client_waiting", "active_client"].includes(access.activationStatus)
  ) {
    redirect("/waiting");
  }

  const supabase = await createClient();
  const [{ data: requests }, { data: projects }] = await Promise.all([
    supabase
      .from("service_requests")
      .select("id, request_type, title, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_my_client_projects", { p_project_id: null }),
  ]);

  const clientProjects = (projects ?? []) as ClientProject[];

  return (
    <AppShell
      access={access}
      eyebrow="بوابة العميل"
      title="ملفك القانوني"
    >
      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">المشاريع الحالية</h2>
            <p className="mt-1 text-sm text-muted">
              مرحلة مبسطة، مسؤول التواصل، والمحتوى المنشور لك فقط.
            </p>
          </div>
          <span className="grid size-10 place-items-center rounded-md bg-[#e5eee9] text-brand">
            <BriefcaseBusiness className="size-5" aria-hidden="true" />
          </span>
        </div>

        {clientProjects.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {clientProjects.map((project) => (
              <Link
                key={project.id}
                href={`/client/projects/${project.id}`}
                className="rounded-md border border-line bg-surface p-5 transition hover:border-brand"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gold">
                      {labelFor(projectTypeLabels, project.project_type)}
                    </p>
                    <h3 className="mt-1 truncate font-bold">{project.name}</h3>
                    <p className="mt-1 text-xs text-muted">
                      {project.project_number ?? "مشروع جديد"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-3 py-1 text-xs font-bold ${projectStatusTone(project.status)}`}
                  >
                    {labelFor(projectStatusLabels, project.status)}
                  </span>
                </div>
                <div className="mt-5 border-y border-line py-4">
                  <p className="text-xs text-muted">المرحلة الحالية</p>
                  <p className="mt-1 font-bold text-brand">
                    {project.client_stage_label ?? "تم بدء المشروع"}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 text-muted">
                    <MessageSquareText className="size-4" aria-hidden="true" />
                    تواصل ومستندات
                  </span>
                  <ArrowLeft className="size-4 text-brand" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 border-y border-line bg-surface px-5 py-8 text-center">
            <p className="font-bold">لا توجد مشاريع حتى الآن</p>
            <p className="mt-2 text-sm text-muted">
              يظهر المشروع هنا بعد اكتمال التعاقد وبدء العمل.
            </p>
          </div>
        )}
      </section>

      <section className="mt-9">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">طلبات الخدمة</h2>
            <p className="mt-1 text-sm text-muted">
              تابع إجراءات الدراسة والعرض والعقد قبل بدء المشروع.
            </p>
          </div>
          <span className="grid size-10 place-items-center rounded-md bg-[#f5ecd6] text-[#825f17]">
            <FolderOpen className="size-5" aria-hidden="true" />
          </span>
        </div>

        {requests?.length ? (
          <div className="mt-5 divide-y divide-line rounded-md border border-line bg-surface">
            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/client/requests/${request.id}`}
                className="grid gap-4 px-5 py-4 transition hover:bg-[#fafbfa] sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gold">
                    {labelFor(requestTypeLabels, request.request_type)}
                  </p>
                  <h3 className="mt-1 truncate font-bold">{request.title}</h3>
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
          <div className="mt-5 border-y border-line bg-surface px-5 py-8 text-center text-sm text-muted">
            حسابك جاهز، وسيظهر الطلب بعد أن ينشئه مدير العملاء ويربطه بحسابك.
          </div>
        )}
      </section>
    </AppShell>
  );
}
