import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getAccessContext } from "@/lib/auth/access";
import {
  labelFor,
  requestStatusLabels,
  requestStatusTone,
  requestTypeLabels,
} from "@/lib/pre-contract/status";
import { createClient } from "@/lib/supabase/server";

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
  const { data: requests } = await supabase
    .from("service_requests")
    .select("id, request_type, title, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <AppShell access={access} eyebrow="بوابة العميل" title="طلباتك القانونية">
      <div>
        <section>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">الطلبات الحالية</h2>
              <p className="mt-1 text-sm text-muted">
                تظهر هنا التحديثات والمستندات المنشورة لك فقط.
              </p>
            </div>
            <span className="grid size-10 place-items-center rounded-md bg-[#e5eee9] text-brand">
              <FolderOpen className="size-5" aria-hidden="true" />
            </span>
          </div>

          {requests?.length ? (
            <div className="mt-5 grid gap-3">
              {requests.map((request) => (
                <Link
                  key={request.id}
                  href={`/client/requests/${request.id}`}
                  className="grid gap-4 rounded-md border border-line bg-surface p-5 transition hover:border-brand sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gold">
                      {labelFor(requestTypeLabels, request.request_type)}
                    </p>
                    <h3 className="mt-1 truncate font-bold">{request.title}</h3>
                    <p className="mt-2 text-xs text-muted">
                      {new Intl.DateTimeFormat("ar-EG", {
                        dateStyle: "medium",
                      }).format(new Date(request.created_at))}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-md border px-3 py-1.5 text-xs font-bold ${requestStatusTone(request.status)}`}
                    >
                      {labelFor(requestStatusLabels, request.status)}
                    </span>
                    <ArrowLeft
                      className="size-4 text-muted"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-5 border-y border-line bg-surface px-5 py-8 text-center">
              <p className="font-bold">لا توجد طلبات حتى الآن</p>
              <p className="mt-2 text-sm text-muted">
                حسابك جاهز. سيظهر الطلب هنا بعد أن ينشئه مدير العملاء ويربطه
                بحسابك.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
