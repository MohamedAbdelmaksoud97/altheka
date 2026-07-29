export type ClientDocument = {
  clientId: string | null;
  projectClientId: string | null;
  visibility: "internal" | "client_visible" | "requires_client_action";
  clientVisibilityStatus: "draft" | "awaiting_approval" | "published" | "withdrawn";
  deletedAt: string | null;
};

export function canClientReadDocument(
  document: ClientDocument,
  signedInClientId: string,
) {
  if (document.deletedAt) return false;
  if (document.clientVisibilityStatus !== "published") return false;
  if (document.visibility === "internal") return false;

  return (
    document.clientId === signedInClientId ||
    document.projectClientId === signedInClientId
  );
}

export function toClientDocumentDto(document: {
  id: string;
  title: string;
  document_type: string;
  published_to_client_at: string;
  visibility: "client_visible" | "requires_client_action";
}) {
  return {
    id: document.id,
    title: document.title,
    documentType: document.document_type,
    publishedAt: document.published_to_client_at,
    requiresAction: document.visibility === "requires_client_action",
  };
}
