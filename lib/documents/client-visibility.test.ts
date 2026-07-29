import { describe, expect, it } from "vitest";
import { canClientReadDocument, type ClientDocument } from "./client-visibility";

const publishedDocument: ClientDocument = {
  clientId: "client-a",
  projectClientId: null,
  visibility: "client_visible",
  clientVisibilityStatus: "published",
  deletedAt: null,
};

describe("client document visibility", () => {
  it("allows the owning client to read an explicitly published document", () => {
    expect(canClientReadDocument(publishedDocument, "client-a")).toBe(true);
  });

  it.each([
    [{ ...publishedDocument, visibility: "internal" }, "client-a"],
    [{ ...publishedDocument, clientVisibilityStatus: "draft" }, "client-a"],
    [{ ...publishedDocument, clientVisibilityStatus: "withdrawn" }, "client-a"],
    [publishedDocument, "client-b"],
    [{ ...publishedDocument, deletedAt: "2026-07-29T00:00:00Z" }, "client-a"],
  ] as const)("denies internal, unpublished, withdrawn, deleted, or foreign documents", (document, clientId) => {
    expect(canClientReadDocument(document, clientId)).toBe(false);
  });
});
