"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/actions/action-state";
import { createClient } from "@/lib/supabase/server";

const uuidOrEmpty = z.union([z.uuid(), z.literal("")]).optional();

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
  if (projectId) revalidatePath(`/workspace/projects/${projectId}`);
  if (requestId) revalidatePath(`/workspace/requests/${requestId}`);
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
      requestedDueAt: z.union([z.string().datetime(), z.literal("")]).optional(),
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
    p_requested_due_at: parsed.data.requestedDueAt || null,
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
      proposedDueAt: z.union([z.string().datetime(), z.literal("")]).optional(),
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
    p_proposed_due_at: parsed.data.proposedDueAt || null,
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
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
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

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_appointment", {
    p_client_id: parsed.data.clientId || null,
    p_service_request_id: parsed.data.requestId || null,
    p_project_id: parsed.data.projectId || null,
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? null,
    p_starts_at: parsed.data.startsAt,
    p_ends_at: parsed.data.endsAt,
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
      dueAt: z.union([z.string().datetime(), z.literal("")]).optional(),
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
    p_due_at: parsed.data.dueAt || null,
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
