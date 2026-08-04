import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260804121500_audit_log_interface.sql",
  "utf8",
);
const page = readFileSync("app/workspace/audit-log/page.tsx", "utf8");
const shell = readFileSync("components/app-shell.tsx", "utf8");

describe("audit log interface", () => {
  it("keeps global audit log access behind audit.read and leadership roles", () => {
    expect(migration).toContain("public.get_audit_log_entries");
    expect(migration).toContain("private.has_permission('audit.read')");
    expect(migration).toContain("private.has_any_role(array['super_admin', 'executive_manager'])");
    expect(migration).toContain("revoke all on function public.get_audit_log_entries");
    expect(migration).toContain("grant execute on function public.get_audit_log_entries");
  });

  it("adds the workspace page and navigation guard for executive/super admin audit readers", () => {
    expect(page).toContain('href="/workspace/audit-log"');
    expect(page).toContain('supabase.rpc("get_audit_log_entries"');
    expect(page).toContain('access.permissions.includes("audit.read")');
    expect(page).toContain('access.roleCodes.includes("super_admin")');
    expect(page).toContain('access.roleCodes.includes("executive_manager")');
    expect(shell).toContain('href="/workspace/audit-log"');
  });
});
