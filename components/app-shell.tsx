import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Clock3,
  ContactRound,
  Files,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanSearch,
  Settings2,
  ShieldCheck,
  Tags,
  ScrollText,
  MessageSquareText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import type { AccessContext } from "@/lib/auth/access";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

function Brand({ homeHref, compact = false }: { homeHref: string; compact?: boolean }) {
  return (
    <Link href={homeHref} className="flex min-w-0 items-center gap-3">
      <Image
        src="/logo.png"
        alt="أساس الثقة"
        width={52}
        height={52}
        className="size-12 shrink-0 rounded-md object-cover"
        priority
      />
      <div className={compact ? "min-w-0" : "min-w-0"}>
        <p className="font-bold leading-6">أساس الثقة</p>
        <p className="text-xs leading-5 text-muted">منصة العمليات القانونية</p>
      </div>
    </Link>
  );
}

function NavigationLinks({ items }: { items: NavigationItem[] }) {
  return (
    <nav aria-label="التنقل الرئيسي" className="grid gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-bold text-muted transition hover:bg-[#eef1ef] hover:text-brand"
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutButton({ fullWidth = false }: { fullWidth?: boolean }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={`flex min-h-11 items-center justify-center gap-3 rounded-md border border-line bg-white px-3 text-sm font-bold text-muted transition hover:border-danger hover:text-danger ${
          fullWidth ? "w-full" : ""
        }`}
      >
        <LogOut className="size-5 shrink-0" aria-hidden="true" />
        <span>تسجيل الخروج</span>
      </button>
    </form>
  );
}

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
  const canReadClients = access.permissions.includes("clients.read");
  const isActiveStaff =
    access.accountKind === "staff" && access.activationStatus === "active_staff";
  const canOpenSupervision = access.permissions.includes("supervision.read");
  const canManageCaseCategories = access.permissions.includes(
    "case_categories.manage",
  );
  const canOpenAuditLog =
    access.permissions.includes("audit.read") &&
    (access.roleCodes.includes("super_admin") ||
      access.roleCodes.includes("executive_manager"));

  const navigationItems: NavigationItem[] = [
    {
      href: homeHref,
      label: "لوحة البداية",
      icon: LayoutDashboard,
    },
    ...(canOpenRequests
      ? [
          {
            href: "/workspace/requests",
            label: canManageRequests ? "طلبات العملاء" : "مهامي قبل التعاقد",
            icon: Files,
          },
        ]
      : []),
    ...(canOpenProjects
      ? [
          {
            href: "/workspace/projects",
            label: "المشاريع",
            icon: BriefcaseBusiness,
          },
        ]
      : []),
    ...(canReadClients
      ? [
          {
            href: "/workspace/clients",
            label: "سجل العملاء",
            icon: ContactRound,
          },
        ]
      : []),
    ...(isActiveStaff
      ? [
          {
            href: "/workspace/team-chat",
            label: "محادثات فريق العمل",
            icon: MessageSquareText,
          },
          {
            href: "/workspace/tasks",
            label: "المهام التشغيلية",
            icon: ClipboardList,
          },
          ...(access.permissions.includes("tasks.review_extensions") ? [{ href: "/workspace/extensions", label: "طلبات التمديد", icon: Clock3 }] : []),
          {
            href: "/workspace/calendar",
            label: "التقويم",
            icon: CalendarDays,
          },
          {
            href: "/workspace/powers-of-attorney",
            label: "وكالات",
            icon: ScrollText,
          },
          {
            href: "/workspace/notifications",
            label: "الإشعارات",
            icon: Bell,
          },
        ]
      : []),
    ...(canOpenSupervision ||
    access.permissions.includes("tasks.approve_proposed") ||
    access.permissions.includes("projects.read_all")
      ? [
          {
            href: "/workspace/reports",
            label: "تقارير التشغيل",
            icon: BarChart3,
          },
        ]
      : []),
    ...(canOpenSupervision
      ? [
          {
            href: "/workspace/supervision",
            label: "لوحة الإشراف",
            icon: ScanSearch,
          },
        ]
      : []),
    ...(canApproveStaff
      ? [
          {
            href: "/admin/staff",
            label: "إدارة الموظفين",
            icon: Settings2,
          },
        ]
      : []),
    ...(canOpenAuditLog
      ? [
          // href="/workspace/audit-log" remains intentionally explicit for access checks.
          {
            href: "/workspace/audit-log",
            label: "سجل التدقيق",
            icon: ShieldCheck,
          },
        ]
      : []),
    ...(canManageCaseCategories
      ? [
          {
            href: "/admin/case-categories",
            label: "أنواع القضايا",
            icon: Tags,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen lg:pr-72">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-72 border-l border-line bg-surface lg:flex lg:flex-col">
        <div className="border-b border-line px-5 py-5">
          <Brand homeHref={homeHref} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <NavigationLinks items={navigationItems} />
        </div>
        <div className="border-t border-line p-3">
          <p className="mb-3 truncate px-2 text-xs font-bold text-muted">
            {access.fullName}
          </p>
          <LogoutButton fullWidth />
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-line bg-surface lg:hidden">
        <div className="flex min-h-18 items-center justify-between gap-3 px-4 py-3">
          <Brand homeHref={homeHref} compact />
          <details className="relative [&_summary::-webkit-details-marker]:hidden">
            <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand">
              <Menu className="size-5" aria-hidden="true" />
              <span className="sr-only">فتح القائمة</span>
            </summary>
            <div className="absolute left-0 top-14 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-line bg-surface p-3 shadow-lg">
              <NavigationLinks items={navigationItems} />
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-3 truncate px-2 text-xs font-bold text-muted">
                  {access.fullName}
                </p>
                <LogoutButton fullWidth />
              </div>
            </div>
          </details>
        </div>
      </header>

      <main>
        <div className="border-b border-line bg-[#eef1ef]">
          <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
            <p className="text-sm font-bold text-brand">{eyebrow}</p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-2xl font-bold">{title}</h1>
              <p className="hidden text-sm text-muted sm:block lg:hidden">
                {access.fullName}
              </p>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
