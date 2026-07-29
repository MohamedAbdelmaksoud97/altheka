import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "تسجيل موظف",
};

export default function StaffRegistrationPage() {
  return (
    <AuthShell
      title="طلب حساب موظف"
      description="سيبقى الحساب قيد المراجعة حتى يحدد مدير النظام الإدارة والمسمى والأدوار."
    >
      <AuthForm mode="staff" />
    </AuthShell>
  );
}
