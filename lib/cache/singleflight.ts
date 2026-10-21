const inflight = new Map<string, Promise<unknown>>();

export async function runSingleflight<T>(
  key: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const current = inflight.get(key) as Promise<T> | undefined;
  if (current) return current;
  // PostgREST builders are thenable but not Promises — they have no
  // `.finally` (Safari / Hermes throw "fn().finally is not a function").
  const next = Promise.resolve()
    .then(() => fn())
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, next);
  return next;
}

/** Test-only: drop in-flight keys so concurrent suites do not leak. */
export function resetSingleflightForTests(): void {
  inflight.clear();
}

export function singleflightInflightCountForTests(): number {
  return inflight.size;
}
