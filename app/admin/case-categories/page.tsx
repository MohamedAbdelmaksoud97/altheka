import { redirect } from "next/navigation";
import { Tags } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CaseCategoryForm } from "@/components/admin/case-category-form";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export default async function CaseCategoriesPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("case_categories.manage")) {
    redirect("/workspace");
  }

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("litigation_case_categories")
    .select("id, code, name, sort_order, is_active")
    .order("sort_order")
    .order("name");

  return (
    <AppShell
      access={access}
      eyebrow="إدارة النظام"
      title="أنواع القضايا وتخصصات الإشراف"
    >
      <div className="mb-5 flex items-start gap-3">
        <Tags className="mt-1 size-5 text-brand" aria-hidden="true" />
        <p className="max-w-3xl text-sm leading-7 text-muted">
          النوع يحدد نطاق ظهور القضية للمشرفين. تعطيل النوع يمنع اختياره في
          الطلبات الجديدة ولا يمس القضايا السابقة.
        </p>
      </div>

      <section className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-bold">إضافة نوع قضية</h2>
        </div>
        <CaseCategoryForm />
      </section>

      <section className="mt-7 overflow-hidden rounded-md border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-bold">الأنواع الحالية</h2>
        </div>
        {categories?.length ? (
          categories.map((category) => (
            <CaseCategoryForm key={category.id} category={category} />
          ))
        ) : (
          <p className="px-5 py-8 text-sm text-muted">لا توجد أنواع قضايا.</p>
        )}
      </section>
    </AppShell>
  );
}
