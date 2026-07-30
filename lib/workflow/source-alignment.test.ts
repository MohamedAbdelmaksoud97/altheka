import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_ALLOWED_EXTENSIONS,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_SIGNED_URL_SECONDS,
} from "../documents/config";

const templateMigration = readFileSync(
  "supabase/migrations/20260729121635_workflow_templates_v2_drafts.sql",
  "utf8",
);
const structureMigration = readFileSync(
  "supabase/migrations/20260729120525_safe_alignment_v2.sql",
  "utf8",
);
const estateOperationsMigration = readFileSync(
  "supabase/migrations/20260730133634_complete_estate_operations.sql",
  "utf8",
);
const estateAssetScopeMigration = readFileSync(
  "supabase/migrations/20260730135648_fix_estate_asset_workflow_scope.sql",
  "utf8",
);
const estateLitigationClientMigration = readFileSync(
  "supabase/migrations/20260730171500_fix_estate_litigation_client_order.sql",
  "utf8",
);
const estateAuditMigration = readFileSync(
  "supabase/migrations/20260730173000_complete_estate_audit.sql",
  "utf8",
);
const operationalTeamsMigration = readFileSync(
  "supabase/migrations/20260730180000_operational_project_teams.sql",
  "utf8",
);
const teamScopeMigration = readFileSync(
  "supabase/migrations/20260730182500_backfill_project_team_scope.sql",
  "utf8",
);
const teamEligibilityMigration = readFileSync(
  "supabase/migrations/20260730184500_team_executor_eligibility.sql",
  "utf8",
);
const teamRoleSyncMigration = readFileSync(
  "supabase/migrations/20260730190000_resync_team_member_roles.sql",
  "utf8",
);
const teamWorkScopeMigration = readFileSync(
  "supabase/migrations/20260730191500_team_active_work_scope.sql",
  "utf8",
);

function uniqueSourceReferences(prefix: "LT" | "ES") {
  const expression =
    prefix === "LT" ? /'(LT-\d-\d{2})'/g : /'(ES-[A-Z]+-\d{2})'/g;
  return new Set(
    Array.from(templateMigration.matchAll(expression), (match) => match[1]),
  );
}

describe("source-aligned workflow v2", () => {
  it("represents all 48 litigation source rows", () => {
    expect(uniqueSourceReferences("LT").size).toBe(48);
    expect(templateMigration).toContain("'litigation-v2'");
    expect(templateMigration).toContain("'pre-contract-v2'");
  });

  it("represents the full estate register and independent asset template", () => {
    expect(uniqueSourceReferences("ES").size).toBe(93);
    expect(templateMigration).toContain("'estate-asset-v2'");
    expect(templateMigration).toContain(
      "'parallel_stages', jsonb_build_array('guardianship', 'estate_litigation', 'liquidation', 'marketing')",
    );
  });

  it("keeps every v2 version in draft and preserves recurring obligations", () => {
    expect(templateMigration).toContain("version_number, status");
    expect(templateMigration).toContain("select template.id, 2, 'draft'");
    expect(templateMigration).toContain(
      `'{"frequency":"business_days","interval":5}'`,
    );
    expect(templateMigration).toContain(
      `'{"frequency":"business_days","interval":7`,
    );
    expect(templateMigration).toContain(
      `'{"frequency":"days","interval":90,"prepare_within_business_days":15}'`,
    );
  });

  it("enforces PBAC, append-only acceptance, and no client request RPC", () => {
    expect(structureMigration).toContain("public.get_my_permissions()");
    expect(structureMigration).toContain("contract_acceptances_append_only");
    expect(structureMigration).toContain(
      "revoke execute on function public.create_client_service_request",
    );
    expect(structureMigration).toContain("public.create_staff_service_request");
  });

  it("implements estate finance, approvals, reports, and team operations", () => {
    expect(estateOperationsMigration).toContain(
      "create table public.estate_financial_entries",
    );
    expect(estateOperationsMigration).toContain(
      "create or replace function public.verify_estate_party_bank_account",
    );
    expect(estateOperationsMigration).toContain(
      "create or replace function public.record_estate_party_decision",
    );
    expect(estateOperationsMigration).toContain(
      "create or replace function public.record_estate_financial_entry",
    );
    expect(estateOperationsMigration).toContain(
      "create or replace function public.create_estate_periodic_report",
    );
    expect(estateOperationsMigration).toContain(
      "create or replace function public.transition_estate_report",
    );
    expect(estateOperationsMigration).toContain(
      "create or replace function public.assign_estate_project_member",
    );
    expect(estateOperationsMigration).toContain(
      "create or replace function public.create_estate_litigation_subproject",
    );
    expect(estateOperationsMigration).toContain(
      "alter table public.estate_financial_entries enable row level security",
    );
    expect(estateAuditMigration).toContain(
      "'estate_party_bank_accounts'",
    );
    expect(estateAuditMigration).toContain("'estate_party_decisions'");
    expect(estateAuditMigration).toContain("'project_reports'");
    expect(estateAuditMigration).toContain("'project_report_versions'");
  });

  it("allows each estate asset subproject to own an independent workflow", () => {
    expect(estateAssetScopeMigration).toContain(
      "drop constraint if exists workflow_instances_estate_asset_id_project_id_fkey",
    );
    expect(estateAssetScopeMigration).toContain(
      "foreign key (estate_asset_id)",
    );
    expect(estateOperationsMigration).toContain(
      "project_row.estate_asset_id",
    );
    expect(estateOperationsMigration).toContain(
      "perform public.start_project_operational_workflow(new_project_id)",
    );
    expect(estateLitigationClientMigration).toContain(
      "order by account.is_primary desc, account.linked_at",
    );
  });

  it("uses active project teams as operational workflow executors", () => {
    expect(operationalTeamsMigration).toContain(
      "private.sync_workflow_project_team_assignments",
    );
    expect(operationalTeamsMigration).toContain(
      "rule.selector_type = 'project_team'",
    );
    expect(operationalTeamsMigration).toContain(
      "create or replace function public.update_project_team",
    );
    expect(operationalTeamsMigration).toContain(
      "create or replace function public.remove_project_team_member",
    );
    expect(teamScopeMigration).toContain(
      "resolved_from_project_team:",
    );
    expect(teamScopeMigration).toContain(
      "child.project_type = 'estate_asset'",
    );
    expect(teamEligibilityMigration).toContain(
      "team_member.team_role in (''leader'', ''member'')",
    );
    expect(teamEligibilityMigration).toContain(
      "role.code = 'accountant'",
    );
    expect(teamRoleSyncMigration).toContain(
      "private.remove_ineligible_project_team_assignments",
    );
    expect(teamWorkScopeMigration).toContain(
      "''in_progress'', ''returned_for_revision''",
    );
  });
});

describe("document limits", () => {
  it("uses the approved private-document limits", () => {
    expect(DOCUMENT_MAX_BYTES).toBe(26_214_400);
    expect(DOCUMENT_SIGNED_URL_SECONDS).toBe(300);
    expect(DOCUMENT_ALLOWED_EXTENSIONS).toEqual([
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "jpg",
      "jpeg",
      "png",
    ]);
  });
});
