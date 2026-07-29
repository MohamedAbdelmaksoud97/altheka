import Image from "next/image";
import Link from "next/link";
import { FileCheck2, MessagesSquare, Workflow } from "lucide-react";

const capabilities = [
  { icon: Workflow, label: "إجراءات وأطراف واعتمادات موثقة" },
  { icon: FileCheck2, label: "مستندات خاصة بإصدارات محفوظة" },
  { icon: MessagesSquare, label: "قنوات عميل وداخلية منفصلة" },
];

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(340px,0.8fr)_minmax(520px,1.2fr)]">
      <aside className="relative hidden overflow-hidden bg-[#25302c] px-10 py-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-x-0 top-0 h-1 bg-gold" />
        <Link href="/" className="flex items-center gap-4">
          <Image
            src="/logo.png"
            alt="أساس الثقة"
            width={84}
            height={84}
            className="size-20 rounded-md object-cover shadow-xl"
            priority
          />
          <div>
            <p className="text-lg font-bold">أساس الثقة</p>
            <p className="mt-1 text-sm text-white/65">منصة العمليات القانونية</p>
          </div>
        </Link>
        <div className="my-auto py-14">
          <h2 className="max-w-md text-3xl font-bold leading-[1.55]">
            ملف واحد للعمل القانوني من الطلب حتى الإقفال
          </h2>
          <div className="mt-10 space-y-5">
            {capabilities.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-white/80">
                <span className="grid size-9 place-items-center rounded-md border border-white/15 bg-white/5">
                  <Icon className="size-4 text-[#e4c16f]" aria-hidden="true" />
                </span>
                <span className="text-sm">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/45">بيئة تشغيل خاصة ومحمية</p>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-3 lg:hidden">
            <Image
              src="/logo.png"
              alt="أساس الثقة"
              width={56}
              height={56}
              className="size-14 rounded-md object-cover"
              priority
            />
            <div>
              <p className="font-bold">أساس الثقة</p>
              <p className="text-xs text-muted">منصة العمليات القانونية</p>
            </div>
          </Link>
          <div className="mb-7">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="mt-2 text-sm leading-7 text-muted">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
