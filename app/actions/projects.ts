"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/actions/action-state";
import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_MAX_BYTES,
} from "@/lib/documents/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();

function successState(message: string): ActionState {
  return { status: "success", message };
}

function errorState(message: string): ActionState {
  return { status: "error", message };
}

function rpcError(error: { message: string } | null, fallback: string) {
  if (!error) return fallback;
  if (
    error.message.includes("permission") ||
    error.message.includes("cannot") ||
    error.message.includes("accessible")
  ) {
    return "لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.";
  }
  return fallback;
}

function refreshProject(projectId: string) {
  revalidatePath("/workspace");
  revalidatePath("/workspace/projects");
  revalidatePath(`/workspace/projects/${projectId}`);
  revalidatePath("/client");
  revalidatePath(`/client/projects/${projectId}`);
  revalidatePath("/workspace/supervision");
}

function optionalDateTime(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function startProjectWorkflowAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = uuid.safeParse(formData.get("project_id"));
  if (!parsed.success) return errorState("معرف المشروع غير صالح.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_project_operational_workflow", {
    p_project_id: parsed.data,
  });
  if (error) {
    return errorState(rpcError(error, "تعذر تشغيل خارطة سير المشروع."));
  }
  refreshProject(parsed.data);
  return successState("تم تشغيل خارطة السير وإسناد أطراف الإجراءات.");
}

export async function operateWorkflowAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      actionId: uuid,
      nextStatus: z.enum([
        "in_progress",
        "submitted",
        "awaiting_approval",
        "approved",
        "completed",
        "returned_for_revision",
      ]),
      reason: z.string().trim().max(1000).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      actionId: formData.get("action_id"),
      nextStatus: formData.get("next_status"),
      reason: String(formData.get("reason") ?? "") || undefined,
    });
  if (!parsed.success) return errorState("تعذر قراءة انتقال الإجراء.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("operate_workflow_action", {
    p_action_instance_id: parsed.data.actionId,
    p_new_status: parsed.data.nextStatus,
    p_reason: parsed.data.reason ?? null,
    p_is_override: false,
  });
  if (error) return errorState(rpcError(error, "تعذر تحديث حالة الإجراء."));

  refreshProject(parsed.data.projectId);
  return successState("تم تحديث الإجراء وتقدم المرحلة.");
}

export async function activateLitigationWorkflowStageAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      stageCode: z.enum(["appeal", "enforcement", "closing_collection"]),
      reason: z.string().trim().min(5).max(1000),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      stageCode: formData.get("stage_code"),
      reason: formData.get("reason"),
    });
  if (!parsed.success) {
    return errorState("اختر المرحلة التالية وسجل سبب القرار.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "activate_litigation_workflow_stage",
    {
      p_project_id: parsed.data.projectId,
      p_stage_code: parsed.data.stageCode,
      p_reason: parsed.data.reason,
    },
  );
  if (error) {
    return errorState(
      rpcError(error, "تعذر تشغيل المرحلة المختارة. راجع حالة المرحلة الحالية."),
    );
  }

  refreshProject(parsed.data.projectId);
  return successState("تم تشغيل المرحلة المختارة وإنشاء إجراءاتها الحالية.");
}

export async function upsertLitigationCaseAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      caseNumber: z.string().trim().max(100).optional(),
      courtName: z.string().trim().min(2).max(200),
      caseLevel: z.enum([
        "first_instance",
        "appeal",
        "cassation",
        "enforcement",
      ]),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      caseNumber: String(formData.get("case_number") ?? "") || undefined,
      courtName: formData.get("court_name"),
      caseLevel: formData.get("case_level"),
    });
  if (!parsed.success) return errorState("أكمل بيانات القضية والمحكمة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_litigation_case", {
    p_project_id: parsed.data.projectId,
    p_case_number: parsed.data.caseNumber ?? null,
    p_court_name: parsed.data.courtName,
    p_case_level: parsed.data.caseLevel,
  });
  if (error) return errorState(rpcError(error, "تعذر حفظ بطاقة القضية."));

  refreshProject(parsed.data.projectId);
  return successState("تم حفظ بطاقة القضية.");
}

export async function setNextActionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      caseId: uuid,
      title: z.string().trim().min(3).max(240),
      actionType: z.string().trim().min(2).max(80),
      priority: z.enum(["normal", "high", "critical"]),
      assignedTo: z.union([uuid, z.literal("")]).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      caseId: formData.get("case_id"),
      title: formData.get("title"),
      actionType: formData.get("action_type") || "follow_up",
      priority: formData.get("priority") || "normal",
      assignedTo: formData.get("assigned_to") || "",
    });
  const dueAt = optionalDateTime(formData.get("due_at"));
  const legalDueDate = String(formData.get("legal_due_date") ?? "").trim() || null;
  if (!parsed.success || (!dueAt && !legalDueDate)) {
    return errorState("أضف إجراءً قادمًا وتاريخًا فعليًا أو قانونيًا.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_litigation_next_action", {
    p_case_id: parsed.data.caseId,
    p_title: parsed.data.title,
    p_action_type: parsed.data.actionType,
    p_due_at: dueAt,
    p_legal_due_date: legalDueDate,
    p_priority: parsed.data.priority,
    p_assigned_to: parsed.data.assignedTo || null,
  });
  if (error) return errorState(rpcError(error, "تعذر تسجيل الإجراء القادم."));

  refreshProject(parsed.data.projectId);
  return successState("تم تثبيت الإجراء القادم وتاريخه.");
}

export async function startLitigationActionExecutionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      actionId: uuid,
    })
    .safeParse({
      projectId: formData.get("project_id"),
      actionId: formData.get("action_id"),
    });
  if (!parsed.success) return errorState("معرف الإجراء غير صالح.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_litigation_case_action_v2", {
    p_action_id: parsed.data.actionId,
  });
  if (error) {
    return errorState(
      rpcError(error, "تعذر بدء الإجراء. تأكد أنه مسند إليك وما زال الإجراء الحالي."),
    );
  }

  refreshProject(parsed.data.projectId);
  return successState("بدأ تنفيذ الإجراء وسجل وقت البدء.");
}

export async function assignProjectAssistantAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      userId: uuid,
    })
    .safeParse({
      projectId: formData.get("project_id"),
      userId: formData.get("user_id"),
    });
  if (!parsed.success) return errorState("اختر مكلفًا مساعدًا صالحًا.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_project_assignee", {
    p_project_id: parsed.data.projectId,
    p_user_id: parsed.data.userId,
  });
  if (error) {
    return errorState(
      rpcError(error, "تعذر إضافة المكلف المساعد. تحقق من أهليته ونطاق الإدارة."),
    );
  }
  refreshProject(parsed.data.projectId);
  return successState("تمت إضافة المكلف المساعد وإسناده إلى الإجراءات المفتوحة.");
}

export async function updateProjectCategoryAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      categoryId: uuid,
      reason: z.string().trim().min(5).max(500),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      categoryId: formData.get("category_id"),
      reason: formData.get("reason"),
    });
  if (!parsed.success) {
    return errorState("اختر نوع القضية واكتب سببًا واضحًا للتصنيف أو التغيير.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "update_litigation_project_category",
    {
      p_project_id: parsed.data.projectId,
      p_category_id: parsed.data.categoryId,
      p_reason: parsed.data.reason,
    },
  );
  if (error) {
    return errorState(
      rpcError(error, "تعذر تحديث تصنيف القضية داخل المشروع."),
    );
  }
  refreshProject(parsed.data.projectId);
  return successState("تم اعتماد تصنيف القضية وإشعار المشرفين المطابقين.");
}

export async function removeProjectAssistantAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      userId: uuid,
      reason: z.string().trim().min(5).max(500),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      userId: formData.get("user_id"),
      reason: formData.get("reason"),
    });
  if (!parsed.success) {
    return errorState("اختر المكلف واكتب سببًا واضحًا لإنهاء التكليف.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_project_assignee", {
    p_project_id: parsed.data.projectId,
    p_user_id: parsed.data.userId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return errorState(rpcError(error, "تعذر إنهاء تكليف المساعد."));
  }
  refreshProject(parsed.data.projectId);
  return successState("انتهى تكليف المساعد مع الاحتفاظ بسجل أعماله السابق.");
}

export async function issueAttentionNoticeAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      targetUserId: uuid,
      subjectType: z.enum(["workflow", "litigation"]),
      subjectId: uuid,
      reason: z.string().trim().min(5).max(1000),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      targetUserId: formData.get("target_user_id"),
      subjectType: formData.get("subject_type"),
      subjectId: formData.get("subject_id"),
      reason: formData.get("reason"),
    });
  if (!parsed.success) {
    return errorState("اختر المكلف واكتب سببًا واضحًا للفت النظر.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_project_attention_notice", {
    p_project_id: parsed.data.projectId,
    p_target_user_id: parsed.data.targetUserId,
    p_reason: parsed.data.reason,
    p_workflow_action_instance_id:
      parsed.data.subjectType === "workflow" ? parsed.data.subjectId : null,
    p_litigation_action_id:
      parsed.data.subjectType === "litigation" ? parsed.data.subjectId : null,
  });
  if (error) {
    return errorState(
      rpcError(error, "تعذر إصدار لفت النظر. يجب أن يكون الإجراء مفتوحًا والمكلف مسندًا إليه."),
    );
  }
  refreshProject(parsed.data.projectId);
  return successState("تم إصدار لفت النظر وإشعار المكلف والإدارة.");
}

export async function acknowledgeAttentionNoticeAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      noticeId: uuid,
      responseText: z.string().trim().max(2000).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      noticeId: formData.get("notice_id"),
      responseText:
        String(formData.get("response_text") ?? "").trim() || undefined,
    });
  if (!parsed.success) return errorState("تعذر قراءة رد لفت النظر.");

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "acknowledge_project_attention_notice",
    {
      p_notice_id: parsed.data.noticeId,
      p_response_text: parsed.data.responseText ?? null,
    },
  );
  if (error) {
    return errorState(rpcError(error, "تعذر تأكيد الاطلاع على لفت النظر."));
  }
  refreshProject(parsed.data.projectId);
  return successState("تم تأكيد الاطلاع وحفظ الرد.");
}

export async function submitLitigationActionResponseAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      actionId: uuid,
      resultSummary: z.string().trim().min(5).max(5000),
      executionNotes: z.string().trim().max(5000).optional(),
      nextActionTitle: z.string().trim().min(3).max(240),
      nextActionPriority: z.enum(["normal", "high", "critical"]),
      documentTitle: z.string().trim().max(200).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      actionId: formData.get("action_id"),
      resultSummary: formData.get("result_summary"),
      executionNotes:
        String(formData.get("execution_notes") ?? "").trim() || undefined,
      nextActionTitle: formData.get("next_action_title"),
      nextActionPriority: formData.get("next_action_priority") || "high",
      documentTitle:
        String(formData.get("document_title") ?? "").trim() || undefined,
    });
  const nextActionDueAt = optionalDateTime(formData.get("next_action_due_at"));
  const nextActionLegalDueDate =
    String(formData.get("next_action_legal_due_date") ?? "").trim() || null;
  if (!parsed.success || (!nextActionDueAt && !nextActionLegalDueDate)) {
    return errorState("أكمل نتيجة التنفيذ واقترح إجراءً تاليًا مع موعد فعلي أو قانوني.");
  }

  const fileEntry = formData.get("file");
  const file =
    fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  if (file && file.size > DOCUMENT_MAX_BYTES) {
    return errorState("الحد الأقصى لحجم المرفق 25 ميجابايت.");
  }
  if (file && !DOCUMENT_ALLOWED_MIME_TYPES.has(file.type)) {
    return errorState("نوع المرفق غير مدعوم.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorState("انتهت جلسة الدخول.");

  let storagePath: string | null = null;
  let fileBytes: Buffer | null = null;
  const bucket = "legal-documents";
  if (file) {
    fileBytes = Buffer.from(await file.arrayBuffer());
    const extension = file.name.includes(".")
      ? `.${file.name
          .split(".")
          .pop()
          ?.replace(/[^a-zA-Z0-9]/g, "")
          .toLowerCase()}`
      : "";
    storagePath = `${user.id}/projects/${parsed.data.projectId}/litigation-actions/${randomUUID()}${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBytes, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) return errorState("تعذر رفع المرفق إلى التخزين الخاص.");
  }

  const { error } = await supabase.rpc(
    "submit_litigation_action_response_v2",
    {
      p_action_id: parsed.data.actionId,
      p_result_summary: parsed.data.resultSummary,
      p_next_action_title: parsed.data.nextActionTitle,
      p_execution_notes: parsed.data.executionNotes ?? null,
      p_next_action_due_at: nextActionDueAt,
      p_next_action_legal_due_date: nextActionLegalDueDate,
      p_next_action_priority: parsed.data.nextActionPriority,
      p_document_title: file
        ? parsed.data.documentTitle || file.name
        : null,
      p_document_type: file ? "litigation_action_result" : null,
      p_storage_bucket: file ? bucket : null,
      p_storage_path: storagePath,
      p_file_name: file?.name ?? null,
      p_mime_type: file?.type ?? null,
      p_byte_size: file?.size ?? null,
      p_sha256: fileBytes
        ? createHash("sha256").update(fileBytes).digest("hex")
        : null,
    },
  );
  if (error) {
    if (storagePath) {
      await createAdminClient().storage.from(bucket).remove([storagePath]);
    }
    return errorState(
      rpcError(error, "تعذر إرسال نتيجة الإجراء للاعتماد."),
    );
  }

  refreshProject(parsed.data.projectId);
  return successState("أرسلت نتيجة الإجراء إلى مدير إدارة التقاضي للاعتماد.");
}

export async function reviewLitigationActionResponseAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      submissionId: uuid,
      decision: z.enum(["approved", "returned_for_revision"]),
      reviewNotes: z.string().trim().max(3000).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      submissionId: formData.get("submission_id"),
      decision: formData.get("decision"),
      reviewNotes:
        String(formData.get("review_notes") ?? "").trim() || undefined,
    });
  if (
    !parsed.success ||
    (parsed.data.decision === "returned_for_revision" &&
      (parsed.data.reviewNotes?.length ?? 0) < 3)
  ) {
    return errorState("أضف ملاحظات واضحة عند إعادة الإجراء للتعديل.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "review_litigation_action_response",
    {
      p_submission_id: parsed.data.submissionId,
      p_decision: parsed.data.decision,
      p_review_notes: parsed.data.reviewNotes ?? null,
    },
  );
  if (error) {
    return errorState(
      rpcError(error, "تعذر حفظ قرار مراجعة الإجراء."),
    );
  }

  refreshProject(parsed.data.projectId);
  return successState(
    parsed.data.decision === "approved"
      ? "اعتمدت النتيجة وأنشئ الإجراء التالي تلقائيًا."
      : "أعيد الإجراء إلى المكلف مع الملاحظات.",
  );
}

export async function scheduleHearingAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      caseId: uuid,
      courtReference: z.string().trim().max(200).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      caseId: formData.get("case_id"),
      courtReference: String(formData.get("court_reference") ?? "") || undefined,
    });
  const hearingAt = optionalDateTime(formData.get("hearing_at"));
  const notifiedAt = optionalDateTime(formData.get("notified_at"));
  if (!parsed.success || !hearingAt) return errorState("حدد موعد الجلسة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_litigation_hearing", {
    p_case_id: parsed.data.caseId,
    p_hearing_at: hearingAt,
    p_notified_at: notifiedAt,
    p_court_reference: parsed.data.courtReference ?? null,
  });
  if (error) return errorState(rpcError(error, "تعذر تسجيل الجلسة."));

  refreshProject(parsed.data.projectId);
  return successState("تم تسجيل الجلسة وإنشاء مهام التحضير والتقرير تلقائيًا.");
}

export async function recordHearingOutcomeAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      hearingId: uuid,
      status: z.enum(["held", "adjourned", "cancelled"]),
      outcomeSummary: z.string().trim().min(5).max(5000),
      nextActionTitle: z.string().trim().max(240).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      hearingId: formData.get("hearing_id"),
      status: formData.get("status"),
      outcomeSummary: formData.get("outcome_summary"),
      nextActionTitle:
        String(formData.get("next_action_title") ?? "") || undefined,
    });
  if (!parsed.success) return errorState("أكمل نتيجة الجلسة.");

  const nextActionDueAt = optionalDateTime(formData.get("next_action_due_at"));
  const nextLegalDue =
    String(formData.get("next_action_legal_due_date") ?? "").trim() || null;
  const nextHearingAt = optionalDateTime(formData.get("next_hearing_at"));

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "record_litigation_hearing_outcome",
    {
      p_hearing_id: parsed.data.hearingId,
      p_status: parsed.data.status,
      p_outcome_summary: parsed.data.outcomeSummary,
      p_next_action_title: parsed.data.nextActionTitle ?? "",
      p_next_action_due_at: nextActionDueAt,
      p_next_action_legal_due_date: nextLegalDue,
      p_next_hearing_at: nextHearingAt,
    },
  );
  if (error) return errorState(rpcError(error, "تعذر حفظ نتيجة الجلسة."));

  refreshProject(parsed.data.projectId);
  return successState("تم حفظ النتيجة والإجراء التالي دون ترك القضية بلا متابعة.");
}

export async function setCaseActionStatusAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      actionId: uuid,
      status: z.enum(["planned", "in_progress", "completed", "cancelled"]),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      actionId: formData.get("action_id"),
      status: formData.get("status"),
    });
  if (!parsed.success) return errorState("حالة الإجراء غير صالحة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_litigation_action_status", {
    p_action_id: parsed.data.actionId,
    p_status: parsed.data.status,
  });
  if (error) return errorState(rpcError(error, "تعذر تحديث الإجراء."));

  refreshProject(parsed.data.projectId);
  return successState("تم تحديث إجراء القضية.");
}

export async function upsertEstateDetailsAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      deceasedName: z.string().trim().min(3).max(200),
      estateKind: z.enum(["regular_estate", "isnad_estate"]),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      deceasedName: formData.get("deceased_name"),
      estateKind: formData.get("estate_kind"),
    });
  if (!parsed.success) return errorState("أكمل بيانات التركة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_estate_details", {
    p_project_id: parsed.data.projectId,
    p_deceased_name: parsed.data.deceasedName,
    p_estate_kind: parsed.data.estateKind,
    p_documents_completed_at: optionalDateTime(
      formData.get("documents_completed_at"),
    ),
    p_agencies_issued_at: optionalDateTime(formData.get("agencies_issued_at")),
  });
  if (error) return errorState(rpcError(error, "تعذر حفظ بيانات التركة."));

  refreshProject(parsed.data.projectId);
  return successState("تم حفظ بيانات التركة ونقطة بدء المدد.");
}

export async function createEstatePartyAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      partyType: z.enum([
        "heir",
        "representative",
        "beneficiary",
        "guardian",
        "creditor",
        "other",
      ]),
      fullName: z.string().trim().min(3).max(200),
      nationalId: z.string().trim().max(30).optional(),
      phone: z.string().trim().max(30).optional(),
      email: z.union([z.email(), z.literal("")]).optional(),
      isMinor: z.boolean(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      partyType: formData.get("party_type"),
      fullName: formData.get("full_name"),
      nationalId: String(formData.get("national_id") ?? "") || undefined,
      phone: String(formData.get("phone") ?? "") || undefined,
      email: String(formData.get("email") ?? "") || "",
      isMinor: formData.get("is_minor") === "on",
    });
  if (!parsed.success) return errorState("راجع بيانات الوارث أو الطرف.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_estate_party", {
    p_project_id: parsed.data.projectId,
    p_party_type: parsed.data.partyType,
    p_full_name: parsed.data.fullName,
    p_national_id: parsed.data.nationalId ?? null,
    p_phone: parsed.data.phone ?? null,
    p_email: parsed.data.email || null,
    p_is_minor: parsed.data.isMinor,
  });
  if (error) return errorState(rpcError(error, "تعذر إضافة الطرف."));

  refreshProject(parsed.data.projectId);
  return successState("تمت إضافة الطرف إلى ملف التركة.");
}

export async function recordEstateShareAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      partyId: uuid,
      numerator: z.coerce.number().min(0),
      denominator: z.coerce.number().positive(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      partyId: formData.get("party_id"),
      numerator: formData.get("numerator"),
      denominator: formData.get("denominator"),
    });
  if (!parsed.success) return errorState("قيم النصيب غير صالحة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_estate_party_share", {
    p_party_id: parsed.data.partyId,
    p_numerator: parsed.data.numerator,
    p_denominator: parsed.data.denominator,
    p_percentage: null,
  });
  if (error) return errorState(rpcError(error, "تعذر تسجيل النصيب."));

  refreshProject(parsed.data.projectId);
  return successState("تم حفظ النصيب مع الاحتفاظ بالإصدارات السابقة.");
}

export async function createEstateAssetAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      assetType: z.string().trim().min(2).max(80),
      name: z.string().trim().min(2).max(200),
      description: z.string().trim().max(2000).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      assetType: formData.get("asset_type"),
      name: formData.get("name"),
      description: String(formData.get("description") ?? "") || undefined,
    });
  if (!parsed.success) return errorState("أكمل بيانات الأصل.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_estate_asset_subproject", {
    p_estate_project_id: parsed.data.projectId,
    p_asset_type: parsed.data.assetType,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
  });
  if (error) return errorState(rpcError(error, "تعذر إنشاء مشروع الأصل."));

  refreshProject(parsed.data.projectId);
  return successState("تم إنشاء الأصل ومشروعه الفرعي المستقل.");
}

export async function updateEstateAssetAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      assetId: uuid,
      currentStage: z.enum([
        "inventory",
        "preparation",
        "guardianship",
        "litigation",
        "liquidation",
        "marketing",
        "completed",
      ]),
      status: z.enum([
        "active",
        "under_guardianship",
        "in_litigation",
        "marketed",
        "sold",
        "distributed",
        "closed",
      ]),
      valuation: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
      liquidationStatus: z.string().trim().max(120).optional(),
      marketingStatus: z.string().trim().max(120).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      assetId: formData.get("asset_id"),
      currentStage: formData.get("current_stage"),
      status: formData.get("status"),
      valuation: formData.get("valuation_amount") || "",
      liquidationStatus:
        String(formData.get("liquidation_status") ?? "") || undefined,
      marketingStatus:
        String(formData.get("marketing_status") ?? "") || undefined,
    });
  if (!parsed.success) return errorState("راجع حالة الأصل وتقييمه.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_estate_asset", {
    p_asset_id: parsed.data.assetId,
    p_current_stage: parsed.data.currentStage,
    p_status: parsed.data.status,
    p_valuation_amount:
      parsed.data.valuation === "" ? null : parsed.data.valuation,
    p_liquidation_status: parsed.data.liquidationStatus ?? null,
    p_marketing_status: parsed.data.marketingStatus ?? null,
  });
  if (error) return errorState(rpcError(error, "تعذر تحديث الأصل."));

  refreshProject(parsed.data.projectId);
  return successState("تم تحديث مرحلة الأصل وحالته.");
}

export async function upsertEstateBankAccountAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      partyId: uuid,
      iban: z
        .string()
        .trim()
        .transform((value) => value.replace(/\s+/g, "").toUpperCase())
        .pipe(z.string().min(15).max(34)),
      bankName: z.string().trim().max(120).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      partyId: formData.get("party_id"),
      iban: formData.get("iban"),
      bankName: String(formData.get("bank_name") ?? "") || undefined,
    });
  if (!parsed.success) return errorState("راجع رقم الآيبان واسم البنك.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_estate_party_bank_account", {
    p_estate_party_id: parsed.data.partyId,
    p_iban: parsed.data.iban,
    p_bank_name: parsed.data.bankName ?? null,
    p_certificate_document_id: null,
  });
  if (error) {
    return errorState(rpcError(error, "تعذر حفظ الحساب البنكي للوارث."));
  }

  refreshProject(parsed.data.projectId);
  return successState("تم حفظ الحساب البنكي وبانتظار تحقق مدير التركات.");
}

export async function verifyEstateBankAccountAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      accountId: uuid,
      verified: z.enum(["true", "false"]),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      accountId: formData.get("account_id"),
      verified: formData.get("verified"),
    });
  if (!parsed.success) return errorState("بيانات الحساب البنكي غير صالحة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_estate_party_bank_account", {
    p_account_id: parsed.data.accountId,
    p_verified: parsed.data.verified === "true",
  });
  if (error) return errorState(rpcError(error, "تعذر تحديث تحقق الحساب."));

  refreshProject(parsed.data.projectId);
  return successState(
    parsed.data.verified === "true"
      ? "تم اعتماد الحساب البنكي."
      : "تم إلغاء اعتماد الحساب البنكي.",
  );
}

export async function recordEstateDecisionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      partyId: uuid,
      decisionType: z.enum(["consent", "approval", "release", "objection"]),
      subjectType: z.string().trim().min(2).max(120),
      status: z.enum(["pending", "accepted", "rejected", "withdrawn"]),
      notes: z.string().trim().max(1000).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      partyId: formData.get("party_id"),
      decisionType: formData.get("decision_type"),
      subjectType: formData.get("subject_type"),
      status: formData.get("status"),
      notes: String(formData.get("notes") ?? "") || undefined,
    });
  if (!parsed.success) return errorState("أكمل بيانات الموافقة أو المخالصة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_estate_party_decision", {
    p_estate_party_id: parsed.data.partyId,
    p_decision_type: parsed.data.decisionType,
    p_subject_type: parsed.data.subjectType,
    p_subject_id: null,
    p_status: parsed.data.status,
    p_notes: parsed.data.notes ?? null,
    p_evidence_document_id: null,
  });
  if (error) {
    return errorState(rpcError(error, "تعذر تسجيل موافقة الطرف."));
  }

  refreshProject(parsed.data.projectId);
  return successState("تم تسجيل قرار الطرف وحفظه في سجل التركة.");
}

export async function recordEstateFinancialEntryAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      entryType: z.enum([
        "income",
        "expense",
        "reserve",
        "distribution",
        "transfer",
      ]),
      amount: z.coerce.number().positive(),
      currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
      occurredOn: z.iso.date(),
      description: z.string().trim().min(3).max(1000),
      assetId: z.union([uuid, z.literal("")]).optional(),
      partyId: z.union([uuid, z.literal("")]).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      entryType: formData.get("entry_type"),
      amount: formData.get("amount"),
      currency: formData.get("currency") || "SAR",
      occurredOn: formData.get("occurred_on"),
      description: formData.get("description"),
      assetId: formData.get("asset_id") || "",
      partyId: formData.get("party_id") || "",
    });
  if (!parsed.success) return errorState("راجع بيانات القيد المالي.");
  if (parsed.data.entryType === "distribution" && !parsed.data.partyId) {
    return errorState("اختر الوارث أو المستفيد في قيد التوزيع.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_estate_financial_entry", {
    p_estate_project_id: parsed.data.projectId,
    p_entry_type: parsed.data.entryType,
    p_amount: parsed.data.amount,
    p_currency: parsed.data.currency,
    p_occurred_on: parsed.data.occurredOn,
    p_description: parsed.data.description,
    p_estate_asset_id: parsed.data.assetId || null,
    p_estate_party_id: parsed.data.partyId || null,
    p_evidence_document_id: null,
  });
  if (error) return errorState(rpcError(error, "تعذر تسجيل القيد المالي."));

  refreshProject(parsed.data.projectId);
  return successState("تم إرسال القيد المالي لاعتماد مدير التركات.");
}

export async function reviewEstateFinancialEntryAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      entryId: uuid,
      decision: z.enum(["approved", "rejected"]),
      reviewNotes: z.string().trim().max(1000).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      entryId: formData.get("entry_id"),
      decision: formData.get("decision"),
      reviewNotes: String(formData.get("review_notes") ?? "") || undefined,
    });
  if (!parsed.success) return errorState("تعذر قراءة قرار القيد المالي.");
  if (
    parsed.data.decision === "rejected" &&
    (parsed.data.reviewNotes?.length ?? 0) < 5
  ) {
    return errorState("اكتب سبب رفض القيد المالي.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_estate_financial_entry", {
    p_entry_id: parsed.data.entryId,
    p_decision: parsed.data.decision,
    p_review_notes: parsed.data.reviewNotes ?? null,
  });
  if (error) return errorState(rpcError(error, "تعذر مراجعة القيد المالي."));

  refreshProject(parsed.data.projectId);
  return successState(
    parsed.data.decision === "approved"
      ? "تم اعتماد القيد المالي."
      : "تم رفض القيد المالي مع حفظ السبب.",
  );
}

export async function createEstateReportAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      periodEnd: z.iso.date(),
      humanNotes: z.string().trim().max(5000).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      periodEnd: formData.get("period_end"),
      humanNotes: String(formData.get("human_notes") ?? "") || undefined,
    });
  if (!parsed.success) return errorState("حدد نهاية فترة التقرير.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_estate_periodic_report", {
    p_estate_project_id: parsed.data.projectId,
    p_period_end: parsed.data.periodEnd,
    p_human_notes: parsed.data.humanNotes ?? null,
  });
  if (error) return errorState(rpcError(error, "تعذر إنشاء التقرير الدوري."));

  refreshProject(parsed.data.projectId);
  return successState("تم إنشاء مسودة التقرير من بيانات النظام.");
}

export async function transitionEstateReportAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      reportId: uuid,
      newStatus: z.enum(["submitted", "approved", "published", "withdrawn"]),
      humanNotes: z.string().trim().max(5000).optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      reportId: formData.get("report_id"),
      newStatus: formData.get("new_status"),
      humanNotes: String(formData.get("human_notes") ?? "") || undefined,
    });
  if (!parsed.success) return errorState("تعذر قراءة انتقال التقرير.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_estate_report", {
    p_report_id: parsed.data.reportId,
    p_new_status: parsed.data.newStatus,
    p_human_notes: parsed.data.humanNotes ?? null,
  });
  if (error) return errorState(rpcError(error, "تعذر تحديث التقرير الدوري."));

  refreshProject(parsed.data.projectId);
  const messages = {
    submitted: "تم إرسال التقرير للمراجعة.",
    approved: "تم اعتماد التقرير.",
    published: "تم نشر التقرير للعميل.",
    withdrawn: "تم سحب التقرير من العميل.",
  };
  return successState(messages[parsed.data.newStatus]);
}

export async function assignEstateProjectMemberAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      userId: uuid,
      membershipRole: z.enum([
        "department_manager",
        "project_manager",
        "executor",
        "follower",
        "finance",
        "litigation",
        "observer",
      ]),
      canContactClient: z.boolean(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      userId: formData.get("user_id"),
      membershipRole: formData.get("membership_role"),
      canContactClient: formData.get("can_contact_client") === "on",
    });
  if (!parsed.success) return errorState("اختر الموظف ودوره داخل التركة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_estate_project_member", {
    p_estate_project_id: parsed.data.projectId,
    p_user_id: parsed.data.userId,
    p_membership_role: parsed.data.membershipRole,
    p_can_contact_client: parsed.data.canContactClient,
  });
  if (error) return errorState(rpcError(error, "تعذر إضافة عضو مشروع التركة."));

  refreshProject(parsed.data.projectId);
  return successState("تمت إضافة الموظف إلى مشروع التركة ومشاريع أصولها.");
}

export async function removeEstateProjectMemberAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      userId: uuid,
      reason: z.string().trim().min(5).max(1000),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      userId: formData.get("user_id"),
      reason: formData.get("reason"),
    });
  if (!parsed.success) return errorState("اكتب سبب إنهاء عضوية الموظف.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_estate_project_member", {
    p_estate_project_id: parsed.data.projectId,
    p_user_id: parsed.data.userId,
    p_reason: parsed.data.reason,
  });
  if (error) return errorState(rpcError(error, "تعذر إنهاء عضوية الموظف."));

  refreshProject(parsed.data.projectId);
  return successState("تم إنهاء العضوية مع الاحتفاظ بسجل الأعمال السابق.");
}

export async function createEstateLitigationSubprojectAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      name: z.string().trim().min(3).max(200),
      categoryId: uuid,
      projectManagerId: uuid,
      primaryAssigneeId: uuid,
    })
    .safeParse({
      projectId: formData.get("project_id"),
      name: formData.get("name"),
      categoryId: formData.get("category_id"),
      projectManagerId: formData.get("project_manager_id"),
      primaryAssigneeId: formData.get("primary_assignee_id"),
    });
  if (!parsed.success) return errorState("أكمل بيانات إحالة نزاع التركة.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_estate_litigation_subproject", {
    p_estate_project_id: parsed.data.projectId,
    p_name: parsed.data.name,
    p_category_id: parsed.data.categoryId,
    p_project_manager_id: parsed.data.projectManagerId,
    p_primary_assignee_id: parsed.data.primaryAssigneeId,
  });
  if (error) return errorState(rpcError(error, "تعذر إنشاء مشروع تقاضي التركة."));

  refreshProject(parsed.data.projectId);
  return successState("تمت إحالة النزاع إلى إدارة التقاضي وتشغيل خارطة سيره.");
}

export async function createProjectTeamAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      code: z.string().trim().min(2).max(80),
      name: z.string().trim().min(2).max(160),
      stageInstanceId: z.union([uuid, z.literal("")]).optional(),
      leaderId: z.union([uuid, z.literal("")]).optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      code: formData.get("code"),
      name: formData.get("name"),
      stageInstanceId: formData.get("stage_instance_id") || "",
      leaderId: formData.get("leader_id") || "",
      startsAt: optionalDateTime(formData.get("starts_at")) ?? undefined,
      endsAt: optionalDateTime(formData.get("ends_at")) ?? undefined,
    });
  if (!parsed.success) return errorState("أكمل اسم الفريق ورمزه.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_project_team_v2", {
    p_project_id: parsed.data.projectId,
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_stage_instance_id: parsed.data.stageInstanceId || null,
    p_leader_id: parsed.data.leaderId || null,
    p_starts_at: parsed.data.startsAt || null,
    p_ends_at: parsed.data.endsAt || null,
  });
  if (error) return errorState(rpcError(error, "تعذر إنشاء فريق المشروع."));

  refreshProject(parsed.data.projectId);
  return successState("تم إنشاء فريق المشروع.");
}

export async function assignProjectTeamMemberAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      teamId: uuid,
      userId: uuid,
      teamRole: z.enum(["leader", "member", "observer"]),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      teamId: formData.get("team_id"),
      userId: formData.get("user_id"),
      teamRole: formData.get("team_role"),
    });
  if (!parsed.success) return errorState("اختر عضو الفريق ودوره.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_project_team_member", {
    p_project_team_id: parsed.data.teamId,
    p_user_id: parsed.data.userId,
    p_team_role: parsed.data.teamRole,
  });
  if (error) return errorState(rpcError(error, "تعذر إضافة عضو الفريق."));

  refreshProject(parsed.data.projectId);
  return successState("تم تحديث عضوية الفريق وإسناد إجراءاته المفتوحة.");
}

export async function updateProjectTeamAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      teamId: uuid,
      name: z.string().trim().min(2).max(160),
      status: z.enum(["planned", "active", "completed", "cancelled"]),
      stageInstanceId: z.union([uuid, z.literal("")]).optional(),
      leaderId: z.union([uuid, z.literal("")]).optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      teamId: formData.get("team_id"),
      name: formData.get("name"),
      status: formData.get("status"),
      stageInstanceId: formData.get("stage_instance_id") || "",
      leaderId: formData.get("leader_id") || "",
      startsAt: optionalDateTime(formData.get("starts_at")) ?? undefined,
      endsAt: optionalDateTime(formData.get("ends_at")) ?? undefined,
    });
  if (!parsed.success) return errorState("راجع اسم الفريق وحالته وتواريخه.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_project_team", {
    p_project_team_id: parsed.data.teamId,
    p_name: parsed.data.name,
    p_status: parsed.data.status,
    p_stage_instance_id: parsed.data.stageInstanceId || null,
    p_leader_id: parsed.data.leaderId || null,
    p_starts_at: parsed.data.startsAt || null,
    p_ends_at: parsed.data.endsAt || null,
  });
  if (error) return errorState(rpcError(error, "تعذر تحديث فريق المشروع."));

  refreshProject(parsed.data.projectId);
  return successState("تم تحديث الفريق ومزامنة إسناد Workflow.");
}

export async function removeProjectTeamMemberAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      teamId: uuid,
      userId: uuid,
      reason: z.string().trim().min(5).max(500),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      teamId: formData.get("team_id"),
      userId: formData.get("user_id"),
      reason: formData.get("reason"),
    });
  if (!parsed.success) return errorState("اكتب سبب إزالة العضو بوضوح.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_project_team_member", {
    p_project_team_id: parsed.data.teamId,
    p_user_id: parsed.data.userId,
    p_reason: parsed.data.reason,
  });
  if (error) return errorState(rpcError(error, "تعذر إزالة عضو الفريق."));

  refreshProject(parsed.data.projectId);
  return successState("تم إنهاء عضوية الفريق مع حفظ الأعمال السابقة.");
}

export async function sendProjectMessageAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      conversationId: uuid,
      body: z.string().trim().min(1).max(5000),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      conversationId: formData.get("conversation_id"),
      body: formData.get("body"),
    });
  if (!parsed.success) return errorState("اكتب رسالة قبل الإرسال.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_conversation_message", {
    p_conversation_id: parsed.data.conversationId,
    p_body: parsed.data.body,
    p_reply_to_message_id: null,
  });
  if (error) return errorState(rpcError(error, "تعذر إرسال الرسالة."));

  refreshProject(parsed.data.projectId);
  return successState("تم إرسال الرسالة وحفظها في سجل المشروع.");
}

export async function uploadProjectDocumentAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      title: z.string().trim().min(3).max(200),
      documentType: z.string().trim().min(2).max(100),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      title: formData.get("title"),
      documentType: formData.get("document_type"),
    });
  if (!parsed.success) return errorState("أكمل عنوان المستند ونوعه.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorState("اختر ملفًا للرفع.");
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    return errorState("الحد الأقصى لحجم الملف 25 ميجابايت.");
  }
  if (!DOCUMENT_ALLOWED_MIME_TYPES.has(file.type)) {
    return errorState("نوع الملف غير مدعوم.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorState("انتهت جلسة الدخول.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = file.name.includes(".")
    ? `.${file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`
    : "";
  const storagePath = `${user.id}/projects/${parsed.data.projectId}/${randomUUID()}${extension}`;
  const bucket = "legal-documents";
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return errorState("تعذر رفع الملف إلى التخزين الخاص.");

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.rpc("register_project_document", {
    p_project_id: parsed.data.projectId,
    p_title: parsed.data.title,
    p_document_type: parsed.data.documentType,
    p_storage_bucket: bucket,
    p_storage_path: storagePath,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_byte_size: file.size,
    p_sha256: sha256,
  });
  if (error) {
    await createAdminClient().storage.from(bucket).remove([storagePath]);
    return errorState(rpcError(error, "تعذر تسجيل المستند بعد رفعه."));
  }

  refreshProject(parsed.data.projectId);
  return successState("تم رفع المستند وفهرسته داخل المشروع.");
}

export async function updateProjectDocumentPublicationAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      projectId: uuid,
      documentId: uuid,
      status: z.enum([
        "draft",
        "awaiting_approval",
        "published",
        "withdrawn",
      ]),
      visibility: z.enum([
        "internal",
        "client_visible",
        "requires_client_action",
      ]),
    })
    .safeParse({
      projectId: formData.get("project_id"),
      documentId: formData.get("document_id"),
      status: formData.get("status"),
      visibility: formData.get("visibility"),
    });
  if (!parsed.success) return errorState("إعدادات نشر المستند غير صالحة.");
  if (
    parsed.data.visibility === "internal" &&
    parsed.data.status !== "draft"
  ) {
    return errorState("المستند الداخلي يجب أن يبقى مسودة.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_document_client_publication", {
    p_document_id: parsed.data.documentId,
    p_status: parsed.data.status,
    p_visibility: parsed.data.visibility,
  });
  if (error) {
    return errorState(rpcError(error, "تعذر تحديث نشر المستند."));
  }
  refreshProject(parsed.data.projectId);
  return successState(
    parsed.data.status === "published"
      ? "تم نشر المستند للعميل."
      : parsed.data.status === "withdrawn"
        ? "تم سحب المستند من بوابة العميل."
        : "تم تحديث حالة المستند.",
  );
}
