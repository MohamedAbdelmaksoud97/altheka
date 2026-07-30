"use server";

import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/app/actions/action-state";
import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_MAX_BYTES,
} from "@/lib/documents/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z
  .object({
    clientProfileId: z.uuid("اختر حساب العميل."),
    requestType: z.enum(["litigation", "estate", "consultation", "other"]),
    litigationCategoryId: z.union([z.uuid(), z.literal("")]).optional(),
    title: z.string().trim().min(5, "اكتب عنوانًا أوضح للطلب.").max(160),
    summary: z.string().trim().min(10, "أضف ملخصًا لا يقل عن 10 أحرف.").max(3000),
  })
  .superRefine((value, context) => {
    if (value.requestType === "litigation" && !value.litigationCategoryId) {
      context.addIssue({
        code: "custom",
        path: ["litigationCategoryId"],
        message: "اختر نوع القضية.",
      });
    }
  });

const requestIdSchema = z.uuid("معرف الطلب غير صالح.");

function errorState(message: string, fieldErrors?: Record<string, string[]>) {
  return { status: "error" as const, message, fieldErrors };
}

function successState(message: string) {
  return { status: "success" as const, message };
}

function rpcMessage(error: { message: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.message.includes("permission") || error.message.includes("Only")) {
    return "لا تملك الصلاحية اللازمة لتنفيذ هذه الخطوة.";
  }
  return fallback;
}

function refreshRequest(requestId: string) {
  revalidatePath("/client");
  revalidatePath(`/client/requests/${requestId}`);
  revalidatePath("/workspace");
  revalidatePath("/workspace/requests");
  revalidatePath(`/workspace/requests/${requestId}`);
}

export async function createRequestAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = requestSchema.safeParse({
    clientProfileId: formData.get("client_profile_id"),
    requestType: formData.get("request_type"),
    litigationCategoryId:
      formData.get("litigation_case_category_id") || "",
    title: formData.get("title"),
    summary: formData.get("summary"),
  });
  if (!parsed.success) {
    return errorState(
      "راجع بيانات الطلب.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_staff_service_request_v2", {
    p_client_profile_id: parsed.data.clientProfileId,
    p_request_type: parsed.data.requestType,
    p_title: parsed.data.title,
    p_summary: parsed.data.summary,
    p_litigation_case_category_id:
      parsed.data.requestType === "litigation"
        ? parsed.data.litigationCategoryId || null
        : null,
  });

  if (error || !data) {
    return errorState(
      rpcMessage(error, "تعذر إنشاء الطلب وربطه بحساب العميل."),
    );
  }

  revalidatePath("/workspace/requests");
  redirect(`/workspace/requests/${data}`);
}

export async function updateRequestCategoryAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      categoryId: z.uuid("اختر نوع القضية."),
      reason: z.string().trim().min(5).max(500),
    })
    .safeParse({
      requestId: formData.get("request_id"),
      categoryId: formData.get("litigation_case_category_id"),
      reason: formData.get("reason"),
    });
  if (!parsed.success) {
    return errorState("اختر نوع القضية واكتب سببًا واضحًا للتصنيف أو التعديل.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_litigation_case_category", {
    p_request_id: parsed.data.requestId,
    p_category_id: parsed.data.categoryId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return errorState(
      rpcMessage(error, "تعذر تحديث نوع القضية. تحقق من الصلاحية وحالة الطلب."),
    );
  }

  refreshRequest(parsed.data.requestId);
  return successState("تم تحديث نوع القضية وتسجيل سبب التعديل.");
}

export async function linkClientRequestAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = requestIdSchema.safeParse(formData.get("request_id"));
  if (!parsed.success) return errorState("الطلب غير صالح.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("link_client_request", {
    p_request_id: parsed.data,
  });
  if (error) return errorState(rpcMessage(error, "تعذر ربط العميل بالطلب."));

  refreshRequest(parsed.data);
  return successState("تم ربط الحساب بملف العميل وأصبح الطلب جاهزًا للتكليف.");
}

export async function assignRequestAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      executorId: z.uuid("اختر المكلف."),
      approverId: z.uuid("اختر المعتمد."),
    })
    .safeParse({
      requestId: formData.get("request_id"),
      executorId: formData.get("executor_id"),
      approverId: formData.get("approver_id"),
    });
  if (!parsed.success) {
    return errorState("اختر المكلف والمعتمد.", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_pre_contract_request", {
    p_request_id: parsed.data.requestId,
    p_executor_id: parsed.data.executorId,
    p_approver_id: parsed.data.approverId,
  });
  if (error) return errorState(rpcMessage(error, "تعذر حفظ التكليف."));

  refreshRequest(parsed.data.requestId);
  return successState("تم تعيين المكلف والمعتمد.");
}

export async function submitStudyAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      summary: z.string().trim().min(10).max(5000),
      legalOpinion: z.string().trim().min(10).max(10000),
      recommendedPath: z.enum([
        "litigation",
        "estate",
        "consultation",
        "decline",
      ]),
    })
    .safeParse({
      requestId: formData.get("request_id"),
      summary: formData.get("summary"),
      legalOpinion: formData.get("legal_opinion"),
      recommendedPath: formData.get("recommended_path"),
    });
  if (!parsed.success) {
    return errorState("أكمل ملخص الدراسة والرأي القانوني والمسار المقترح.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_legal_study", {
    p_request_id: parsed.data.requestId,
    p_summary: parsed.data.summary,
    p_legal_opinion: parsed.data.legalOpinion,
    p_recommended_path: parsed.data.recommendedPath,
  });
  if (error) return errorState(rpcMessage(error, "تعذر إرسال الدراسة للاعتماد."));

  refreshRequest(parsed.data.requestId);
  return successState("أرسلت الدراسة إلى المعتمد.");
}

export async function reviewStudyAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      studyId: z.uuid(),
      decision: z.enum(["approve", "return"]),
      notes: z.string().trim().max(2000).optional(),
    })
    .safeParse({
      requestId: formData.get("request_id"),
      studyId: formData.get("study_id"),
      decision: formData.get("decision"),
      notes: formData.get("notes") || undefined,
    });
  if (!parsed.success) return errorState("تعذر قراءة قرار الاعتماد.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_legal_study", {
    p_study_id: parsed.data.studyId,
    p_decision: parsed.data.decision,
    p_notes: parsed.data.notes ?? null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر اعتماد الدراسة."));

  refreshRequest(parsed.data.requestId);
  return successState(
    parsed.data.decision === "approve"
      ? "تم اعتماد الدراسة."
      : "أعيدت الدراسة إلى المكلف.",
  );
}

export async function sendProposalAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      technicalScope: z.string().trim().min(10).max(10000),
      feeAmount: z.coerce.number().min(0),
      currency: z.string().trim().length(3).default("SAR"),
      validUntil: z.string().date().optional().or(z.literal("")),
    })
    .safeParse({
      requestId: formData.get("request_id"),
      technicalScope: formData.get("technical_scope"),
      feeAmount: formData.get("fee_amount"),
      currency: formData.get("currency") || "SAR",
      validUntil: formData.get("valid_until") || "",
    });
  if (!parsed.success) return errorState("أكمل نطاق العرض والأتعاب بشكل صحيح.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_pre_contract_proposal", {
    p_request_id: parsed.data.requestId,
    p_technical_scope: parsed.data.technicalScope,
    p_fee_amount: parsed.data.feeAmount,
    p_currency: parsed.data.currency.toUpperCase(),
    p_valid_until: parsed.data.validUntil || null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر إرسال العرض."));

  refreshRequest(parsed.data.requestId);
  return successState("تم إرسال العرض الفني والمالي للعميل.");
}

export async function respondProposalAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      proposalId: z.uuid(),
      responseType: z.enum([
        "accept",
        "request_discount",
        "negotiate",
        "reject",
      ]),
      requestedAmount: z
        .union([z.coerce.number().min(0), z.literal("")])
        .optional(),
      message: z.string().trim().max(2000).optional(),
    })
    .safeParse({
      requestId: formData.get("request_id"),
      proposalId: formData.get("proposal_id"),
      responseType: formData.get("response_type"),
      requestedAmount: formData.get("requested_amount") || "",
      message: formData.get("message") || undefined,
    });
  if (!parsed.success) return errorState("راجع ردك على العرض.");
  if (
    parsed.data.responseType === "request_discount" &&
    parsed.data.requestedAmount === ""
  ) {
    return errorState("حدد المبلغ المقترح للتخفيض.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_pre_contract_proposal", {
    p_proposal_id: parsed.data.proposalId,
    p_response_type: parsed.data.responseType,
    p_requested_amount:
      parsed.data.requestedAmount === "" ? null : parsed.data.requestedAmount,
    p_message: parsed.data.message ?? null,
  });
  if (error) return errorState(rpcMessage(error, "تعذر تسجيل الرد على العرض."));

  refreshRequest(parsed.data.requestId);
  return successState("تم تسجيل ردك على العرض.");
}

export async function sendContractAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      title: z.string().trim().min(3).max(200),
      contractBody: z.string().trim().min(20).max(30000),
    })
    .safeParse({
      requestId: formData.get("request_id"),
      title: formData.get("title"),
      contractBody: formData.get("contract_body"),
    });
  if (!parsed.success) return errorState("أكمل عنوان العقد ونصه.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_pre_contract_contract", {
    p_request_id: parsed.data.requestId,
    p_title: parsed.data.title,
    p_contract_body: parsed.data.contractBody,
  });
  if (error) return errorState(rpcMessage(error, "تعذر إرسال العقد."));

  refreshRequest(parsed.data.requestId);
  return successState("تم إرسال العقد للعميل لاعتماده.");
}

export async function acceptContractAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      contractVersionId: z.uuid(),
      accepted: z.literal("on"),
    })
    .safeParse({
      requestId: formData.get("request_id"),
      contractVersionId: formData.get("contract_version_id"),
      accepted: formData.get("accepted"),
    });
  if (!parsed.success) return errorState("يجب الإقرار بالموافقة على نسخة العقد.");

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const candidateIp = forwardedFor?.split(",")[0]?.trim() || null;
  const ipAddress =
    candidateIp && z.ipv4().safeParse(candidateIp).success ? candidateIp : null;
  const acceptanceText =
    "أوافق على العقد بنسخته المعروضة وأقر باطلاعي على محتواه واعتماده.";

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_pre_contract_contract", {
    p_contract_version_id: parsed.data.contractVersionId,
    p_acceptance_text: acceptanceText,
    p_ip_address: ipAddress,
    p_user_agent: requestHeaders.get("user-agent"),
  });
  if (error) return errorState(rpcMessage(error, "تعذر اعتماد العقد."));

  refreshRequest(parsed.data.requestId);
  return successState("تم اعتماد العقد وتوثيق الموافقة.");
}

export async function convertToProjectAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = requestIdSchema.safeParse(formData.get("request_id"));
  if (!parsed.success) return errorState("الطلب غير صالح.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("convert_request_to_project", {
    p_request_id: parsed.data,
  });
  if (error) return errorState(rpcMessage(error, "تعذر تحويل الطلب إلى مشروع."));

  refreshRequest(parsed.data);
  return successState("تم إنشاء المشروع وربط فريق العمل والمسار.");
}

export async function uploadRequestDocumentAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      title: z.string().trim().min(3).max(200),
      documentType: z.string().trim().min(2).max(100),
      visibility: z.enum([
        "internal",
        "client_visible",
        "requires_client_action",
      ]),
      publicationStatus: z.enum([
        "draft",
        "awaiting_approval",
        "published",
      ]),
    })
    .safeParse({
      requestId: formData.get("request_id"),
      title: formData.get("title"),
      documentType: formData.get("document_type"),
      visibility: formData.get("visibility") || "internal",
      publicationStatus: formData.get("publication_status") || "draft",
    });
  if (!parsed.success) return errorState("أكمل عنوان المستند ونوعه.");
  if (
    parsed.data.visibility === "internal" &&
    parsed.data.publicationStatus !== "draft"
  ) {
    return errorState("المستند الداخلي يجب أن يبقى مسودة.");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorState("اختر ملفًا للرفع.");
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    return errorState("الحد الأقصى لحجم الملف 25 ميجابايت.");
  }
  if (!DOCUMENT_ALLOWED_MIME_TYPES.has(file.type)) {
    return errorState(
      "نوع الملف غير مدعوم. استخدم PDF أو Word أو Excel أو JPG أو PNG.",
    );
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
  const storagePath = `${user.id}/${parsed.data.requestId}/${randomUUID()}${extension}`;
  const bucket = "legal-documents";

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) return errorState("تعذر رفع الملف إلى التخزين الخاص.");

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { data: documentId, error } = await supabase.rpc(
    "register_request_document",
    {
    p_request_id: parsed.data.requestId,
    p_title: parsed.data.title,
    p_document_type: parsed.data.documentType,
    p_storage_bucket: bucket,
    p_storage_path: storagePath,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_byte_size: file.size,
    p_sha256: sha256,
      p_publish_to_client: false,
    },
  );

  if (error || !documentId) {
    await createAdminClient().storage.from(bucket).remove([storagePath]);
    return errorState(rpcMessage(error, "تم رفع الملف لكن تعذر تسجيله؛ ألغيت عملية الرفع."));
  }

  if (
    parsed.data.visibility !== "internal" ||
    parsed.data.publicationStatus !== "draft"
  ) {
    const { error: publicationError } = await supabase.rpc(
      "set_document_client_publication",
      {
        p_document_id: documentId,
        p_status: parsed.data.publicationStatus,
        p_visibility: parsed.data.visibility,
      },
    );
    if (publicationError) {
      refreshRequest(parsed.data.requestId);
      return errorState(
        "تم رفع المستند كمسودة داخلية، لكن تعذر تطبيق إعدادات النشر.",
      );
    }
  }

  refreshRequest(parsed.data.requestId);
  return successState("تم رفع المستند وحفظ بصمته.");
}

export async function updateDocumentPublicationAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      documentId: z.uuid(),
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
      requestId: formData.get("request_id"),
      documentId: formData.get("document_id"),
      status: formData.get("status"),
      visibility: formData.get("visibility"),
    });

  if (!parsed.success) return errorState("إعدادات رؤية المستند غير صالحة.");
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
    return errorState(
      rpcMessage(error, "تعذر تحديث مستوى رؤية المستند أو حالة نشره."),
    );
  }

  refreshRequest(parsed.data.requestId);
  return successState(
    parsed.data.status === "published"
      ? "تم نشر المستند للعميل."
      : parsed.data.status === "withdrawn"
        ? "تم سحب المستند من بوابة العميل."
        : "تم تحديث حالة المستند.",
  );
}
