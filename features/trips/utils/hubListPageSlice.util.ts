export type HubListPageSlice = {
  indentOffset: number;
  indentLimit: number;
  tripOffset: number;
  tripLimit: number;
};

/**
 * One page over a combined hub list: unallocated indent cards first,
 * then trip rows. Trip-only and indent-only tabs pass the other count as 0.
 */
export function sliceHubListPage(args: {
  indentCount: number;
  tripCount: number;
  page: number;
  pageSize: number;
}): HubListPageSlice {
  const indentCount = Math.max(0, args.indentCount);
  const tripCount = Math.max(0, args.tripCount);
  const pageSize = Math.max(1, args.pageSize);
  const start = Math.max(0, args.page) * pageSize;
  const end = start + pageSize;

  const indentOffset = Math.min(start, indentCount);
  const indentLimit = Math.max(0, Math.min(indentCount, end) - indentOffset);

  const tripStart = Math.max(0, start - indentCount);
  const tripEnd = Math.max(0, end - indentCount);
  const tripOffset = Math.min(tripStart, tripCount);
  const tripLimit = Math.max(0, Math.min(tripCount, tripEnd) - tripOffset);

  return { indentOffset, indentLimit, tripOffset, tripLimit };
}

/** Trip ids on the current hub page — document chips/labels load these only. */
export function visibleHubTripIds(
  tripIds: readonly string[],
  slice:
    | Pick<HubListPageSlice, "tripOffset" | "tripLimit">
    | { page: number; pageSize: number },
): string[] {
  if ("tripOffset" in slice) {
    const start = Math.max(0, slice.tripOffset);
    return tripIds.slice(start, start + Math.max(0, slice.tripLimit)).filter(Boolean);
  }
  const pageSize = Math.max(1, slice.pageSize);
  const start = Math.max(0, slice.page) * pageSize;
  return tripIds.slice(start, start + pageSize).filter(Boolean);
}
