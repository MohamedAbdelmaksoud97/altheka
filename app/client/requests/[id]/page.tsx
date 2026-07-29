import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarClock,
  Download,
  FileText,
  History,
  Upload,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  ContractAcceptanceForm,
  ProposalResponseForm,
  UploadDocumentForm,
} from "@/components/pre-contract/forms";
import { getAccessContext } from "@/lib/auth/access";
import {
  labelFor,
  proposalStatusLabels,
  requestStatusLabels,
  requestStatusTone,
  requestTypeLabels,
} from "@/lib/pre-contract/status";
import { createClient } from "@/lib/supabase/server";

export default async function ClientRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (
    access.accountKind !== "client" ||
    !["client_waiting", "active_client"].includes(access.activationStatus)
  ) {
    redirect("/waiting");
  }

  const supabase = await createClient();
  const [
    requestResult,
    eventsResult,
    proposalsResult,
    contractsResult,
    documentsResult,
    projectResult,
  ] = await Promise.all([
    supabase
      .from("service_requests")
      .select("id, request_type, title, summary, status, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("pre_contract_events")
      .select("id, title, details, visibility, created_at")
      .eq("service_request_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("proposals")
      .select(
        "id, version_number, technical_scope, fee_amount, currency, valid_until, status, sent_at",
      )
      .eq("service_request_id", id)
      .order("version_number", { ascending: false }),
    supabase
      .from("contracts")
      .select(
        "id, status, current_version_number, contract_versions(id, version_number, title, contract_body, sha256, status, sent_at)",
      )
      .eq("service_request_id", id)
      .maybeSingle(),
    supabase
      .from("documents")
      .select(
        "id, title, document_type, current_version_number, created_at, document_versions(id, version_number, file_name, byte_size, uploaded_at)",
      )
      .eq("service_request_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, name, status, client_stage_label")
      .eq("service_request_id", id)
      .maybeSingle(),
  ]);

  const request = requestResult.data;
  if (!request) notFound();

  const documents = (documentsResult.data ?? []).map((document) => {
      const versions = document.document_versions as unknown as {
        id: string;
        version_number: number;
        file_name: string;
        byte_size: number;
        uploaded_at: string;
      }[];
      const version =
        versions.find(
          (candidate) =>
            candidate.version_number === document.current_version_number,
        ) ?? null;
      return {
        ...document,
        version,
      };
    });

  const latestProposal = proposalsResult.data?.[0] ?? null;
  const contract = contractsResult.data;
  const contractVersions = (contract?.contract_versions ?? []) as unknown as {
    id: string;
    version_number: number;
    title: string;
    contract_body: string;
    sha256: string;
    status: string;
    sent_at: string;
  }[];
  const currentContractVersion =
    contractVersions.find(
      (version) => version.version_number === contract?.current_version_number,
    ) ?? null;

  return (
    <AppShell
      access={access}
      eyebrow={labelFor(requestTypeLabels, request.request_type)}
      title={request.title}
    >
      <Link
        href="/client"
        className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-brand"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        جميع الطلبات
      </Link>

      <section className="border-y border-line bg-surface px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              {request.summary}
            </p>
            <p className="mt-2 text-xs text-muted">
              تاريخ الطلب:{" "}
              {new Intl.DateTimeFormat("ar-EG", {
                dateStyle: "long",
              }).format(new Date(request.created_at))}
            </p>
          </div>
          <span
            className={`rounded-md border px-3 py-2 text-xs font-bold ${requestStatusTone(request.status)}`}
          >
            {labelFor(requestStatusLabels, request.status)}
          </span>
        </div>
      </section>

      {projectResult.data ? (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <BriefcaseBusiness
              className="size-5 text-emerald-700"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-bold">تم إنشاء المشروع</h2>
              <p className="mt-1 text-sm text-emerald-800">
                {projectResult.data.client_stage_label ?? "تم بدء المشروع"}
              </p>
            </div>
          </div>
          <span className="text-sm font-bold text-emerald-800">
            {projectResult.data.name}
          </span>
        </section>
      ) : null}

      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-7">
          {latestProposal ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <BadgeCheck className="size-5 text-gold" aria-hidden="true" />
                  <h2 className="font-bold">
                    العرض الفني والمالي، الإصدار {latestProposal.version_number}
                  </h2>
                </div>
                <span className="text-xs font-bold text-muted">
                  {labelFor(proposalStatusLabels, latestProposal.status)}
                </span>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <p className="text-xs font-bold text-muted">النطاق الفني</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                    {latestProposal.technical_scope}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-3 border-y border-line py-4">
                  <div>
                    <p className="text-xs text-muted">الأتعاب</p>
                    <p className="mt-1 text-lg font-bold tabular-nums">
                      {new Intl.NumberFormat("ar-SA", {
                        style: "currency",
                        currency: latestProposal.currency.trim(),
                      }).format(Number(latestProposal.fee_amount))}
                    </p>
                  </div>
                  {latestProposal.valid_until ? (
                    <div>
                      <p className="text-xs text-muted">صالح حتى</p>
                      <p className="mt-1 font-bold">
                        {new Intl.DateTimeFormat("ar-EG").format(
                          new Date(latestProposal.valid_until),
                        )}
                      </p>
                    </div>
                  ) : null}
                </div>
                {latestProposal.status === "sent" ? (
                  <ProposalResponseForm
                    requestId={request.id}
                    proposalId={latestProposal.id}
                  />
                ) : null}
              </div>
            </section>
          ) : null}

          {currentContractVersion ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <FileText className="size-5 text-brand" aria-hidden="true" />
                <div>
                  <h2 className="font-bold">{currentContractVersion.title}</h2>
                  <p className="mt-1 text-xs text-muted">
                    نسخة {currentContractVersion.version_number}
                  </p>
                </div>
              </div>
              <div className="p-5">
                <div className="max-h-[30rem] overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-[#fafbfa] p-4 text-sm leading-8">
                  {currentContractVersion.contract_body}
                </div>
                <p className="mt-3 break-all font-mono text-[11px] text-muted">
                  SHA-256: {currentContractVersion.sha256}
                </p>
                {currentContractVersion.status === "sent" ? (
                  <div className="mt-5">
                    <ContractAcceptanceForm
                      requestId={request.id}
                      contractVersionId={currentContractVersion.id}
                    />
                  </div>
                ) : (
                  <p className="mt-5 flex items-center gap-2 font-bold text-emerald-700">
                    <BadgeCheck className="size-5" aria-hidden="true" />
                    تم توثيق اعتماد هذه النسخة
                  </p>
                )}
              </div>
            </section>
          ) : null}

          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Upload className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">رفع مستند</h2>
            </div>
            <div className="p-5">
              <UploadDocumentForm requestId={request.id} />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <FileText className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">المستندات</h2>
            </div>
            <div className="divide-y divide-line">
              {documents.length ? (
                documents.map((document) => (
                  <article key={document.id} className="px-5 py-4">
                    <p className="text-sm font-bold">{document.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {document.version?.file_name}
                    </p>
                    {document.version ? (
                      <a
                        href={`/documents/${document.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-brand"
                      >
                        <Download className="size-4" aria-hidden="true" />
                        تنزيل
                      </a>
                    ) : null}
                  </article>
                ))
              ) : (
                <p className="px-5 py-6 text-sm text-muted">
                  لا توجد مستندات منشورة.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <History className="size-5 text-gold" aria-hidden="true" />
              <h2 className="font-bold">آخر التحديثات</h2>
            </div>
            <ol className="divide-y divide-line">
              {(eventsResult.data ?? []).map((event) => (
                <li key={event.id} className="px-5 py-4">
                  <div className="flex gap-3">
                    <CalendarClock
                      className="mt-0.5 size-4 shrink-0 text-muted"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-bold">{event.title}</p>
                      {event.details ? (
                        <p className="mt-1 text-xs leading-6 text-muted">
                          {event.details}
                        </p>
                      ) : null}
                      <time className="mt-1 block text-[11px] text-muted">
                        {new Intl.DateTimeFormat("ar-EG", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(event.created_at))}
                      </time>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
