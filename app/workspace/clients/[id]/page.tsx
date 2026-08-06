import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  FileText,
  FolderOpen,
  MessageSquareText,
  Search,
  ScrollText,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ClientApprovalRequestForm } from "@/components/operations/forms";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type View = "overview" | "requests" | "projects" | "client-documents" | "company-documents" | "conversations" | "offers" | "contracts" | "powers" | "approvals" | "legal-response";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "medium" }).format(new Date(value));
}

function isCompanyDocument(type: string | null) {
  return ["study", "contract", "proposal", "technical_financial_offer", "litigation_action_result"].includes(type ?? "");
}

export default async function ClientFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; project_q?: string }>;
}) {
  const { id } = await params;
  const { view: rawView, project_q: projectQuery = "" } = await searchParams;
  const view: View = ["requests", "projects", "client-documents", "company-documents", "conversations", "offers", "contracts", "powers", "approvals", "legal-response"].includes(rawView ?? "")
    ? (rawView as View)
    : "overview";
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");
  if (!access.permissions.includes("clients.read")) redirect("/workspace");

  const supabase = await createClient();
  const [clientResult, requestsResult, projectsResult, documentsResult, powersResult, approvalsResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id,display_name,primary_contact_name,primary_contact_phone,primary_contact_email,status,created_at,client_sources(name)")
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("service_requests")
      .select("id,title,request_number,request_type,status,created_at")
      .eq("client_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id,name,project_number,project_type,status,client_stage_label,created_at")
      .eq("client_id", id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id,title,document_type,document_number,document_date,description,created_at,service_request_id,project_id")
      .eq("client_id", id)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("powers_of_attorney")
      .select("id,power_number,issued_on,expires_on,status,project_id,service_request_id,documents(title)")
      .eq("client_id", id)
      .order("expires_on", { ascending: true, nullsFirst: false }),
    supabase
      .from("client_approval_requests")
      .select("id,title,description,status,due_at,created_at,service_request_id,project_id,document_id,client_approval_responses(decision,notes,responded_at)")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const client = clientResult.data;
  if (!client) notFound();
  const requests = requestsResult.data ?? [];
  const projects = projectsResult.data ?? [];
  const normalizedProjectQuery = projectQuery.trim().toLocaleLowerCase("ar");
  const visibleProjects = normalizedProjectQuery
    ? projects.filter((project) =>
        [project.name, project.project_number, project.project_type]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("ar").includes(normalizedProjectQuery)),
      )
    : projects;
  const documents = documentsResult.data ?? [];
  const requestIds = requests.map((request) => request.id);
  const projectIds = projects.map((project) => project.id);
  const [offersResult, contractsResult, consultationsResult, requestConversationsResult, projectConversationsResult] = await Promise.all([
    requestIds.length ? supabase.from("proposals").select("id,service_request_id,version_number,technical_scope,fee_amount,currency,valid_until,status,sent_at").in("service_request_id", requestIds).order("sent_at", { ascending: false }) : Promise.resolve({ data: [] }),
    requestIds.length ? supabase.from("contracts").select("id,service_request_id,status,accepted_at,contract_versions(id,version_number,title,status,sent_at)").in("service_request_id", requestIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    requestIds.length ? supabase.from("legal_consultation_responses").select("id,service_request_id,body,document_id,status,updated_at").in("service_request_id", requestIds).order("updated_at", { ascending: false }) : Promise.resolve({ data: [] }),
    requestIds.length ? supabase.from("conversations").select("id,title,service_request_id,conversation_type,last_message_at").in("service_request_id", requestIds).is("archived_at", null) : Promise.resolve({ data: [] }),
    projectIds.length ? supabase.from("conversations").select("id,title,project_id,conversation_type,last_message_at").in("project_id", projectIds).is("archived_at", null) : Promise.resolve({ data: [] }),
  ]);
  const clientDocuments = documents.filter((document) => !isCompanyDocument(document.document_type));
  const companyDocuments = documents.filter((document) => isCompanyDocument(document.document_type));
  const clientConversations = [...(requestConversationsResult.data ?? []), ...(projectConversationsResult.data ?? [])] as Array<{ id: string; title: string; service_request_id?: string; project_id?: string; conversation_type: string; last_message_at: string | null }>;
  const source = Array.isArray(client.client_sources) ? client.client_sources[0] : client.client_sources;
  const tabs: { code: View; label: string }[] = [
    { code: "overview", label: "بيانات العميل" },
    { code: "requests", label: "الطلبات" },
    { code: "projects", label: "المشاريع" },
    { code: "client-documents", label: "مستندات العميل" },
    { code: "company-documents", label: "مستندات الشركة" },
    { code: "conversations", label: "المحادثات" },
    { code: "offers", label: "العرض الفني والمالي" },
    { code: "contracts", label: "العقود" },
    { code: "powers", label: "التوكيلات" },
    { code: "approvals", label: "الموافقات" },
    { code: "legal-response", label: "الرد القانوني" },
  ];

  return (
    <AppShell access={access} eyebrow="سجل العملاء" title={client.display_name}>
      <Link href="/workspace/clients" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-brand">
        <ArrowRight className="size-4" aria-hidden="true" />
        سجل العملاء
      </Link>

      <section className="border-y border-line bg-surface px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs text-muted">جهة التواصل</p><p className="mt-1 font-bold">{client.primary_contact_name ?? "غير محددة"}</p></div>
          <div><p className="text-xs text-muted">الهاتف والبريد</p><p className="mt-1 font-bold">{client.primary_contact_phone ?? client.primary_contact_email ?? "غير محدد"}</p></div>
          <div><p className="text-xs text-muted">مصدر العميل</p><p className="mt-1 font-bold">{source?.name ?? "غير محدد"}</p></div>
        </div>
      </section>

      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="أقسام ملف العميل">
        {tabs.map((tab) => (
          <Link key={tab.code} href={`/workspace/clients/${id}?view=${tab.code}`} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-bold ${view === tab.code ? "border-brand text-brand" : "border-transparent text-muted hover:text-foreground"}`}>
            {tab.label}
          </Link>
        ))}
      </nav>

      {view === "overview" ? (
        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "طلبات العميل", value: requests.length, icon: FolderOpen },
            { label: "المشاريع", value: projects.length, icon: BriefcaseBusiness },
            { label: "المشاريع النشطة", value: projects.filter((project) => project.status === "active").length, icon: UserRound },
            { label: "التوكيلات", value: powersResult.data?.length ?? 0, icon: ScrollText },
          ].map(({ label, value, icon: Icon }) => (
            <article key={label} className="rounded-md border border-line bg-surface p-5">
              <Icon className="size-5 text-brand" aria-hidden="true" />
              <p className="mt-4 text-3xl font-bold tabular-nums">{value}</p>
              <p className="mt-1 text-sm text-muted">{label}</p>
            </article>
          ))}
        </section>
      ) : null}

      {view === "requests" ? (
        <section className="mt-6 divide-y divide-line rounded-md border border-line bg-surface">
          {requests.length ? requests.map((request) => <Link key={request.id} href={`/workspace/requests/${request.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[#fafbfa]"><div><p className="font-bold">{request.title}</p><p className="mt-1 text-xs text-muted">{request.request_number ?? "دون رقم"} · {request.request_type} · {dateLabel(request.created_at)}</p></div><span className="text-xs font-bold text-brand">{request.status}</span></Link>) : <p className="px-5 py-10 text-center text-sm text-muted">لا توجد طلبات مرتبطة بهذا العميل.</p>}
        </section>
      ) : null}

      {view === "projects" ? (
        <section className="mt-6 rounded-md border border-line bg-surface">
          <form method="get" className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
            <input type="hidden" name="view" value="projects" />
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <span className="sr-only">البحث في مشاريع العميل</span>
              <input name="project_q" defaultValue={projectQuery} placeholder="ابحث باسم المشروع أو رقمه أو نوعه" className="min-h-11 w-full rounded-md border border-line bg-white pr-10 pl-3 text-sm outline-none focus:border-brand" />
            </label>
            <button type="submit" className="min-h-11 rounded-md bg-brand px-5 text-sm font-bold text-white">بحث</button>
            {normalizedProjectQuery ? <Link href={`/workspace/clients/${id}?view=projects`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-sm font-bold text-muted">مسح البحث</Link> : null}
          </form>
          <div className="divide-y divide-line">
            {visibleProjects.length ? visibleProjects.map((project) => <Link key={project.id} href={`/workspace/projects/${project.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[#fafbfa]"><div><p className="font-bold">{project.name}</p><p className="mt-1 text-xs text-muted">{project.project_number ?? "دون رقم"} · {project.project_type} · {project.client_stage_label ?? "جاهز للتشغيل"}</p></div><span className="text-xs font-bold text-brand">{project.status}</span></Link>) : <p className="px-5 py-10 text-center text-sm text-muted">{normalizedProjectQuery ? "لا توجد مشاريع مطابقة للبحث." : "لا توجد مشاريع مرتبطة بهذا العميل."}</p>}
          </div>
        </section>
      ) : null}

      {view === "conversations" ? (
        <section className="mt-6 divide-y divide-line rounded-md border border-line bg-surface">
          {clientConversations.length ? clientConversations.map((conversation) => {
            const request = requests.find((item) => item.id === conversation.service_request_id);
            const project = projects.find((item) => item.id === conversation.project_id);
            const href = project ? `/workspace/projects/${project.id}?view=messages` : `/workspace/requests/${request?.id}`;
            return <Link key={conversation.id} href={href} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[#fafbfa]"><div><p className="font-bold">{conversation.title}</p><p className="mt-1 text-xs text-muted">{project?.name ?? request?.title ?? "ملف العميل"} · {conversation.conversation_type === "client" ? "محادثة العميل" : "محادثة داخلية"}</p></div><MessageSquareText className="size-5 text-brand" /></Link>;
          }) : <p className="px-5 py-10 text-center text-sm text-muted">لا توجد محادثات مرتبطة بملف العميل.</p>}
        </section>
      ) : null}

      {view === "offers" ? (
        <section className="mt-6 divide-y divide-line rounded-md border border-line bg-surface">
          {(offersResult.data ?? []).length ? (offersResult.data ?? []).map((offer) => { const request = requests.find((item) => item.id === offer.service_request_id); return <Link key={offer.id} href={`/workspace/requests/${offer.service_request_id}`} className="block px-5 py-4 hover:bg-[#fafbfa]"><div className="flex items-start justify-between gap-4"><div><p className="font-bold">{request?.title ?? "عرض فني ومالي"} · الإصدار {offer.version_number}</p><p className="mt-1 text-sm text-muted">{offer.technical_scope}</p><p className="mt-2 text-sm font-bold text-brand">{offer.fee_amount} {offer.currency}</p></div><span className="text-xs font-bold text-brand">{offer.status}</span></div></Link>; }) : <p className="px-5 py-10 text-center text-sm text-muted">لا توجد عروض فنية ومالية.</p>}
        </section>
      ) : null}

      {view === "contracts" ? (
        <section className="mt-6 divide-y divide-line rounded-md border border-line bg-surface">
          {(contractsResult.data ?? []).length ? (contractsResult.data ?? []).map((contract) => { const request = requests.find((item) => item.id === contract.service_request_id); const versions = Array.isArray(contract.contract_versions) ? contract.contract_versions : contract.contract_versions ? [contract.contract_versions] : []; return <Link key={contract.id} href={`/workspace/requests/${contract.service_request_id}`} className="block px-5 py-4 hover:bg-[#fafbfa]"><div className="flex items-start justify-between gap-4"><div><p className="font-bold">{request?.title ?? "عقد العميل"}</p><p className="mt-1 text-xs text-muted">{versions.length} إصدار · {contract.accepted_at ? `تم القبول ${dateLabel(contract.accepted_at)}` : "لم يعتمد العميل بعد"}</p></div><span className="text-xs font-bold text-brand">{contract.status}</span></div></Link>; }) : <p className="px-5 py-10 text-center text-sm text-muted">لا توجد عقود مرتبطة بالعميل.</p>}
        </section>
      ) : null}

      {view === "legal-response" ? (
        <section className="mt-6 divide-y divide-line rounded-md border border-line bg-surface">
          {(consultationsResult.data ?? []).length ? (consultationsResult.data ?? []).map((response) => { const request = requests.find((item) => item.id === response.service_request_id); return <article key={response.id} className="px-5 py-4"><div className="flex items-start justify-between gap-4"><div><p className="font-bold">{request?.title ?? "الرد على الاستشارة"}</p>{response.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted">{response.body}</p> : null}{response.document_id ? <Link href={`/documents/${response.document_id}/download`} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-brand"><FileText className="size-4" />عرض ملف الرد</Link> : null}</div><span className="text-xs font-bold text-brand">{response.status}</span></div></article>; }) : <p className="px-5 py-10 text-center text-sm text-muted">لا توجد ردود قانونية منشورة أو محفوظة.</p>}
        </section>
      ) : null}

      {view === "client-documents" || view === "company-documents" ? (
        <section className="mt-6 divide-y divide-line rounded-md border border-line bg-surface">
          {(view === "client-documents" ? clientDocuments : companyDocuments).length ? (view === "client-documents" ? clientDocuments : companyDocuments).map((document) => <article key={document.id} className="px-5 py-4"><div className="flex items-center gap-3"><FileText className="size-5 text-brand" aria-hidden="true" /><div><p className="font-bold">{document.title}</p><p className="mt-1 text-xs text-muted">{document.document_number ?? "دون رقم"} · {document.document_date ?? dateLabel(document.created_at)}</p>{document.description ? <p className="mt-2 text-sm text-muted">{document.description}</p> : null}</div></div></article>) : <p className="px-5 py-10 text-center text-sm text-muted">لا توجد مستندات في هذا القسم.</p>}
        </section>
      ) : null}

      {view === "powers" ? (
        <section className="mt-6 divide-y divide-line rounded-md border border-line bg-surface">
          {(powersResult.data ?? []).length ? (powersResult.data ?? []).map((power) => <article key={power.id} className="px-5 py-4"><div className="flex items-center justify-between gap-3"><div><p className="font-bold">وكالة رقم {power.power_number}</p><p className="mt-1 text-xs text-muted">الإصدار: {power.issued_on ?? "غير محدد"} · الانتهاء: {power.expires_on ?? "غير محدد"}</p></div><span className="text-xs font-bold text-brand">{power.status}</span></div></article>) : <p className="px-5 py-10 text-center text-sm text-muted">لا توجد توكيلات مرتبطة بهذا العميل.</p>}
        </section>
      ) : null}

      {view === "approvals" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="divide-y divide-line rounded-md border border-line bg-surface">
            {(approvalsResult.data ?? []).length ? (approvalsResult.data ?? []).map((approval) => {
              const responses = approval.client_approval_responses as unknown as { decision: string; notes: string | null; responded_at: string }[];
              const response = responses?.[0];
              return <article key={approval.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="font-bold">{approval.title}</p>{approval.description ? <p className="mt-2 text-sm leading-7 text-muted">{approval.description}</p> : null}</div>
                  <span className="rounded-md border border-line px-2 py-1 text-xs font-bold text-brand">{approval.status === "sent" ? "بانتظار العميل" : approval.status === "approved" ? "وافق العميل" : approval.status === "rejected" ? "رفض العميل" : approval.status}</span>
                </div>
                <p className="mt-2 text-xs text-muted">أرسلت: {dateLabel(approval.created_at)}{approval.due_at ? ` · الاستحقاق: ${dateLabel(approval.due_at)}` : ""}</p>
                {response ? <div className="mt-3 rounded-md bg-[#f7f9f8] p-3 text-sm"><p className="font-bold">رد العميل: {response.decision === "approved" ? "موافق" : "غير موافق"}</p>{response.notes ? <p className="mt-1 text-muted">{response.notes}</p> : null}</div> : null}
              </article>;
            }) : <p className="px-5 py-10 text-center text-sm text-muted">لا توجد موافقات مطلوبة من العميل.</p>}
          </section>
          {access.permissions.includes("client_approvals.manage") ? <section className="h-fit rounded-md border border-line bg-surface p-5"><div className="mb-4 flex items-center gap-2"><BadgeCheck className="size-5 text-brand" /><h2 className="font-bold">طلب موافقة جديدة</h2></div><ClientApprovalRequestForm clientId={id} requests={requests.map((item) => ({ id: item.id, name: item.title }))} projects={projects.map((item) => ({ id: item.id, name: item.name }))} documents={documents.map((item) => ({ id: item.id, name: item.title }))} /></section> : null}
        </div>
      ) : null}

    </AppShell>
  );
}
