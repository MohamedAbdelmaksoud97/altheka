"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  LoaderCircle,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import {
  setStaffActivationAction,
  updateStaffAccessAction,
} from "@/app/actions/admin";
import { initialActionState } from "@/app/actions/action-state";
import { StaffApprovalForm } from "@/components/admin/staff-approval-form";

export type StaffDepartment = { id: string; name: string };
export type StaffJobTitle = {
  id: string;
  name: string;
  departmentId: string | null;
};
export type StaffRole = { id: string; name: string; code: string };
export type StaffCategory = { id: string; code: string; name: string };
export type StaffRequest = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  requestedDepartment: string | null;
  requestedJobTitle: string | null;
  createdAt: string;
};
export type StaffEmployee = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  activationStatus: string;
  isActive: boolean;
  departmentId: string | null;
  departmentName: string | null;
  jobTitleId: string | null;
  jobTitleName: string | null;
  roles: StaffRole[];
  specialtyIds: string[];
  approvedAt: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  statusReason: string | null;
  statusChangedAt: string | null;
  isProtected: boolean;
};
export type StaffHistoryEntry = {
  id: number;
  staffProfileId: string;
  action: string;
  actorName: string;
  createdAt: string;
  details: unknown;
};

type StaffTab = "pending" | "active" | "inactive";

function SubmitButton({
  label,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  icon: typeof Save;
  tone?: "brand" | "danger" | "success";
}) {
  const { pending } = useFormStatus();
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
      : tone === "success"
        ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
        : "border-brand bg-brand text-white hover:bg-brand-strong";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-bold transition disabled:opacity-60 ${toneClass}`}
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

function ActionNotice({
  state,
}: {
  state: typeof initialActionState;
}) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      className={`text-sm ${
        state.status === "success" ? "text-emerald-700" : "text-red-700"
      }`}
    >
      {state.message}
    </p>
  );
}

function StaffAccessForm({
  employee,
  departments,
  jobTitles,
  roles,
  categories,
}: {
  employee: StaffEmployee;
  departments: StaffDepartment[];
  jobTitles: StaffJobTitle[];
  roles: StaffRole[];
  categories: StaffCategory[];
}) {
  const [state, action] = useActionState(
    updateStaffAccessAction,
    initialActionState,
  );
  const [departmentId, setDepartmentId] = useState(employee.departmentId ?? "");
  const [selectedRoleIds, setSelectedRoleIds] = useState(
    employee.roles.map((role) => role.id),
  );
  const supervisorRole = roles.find(
    (role) => role.code === "litigation_supervisor",
  );
  const isSupervisor = supervisorRole
    ? selectedRoleIds.includes(supervisorRole.id)
    : false;
  const availableTitles = jobTitles.filter(
    (title) =>
      title.departmentId === null || title.departmentId === departmentId,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="profile_id" value={employee.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1.5 block text-xs font-bold">الاسم الكامل</span>
          <input
            name="full_name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={employee.fullName}
            className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-bold">رقم التواصل</span>
          <input
            name="phone"
            maxLength={40}
            defaultValue={employee.phone ?? ""}
            className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-bold">الإدارة</span>
          <select
            name="department_id"
            required
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none"
          >
            <option value="">اختر الإدارة</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-bold">
            المسمى الوظيفي
          </span>
          <select
            name="job_title_id"
            required
            defaultValue={employee.jobTitleId ?? ""}
            disabled={!departmentId}
            className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none disabled:bg-[#f0f2f1]"
          >
            <option value="">اختر المسمى</option>
            {availableTitles.map((title) => (
              <option key={title.id} value={title.id}>
                {title.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="text-xs font-bold">الأدوار والصلاحيات</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {roles.map((role) => (
            <label
              key={role.id}
              className="flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm"
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
          <legend className="text-xs font-bold">تخصصات الإشراف</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {categories.map((category) => (
              <label
                key={category.id}
                className="flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm"
              >
                <input
                  type="checkbox"
                  name="specialty_ids"
                  value={category.id}
                  defaultChecked={employee.specialtyIds.includes(category.id)}
                  className="size-4 accent-[#1f5c4e]"
                />
                {category.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <label>
        <span className="mb-1.5 block text-xs font-bold">سبب التعديل</span>
        <input
          name="reason"
          required
          minLength={5}
          maxLength={500}
          placeholder="مثال: نقل الموظف إلى إدارة التقاضي"
          className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActionNotice state={state} />
        <SubmitButton label="حفظ التعديلات" icon={Save} />
      </div>
    </form>
  );
}

function StaffStatusForm({ employee }: { employee: StaffEmployee }) {
  const [state, action] = useActionState(
    setStaffActivationAction,
    initialActionState,
  );
  const operation = employee.isActive ? "disable" : "reactivate";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="profile_id" value={employee.id} />
      <input type="hidden" name="operation" value={operation} />
      <label>
        <span className="mb-1.5 block text-xs font-bold">
          {employee.isActive ? "سبب تعطيل الحساب" : "سبب إعادة التفعيل"}
        </span>
        <input
          name="reason"
          required
          minLength={5}
          maxLength={500}
          placeholder={
            employee.isActive
              ? "مثال: انتهاء علاقة العمل"
              : "مثال: عودة الموظف إلى العمل"
          }
          className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none"
        />
      </label>
      <ActionNotice state={state} />
      <SubmitButton
        label={employee.isActive ? "تعطيل الحساب" : "إعادة التفعيل"}
        icon={employee.isActive ? Ban : RotateCcw}
        tone={employee.isActive ? "danger" : "success"}
      />
    </form>
  );
}

const historyLabels: Record<string, string> = {
  insert: "إنشاء سجل",
  update: "تحديث بيانات",
  staff_access_updated: "تعديل بيانات الوصول والأدوار",
};

function StaffHistory({ entries }: { entries: StaffHistoryEntry[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <History className="size-4 text-brand" aria-hidden="true" />
        <h4 className="text-sm font-bold">آخر التغييرات</h4>
      </div>
      {entries.length ? (
        <ol className="space-y-3">
          {entries.slice(0, 12).map((entry) => (
            <li
              key={entry.id}
              className="border-r-2 border-line pr-3 text-xs leading-6"
            >
              <p className="font-bold">
                {historyLabels[entry.action] ?? entry.action}
              </p>
              <p className="text-muted">
                {entry.actorName} ·{" "}
                {new Intl.DateTimeFormat("ar-EG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(entry.createdAt))}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">لا توجد تغييرات مسجلة لهذا الحساب.</p>
      )}
    </div>
  );
}

function StaffEmployeeRow({
  employee,
  departments,
  jobTitles,
  roles,
  categories,
  history,
}: {
  employee: StaffEmployee;
  departments: StaffDepartment[];
  jobTitles: StaffJobTitle[];
  roles: StaffRole[];
  categories: StaffCategory[];
  history: StaffHistoryEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const canEdit =
    !employee.isProtected &&
    ["active_staff", "disabled"].includes(employee.activationStatus);
  const statusLabel =
    employee.activationStatus === "active_staff"
      ? "نشط"
      : employee.activationStatus === "rejected_staff"
        ? "مرفوض"
        : "معطل";

  return (
    <article
      data-testid="staff-employee-row"
      className="rounded-md border border-line bg-surface"
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="grid w-full gap-4 px-4 py-4 text-right md:grid-cols-[minmax(14rem,1.4fr)_minmax(10rem,1fr)_minmax(12rem,1fr)_auto] md:items-center"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e5eee9] font-bold text-brand">
            {employee.fullName.trim().slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold">{employee.fullName}</span>
            <span className="mt-1 block truncate text-xs text-muted">
              {employee.email ?? "لا يوجد بريد مسجل"}
            </span>
          </span>
        </span>
        <span className="text-sm">
          <span className="block font-bold">
            {employee.departmentName ?? "بلا إدارة"}
          </span>
          <span className="mt-1 block text-xs text-muted">
            {employee.jobTitleName ?? "بلا مسمى"}
          </span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {employee.roles.length ? (
            employee.roles.map((role) => (
              <span
                key={role.id}
                className="rounded-md bg-[#f0f4f2] px-2 py-1 text-xs font-bold text-brand"
              >
                {role.name}
              </span>
            ))
          ) : (
            <span className="text-xs text-red-700">بلا دور فعال</span>
          )}
        </span>
        <span className="flex items-center justify-between gap-3 md:justify-end">
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-bold ${
              employee.isActive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-[#f0f2f1] text-muted"
            }`}
          >
            {employee.isProtected ? "محمي" : statusLabel}
          </span>
          {expanded ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded ? (
        <div className="grid gap-6 border-t border-line bg-subtle p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,0.7fr)]">
          {employee.isProtected ? (
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 text-brand" aria-hidden="true" />
              <div>
                <h3 className="font-bold">حساب مدير نظام محمي</h3>
                <p className="mt-1 text-sm leading-7 text-muted">
                  لا يمكن تعطيل هذا الحساب أو سحب دور مدير النظام من واجهة
                  الموظفين. تدار حسابات مديري النظام بإجراء Bootstrap مستقل.
                </p>
              </div>
            </div>
          ) : canEdit ? (
            <div>
              <h3 className="mb-4 font-bold">بيانات الموظف والوصول</h3>
              <StaffAccessForm
                employee={employee}
                departments={departments}
                jobTitles={jobTitles}
                roles={roles}
                categories={categories}
              />
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="mb-3 font-bold">حالة الحساب</h3>
                {employee.statusReason ? (
                  <p className="mb-3 text-sm leading-7 text-muted">
                    آخر سبب مسجل: {employee.statusReason}
                  </p>
                ) : null}
                <StaffStatusForm employee={employee} />
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 text-sm leading-7 text-muted">
              <UserRoundX className="mt-1 size-5 shrink-0" aria-hidden="true" />
              طلب هذا الحساب مرفوض. يبقى محفوظًا للتدقيق ولا يعاد تفعيله من
              واجهة الموظفين.
            </div>
          )}
          <StaffHistory entries={history} />
        </div>
      ) : null}
    </article>
  );
}

export function StaffManagementConsole({
  currentUserId,
  requests,
  employees,
  departments,
  jobTitles,
  roles,
  categories,
  history,
}: {
  currentUserId: string;
  requests: StaffRequest[];
  employees: StaffEmployee[];
  departments: StaffDepartment[];
  jobTitles: StaffJobTitle[];
  roles: StaffRole[];
  categories: StaffCategory[];
  history: StaffHistoryEntry[];
}) {
  const activeEmployees = employees.filter(
    (employee) => employee.activationStatus === "active_staff" && employee.isActive,
  );
  const inactiveEmployees = employees.filter((employee) =>
    ["disabled", "rejected_staff"].includes(employee.activationStatus),
  );
  const [tab, setTab] = useState<StaffTab>(
    requests.length ? "pending" : "active",
  );
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const visibleEmployees = useMemo(() => {
    const source = tab === "active" ? activeEmployees : inactiveEmployees;
    const normalizedSearch = search.trim().toLocaleLowerCase("ar");
    return source.filter((employee) => {
      const departmentMatches =
        !departmentId || employee.departmentId === departmentId;
      const haystack = [
        employee.fullName,
        employee.email,
        employee.phone,
        employee.departmentName,
        employee.jobTitleName,
        ...employee.roles.map((role) => role.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ar");
      return departmentMatches && (!normalizedSearch || haystack.includes(normalizedSearch));
    });
  }, [
    activeEmployees,
    departmentId,
    inactiveEmployees,
    search,
    tab,
  ]);

  const historyByProfile = useMemo(() => {
    const grouped = new Map<string, StaffHistoryEntry[]>();
    for (const entry of history) {
      const entries = grouped.get(entry.staffProfileId) ?? [];
      entries.push(entry);
      grouped.set(entry.staffProfileId, entries);
    }
    return grouped;
  }, [history]);

  const tabs: {
    code: StaffTab;
    label: string;
    count: number;
    icon: typeof UsersRound;
  }[] = [
    {
      code: "pending",
      label: "طلبات التفعيل",
      count: requests.length,
      icon: UserRoundCheck,
    },
    {
      code: "active",
      label: "الموظفون النشطون",
      count: activeEmployees.length,
      icon: UsersRound,
    },
    {
      code: "inactive",
      label: "الحسابات غير النشطة",
      count: inactiveEmployees.length,
      icon: UserRoundX,
    },
  ];

  return (
    <div>
      <div
        role="tablist"
        aria-label="حالات الموظفين"
        className="grid border-y border-line bg-surface sm:grid-cols-3"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const selected = tab === item.code;
          return (
            <button
              key={item.code}
              type="button"
              role="tab"
              data-testid={`staff-tab-${item.code}`}
              aria-selected={selected}
              onClick={() => setTab(item.code)}
              className={`flex min-h-16 items-center justify-center gap-3 border-b-2 px-4 text-sm font-bold transition ${
                selected
                  ? "border-brand bg-[#f5f8f6] text-brand"
                  : "border-transparent text-muted hover:bg-subtle"
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
              <span className="min-w-7 rounded-md bg-[#edf1ef] px-2 py-1 text-xs text-ink">
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {tab !== "pending" ? (
        <div className="grid gap-3 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_15rem]">
          <label className="relative">
            <span className="sr-only">البحث في الموظفين</span>
            <Search
              className="pointer-events-none absolute right-3 top-3 size-4 text-muted"
              aria-hidden="true"
            />
            <input
              data-testid="staff-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو البريد أو المسمى أو الدور"
              className="h-10 w-full rounded-md border border-line bg-white pr-10 pl-3 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          <label>
            <span className="sr-only">تصفية حسب الإدارة</span>
            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none"
            >
              <option value="">كل الإدارات</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="mt-5">
        {tab === "pending" ? (
          requests.length ? (
            <div className="space-y-4">
              {requests.map((request) => (
                <StaffApprovalForm
                  key={request.id}
                  request={request}
                  departments={departments.map((department) => ({
                    id: department.id,
                    name: department.name,
                  }))}
                  jobTitles={jobTitles.map((title) => ({
                    id: title.id,
                    name: title.name,
                    department_id: title.departmentId,
                  }))}
                  roles={roles}
                  categories={categories}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center border-y border-line bg-surface text-center">
              <CheckCircle2 className="size-8 text-emerald-600" aria-hidden="true" />
              <h2 className="mt-4 font-bold">لا توجد طلبات تنتظر التفعيل</h2>
              <p className="mt-2 text-sm text-muted">
                ستظهر هنا حسابات الموظفين الجديدة فقط.
              </p>
            </div>
          )
        ) : visibleEmployees.length ? (
          <div className="space-y-3">
            {visibleEmployees.map((employee) => (
              <StaffEmployeeRow
                key={employee.id}
                employee={{
                  ...employee,
                  isProtected:
                    employee.isProtected || employee.id === currentUserId,
                }}
                departments={departments}
                jobTitles={jobTitles}
                roles={roles}
                categories={categories}
                history={historyByProfile.get(employee.id) ?? []}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center border-y border-line bg-surface text-center">
            <Search className="size-8 text-muted" aria-hidden="true" />
            <h2 className="mt-4 font-bold">لا توجد نتائج مطابقة</h2>
            <p className="mt-2 text-sm text-muted">
              جرّب تغيير البحث أو فلتر الإدارة.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
