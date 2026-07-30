"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/actions/action-state";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const approvalSchema = z.object({
  requestId: z.uuid(),
  departmentId: z.uuid("اختر الإدارة."),
  jobTitleId: z.uuid("اختر المسمى الوظيفي."),
  roleIds: z.array(z.uuid()).min(1, "اختر دورًا واحدًا على الأقل."),
  specialtyIds: z.array(z.uuid()),
  reviewNotes: z.string().trim().max(500).optional(),
});

const rejectionSchema = z.object({
  requestId: z.uuid(),
  reason: z.string().trim().min(5).max(500),
});

const staffAccessSchema = z.object({
  profileId: z.uuid(),
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional(),
  departmentId: z.uuid("اختر الإدارة."),
  jobTitleId: z.uuid("اختر المسمى الوظيفي."),
  roleIds: z.array(z.uuid()).min(1, "اختر دورًا واحدًا على الأقل."),
  specialtyIds: z.array(z.uuid()),
  reason: z.string().trim().min(5).max(500),
});

const staffStatusSchema = z.object({
  profileId: z.uuid(),
  operation: z.enum(["disable", "reactivate"]),
  reason: z.string().trim().min(5).max(500),
});

function adminError(message: string): ActionState {
  return { status: "error", message };
}

function revalidateStaffPages() {
  revalidatePath("/admin/staff");
  revalidatePath("/admin/case-categories");
  revalidatePath("/workspace");
  revalidatePath("/workspace/supervision");
}

export async function approveStaffAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "إعدادات اتصال Supabase العامة لم تكتمل بعد.",
    };
  }

  const parsed = approvalSchema.safeParse({
    requestId: formData.get("request_id"),
    departmentId: formData.get("department_id"),
    jobTitleId: formData.get("job_title_id"),
    roleIds: formData.getAll("role_ids"),
    specialtyIds: formData.getAll("specialty_ids"),
    reviewNotes: formData.get("review_notes") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "أكمل الإدارة والمسمى ودورًا واحدًا على الأقل.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_staff_registration_v2", {
    p_request_id: parsed.data.requestId,
    p_department_id: parsed.data.departmentId,
    p_job_title_id: parsed.data.jobTitleId,
    p_role_ids: parsed.data.roleIds,
    p_specialty_ids: parsed.data.specialtyIds,
    p_review_notes: parsed.data.reviewNotes ?? null,
  });

  if (error) {
    return {
      status: "error",
      message: "تعذر تفعيل الموظف. تحقق من صلاحيتك وتوافق المسمى مع الإدارة.",
    };
  }

  revalidateStaffPages();

  return {
    status: "success",
    message: "تم تفعيل الموظف وإسناد أدواره بنجاح.",
  };
}

export async function rejectStaffAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = rejectionSchema.safeParse({
    requestId: formData.get("request_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return adminError("اكتب سببًا واضحًا لرفض طلب التسجيل.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_staff_registration", {
    p_request_id: parsed.data.requestId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return adminError("تعذر رفض الطلب. قد تكون حالته تغيرت بالفعل.");
  }

  try {
    const { data: request } = await supabase
      .from("staff_registration_requests")
      .select("profile_id")
      .eq("id", parsed.data.requestId)
      .single();
    if (request?.profile_id) {
      await createAdminClient().auth.admin.updateUserById(request.profile_id, {
        ban_duration: "876000h",
      });
    }
  } catch {
    // The inactive Profile and RLS still prevent operational access.
  }

  revalidateStaffPages();
  return { status: "success", message: "تم رفض الطلب وحفظ السبب في سجل التدقيق." };
}

export async function updateStaffAccessAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = staffAccessSchema.safeParse({
    profileId: formData.get("profile_id"),
    fullName: formData.get("full_name"),
    phone: formData.get("phone") || undefined,
    departmentId: formData.get("department_id"),
    jobTitleId: formData.get("job_title_id"),
    roleIds: formData.getAll("role_ids"),
    specialtyIds: formData.getAll("specialty_ids"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return adminError(
      "أكمل الاسم والإدارة والمسمى ودورًا واحدًا على الأقل وسبب التعديل.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_staff_access_v2", {
    p_profile_id: parsed.data.profileId,
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone ?? "",
    p_department_id: parsed.data.departmentId,
    p_job_title_id: parsed.data.jobTitleId,
    p_role_ids: parsed.data.roleIds,
    p_specialty_ids: parsed.data.specialtyIds,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return adminError(
      "تعذر حفظ التعديل. تحقق من توافق المسمى مع الإدارة ومن حماية الحساب.",
    );
  }

  revalidateStaffPages();
  return { status: "success", message: "تم تحديث بيانات الموظف وأدواره." };
}

export async function manageLitigationCategoryAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      categoryId: z.union([z.uuid(), z.literal("")]).optional(),
      code: z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9_]{1,63}$/),
      name: z.string().trim().min(2).max(120),
      sortOrder: z.coerce.number().int().min(0).max(10000),
      isActive: z.boolean(),
      reason: z.string().trim().min(5).max(500),
    })
    .safeParse({
      categoryId: formData.get("category_id") || "",
      code: formData.get("code"),
      name: formData.get("name"),
      sortOrder: formData.get("sort_order"),
      isActive: formData.get("is_active") === "on",
      reason: formData.get("reason"),
    });
  if (!parsed.success) {
    return adminError("راجع رمز التصنيف واسمه وترتيبه، واكتب سببًا واضحًا للتغيير.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("manage_litigation_case_category", {
    p_category_id: parsed.data.categoryId || null,
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_sort_order: parsed.data.sortOrder,
    p_is_active: parsed.data.isActive,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return adminError("تعذر حفظ نوع القضية. قد يكون الرمز مستخدمًا أو لا تملك الصلاحية.");
  }

  revalidateStaffPages();
  return {
    status: "success",
    message: parsed.data.categoryId
      ? "تم تحديث نوع القضية."
      : "تمت إضافة نوع القضية.",
  };
}

export async function setStaffActivationAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = staffStatusSchema.safeParse({
    profileId: formData.get("profile_id"),
    operation: formData.get("operation"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return adminError("اكتب سببًا واضحًا لتغيير حالة الحساب.");
  }

  const supabase = await createClient();
  const functionName =
    parsed.data.operation === "disable"
      ? "disable_staff_account"
      : "reactivate_staff_account";

  if (parsed.data.operation === "reactivate") {
    try {
      const { error: authError } =
        await createAdminClient().auth.admin.updateUserById(
          parsed.data.profileId,
          { ban_duration: "none" },
        );
      if (authError) {
        return adminError("تعذر رفع حظر تسجيل الدخول من Supabase Auth.");
      }
    } catch {
      return adminError("تعذر الاتصال بخدمة إدارة Supabase Auth.");
    }
  }

  const { error } = await supabase.rpc(functionName, {
    p_profile_id: parsed.data.profileId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    if (parsed.data.operation === "reactivate") {
      try {
        await createAdminClient().auth.admin.updateUserById(
          parsed.data.profileId,
          { ban_duration: "876000h" },
        );
      } catch {
        // The database mutation failed, so the profile remains disabled.
      }
    }
    return adminError(
      parsed.data.operation === "disable"
        ? "تعذر تعطيل الحساب. لا يمكن تعطيل حسابك أو حساب مدير نظام."
        : "تعذر إعادة التفعيل. تأكد من وجود إدارة ومسمى ودور فعال.",
    );
  }

  if (parsed.data.operation === "disable") {
    try {
      await createAdminClient().auth.admin.updateUserById(
        parsed.data.profileId,
        { ban_duration: "876000h" },
      );
    } catch {
      // Profile status and RLS block access even if Auth banning is unavailable.
    }
  }

  revalidateStaffPages();
  return {
    status: "success",
    message:
      parsed.data.operation === "disable"
        ? "تم تعطيل الحساب مع الاحتفاظ بجميع أعماله السابقة."
        : "تمت إعادة تفعيل الحساب.",
  };
}
