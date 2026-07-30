"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Plus, Save } from "lucide-react";
import { manageLitigationCategoryAction } from "@/app/actions/admin";
import { initialActionState } from "@/app/actions/action-state";

type Category = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

const inputClass =
  "h-10 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none";

function SubmitButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  const Icon = isNew ? Plus : Save;
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="size-4" aria-hidden="true" />
      )}
      {isNew ? "إضافة النوع" : "حفظ التعديل"}
    </button>
  );
}

export function CaseCategoryForm({
  category,
}: {
  category?: Category;
}) {
  const [state, action] = useActionState(
    manageLitigationCategoryAction,
    initialActionState,
  );
  const isNew = !category;
  return (
    <form
      action={action}
      className="grid gap-3 border-b border-line px-5 py-4 lg:grid-cols-[12rem_minmax(13rem,1fr)_7rem_8rem_minmax(14rem,1fr)_auto] lg:items-end"
    >
      <input type="hidden" name="category_id" value={category?.id ?? ""} />
      <label>
        <span className="mb-1.5 block text-xs font-bold">الرمز</span>
        <input
          name="code"
          required
          pattern="[a-z][a-z0-9_]{1,63}"
          defaultValue={category?.code ?? ""}
          className={inputClass}
          placeholder="commercial"
        />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-bold">الاسم الظاهر</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={category?.name ?? ""}
          className={inputClass}
          placeholder="القضايا التجارية"
        />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-bold">الترتيب</span>
        <input
          name="sort_order"
          type="number"
          min={0}
          required
          defaultValue={category?.sort_order ?? 100}
          className={inputClass}
        />
      </label>
      <label className="flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm">
        <input
          name="is_active"
          type="checkbox"
          defaultChecked={category?.is_active ?? true}
          className="size-4 accent-[#1f5c4e]"
        />
        نشط
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-bold">سبب التغيير</span>
        <input
          name="reason"
          required
          minLength={5}
          maxLength={500}
          className={inputClass}
          placeholder={isNew ? "إضافة تخصص تشغيلي جديد" : "تحديث إعدادات النوع"}
        />
      </label>
      <SubmitButton isNew={isNew} />
      {state.message ? (
        <p
          role="status"
          className={`text-sm lg:col-span-6 ${
            state.status === "success" ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
