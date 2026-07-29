"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/app/actions/action-state";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.email("أدخل بريدًا إلكترونيًا صحيحًا.");
const passwordSchema = z
  .string()
  .min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف.")
  .regex(/[a-z]/, "أضف حرفًا إنجليزيًا صغيرًا.")
  .regex(/[A-Z]/, "أضف حرفًا إنجليزيًا كبيرًا.")
  .regex(/[0-9]/, "أضف رقمًا واحدًا على الأقل.");

const registrationSchema = z
  .object({
    registrationKind: z.enum(["client", "staff"]),
    fullName: z.string().trim().min(3, "أدخل الاسم الكامل."),
    phone: z.string().trim().min(8, "أدخل رقم تواصل صحيحًا.").max(30),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: z.string(),
    requestedDepartment: z.string().trim().max(120).optional(),
    requestedJobTitle: z.string().trim().max(120).optional(),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: "كلمتا المرور غير متطابقتين.",
    path: ["passwordConfirmation"],
  });

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "أدخل كلمة المرور."),
});

function configurationError(): ActionState {
  return {
    status: "error",
    message: "إعدادات اتصال Supabase العامة لم تكتمل بعد.",
  };
}

export async function registerAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return configurationError();
  }

  const parsed = registrationSchema.safeParse({
    registrationKind: formData.get("registration_kind"),
    fullName: formData.get("full_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("password_confirmation"),
    requestedDepartment: formData.get("requested_department") || undefined,
    requestedJobTitle: formData.get("requested_job_title") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "راجع الحقول المعلّمة ثم حاول مرة أخرى.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const values = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      emailRedirectTo: `${publicEnv.appUrl}/auth/confirm`,
      data: {
        registration_kind: values.registrationKind,
        full_name: values.fullName,
        phone: values.phone,
        requested_department:
          values.registrationKind === "staff" ? values.requestedDepartment : null,
        requested_job_title:
          values.registrationKind === "staff" ? values.requestedJobTitle : null,
      },
    },
  });

  if (error) {
    return {
      status: "error",
      message:
        error.message === "User already registered"
          ? "يوجد حساب مسجل بهذا البريد بالفعل."
          : "تعذر إنشاء الحساب الآن. تحقق من البيانات وحاول مجددًا.",
    };
  }

  if (data.session) {
    redirect("/waiting");
  }

  return {
    status: "success",
    message: "تم إنشاء الحساب. افتح رسالة التأكيد المرسلة إلى بريدك لإكمال الدخول.",
  };
}

export async function loginAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return configurationError();
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "راجع البريد وكلمة المرور.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      status: "error",
      message: "بيانات الدخول غير صحيحة أو لم يتم تأكيد البريد بعد.",
    };
  }

  redirect("/waiting");
}

export async function logoutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
