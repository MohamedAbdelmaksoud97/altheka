"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { initialActionState } from "@/app/actions/action-state";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="تسجيل كمقروء"
      className="grid size-9 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand disabled:opacity-60"
    >
      <Check className="size-4" aria-hidden="true" />
      <span className="sr-only">تسجيل كمقروء</span>
    </button>
  );
}

export function NotificationReadForm({
  notificationId,
  projectId,
}: {
  notificationId: string;
  projectId?: string | null;
}) {
  const [state, action] = useActionState(
    markNotificationReadAction,
    initialActionState,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="notification_id" value={notificationId} />
      <input type="hidden" name="project_id" value={projectId ?? ""} />
      <SubmitButton />
      {state.status === "error" ? (
        <span className="text-xs text-red-700">{state.message}</span>
      ) : null}
    </form>
  );
}
