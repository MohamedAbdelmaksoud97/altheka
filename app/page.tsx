import { redirect } from "next/navigation";
import { ConfigurationRequired } from "@/components/configuration-required";
import { getAccessContext } from "@/lib/auth/access";
import { isSupabaseConfigured } from "@/lib/env";

export default async function Home() {
  if (!isSupabaseConfigured()) {
    return <ConfigurationRequired />;
  }

  const access = await getAccessContext();
  if (!access) redirect("/login");
  redirect("/waiting");
}
