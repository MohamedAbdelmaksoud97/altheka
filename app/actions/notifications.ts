"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/actions/action-state";
import { createClient } from "@/lib/supabase/server";

const notificationSchema = z.object({
  notificationId: z.uuid(),
  projectId: z.union([z.uuid(), z.literal("")]).optional(),
});

export async function markNotificationReadAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = notificationSchema.safeParse({
    notificationId: formData.get("notification_id"),
    projectId: formData.get("project_id") || "",
  });
  if (!parsed.success) {
    return { status: "error", message: "الإشعار غير صالح." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data.notificationId)
    .is("read_at", null);
  if (error) {
    return { status: "error", message: "تعذر تحديث حالة الإشعار." };
  }

  revalidatePath("/workspace/notifications");
  if (parsed.data.projectId) {
    revalidatePath(`/workspace/projects/${parsed.data.projectId}`);
  }
  return { status: "success", message: "تم تسجيل الإشعار كمقروء." };
}
