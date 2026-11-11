/** Stable keyset for lists ordered by created_at DESC, id DESC. */
export type TripKeysetCursor = {
  createdAt: string;
  id: string;
};

export const TRIP_LIST_PAGE_SIZE = 100;

/**
 * PostgREST `or` filter for the next page after a descending (created_at, id) cursor.
 * Timestamps and ids are quoted so `:` and `+` are not parsed as operators.
 */
export function tripKeysetBeforeFilter(cursor: TripKeysetCursor): string {
  const created = `"${cursor.createdAt}"`;
  const id = `"${cursor.id}"`;
  return `created_at.lt.${created},and(created_at.eq.${created},id.lt.${id})`;
}

export function nextTripKeysetCursor(
  rows: readonly { created_at?: string | null; id?: string | null }[],
  pageSize: number,
): TripKeysetCursor | null {
  if (pageSize < 1 || rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  const createdAt = last?.created_at ? String(last.created_at) : "";
  const id = last?.id ? String(last.id) : "";
  if (!createdAt || !id) return null;
  return { createdAt, id };
}
