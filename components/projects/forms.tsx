"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowUpLeft,
  BriefcaseBusiness,
  CalendarPlus,
  Check,
  CirclePlay,
  BellRing,
  FileUp,
  Gavel,
  GitBranch,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  UserMinus,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { saudiDateValue } from "@/lib/datetime";
import {
  acknowledgeAttentionNoticeAction,
  activateLitigationWorkflowStageAction,
  assignEstateProjectMemberAction,
  assignProjectTeamMemberAction,
  assignProjectAssistantAction,
  createEstateAssetAction,
  createEstateLitigationSubprojectAction,
  createEstatePartyAction,
  createEstateReportAction,
  createProjectTeamAction,
  issueAttentionNoticeAction,
  operateWorkflowAction,
  recordEstateDecisionAction,
  recordEstateFinancialEntryAction,
  recordEstateShareAction,
  recordHearingOutcomeAction,
  removeEstateProjectMemberAction,
  removeProjectTeamMemberAction,
  removeProjectAssistantAction,
  reviewEstateFinancialEntryAction,
  reviewLitigationActionResponseAction,
  scheduleHearingAction,
  sendProjectMessageAction,
  setCaseActionStatusAction,
  setNextActionAction,
  startLitigationActionExecutionAction,
  startProjectWorkflowAction,
  submitLitigationActionResponseAction,
  transitionEstateReportAction,
  updateEstateAssetAction,
  updateProjectCategoryAction,
  updateProjectDocumentPublicationAction,
  updateProjectTeamAction,
  upsertEstateBankAccountAction,
  uploadProjectDocumentAction,
  upsertEstateDetailsAction,
  upsertLitigationCaseAction,
  verifyEstateBankAccountAction,
} from "@/app/actions/projects";
import {
  initialActionState,
  type ActionState,
} from "@/app/actions/action-state";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none";
const textareaClass =
  "w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm leading-7 focus:border-brand focus:outline-none";

function ActionNotice({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      className={`rounded-md border px-3 py-2 text-sm ${
        state.status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {state.message}
    </p>
  );
}

export function ProjectAssistantForm({
  projectId,
  staff,
}: {
  projectId: string;
  staff: { id: string; name: string; jobTitle?: string | null }[];
}) {
  const [state, action] = useActionState(
    assignProjectAssistantAction,
    initialActionState,
  );

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <input type="hidden" name="project_id" value={projectId} />
      <label>
        <span className="mb-2 block text-sm font-bold">المكلف المساعد</span>
        <select name="user_id" required className={inputClass} defaultValue="">
          <option value="" disabled>
            اختر موظفًا مؤهلًا
          </option>
          {staff.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
              {employee.jobTitle ? ` · ${employee.jobTitle}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="self-end">
        <SubmitButton label="إضافة مكلف" icon={UserPlus} />
      </div>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function ProjectCategoryForm({
  projectId,
  categories,
  currentCategoryId,
}: {
  projectId: string;
  categories: { id: string; name: string }[];
  currentCategoryId?: string | null;
}) {
  const [state, action] = useActionState(
    updateProjectCategoryAction,
    initialActionState,
  );

  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <label>
        <span className="mb-2 block text-sm font-bold">نوع القضية</span>
        <select
          name="category_id"
          required
          defaultValue={currentCategoryId ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            اختر التصنيف
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">سبب الاعتماد أو التغيير</span>
        <input
          name="reason"
          required
          minLength={5}
          className={inputClass}
          placeholder="مثال: مراجعة نوع القضية من مدير التقاضي"
        />
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <SubmitButton label="اعتماد التصنيف" icon={Save} compact />
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function RemoveProjectAssistantForm({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  const [state, action] = useActionState(
    removeProjectAssistantAction,
    initialActionState,
  );

  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="user_id" value={userId} />
      <label className="min-w-56 flex-1">
        <span className="sr-only">سبب إنهاء التكليف</span>
        <input
          name="reason"
          required
          minLength={5}
          className="h-9 w-full rounded-md border border-line bg-white px-3 text-xs focus:border-brand focus:outline-none"
          placeholder="سبب إنهاء التكليف"
        />
      </label>
      <SubmitButton
        label="إنهاء التكليف"
        icon={UserMinus}
        tone="danger"
        compact
      />
      <ActionNotice state={state} />
    </form>
  );
}

export function AttentionNoticeForm({
  projectId,
  subjectType,
  subjectId,
  assignees,
}: {
  projectId: string;
  subjectType: "workflow" | "litigation";
  subjectId: string;
  assignees: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(
    issueAttentionNoticeAction,
    initialActionState,
  );

  if (!assignees.length) {
    return (
      <p className="text-xs text-muted">
        لا يوجد مكلف مسند إلى هذا الإجراء لإصدار لفت نظر له.
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="subject_type" value={subjectType} />
      <input type="hidden" name="subject_id" value={subjectId} />
      <label>
        <span className="mb-2 block text-xs font-bold">المكلف المستهدف</span>
        <select name="target_user_id" required className={inputClass}>
          {assignees.map((assignee) => (
            <option key={assignee.id} value={assignee.id}>
              {assignee.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-xs font-bold">سبب لفت النظر</span>
        <input
          name="reason"
          required
          minLength={5}
          className={inputClass}
          placeholder="اذكر المطلوب أو موضع التأخير"
        />
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <SubmitButton label="إصدار لفت نظر" icon={BellRing} compact />
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function AttentionNoticeAcknowledgeForm({
  projectId,
  noticeId,
}: {
  projectId: string;
  noticeId: string;
}) {
  const [state, action] = useActionState(
    acknowledgeAttentionNoticeAction,
    initialActionState,
  );

  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="notice_id" value={noticeId} />
      <input
        name="response_text"
        className={inputClass}
        placeholder="رد اختياري على المشرف"
      />
      <SubmitButton label="تأكيد الاطلاع" icon={Check} compact />
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

function SubmitButton({
  label,
  icon: Icon = Save,
  tone = "brand",
  compact = false,
  name,
  value,
}: {
  label: string;
  icon?: typeof Save;
  tone?: "brand" | "neutral" | "success" | "danger";
  compact?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const toneClass =
    tone === "neutral"
      ? "border border-line bg-white text-foreground hover:border-brand"
      : tone === "success"
        ? "bg-emerald-700 text-white hover:bg-emerald-800"
        : tone === "danger"
          ? "bg-red-700 text-white hover:bg-red-800"
        : "bg-brand text-white hover:bg-brand-strong";
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "px-3 text-xs" : "px-5 text-sm"} ${toneClass}`}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="size-4" aria-hidden="true" />
      )}
      {pending ? "جارٍ الحفظ" : label}
    </button>
  );
}

export function StartWorkflowForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(
    startProjectWorkflowAction,
    initialActionState,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <ActionNotice state={state} />
      <SubmitButton label="تشغيل خارطة السير" icon={CirclePlay} />
    </form>
  );
}

export function LitigationStageRoutingForm({
  projectId,
  options,
}: {
  projectId: string;
  options: { code: "appeal" | "enforcement" | "closing_collection"; label: string }[];
}) {
  const [state, action] = useActionState(
    activateLitigationWorkflowStageAction,
    initialActionState,
  );
  return (
    <form
      action={action}
      data-testid="litigation-stage-routing"
      className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)_auto] sm:items-end"
    >
      <input type="hidden" name="project_id" value={projectId} />
      <label>
        <span className="mb-2 block text-sm font-bold">المرحلة التالية في خارطة السير</span>
        <select
          name="stage_code"
          data-testid="litigation-stage-select"
          className={inputClass}
          required
        >
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">سبب اختيار المرحلة التالية</span>
        <input
          name="reason"
          required
          minLength={5}
          maxLength={1000}
          className={inputClass}
          placeholder="الحكم أو طلب العميل أو اكتمال التنفيذ"
        />
      </label>
      <SubmitButton label="اعتماد المرحلة التالية" icon={GitBranch} />
      <div className="sm:col-span-3">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

const workflowNext: Record<
  string,
  { status: string; label: string; tone?: "brand" | "success" }
> = {
  ready: { status: "in_progress", label: "بدء التنفيذ" },
  in_progress: { status: "submitted", label: "إرسال للمراجعة" },
  submitted: { status: "awaiting_approval", label: "طلب الاعتماد" },
  awaiting_approval: {
    status: "approved",
    label: "اعتماد النتيجة",
    tone: "success",
  },
  approved: { status: "completed", label: "إغلاق الإجراء", tone: "success" },
  returned_for_revision: { status: "in_progress", label: "استئناف التعديل" },
};

export function WorkflowActionControl({
  projectId,
  actionId,
  status,
  requiresApproval,
  canExecute,
  canApprove,
}: {
  projectId: string;
  actionId: string;
  status: string;
  requiresApproval: boolean;
  canExecute: boolean;
  canApprove: boolean;
}) {
  const [state, action] = useActionState(
    operateWorkflowAction,
    initialActionState,
  );
  const next = workflowNext[status];
  const allowed = status === "awaiting_approval" ? canApprove : canExecute;
  if (!next || !allowed) return null;
  return (
    <div className="space-y-2">
      <form action={action} className="space-y-2">
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="action_id" value={actionId} />
        <input type="hidden" name="next_status" value={next.status} />
        <input type="hidden" name="requires_approval" value={String(requiresApproval)} />
        <ActionNotice state={state} />
        <SubmitButton
          label={status === "in_progress" ? requiresApproval ? "إرسال للاعتماد" : "تم التنفيذ" : status === "awaiting_approval" ? "اعتماد وإكمال" : next.label}
          icon={next.status === "approved" ? Check : ArrowUpLeft}
          tone={next.tone}
          compact
        />
      </form>
      {status === "awaiting_approval" ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="action_id" value={actionId} />
          <input type="hidden" name="next_status" value="returned_for_revision" />
          <input type="hidden" name="requires_approval" value="true" />
          <input name="reason" required minLength={5} placeholder="سبب الإعادة للتعديل" className={inputClass} />
          <SubmitButton label="إعادة للتعديل" icon={ArrowUpLeft} compact />
        </form>
      ) : null}
    </div>
  );
}

export function LitigationCaseForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial?: {
    case_number: string | null;
    court_name: string | null;
    case_level: string;
  } | null;
}) {
  const [state, action] = useActionState(
    upsertLitigationCaseAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="project_id" value={projectId} />
      <label>
        <span className="mb-2 block text-sm font-bold">رقم القضية</span>
        <input
          name="case_number"
          defaultValue={initial?.case_number ?? ""}
          className={inputClass}
          placeholder="رقم القيد"
        />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">المحكمة</span>
        <input
          name="court_name"
          defaultValue={initial?.court_name ?? ""}
          required
          className={inputClass}
          placeholder="المحكمة المختصة"
        />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">درجة القضية</span>
        <select
          name="case_level"
          defaultValue={initial?.case_level ?? "first_instance"}
          className={inputClass}
        >
          <option value="first_instance">ابتدائي</option>
          <option value="appeal">استئناف</option>
          <option value="cassation">نقض</option>
          <option value="enforcement">تنفيذ</option>
        </select>
      </label>
      <div className="sm:col-span-3">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-3">
        <SubmitButton label="حفظ بطاقة القضية" icon={Gavel} />
      </div>
    </form>
  );
}

export function NextActionForm({
  projectId,
  caseId,
  members,
}: {
  projectId: string;
  caseId: string;
  members: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(
    setNextActionAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="action_type" value="follow_up" />
      <label className="sm:col-span-2">
        <span className="mb-2 block text-sm font-bold">الإجراء القادم</span>
        <input
          name="title"
          required
          className={inputClass}
          placeholder="مثال: إعداد مذكرة الرد"
        />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">موعد التنفيذ</span>
        <input name="due_at" type="datetime-local" className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">الموعد القانوني</span>
        <input name="legal_due_date" type="date" className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">الأولوية</span>
        <select name="priority" className={inputClass} defaultValue="high">
          <option value="normal">عادية</option>
          <option value="high">عالية</option>
          <option value="critical">قصوى</option>
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">المكلف</span>
        <select name="assigned_to" className={inputClass}>
          <option value="">المكلف الرئيسي</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="تثبيت الإجراء القادم" icon={ArrowUpLeft} />
      </div>
    </form>
  );
}

export function StartLitigationActionForm({
  projectId,
  actionId,
}: {
  projectId: string;
  actionId: string;
}) {
  const [state, action] = useActionState(
    startLitigationActionExecutionAction,
    initialActionState,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="action_id" value={actionId} />
      <ActionNotice state={state} />
      <SubmitButton label="بدء تنفيذ الإجراء" icon={CirclePlay} />
    </form>
  );
}

export function LitigationActionResponseForm({
  projectId,
  actionId,
  returnedReason,
}: {
  projectId: string;
  actionId: string;
  returnedReason?: string | null;
}) {
  const [state, action] = useActionState(
    submitLitigationActionResponseAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="action_id" value={actionId} />
      {returnedReason ? (
        <p className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ملاحظات الإعادة: {returnedReason}
        </p>
      ) : null}
      <label className="sm:col-span-2">
        <span className="mb-2 block text-sm font-bold">نتيجة التنفيذ</span>
        <textarea
          name="result_summary"
          rows={4}
          required
          className={textareaClass}
        />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-2 block text-sm font-bold">ملاحظات التنفيذ</span>
        <textarea name="execution_notes" rows={3} className={textareaClass} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-2 block text-sm font-bold">الإجراء التالي المقترح</span>
        <input
          name="next_action_title"
          required
          className={inputClass}
          placeholder="الإجراء الذي يلي اعتماد النتيجة"
        />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">موعد الإجراء التالي</span>
        <input
          name="next_action_due_at"
          type="datetime-local"
          className={inputClass}
        />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">موعده القانوني</span>
        <input
          name="next_action_legal_due_date"
          type="date"
          className={inputClass}
        />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">الأولوية</span>
        <select
          name="next_action_priority"
          defaultValue="high"
          className={inputClass}
        >
          <option value="normal">عادية</option>
          <option value="high">عالية</option>
          <option value="critical">قصوى</option>
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">عنوان المرفق</span>
        <input
          name="document_title"
          className={inputClass}
          placeholder="اختياري"
        />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Paperclip className="size-4" aria-hidden="true" />
          مرفق النتيجة
        </span>
        <input
          name="file"
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
          className="block w-full rounded-md border border-line bg-white px-3 py-2 text-sm file:ml-3 file:rounded-md file:border-0 file:bg-subtle file:px-3 file:py-2 file:font-bold"
        />
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="إرسال النتيجة للاعتماد" icon={Send} />
      </div>
    </form>
  );
}

export function LitigationActionReviewForm({
  projectId,
  submissionId,
}: {
  projectId: string;
  submissionId: string;
}) {
  const [state, action] = useActionState(
    reviewLitigationActionResponseAction,
    initialActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="submission_id" value={submissionId} />
      <label>
        <span className="mb-2 block text-sm font-bold">ملاحظات المراجعة</span>
        <textarea name="review_notes" rows={3} className={textareaClass} />
      </label>
      <ActionNotice state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton
          label="اعتماد وإنشاء الإجراء التالي"
          icon={ShieldCheck}
          tone="success"
          name="decision"
          value="approved"
        />
        <SubmitButton
          label="إعادة للتعديل"
          icon={RotateCcw}
          tone="neutral"
          name="decision"
          value="returned_for_revision"
        />
      </div>
    </form>
  );
}

export function HearingForm({
  projectId,
  caseId,
}: {
  projectId: string;
  caseId: string;
}) {
  const [state, action] = useActionState(
    scheduleHearingAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="case_id" value={caseId} />
      <label>
        <span className="mb-2 block text-sm font-bold">موعد الجلسة</span>
        <input name="hearing_at" type="datetime-local" required className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">وقت التبليغ</span>
        <input name="notified_at" type="datetime-local" className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-2 block text-sm font-bold">مرجع الدائرة أو الرابط</span>
        <input name="court_reference" className={inputClass} />
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="إضافة الجلسة" icon={CalendarPlus} />
      </div>
    </form>
  );
}

export function HearingOutcomeForm({
  projectId,
  hearingId,
}: {
  projectId: string;
  hearingId: string;
}) {
  const [state, action] = useActionState(
    recordHearingOutcomeAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="hearing_id" value={hearingId} />
      <label>
        <span className="mb-2 block text-xs font-bold">النتيجة</span>
        <select name="status" className={inputClass} defaultValue="held">
          <option value="held">انعقدت</option>
          <option value="adjourned">تأجلت</option>
          <option value="cancelled">ألغيت</option>
        </select>
      </label>
      <label>
        <span className="mb-2 block text-xs font-bold">الجلسة التالية عند التأجيل</span>
        <input name="next_hearing_at" type="datetime-local" className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-2 block text-xs font-bold">ملخص النتيجة</span>
        <textarea name="outcome_summary" rows={3} required className={textareaClass} />
      </label>
      <label>
        <span className="mb-2 block text-xs font-bold">الإجراء التالي</span>
        <input name="next_action_title" className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-xs font-bold">تاريخه</span>
        <input name="next_action_due_at" type="datetime-local" className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-xs font-bold">أو موعده القانوني</span>
        <input name="next_action_legal_due_date" type="date" className={inputClass} />
      </label>
      <div className="self-end">
        <SubmitButton label="حفظ النتيجة" icon={Check} compact />
      </div>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function CaseActionStatusForm({
  projectId,
  actionId,
  status,
}: {
  projectId: string;
  actionId: string;
  status: string;
}) {
  const [state, action] = useActionState(
    setCaseActionStatusAction,
    initialActionState,
  );
  const nextStatus = status === "planned" ? "in_progress" : "completed";
  if (!["planned", "in_progress"].includes(status)) return null;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="action_id" value={actionId} />
      <input type="hidden" name="status" value={nextStatus} />
      <ActionNotice state={state} />
      <SubmitButton
        label={nextStatus === "in_progress" ? "بدء" : "إكمال"}
        icon={nextStatus === "in_progress" ? CirclePlay : Check}
        compact
        tone={nextStatus === "completed" ? "success" : "neutral"}
      />
    </form>
  );
}

export function EstateDetailsForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial?: {
    deceased_name: string;
    estate_kind: string;
  } | null;
}) {
  const [state, action] = useActionState(
    upsertEstateDetailsAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <label>
        <span className="mb-2 block text-sm font-bold">اسم المورث</span>
        <input
          name="deceased_name"
          required
          defaultValue={initial?.deceased_name ?? ""}
          className={inputClass}
        />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">نوع التركة</span>
        <select
          name="estate_kind"
          defaultValue={initial?.estate_kind ?? "regular_estate"}
          className={inputClass}
        >
          <option value="regular_estate">تركة عادية</option>
          <option value="isnad_estate">مسندة من مركز الإسناد</option>
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">اكتمال المستندات</span>
        <input name="documents_completed_at" type="datetime-local" className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">إصدار الوكالات</span>
        <input name="agencies_issued_at" type="datetime-local" className={inputClass} />
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="حفظ ملف التركة" icon={BriefcaseBusiness} />
      </div>
    </form>
  );
}

export function EstatePartyForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(
    createEstatePartyAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <label>
        <span className="mb-2 block text-sm font-bold">نوع الطرف</span>
        <select name="party_type" className={inputClass}>
          <option value="heir">وارث</option>
          <option value="representative">ممثل</option>
          <option value="beneficiary">مستفيد</option>
          <option value="guardian">ولي أو وصي</option>
          <option value="creditor">دائن</option>
          <option value="other">صاحب علاقة</option>
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">الاسم الكامل</span>
        <input name="full_name" required className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">الهوية</span>
        <input name="national_id" className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">الجوال</span>
        <input name="phone" className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">البريد</span>
        <input name="email" type="email" className={inputClass} />
      </label>
      <label className="flex h-11 items-center gap-3 self-end rounded-md border border-line px-3 text-sm">
        <input name="is_minor" type="checkbox" className="size-4 accent-brand" />
        قاصر
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="إضافة الطرف" icon={Plus} />
      </div>
    </form>
  );
}

export function EstateShareForm({
  projectId,
  partyId,
}: {
  projectId: string;
  partyId: string;
}) {
  const [state, action] = useActionState(
    recordEstateShareAction,
    initialActionState,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="party_id" value={partyId} />
      <label className="w-20">
        <span className="mb-1 block text-xs text-muted">البسط</span>
        <input name="numerator" type="number" min="0" step="0.001" className={inputClass} />
      </label>
      <span className="pb-3 text-muted">/</span>
      <label className="w-20">
        <span className="mb-1 block text-xs text-muted">المقام</span>
        <input name="denominator" type="number" min="0.001" step="0.001" className={inputClass} />
      </label>
      <SubmitButton label="حفظ النصيب" icon={Save} compact />
      <ActionNotice state={state} />
    </form>
  );
}

export function EstateAssetForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(
    createEstateAssetAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <label>
        <span className="mb-2 block text-sm font-bold">نوع الأصل</span>
        <select name="asset_type" className={inputClass}>
          <option value="real_estate">عقار</option>
          <option value="vehicle">مركبة</option>
          <option value="bank_account">حساب بنكي</option>
          <option value="investment_portfolio">محفظة استثمارية</option>
          <option value="commercial_register">سجل تجاري</option>
          <option value="movable">منقول</option>
          <option value="cash">نقد</option>
          <option value="debt">دين</option>
          <option value="litigation">قضية</option>
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">اسم الأصل</span>
        <input name="name" required className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-2 block text-sm font-bold">الوصف</span>
        <textarea name="description" rows={3} className={textareaClass} />
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="إنشاء الأصل ومشروعه" icon={Plus} />
      </div>
    </form>
  );
}

export function EstateAssetUpdateForm({
  projectId,
  asset,
}: {
  projectId: string;
  asset: {
    id: string;
    current_stage: string | null;
    status: string;
    valuation_amount: number | null;
    liquidation_status: string | null;
    marketing_status: string | null;
  };
}) {
  const [state, action] = useActionState(
    updateEstateAssetAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="asset_id" value={asset.id} />
      <select
        name="current_stage"
        defaultValue={asset.current_stage ?? "preparation"}
        className={inputClass}
        title="مرحلة الأصل"
      >
        <option value="inventory">الحصر</option>
        <option value="preparation">التهيئة</option>
        <option value="guardianship">الحراسة</option>
        <option value="litigation">التقاضي</option>
        <option value="liquidation">التصفية</option>
        <option value="marketing">التسويق</option>
        <option value="completed">مكتمل</option>
      </select>
      <select name="status" defaultValue={asset.status} className={inputClass} title="حالة الأصل">
        <option value="active">نشط</option>
        <option value="under_guardianship">تحت الحراسة</option>
        <option value="in_litigation">في التقاضي</option>
        <option value="marketed">معروض للتسويق</option>
        <option value="sold">مباع</option>
        <option value="distributed">موزع</option>
        <option value="closed">مغلق</option>
      </select>
      <input
        name="valuation_amount"
        type="number"
        min="0"
        step="0.01"
        defaultValue={asset.valuation_amount ?? ""}
        className={inputClass}
        placeholder="قيمة التقييم"
      />
      <input
        name="liquidation_status"
        defaultValue={asset.liquidation_status ?? ""}
        className={inputClass}
        placeholder="حالة التصفية"
      />
      <input
        name="marketing_status"
        defaultValue={asset.marketing_status ?? ""}
        className={inputClass}
        placeholder="حالة التسويق"
      />
      <div className="self-end">
        <SubmitButton label="تحديث الأصل" icon={Save} compact />
      </div>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function EstateBankAccountForm({
  projectId,
  partyId,
}: {
  projectId: string;
  partyId: string;
}) {
  const [state, action] = useActionState(
    upsertEstateBankAccountAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-4 grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="party_id" value={partyId} />
      <input
        name="iban"
        required
        minLength={15}
        maxLength={34}
        className={inputClass}
        placeholder="رقم الآيبان"
        dir="ltr"
      />
      <input
        name="bank_name"
        maxLength={120}
        className={inputClass}
        placeholder="اسم البنك"
      />
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <SubmitButton label="حفظ الحساب" icon={Save} compact />
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function EstateBankVerificationForm({
  projectId,
  accountId,
  verified,
}: {
  projectId: string;
  accountId: string;
  verified: boolean;
}) {
  const [state, action] = useActionState(
    verifyEstateBankAccountAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="verified" value={verified ? "false" : "true"} />
      <SubmitButton
        label={verified ? "إلغاء التحقق" : "اعتماد الحساب"}
        icon={ShieldCheck}
        compact
        tone={verified ? "neutral" : "success"}
      />
      <ActionNotice state={state} />
    </form>
  );
}

export function EstateDecisionForm({
  projectId,
  partyId,
}: {
  projectId: string;
  partyId: string;
}) {
  const [state, action] = useActionState(
    recordEstateDecisionAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-4 grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="party_id" value={partyId} />
      <select name="decision_type" className={inputClass}>
        <option value="consent">موافقة</option>
        <option value="approval">اعتماد</option>
        <option value="release">مخالصة</option>
        <option value="objection">اعتراض</option>
      </select>
      <select name="status" className={inputClass}>
        <option value="pending">بانتظار الرد</option>
        <option value="accepted">مقبول</option>
        <option value="rejected">مرفوض</option>
        <option value="withdrawn">مسحوب</option>
      </select>
      <input
        name="subject_type"
        required
        maxLength={120}
        className={`${inputClass} sm:col-span-2`}
        placeholder="موضوع القرار، مثل بيع العقار أو المخالصة النهائية"
      />
      <textarea
        name="notes"
        rows={2}
        maxLength={1000}
        className={`${textareaClass} sm:col-span-2`}
        placeholder="ملاحظات القرار"
      />
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <SubmitButton label="تسجيل القرار" icon={Check} compact />
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function EstateFinancialEntryForm({
  projectId,
  assets,
  parties,
}: {
  projectId: string;
  assets: { id: string; name: string }[];
  parties: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(
    recordEstateFinancialEntryAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <label>
        <span className="mb-2 block text-sm font-bold">نوع القيد</span>
        <select name="entry_type" className={inputClass}>
          <option value="income">إيراد</option>
          <option value="expense">مصروف</option>
          <option value="reserve">احتياطي</option>
          <option value="distribution">توزيع لوارث</option>
          <option value="transfer">تحويل</option>
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">المبلغ</span>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            className={inputClass}
          />
          <input
            name="currency"
            defaultValue="SAR"
            maxLength={3}
            required
            className={inputClass}
            dir="ltr"
          />
        </div>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">الأصل</span>
        <select name="asset_id" className={inputClass}>
          <option value="">قيد عام للتركة</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">الوارث أو الطرف</span>
        <select name="party_id" className={inputClass}>
          <option value="">دون طرف محدد</option>
          {parties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">تاريخ القيد</span>
        <input
          name="occurred_on"
          type="date"
          required
          defaultValue={saudiDateValue()}
          className={inputClass}
        />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">البيان</span>
        <input
          name="description"
          required
          minLength={3}
          maxLength={1000}
          className={inputClass}
        />
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="إرسال القيد للاعتماد" icon={Send} />
      </div>
    </form>
  );
}

export function EstateFinancialReviewForm({
  projectId,
  entryId,
}: {
  projectId: string;
  entryId: string;
}) {
  const [state, action] = useActionState(
    reviewEstateFinancialEntryAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="entry_id" value={entryId} />
      <input
        name="review_notes"
        maxLength={1000}
        className={inputClass}
        placeholder="ملاحظة الاعتماد أو سبب الرفض"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          name="decision"
          value="approved"
          className="h-11 rounded-md bg-emerald-700 px-3 text-sm font-bold text-white"
        >
          اعتماد
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          className="h-11 rounded-md border border-red-300 px-3 text-sm font-bold text-red-700"
        >
          رفض
        </button>
      </div>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function EstateReportCreateForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(
    createEstateReportAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <label>
        <span className="mb-2 block text-sm font-bold">نهاية فترة التقرير</span>
        <input
          name="period_end"
          type="date"
          required
          defaultValue={saudiDateValue()}
          className={inputClass}
        />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">ملاحظات معد التقرير</span>
        <input name="human_notes" maxLength={5000} className={inputClass} />
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="إنشاء التقرير من بيانات النظام" icon={Plus} />
      </div>
    </form>
  );
}

export function EstateReportTransitionForm({
  projectId,
  reportId,
  status,
}: {
  projectId: string;
  reportId: string;
  status: string;
}) {
  const [state, action] = useActionState(
    transitionEstateReportAction,
    initialActionState,
  );
  const next =
    status === "draft"
      ? { status: "submitted", label: "إرسال للمراجعة" }
      : status === "submitted"
        ? { status: "approved", label: "اعتماد التقرير" }
        : status === "approved"
          ? { status: "published", label: "نشر للعميل" }
          : status === "published"
            ? { status: "withdrawn", label: "سحب من العميل" }
            : null;
  if (!next) return null;

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="report_id" value={reportId} />
      <input type="hidden" name="new_status" value={next.status} />
      {status === "draft" ? (
        <textarea
          name="human_notes"
          rows={2}
          maxLength={5000}
          className={textareaClass}
          placeholder="ملاحظات بشرية تضاف إلى النسخة المقدمة"
        />
      ) : null}
      <SubmitButton
        label={next.label}
        icon={status === "approved" ? Send : Check}
        compact
        tone={status === "submitted" ? "success" : "brand"}
      />
      <ActionNotice state={state} />
    </form>
  );
}

export function EstateProjectMemberForm({
  projectId,
  staff,
}: {
  projectId: string;
  staff: { id: string; name: string; department?: string | null }[];
}) {
  const [state, action] = useActionState(
    assignEstateProjectMemberAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <select name="user_id" required className={inputClass}>
        <option value="">اختر موظفًا</option>
        {staff.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name}
            {employee.department ? ` - ${employee.department}` : ""}
          </option>
        ))}
      </select>
      <select name="membership_role" className={inputClass}>
        <option value="executor">منفذ</option>
        <option value="follower">متابع</option>
        <option value="finance">مالية</option>
        <option value="litigation">تقاضي</option>
        <option value="observer">مراقب</option>
      </select>
      <label className="flex h-11 items-center gap-3 rounded-md border border-line px-3 text-sm">
        <input
          name="can_contact_client"
          type="checkbox"
          className="size-4 accent-brand"
        />
        السماح بالتواصل مع العميل
      </label>
      <div className="self-end">
        <SubmitButton label="إضافة إلى المشروع" icon={UserPlus} />
      </div>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function EstateProjectMemberRemoveForm({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  const [state, action] = useActionState(
    removeEstateProjectMemberAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="user_id" value={userId} />
      <input
        name="reason"
        required
        minLength={5}
        maxLength={1000}
        className={`${inputClass} min-w-52 flex-1`}
        placeholder="سبب إنهاء العضوية"
      />
      <SubmitButton label="إنهاء العضوية" icon={UserMinus} compact />
      <ActionNotice state={state} />
    </form>
  );
}

export function EstateLitigationReferralForm({
  projectId,
  categories,
  managers,
  assignees,
}: {
  projectId: string;
  categories: { id: string; name: string }[];
  managers: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(
    createEstateLitigationSubprojectAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <label className="sm:col-span-2">
        <span className="mb-2 block text-sm font-bold">موضوع نزاع التركة</span>
        <input name="name" required minLength={3} className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">تخصص النزاع</span>
        <select name="category_id" required className={inputClass}>
          <option value="">اختر التخصص</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">مدير مشروع التقاضي</span>
        <select name="project_manager_id" required className={inputClass}>
          <option value="">اختر مدير التقاضي</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">المكلف الرئيسي</span>
        <select name="primary_assignee_id" required className={inputClass}>
          <option value="">اختر المحامي أو الأخصائي</option>
          {assignees.map((assignee) => (
            <option key={assignee.id} value={assignee.id}>
              {assignee.name}
            </option>
          ))}
        </select>
      </label>
      <div className="self-end">
        <SubmitButton label="إنشاء مشروع التقاضي" icon={Gavel} />
      </div>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function ProjectTeamForm({
  projectId,
  members,
  stages,
}: {
  projectId: string;
  members: { id: string; name: string }[];
  stages: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(
    createProjectTeamAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <label>
        <span className="mb-2 block text-sm font-bold">رمز الفريق</span>
        <input name="code" required className={inputClass} placeholder="inventory" />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">اسم الفريق</span>
        <input name="name" required className={inputClass} placeholder="فريق الحصر" />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">قائد الفريق</span>
        <select name="leader_id" className={inputClass}>
          <option value="">دون قائد مؤقتًا</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">المرحلة</span>
        <select name="stage_instance_id" className={inputClass}>
          <option value="">جميع المراحل المطابقة للرمز</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">بداية الفريق</span>
        <input name="starts_at" type="datetime-local" className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">نهاية الفريق</span>
        <input name="ends_at" type="datetime-local" className={inputClass} />
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="إنشاء فريق" icon={UsersRound} />
      </div>
    </form>
  );
}

export function ProjectTeamUpdateForm({
  projectId,
  team,
  members,
  stages,
}: {
  projectId: string;
  team: {
    id: string;
    name: string;
    status: string;
    leaderId: string | null;
    stageInstanceId: string | null;
    startsAt: string | null;
    endsAt: string | null;
  };
  members: { id: string; name: string }[];
  stages: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(
    updateProjectTeamAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="team_id" value={team.id} />
      <label>
        <span className="mb-2 block text-xs font-bold">اسم الفريق</span>
        <input name="name" required defaultValue={team.name} className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-xs font-bold">الحالة</span>
        <select name="status" defaultValue={team.status} className={inputClass}>
          <option value="planned">مخطط</option>
          <option value="active">نشط</option>
          <option value="completed">مكتمل</option>
          <option value="cancelled">ملغى</option>
        </select>
      </label>
      <label>
        <span className="mb-2 block text-xs font-bold">القائد</span>
        <select
          name="leader_id"
          defaultValue={team.leaderId ?? ""}
          className={inputClass}
        >
          <option value="">دون قائد</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-xs font-bold">المرحلة</span>
        <select
          name="stage_instance_id"
          defaultValue={team.stageInstanceId ?? ""}
          className={inputClass}
        >
          <option value="">كل المراحل المطابقة</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-2 block text-xs font-bold">البداية</span>
        <input
          name="starts_at"
          type="datetime-local"
          defaultValue={team.startsAt?.slice(0, 16) ?? ""}
          className={inputClass}
        />
      </label>
      <label>
        <span className="mb-2 block text-xs font-bold">النهاية</span>
        <input
          name="ends_at"
          type="datetime-local"
          defaultValue={team.endsAt?.slice(0, 16) ?? ""}
          className={inputClass}
        />
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="حفظ إعدادات الفريق" icon={Save} />
      </div>
    </form>
  );
}

export function ProjectTeamMemberForm({
  projectId,
  teamId,
  members,
}: {
  projectId: string;
  teamId: string;
  members: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(
    assignProjectTeamMemberAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_150px_160px_auto]">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="team_id" value={teamId} />
      <select name="user_id" required defaultValue="" className={inputClass}>
        <option value="" disabled>
          اختر عضوًا من المشروع
        </option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <select name="team_role" defaultValue="member" className={inputClass}>
        <option value="leader">قائد</option>
        <option value="member">عضو منفذ</option>
        <option value="observer">متابع</option>
      </select>
      <select name="work_type" defaultValue="" className={inputClass}>
        <option value="">نوع العمل (اختياري)</option>
        <option value="inventory">حصر</option>
        <option value="study">دراسة</option>
        <option value="pleading">مرافعة</option>
        <option value="follow_up">متابعة</option>
        <option value="drafting">صياغة</option>
        <option value="other">أخرى</option>
      </select>
      <SubmitButton label="إضافة أو تعديل" icon={UserPlus} />
      <div className="sm:col-span-2 xl:col-span-4">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function ProjectTeamMemberRemoveForm({
  projectId,
  teamId,
  userId,
}: {
  projectId: string;
  teamId: string;
  userId: string;
}) {
  const [state, action] = useActionState(
    removeProjectTeamMemberAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="user_id" value={userId} />
      <input
        name="reason"
        required
        minLength={5}
        className={inputClass}
        placeholder="سبب إنهاء العضوية"
      />
      <SubmitButton label="إزالة" icon={UserMinus} />
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
    </form>
  );
}

export function ProjectMessageForm({
  projectId,
  conversationId,
}: {
  projectId: string;
  conversationId: string;
}) {
  const [state, action] = useActionState(
    sendProjectMessageAction,
    initialActionState,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="conversation_id" value={conversationId} />
      <textarea
        name="body"
        rows={3}
        required
        className={textareaClass}
        placeholder="اكتب تحديثًا واضحًا لفريق المشروع..."
      />
      <ActionNotice state={state} />
      <SubmitButton label="إرسال الرسالة" icon={MessageSquareText} />
    </form>
  );
}

export function ProjectDocumentForm({ projectId, workflowActionId }: { projectId: string; workflowActionId?: string }) {
  const [state, action] = useActionState(
    uploadProjectDocumentAction,
    initialActionState,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="project_id" value={projectId} />
      {workflowActionId ? <input type="hidden" name="workflow_action_id" value={workflowActionId} /> : null}
      <label>
        <span className="mb-2 block text-sm font-bold">عنوان المستند</span>
        <input name="title" required className={inputClass} />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">نوع المستند</span>
        <select name="document_type" className={inputClass}>
          <option value="case_document">مستند قضية</option>
          <option value="power_of_attorney">وكالة</option>
          <option value="court_filing">مذكرة أو لائحة</option>
          <option value="hearing_minutes">ضبط جلسة</option>
          <option value="estate_document">مستند تركة</option>
          <option value="report">تقرير</option>
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className="mb-2 block text-sm font-bold">الملف</span>
        <input
          name="file"
          type="file"
          required
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
          className="block w-full rounded-md border border-dashed border-line bg-white px-3 py-4 text-sm file:ml-3 file:rounded-md file:border-0 file:bg-[#e5eee9] file:px-3 file:py-2 file:font-bold file:text-brand"
        />
      </label>
      <div className="sm:col-span-2">
        <ActionNotice state={state} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton label="رفع وفهرسة" icon={FileUp} />
      </div>
    </form>
  );
}

export function ProjectDocumentPublicationForm({
  projectId,
  documentId,
  currentStatus,
  currentVisibility,
}: {
  projectId: string;
  documentId: string;
  currentStatus: string;
  currentVisibility: string;
}) {
  const [state, action] = useActionState(
    updateProjectDocumentPublicationAction,
    initialActionState,
  );
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="document_id" value={documentId} />
      <select
        name="visibility"
        defaultValue={currentVisibility}
        className="h-9 rounded-md border border-line bg-white px-2 text-xs"
        title="مستوى الرؤية"
      >
        <option value="internal">داخلي</option>
        <option value="client_visible">ظاهر للعميل</option>
        <option value="requires_client_action">يتطلب إجراء العميل</option>
      </select>
      <select
        name="status"
        defaultValue={currentStatus}
        className="h-9 rounded-md border border-line bg-white px-2 text-xs"
        title="حالة النشر"
      >
        <option value="draft">مسودة</option>
        <option value="awaiting_approval">بانتظار اعتماد النشر</option>
        <option value="published">منشور</option>
        <option value="withdrawn">مسحوب</option>
      </select>
      <SubmitButton label="تحديث النشر" icon={Save} compact />
      <ActionNotice state={state} />
    </form>
  );
}
