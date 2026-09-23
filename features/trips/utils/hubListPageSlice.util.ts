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
