import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  ClockAlert,
  UserRoundCheck,
  Workflow,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspacePage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const supabase = await createClient();
  const isAdmin = access.roleCodes.includes("super_admin");

  const [
    { count: templateCount },
    { count: projectCount },
    { count: pendingStaffCount },
    { count: requestCount },
  ] = await Promise.all([
    supabase
      .from("workflow_templates")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null),
    isAdmin
      ? supabase
          .from("staff_registration_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : Promise.resolve({ count: 0, data: null, error: null }),
    supabase
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);

  const metrics = [
    {
      label: "قوالب العمل المنشورة",
      value: templateCount ?? 0,
      icon: Workflow,
      accent: "text-brand bg-[#e5eee9]",
    },
    {
      label: "المشاريع النشطة",
      value: projectCount ?? 0,
      icon: BriefcaseBusiness,
      accent: "text-[#825f17] bg-[#f5ecd6]",
    },
    {
      label: "طلبات تفعيل الموظفين",
      value: pendingStaffCount ?? 0,
      icon: UserRoundCheck,
      accent: "text-[#7f3b3b] bg-[#f7e7e7]",
    },
  ];

  return (
    <AppShell access={access} eyebrow="مساحة العمل" title="لوحة العمليات">
      <section className="grid gap-4 sm:grid-cols-3">
        {metrics.map(({ label, value, icon: Icon, accent }) => (
          <article key={label} className="rounded-md border border-line bg-surface p-5">
            <span className={`grid size-10 place-items-center rounded-md ${accent}`}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-5 text-3xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-sm text-muted">{label}</p>
          </article>
        ))}
      </section>

      <section className="mt-7 border-y border-line bg-surface px-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ClockAlert className="size-5 text-gold" aria-hidden="true" />
              <h2 className="text-lg font-bold">بداية Sprint الأول جاهزة</h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
              قوالب ما قبل التعاقد والتقاضي وأصل التركة منشورة كبيانات تجريبية،
              وتتضمن الأطراف الأربعة والتوازي وحدود 60 و90 يومًا.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/workspace/requests"
              className="flex h-11 items-center gap-2 rounded-md bg-brand px-4 font-bold text-white transition hover:bg-brand-strong"
            >
              طلبات العملاء ({requestCount ?? 0})
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
            {isAdmin ? (
              <Link
                href="/admin/staff"
                className="flex h-11 items-center gap-2 rounded-md border border-line bg-white px-4 font-bold text-muted transition hover:border-brand hover:text-brand"
              >
                مراجعة الموظفين
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
