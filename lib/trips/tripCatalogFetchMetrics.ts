/**
 * In-memory counts for get_trips_for_org. No trip content, phones, or tokens.
 * Organisation ids stay in this process map and are not written to logs.
 */

export type TripCatalogFetchKind = "catalog" | "compliance" | "range";

export type TripCatalogFetchRecord = {
  calls: number;
  joined: number;
  failures: number;
  durationMs: number;
  lastAt: number;
};

const buckets = new Map<string, TripCatalogFetchRecord>();

function bucketKey(orgId: string, kind: TripCatalogFetchKind): string {
  return `${orgId}\n${kind}`;
}

const LOG_INTERVAL_MS = 60_000;
let lastLogAt = 0;

export type TripCatalogFetchTotals = {
  calls: number;
  joined: number;
  failures: number;
  durationMs: number;
  byKind: Record<TripCatalogFetchKind, { calls: number; joined: number; failures: number }>;
};

function emptyKind(): { calls: number; joined: number; failures: number } {
  return { calls: 0, joined: 0, failures: 0 };
}

/** Totals only. Organisation ids never leave the in-memory map. */
export function tripCatalogFetchTotals(): TripCatalogFetchTotals {
  const totals: TripCatalogFetchTotals = {
    calls: 0,
    joined: 0,
    failures: 0,
    durationMs: 0,
    byKind: { catalog: emptyKind(), compliance: emptyKind(), range: emptyKind() },
  };
  for (const [key, record] of buckets) {
    const kind = key.slice(key.indexOf("\n") + 1) as TripCatalogFetchKind;
    const bucket = totals.byKind[kind] ?? (totals.byKind[kind] = emptyKind());
    bucket.calls += record.calls;
    bucket.joined += record.joined;
    bucket.failures += record.failures;
    totals.calls += record.calls;
    totals.joined += record.joined;
    totals.failures += record.failures;
    totals.durationMs += record.durationMs;
  }
  return totals;
}

function maybeLogAggregate(): void {
  if (process.env.NODE_ENV === "test") return;
  const now = Date.now();
  if (now - lastLogAt < LOG_INTERVAL_MS) return;
  lastLogAt = now;
  const totals = tripCatalogFetchTotals();
  if (totals.calls === 0) return;
  console.info(
    `[trip-catalog] calls=${totals.calls} joined=${totals.joined} failures=${totals.failures} durationMs=${totals.durationMs} compliance=${totals.byKind.compliance.calls} catalog=${totals.byKind.catalog.calls} range=${totals.byKind.range.calls}`,
  );
}

export function recordTripCatalogFetch(input: {
  orgId: string;
  kind: TripCatalogFetchKind;
  joined: boolean;
  ok: boolean;
  durationMs: number;
}): void {
  const key = bucketKey(input.orgId, input.kind);
  const current = buckets.get(key) ?? {
    calls: 0,
    joined: 0,
    failures: 0,
    durationMs: 0,
    lastAt: 0,
  };
  current.calls += 1;
  if (input.joined) current.joined += 1;
  if (!input.ok) current.failures += 1;
  current.durationMs += input.durationMs;
  current.lastAt = Date.now();
  buckets.set(key, current);
  maybeLogAggregate();
}

export function tripCatalogFetchSnapshot(
  orgId: string,
  kind: TripCatalogFetchKind,
): TripCatalogFetchRecord {
  return (
    buckets.get(bucketKey(orgId, kind)) ?? {
      calls: 0,
      joined: 0,
      failures: 0,
      durationMs: 0,
      lastAt: 0,
    }
  );
}

export function resetTripCatalogFetchMetricsForTests(): void {
  buckets.clear();
}
