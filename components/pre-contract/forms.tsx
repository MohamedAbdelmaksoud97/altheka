"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  BadgeCheck,
  BriefcaseBusiness,
  FileCheck2,
  FileUp,
  Save,
  Link2,
  LoaderCircle,
  MailPlus,
  Send,
  UserRoundCheck,
} from "lucide-react";
import {
  acceptContractAction,
  assignRequestAction,
  convertToProjectAction,
  createRequestAction,
  inviteClientAction,
  linkClientRequestAction,
  respondProposalAction,
  reviewStudyAction,
  sendContractAction,
  sendProposalAction,
  submitStudyAction,
  updateDocumentPublicationAction,
  updateRequestCategoryAction,
  uploadRequestDocumentsAction,
} from "@/app/actions/pre-contract";
import {
  initialActionState,
  type ActionState,
} from "@/app/actions/action-state";
import type { LitigationCategoryOption } from "@/lib/litigation/categories";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none";
const textareaClass =
  "w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm leading-7 focus:border-brand focus:outline-none";

type ClientSourceOption = { id: string; name: string; code?: string | null };
type DocumentCategoryOption = {
  id: string;
  name: string;
  code?: string | null;
  scope?: string | null;
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
  pendingLabel = "جارٍ الحفظ",
  icon: Icon = Send,
  tone = "brand",
}: {
  label: string;
  pendingLabel?: string;
  icon?: typeof Send;
  tone?: "brand" | "danger" | "neutral";
}) {
  const { pending } = useFormStatus();
  const toneClass =
    tone === "danger"
      ? "bg-danger text-white hover:bg-[#833232]"
      : tone === "neutral"
        ? "border border-line bg-white text-foreground hover:border-brand"
        : "bg-brand text-white hover:bg-brand-strong";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-5 font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="size-4" aria-hidden="true" />
      )}
      {pending ? pendingLabel : label}
    </button>
  );
}

export function InviteClientForm({
  clientSources,
}: {
  clientSources: ClientSourceOption[];
}) {
  const [state, formAction] = useActionState(
    inviteClientAction,
    initialActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-bold">اسم العميل</span>
          <input name="full_name" required minLength={3} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold">البريد الإلكتروني</span>
          <input type="email" name="email" required className={inputClass} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-bold">رقم التواصل</span>
          <input name="phone" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold">مصدر العميل</span>
          <select name="client_source_id" className={inputClass}>
            <option value="">غير محدد</option>
            {clientSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ActionNotice state={state} />
      <SubmitButton label="إرسال دعوة العميل" icon={MailPlus} />
    </form>
  );
}

export function CreateRequestForm({
  clients,
  litigationCategories,
  clientSources,
}: {
  clients: { id: string; full_name: string; email?: string | null }[];
  litigationCategories: LitigationCategoryOption[];
  clientSources: ClientSourceOption[];
}) {
  const [state, formAction] = useActionState(
    createRequestAction,
    initialActionState,
  );
  const [requestType, setRequestType] = useState("litigation");
  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-bold">حساب العميل</span>
        <select name="client_profile_id" required className={inputClass}>
          <option value="">اختر العميل المسجل</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.full_name}
              {client.email ? ` - ${client.email}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">مصدر العميل</span>
        <select
          name="client_source_id"
          className={inputClass}
        >
          <option value="">غير محدد</option>
          {clientSources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">نوع الخدمة</span>
        <select
          name="request_type"
          required
          value={requestType}
          onChange={(event) => setRequestType(event.target.value)}
          className={inputClass}
        >
          <option value="litigation">تقاضٍ</option>
          <option value="estate">تصفية تركة</option>
          <option value="consultation">استشارة قانونية</option>
          <option value="other">خدمة قانونية أخرى</option>
        </select>
      </label>
      {requestType === "litigation" ? (
        <label className="block">
          <span className="mb-2 block text-sm font-bold">نوع القضية</span>
          <select
            name="litigation_case_category_id"
            required
            className={inputClass}
          >
            <option value="">اختر تخصص القضية</option>
            {litigationCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block">
        <span className="mb-2 block text-sm font-bold">عنوان الطلب</span>
        <input
          name="title"
          required
          minLength={5}
          maxLength={160}
          className={inputClass}
          placeholder="مثال: دراسة دعوى مطالبة مالية"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">ملخص الطلب</span>
        <textarea
          name="summary"
          required
          minLength={10}
          maxLength={3000}
          rows={5}
          className={textareaClass}
          placeholder="اكتب الوقائع الأساسية والنتيجة التي ترغب في الوصول إليها."
        />
      </label>
      <ActionNotice state={state} />
      <SubmitButton label="إنشاء الطلب وربط العميل" />
    </form>
  );
}

export function RequestCategoryForm({
  requestId,
  categories,
  currentCategoryId,
}: {
  requestId: string;
  categories: LitigationCategoryOption[];
  currentCategoryId?: string | null;
}) {
  const [state, formAction] = useActionState(
    updateRequestCategoryAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />
      <label className="block">
        <span className="mb-2 block text-sm font-bold">نوع القضية</span>
        <select
          name="litigation_case_category_id"
          required
          defaultValue={currentCategoryId ?? ""}
          className={inputClass}
        >
          <option value="">اختر تخصص القضية</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">سبب التصنيف أو التعديل</span>
        <input
          name="reason"
          required
          minLength={5}
          maxLength={500}
          className={inputClass}
          placeholder="مثال: تمت مراجعة موضوع النزاع واختصاصه"
        />
      </label>
      <ActionNotice state={state} />
      <SubmitButton label="حفظ نوع القضية" icon={Save} />
    </form>
  );
}

export function UploadDocumentForm({
  requestId,
  canPublish = false,
  documentCategories = [],
}: {
  requestId: string;
  canPublish?: boolean;
  documentCategories?: DocumentCategoryOption[];
}) {
  const [state, formAction] = useActionState(
    uploadRequestDocumentsAction,
    initialActionState,
  );
  return (
    <form
      action={formAction}
      data-testid="request-document-upload"
      className="space-y-4"
    >
      <input type="hidden" name="request_id" value={requestId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-bold">عنوان المستند</span>
          <input name="title" required minLength={3} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold">نوع المستند</span>
          <select name="document_type" required className={inputClass}>
            <option value="client_attachment">مرفق من العميل</option>
            <option value="identity">هوية</option>
            <option value="evidence">مستند مؤيد</option>
            <option value="correspondence">مراسلات</option>
            <option value="other">أخرى</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-bold">تصنيف المستند</span>
          <select
            name="document_category_id"
            required={documentCategories.length > 0}
            className={inputClass}
          >
            <option value="">غير محدد</option>
            {documentCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold">رقم المستند</span>
          <input name="document_number" maxLength={100} className={inputClass} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <label className="block">
          <span className="mb-2 block text-sm font-bold">تاريخ المستند</span>
          <input type="date" name="document_date" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold">عدد الصفحات</span>
          <input type="number" name="page_count" min={1} className={inputClass} />
        </label>
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">الوصف</span>
        <textarea name="description" rows={3} className={textareaClass} />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">الملف</span>
        <input
          type="file"
          name="files"
          multiple
          required
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
          className="block min-h-11 w-full rounded-md border border-line bg-white px-3 py-2 text-sm file:ml-3 file:rounded-md file:border-0 file:bg-[#e5eee9] file:px-3 file:py-1.5 file:font-bold file:text-brand"
        />
        <span className="mt-1.5 block text-xs text-muted">
          PDF أو Word أو Excel أو صورة، بحد أقصى 25 ميجابايت.
        </span>
      </label>
      {canPublish ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-bold">مستوى الرؤية</span>
            <select name="visibility" defaultValue="internal" className={inputClass}>
              <option value="internal">داخلي</option>
              <option value="client_visible">ظاهر للعميل</option>
              <option value="requires_client_action">يتطلب إجراء العميل</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">حالة النشر</span>
            <select
              name="publication_status"
              defaultValue="draft"
              className={inputClass}
            >
              <option value="draft">مسودة</option>
              <option value="awaiting_approval">بانتظار اعتماد النشر</option>
              <option value="published">نشر الآن</option>
            </select>
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="visibility" value="internal" />
          <input type="hidden" name="publication_status" value="draft" />
        </>
      )}
      <ActionNotice state={state} />
      <SubmitButton label="رفع المستند" icon={FileUp} />
    </form>
  );
}

export function DocumentPublicationForm({
  requestId,
  documentId,
  visibility,
  status,
}: {
  requestId: string;
  documentId: string;
  visibility: "internal" | "client_visible" | "requires_client_action";
  status: "draft" | "awaiting_approval" | "published" | "withdrawn";
}) {
  const [state, formAction] = useActionState(
    updateDocumentPublicationAction,
    initialActionState,
  );

  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-line pt-3">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="document_id" value={documentId} />
      <label>
        <span className="mb-1.5 block text-xs font-bold text-muted">
          مستوى الرؤية
        </span>
        <select name="visibility" defaultValue={visibility} className={inputClass}>
          <option value="internal">داخلي</option>
          <option value="client_visible">ظاهر للعميل</option>
          <option value="requires_client_action">يتطلب إجراء العميل</option>
        </select>
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-bold text-muted">
          حالة النشر
        </span>
        <select name="status" defaultValue={status} className={inputClass}>
          <option value="draft">مسودة</option>
          <option value="awaiting_approval">بانتظار الاعتماد</option>
          <option value="published">منشور</option>
          <option value="withdrawn">مسحوب</option>
        </select>
      </label>
      <ActionNotice state={state} />
      <SubmitButton label="حفظ إعدادات الرؤية" icon={Save} tone="neutral" />
    </form>
  );
}

export function LinkClientForm({ requestId }: { requestId: string }) {
  const [state, formAction] = useActionState(
    linkClientRequestAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="request_id" value={requestId} />
      <ActionNotice state={state} />
      <SubmitButton label="ربط العميل بالطلب" icon={Link2} />
    </form>
  );
}

export function AssignRequestForm({
  requestId,
  executors,
  approvers,
  defaultExecutorId,
  defaultApproverId,
}: {
  requestId: string;
  executors: { id: string; full_name: string }[];
  approvers: { id: string; full_name: string }[];
  defaultExecutorId?: string | null;
  defaultApproverId?: string | null;
}) {
  const [state, formAction] = useActionState(
    assignRequestAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-bold">المكلف بالدراسة</span>
          <select
            name="executor_id"
            required
            defaultValue={defaultExecutorId ?? ""}
            className={inputClass}
          >
            <option value="">اختر الموظف</option>
            {executors.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">معتمد الدراسة</span>
          <select
            name="approver_id"
            required
            defaultValue={defaultApproverId ?? ""}
            className={inputClass}
          >
            <option value="">اختر الموظف</option>
            {approvers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ActionNotice state={state} />
      <SubmitButton label="حفظ التكليف" icon={UserRoundCheck} />
    </form>
  );
}

export function StudyForm({
  requestId,
  returnedStudy,
}: {
  requestId: string;
  returnedStudy?: {
    summary: string;
    legal_opinion: string;
    recommended_path: string;
    review_notes: string | null;
  } | null;
}) {
  const [state, formAction] = useActionState(
    submitStudyAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />
      {returnedStudy?.review_notes ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ملاحظات المعتمد: {returnedStudy.review_notes}
        </p>
      ) : null}
      <label className="block">
        <span className="mb-2 block text-sm font-bold">ملخص الدراسة</span>
        <textarea
          name="summary"
          required
          minLength={10}
          rows={4}
          defaultValue={returnedStudy?.summary}
          className={textareaClass}
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">الرأي القانوني</span>
        <textarea
          name="legal_opinion"
          required
          minLength={10}
          rows={7}
          defaultValue={returnedStudy?.legal_opinion}
          className={textareaClass}
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">المسار المقترح</span>
        <select
          name="recommended_path"
          defaultValue={returnedStudy?.recommended_path ?? "litigation"}
          className={inputClass}
        >
          <option value="litigation">تقاضٍ</option>
          <option value="estate">تركات</option>
          <option value="consultation">استشارة</option>
          <option value="decline">عدم قبول الطلب</option>
        </select>
      </label>
      <ActionNotice state={state} />
      <SubmitButton label="إرسال الدراسة للاعتماد" icon={FileCheck2} />
    </form>
  );
}

export function ReviewStudyForm({
  requestId,
  studyId,
}: {
  requestId: string;
  studyId: string;
}) {
  const [state, formAction] = useActionState(
    reviewStudyAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="study_id" value={studyId} />
      <label className="block">
        <span className="mb-2 block text-sm font-bold">ملاحظات الاعتماد</span>
        <textarea name="notes" rows={3} className={textareaClass} />
      </label>
      <ActionNotice state={state} />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="decision"
          value="approve"
          className="flex min-h-11 items-center gap-2 rounded-md bg-brand px-5 font-bold text-white hover:bg-brand-strong"
        >
          <BadgeCheck className="size-4" aria-hidden="true" />
          اعتماد الدراسة
        </button>
        <button
          type="submit"
          name="decision"
          value="return"
          className="min-h-11 rounded-md border border-danger bg-white px-5 font-bold text-danger"
        >
          إعادتها للتعديل
        </button>
      </div>
    </form>
  );
}

export function ProposalForm({
  requestId,
  previousProposal,
}: {
  requestId: string;
  previousProposal?: {
    technical_scope: string;
    fee_amount: number;
    currency: string;
  } | null;
}) {
  const [state, formAction] = useActionState(
    sendProposalAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />
      <label className="block">
        <span className="mb-2 block text-sm font-bold">النطاق الفني</span>
        <textarea
          name="technical_scope"
          required
          minLength={10}
          rows={6}
          defaultValue={previousProposal?.technical_scope}
          className={textareaClass}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem_1fr]">
        <label>
          <span className="mb-2 block text-sm font-bold">الأتعاب</span>
          <input
            type="number"
            name="fee_amount"
            min={0}
            step="0.01"
            required
            defaultValue={previousProposal?.fee_amount}
            className={inputClass}
          />
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">العملة</span>
          <input
            name="currency"
            maxLength={3}
            defaultValue={previousProposal?.currency ?? "SAR"}
            className={inputClass}
          />
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">صالح حتى</span>
          <input type="date" name="valid_until" className={inputClass} />
        </label>
      </div>
      <ActionNotice state={state} />
      <SubmitButton
        label={previousProposal ? "إرسال عرض معدل" : "إرسال العرض"}
      />
    </form>
  );
}

export function ProposalResponseForm({
  requestId,
  proposalId,
}: {
  requestId: string;
  proposalId: string;
}) {
  const [state, formAction] = useActionState(
    respondProposalAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="proposal_id" value={proposalId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-bold">القرار</span>
          <select name="response_type" className={inputClass}>
            <option value="accept">قبول العرض</option>
            <option value="negotiate">طلب تفاوض</option>
            <option value="reject">رفض العرض</option>
          </select>
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">
            المبلغ المقترح عند طلب التخفيض
          </span>
          <input
            type="number"
            name="requested_amount"
            min={0}
            step="0.01"
            className={inputClass}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-bold">ملاحظتك</span>
        <textarea name="message" rows={3} className={textareaClass} />
      </label>
      <ActionNotice state={state} />
      <SubmitButton label="تأكيد الرد" icon={BadgeCheck} />
    </form>
  );
}

export function ContractForm({ requestId }: { requestId: string }) {
  const [state, formAction] = useActionState(
    sendContractAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />
      <label>
        <span className="mb-2 block text-sm font-bold">عنوان العقد</span>
        <input
          name="title"
          required
          minLength={3}
          className={inputClass}
          defaultValue="عقد تقديم خدمات قانونية"
        />
      </label>
      <label>
        <span className="mb-2 block text-sm font-bold">نص العقد</span>
        <textarea
          name="contract_body"
          required
          minLength={20}
          rows={12}
          className={textareaClass}
        />
      </label>
      <ActionNotice state={state} />
      <SubmitButton label="إرسال العقد للعميل" icon={FileCheck2} />
    </form>
  );
}

export function ContractAcceptanceForm({
  requestId,
  contractVersionId,
}: {
  requestId: string;
  contractVersionId: string;
}) {
  const [state, formAction] = useActionState(
    acceptContractAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />
      <input
        type="hidden"
        name="contract_version_id"
        value={contractVersionId}
      />
      <label className="flex items-start gap-3 rounded-md border border-line bg-white px-4 py-3 text-sm leading-7">
        <input
          type="checkbox"
          name="accepted"
          required
          className="mt-1.5 size-4 shrink-0 accent-[#1f5c4e]"
        />
        أوافق على العقد بنسخته المعروضة وأقر باطلاعي على محتواه واعتماده.
      </label>
      <ActionNotice state={state} />
      <SubmitButton label="اعتماد العقد" icon={BadgeCheck} />
    </form>
  );
}

export function ConvertToProjectForm({ requestId }: { requestId: string }) {
  const [state, formAction] = useActionState(
    convertToProjectAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="request_id" value={requestId} />
      <ActionNotice state={state} />
      <SubmitButton label="تحويل إلى مشروع" icon={BriefcaseBusiness} />
    </form>
  );
}
