/** PostgREST `.or()` that still finds delete events after document_id is NULL. */
export function documentAuditLookupOrFilter(documentId: string): string | null {
  const id = documentId.trim();
  if (!id || /[,().]|->>/.test(id)) return null;
  return `document_id.eq.${id},and(document_id.is.null,metadata->>document_id.eq.${id})`;
}

export function storageLeftAfterDbDeleteMessage(storageMessage: string): string {
  const detail = storageMessage.trim();
  return detail
    ? `The document record was removed, but the file may still be in storage. ${detail}`
    : "The document record was removed, but the file may still be in storage.";
}
