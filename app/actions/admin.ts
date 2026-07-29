"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/actions/action-state";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const approvalSchema = z.object({
  requestId: z.uuid(),
  departmentId: z.uuid("اختر الإدارة."),
  jobTitleId: z.uuid("اختر المسمى الوظيفي."),
  roleIds: z.array(z.uuid()).min(1, "اختر دورًا واحدًا على الأقل."),
  reviewNotes: z.string().trim().max(500).optional(),
});

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
  const { error } = await supabase.rpc("approve_staff_registration", {
    p_request_id: parsed.data.requestId,
    p_department_id: parsed.data.departmentId,
    p_job_title_id: parsed.data.jobTitleId,
    p_role_ids: parsed.data.roleIds,
    p_review_notes: parsed.data.reviewNotes ?? null,
  });

  if (error) {
    return {
      status: "error",
      message: "تعذر تفعيل الموظف. تحقق من صلاحيتك وتوافق المسمى مع الإدارة.",
    };
  }

  revalidatePath("/admin/staff");
  revalidatePath("/workspace");

  return {
    status: "success",
    message: "تم تفعيل الموظف وإسناد أدواره بنجاح.",
  };
}
