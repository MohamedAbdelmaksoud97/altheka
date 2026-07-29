import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AccessContext = {
  userId: string;
  email: string | null;
  fullName: string;
  accountKind: "staff" | "client";
  activationStatus:
    | "pending_staff_approval"
    | "active_staff"
    | "rejected_staff"
    | "client_waiting"
    | "active_client"
    | "disabled";
  roleCodes: string[];
};

export const getAccessContext = cache(async (): Promise<AccessContext | null> => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, account_kind, activation_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles!inner(code)")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  const roleCodes = (roleRows ?? [])
    .map((row) => {
      const related = row.roles as unknown as { code?: string } | { code?: string }[];
      return Array.isArray(related) ? related[0]?.code : related?.code;
    })
    .filter((code): code is string => Boolean(code));

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    accountKind: profile.account_kind,
    activationStatus: profile.activation_status,
    roleCodes,
  } as AccessContext;
});
