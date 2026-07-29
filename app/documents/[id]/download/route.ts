import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const { data: document } = await supabase
    .from("documents")
    .select(
      "id, current_version_number, document_versions(id, version_number, storage_bucket, storage_path)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!document) {
    return NextResponse.json(
      { error: "المستند غير موجود أو غير متاح لك." },
      { status: 404 },
    );
  }

  const versions = document.document_versions as unknown as {
    id: string;
    version_number: number;
    storage_bucket: string;
    storage_path: string;
  }[];
  const currentVersion = versions.find(
    (version) => version.version_number === document.current_version_number,
  );
  if (!currentVersion) {
    return NextResponse.json(
      { error: "لا توجد نسخة حالية قابلة للتنزيل." },
      { status: 404 },
    );
  }

  const { data: signed, error: signedUrlError } = await supabase.storage
    .from(currentVersion.storage_bucket)
    .createSignedUrl(currentVersion.storage_path, 60);
  if (signedUrlError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "تعذر إصدار رابط التنزيل المؤقت." },
      { status: 403 },
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const candidateIp = forwardedFor?.split(",")[0]?.trim() ?? "";
  const ipAddress = isIP(candidateIp) ? candidateIp : null;
  const { error: logError } = await supabase.rpc(
    "record_document_signed_url",
    {
      p_document_id: document.id,
      p_document_version_id: currentVersion.id,
      p_ip_address: ipAddress,
      p_user_agent: request.headers.get("user-agent"),
    },
  );
  if (logError) {
    return NextResponse.json(
      { error: "تعذر تسجيل عملية التنزيل." },
      { status: 403 },
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
