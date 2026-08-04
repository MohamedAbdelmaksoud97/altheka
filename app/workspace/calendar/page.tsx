/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Clock3, Gavel, MapPin, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppointmentForm } from "@/components/operations/forms";
import { getAccessContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type CalendarView = "week" | "month";
type CalendarFilter = "all" | "meetings" | "hearings" | "project" | "request";
type Option = { id: string; name: string };

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getRange(view: CalendarView, rawDate?: string) {
  const anchor = rawDate ? new Date(rawDate) : new Date();
  const safeAnchor = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
  if (view === "month") {
    const start = new Date(safeAnchor.getFullYear(), safeAnchor.getMonth(), 1);
    const end = new Date(safeAnchor.getFullYear(), safeAnchor.getMonth() + 1, 1);
    return { start, end };
  }
  const day = startOfDay(safeAnchor);
  const start = addDays(day, -day.getDay());
  return { start, end: addDays(start, 7) };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDay(value: Date) {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(value);
}

function eventMatchesFilter(event: { kind: string; linkedType: string }, filter: CalendarFilter) {
  if (filter === "all") return true;
  if (filter === "meetings") return event.kind === "appointment";
  if (filter === "hearings") return event.kind === "hearing";
  return event.linkedType === filter;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; filter?: string; date?: string }>;
}) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");

  const params = await searchParams;
  const view: CalendarView = params.view === "month" ? "month" : "week";
  const filter: CalendarFilter = ["meetings", "hearings", "project", "request"].includes(
    params.filter ?? "",
  )
    ? (params.filter as CalendarFilter)
    : "all";
  const { start, end } = getRange(view, params.date);
  const supabase = await createClient();

  const [
    appointmentsResult,
    hearingsResult,
    clientsResult,
    projectsResult,
    requestsResult,
    staffResult,
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        `
        id,title,description,starts_at,ends_at,location,status,client_id,service_request_id,project_id,
        clients(display_name),
        projects(name,project_number),
        service_requests(title,request_number),
        appointment_participants(participant_user_id,participant_role,profiles(full_name))
      `,
      )
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("litigation_hearings")
      .select(
        `
        id,hearing_at,court_reference,status,
        litigation_cases(projects(id,name,project_number,clients(display_name)))
      `,
      )
      .gte("hearing_at", start.toISOString())
      .lt("hearing_at", end.toISOString())
      .order("hearing_at", { ascending: true }),
    supabase.from("clients").select("id,display_name").order("display_name"),
    supabase
      .from("projects")
      .select("id,name,project_number")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(120),
    supabase
      .from("service_requests")
      .select("id,title,request_number")
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .from("profiles")
      .select("id,full_name")
      .eq("account_kind", "staff")
      .eq("activation_status", "active_staff")
      .order("full_name"),
  ]);

  const appointmentEvents = ((appointmentsResult.data ?? []) as any[]).map((item) => {
    const project = relationOne(item.projects);
    const client = relationOne(item.clients);
    const request = relationOne(item.service_requests);
    return {
      id: item.id as string,
      kind: "appointment",
      linkedType: item.project_id ? "project" : item.service_request_id ? "request" : "client",
      title: item.title as string,
      startsAt: item.starts_at as string,
      endsAt: item.ends_at as string,
      location: item.location as string | null,
      status: item.status as string,
      projectName: project?.name,
      projectNumber: project?.project_number,
      requestName: request?.title,
      requestNumber: request?.request_number,
      clientName: client?.display_name,
      participants: ((item.appointment_participants ?? []) as any[])
        .map((participant) => relationOne(participant.profiles)?.full_name)
        .filter(Boolean),
    };
  });

  const hearingEvents = ((hearingsResult.data ?? []) as any[]).map((item) => {
    const litigationCase = relationOne(item.litigation_cases);
    const project = relationOne(litigationCase?.projects);
    const client = relationOne(project?.clients);
    return {
      id: item.id as string,
      kind: "hearing",
      linkedType: "project",
      title: item.court_reference ? `جلسة ${item.court_reference}` : "جلسة تقاضي",
      startsAt: item.hearing_at as string,
      endsAt: item.hearing_at as string,
      location: item.court_reference as string | null,
      status: item.status as string,
      projectName: project?.name,
      projectNumber: project?.project_number,
      requestName: undefined as string | undefined,
      requestNumber: undefined as string | undefined,
      clientName: client?.display_name,
      participants: [] as string[],
    };
  });

  const events = [...appointmentEvents, ...hearingEvents]
    .filter((event) => eventMatchesFilter(event, filter))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const days =
    view === "week"
      ? Array.from({ length: 7 }, (_, index) => addDays(start, index))
      : Array.from({ length: Math.ceil((end.getTime() - start.getTime()) / 86_400_000) }, (_, index) =>
          addDays(start, index),
        );

  const clients: Option[] = ((clientsResult.data ?? []) as any[]).map((client) => ({
    id: client.id,
    name: client.display_name,
  }));
  const projects: Option[] = ((projectsResult.data ?? []) as any[]).map((project) => ({
    id: project.id,
    name: `${project.name}${project.project_number ? ` - ${project.project_number}` : ""}`,
  }));
  const requests: Option[] = ((requestsResult.data ?? []) as any[]).map((request) => ({
    id: request.id,
    name: `${request.title}${request.request_number ? ` - ${request.request_number}` : ""}`,
  }));
  const staff: Option[] = ((staffResult.data ?? []) as any[]).map((member) => ({
    id: member.id,
    name: member.full_name,
  }));

  return (
    <AppShell access={access} eyebrow="جدولة العمل" title="التقويم">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line bg-surface px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {(["week", "month"] as CalendarView[]).map((item) => (
                <Link
                  key={item}
                  href={`/workspace/calendar?view=${item}&filter=${filter}`}
                  className={`rounded-md border px-4 py-2 text-sm font-bold ${
                    view === item
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-white text-muted"
                  }`}
                >
                  {item === "week" ? "أسبوعي" : "شهري"}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["all", "كل المواعيد"],
                ["meetings", "اجتماعات"],
                ["hearings", "جلسات تقاضي"],
                ["project", "مرتبطة بمشروع"],
                ["request", "مرتبطة بطلب"],
              ].map(([key, label]) => (
                <Link
                  key={key}
                  href={`/workspace/calendar?view=${view}&filter=${key}`}
                  className={`rounded-md border px-3 py-2 text-xs font-bold ${
                    filter === key
                      ? "border-brand bg-[#e7f0ec] text-brand"
                      : "border-line bg-white text-muted"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {days.map((day) => {
              const dayEvents = events.filter((event) => {
                const eventDay = startOfDay(new Date(event.startsAt));
                return eventDay.getTime() === startOfDay(day).getTime();
              });
              return (
                <article key={day.toISOString()} className="rounded-md border border-line bg-surface">
                  <div className="flex items-center justify-between border-b border-line px-5 py-3">
                    <h2 className="font-bold">{formatDay(day)}</h2>
                    <span className="text-sm text-muted">{dayEvents.length} موعد</span>
                  </div>
                  <div className="divide-y divide-line">
                    {dayEvents.length ? (
                      dayEvents.map((event) => (
                        <div key={`${event.kind}-${event.id}`} className="grid gap-3 px-5 py-4 md:grid-cols-[2.5rem_1fr_auto] md:items-center">
                          <span className="grid size-10 place-items-center rounded-md bg-[#e5eee9] text-brand">
                            {event.kind === "hearing" ? (
                              <Gavel className="size-5" aria-hidden="true" />
                            ) : (
                              <CalendarDays className="size-5" aria-hidden="true" />
                            )}
                          </span>
                          <div>
                            <p className="font-bold">{event.title}</p>
                            <p className="mt-1 text-sm text-muted">
                              {event.clientName ?? "عميل غير محدد"} ·{" "}
                              {event.projectName ?? event.requestName ?? "ارتباط غير محدد"}
                            </p>
                            {event.participants.length ? (
                              <p className="mt-1 text-xs text-muted">
                                المشاركون: {event.participants.join("، ")}
                              </p>
                            ) : null}
                          </div>
                          <div className="text-sm text-muted">
                            <p className="flex items-center gap-2">
                              <Clock3 className="size-4" aria-hidden="true" />
                              {formatDateTime(event.startsAt)}
                            </p>
                            {event.location ? (
                              <p className="mt-1 flex items-center gap-2">
                                <MapPin className="size-4" aria-hidden="true" />
                                {event.location}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="px-5 py-5 text-sm text-muted">لا توجد أحداث مسجلة.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {access.permissions.includes("appointments.manage") ? (
          <aside className="h-fit rounded-md border border-line bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-bold">إنشاء موعد</h2>
            </div>
            <AppointmentForm
              clients={clients}
              projects={projects}
              requests={requests}
              staff={staff}
            />
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}
