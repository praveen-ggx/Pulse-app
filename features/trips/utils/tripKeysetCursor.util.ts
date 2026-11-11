/** Stable keyset for lists ordered by created_at DESC, id DESC. */
export type TripKeysetCursor = {
  createdAt: string;
  id: string;
};

export const TRIP_LIST_PAGE_SIZE = 100;

/** Raw pages to scan in one request when a page filters down to nothing. */
export const TRIP_LIST_EMPTY_PAGE_HOPS = 20;

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

/**
 * Keep asking for the next raw page while the visible list is empty and a
 * cursor remains. The cursor always belongs to the last raw row, so an
 * ineligible page does not drop the eligible rows behind it.
 */
export async function readUntilVisibleTripPage<T>(args: {
  initialCursor: TripKeysetCursor | null;
  maxPages: number;
  fetchPage: (cursor: TripKeysetCursor | null) => Promise<{
    error: Error | null;
    visible: readonly T[];
    nextCursor: TripKeysetCursor | null;
  }>;
}): Promise<{ error: Error | null; trips: T[]; nextCursor: TripKeysetCursor | null }> {
  let cursor = args.initialCursor;
  const maxPages = Math.max(1, args.maxPages);
  let lastCursor: TripKeysetCursor | null = null;
  for (let hop = 0; hop < maxPages; hop += 1) {
    const page = await args.fetchPage(cursor);
    if (page.error) return { error: page.error, trips: [], nextCursor: null };
    lastCursor = page.nextCursor;
    if (page.visible.length > 0 || page.nextCursor == null) {
      return { error: null, trips: [...page.visible], nextCursor: page.nextCursor };
    }
    cursor = page.nextCursor;
  }
  return { error: null, trips: [], nextCursor: lastCursor };
}

/** Whether an empty filtered POD page should request the next raw page. */
export function shouldAutoLoadOlderPodPage(args: {
  hasParty: boolean;
  visibleCount: number;
  hasNextPage: boolean;
  busy: boolean;
  failed: boolean;
  hops: number;
  maxHops?: number;
}): boolean {
  if (!args.hasParty || args.visibleCount > 0) return false;
  if (!args.hasNextPage || args.busy || args.failed) return false;
  return args.hops < (args.maxHops ?? TRIP_LIST_EMPTY_PAGE_HOPS);
}
