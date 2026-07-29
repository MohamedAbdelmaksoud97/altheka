import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function loadEnvironmentFile(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");

    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvironmentFile(".env.local");
loadEnvironmentFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.INITIAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase();

if (!url || !serviceRoleKey || !email) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and INITIAL_SUPER_ADMIN_EMAIL before running this script.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(targetEmail) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === targetEmail,
    );
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  return null;
}

let user = await findUserByEmail(email);

if (!user) {
  const bootstrapPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD;

  if (!bootstrapPassword) {
    console.error(
      "The configured user does not exist. Register that email through the staff registration page, then rerun this script. Alternatively set a one-time INITIAL_SUPER_ADMIN_PASSWORD to create it securely.",
    );
    process.exit(2);
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: bootstrapPassword,
    email_confirm: true,
    user_metadata: {
      registration_kind: "staff",
      full_name: "مدير النظام",
      bootstrap_nonce: randomBytes(12).toString("hex"),
    },
  });
  if (error) throw error;
  user = data.user;
}

const { data: organization, error: organizationError } = await supabase
  .from("organizations")
  .select("id")
  .eq("slug", "legal-operations")
  .single();
if (organizationError) throw organizationError;

const { data: role, error: roleError } = await supabase
  .from("roles")
  .select("id")
  .eq("organization_id", organization.id)
  .eq("code", "super_admin")
  .single();
if (roleError) throw roleError;

const { error: profileError } = await supabase.from("profiles").upsert(
  {
    id: user.id,
    organization_id: organization.id,
    full_name: user.user_metadata?.full_name || "مدير النظام",
    account_kind: "staff",
    activation_status: "active_staff",
    is_active: true,
    approved_at: new Date().toISOString(),
  },
  { onConflict: "id" },
);
if (profileError) throw profileError;

const { error: assignmentError } = await supabase.from("user_roles").upsert(
  {
    user_id: user.id,
    role_id: role.id,
    assigned_at: new Date().toISOString(),
    revoked_at: null,
    revoked_by: null,
  },
  { onConflict: "user_id,role_id" },
);
if (assignmentError) throw assignmentError;

console.log("Super Admin bootstrap completed successfully.");
