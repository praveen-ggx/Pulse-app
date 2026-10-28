/** Where a last-opened hub ticket sits in the combined indent + trip list. */
export function hubItemListIndex(args: {
  id: string | null | undefined;
  indentIds: readonly string[];
  tripIds: readonly string[];
  includeIndents: boolean;
  includeTrips: boolean;
}): number {
  const id = (args.id ?? "").trim();
  if (!id) return -1;
  if (args.includeIndents) {
    const indentAt = args.indentIds.indexOf(id);
    if (indentAt >= 0) return indentAt;
  }
  if (!args.includeTrips) return -1;
  const tripAt = args.tripIds.indexOf(id);
  if (tripAt < 0) return -1;
  return (args.includeIndents ? args.indentIds.length : 0) + tripAt;
}

export function hubPageForIndex(index: number, pageSize: number): number {
  if (index < 0) return 0;
  return Math.floor(index / Math.max(1, pageSize));
}

export function hubVisibleCountForIndex(
  index: number,
  minCount: number,
): number {
  if (index < 0) return Math.max(0, minCount);
  return Math.max(minCount, index + 1);
}
