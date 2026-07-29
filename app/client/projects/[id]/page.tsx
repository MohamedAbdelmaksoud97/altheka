import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  Download,
  FileText,
  MessageSquareText,
  UserRoundCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProjectMessageForm } from "@/components/projects/forms";
import { getAccessContext } from "@/lib/auth/access";
import {
  labelFor,
  projectStatusLabels,
  projectStatusTone,
  projectTypeLabels,
} from "@/lib/projects/labels";
import { createClient } from "@/lib/supabase/server";

const dateTime = new Intl.DateTimeFormat("ar-SA", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ClientProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (
    access.accountKind !== "client" ||
    !["client_waiting", "active_client"].includes(access.activationStatus)
  ) {
    redirect("/waiting");
  }

  const supabase = await createClient();
  const { data: projects } = await supabase.rpc("get_my_client_projects", {
    p_project_id: id,
  });
  const project = projects?.[0];
  if (!project) notFound();

  const [{ data: documents }, { data: conversations }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, title, document_type, current_version_number, published_to_client_at, document_versions(id, version_number, file_name, byte_size)",
      )
      .eq("project_id", id)
      .eq("client_visibility_status", "published")
      .order("published_to_client_at", { ascending: false }),
    supabase
      .from("conversations")
      .select("id, title, conversation_type")
      .eq("project_id", id)
      .eq("conversation_type", "client")
      .is("archived_at", null)
      .maybeSingle(),
  ]);

  const { data: messages } = conversations
    ? await supabase
        .from("messages")
        .select("id, sender_id, body, edited_at, created_at")
        .eq("conversation_id", conversations.id)
        .is("deleted_at", null)
        .is("hidden_at", null)
        .order("created_at")
        .limit(50)
    : { data: [] };

  return (
    <AppShell
      access={access}
      eyebrow={labelFor(projectTypeLabels, project.project_type)}
      title={project.name}
    >
      <Link
        href="/client"
        className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-brand"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        ملفي القانوني
      </Link>

      <section className="border-y border-line bg-surface px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-3">
              <BriefcaseBusiness className="size-5 text-brand" aria-hidden="true" />
              <span className="font-mono text-sm font-bold text-brand">
                {project.project_number}
              </span>
            </div>
            <p className="mt-4 text-xs text-muted">المرحلة الحالية</p>
            <h2 className="mt-1 text-xl font-bold">
              {project.client_stage_label ?? "تم بدء المشروع"}
            </h2>
          </div>
          <span
            className={`rounded-md border px-3 py-1.5 text-xs font-bold ${projectStatusTone(project.status)}`}
          >
            {labelFor(projectStatusLabels, project.status)}
          </span>
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
          <UserRoundCheck className="size-5 text-gold" aria-hidden="true" />
          <div>
            <p className="text-xs text-muted">مسؤول التواصل</p>
            <p className="mt-1 text-sm font-bold">
              {project.primary_contact_name ?? "فريق إدارة المشروع"}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]">
        <section className="rounded-md border border-line bg-surface">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <MessageSquareText className="size-5 text-brand" aria-hidden="true" />
            <h2 className="font-bold">محادثة المشروع</h2>
          </div>
          <div className="max-h-[32rem] space-y-3 overflow-y-auto bg-[#fafbfa] p-5">
            {messages?.length ? (
              messages.map((message) => {
                const own = message.sender_id === access.userId;
                return (
                  <article
                    key={message.id}
                    className={`max-w-[88%] rounded-md border px-4 py-3 ${
                      own
                        ? "mr-auto border-brand bg-[#eaf2ee]"
                        : "ml-auto border-line bg-white"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-7">
                      {message.body}
                    </p>
                    <p className="mt-2 text-[10px] text-muted">
                      {dateTime.format(new Date(message.created_at))}
                      {message.edited_at ? " · تم التعديل" : ""}
                    </p>
                  </article>
                );
              })
            ) : (
              <p className="py-10 text-center text-sm text-muted">
                تبدأ المحادثة برسالة فريق المشروع.
              </p>
            )}
          </div>
          {conversations ? (
            <div className="border-t border-line p-5">
              <ProjectMessageForm
                projectId={project.id}
                conversationId={conversations.id}
              />
            </div>
          ) : null}
        </section>

        <aside className="rounded-md border border-line bg-surface">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <FileText className="size-5 text-gold" aria-hidden="true" />
            <h2 className="font-bold">المستندات المنشورة</h2>
          </div>
          <div className="divide-y divide-line">
            {documents?.length ? (
              documents.map((document) => {
                const versions = document.document_versions as unknown as {
                  id: string;
                  version_number: number;
                  file_name: string;
                  byte_size: number;
                }[];
                const version = versions.find(
                  (item) => item.version_number === document.current_version_number,
                );
                return (
                  <article key={document.id} className="px-5 py-4">
                    <p className="text-sm font-bold">{document.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {version?.file_name}
                    </p>
                    <a
                      href={`/documents/${document.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-brand"
                    >
                      <Download className="size-4" aria-hidden="true" />
                      تنزيل
                    </a>
                  </article>
                );
              })
            ) : (
              <p className="px-5 py-8 text-sm text-muted">
                لا توجد مستندات منشورة لك في هذه المرحلة.
              </p>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
