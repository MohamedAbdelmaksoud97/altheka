"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, LoaderCircle, UserRoundX } from "lucide-react";
import {
  approveStaffAction,
  rejectStaffAction,
} from "@/app/actions/admin";
import { initialActionState } from "@/app/actions/action-state";

type Department = { id: string; name: string };
type JobTitle = { id: string; name: string; department_id: string | null };
type Role = { id: string; name: string; code: string };
type Category = { id: string; code: string; name: string };

function ApprovalButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 font-bold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="size-4" aria-hidden="true" />
      )}
      اعتماد وتفعيل
    </button>
  );
}

function RejectionButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <UserRoundX className="size-4" aria-hidden="true" />
      )}
      رفض الطلب
    </button>
  );
}

export function StaffApprovalForm({
  request,
  departments,
  jobTitles,
  roles,
  categories,
}: {
  request: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    requestedDepartment: string | null;
    requestedJobTitle: string | null;
    createdAt: string;
  };
  departments: Department[];
  jobTitles: JobTitle[];
  roles: Role[];
  categories: Category[];
}) {
  const [state, formAction] = useActionState(
    approveStaffAction,
    initialActionState,
  );
  const [rejectionState, rejectionAction] = useActionState(
    rejectStaffAction,
    initialActionState,
  );
  const [departmentId, setDepartmentId] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const supervisorRole = roles.find(
    (role) => role.code === "litigation_supervisor",
  );
  const isSupervisor = supervisorRole
    ? selectedRoleIds.includes(supervisorRole.id)
    : false;
  const availableJobTitles = useMemo(
    () =>
      jobTitles.filter(
        (jobTitle) =>
          jobTitle.department_id === null ||
          !departmentId ||
          jobTitle.department_id === departmentId,
      ),
    [departmentId, jobTitles],
  );

  return (
    <article className="rounded-md border border-line bg-surface">
      <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 className="font-bold">{request.fullName}</h2>
          <p className="mt-1 text-sm text-muted">
            {request.email || "لا يوجد بريد"} ·{" "}
            {request.phone || "لا يوجد رقم تواصل"} · طلب في{" "}
            {new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(
              new Date(request.createdAt),
            )}
          </p>
        </div>
        <span className="w-fit rounded-md bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
          قيد الاعتماد
        </span>
      </div>

      <form action={formAction} className="space-y-5 p-5">
        <input type="hidden" name="request_id" value={request.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-bold">الإدارة</span>
            <select
              name="department_id"
              required
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none"
            >
              <option value="">اختر الإدارة</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            {request.requestedDepartment ? (
              <span className="mt-1.5 block text-xs text-muted">
                المطلوب عند التسجيل: {request.requestedDepartment}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold">المسمى الوظيفي</span>
            <select
              name="job_title_id"
              required
              disabled={!departmentId}
              className="h-11 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none disabled:bg-[#f0f2f1]"
            >
              <option value="">اختر المسمى</option>
              {availableJobTitles.map((jobTitle) => (
                <option key={jobTitle.id} value={jobTitle.id}>
                  {jobTitle.name}
                </option>
              ))}
            </select>
            {request.requestedJobTitle ? (
              <span className="mt-1.5 block text-xs text-muted">
                المطلوب عند التسجيل: {request.requestedJobTitle}
              </span>
            ) : null}
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-bold">الأدوار والصلاحيات</legend>
          <p className="mt-1 text-xs leading-6 text-muted">
            الإدارة تحدد نطاق العمل، بينما تمنح الأدوار الصلاحيات الفعلية. اختر أقل
            عدد من الأدوار اللازمة.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => (
              <label
                key={role.id}
                className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-white px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="role_ids"
                  value={role.id}
                  checked={selectedRoleIds.includes(role.id)}
                  onChange={(event) =>
                    setSelectedRoleIds((current) =>
                      event.target.checked
                        ? [...current, role.id]
                        : current.filter((roleId) => roleId !== role.id),
                    )
                  }
                  className="size-4 accent-[#1f5c4e]"
                />
                {role.name}
              </label>
            ))}
          </div>
        </fieldset>

        {isSupervisor ? (
          <fieldset>
            <legend className="text-sm font-bold">تخصصات الإشراف</legend>
            <p className="mt-1 text-xs leading-6 text-muted">
              اختر تخصصًا واحدًا على الأقل. تظهر للمشرف القضايا المطابقة فقط.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <label
                  key={category.id}
                  className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-white px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="specialty_ids"
                    value={category.id}
                    className="size-4 accent-[#1f5c4e]"
                  />
                  {category.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <label className="block">
          <span className="mb-2 block text-sm font-bold">ملاحظة الاعتماد</span>
          <textarea
            name="review_notes"
            rows={3}
            maxLength={500}
            className="w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>

        {state.message ? (
          <div
            role="status"
            className={`rounded-md border px-4 py-3 text-sm ${
              state.status === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {state.message}
          </div>
        ) : null}

        <div className="flex justify-end">
          <ApprovalButton />
        </div>
      </form>

      <form
        action={rejectionAction}
        className="grid gap-3 border-t border-line bg-[#fffafa] px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <input type="hidden" name="request_id" value={request.id} />
        <label>
          <span className="mb-2 block text-sm font-bold text-red-800">
            سبب الرفض
          </span>
          <input
            name="reason"
            required
            minLength={5}
            maxLength={500}
            placeholder="مثال: الحساب مكرر أو بيانات الموظف غير مكتملة"
            className="h-10 w-full rounded-md border border-red-200 bg-white px-3 text-sm focus:border-red-500 focus:outline-none"
          />
        </label>
        <RejectionButton />
        {rejectionState.message ? (
          <div
            role="status"
            className={`text-sm sm:col-span-2 ${
              rejectionState.status === "success"
                ? "text-emerald-700"
                : "text-red-700"
            }`}
          >
            {rejectionState.message}
          </div>
        ) : null}
      </form>
    </article>
  );
}
