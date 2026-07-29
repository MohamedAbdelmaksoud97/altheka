import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="مرحبًا بعودتك"
      description="سجّل الدخول للوصول إلى الطلبات والمشاريع والإجراءات المصرح لك بها."
    >
      <AuthForm mode="login" />
    </AuthShell>
  );
}
