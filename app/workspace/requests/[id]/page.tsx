import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Download,
  FileText,
  History,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  LegalConsultationResponseForm,
  PreContractExtensionRequestForm,
  PreContractExtensionReviewForm,
  PreContractAttentionReviewForm,
} from "@/components/operations/forms";
import {
  AssignRequestForm,
  ContractForm,
  ConvertToProjectForm,
  DocumentPublicationForm,
  LinkClientForm,
  ProposalForm,
  ReviewStudyForm,
  StudyForm,
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

type Person = { id: string; full_name: string };
type EligibleStudyPerson = Person & {
  can_execute: boolean;
  can_approve: boolean;
};

const documentStatusLabels: Record<string, string> = {
  draft: "مسودة",
  awaiting_approval: "بانتظار اعتماد النشر",
  published: "منشور للعميل",
  withdrawn: "مسحوب من العميل",
};

export default async function WorkspaceRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const supabase = await createClient();
  const [
    requestResult,
    caseResult,
    studiesResult,
    proposalsResult,
    contractsResult,
    documentsResult,
    eventsResult,
    eligibleStaffResult,
    projectResult,
    documentCategoriesResult,
    extensionRequestsResult,
    consultationResult,
    preContractNoticesResult,
  ] = await Promise.all([
    supabase
      .from("service_requests")
      .select(
        "id, client_id, created_by, request_type, litigation_case_category_id, needs_category_review, title, summary, status, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("pre_contract_cases")
      .select(
        "responsible_id, executor_id, follower_id, approver_id, expected_project_type, assigned_at, offer_due_at, client_response_due_at, contract_due_at",
      )
      .eq("service_request_id", id)
      .maybeSingle(),
    supabase
      .from("legal_studies")
      .select(
        "id, version_number, summary, legal_opinion, recommended_path, status, prepared_by, submitted_at, reviewed_by, reviewed_at, review_notes",
      )
      .eq("service_request_id", id)
      .order("version_number", { ascending: false }),
    supabase
      .from("proposals")
      .select(
        "id, version_number, technical_scope, fee_amount, currency, valid_until, status, sent_at, proposal_responses(response_type, requested_amount, message, created_at)",
      )
      .eq("service_request_id", id)
      .order("version_number", { ascending: false }),
    supabase
      .from("contracts")
      .select(
        "id, status, current_version_number, accepted_at, contract_versions(id, version_number, title, contract_body, sha256, status, sent_at)",
      )
      .eq("service_request_id", id)
      .maybeSingle(),
    supabase
      .from("documents")
      .select(
        "id, title, document_type, document_number, document_date, description, page_count, visibility, client_visibility_status, current_version_number, published_to_client_at, withdrawn_at, created_at, document_categories(name), document_versions(id, version_number, file_name, byte_size, uploaded_at), document_access_events(id, created_at)",
      )
      .eq("service_request_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("pre_contract_events")
      .select("id, title, details, visibility, created_at")
      .eq("service_request_id", id)
      .order("created_at", { ascending: false }),
    supabase.rpc("list_eligible_study_staff", { p_request_id: id }),
    supabase
      .from("projects")
      .select("id, name, status, litigation_case_category_id")
      .eq("service_request_id", id)
      .maybeSingle(),
    supabase
      .from("document_categories")
      .select("id, code, name, scope, sort_order")
      .eq("is_active", true)
      .in("scope", ["all", "request"])
      .order("sort_order"),
    supabase
      .from("pre_contract_extension_requests")
      .select("id,phase,current_due_at,requested_due_at,reason,status,created_at,review_notes,requested_by,requester:profiles!pre_contract_extension_requests_requested_by_fkey(full_name)")
      .eq("service_request_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("legal_consultation_responses")
      .select("id,body,document_id,status,updated_at")
      .eq("service_request_id", id)
      .maybeSingle(),
    supabase
      .from("pre_contract_attention_notices")
      .select("id,phase,due_at,reason,status,rejection_reason,created_at")
      .eq("service_request_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const request = requestResult.data;
  if (!request) notFound();

  const caseRecord = caseResult.data;
  const participantIds = [
    caseRecord?.responsible_id,
    caseRecord?.executor_id,
    caseRecord?.follower_id,
    caseRecord?.approver_id,
  ].filter((value): value is string => Boolean(value));
  const { data: participantProfiles } = participantIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", participantIds)
    : { data: [] as Person[] };
  const names = new Map(
    (participantProfiles ?? []).map((person) => [person.id, person.full_name]),
  );

  const clientResult = request.client_id
    ? await supabase
        .from("clients")
        .select("display_name")
        .eq("id", request.client_id)
        .maybeSingle()
    : { data: null };

  const documents = (documentsResult.data ?? []).map((document) => {
      const versions = document.document_versions as unknown as {
        id: string;
        version_number: number;
        file_name: string;
        byte_size: number;
        uploaded_at: string;
      }[];
      const accessEvents = document.document_access_events as unknown as {
        id: number;
        created_at: string;
      }[];
      const version =
        versions.find(
          (candidate) =>
            candidate.version_number === document.current_version_number,
        ) ?? null;
      return {
        ...document,
        version,
        accessCount: accessEvents?.length ?? 0,
      };
    });

  const studies = studiesResult.data ?? [];
  const latestStudy = studies[0] ?? null;
  const latestProposal = proposalsResult.data?.[0] ?? null;
  const responseRows = (latestProposal?.proposal_responses ?? []) as unknown as {
    response_type: string;
    requested_amount: number | null;
    message: string | null;
    created_at: string;
  }[];
  const latestResponse = responseRows.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];

  const canManageRequest = access.permissions.includes("requests.manage");
  const canLinkClient = access.permissions.includes("requests.link_client");
  const canAssignStudy = access.permissions.includes("studies.assign");
  const canManagePublication =
    access.permissions.includes("documents.publish") &&
    access.permissions.includes("documents.withdraw");
  const requiredStudyApproval =
    request.request_type === "estate"
      ? "studies.approve_estates"
      : "studies.approve_litigation";
  const canSubmitStudy =
    Boolean(caseRecord) &&
    caseRecord?.executor_id === access.userId &&
    access.permissions.includes("studies.submit") &&
    ["assigned", "study_returned"].includes(request.status);
  const canReviewStudy =
    latestStudy?.status === "submitted" &&
    caseRecord?.approver_id === access.userId &&
    access.permissions.includes(requiredStudyApproval);
  const canUpload =
    access.permissions.includes("documents.upload") &&
    (canManageRequest || participantIds.includes(access.userId));
  const canSendProposal =
    access.permissions.includes("offers.send") &&
    ["study_approved", "discount_requested", "negotiating"].includes(
      request.status,
    );
  const canSendContract =
    access.permissions.includes("contracts.send") &&
    request.status === "proposal_accepted";
  const canConvert =
    access.permissions.includes("projects.create") &&
    request.status === "contract_accepted";
  const eligibleStaff =
    (eligibleStaffResult.data ?? []) as EligibleStudyPerson[];
  const eligibleExecutors = eligibleStaff.filter((person) => person.can_execute);
  const eligibleApprovers = eligibleStaff.filter((person) => person.can_approve);
  const canReviewExtensions = access.roleCodes.some((role) => ["super_admin", "executive_manager", "litigation_manager", "estates_manager"].includes(role));
  const canReviewAttentionNotices = access.permissions.includes("attention_notices.review");
  const canManageConsultation = access.permissions.includes("consultations.manage");

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
        href="/workspace/requests"
        className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-brand"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        صندوق الطلبات
      </Link>

      <section className="border-y border-line bg-surface px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-gold">
              {clientResult.data?.display_name ?? "عميل بانتظار الربط"}
            </p>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-muted">
              {request.summary}
            </p>
          </div>
          <span
            className={`rounded-md border px-3 py-2 text-xs font-bold ${requestStatusTone(request.status)}`}
          >
            {labelFor(requestStatusLabels, request.status)}
          </span>
        </div>
      </section>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-7">
          {caseRecord ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4"><CalendarClock className="size-5 text-brand" aria-hidden="true" /><h2 className="font-bold">المدد الزمنية قبل التعاقد</h2></div>
              <div className="grid gap-3 p-5 sm:grid-cols-3">
                {[
                  ["إعداد العرض", caseRecord.offer_due_at],
                  ["انتظار رد العميل", caseRecord.client_response_due_at],
                  ["إعداد العقد", caseRecord.contract_due_at],
                ].map(([label, due]) => <div key={label} className="rounded-md border border-line p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-bold">{due ? new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(due)) : "لم تبدأ المدة"}</p></div>)}
              </div>
              {caseRecord.executor_id === access.userId ? <div className="border-t border-line p-5"><h3 className="mb-3 text-sm font-bold">طلب تمديد</h3><PreContractExtensionRequestForm requestId={id} /></div> : null}
              {(extensionRequestsResult.data ?? []).length ? <div className="divide-y divide-line border-t border-line">{(extensionRequestsResult.data ?? []).map((extension) => {
                const requester = Array.isArray(extension.requester) ? extension.requester[0] : extension.requester;
                return <article key={extension.id} className="px-5 py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">طلب تمديد: {extension.phase === "offer" ? "العرض" : extension.phase === "contract" ? "العقد" : "رد العميل"}</p><p className="mt-1 text-xs text-muted">{requester?.full_name ?? "المختص"} · حتى {new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(extension.requested_due_at))}</p></div><span className="text-xs font-bold text-brand">{extension.status === "pending" ? "بانتظار الاعتماد" : extension.status === "approved" ? "معتمد" : "مرفوض"}</span></div><p className="mt-2 text-sm text-muted">{extension.reason}</p>{extension.status === "pending" && canReviewExtensions ? <PreContractExtensionReviewForm requestId={id} extensionId={extension.id} /> : null}</article>;
              })}</div> : null}
              {(preContractNoticesResult.data ?? []).length ? <div className="divide-y divide-line border-t border-line">{(preContractNoticesResult.data ?? []).map((notice)=><article key={notice.id} className="px-5 py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-red-800">لفت نظر: {notice.phase==="offer"?"إعداد العرض":notice.phase==="contract"?"إعداد العقد":"انتظار رد العميل"}</p><p className="mt-1 text-sm text-muted">{notice.reason}</p></div><span className="text-xs font-bold">{notice.status==="pending"?"معلّق":notice.status==="active"?"قائم":notice.status==="rejected"?"مرفوض":"تم الاطلاع"}</span></div>{notice.rejection_reason?<p className="mt-2 text-sm text-red-700">سبب الرفض: {notice.rejection_reason}</p>:null}{notice.status==="pending"&&canReviewAttentionNotices?<PreContractAttentionReviewForm requestId={id} noticeId={notice.id}/>:null}</article>)}</div> : null}
            </section>
          ) : null}

          {request.request_type === "consultation" && canManageConsultation ? (
            <section className="rounded-md border border-line bg-surface"><div className="flex items-center gap-3 border-b border-line px-5 py-4"><FileText className="size-5 text-brand" aria-hidden="true" /><h2 className="font-bold">الرد القانوني على الاستشارة</h2></div><div className="p-5"><LegalConsultationResponseForm requestId={id} documents={documents.map((document) => ({ id: document.id, name: document.title }))} initialBody={consultationResult.data?.body ?? ""} initialDocumentId={consultationResult.data?.document_id ?? ""} /><p className="mt-3 text-xs text-muted">الحالة الحالية: {consultationResult.data?.status === "published" ? "منشور للعميل" : consultationResult.data ? "مسودة داخلية" : "لم يبدأ الرد"}</p></div></section>
          ) : null}
          {canLinkClient && request.status === "received" ? (
            <OperationSection
              title="ربط حساب العميل"
              description="ينشئ ملف العميل أو يربط الملف الموجود بهذا الطلب."
            >
              <LinkClientForm requestId={request.id} />
            </OperationSection>
          ) : null}

          {canAssignStudy &&
          caseRecord &&
          ["linked", "collecting_documents", "assigned"].includes(
            request.status,
          ) ? (
            <OperationSection
              title="اختيار المكلف والمعتمد"
              description="المسؤول والمتابع هما مدير العملاء افتراضيًا، ويمكن إعادة التكليف مع بقاء الأثر في سجل التدقيق."
            >
              <AssignRequestForm
                requestId={request.id}
                executors={eligibleExecutors}
                approvers={eligibleApprovers}
                defaultExecutorId={caseRecord.executor_id}
                defaultApproverId={caseRecord.approver_id}
              />
            </OperationSection>
          ) : null}

          {canSubmitStudy ? (
            <OperationSection
              title={
                request.status === "study_returned"
                  ? "تعديل الدراسة"
                  : "إعداد الدراسة القانونية"
              }
            >
              <StudyForm
                requestId={request.id}
                returnedStudy={
                  latestStudy?.status === "returned" ? latestStudy : null
                }
              />
            </OperationSection>
          ) : null}

          {latestStudy ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <FileText className="size-5 text-brand" aria-hidden="true" />
                  <h2 className="font-bold">
                    الدراسة القانونية، الإصدار {latestStudy.version_number}
                  </h2>
                </div>
                <span className="text-xs font-bold text-muted">
                  {latestStudy.status === "approved"
                    ? "معتمدة"
                    : latestStudy.status === "returned"
                      ? "معادة للتعديل"
                      : "بانتظار الاعتماد"}
                </span>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <p className="text-xs font-bold text-muted">الملخص</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                    {latestStudy.summary}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted">الرأي القانوني</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                    {latestStudy.legal_opinion}
                  </p>
                </div>
                {canReviewStudy ? (
                  <div className="border-t border-line pt-5">
                    <ReviewStudyForm
                      requestId={request.id}
                      studyId={latestStudy.id}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {canSendProposal ? (
            <OperationSection
              title={
                latestProposal ? "إعداد عرض معدل" : "العرض الفني والمالي"
              }
              description={
                latestResponse?.message
                  ? `ملاحظة العميل: ${latestResponse.message}`
                  : undefined
              }
            >
              {latestResponse?.requested_amount != null ? (
                <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  المبلغ المقترح من العميل:{" "}
                  {new Intl.NumberFormat("ar-SA").format(
                    Number(latestResponse.requested_amount),
                  )}
                </p>
              ) : null}
              <ProposalForm
                requestId={request.id}
                previousProposal={latestProposal}
              />
            </OperationSection>
          ) : null}

          {latestProposal ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <BadgeCheck className="size-5 text-gold" aria-hidden="true" />
                  <h2 className="font-bold">
                    آخر عرض، الإصدار {latestProposal.version_number}
                  </h2>
                </div>
                <span className="text-xs font-bold text-muted">
                  {labelFor(proposalStatusLabels, latestProposal.status)}
                </span>
              </div>
              <div className="p-5">
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {latestProposal.technical_scope}
                </p>
                <p className="mt-4 text-xl font-bold tabular-nums">
                  {new Intl.NumberFormat("ar-SA", {
                    style: "currency",
                    currency: latestProposal.currency.trim(),
                  }).format(Number(latestProposal.fee_amount))}
                </p>
              </div>
            </section>
          ) : null}

          {canSendContract ? (
            <OperationSection title="إعداد العقد">
              <ContractForm requestId={request.id} />
            </OperationSection>
          ) : null}

          {currentContractVersion ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <FileText className="size-5 text-brand" aria-hidden="true" />
                  <h2 className="font-bold">{currentContractVersion.title}</h2>
                </div>
                <span className="text-xs font-bold text-muted">
                  نسخة {currentContractVersion.version_number}
                </span>
              </div>
              <div className="p-5">
                <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-[#fafbfa] p-4 text-sm leading-8">
                  {currentContractVersion.contract_body}
                </div>
                <p className="mt-3 break-all font-mono text-[11px] text-muted">
                  SHA-256: {currentContractVersion.sha256}
                </p>
              </div>
            </section>
          ) : null}

          {canConvert ? (
            <OperationSection
              title="تحويل الطلب إلى مشروع"
              description="ينشئ المشروع مرة واحدة، يربط الأعضاء، ويبدأ قالب التقاضي المنشور تلقائيًا عند انطباقه."
            >
              <ConvertToProjectForm requestId={request.id} />
            </OperationSection>
          ) : null}

          {projectResult.data ? (
            <section className="rounded-md border border-emerald-200 bg-emerald-50 px-5 py-5">
              <h2 className="font-bold text-emerald-900">
                المشروع نشط: {projectResult.data.name}
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                معرف المشروع: {projectResult.data.id}
              </p>
            </section>
          ) : null}

          {canUpload ? (
            <OperationSection title="إضافة مستند">
              <UploadDocumentForm
                requestId={request.id}
                canPublish={canManagePublication}
                documentCategories={documentCategoriesResult.data ?? []}
              />
            </OperationSection>
          ) : null}
        </div>

        <aside className="space-y-6">
          {caseRecord ? (
            <section className="rounded-md border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <UsersRound className="size-5 text-brand" aria-hidden="true" />
                <h2 className="font-bold">أطراف الإجراء</h2>
              </div>
              <dl className="divide-y divide-line text-sm">
                <Participant
                  label="المسؤول"
                  name={names.get(caseRecord.responsible_id)}
                />
                <Participant
                  label="المنفذ"
                  name={
                    caseRecord.executor_id
                      ? names.get(caseRecord.executor_id)
                      : undefined
                  }
                />
                <Participant
                  label="المتابع"
                  name={names.get(caseRecord.follower_id)}
                />
                <Participant
                  label="المعتمد"
                  name={
                    caseRecord.approver_id
                      ? names.get(caseRecord.approver_id)
                      : undefined
                  }
                />
              </dl>
            </section>
          ) : null}

          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <FileText className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">المستندات</h2>
            </div>
            <div className="divide-y divide-line">
              {documents.length ? (
                documents.map((document) => (
                  <article
                    key={document.id}
                    data-testid={`document-${document.id}`}
                    className="px-5 py-4"
                  >
                    <p className="text-sm font-bold">{document.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {document.version?.file_name}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-muted">
                      {((document.document_categories as { name?: string } | null)
                        ?.name ?? document.document_type)}
                      {document.document_number
                        ? ` · رقم ${document.document_number}`
                        : ""}
                      {document.document_date
                        ? ` · ${new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh" }).format(
                            new Date(document.document_date),
                          )}`
                        : ""}
                      {document.page_count
                        ? ` · ${document.page_count} صفحة`
                        : ""}
                    </p>
                    {document.description ? (
                      <p className="mt-1 text-xs leading-5 text-muted">
                        {document.description}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-muted">
                        {documentStatusLabels[
                          String(document.client_visibility_status)
                        ] ?? "غير محدد"}
                      </span>
                      {document.version ? (
                        <a
                          href={`/documents/${document.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          title="تنزيل المستند"
                          className="grid size-8 place-items-center rounded-md border border-line text-brand"
                        >
                          <Download className="size-4" aria-hidden="true" />
                          <span className="sr-only">تنزيل</span>
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      طلبات التنزيل المسجلة: {document.accessCount}
                    </p>
                    {canManagePublication ? (
                      <DocumentPublicationForm
                        requestId={request.id}
                        documentId={document.id}
                        visibility={document.visibility}
                        status={document.client_visibility_status}
                      />
                    ) : null}
                  </article>
                ))
              ) : (
                <p className="px-5 py-6 text-sm text-muted">
                  لم ترفع مستندات بعد.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-md border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <History className="size-5 text-gold" aria-hidden="true" />
              <h2 className="font-bold">سجل الطلب</h2>
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
                          timeZone: "Asia/Riyadh",
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

function OperationSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-bold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Participant({
  label,
  name,
}: {
  label: string;
  name?: string;
}) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-3 px-5 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-bold">{name ?? "لم يحدد بعد"}</dd>
    </div>
  );
}
