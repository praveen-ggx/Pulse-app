/**
 * When a queue lands on All / Inbox / another default tab that has no cards,
 * open the first sibling tab that does.
 */
export function firstTabWithCards<T extends string>(
  counts: Partial<Record<T, number>> | null | undefined,
  order: readonly T[],
  current: T,
  options?: { autoLeave?: readonly T[] },
): T {
  if ((counts?.[current] ?? 0) > 0) return current;
  if (options?.autoLeave && !options.autoLeave.includes(current)) return current;
  for (const id of order) {
    if ((counts?.[id] ?? 0) > 0) return id;
  }
  return current;
}
