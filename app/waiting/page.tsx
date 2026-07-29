import Image from "next/image";
import { redirect } from "next/navigation";
import { Clock3, LogOut, ShieldCheck } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { getAccessContext } from "@/lib/auth/access";

const messages = {
  pending_staff_approval: {
    icon: ShieldCheck,
    title: "حسابك بانتظار اعتماد مدير النظام",
    description:
      "تم تسجيل طلب الموظف. سيحدد مدير النظام إدارتك ومسمّاك وأدوارك قبل فتح مساحة العمل.",
  },
  client_waiting: {
    icon: Clock3,
    title: "حسابك جاهز للربط",
    description:
      "تم إنشاء حساب العميل. سيظهر طلبك أو مشروعك هنا فور ربطه بالحساب من مدير العملاء.",
  },
  rejected_staff: {
    icon: ShieldCheck,
    title: "تعذر اعتماد طلب الموظف",
    description: "راجع إدارة النظام للتأكد من بيانات التسجيل والجهة الوظيفية.",
  },
  disabled: {
    icon: ShieldCheck,
    title: "الحساب غير نشط",
    description: "تم تعطيل الوصول مع الاحتفاظ بسجل الأعمال السابق. راجع مدير النظام.",
  },
} as const;

export default async function WaitingPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus === "active_staff") redirect("/workspace");
  if (
    access.accountKind === "client" &&
    ["client_waiting", "active_client"].includes(access.activationStatus)
  ) {
    redirect("/client");
  }

  const content =
    messages[access.activationStatus as keyof typeof messages] ??
    messages.client_waiting;
  const Icon = content.icon;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-xl rounded-lg border border-line bg-surface p-6 text-center shadow-[0_18px_60px_rgba(24,32,29,0.08)] sm:p-9">
        <Image
          src="/logo.png"
          alt="أساس الثقة"
          width={72}
          height={72}
          className="mx-auto size-18 rounded-md object-cover"
          priority
        />
        <span className="mx-auto mt-7 grid size-12 place-items-center rounded-md bg-[#e5eee9] text-brand">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-5 text-sm font-bold text-gold">مرحبًا {access.fullName}</p>
        <h1 className="mt-2 text-2xl font-bold leading-10">{content.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted">
          {content.description}
        </p>
        <form action={logoutAction} className="mt-7">
          <button
            type="submit"
            className="mx-auto flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-5 font-bold text-muted transition hover:border-danger hover:text-danger"
          >
            <LogOut className="size-4" aria-hidden="true" />
            تسجيل الخروج
          </button>
        </form>
      </section>
    </main>
  );
}
