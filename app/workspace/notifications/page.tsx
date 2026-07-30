import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, BellRing, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { NotificationReadForm } from "@/components/notifications/notification-read-form";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const dateTime = new Intl.DateTimeFormat("ar-SA", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function NotificationsPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const supabase = await createClient();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, notification_type, title, body, data, read_at, created_at")
    .eq("recipient_id", access.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <AppShell access={access} eyebrow="المتابعة" title="الإشعارات">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BellRing className="size-5 text-brand" aria-hidden="true" />
          <h2 className="font-bold">آخر التنبيهات والتكليفات</h2>
        </div>
        <span className="text-sm text-muted">
          {(notifications ?? []).filter((notification) => !notification.read_at)
            .length}{" "}
          غير مقروء
        </span>
      </div>

      {notifications?.length ? (
        <div className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
          {notifications.map((notification) => {
            const data = notification.data as {
              project_id?: string;
              notice_id?: string;
            };
            return (
              <article
                key={notification.id}
                className={`grid gap-4 px-5 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] ${
                  notification.read_at ? "" : "bg-amber-50/40"
                }`}
              >
                <span
                  className={`grid size-10 place-items-center rounded-md ${
                    notification.read_at
                      ? "bg-subtle text-muted"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  <Bell className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-bold">{notification.title}</p>
                  <p className="mt-1 text-sm leading-7 text-muted">
                    {notification.body}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {dateTime.format(new Date(notification.created_at))}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  {data.project_id ? (
                    <Link
                      href={`/workspace/projects/${data.project_id}`}
                      title="فتح المشروع"
                      className="grid size-9 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      <span className="sr-only">فتح المشروع</span>
                    </Link>
                  ) : null}
                  {!notification.read_at ? (
                    <NotificationReadForm
                      notificationId={notification.id}
                      projectId={data.project_id}
                    />
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 border-y border-line bg-surface px-5 py-12 text-center">
          <p className="font-bold">لا توجد إشعارات حتى الآن</p>
        </div>
      )}
    </AppShell>
  );
}
