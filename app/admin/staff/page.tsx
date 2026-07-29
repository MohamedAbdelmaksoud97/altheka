import { redirect } from "next/navigation";
import { Inbox, UserRoundCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StaffApprovalForm } from "@/components/admin/staff-approval-form";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

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
  ]);

  const profileIds = (requests ?? []).map((request) => request.profile_id);
  const { data: profiles } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", profileIds)
    : { data: [] };

  const profilesById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );

  return (
    <AppShell access={access} eyebrow="إدارة النظام" title="تفعيل الموظفين">
      <div className="mb-6 flex items-start gap-3 border-b border-line pb-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e5eee9] text-brand">
          <UserRoundCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-bold">طلبات التسجيل المعلقة</h2>
          <p className="mt-1 text-sm leading-7 text-muted">
            لا يحصل الموظف على أي وصول تشغيلي حتى اعتماد الإدارة والمسمى ودور واحد
            على الأقل.
          </p>
        </div>
      </div>

      {requests?.length ? (
        <div className="space-y-4">
          {requests.map((request) => {
            const profile = profilesById.get(request.profile_id);
            return (
              <StaffApprovalForm
                key={request.id}
                request={{
                  id: request.id,
                  fullName: profile?.full_name ?? "موظف جديد",
                  phone: profile?.phone ?? null,
                  requestedDepartment: request.requested_department_text,
                  requestedJobTitle: request.requested_job_title_text,
                  createdAt: request.created_at,
                }}
                departments={departments ?? []}
                jobTitles={jobTitles ?? []}
                roles={roles ?? []}
              />
            );
          })}
        </div>
      ) : (
        <section className="flex min-h-64 flex-col items-center justify-center border-y border-line bg-surface px-5 text-center">
          <Inbox className="size-8 text-muted" aria-hidden="true" />
          <h2 className="mt-4 font-bold">لا توجد طلبات معلقة</h2>
          <p className="mt-2 text-sm text-muted">ستظهر طلبات الموظفين الجديدة هنا.</p>
        </section>
      )}
    </AppShell>
  );
}
