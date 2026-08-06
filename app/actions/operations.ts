"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/actions/action-state";
import { toSaudiIsoDateTime } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

const uuidOrEmpty = z.union([z.uuid(), z.literal("")]).optional();
const dateTimeLocalOrEmpty = z.union([
  z.string().trim().min(1),
  z.literal(""),
]).optional();

function errorState(message: string) {
  return { status: "error" as const, message };
}

function successState(message: string) {
  return { status: "success" as const, message };
}

function rpcMessage(error: { message: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.message.includes("permission") || error.message.includes("cannot")) {
    return "لا تملك الصلاحية اللازمة لتنفيذ هذه العملية.";
  }
  return fallback;
}

function refreshOperations(projectId?: string | null, requestId?: string | null) {
  revalidatePath("/workspace");
  revalidatePath("/workspace/projects");
  revalidatePath("/workspace/requests");
  revalidatePath("/workspace/tasks");
  revalidatePath("/workspace/extensions");
  revalidatePath("/workspace/clients");
  revalidatePath("/workspace/calendar");
  revalidatePath("/workspace/powers-of-attorney");
  revalidatePath("/workspace/reports");
  revalidatePath("/workspace/notifications");
  if (projectId) revalidatePath(`/workspace/projects/${projectId}`);
  if (requestId) revalidatePath(`/workspace/requests/${requestId}`);
}

export async function createClientApprovalRequestAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    clientId: z.uuid(), requestId: uuidOrEmpty, projectId: uuidOrEmpty,
    documentId: uuidOrEmpty, title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(3000).optional(), dueAt: dateTimeLocalOrEmpty,
  }).safeParse({
    clientId: formData.get("client_id"), requestId: formData.get("service_request_id") || "",
    projectId: formData.get("project_id") || "", documentId: formData.get("document_id") || "",
    title: formData.get("title"), description: formData.get("description") || undefined,
    dueAt: formData.get("due_at") || "",
  });
  if (!parsed.success) return errorState("راجع بيانات طلب موافقة العميل.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_client_approval_request", {
    p_client_id: parsed.data.clientId,
    p_service_request_id: parsed.data.requestId || null,
    p_project_id: parsed.data.projectId || null,
    p_document_id: parsed.data.documentId || null,
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? null,
    p_due_at: toIsoDateTime(parsed.data.dueAt),
  });
  if (error) return errorState(rpcMessage(error, "تعذر إنشاء طلب موافقة العميل."));
  refreshOperations(parsed.data.projectId || null, parsed.data.requestId || null);
  revalidatePath(`/workspace/clients/${parsed.data.clientId}`);
  revalidatePath("/client");
  return successState("تم إنشاء طلب الموافقة وإتاحته للعميل.");
}

export async function respondClientApprovalRequestAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    approvalRequestId: z.uuid(), decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().max(3000).optional(),
  }).safeParse({
    approvalRequestId: formData.get("approval_request_id"), decision: formData.get("decision"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return errorState("راجع رد الموافقة قبل الإرسال.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_client_approval_request", {
    p_approval_request_id: parsed.data.approvalRequestId,
    p_decision: parsed.data.decision,
    p_notes: parsed.data.notes ?? null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر حفظ رد الموافقة."));
  revalidatePath("/client");
  return successState("تم حفظ ردك على طلب الموافقة.");
}

export async function upsertLegalConsultationResponseAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    requestId: z.uuid(), body: z.string().trim().max(20000).optional(),
    documentId: uuidOrEmpty, publish: z.coerce.boolean(),
  }).safeParse({
    requestId: formData.get("service_request_id"), body: formData.get("body") || undefined,
    documentId: formData.get("document_id") || "", publish: formData.get("publish") === "true",
  });
  if (!parsed.success || ((parsed.data.body?.length ?? 0) < 10 && !parsed.data.documentId)) {
    return errorState("أدخل الرد القانوني أو اختر مستند الرد.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_legal_consultation_response", {
    p_service_request_id: parsed.data.requestId, p_body: parsed.data.body ?? "",
    p_document_id: parsed.data.documentId || null, p_publish: parsed.data.publish,
  });
  if (error) return errorState(rpcMessage(error, "تعذر حفظ الرد القانوني."));
  refreshOperations(null, parsed.data.requestId);
  revalidatePath("/client");
  return successState(parsed.data.publish ? "تم نشر الرد القانوني للعميل." : "تم حفظ الرد القانوني كمسودة.");
}

export async function requestPreContractExtensionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    requestId: z.uuid(), phase: z.enum(["offer", "client_response", "contract"]),
    requestedDueAt: z.string().trim().min(1), reason: z.string().trim().min(5).max(3000),
  }).safeParse({
    requestId: formData.get("service_request_id"), phase: formData.get("phase"),
    requestedDueAt: formData.get("requested_due_at"), reason: formData.get("reason"),
  });
  const requestedDueAt = parsed.success ? toIsoDateTime(parsed.data.requestedDueAt) : null;
  if (!parsed.success || !requestedDueAt) return errorState("راجع مدة التمديد والسبب.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_pre_contract_extension", {
    p_service_request_id: parsed.data.requestId, p_phase: parsed.data.phase,
    p_requested_due_at: requestedDueAt, p_reason: parsed.data.reason,
  });
  if (error) return errorState(rpcMessage(error, "تعذر إرسال طلب التمديد."));
  refreshOperations(null, parsed.data.requestId);
  return successState("تم إرسال طلب التمديد إلى مدير الإدارة.");
}

export async function reviewPreContractExtensionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    extensionId: z.uuid(), decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().max(3000).optional(), requestId: z.uuid(),
  }).safeParse({
    extensionId: formData.get("extension_id"), decision: formData.get("decision"),
    notes: formData.get("notes") || undefined, requestId: formData.get("service_request_id"),
  });
  if (!parsed.success) return errorState("راجع قرار طلب التمديد.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_pre_contract_extension", {
    p_extension_id: parsed.data.extensionId, p_decision: parsed.data.decision,
    p_notes: parsed.data.notes ?? null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر حفظ قرار طلب التمديد."));
  refreshOperations(null, parsed.data.requestId);
  return successState(parsed.data.decision === "approved" ? "تم اعتماد التمديد وتحديث الموعد." : "تم رفض طلب التمديد.");
}

export async function reviewPreContractAttentionNoticeAction(_previousState:ActionState,formData:FormData):Promise<ActionState>{
  const parsed=z.object({requestId:z.uuid(),noticeId:z.uuid(),decision:z.enum(["active","rejected"]),reason:z.string().trim().max(3000).optional()}).safeParse({requestId:formData.get("service_request_id"),noticeId:formData.get("notice_id"),decision:formData.get("decision"),reason:formData.get("reason")||undefined});
  if(!parsed.success||(parsed.data.decision==="rejected"&&(parsed.data.reason?.length??0)<3))return errorState("أضف سبب رفض لفت النظر."); const supabase=await createClient(); const {error}=await supabase.rpc("review_pre_contract_attention_notice",{p_notice_id:parsed.data.noticeId,p_decision:parsed.data.decision,p_reason:parsed.data.reason??null}); if(error)return errorState(rpcMessage(error,"تعذر حفظ قرار لفت النظر.")); refreshOperations(null,parsed.data.requestId); return successState(parsed.data.decision==="active"?"تم اعتماد لفت النظر.":"تم رفض لفت النظر مع حفظ السبب.");
}

export async function reviewProjectAttentionNoticeAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    noticeId: z.uuid(), decision: z.enum(["active", "rejected"]),
    reason: z.string().trim().max(3000).optional(), projectId: z.uuid(),
  }).safeParse({
    noticeId: formData.get("notice_id"), decision: formData.get("decision"),
    reason: formData.get("reason") || undefined, projectId: formData.get("project_id"),
  });
  if (!parsed.success || (parsed.data.decision === "rejected" && (parsed.data.reason?.length ?? 0) < 3)) {
    return errorState("أضف سببًا واضحًا عند رفض لفت النظر.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_project_attention_notice", {
    p_notice_id: parsed.data.noticeId, p_decision: parsed.data.decision,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر حفظ قرار لفت النظر."));
  refreshOperations(parsed.data.projectId, null);
  return successState(parsed.data.decision === "active" ? "تم اعتماد لفت النظر." : "تم رفض لفت النظر مع حفظ السبب.");
}

export async function setProjectHealthAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    projectId: z.uuid(), healthStatus: z.enum(["green", "yellow"]),
    reason: z.string().trim().max(1000).optional(),
  }).safeParse({
    projectId: formData.get("project_id"), healthStatus: formData.get("health_status"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success || (parsed.data.healthStatus === "yellow" && (parsed.data.reason?.length ?? 0) < 5)) {
    return errorState("اكتب سبب التوقف الخارجي عند اختيار النطاق الأصفر.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_project_health", {
    p_project_id: parsed.data.projectId, p_health_status: parsed.data.healthStatus,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر تحديث حالة المشروع."));
  refreshOperations(parsed.data.projectId, null);
  return successState(parsed.data.healthStatus === "yellow" ? "تم إيقاف احتساب التأخير بسبب خارجي." : "أعيد المشروع إلى النطاق الأخضر.");
}

export async function createProjectTaskThreadAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ projectId:z.uuid(), title:z.string().trim().min(3).max(200), stepTitle:z.string().trim().min(3).max(300), assignedTo:z.uuid(), dueAt:z.string().trim().min(1) }).safeParse({ projectId:formData.get("project_id"), title:formData.get("thread_title"), stepTitle:formData.get("step_title"), assignedTo:formData.get("assigned_to"), dueAt:formData.get("due_at") });
  const dueAt=parsed.success?toIsoDateTime(parsed.data.dueAt):null;
  if(!parsed.success||!dueAt)return errorState("راجع عنوان المهمة والمكلف وموعد الانتهاء.");
  const supabase=await createClient(); const {error}=await supabase.rpc("create_project_task_thread",{p_project_id:parsed.data.projectId,p_title:parsed.data.title,p_step_title:parsed.data.stepTitle,p_assigned_to:parsed.data.assignedTo,p_due_at:dueAt});
  if(error)return errorState(rpcMessage(error,"تعذر إنشاء صندوق المهمة.")); refreshOperations(parsed.data.projectId,null); return successState("تم إنشاء صندوق المهمة وإشعار المكلف.");
}

export async function submitProjectTaskStepAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed=z.object({projectId:z.uuid(),stepId:z.uuid(),response:z.string().trim().min(3).max(10000),nextTitle:z.string().trim().max(300).optional(),nextDueAt:dateTimeLocalOrEmpty}).safeParse({projectId:formData.get("project_id"),stepId:formData.get("step_id"),response:formData.get("response_text"),nextTitle:formData.get("proposed_next_title")||undefined,nextDueAt:formData.get("proposed_next_due_at")||""});
  if(!parsed.success)return errorState("أدخل رد المهمة بصورة واضحة."); const supabase=await createClient(); const {error}=await supabase.rpc("submit_project_task_step",{p_step_id:parsed.data.stepId,p_response_text:parsed.data.response,p_proposed_next_title:parsed.data.nextTitle??null,p_proposed_next_due_at:toIsoDateTime(parsed.data.nextDueAt)});
  if(error)return errorState(rpcMessage(error,"تعذر إرسال رد المهمة.")); refreshOperations(parsed.data.projectId,null); return successState("تم إرسال الرد للمراجعة.");
}

export async function reviewProjectTaskStepAction(_previousState: ActionState,formData:FormData):Promise<ActionState>{
  const parsed=z.object({projectId:z.uuid(),stepId:z.uuid(),decision:z.enum(["approved","returned"]),notes:z.string().trim().max(3000).optional(),nextTitle:z.string().trim().max(300).optional(),nextDueAt:dateTimeLocalOrEmpty}).safeParse({projectId:formData.get("project_id"),stepId:formData.get("step_id"),decision:formData.get("decision"),notes:formData.get("review_notes")||undefined,nextTitle:formData.get("next_title")||undefined,nextDueAt:formData.get("next_due_at")||""});
  if(!parsed.success||(parsed.data.decision==="returned"&&(parsed.data.notes?.length??0)<3))return errorState("أضف سبب الإعادة أو راجع بيانات المهمة التالية."); const supabase=await createClient(); const {error}=await supabase.rpc("review_project_task_step",{p_step_id:parsed.data.stepId,p_decision:parsed.data.decision,p_review_notes:parsed.data.notes??null,p_next_title:parsed.data.nextTitle??null,p_next_due_at:toIsoDateTime(parsed.data.nextDueAt)});
  if(error)return errorState(rpcMessage(error,"تعذر مراجعة رد المهمة.")); refreshOperations(parsed.data.projectId,null); return successState(parsed.data.decision==="approved"?"تم اعتماد الرد وإنشاء المهمة التالية عند وجودها.":"أعيدت المهمة للمكلف.");
}

export async function closeProjectTaskThreadAction(_previousState:ActionState,formData:FormData):Promise<ActionState>{
  const parsed=z.object({projectId:z.uuid(),threadId:z.uuid()}).safeParse({projectId:formData.get("project_id"),threadId:formData.get("thread_id")}); if(!parsed.success)return errorState("تعذر تحديد صندوق المهمة."); const supabase=await createClient(); const {error}=await supabase.rpc("close_project_task_thread",{p_thread_id:parsed.data.threadId}); if(error)return errorState(rpcMessage(error,"لا يمكن إغلاق الصندوق قبل اكتمال خطواته.")); refreshOperations(parsed.data.projectId,null); return successState("تم إغلاق صندوق المهمة ونقله إلى الأرشيف.");
}

export async function requestProjectTaskStepExtensionAction(_previousState:ActionState,formData:FormData):Promise<ActionState>{const parsed=z.object({projectId:z.uuid(),stepId:z.uuid(),requestedDueAt:z.string().trim().min(1),reason:z.string().trim().min(5).max(3000)}).safeParse({projectId:formData.get("project_id"),stepId:formData.get("step_id"),requestedDueAt:formData.get("requested_due_at"),reason:formData.get("reason")});const due=parsed.success?toIsoDateTime(parsed.data.requestedDueAt):null;if(!parsed.success||!due)return errorState("راجع تاريخ التمديد والسبب.");const supabase=await createClient();const{error}=await supabase.rpc("request_project_task_step_extension",{p_step_id:parsed.data.stepId,p_requested_due_at:due,p_reason:parsed.data.reason});if(error)return errorState(rpcMessage(error,"تعذر إرسال طلب التمديد."));refreshOperations(parsed.data.projectId,null);return successState("تم إرسال طلب التمديد للمراجعة.");}
export async function reviewProjectTaskStepExtensionAction(_previousState:ActionState,formData:FormData):Promise<ActionState>{const parsed=z.object({projectId:z.uuid(),extensionId:z.uuid(),decision:z.enum(["approved","rejected"]),notes:z.string().trim().max(3000).optional()}).safeParse({projectId:formData.get("project_id"),extensionId:formData.get("extension_id"),decision:formData.get("decision"),notes:formData.get("notes")||undefined});if(!parsed.success)return errorState("راجع قرار طلب التمديد.");const supabase=await createClient();const{error}=await supabase.rpc("review_project_task_step_extension",{p_extension_id:parsed.data.extensionId,p_decision:parsed.data.decision,p_notes:parsed.data.notes??null});if(error)return errorState(rpcMessage(error,"تعذر مراجعة طلب التمديد."));refreshOperations(parsed.data.projectId,null);return successState(parsed.data.decision==="approved"?"تم اعتماد التمديد.":"تم رفض التمديد.");}
export async function reviewProjectTaskStepAttentionAction(_previousState:ActionState,formData:FormData):Promise<ActionState>{const parsed=z.object({projectId:z.uuid(),noticeId:z.uuid(),decision:z.enum(["active","rejected"]),reason:z.string().trim().max(3000).optional()}).safeParse({projectId:formData.get("project_id"),noticeId:formData.get("notice_id"),decision:formData.get("decision"),reason:formData.get("reason")||undefined});if(!parsed.success||(parsed.data.decision==="rejected"&&(parsed.data.reason?.length??0)<3))return errorState("أضف سبب رفض لفت النظر.");const supabase=await createClient();const{error}=await supabase.rpc("review_project_task_step_attention_notice",{p_notice_id:parsed.data.noticeId,p_decision:parsed.data.decision,p_reason:parsed.data.reason??null});if(error)return errorState(rpcMessage(error,"تعذر مراجعة لفت النظر."));refreshOperations(parsed.data.projectId,null);return successState(parsed.data.decision==="active"?"تم اعتماد لفت النظر.":"تم رفض لفت النظر.");}

export async function reviewWorkflowActionExtensionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      updateId: z.uuid(),
      decision: z.enum(["approved", "rejected"]),
      reviewNotes: z.string().trim().max(3000).optional(),
      projectId: uuidOrEmpty,
    })
    .safeParse({
      updateId: formData.get("workflow_action_update_id"),
      decision: formData.get("decision"),
      reviewNotes: formData.get("review_notes") || undefined,
      projectId: formData.get("project_id") || "",
    });
  if (
    !parsed.success ||
    (parsed.data.decision === "rejected" &&
      (parsed.data.reviewNotes?.length ?? 0) < 3)
  ) {
    return errorState("أضف ملاحظة واضحة عند رفض طلب التمديد.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_workflow_action_extension", {
    p_update_id: parsed.data.updateId,
    p_decision: parsed.data.decision,
    p_review_notes: parsed.data.reviewNotes ?? null,
  });
  if (error) {
    return errorState(rpcMessage(error, "تعذر حفظ قرار طلب التمديد."));
  }

  refreshOperations(parsed.data.projectId || null, null);
  return successState(
    parsed.data.decision === "approved"
      ? "تم اعتماد طلب التمديد وتحديث موعد المهمة."
      : "تم رفض طلب التمديد وإشعار مقدم الطلب.",
  );
}

function toIsoDateTime(value?: string | null) {
  return toSaudiIsoDateTime(value);
}

export async function createWorkspaceConversationAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    title: z.string().trim().min(3).max(160),
    participantIds: z.array(z.uuid()).default([]),
  }).safeParse({
    title: formData.get("title"),
    participantIds: formData.getAll("participant_user_ids").filter((value): value is string => typeof value === "string"),
  });
  if (!parsed.success) return errorState("أدخل عنوان المجموعة واختر المشاركين.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_workspace_conversation", {
    p_title: parsed.data.title,
    p_participant_ids: parsed.data.participantIds,
  });
  if (error) return errorState(rpcMessage(error, "تعذر إنشاء مجموعة العمل."));
  revalidatePath("/workspace/team-chat");
  return successState("تم إنشاء مجموعة العمل وإضافة المشاركين.");
}

export async function sendWorkspaceMessageAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    conversationId: z.uuid(),
    body: z.string().trim().min(1).max(10000),
  }).safeParse({
    conversationId: formData.get("conversation_id"),
    body: formData.get("body"),
  });
  if (!parsed.success) return errorState("اكتب الرسالة قبل الإرسال.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_conversation_message", {
    p_conversation_id: parsed.data.conversationId,
    p_body: parsed.data.body,
    p_reply_to_message_id: null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر إرسال الرسالة."));
  revalidatePath("/workspace/team-chat");
  return successState("تم إرسال الرسالة.");
}

export async function recordWorkflowActionUpdateAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      actionId: z.uuid(),
      updateType: z.enum(["note", "progress", "extension_request"]),
      progressPercent: z
        .union([z.coerce.number().int().min(0).max(100), z.literal("")])
        .optional(),
      notes: z.string().trim().max(3000).optional(),
      requestedDueAt: dateTimeLocalOrEmpty,
      projectId: uuidOrEmpty,
    })
    .safeParse({
      actionId: formData.get("workflow_action_instance_id"),
      updateType: formData.get("update_type"),
      progressPercent: formData.get("progress_percent") || "",
      notes: formData.get("notes") || undefined,
      requestedDueAt: formData.get("requested_due_at") || "",
      projectId: formData.get("project_id") || "",
    });

  if (!parsed.success) return errorState("راجع بيانات تحديث المهمة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_workflow_action_update", {
    p_workflow_action_instance_id: parsed.data.actionId,
    p_update_type: parsed.data.updateType,
    p_progress_percent:
      parsed.data.progressPercent === "" ? null : parsed.data.progressPercent,
    p_notes: parsed.data.notes ?? null,
    p_requested_due_at: toIsoDateTime(parsed.data.requestedDueAt),
  });
  if (error) return errorState(rpcMessage(error, "تعذر حفظ تحديث المهمة."));

  refreshOperations(parsed.data.projectId || null, null);
  return successState("تم حفظ تحديث المهمة.");
}

export async function proposeWorkflowActionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: z.uuid(),
      stageInstanceId: uuidOrEmpty,
      title: z.string().trim().min(3).max(200),
      description: z.string().trim().max(3000).optional(),
      proposedDueAt: dateTimeLocalOrEmpty,
    })
    .safeParse({
      projectId: formData.get("project_id"),
      stageInstanceId: formData.get("workflow_stage_instance_id") || "",
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      proposedDueAt: formData.get("proposed_due_at") || "",
    });

  if (!parsed.success) return errorState("راجع بيانات المهمة المقترحة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("propose_workflow_action", {
    p_project_id: parsed.data.projectId,
    p_workflow_stage_instance_id: parsed.data.stageInstanceId || null,
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? null,
    p_proposed_due_at: toIsoDateTime(parsed.data.proposedDueAt),
  });
  if (error) return errorState(rpcMessage(error, "تعذر اقتراح المهمة."));

  refreshOperations(parsed.data.projectId, null);
  return successState("تم إرسال المهمة المقترحة للاعتماد.");
}

export async function reviewProposedWorkflowActionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      proposedActionId: z.uuid(),
      decision: z.enum(["approved", "rejected"]),
      reviewNotes: z.string().trim().max(2000).optional(),
      projectId: uuidOrEmpty,
    })
    .safeParse({
      proposedActionId: formData.get("proposed_action_id"),
      decision: formData.get("decision"),
      reviewNotes: formData.get("review_notes") || undefined,
      projectId: formData.get("project_id") || "",
    });
  if (!parsed.success) return errorState("راجع قرار اعتماد المهمة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_proposed_workflow_action", {
    p_proposed_action_id: parsed.data.proposedActionId,
    p_decision: parsed.data.decision,
    p_review_notes: parsed.data.reviewNotes ?? null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر اعتماد المهمة المقترحة."));

  refreshOperations(parsed.data.projectId || null, null);
  return successState("تم حفظ قرار المهمة المقترحة.");
}

export async function createAppointmentAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      clientId: uuidOrEmpty,
      requestId: uuidOrEmpty,
      projectId: uuidOrEmpty,
      title: z.string().trim().min(3).max(200),
      description: z.string().trim().max(3000).optional(),
      startsAt: z.string().trim().min(1),
      endsAt: z.string().trim().min(1),
      location: z.string().trim().max(300).optional(),
      participantUserIds: z.array(z.uuid()).default([]),
    })
    .safeParse({
      clientId: formData.get("client_id") || "",
      requestId: formData.get("request_id") || "",
      projectId: formData.get("project_id") || "",
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      startsAt: formData.get("starts_at"),
      endsAt: formData.get("ends_at"),
      location: formData.get("location") || undefined,
      participantUserIds: formData
        .getAll("participant_user_ids")
        .filter((value): value is string => typeof value === "string"),
    });
  if (!parsed.success) return errorState("راجع بيانات الموعد.");
  const startsAt = toIsoDateTime(parsed.data.startsAt);
  const endsAt = toIsoDateTime(parsed.data.endsAt);
  if (!startsAt || !endsAt) return errorState("راجع تاريخ ووقت الموعد.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_appointment", {
    p_client_id: parsed.data.clientId || null,
    p_service_request_id: parsed.data.requestId || null,
    p_project_id: parsed.data.projectId || null,
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? null,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_location: parsed.data.location ?? null,
    p_participant_user_ids: parsed.data.participantUserIds,
  });
  if (error) return errorState(rpcMessage(error, "تعذر إنشاء الموعد."));

  refreshOperations(parsed.data.projectId || null, parsed.data.requestId || null);
  return successState("تم إنشاء الموعد وجدولة التذكيرات.");
}

export async function createPowerOfAttorneyAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      clientId: uuidOrEmpty,
      requestId: uuidOrEmpty,
      projectId: uuidOrEmpty,
      documentId: uuidOrEmpty,
      powerNumber: z.string().trim().min(2).max(120),
      issuedOn: z.union([z.string().date(), z.literal("")]).optional(),
      expiresOn: z.union([z.string().date(), z.literal("")]).optional(),
      notes: z.string().trim().max(3000).optional(),
    })
    .safeParse({
      clientId: formData.get("client_id") || "",
      requestId: formData.get("request_id") || "",
      projectId: formData.get("project_id") || "",
      documentId: formData.get("document_id") || "",
      powerNumber: formData.get("power_number"),
      issuedOn: formData.get("issued_on") || "",
      expiresOn: formData.get("expires_on") || "",
      notes: formData.get("notes") || undefined,
    });
  if (!parsed.success) return errorState("راجع بيانات الوكالة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_power_of_attorney", {
    p_client_id: parsed.data.clientId || null,
    p_service_request_id: parsed.data.requestId || null,
    p_project_id: parsed.data.projectId || null,
    p_document_id: parsed.data.documentId || null,
    p_power_number: parsed.data.powerNumber,
    p_issued_on: parsed.data.issuedOn || null,
    p_expires_on: parsed.data.expiresOn || null,
    p_notes: parsed.data.notes ?? null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر إنشاء الوكالة."));

  refreshOperations(parsed.data.projectId || null, parsed.data.requestId || null);
  return successState("تم حفظ الوكالة وجدولة تنبيه الانتهاء عند وجود تاريخ انتهاء.");
}

export async function createEstatePartyApprovalRequestAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      estateProjectId: z.uuid(),
      estateAssetId: uuidOrEmpty,
      subjectType: z.enum(["general", "asset", "distribution", "settlement"]),
      title: z.string().trim().min(3).max(200),
      description: z.string().trim().max(3000).optional(),
      dueAt: dateTimeLocalOrEmpty,
    })
    .safeParse({
      estateProjectId: formData.get("estate_project_id"),
      estateAssetId: formData.get("estate_asset_id") || "",
      subjectType: formData.get("subject_type") || "general",
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      dueAt: formData.get("due_at") || "",
    });
  if (!parsed.success) return errorState("راجع بيانات طلب موافقة الورثة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_estate_party_approval_request", {
    p_estate_project_id: parsed.data.estateProjectId,
    p_estate_asset_id: parsed.data.estateAssetId || null,
    p_subject_type: parsed.data.subjectType,
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? null,
    p_due_at: toIsoDateTime(parsed.data.dueAt),
  });
  if (error) return errorState(rpcMessage(error, "تعذر إنشاء طلب موافقة الورثة."));

  refreshOperations(parsed.data.estateProjectId, null);
  return successState("تم إنشاء طلب موافقة الورثة.");
}

export async function respondEstatePartyApprovalAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      approvalRequestId: z.uuid(),
      estatePartyId: z.uuid(),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().trim().max(3000).optional(),
      evidenceDocumentId: uuidOrEmpty,
      estateProjectId: uuidOrEmpty,
    })
    .safeParse({
      approvalRequestId: formData.get("approval_request_id"),
      estatePartyId: formData.get("estate_party_id"),
      decision: formData.get("decision"),
      notes: formData.get("notes") || undefined,
      evidenceDocumentId: formData.get("evidence_document_id") || "",
      estateProjectId: formData.get("estate_project_id") || "",
    });
  if (!parsed.success) return errorState("راجع رد موافقة الوريث.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_estate_party_approval", {
    p_approval_request_id: parsed.data.approvalRequestId,
    p_estate_party_id: parsed.data.estatePartyId,
    p_decision: parsed.data.decision,
    p_notes: parsed.data.notes ?? null,
    p_evidence_document_id: parsed.data.evidenceDocumentId || null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر حفظ رد موافقة الوريث."));

  refreshOperations(parsed.data.estateProjectId || null, null);
  revalidatePath("/client");
  return successState("تم حفظ رد موافقة الوريث.");
}
