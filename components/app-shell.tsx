import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Files,
  LayoutDashboard,
  LogOut,
  ScanSearch,
  Settings2,
  ScrollText,
  Tags,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import type { AccessContext } from "@/lib/auth/access";

export function AppShell({
  access,
  title,
  eyebrow,
  children,
}: {
  access: AccessContext;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  const canApproveStaff = access.permissions.includes("staff.approve");
  const homeHref = access.accountKind === "client" ? "/client" : "/workspace";
  const canManageRequests = access.permissions.includes("requests.manage");
  const canWorkPreContract = [
    "studies.submit",
    "studies.approve_litigation",
    "studies.approve_estates",
  ].some((permission) => access.permissions.includes(permission));
  const canOpenRequests = canManageRequests || canWorkPreContract;
  const canOpenProjects = access.accountKind === "staff";
  const canOpenSupervision = access.permissions.includes("supervision.read");
  const canManageCaseCategories = access.permissions.includes(
    "case_categories.manage",
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href={homeHref} className="flex min-w-0 items-center gap-3">
            <Image
              src="/logo.png"
              alt="أساس الثقة"
              width={52}
              height={52}
              className="size-12 shrink-0 rounded-md object-cover"
              priority
            />
            <div className="hidden min-w-0 sm:block">
              <p className="font-bold">أساس الثقة</p>
              <p className="text-xs text-muted">منصة العمليات القانونية</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href={homeHref}
              title="لوحة البداية"
              className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
            >
              <LayoutDashboard className="size-5" aria-hidden="true" />
              <span className="sr-only">لوحة البداية</span>
            </Link>
            {canOpenRequests ? (
              <Link
                href="/workspace/requests"
                title={
                  canManageRequests
                    ? "طلبات العملاء"
                    : "مهامي قبل التعاقد"
                }
                className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
              >
                <Files className="size-5" aria-hidden="true" />
                <span className="sr-only">
                  {canManageRequests
                    ? "طلبات العملاء"
                    : "مهامي قبل التعاقد"}
                </span>
              </Link>
            ) : null}
            {canOpenProjects ? (
              <Link
                href="/workspace/projects"
                title="المشاريع"
                className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
              >
                <BriefcaseBusiness className="size-5" aria-hidden="true" />
                <span className="sr-only">المشاريع</span>
              </Link>
            ) : null}
            {access.accountKind === "staff" &&
            access.activationStatus === "active_staff" ? (
              <>
                <Link
                  href="/workspace/tasks"
                  title="المهام التشغيلية"
                  className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
                >
                  <ClipboardList className="size-5" aria-hidden="true" />
                  <span className="sr-only">المهام التشغيلية</span>
                </Link>
                <Link
                  href="/workspace/calendar"
                  title="التقويم"
                  className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
                >
                  <CalendarDays className="size-5" aria-hidden="true" />
                  <span className="sr-only">التقويم</span>
                </Link>
                <Link
                  href="/workspace/powers-of-attorney"
                  title="الوكالات"
                  className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
                >
                  <ScrollText className="size-5" aria-hidden="true" />
                  <span className="sr-only">الوكالات</span>
                </Link>
              </>
            ) : null}
            {access.accountKind === "staff" &&
            access.activationStatus === "active_staff" ? (
              <Link
                href="/workspace/notifications"
                title="الإشعارات"
                className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
              >
                <Bell className="size-5" aria-hidden="true" />
                <span className="sr-only">الإشعارات</span>
              </Link>
            ) : null}
            {canOpenSupervision ||
            access.permissions.includes("tasks.approve_proposed") ||
            access.permissions.includes("projects.read_all") ? (
              <Link
                href="/workspace/reports"
                title="تقارير التشغيل"
                className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
              >
                <BarChart3 className="size-5" aria-hidden="true" />
                <span className="sr-only">تقارير التشغيل</span>
              </Link>
            ) : null}
            {canOpenSupervision ? (
              <Link
                href="/workspace/supervision"
                title="لوحة الإشراف"
                className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
              >
                <ScanSearch className="size-5" aria-hidden="true" />
                <span className="sr-only">لوحة الإشراف</span>
              </Link>
            ) : null}
            {canApproveStaff ? (
              <Link
                href="/admin/staff"
                title="إدارة الموظفين"
                className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
              >
                <Settings2 className="size-5" aria-hidden="true" />
                <span className="sr-only">إدارة الموظفين</span>
              </Link>
            ) : null}
            {canManageCaseCategories ? (
              <Link
                href="/admin/case-categories"
                title="أنواع القضايا"
                className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
              >
                <Tags className="size-5" aria-hidden="true" />
                <span className="sr-only">أنواع القضايا</span>
              </Link>
            ) : null}
            <form action={logoutAction}>
              <button
                type="submit"
                title="تسجيل الخروج"
                className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-danger hover:text-danger"
              >
                <LogOut className="size-5" aria-hidden="true" />
                <span className="sr-only">تسجيل الخروج</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main>
        <div className="border-b border-line bg-[#eef1ef]">
          <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
            <p className="text-sm font-bold text-brand">{eyebrow}</p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-2xl font-bold">{title}</h1>
              <p className="text-sm text-muted">{access.fullName}</p>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
