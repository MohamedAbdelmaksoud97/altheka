"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  BadgeCheck,
  CalendarPlus,
  Check,
  ClipboardPlus,
  LoaderCircle,
  PenLine,
  ScrollText,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  createAppointmentAction,
  createEstatePartyApprovalRequestAction,
  createPowerOfAttorneyAction,
  proposeWorkflowActionAction,
  recordWorkflowActionUpdateAction,
  respondEstatePartyApprovalAction,
  reviewProposedWorkflowActionAction,
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
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
  projects: Option[];
  requests: Option[];
  documents: Option[];
  defaultProjectId?: string;
  defaultClientId?: string;
}) {
  const [state, action] = useActionState(
    createPowerOfAttorneyAction,
    initialActionState,
  );
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
        <select name="request_id" className={inputClass}>
          <option value="">طلب</option>
          {requests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.name}
            </option>
          ))}
        </select>
      </div>
      <input
        name="power_number"
        required
        minLength={2}
        placeholder="رقم الوكالة"
        className={inputClass}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input type="date" name="issued_on" className={inputClass} />
        <input type="date" name="expires_on" className={inputClass} />
      </div>
      <select name="document_id" className={inputClass}>
        <option value="">مستند الوكالة</option>
        {documents.map((document) => (
          <option key={document.id} value={document.id}>
            {document.name}
          </option>
        ))}
      </select>
      <textarea name="notes" rows={3} placeholder="ملاحظات" className={textareaClass} />
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
