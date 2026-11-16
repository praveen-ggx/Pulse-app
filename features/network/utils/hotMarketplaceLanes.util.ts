/** Hottest marketplace lanes for the home. The full set stays reachable by filter or “see all”. */
export const HOT_LANE_LIMIT = 6;

export function hotMarketplaceLanes<T extends { load_count: number }>(
  lanes: readonly T[],
  limit = HOT_LANE_LIMIT,
): T[] {
  return [...lanes]
    .sort((a, b) => (Number(b.load_count) || 0) - (Number(a.load_count) || 0))
    .slice(0, Math.max(0, limit));
}
