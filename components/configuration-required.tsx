import Image from "next/image";
import { Database, KeyRound } from "lucide-react";

export function ConfigurationRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-surface shadow-[0_18px_60px_rgba(24,32,29,0.08)]">
        <div className="flex items-center gap-4 border-b border-line px-6 py-5">
          <Image
            src="/logo.png"
            alt="أساس الثقة"
            width={68}
            height={68}
            className="size-16 rounded-md object-cover"
            priority
          />
          <div>
            <p className="text-sm font-bold text-gold">أساس الثقة</p>
            <h1 className="mt-1 text-xl font-bold">اكتمل اتصال قاعدة البيانات</h1>
          </div>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="rounded-md border border-line p-4">
            <Database className="size-5 text-brand" aria-hidden="true" />
            <h2 className="mt-3 font-bold">Supabase PostgreSQL</h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              طُبقت المهاجرات وRLS والقوالب التجريبية على القاعدة.
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <KeyRound className="size-5 text-amber-700" aria-hidden="true" />
            <h2 className="mt-3 font-bold">مفتاح الواجهة مطلوب</h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              أضف <code>NEXT_PUBLIC_SUPABASE_URL</code> و{" "}
              <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> لتفعيل التسجيل والدخول.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
