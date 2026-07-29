import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "أساس الثقة | منصة العمليات القانونية",
    template: "%s | أساس الثقة",
  },
  description: "منصة موحدة لإدارة الطلبات والمشاريع والإجراءات القانونية.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="h-full">
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
