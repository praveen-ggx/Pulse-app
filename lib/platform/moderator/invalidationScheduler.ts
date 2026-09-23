/**
 * Batches TanStack Query invalidations on a short window.
 *
 * Realtime bursts (a convoy of trips updating, a chat thread, a GPS-driven
 * status cascade) can fire dozens of invalidateQueries calls in the same tick.
 * queryCacheMetrics already *detects* these storms at 20/sec; this absorbs them:
 * identical keys collapse, and the flush happens once per window instead of
 * once per event.
 *
 * @see docs/DB_LOAD_ARCHITECTURE_REVIEW.md
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';

const DEFAULT_WINDOW_MS = 100;

type Pending = {
  client: QueryClient;
  keys: Map<string, QueryKey>;
  timer: ReturnType<typeof setTimeout> | null;
};

let pending: Pending | null = null;
let windowMs = DEFAULT_WINDOW_MS;
let batchedCount = 0;
let flushCount = 0;

function flush(): void {
  const current = pending;
  pending = null;
  if (!current) return;
  if (current.timer) clearTimeout(current.timer);
  flushCount += 1;
  current.keys.forEach((queryKey) => {
    current.client.invalidateQueries({ queryKey });
  });
}

/**
 * Queue an invalidation. Identical keys within the window collapse to one.
 * Returns immediately — invalidation is fire-and-forget by design.
 */
export function scheduleInvalidation(
  client: QueryClient,
  queryKey: QueryKey,
): void {
  batchedCount += 1;
  const serialized = JSON.stringify(queryKey);
  if (!pending || pending.client !== client) {
    // A different client mid-window (tests, SSR) — flush the old one first.
    if (pending) flush();
    pending = { client, keys: new Map(), timer: null };
  }
  pending.keys.set(serialized, queryKey);
  if (!pending.timer) {
    pending.timer = setTimeout(flush, windowMs);
  }
}

/** Force any queued invalidations to run now (e.g. before an assertion). */
export function flushInvalidations(): void {
  flush();
}

export function configureInvalidationWindow(ms: number): void {
  windowMs = ms;
}

export function getInvalidationSchedulerMetrics(): {
  batched: number;
  flushes: number;
  pendingKeys: number;
} {
  return {
    batched: batchedCount,
    flushes: flushCount,
    pendingKeys: pending?.keys.size ?? 0,
  };
}

export function __resetInvalidationSchedulerForTests(): void {
  if (pending?.timer) clearTimeout(pending.timer);
  pending = null;
  windowMs = DEFAULT_WINDOW_MS;
  batchedCount = 0;
  flushCount = 0;
}
