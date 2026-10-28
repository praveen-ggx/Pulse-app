/** Bound parallel async work so a user action cannot fill the data-fetch queue. */
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
