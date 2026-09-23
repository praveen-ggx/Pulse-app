/** First marketplace page on Load — keep the RPC small so network indents stay first. */
export const MARKETPLACE_LOAD_PAGE_SIZE = 15;

export function sliceMarketplaceLoadsPage<T>(
  rows: T[],
  offset: number,
  pageSize: number = MARKETPLACE_LOAD_PAGE_SIZE,
): { page: T[]; hasMore: boolean } {
  const start = Math.max(0, offset);
  const size = Math.max(1, pageSize);
  const page = rows.slice(start, start + size);
  return { page, hasMore: rows.length >= start + size };
}

export function nextMarketplacePageOffset(
  offset: number,
  pageLength: number,
  pageSize: number = MARKETPLACE_LOAD_PAGE_SIZE,
): number | undefined {
  if (pageLength < pageSize) return undefined;
  return offset + pageSize;
}
