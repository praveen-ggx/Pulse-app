/**
 * Which copy of a vehicle / driver document counts.
 *
 * A slot is (organization, entity, doc_type). One slot may hold several live
 * files — e.g. RC front and back — and pages of the same document share an
 * expiry date. Replacing a document marks the older rows `replaced`; rows are
 * never deleted, so history and storage objects stay intact.
 *
 * Rules (mirrored in SQL by `private.entity_document_is_superseded`):
 * - Live: status is not `replaced` / `rejected`.
 * - Current copy: among live rows, prefer rows with an expiry, then the newest.
 *   Review status does not decide which copy is current — it is reported
 *   separately — so an old verified copy cannot hide a newer upload.
 * - Superseded: a live row older than another live row in the same slot that
 *   carries a different expiry. Superseded rows never raise expiry warnings.
 *
 * The newest upload is not assumed valid: its own expiry still decides.
 */

export type SlotDocLike = {
  doc_type: string;
  status: string;
  expiry_date?: string | null;
  created_at?: string | null;
};

const NOT_LIVE = new Set(["replaced", "rejected"]);

export function isLiveEntityDoc(doc: Pick<SlotDocLike, "status">): boolean {
  return !NOT_LIVE.has(doc.status);
}

function expiryOf(doc: SlotDocLike): string | null {
  return doc.expiry_date?.trim() || null;
}

function createdOf(doc: SlotDocLike): string {
  return String(doc.created_at ?? "");
}

/** The copy of one slot that counts. Pass rows of a single doc_type. */
export function pickCanonicalEntityDoc<T extends SlotDocLike>(documents: readonly T[]): T | null {
  const live = documents.filter(isLiveEntityDoc);
  const list = live.length > 0 ? live : documents;
  if (list.length === 0) return null;
  return [...list].sort((a, b) => {
    const aExpiry = expiryOf(a) ? 1 : 0;
    const bExpiry = expiryOf(b) ? 1 : 0;
    if (bExpiry !== aExpiry) return bExpiry - aExpiry;
    return createdOf(b).localeCompare(createdOf(a));
  })[0] ?? null;
}

/** True when a newer live copy of the same slot carries a different expiry. */
export function isSupersededEntityDoc<T extends SlotDocLike>(doc: T, slotDocuments: readonly T[]): boolean {
  const created = createdOf(doc);
  const expiry = expiryOf(doc);
  return slotDocuments.some(
    (other) =>
      other !== doc &&
      other.doc_type === doc.doc_type &&
      isLiveEntityDoc(other) &&
      expiryOf(other) != null &&
      expiryOf(other) !== expiry &&
      createdOf(other) > created,
  );
}

/**
 * Live, non-superseded rows. Pass one entity's documents. Use this for
 * counts, expiry warnings and blocking checks.
 */
export function currentEntityDocuments<T extends SlotDocLike>(documents: readonly T[]): T[] {
  return documents.filter((doc) => isLiveEntityDoc(doc) && !isSupersededEntityDoc(doc, documents));
}

/** The current copy per doc_type for one entity. */
export function canonicalEntityDocsByType<T extends SlotDocLike>(documents: readonly T[]): Map<string, T> {
  const grouped = new Map<string, T[]>();
  for (const doc of documents) {
    const list = grouped.get(doc.doc_type) ?? [];
    list.push(doc);
    grouped.set(doc.doc_type, list);
  }
  const byType = new Map<string, T>();
  for (const [type, list] of grouped) {
    const pick = pickCanonicalEntityDoc(list);
    if (pick) byType.set(type, pick);
  }
  return byType;
}
