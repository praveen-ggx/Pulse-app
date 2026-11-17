/**
 * Shared pagination types and defaults for list APIs.
 * Aligns with docs/PAGINATION_AND_CACHE_ANALYSIS.md.
 */
export const DEFAULT_PAGE_SIZE = 50;
export const LEDGER_PAGE_SIZE = 50;
export const DRIVER_TRIPS_PAGE_SIZE = 30;
/** Cap for finite-list sync/cache fetches (React Query `finite` keys). */
export const FINITE_LIST_CAP = 500;

export interface PageOpts {
  limit?: number;
  offset?: number;
}

export interface PagedResult<T> {
  data: T[];
  hasMore: boolean;
  total?: number;
}

export function toRange(offset: number, limit: number): { from: number; to: number } {
  return { from: offset, to: offset + limit - 1 };
}

/** Rows requested per page by `readAllPages`. Correctness does not depend on it. */
export const READ_ALL_PAGE_SIZE = 500;
/**
 * Ids per `.in(...)` filter. A single filter of ~630 uuids is a ~25KB URL and
 * the API gateway answers HTTP 400 before PostgREST runs.
 */
export const READ_ALL_ID_CHUNK = 100;

/**
 * Reads every row of a query instead of the first `max_rows`. A single unpaged
 * select silently stops at 1000 rows (HTTP 206, no error).
 *
 * Keyset pagination on the uuid primary key `id`. `fetchPage(afterId, limit)`
 * must keep all of its filters and add, in this order:
 *   `if (afterId) q = q.gt("id", afterId)` → `.order("id", { ascending: true })` → `.limit(limit)`.
 * The loop stops only on an empty page, so a server cap below `limit` still
 * reads everything (one extra empty request per read).
 *
 * Concurrency: each page is its own snapshot, not one transaction. A row
 * deleted mid-read no longer shifts later pages (the offset problem), but a row
 * inserted with an id before the cursor, or updated into/out of the filters
 * mid-read, can be missed or included. The next refetch reconciles.
 *
 * Any page error — or a cursor that does not advance — returns an error and no
 * rows, never a partial set.
 */
export async function readAllPages<T extends { id: string }, E>(
  fetchPage: (afterId: string | null, limit: number) => PromiseLike<{ data: T[] | null; error: E | null }>,
  pageSize: number = READ_ALL_PAGE_SIZE,
): Promise<{ data: T[]; error: E | Error | null }> {
  const rows: T[] = [];
  let afterId: string | null = null;
  for (;;) {
    const { data, error } = await fetchPage(afterId, pageSize);
    if (error) return { data: [], error };
    const page = data ?? [];
    if (page.length === 0) return { data: rows, error: null };
    const lastId = String(page[page.length - 1].id);
    // Canonical lowercase uuids sort the same as Postgres uuid ordering.
    if (afterId !== null && lastId <= afterId) {
      return { data: [], error: new Error("readAllPages: cursor did not advance (missing id order/filter?)") };
    }
    rows.push(...page);
    afterId = lastId;
  }
}

export function chunkIdsForRead(ids: readonly string[], size: number = READ_ALL_ID_CHUNK): string[][] {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

/**
 * Runs `mapper` over `items` with at most `concurrency` calls in flight; results
 * keep input order. Use for chunked `.in(...)` reads: serial awaits cost one
 * network round trip per chunk, unbounded Promise.all floods the fetch queue.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const out = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await mapper(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return out;
}

/**
 * One `.in(...)` read per id chunk, rows concatenated. Use for any id list that
 * can grow with the org (an unchunked list of ~630 uuids is HTTP 400 "Bad Request").
 * Chunks run one after another so a large list cannot fill the client fetch queue.
 * Any chunk error returns that error and no rows, never a partial set.
 */
export async function readByIdChunks<T, E>(
  ids: readonly string[],
  readChunk: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: E | null }>,
  size: number = READ_ALL_ID_CHUNK,
): Promise<{ data: T[]; error: E | null }> {
  const rows: T[] = [];
  for (const chunk of chunkIdsForRead(ids, size)) {
    const { data, error } = await readChunk(chunk);
    if (error) return { data: [], error };
    if (data) rows.push(...data);
  }
  return { data: rows, error: null };
}
