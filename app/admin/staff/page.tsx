import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  StaffManagementConsole,
  type StaffEmployee,
  type StaffHistoryEntry,
  type StaffRequest,
} from "@/components/admin/staff-management-console";
import { getAccessContext } from "@/lib/auth/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;

function relationOne<T>(relation: Relation<T>): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

export default async function StaffAdministrationPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("staff.approve")) redirect("/workspace");

  const supabase = await createClient();
  const [
    { data: requests },
    { data: departments },
    { data: jobTitles },
    { data: roles },
    { data: profiles },
    { data: historyRows },
    { data: categories },
    { data: specialtyRows },
  ] = await Promise.all([
    supabase
      .from("staff_registration_requests")
      .select(
        "id, profile_id, requested_department_text, requested_job_title_text, created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("departments")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("job_titles")
      .select("id, name, department_id")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("roles")
      .select("id, name, code")
      .eq("is_active", true)
      .neq("code", "super_admin")
      .order("name"),
    supabase
      .from("profiles")
      .select(
        "id, full_name, phone, activation_status, is_active, department_id, job_title_id, approved_at, created_at, status_reason, status_changed_at, department:departments!profiles_department_id_fkey(id, name), job_title:job_titles!profiles_job_title_id_fkey(id, name), user_roles!user_roles_user_id_fkey(role_id, revoked_at, role:roles!user_roles_role_id_fkey(id, name, code))",
      )
      .eq("account_kind", "staff")
      .is("deleted_at", null)
      .order("full_name"),
    supabase.rpc("get_staff_change_history", {
      p_profile_id: null,
      p_limit: 800,
    }),
    supabase
      .from("litigation_case_categories")
      .select("id, code, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("litigation_supervisor_specialties")
      .select("supervisor_id, category_id")
      .is("revoked_at", null),
  ]);

  const profileIds = new Set((profiles ?? []).map((profile) => profile.id));
  const authById = new Map<
    string,
    { email: string | null; lastSignInAt: string | null }
  >();
  try {
    const admin = createAdminClient();
    const {
      data: { users },
    } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const user of users) {
      if (profileIds.has(user.id)) {
        authById.set(user.id, {
          email: user.email ?? null,
          lastSignInAt: user.last_sign_in_at ?? null,
        });
      }
    }
  } catch {
    // The directory remains operational without Auth metadata.
  }

  const requestProfileIds = (requests ?? []).map(
    (request) => request.profile_id,
  );
  const { data: requestProfiles } = requestProfileIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", requestProfileIds)
    : { data: [] };
  const requestProfilesById = new Map(
    (requestProfiles ?? []).map((profile) => [profile.id, profile]),
  );

  const pendingRequests: StaffRequest[] = (requests ?? []).map((request) => {
    const profile = requestProfilesById.get(request.profile_id);
    return {
      id: request.id,
      fullName: profile?.full_name ?? "موظف جديد",
      email: authById.get(request.profile_id)?.email ?? null,
      phone: profile?.phone ?? null,
      requestedDepartment: request.requested_department_text,
      requestedJobTitle: request.requested_job_title_text,
      createdAt: request.created_at,
    };
  });

  const employees: StaffEmployee[] = (profiles ?? []).map((profile) => {
    const department = relationOne(
      profile.department as Relation<{ id: string; name: string }>,
    );
    const jobTitle = relationOne(
      profile.job_title as Relation<{ id: string; name: string }>,
    );
    const activeRoles = (
      profile.user_roles as unknown as {
        role_id: string;
        revoked_at: string | null;
        role: Relation<{ id: string; name: string; code: string }>;
      }[]
    )
      .filter((userRole) => !userRole.revoked_at)
      .map((userRole) => relationOne(userRole.role))
      .filter((role): role is { id: string; name: string; code: string } =>
        Boolean(role),
      );
    const authUser = authById.get(profile.id);
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: authUser?.email ?? null,
      phone: profile.phone,
      activationStatus: profile.activation_status,
      isActive: profile.is_active,
      departmentId: profile.department_id,
      departmentName: department?.name ?? null,
      jobTitleId: profile.job_title_id,
      jobTitleName: jobTitle?.name ?? null,
      roles: activeRoles,
      specialtyIds: (specialtyRows ?? [])
        .filter((specialty) => specialty.supervisor_id === profile.id)
        .map((specialty) => specialty.category_id),
      approvedAt: profile.approved_at,
      createdAt: profile.created_at,
      lastSignInAt: authUser?.lastSignInAt ?? null,
      statusReason: profile.status_reason,
      statusChangedAt: profile.status_changed_at,
      isProtected: activeRoles.some((role) => role.code === "super_admin"),
    };
  });

  const history: StaffHistoryEntry[] = (
    (historyRows ?? []) as {
      id: number;
      staff_profile_id: string;
      action: string;
      actor_name: string;
      created_at: string;
      details: unknown;
    }[]
  ).map((entry) => ({
    id: entry.id,
    staffProfileId: entry.staff_profile_id,
    action: entry.action,
    actorName: entry.actor_name,
    createdAt: entry.created_at,
    details: entry.details,
  }));

  return (
    <AppShell access={access} eyebrow="إدارة النظام" title="إدارة الموظفين">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e5eee9] text-brand">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-bold">الموظفون والوصول التشغيلي</h2>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-muted">
            راجع طلبات التسجيل، وعدّل الإدارة والمسمى والأدوار، وعطّل الحسابات
            أو أعد تفعيلها. كل تغيير يحتاج سببًا ويحفظ في سجل التدقيق.
          </p>
        </div>
      </div>

      <StaffManagementConsole
        currentUserId={access.userId}
        requests={pendingRequests}
        employees={employees}
        departments={(departments ?? []).map((department) => ({
          id: department.id,
          name: department.name,
        }))}
        jobTitles={(jobTitles ?? []).map((jobTitle) => ({
          id: jobTitle.id,
          name: jobTitle.name,
          departmentId: jobTitle.department_id,
        }))}
        roles={(roles ?? []).map((role) => ({
          id: role.id,
          name: role.name,
          code: role.code,
        }))}
        categories={(categories ?? []).map((category) => ({
          id: category.id,
          code: category.code,
          name: category.name,
        }))}
        history={history}
      />
    </AppShell>
  );
}
