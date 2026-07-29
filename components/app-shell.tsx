import Image from "next/image";
import Link from "next/link";
import { Files, LayoutDashboard, LogOut, Settings2 } from "lucide-react";
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
  const isAdmin = access.roleCodes.includes("super_admin");
  const homeHref = access.accountKind === "client" ? "/client" : "/workspace";
  const canManageRequests = access.accountKind === "staff";

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
            <div className="min-w-0">
              <p className="truncate font-bold">أساس الثقة</p>
              <p className="truncate text-xs text-muted">منصة العمليات القانونية</p>
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
            {canManageRequests ? (
              <Link
                href="/workspace/requests"
                title="طلبات العملاء"
                className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
              >
                <Files className="size-5" aria-hidden="true" />
                <span className="sr-only">طلبات العملاء</span>
              </Link>
            ) : null}
            {isAdmin ? (
              <Link
                href="/admin/staff"
                title="إدارة الموظفين"
                className="grid size-10 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
              >
                <Settings2 className="size-5" aria-hidden="true" />
                <span className="sr-only">إدارة الموظفين</span>
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
