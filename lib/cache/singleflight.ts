const inflight = new Map<string, Promise<unknown>>();

export async function runSingleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const current = inflight.get(key) as Promise<T> | undefined;
  if (current) return current;
  const next = fn().finally(() => {
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
