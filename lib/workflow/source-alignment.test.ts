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
