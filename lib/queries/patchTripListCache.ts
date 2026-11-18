/** Replace one trip inside a cached list. Same array when the id is absent. */
export function mergeTripRowIntoList<T extends { id: string }>(
  rows: T[] | unknown,
  tripId: string,
  patch: Record<string, unknown>,
): T[] | unknown {
  if (!Array.isArray(rows) || !tripId) return rows;
  let changed = false;
  const next = rows.map((row: T) => {
    if (!row || row.id !== tripId) return row;
    changed = true;
    return { ...row, ...patch };
  });
  return changed ? next : rows;
}
