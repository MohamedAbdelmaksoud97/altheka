"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, LoaderCircle, LogIn, UserRoundPlus } from "lucide-react";
import {
  initialActionState,
  type ActionState,
} from "@/app/actions/action-state";
import {
  loginAction,
  registerAction,
} from "@/app/actions/auth";

type AuthMode = "login" | "client" | "staff";

function SubmitButton({ mode }: { mode: AuthMode }) {
  const { pending } = useFormStatus();
  const Icon = mode === "login" ? LogIn : UserRoundPlus;

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-5 font-bold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="size-5" aria-hidden="true" />
      )}
      {mode === "login" ? "دخول آمن" : "إنشاء الحساب"}
    </button>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  placeholder,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  error?: string[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        aria-invalid={Boolean(error?.length)}
        className="h-12 w-full rounded-md border border-line bg-white px-3 text-sm transition placeholder:text-[#9ba39f] focus:border-brand focus:outline-none"
      />
      {error?.[0] ? (
        <span className="mt-1.5 block text-xs text-danger">{error[0]}</span>
      ) : null}
    </label>
  );
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useActionState<ActionState, FormData>(
    action,
    initialActionState,
  );
  const isStaff = mode === "staff";

  return (
    <form action={formAction} className="space-y-5">
      {mode !== "login" ? (
        <input
          type="hidden"
          name="registration_kind"
          value={isStaff ? "staff" : "client"}
        />
      ) : null}

      {mode !== "login" ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="الاسم الكامل"
            name="full_name"
            autoComplete="name"
            error={state.fieldErrors?.fullName}
          />
          <Field
            label="رقم التواصل"
            name="phone"
            type="tel"
            autoComplete="tel"
            error={state.fieldErrors?.phone}
          />
        </div>
      ) : null}

      <Field
        label="البريد الإلكتروني"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="name@example.com"
        error={state.fieldErrors?.email}
      />

      {isStaff ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="الإدارة المطلوبة"
            name="requested_department"
            placeholder="مثال: إدارة التقاضي"
            error={state.fieldErrors?.requestedDepartment}
          />
          <Field
            label="المسمى الوظيفي"
            name="requested_job_title"
            placeholder="مثال: أخصائي قانوني"
            error={state.fieldErrors?.requestedJobTitle}
          />
        </div>
      ) : null}

      <Field
        label="كلمة المرور"
        name="password"
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        error={state.fieldErrors?.password}
      />

      {mode !== "login" ? (
        <Field
          label="تأكيد كلمة المرور"
          name="password_confirmation"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.passwordConfirmation}
        />
      ) : null}

      {state.message ? (
        <div
          role="status"
          className={`rounded-md border px-4 py-3 text-sm leading-6 ${
            state.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <SubmitButton mode={mode} />

      <div className="flex items-center justify-between gap-4 border-t border-line pt-5 text-sm">
        {mode === "login" ? (
          <>
            <Link className="font-bold text-brand hover:underline" href="/register/client">
              تسجيل عميل
            </Link>
            <Link className="font-bold text-brand hover:underline" href="/register/staff">
              تسجيل موظف
            </Link>
          </>
        ) : (
          <Link className="flex items-center gap-2 font-bold text-brand hover:underline" href="/login">
            لدي حساب بالفعل
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </form>
  );
}
