"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  BadgeCheck,
  CalendarPlus,
  Check,
  ClipboardPlus,
  LoaderCircle,
  MessageSquareText,
  PenLine,
  ScrollText,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { saudiDateTimeLocalValue } from "@/lib/datetime";
import {
  createAppointmentAction,
  createClientApprovalRequestAction,
  createProjectTaskThreadAction,
  createWorkspaceConversationAction,
  sendWorkspaceMessageAction,
  createEstatePartyApprovalRequestAction,
  createPowerOfAttorneyAction,
  proposeWorkflowActionAction,
  recordWorkflowActionUpdateAction,
  requestPreContractExtensionAction,
  respondClientApprovalRequestAction,
  reviewPreContractExtensionAction,
  reviewPreContractAttentionNoticeAction,
  reviewProjectAttentionNoticeAction,
  setProjectHealthAction,
  submitProjectTaskStepAction,
  reviewProjectTaskStepAction,
  closeProjectTaskThreadAction,
  requestProjectTaskStepExtensionAction,
  reviewProjectTaskStepExtensionAction,
  reviewProjectTaskStepAttentionAction,
  reviewWorkflowActionExtensionAction,
  respondEstatePartyApprovalAction,
  reviewProposedWorkflowActionAction,
  upsertLegalConsultationResponseAction,
} from "@/app/actions/operations";
import {
  initialActionState,
  type ActionState,
} from "@/app/actions/action-state";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none";
const textareaClass =
  "w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm leading-7 focus:border-brand focus:outline-none";

type Option = { id: string; name: string; meta?: string | null };
type LinkedOption = Option & {
  clientId: string;
  projectId?: string | null;
  requestId?: string | null;
};

function ActionNotice({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      className={`rounded-md border px-4 py-3 text-sm ${
        state.status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {state.message}
    </p>
  );
}

function SubmitButton({
  label,
  icon: Icon,
}: {
  label: string;
  icon: LucideIcon;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-bold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="size-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

function dateTimeLocalValue(date: Date) {
  return saudiDateTimeLocalValue(date);
}

export function WorkflowActionUpdateForm({
  projectId,
  actionId,
}: {
  projectId: string;
  actionId: string;
}) {
  const [state, action] = useActionState(
    recordWorkflowActionUpdateAction,
    initialActionState,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <input
        type="hidden"
        name="workflow_action_instance_id"
        value={actionId}
      />
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
        <select name="update_type" defaultValue="note" className={inputClass}>
          <option value="note">ملاحظة</option>
          <option value="progress">نسبة إنجاز</option>
          <option value="extension_request">طلب تمديد</option>
        </select>
        <input
          type="number"
          name="progress_percent"
          min={0}
          max={100}
          placeholder="نسبة الإنجاز"
          className={inputClass}
        />
      </div>
      <input
        type="datetime-local"
        name="requested_due_at"
        className={inputClass}
      />
      <textarea
        name="notes"
        rows={3}
        placeholder="تفاصيل التحديث أو سبب التمديد"
        className={textareaClass}
      />
      <ActionNotice state={state} />
      <SubmitButton label="حفظ تحديث المهمة" icon={PenLine} />
    </form>
  );
}

export function WorkspaceConversationForm({ staff }: { staff: Option[] }) {
  const [state, action] = useActionState(createWorkspaceConversationAction, initialActionState);
  return <form action={action} className="space-y-3">
    <input name="title" required minLength={3} placeholder="اسم مجموعة العمل" className={inputClass} />
    <fieldset className="space-y-2">
      <legend className="text-sm font-bold text-ink">المعنيون بالمجموعة</legend>
      <div className="grid max-h-52 gap-2 overflow-y-auto rounded-md border border-line p-3 sm:grid-cols-2">
        {staff.map((member) => <label key={member.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="participant_user_ids" value={member.id} className="size-4" />{member.name}</label>)}
      </div>
    </fieldset>
    <ActionNotice state={state} />
    <SubmitButton label="إنشاء مجموعة" icon={MessageSquareText} />
  </form>;
}

export function WorkspaceMessageForm({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(sendWorkspaceMessageAction, initialActionState);
  return <form action={action} className="space-y-3"><input type="hidden" name="conversation_id" value={conversationId}/><textarea name="body" required rows={3} placeholder="اكتب رسالة لفريق العمل" className={textareaClass}/><ActionNotice state={state}/><SubmitButton label="إرسال" icon={MessageSquareText}/></form>;
}

export function WorkflowExtensionReviewForm({
  projectId,
  updateId,
}: {
  projectId: string;
  updateId: string;
}) {
  const [state, action] = useActionState(
    reviewWorkflowActionExtensionAction,
    initialActionState,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="workflow_action_update_id" value={updateId} />
      <textarea
        name="review_notes"
        rows={2}
        placeholder="ملاحظة المراجعة، وتكون مطلوبة عند الرفض"
        className={textareaClass}
      />
      <ActionNotice state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="approved" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white">
          <Check className="size-4" aria-hidden="true" />
          اعتماد التمديد
        </button>
        <button type="submit" name="decision" value="rejected" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-danger bg-white px-4 text-sm font-bold text-danger">
          <X className="size-4" aria-hidden="true" />
          رفض التمديد
        </button>
      </div>
    </form>
  );
}

export function ProposedTaskForm({
  projectId,
  stages,
  projects = [],
}: {
  projectId?: string;
  stages: Option[];
  projects?: Option[];
}) {
  const [state, action] = useActionState(
    proposeWorkflowActionAction,
    initialActionState,
  );
  return (
    <form action={action} className="space-y-3">
      {projectId ? (
        <input type="hidden" name="project_id" value={projectId} />
      ) : (
        <select name="project_id" required className={inputClass}>
          <option value="">اختر المشروع</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      )}
      <select name="workflow_stage_instance_id" className={inputClass}>
        <option value="">بدون مرحلة محددة</option>
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
      <input
        name="title"
        required
        minLength={3}
        placeholder="عنوان المهمة المقترحة"
        className={inputClass}
      />
      <input
        type="datetime-local"
        name="proposed_due_at"
        className={inputClass}
      />
      <textarea
        name="description"
        rows={3}
        placeholder="وصف المهمة"
        className={textareaClass}
      />
      <ActionNotice state={state} />
      <SubmitButton label="اقتراح مهمة" icon={ClipboardPlus} />
    </form>
  );
}

export function ProposedTaskReviewForm({
  projectId,
  proposedActionId,
}: {
  projectId: string;
  proposedActionId: string;
}) {
  const [state, action] = useActionState(
    reviewProposedWorkflowActionAction,
    initialActionState,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="proposed_action_id" value={proposedActionId} />
      <textarea
        name="review_notes"
        rows={2}
        placeholder="ملاحظات الاعتماد"
        className={textareaClass}
      />
      <ActionNotice state={state} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="approved"
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white"
        >
          <Check className="size-4" aria-hidden="true" />
          اعتماد
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-danger bg-white px-4 text-sm font-bold text-danger"
        >
          <X className="size-4" aria-hidden="true" />
          رفض
        </button>
      </div>
    </form>
  );
}

export function AppointmentForm({
  clients,
  projects,
  requests,
  staff,
  defaultProjectId = "",
  defaultRequestId = "",
  defaultClientId = "",
}: {
  clients: Option[];
  projects: Option[];
  requests: Option[];
  staff: Option[];
  defaultProjectId?: string;
  defaultRequestId?: string;
  defaultClientId?: string;
}) {
  const [state, action] = useActionState(
    createAppointmentAction,
    initialActionState,
  );
  const now = new Date();
  const startsAt = new Date(now.getTime() + 60 * 60_000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <select name="client_id" defaultValue={defaultClientId} className={inputClass}>
          <option value="">عميل</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <select name="project_id" defaultValue={defaultProjectId} className={inputClass}>
          <option value="">مشروع</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select name="request_id" defaultValue={defaultRequestId} className={inputClass}>
          <option value="">طلب</option>
          {requests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.name}
            </option>
          ))}
        </select>
      </div>
      <input
        name="title"
        required
        minLength={3}
        placeholder="عنوان الموعد"
        className={inputClass}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="datetime-local"
          name="starts_at"
          defaultValue={dateTimeLocalValue(startsAt)}
          required
          className={inputClass}
        />
        <input
          type="datetime-local"
          name="ends_at"
          defaultValue={dateTimeLocalValue(endsAt)}
          required
          className={inputClass}
        />
      </div>
      <input name="location" placeholder="المكان" className={inputClass} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-ink">المشاركون في الموعد</legend>
        <p className="text-xs leading-6 text-muted">
          اختر الموظفين الذين سيظهر لهم هذا الموعد ضمن التقويم.
        </p>
        <div className="grid max-h-52 gap-2 overflow-y-auto rounded-md border border-line bg-white p-3 sm:grid-cols-2">
          {staff.map((member) => (
            <label
              key={member.id}
              className="flex min-h-10 items-center gap-2 rounded-md border border-line/70 px-3 py-2 text-sm font-medium text-ink"
            >
              <input
                type="checkbox"
                name="participant_user_ids"
                value={member.id}
                className="size-4 rounded border-line text-brand focus:ring-brand"
              />
              <span>{member.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <textarea
        name="description"
        rows={3}
        placeholder="وصف الموعد"
        className={textareaClass}
      />
      <ActionNotice state={state} />
      <SubmitButton label="إنشاء موعد" icon={CalendarPlus} />
    </form>
  );
}

export function PowerOfAttorneyForm({
  clients,
  projects,
  requests,
  documents,
  defaultProjectId = "",
  defaultClientId = "",
}: {
  clients: Option[];
  projects: LinkedOption[];
  requests: LinkedOption[];
  documents: LinkedOption[];
  defaultProjectId?: string;
  defaultClientId?: string;
}) {
  const [state, action] = useActionState(
    createPowerOfAttorneyAction,
    initialActionState,
  );
  const initialClientId =
    defaultClientId ||
    projects.find((project) => project.id === defaultProjectId)?.clientId ||
    "";
  const [clientId, setClientId] = useState(initialClientId);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [requestId, setRequestId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const clientProjects = projects.filter((project) => project.clientId === clientId);
  const clientRequests = requests.filter((request) => request.clientId === clientId);
  const clientDocuments = documents.filter((document) => {
    if (document.clientId !== clientId) return false;
    if (projectId && document.projectId) return document.projectId === projectId;
    if (requestId && document.requestId) return document.requestId === requestId;
    return true;
  });

  function changeClient(nextClientId: string) {
    setClientId(nextClientId);
    setProjectId("");
    setRequestId("");
    setDocumentId("");
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="power-client" className="mb-2 block text-sm font-bold text-ink">
          العميل
        </label>
        <select
          id="power-client"
          name="client_id"
          value={clientId}
          onChange={(event) => changeClient(event.target.value)}
          required
          className={inputClass}
        >
          <option value="">اختر العميل</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-bold text-ink">المشروع المرتبط</span>
          <select
            name="project_id"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setDocumentId("");
            }}
            disabled={!clientId}
            className={inputClass}
          >
            <option value="">بدون مشروع محدد</option>
          {clientProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
          </select>
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold text-ink">الطلب المرتبط</span>
          <select
            name="request_id"
            value={requestId}
            onChange={(event) => {
              setRequestId(event.target.value);
              setDocumentId("");
            }}
            disabled={!clientId}
            className={inputClass}
          >
            <option value="">بدون طلب محدد</option>
          {clientRequests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.name}
            </option>
          ))}
          </select>
        </label>
      </div>
      <label>
        <span className="mb-2 block text-sm font-bold text-ink">رقم الوكالة</span>
        <input name="power_number" required minLength={2} className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-bold text-ink">تاريخ الإصدار</span>
          <input type="date" name="issued_on" className={inputClass} />
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold text-ink">تاريخ الانتهاء</span>
          <input type="date" name="expires_on" className={inputClass} />
        </label>
      </div>
      <label>
        <span className="mb-2 block text-sm font-bold text-ink">مستند الوكالة</span>
        <select
          name="document_id"
          value={documentId}
          onChange={(event) => setDocumentId(event.target.value)}
          disabled={!clientId}
          className={inputClass}
        >
          <option value="">بدون مستند مرتبط</option>
          {clientDocuments.map((document) => (
            <option key={document.id} value={document.id}>
              {document.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold text-ink">ملاحظات</span>
        <textarea name="notes" rows={3} className={textareaClass} />
      </label>
      <ActionNotice state={state} />
      <SubmitButton label="حفظ الوكالة" icon={ScrollText} />
    </form>
  );
}

export function EstateApprovalRequestForm({
  projectId,
  assets,
}: {
  projectId: string;
  assets: Option[];
}) {
  const [state, action] = useActionState(
    createEstatePartyApprovalRequestAction,
    initialActionState,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="estate_project_id" value={projectId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="subject_type" defaultValue="general" className={inputClass}>
          <option value="general">عام</option>
          <option value="asset">أصل</option>
          <option value="distribution">توزيع</option>
          <option value="settlement">تسوية</option>
        </select>
        <select name="estate_asset_id" className={inputClass}>
          <option value="">بدون أصل محدد</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </div>
      <input
        name="title"
        required
        minLength={3}
        placeholder="عنوان طلب الموافقة"
        className={inputClass}
      />
      <input type="datetime-local" name="due_at" className={inputClass} />
      <textarea
        name="description"
        rows={3}
        placeholder="تفاصيل الموافقة المطلوبة"
        className={textareaClass}
      />
      <ActionNotice state={state} />
      <SubmitButton label="إنشاء طلب موافقة" icon={BadgeCheck} />
    </form>
  );
}

export function EstateApprovalResponseForm({
  projectId,
  approvalRequestId,
  estatePartyId,
  documents,
}: {
  projectId: string;
  approvalRequestId: string;
  estatePartyId: string;
  documents: Option[];
}) {
  const [state, action] = useActionState(
    respondEstatePartyApprovalAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="estate_project_id" value={projectId} />
      <input type="hidden" name="approval_request_id" value={approvalRequestId} />
      <input type="hidden" name="estate_party_id" value={estatePartyId} />
      <select name="evidence_document_id" className={inputClass}>
        <option value="">بدون مستند إقرار</option>
        {documents.map((document) => (
          <option key={document.id} value={document.id}>
            {document.name}
          </option>
        ))}
      </select>
      <textarea name="notes" rows={2} placeholder="ملاحظات الرد" className={textareaClass} />
      <ActionNotice state={state} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="approved"
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white"
        >
          <Check className="size-4" aria-hidden="true" />
          موافق
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-danger bg-white px-4 text-sm font-bold text-danger"
        >
          <X className="size-4" aria-hidden="true" />
          رفض
        </button>
      </div>
    </form>
  );
}

export function ClientApprovalRequestForm({
  clientId,
  requests,
  projects,
  documents,
}: {
  clientId: string;
  requests: Option[];
  projects: Option[];
  documents: Option[];
}) {
  const [state, action] = useActionState(createClientApprovalRequestAction, initialActionState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="service_request_id" className={inputClass}>
          <option value="">بدون طلب محدد</option>
          {requests.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select name="project_id" className={inputClass}>
          <option value="">بدون مشروع محدد</option>
          {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <input name="title" required minLength={3} placeholder="عنوان الموافقة المطلوبة" className={inputClass} />
      <select name="document_id" className={inputClass}>
        <option value="">بدون مستند مرفق</option>
        {documents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <input type="datetime-local" name="due_at" className={inputClass} />
      <textarea name="description" rows={3} placeholder="تفاصيل الموافقة" className={textareaClass} />
      <ActionNotice state={state} />
      <SubmitButton label="إرسال طلب الموافقة" icon={BadgeCheck} />
    </form>
  );
}

export function ClientApprovalResponseForm({
  approvalRequestId,
}: {
  approvalRequestId: string;
}) {
  const [state, action] = useActionState(respondClientApprovalRequestAction, initialActionState);
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="approval_request_id" value={approvalRequestId} />
      <textarea name="notes" rows={2} placeholder="ملاحظاتك على الموافقة" className={textareaClass} />
      <ActionNotice state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="approved" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white"><Check className="size-4" />أوافق</button>
        <button type="submit" name="decision" value="rejected" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-danger bg-white px-4 text-sm font-bold text-danger"><X className="size-4" />لا أوافق</button>
      </div>
    </form>
  );
}

export function LegalConsultationResponseForm({
  requestId,
  documents,
  initialBody = "",
  initialDocumentId = "",
}: {
  requestId: string;
  documents: Option[];
  initialBody?: string;
  initialDocumentId?: string;
}) {
  const [state, action] = useActionState(upsertLegalConsultationResponseAction, initialActionState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="service_request_id" value={requestId} />
      <textarea name="body" rows={8} defaultValue={initialBody} placeholder="نص الرد القانوني" className={textareaClass} />
      <select name="document_id" defaultValue={initialDocumentId} className={inputClass}>
        <option value="">بدون ملف PDF</option>
        {documents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <ActionNotice state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="publish" value="false" className="min-h-10 rounded-md border border-line bg-white px-4 text-sm font-bold">حفظ مسودة</button>
        <button type="submit" name="publish" value="true" className="min-h-10 rounded-md bg-brand px-4 text-sm font-bold text-white">اعتماد ونشر للعميل</button>
      </div>
    </form>
  );
}

export function PreContractExtensionRequestForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(requestPreContractExtensionAction, initialActionState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="service_request_id" value={requestId} />
      <select name="phase" required className={inputClass}>
        <option value="offer">إعداد العرض الفني والمالي</option>
        <option value="client_response">انتظار رد العميل</option>
        <option value="contract">إعداد العقد</option>
      </select>
      <input type="datetime-local" name="requested_due_at" required className={inputClass} />
      <textarea name="reason" rows={3} required minLength={5} placeholder="سبب طلب التمديد" className={textareaClass} />
      <ActionNotice state={state} />
      <SubmitButton label="طلب تمديد" icon={CalendarPlus} />
    </form>
  );
}

export function PreContractExtensionReviewForm({
  requestId,
  extensionId,
}: {
  requestId: string;
  extensionId: string;
}) {
  const [state, action] = useActionState(reviewPreContractExtensionAction, initialActionState);
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="service_request_id" value={requestId} />
      <input type="hidden" name="extension_id" value={extensionId} />
      <textarea name="notes" rows={2} placeholder="ملاحظات القرار" className={textareaClass} />
      <ActionNotice state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="approved" className="min-h-10 rounded-md bg-brand px-4 text-sm font-bold text-white">اعتماد التمديد</button>
        <button type="submit" name="decision" value="rejected" className="min-h-10 rounded-md border border-danger bg-white px-4 text-sm font-bold text-danger">رفض</button>
      </div>
    </form>
  );
}

export function PreContractAttentionReviewForm({requestId,noticeId}:{requestId:string;noticeId:string}){
  const [state,action]=useActionState(reviewPreContractAttentionNoticeAction,initialActionState);
  return <form action={action} className="mt-3 space-y-3"><input type="hidden" name="service_request_id" value={requestId}/><input type="hidden" name="notice_id" value={noticeId}/><textarea name="reason" rows={2} placeholder="سبب الرفض عند الرفض" className={textareaClass}/><ActionNotice state={state}/><div className="flex gap-2"><button type="submit" name="decision" value="active" className="min-h-10 rounded-md bg-brand px-4 text-sm font-bold text-white">اعتماد لفت النظر</button><button type="submit" name="decision" value="rejected" className="min-h-10 rounded-md border border-danger bg-white px-4 text-sm font-bold text-danger">رفض</button></div></form>;
}

export function AttentionNoticeReviewForm({ projectId, noticeId }: { projectId: string; noticeId: string }) {
  const [state, action] = useActionState(reviewProjectAttentionNoticeAction, initialActionState);
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="notice_id" value={noticeId} />
      <textarea name="reason" rows={2} placeholder="سبب الرفض عند الرفض" className={textareaClass} />
      <ActionNotice state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="active" className="min-h-10 rounded-md bg-brand px-4 text-sm font-bold text-white">اعتماد لفت النظر</button>
        <button type="submit" name="decision" value="rejected" className="min-h-10 rounded-md border border-danger bg-white px-4 text-sm font-bold text-danger">رفض لفت النظر</button>
      </div>
    </form>
  );
}

export function ProjectHealthForm({ projectId, currentStatus }: { projectId: string; currentStatus: string }) {
  const [state, action] = useActionState(setProjectHealthAction, initialActionState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <select name="health_status" defaultValue={currentStatus === "yellow" ? "yellow" : "green"} className={inputClass}>
        <option value="green">أخضر: العمل يسير داخليًا</option>
        <option value="yellow">أصفر: انتظار جهة خارجية</option>
      </select>
      <textarea name="reason" rows={2} placeholder="سبب التوقف الخارجي" className={textareaClass} />
      <ActionNotice state={state} />
      <SubmitButton label="تحديث حالة المشروع" icon={BadgeCheck} />
    </form>
  );
}

export function ProjectTaskThreadForm({projectId,members}:{projectId:string;members:Option[]}){
  const [state,action]=useActionState(createProjectTaskThreadAction,initialActionState);
  return <form action={action} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="project_id" value={projectId}/><input name="thread_title" required placeholder="عنوان صندوق العمل" className={inputClass}/><input name="step_title" required placeholder="المهمة الأولى" className={inputClass}/><select name="assigned_to" required className={inputClass}><option value="">اختر المكلف</option>{members.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><input type="datetime-local" name="due_at" required className={inputClass}/><div className="sm:col-span-2"><ActionNotice state={state}/></div><div className="sm:col-span-2"><SubmitButton label="إضافة مهمة" icon={ClipboardPlus}/></div></form>;
}

export function ProjectTaskStepResponseForm({projectId,stepId}:{projectId:string;stepId:string}){
  const [state,action]=useActionState(submitProjectTaskStepAction,initialActionState);
  return <form action={action} className="mt-3 space-y-3"><input type="hidden" name="project_id" value={projectId}/><input type="hidden" name="step_id" value={stepId}/><textarea name="response_text" required rows={3} placeholder="رد المحامي" className={textareaClass}/><input name="proposed_next_title" placeholder="المهمة القادمة المقترحة" className={inputClass}/><input type="datetime-local" name="proposed_next_due_at" className={inputClass}/><ActionNotice state={state}/><SubmitButton label="إرسال الرد" icon={MessageSquareText}/></form>;
}

export function ProjectTaskStepReviewForm({projectId,stepId,proposedTitle="",proposedDueAt=""}:{projectId:string;stepId:string;proposedTitle?:string;proposedDueAt?:string}){
  const [state,action]=useActionState(reviewProjectTaskStepAction,initialActionState);
  return <form action={action} className="mt-3 space-y-3"><input type="hidden" name="project_id" value={projectId}/><input type="hidden" name="step_id" value={stepId}/><input name="next_title" defaultValue={proposedTitle} placeholder="اعتماد أو تعديل المهمة التالية" className={inputClass}/><input type="datetime-local" name="next_due_at" defaultValue={proposedDueAt ? saudiDateTimeLocalValue(new Date(proposedDueAt)) : ""} className={inputClass}/><textarea name="review_notes" rows={2} placeholder="ملاحظات المراجعة أو سبب الإعادة" className={textareaClass}/><ActionNotice state={state}/><div className="flex gap-2"><button type="submit" name="decision" value="approved" className="min-h-10 rounded-md bg-brand px-4 text-sm font-bold text-white">قبول الرد والاقتراح</button><button type="submit" name="decision" value="returned" className="min-h-10 rounded-md border border-danger bg-white px-4 text-sm font-bold text-danger">إعادة للمحامي</button></div></form>;
}

export function ProjectTaskThreadCloseForm({projectId,threadId}:{projectId:string;threadId:string}){
  const [state,action]=useActionState(closeProjectTaskThreadAction,initialActionState);
  return <form action={action} className="mt-3"><input type="hidden" name="project_id" value={projectId}/><input type="hidden" name="thread_id" value={threadId}/><ActionNotice state={state}/><button type="submit" className="mt-2 min-h-10 rounded-md border border-line bg-white px-4 text-sm font-bold">إغلاق وأرشفة الصندوق</button></form>;
}

export function ProjectTaskStepExtensionForm({projectId,stepId}:{projectId:string;stepId:string}){const[state,action]=useActionState(requestProjectTaskStepExtensionAction,initialActionState);return <form action={action} className="mt-3 space-y-3"><input type="hidden" name="project_id" value={projectId}/><input type="hidden" name="step_id" value={stepId}/><input type="datetime-local" name="requested_due_at" required className={inputClass}/><textarea name="reason" required minLength={5} rows={2} placeholder="سبب التمديد" className={textareaClass}/><ActionNotice state={state}/><SubmitButton label="طلب تمديد" icon={CalendarPlus}/></form>}
export function ProjectTaskStepExtensionReviewForm({projectId,extensionId}:{projectId:string;extensionId:string}){const[state,action]=useActionState(reviewProjectTaskStepExtensionAction,initialActionState);return <form action={action} className="mt-3 space-y-2"><input type="hidden" name="project_id" value={projectId}/><input type="hidden" name="extension_id" value={extensionId}/><textarea name="notes" rows={2} placeholder="ملاحظات القرار" className={textareaClass}/><ActionNotice state={state}/><div className="flex gap-2"><button type="submit" name="decision" value="approved" className="min-h-10 rounded-md bg-brand px-4 text-sm font-bold text-white">اعتماد التمديد</button><button type="submit" name="decision" value="rejected" className="min-h-10 rounded-md border border-danger bg-white px-4 text-sm font-bold text-danger">رفض</button></div></form>}
export function ProjectTaskStepAttentionReviewForm({projectId,noticeId}:{projectId:string;noticeId:string}){const[state,action]=useActionState(reviewProjectTaskStepAttentionAction,initialActionState);return <form action={action} className="mt-3 space-y-2"><input type="hidden" name="project_id" value={projectId}/><input type="hidden" name="notice_id" value={noticeId}/><textarea name="reason" rows={2} placeholder="سبب الرفض" className={textareaClass}/><ActionNotice state={state}/><div className="flex gap-2"><button type="submit" name="decision" value="active" className="min-h-10 rounded-md bg-brand px-4 text-sm font-bold text-white">اعتماد لفت النظر</button><button type="submit" name="decision" value="rejected" className="min-h-10 rounded-md border border-danger bg-white px-4 text-sm font-bold text-danger">رفض</button></div></form>}
