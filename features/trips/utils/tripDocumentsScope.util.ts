/**
 * Keep trip vault state scoped to the open trip.
 * Light bundles always ship documents: [] — that must not resurrect another
 * trip's rows after navigation, and an empty table read must clear the vault.
 */

export type TripScopedDocument = {
  id: string;
  trip_id: string;
  document_number?: string | null;
};

/** Rows that belong to the trip currently on screen. */
export function filterDocumentsForTrip<T extends TripScopedDocument>(
  rows: T[],
  tripId: string | null | undefined,
): T[] {
  const id = (tripId ?? "").trim();
  if (!id) return [];
  return rows.filter((row) => row.trip_id === id);
}

/**
 * After getDocumentsByTripId resolves for the active trip, always take the
 * server list — including [] — so a trip with no e-way/POD cannot keep the
 * previous trip's files.
 */
export function tripDocumentsFromTableLoad<T>(
  documents: T[] | null | undefined,
): T[] {
  return documents ?? [];
}

/**
 * Merge light/full bundle documents into vault state.
 * - Never apply a bundle whose trip id differs from the open trip.
 * - When the bundle list is empty, keep previous rows only if they already
 *   belong to this trip (table load already filled the vault).
 * - Preserve document_number from prev when the bundle row omits it.
 */
export function mergeTripDocumentsFromBundleSeed<T extends TripScopedDocument>(params: {
  openTripId: string | null | undefined;
  bundleTripId: string | null | undefined;
  fromBundle: T[];
  prev: T[];
}): T[] {
  const openId = (params.openTripId ?? "").trim();
  const bundleId = (params.bundleTripId ?? "").trim();
  if (!openId || !bundleId || bundleId !== openId) {
    return filterDocumentsForTrip(params.prev, openId);
  }

  const sameTripPrev = filterDocumentsForTrip(params.prev, openId);
  if (params.fromBundle.length === 0) {
    return sameTripPrev;
  }

  return params.fromBundle.map((row) => {
    if (row.document_number?.trim()) return row;
    const previous = sameTripPrev.find((item) => item.id === row.id);
    return previous?.document_number
      ? { ...row, document_number: previous.document_number }
      : row;
  });
}
