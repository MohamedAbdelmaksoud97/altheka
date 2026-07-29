import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "تسجيل عميل",
};

export default function ClientRegistrationPage() {
  return (
    <AuthShell
      title="إنشاء حساب عميل"
      description="أنشئ حسابًا واحدًا لمتابعة طلباتك والمستندات المنشورة لك بعد ربطه بملفك."
    >
      <AuthForm mode="client" />
    </AuthShell>
  );
}
