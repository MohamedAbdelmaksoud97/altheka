import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ClipboardCheck,
  FilePenLine,
  Inbox,
  Search,
  UserPlus,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CreateRequestForm } from "@/components/pre-contract/forms";
import { getAccessContext } from "@/lib/auth/access";
import {
  labelFor,
  requestStatusLabels,
  requestStatusTone,
  requestTypeLabels,
} from "@/lib/pre-contract/status";
import { createClient } from "@/lib/supabase/server";

type RequestScope = "all" | "mine" | "execution" | "approvals";

type Assignment = {
  service_request_id: string;
  responsible_id: string | null;
  executor_id: string | null;
  follower_id: string | null;
  approver_id: string | null;
};

const inactiveStatuses = [
  "converted_to_project",
  "cancelled",
  "rejected",
];

function taskLabel(
  status: string,
  assignment: Assignment | undefined,
  userId: string,
) {
  if (!assignment) return null;
  if (
    assignment.approver_id === userId &&
    status === "study_pending_approval"
  ) {
    return "بانتظار اعتمادك";
  }
  if (assignment.executor_id === userId && status === "study_returned") {
    return "معادة لك للتعديل";
  }
  if (assignment.executor_id === userId && status === "assigned") {
    return "إعداد الدراسة";
  }
  if (
    assignment.responsible_id === userId ||
    assignment.follower_id === userId
  ) {
    return "متابعة الطلب";
  }
  return null;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    scope?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const canManageRequests = access.permissions.includes("requests.manage");
  const canCreateRequests = access.permissions.includes("requests.create");
  const canSubmitStudies = access.permissions.includes("studies.submit");
  const canApproveStudies = [
    "studies.approve_litigation",
    "studies.approve_estates",
  ].some((permission) => access.permissions.includes(permission));
  const canWorkPreContract = canSubmitStudies || canApproveStudies;

  if (!canManageRequests && !canWorkPreContract) redirect("/workspace");

  const filters = await searchParams;
  const requestedScope = filters.scope as RequestScope | undefined;
  const allowedScopes = new Set<RequestScope>([
    "mine",
    ...(canManageRequests ? (["all"] as RequestScope[]) : []),
    ...(canSubmitStudies ? (["execution"] as RequestScope[]) : []),
    ...(canApproveStudies ? (["approvals"] as RequestScope[]) : []),
  ]);
  const defaultScope: RequestScope = canCreateRequests
    ? "all"
    : canApproveStudies && !canSubmitStudies
      ? "approvals"
      : "mine";
  const scope =
    requestedScope && allowedScopes.has(requestedScope)
      ? requestedScope
      : defaultScope;

  const supabase = await createClient();
  let assignmentQuery = supabase
    .from("pre_contract_cases")
    .select(
      "service_request_id, responsible_id, executor_id, follower_id, approver_id",
    );

  if (scope === "mine") {
    assignmentQuery = assignmentQuery.or(
      [
        `responsible_id.eq.${access.userId}`,
        `executor_id.eq.${access.userId}`,
        `follower_id.eq.${access.userId}`,
        `approver_id.eq.${access.userId}`,
      ].join(","),
    );
  } else if (scope === "execution") {
    assignmentQuery = assignmentQuery.eq("executor_id", access.userId);
  } else if (scope === "approvals") {
    assignmentQuery = assignmentQuery.eq("approver_id", access.userId);
  }

  const { data: scopedAssignments } = await assignmentQuery;
  const scopedRequestIds = (scopedAssignments ?? []).map(
    (assignment) => assignment.service_request_id,
  );

  let requestQuery = supabase
    .from("service_requests")
    .select("id, request_type, title, status, created_at, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (scope !== "all") {
    if (scopedRequestIds.length) {
      requestQuery = requestQuery.in("id", scopedRequestIds);
    } else {
      requestQuery = requestQuery.eq(
        "id",
        "00000000-0000-0000-0000-000000000000",
      );
    }
  }
  if (scope === "execution" && !filters.status) {
    requestQuery = requestQuery.in("status", ["assigned", "study_returned"]);
  } else if (scope === "approvals" && !filters.status) {
    requestQuery = requestQuery.eq("status", "study_pending_approval");
  } else if (scope === "mine" && !filters.status) {
    requestQuery = requestQuery.not(
      "status",
      "in",
      `(${inactiveStatuses.join(",")})`,
    );
  }
  if (filters.status) {
    requestQuery = requestQuery.eq("status", filters.status);
  }
  if (filters.q?.trim()) {
    requestQuery = requestQuery.ilike(
      "title",
      `%${filters.q.trim()}%`,
    );
  }

  const [{ data: requests }, { data: clients }] = await Promise.all([
    requestQuery,
    canCreateRequests
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .eq("account_kind", "client")
          .in("activation_status", ["client_waiting", "active_client"])
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("full_name")
      : Promise.resolve({ data: [], error: null }),
  ]);

  let visibleAssignments = scopedAssignments ?? [];
  if (scope === "all" && requests?.length) {
    const { data } = await supabase
      .from("pre_contract_cases")
      .select(
        "service_request_id, responsible_id, executor_id, follower_id, approver_id",
      )
      .in(
        "service_request_id",
        requests.map((request) => request.id),
      );
    visibleAssignments = data ?? [];
  }
  const assignmentByRequest = new Map(
    (visibleAssignments as Assignment[]).map((assignment) => [
      assignment.service_request_id,
      assignment,
    ]),
  );

  const scopes: {
    value: RequestScope;
    label: string;
    icon: typeof Inbox;
    show: boolean;
  }[] = [
    {
      value: "all" as const,
      label: "كل الطلبات",
      icon: Inbox,
      show: canManageRequests,
    },
    {
      value: "mine" as const,
      label: "المسندة إلي",
      icon: ClipboardCheck,
      show: true,
    },
    {
      value: "execution" as const,
      label: "إعداد الدراسة",
      icon: FilePenLine,
      show: canSubmitStudies,
    },
    {
      value: "approvals" as const,
      label: "بانتظار اعتمادي",
      icon: ClipboardCheck,
      show: canApproveStudies,
    },
  ].filter((item) => item.show);

  const pageTitle = canCreateRequests
    ? "طلبات العملاء"
    : "مهامي قبل التعاقد";

  return (
    <AppShell
      access={access}
      eyebrow="ما قبل التعاقد"
      title={pageTitle}
    >
      {canCreateRequests ? (
        <section className="mb-6 border-y border-line bg-surface px-5 py-5">
          <div className="mb-5 flex items-center gap-3">
            <UserPlus className="size-5 text-brand" aria-hidden="true" />
            <h2 className="font-bold">
              إنشاء طلب وربط حساب العميل
            </h2>
          </div>
          <CreateRequestForm clients={clients ?? []} />
        </section>
      ) : null}

      <nav
        aria-label="نطاق طلبات ما قبل التعاقد"
        className="mb-4 flex flex-wrap gap-1 rounded-md border border-line bg-surface p-1"
      >
        {scopes.map(({ value, label, icon: Icon }) => (
          <Link
            key={value}
            href={{
              pathname: "/workspace/requests",
              query: { scope: value },
            }}
            className={`inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-sm font-bold transition ${
              scope === value
                ? "bg-brand text-white"
                : "text-muted hover:bg-[#eef1ef] hover:text-foreground"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>

      <form className="grid gap-3 border-y border-line bg-surface px-5 py-4 sm:grid-cols-[1fr_15rem_auto]">
        <input type="hidden" name="scope" value={scope} />
        <label className="relative">
          <Search
            className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="البحث بعنوان الطلب"
            className="h-11 w-full rounded-md border border-line bg-white pr-10 pl-3 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <select
          name="status"
          defaultValue={filters.status}
          className="h-11 rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none"
        >
          <option value="">كل الحالات</option>
          {Object.entries(requestStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="h-11 rounded-md bg-brand px-5 font-bold text-white hover:bg-brand-strong">
          تطبيق
        </button>
      </form>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Inbox className="size-5 text-brand" aria-hidden="true" />
            <h2 className="font-bold">
              {scope === "all" ? "صندوق الطلبات" : "مهامي الحالية"}
            </h2>
          </div>
          <span className="text-sm tabular-nums text-muted">
            {requests?.length ?? 0} طلب
          </span>
        </div>

        {requests?.length ? (
          <div className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
            {requests.map((request) => {
              const currentTask = taskLabel(
                request.status,
                assignmentByRequest.get(request.id),
                access.userId,
              );
              return (
                <Link
                  key={request.id}
                  href={`/workspace/requests/${request.id}`}
                  className="grid gap-4 px-5 py-4 transition hover:bg-[#fafbfa] sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-gold">
                        {labelFor(
                          requestTypeLabels,
                          request.request_type,
                        )}
                      </p>
                      {currentTask ? (
                        <span className="rounded-sm bg-[#e5eee9] px-2 py-1 text-[10px] font-bold text-brand">
                          {currentTask}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-1 truncate font-bold">
                      {request.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      آخر تحديث{" "}
                      {new Intl.DateTimeFormat("ar-EG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(request.updated_at))}
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
              );
            })}
          </div>
        ) : (
          <div className="mt-4 border-y border-line bg-surface px-5 py-10 text-center">
            <p className="font-bold">لا توجد مهام في هذا الصندوق</p>
            <p className="mt-2 text-sm text-muted">
              تظهر هنا الطلبات عند تكليفك بالدراسة أو المتابعة أو
              الاعتماد.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
