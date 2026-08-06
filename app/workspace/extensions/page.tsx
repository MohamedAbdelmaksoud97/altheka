/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  PreContractExtensionReviewForm,
  ProjectTaskStepExtensionReviewForm,
  WorkflowExtensionReviewForm,
} from "@/components/operations/forms";
import { getAccessContext } from "@/lib/auth/access";
import { formatSaudiDateTime } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

function one(value: any) { return Array.isArray(value) ? value[0] : value; }

export default async function ExtensionsPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (access.activationStatus !== "active_staff") redirect("/waiting");
  if (!access.permissions.includes("tasks.review_extensions")) redirect("/workspace");

  const supabase = await createClient();
  const [workflowResult, taskResult, requestResult] = await Promise.all([
    supabase.from("workflow_action_updates").select("id,notes,requested_due_at,created_at,workflow_action_instances(id,workflow_action_templates(name),workflow_stage_instances(workflow_instances(project_id,projects(name))))").eq("update_type", "extension_request").eq("status", "pending").order("created_at"),
    supabase.from("project_task_step_extension_requests").select("id,reason,current_due_at,requested_due_at,created_at,project_task_steps(title,project_task_threads(project_id,projects(name)))").eq("status", "pending").order("created_at"),
    supabase.from("pre_contract_extension_requests").select("id,service_request_id,phase,reason,current_due_at,requested_due_at,created_at,service_requests(title)").eq("status", "pending").order("created_at"),
  ]);

  const workflow = (workflowResult.data ?? []) as any[];
  const task = (taskResult.data ?? []) as any[];
  const request = (requestResult.data ?? []) as any[];
  const total = workflow.length + task.length + request.length;

  return <AppShell access={access} eyebrow="المراجعات الإدارية" title="طلبات التمديد">
    <section className="mb-6 flex items-center justify-between border-y border-line bg-surface px-5 py-4">
      <div className="flex items-center gap-3"><Clock3 className="size-5 text-brand" /><p className="font-bold">طلبات بانتظار قرار مدير الإدارة</p></div>
      <span className="text-sm font-bold text-brand">{total} طلب</span>
    </section>
    <div className="space-y-4">
      {workflow.map((item) => { const action = one(item.workflow_action_instances); const stage = one(action?.workflow_stage_instances); const flow = one(stage?.workflow_instances); const project = one(flow?.projects); return <article key={item.id} className="rounded-md border border-line bg-surface p-5"><p className="text-xs font-bold text-brand">خارطة السير</p><h2 className="mt-1 font-bold">{one(action?.workflow_action_templates)?.name ?? "خطوة تشغيلية"}</h2><p className="mt-1 text-sm text-muted">{project?.name ?? "مشروع"} · الموعد المطلوب {formatSaudiDateTime(item.requested_due_at,{dateStyle:"medium",timeStyle:"short"})}</p>{item.notes ? <p className="mt-3 text-sm leading-7">{item.notes}</p> : null}<WorkflowExtensionReviewForm projectId={flow?.project_id} updateId={item.id} /></article>; })}
      {task.map((item) => { const step = one(item.project_task_steps); const thread = one(step?.project_task_threads); const project = one(thread?.projects); return <article key={item.id} className="rounded-md border border-line bg-surface p-5"><p className="text-xs font-bold text-brand">مهمة مشروع</p><h2 className="mt-1 font-bold">{step?.title}</h2><p className="mt-1 text-sm text-muted">{project?.name ?? "مشروع"} · من {formatSaudiDateTime(item.current_due_at,{dateStyle:"medium",timeStyle:"short"})} إلى {formatSaudiDateTime(item.requested_due_at,{dateStyle:"medium",timeStyle:"short"})}</p><p className="mt-3 text-sm leading-7">{item.reason}</p><ProjectTaskStepExtensionReviewForm projectId={thread?.project_id} extensionId={item.id} /></article>; })}
      {request.map((item) => <article key={item.id} className="rounded-md border border-line bg-surface p-5"><p className="text-xs font-bold text-brand">عميل جديد</p><h2 className="mt-1 font-bold">{one(item.service_requests)?.title ?? "طلب عميل"}</h2><p className="mt-1 text-sm text-muted">{item.phase === "offer" ? "العرض الفني والمالي" : item.phase === "contract" ? "العقد" : "انتظار رد العميل"} · حتى {formatSaudiDateTime(item.requested_due_at,{dateStyle:"medium",timeStyle:"short"})}</p><p className="mt-3 text-sm leading-7">{item.reason}</p><PreContractExtensionReviewForm requestId={item.service_request_id} extensionId={item.id} /></article>)}
      {!total ? <p className="rounded-md border border-line bg-surface px-5 py-12 text-center text-sm text-muted">لا توجد طلبات تمديد معلقة.</p> : null}
    </div>
  </AppShell>;
}
