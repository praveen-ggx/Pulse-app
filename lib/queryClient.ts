/**
 * TanStack Query client with app-wide defaults + AsyncStorage persistence.
 * Realtime invalidates live data; persistence gives instant cold-open UX.
 *
 * Stale tiers:
 *   realtime  — Realtime subscription invalidates; staleTime high so no extra background refetch
 *   frequent  — changes via mutations + manual invalidation (drivers, vehicles)
 *   moderate  — rarely mutated (suppliers, clients, org members)
 *   slow      — almost never changes (org profile, capabilities)
 */
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import type { QueryCacheNotifyEvent } from '@tanstack/react-query';
import { isWithinAppQueryBootQuietPeriod } from '@/lib/hooks/appQueryGateState';
import { logger } from '@/lib/logger';
import {
  recordInvalidateQueries,
  recordInvalidationStorm,
  recordRefetchQueries,
  recordSetQueryData,
} from '@/lib/platform/scalability/queryCacheMetrics';
import { isOriginDownError, isSupabaseCircuitOpen } from '@/lib/supabaseHttp.util';

/** Shared stale-time constants — import in query hooks to apply per-query tiers. */
export const STALE = {
  /** Data covered by Realtime: don't background-refetch on focus; Realtime handles freshness. */
  realtime: 5 * 60_000,       // 5 min — Realtime invalidates; this is just the fallback
  /** Mutations always invalidate; 2 min background safety net. */
  frequent: 2 * 60_000,
  /** Rarely mutated entities. */
  moderate: 10 * 60_000,      // 10 min
  /** Near-static: org profile, feature flags. */
  slow: 30 * 60_000,          // 30 min
} as const;

/** gcTime must exceed persister maxAge, otherwise persistence is a no-op. */
const GC_TIME_MS = 24 * 60 * 60 * 1000; // 24 h — keeps data alive for next cold open

/** Threshold in ms above which a query is flagged as slow in dev. */
const SLOW_QUERY_WARN_MS = 3_000;

/** Multi-hop RPCs that routinely exceed 3s — suppress dev noise on boot. */
const KNOWN_SLOW_QUERY_KEY_FRAGMENTS = ['"market"'] as const;

/** Burst window for invalidation storm detection. */
const INVALIDATION_STORM_WINDOW_MS = 1_000;
const INVALIDATION_STORM_THRESHOLD = 20;

/** Always-on cache counters for Platform Health (P0). */
function attachPlatformCacheMetrics(client: QueryClient): void {
  let stormWindowStart = 0;
  let stormCount = 0;
  let stormLogged = false;

  const origInvalidate = client.invalidateQueries.bind(client);
  (client as unknown as { invalidateQueries: typeof origInvalidate }).invalidateQueries = function (...args) {
    if (isSupabaseCircuitOpen()) {
      return Promise.resolve();
    }
    recordInvalidateQueries();
    const now = Date.now();
    if (now - stormWindowStart > INVALIDATION_STORM_WINDOW_MS) {
      stormWindowStart = now;
      stormCount = 0;
      stormLogged = false;
    }
    stormCount += 1;
    if (stormCount >= INVALIDATION_STORM_THRESHOLD && !stormLogged) {
      stormLogged = true;
      recordInvalidationStorm();
      if (__DEV__) {
        console.warn(
          `[query] invalidation storm: ${stormCount}+ invalidations in 1s — check realtime subscriptions`,
          args[0],
        );
      }
    }
    return origInvalidate(...args);
  };

  const origSetQueryData = client.setQueryData.bind(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).setQueryData = (...args: Parameters<typeof origSetQueryData>) => {
    recordSetQueryData();
    return origSetQueryData(...args);
  };

  const origRefetch = client.refetchQueries.bind(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).refetchQueries = (...args: Parameters<typeof origRefetch>) => {
    recordRefetchQueries();
    return origRefetch(...args);
  };
}

/** Attach a dev-only observer that logs slow fetches and failed queries. */
function attachDevObserver(client: QueryClient): void {
  if (!__DEV__) return;
  const startTimes = new Map<string, number>();
  client.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
    if (event.type !== 'updated') return;
    const key = JSON.stringify(event.query.queryKey);
    const { fetchStatus, status, error } = event.query.state;
    if (fetchStatus === 'fetching' && !startTimes.has(key)) {
      startTimes.set(key, Date.now());
    } else if (fetchStatus === 'idle') {
      const start = startTimes.get(key);
      if (start !== undefined) {
        const elapsed = Date.now() - start;
        startTimes.delete(key);
        if (elapsed > SLOW_QUERY_WARN_MS && !isAbortError(error)) {
          const isKnownSlow =
            KNOWN_SLOW_QUERY_KEY_FRAGMENTS.some((frag) => key.includes(frag)) &&
            (isWithinAppQueryBootQuietPeriod() || elapsed < 8_000);
          if (!isKnownSlow) {
            console.warn(`[query] slow fetch ${elapsed}ms`, key.slice(0, 120));
          }
        }
      }
      if (status === 'error' && !isAbortError(error)) {
        console.warn('[query] fetch error', key.slice(0, 120), error);
      }
    }
  });
}

/**
 * Best-effort human-readable message for anything thrown. Supabase/PostgREST
 * reject with a plain `{code, details, hint, message}` object rather than an
 * Error, and `String(obj)` on those collapses to "[object Object]".
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message) return message;
  return String(error ?? '');
}

/**
 * Aborted fetches are not failures — TanStack cancels in-flight requests when a
 * screen unmounts mid-navigation, and Safari surfaces that as `AbortError: Fetch
 * is aborted`. Reporting them created pure Sentry noise (GX-PULSE-1E / 1F).
 */
function isAbortError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'AbortError') return true;
  }
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'AbortError' || name === 'CanceledError') return true;
  // Supabase surfaces aborts as a plain {code, details, hint, message} object.
  // `String()` on those yields "[object Object]", hiding the abort text, so read
  // `message`/`hint` off the object before falling back (GX-PULSE-1Y).
  const message = extractErrorMessage(error);
  const hint = (error as { hint?: unknown } | null)?.hint;
  const haystack = typeof hint === 'string' ? `${message} ${hint}` : message;
  return /\bAbortError\b|Request cancelled|Fetch is aborted|The operation was aborted|signal is aborted|was aborted/i.test(
    haystack,
  );
}

/**
 * A rehydrated query whose observer never mounted has no queryFn, so TanStack
 * fails it with "Missing queryFn". This is a cache-restore artifact, not a
 * request failure: the persister writes every successful key (6h maxAge), and on
 * cold start keys whose screen isn't mounted get restored without a fn. Nothing
 * is broken — the query refetches normally once its screen mounts (GX-PULSE-1Z).
 */
function isMissingQueryFnError(error: unknown): boolean {
  return /^Missing queryFn\b/.test(extractErrorMessage(error));
}

/**
 * "Failed to fetch" / schema-cache-retry errors mean the browser couldn't
 * reach Supabase at all (offline, DNS, CORS, ad-blocker) — not an app bug.
 * TanStack already retries these, so only log a breadcrumb instead of
 * reporting a new Sentry issue per affected user (GX-PULSE-17/21/22/23/24/25).
 */
function isNetworkFailure(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError') return true;
  return /Failed to fetch|Request timed out|Could not query the database for the schema cache/i.test(
    extractErrorMessage(error),
  );
}

/**
 * A query that already timed out (Postgres `statement timeout`, PostgREST's
 * 57014, or our own fetch-layer timeout) means the DB was too slow to answer
 * in time — retrying immediately adds another attempt at the exact same load
 * instead of backing off. Under a real DB slowdown this is a fleet-wide
 * multiplier: every in-flight query gets a guaranteed 2nd attempt at once,
 * which was identified as a contributing factor in the 2026-09-16 DB incident.
 * Don't retry these; still retry other transient failures (dropped
 * connection, brief 5xx) since those usually aren't caused by sustained load.
 */
function isTimeoutError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  // Cloudflare 522 bodies often say "Connection timed out" after normalizeInfrastructureErrorMessage.
  // That is a transient proxy failure, not a statement/request timeout — do not suppress its one default retry.
  if (/\b522\b/.test(message)) return false;
  return /\b57014\b|statement timeout|canceling statement due to|Request timed out/i.test(
    message,
  );
}

/** 503/521/57P03: Postgres is unavailable. A second attempt is another punch while it's down.
 * Delegates to shared classifier so status/code survive plain PostgREST objects.
 */
function isQueryOriginDownError(error: unknown): boolean {
  return isOriginDownError(error);
}

/**
 * Supabase/PostgREST rejects with a plain object ({message, code, details,
 * hint}), not an Error. `String(obj)` on those yields "[object Object]", which
 * collapses every distinct failure into one unreadable Sentry group with no
 * message and no stack (GX-PULSE-1X). Lift the real message out, and keep the
 * PostgREST code so the group stays diagnosable.
 */
function toReportableError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object') {
    const { message, code, details, hint } = error as Record<string, unknown>;
    if (typeof message === 'string' && message) {
      const err = new Error(code ? `[${String(code)}] ${message}` : message);
      if (details) (err as { details?: unknown }).details = details;
      if (hint) (err as { hint?: unknown }).hint = hint;
      return err;
    }
    try {
      return new Error(JSON.stringify(error));
    } catch {
      // Circular or non-serializable — fall through to String().
    }
  }
  return new Error(String(error));
}

/**
 * Was a plain `retry: 1` (unconditional) — retried aborted/unmounted
 * requests for nothing, and during a DB slowdown guaranteed a 2nd attempt at
 * every already-timed-out query, fleet-wide, at once. See isTimeoutError's
 * comment. Exported for direct unit testing.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (isSupabaseCircuitOpen()) return false;
  if (isAbortError(error)) return false;
  if (isTimeoutError(error)) return false;
  if (isQueryOriginDownError(error)) return false;
  return true;
}

export function makeQueryClient() {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isAbortError(error)) return;
        if (isMissingQueryFnError(error)) return;
        if (isNetworkFailure(error)) return;
        logger.error('[query] fetch failed', {
          error: toReportableError(error),
          queryKey: JSON.stringify(query.queryKey),
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isAbortError(error)) return;
        if (isNetworkFailure(error)) return;
        logger.error('[mutation] failed', {
          error: toReportableError(error),
        });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: STALE.moderate,
        gcTime: GC_TIME_MS,
        retry: shouldRetryQuery,
        retryDelay: (attemptIndex) => {
          const base = Math.min(1_000 * 2 ** attemptIndex, 8_000);
          const jitter = base * 0.2 * (Math.random() * 2 - 1);
          return Math.round(base + jitter);
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
  attachPlatformCacheMetrics(client);
  attachDevObserver(client);
  return client;
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
