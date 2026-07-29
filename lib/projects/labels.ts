export const projectTypeLabels: Record<string, string> = {
  litigation: "تقاضٍ",
  estate: "تصفية تركة",
  estate_asset: "مشروع أصل",
  estate_litigation: "تقاضي تركة",
  estate_financial: "مالية تركة",
  consultation: "استشارة",
  other: "مشروع قانوني",
};

export const projectStatusLabels: Record<string, string> = {
  active: "نشط",
  on_hold: "متوقف مؤقتًا",
  completed: "مكتمل",
  archived: "مؤرشف",
};

export const workflowActionStatusLabels: Record<string, string> = {
  awaiting_assignment: "بانتظار التكليف",
  blocked: "بانتظار إجراء سابق",
  ready: "جاهز للبدء",
  in_progress: "قيد التنفيذ",
  submitted: "مقدم للمراجعة",
  awaiting_approval: "بانتظار الاعتماد",
  returned: "معاد",
  returned_for_revision: "معاد للتعديل",
  approved: "معتمد",
  completed: "مكتمل",
  cancelled: "ملغي",
};

export const hearingStatusLabels: Record<string, string> = {
  scheduled: "مجدولة",
  held: "انعقدت",
  adjourned: "مؤجلة",
  cancelled: "ملغاة",
};

export const estatePartyTypeLabels: Record<string, string> = {
  heir: "وارث",
  representative: "ممثل",
  beneficiary: "مستفيد",
  guardian: "ولي أو وصي",
  creditor: "دائن",
  other: "صاحب علاقة",
};

export const estateAssetTypeLabels: Record<string, string> = {
  real_estate: "عقار",
  vehicle: "مركبة",
  bank_account: "حساب بنكي",
  investment_portfolio: "محفظة استثمارية",
  commercial_register: "سجل تجاري",
  movable: "منقول",
  cash: "نقد",
  debt: "دين",
  litigation: "قضية",
};

export const estateStageLabels: Record<string, string> = {
  inventory: "الحصر والاستعلام",
  preparation: "التهيئة",
  guardianship: "الحراسة",
  litigation: "التقاضي",
  liquidation: "التصفية",
  marketing: "التسويق",
  completed: "مكتمل",
};

export function labelFor(
  labels: Record<string, string>,
  value: string | null | undefined,
) {
  if (!value) return "غير محدد";
  return labels[value] ?? value;
}

export function projectStatusTone(status: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "completed") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "on_hold") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-line bg-[#f3f5f4] text-muted";
}

export function actionStatusTone(status: string) {
  if (["completed", "approved"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (["in_progress", "submitted", "awaiting_approval"].includes(status)) {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (["returned", "returned_for_revision"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (status === "ready") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-line bg-[#f3f5f4] text-muted";
}
