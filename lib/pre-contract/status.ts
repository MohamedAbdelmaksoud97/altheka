export const requestTypeLabels: Record<string, string> = {
  litigation: "تقاضٍ",
  estate: "تركات",
  consultation: "استشارة قانونية",
  other: "خدمة قانونية أخرى",
};

export const requestStatusLabels: Record<string, string> = {
  received: "تم استلام الطلب",
  linked: "تم ربط العميل",
  collecting_documents: "جمع المستندات",
  assigned: "تم تعيين المختص",
  study_pending_approval: "الدراسة بانتظار الاعتماد",
  study_returned: "الدراسة معادة للتعديل",
  study_approved: "تم اعتماد الدراسة",
  proposal_sent: "العرض بانتظار رد العميل",
  discount_requested: "طلب تخفيض قيد المراجعة",
  negotiating: "جارٍ التفاوض",
  proposal_accepted: "تم قبول العرض",
  proposal_rejected: "تم رفض العرض",
  contract_sent: "العقد بانتظار اعتماد العميل",
  contract_accepted: "تم اعتماد العقد",
  converted_to_project: "تم التحويل إلى مشروع",
};

export const proposalStatusLabels: Record<string, string> = {
  sent: "بانتظار ردك",
  discount_requested: "تم طلب تخفيض",
  negotiating: "جارٍ التفاوض",
  accepted: "مقبول",
  rejected: "مرفوض",
  superseded: "نسخة سابقة",
  expired: "منتهي",
};

export function labelFor(
  labels: Record<string, string>,
  value: string | null | undefined,
) {
  if (!value) return "غير محدد";
  return labels[value] ?? value;
}

export function requestStatusTone(status: string) {
  if (status === "converted_to_project" || status === "contract_accepted") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "proposal_rejected" || status === "study_returned") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (
    status === "proposal_sent" ||
    status === "contract_sent" ||
    status === "discount_requested" ||
    status === "negotiating"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-line bg-[#eef1ef] text-muted";
}
