export type LitigationCategoryOption = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
};

export const defaultLitigationCategoryLabels: Record<string, string> = {
  commercial: "القضايا التجارية",
  labor: "القضايا العمالية",
  medical_malpractice: "قضايا الأخطاء الطبية",
  enforcement: "قضايا التنفيذ",
  personal_status: "قضايا الأحوال الشخصية",
  civil_rights: "القضايا الحقوقية",
  administrative: "القضايا الإدارية",
};
