/**
 * Classifies outgoing Supabase HTTP requests for the Moderator: which lane they
 * belong to, whether they can be coalesced, and whether their query shape is
 * unbounded or over-selecting.
 *
 * Everything is derived from the PostgREST URL (plus an optional lane header),
 * so service files do not have to opt in. Newer Network / Reach / story reads
 * are inferred as `background` — see `featureLanes.ts`.
 */
import {
  inferredFeatureLane,
  isReadOnlyFeatureRpc,
  parseRestResource,
} from './featureLanes';
import type { RequestLane, ShapeViolation } from './types';

/** Callers can force a lane with this header; absent, the lane is inferred. */
export const LANE_HEADER = 'x-pulse-lane';

export type RequestClassification = {
  lane: RequestLane;
  /** Set only for coalescable reads (idempotent GETs against PostgREST). */
  coalesceKey?: string;
  /** Shape problems worth surfacing in dev. Empty for non-reads. */
  violations: ShapeViolation[];
  /** True for auth/token traffic, which must never be queued or shed. */
  isAuth: boolean;
  /** Auth, storage, and realtime skip `moderate()` — same as `isAuth` for the fetch wrapper. */
  bypassModerator: boolean;
};

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const m =
    init?.method ??
    (typeof input === 'object' && 'method' in input ? input.method : undefined);
  return (m ?? 'GET').toUpperCase();
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  const h = init?.headers;
  if (!h) return null;
  if (typeof Headers !== 'undefined' && h instanceof Headers) return h.get(name);
  if (Array.isArray(h)) {
    const hit = h.find(([k]) => k.toLowerCase() === name);
    return hit ? hit[1] : null;
  }
  const rec = h as Record<string, string>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name);
  return key ? rec[key] : null;
}

function isLane(v: string | null): v is RequestLane {
  return v === 'interactive' || v === 'background' || v === 'bulk';
}

/**
 * Reads carrying no row ceiling. PostgREST expresses bounds as a `limit`
 * query param or a Range header; `.single()`/`.maybeSingle()` send
 * Accept: application/vnd.pgrst.object+json, which is inherently bounded.
 */
function isUnbounded(params: URLSearchParams, init?: RequestInit): boolean {
  if (params.has('limit')) return false;
  if (headerOf(init, 'range')) return false;
  const accept = headerOf(init, 'accept') ?? '';
  if (accept.includes('pgrst.object')) return false;
  // Aggregates and existence checks return one row by construction.
  const select = params.get('select') ?? '';
  if (/\b(count|sum|avg|min|max)\s*\(/i.test(select)) return false;
  return true;
}

export function classifyRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): RequestClassification {
  const raw = urlOf(input);
  const method = methodOf(input, init);
  const isAuth = raw.includes('/auth/v1/');
  const bypassModerator =
    isAuth || raw.includes('/storage/v1/') || raw.includes('/realtime/v1/');

  // Auth, storage and realtime traffic is never moderated: queuing a token
  // refresh behind data reads is exactly how a recovering client gets stuck.
  if (bypassModerator) {
    return { lane: 'interactive', violations: [], isAuth, bypassModerator: true };
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }

  const resource = parsed ? parseRestResource(parsed.pathname) : { kind: 'other' as const };
  const readOnlyRpc =
    resource.kind === 'rpc' &&
    isReadOnlyFeatureRpc(resource.name) &&
    (method === 'GET' || method === 'HEAD' || method === 'POST');

  // Writes are ALWAYS interactive. Read-only feature RPCs are POSTs in
  // supabase-js but have no side effects — treat them as reads so they can
  // coalesce and yield. Unlisted RPCs stay writes.
  const isWrite = method !== 'GET' && method !== 'HEAD' && !readOnlyRpc;

  const explicit = headerOf(init, LANE_HEADER);
  const inferred = !isWrite ? inferredFeatureLane(resource) : null;
  const lane: RequestLane = isWrite
    ? 'interactive'
    : isLane(explicit)
      ? explicit
      : inferred ?? 'interactive';

  const isRead = method === 'GET' || readOnlyRpc;
  const violations: ShapeViolation[] = [];
  let coalesceKey: string | undefined;

  if (parsed && isRead) {
    const auth = headerOf(init, 'authorization') ?? '';
    if (method === 'GET') {
      const params = parsed.searchParams;
      const select = params.get('select');
      if (select === '*' || select === null) violations.push('select-star');
      if (isUnbounded(params, init)) violations.push('unbounded');

      const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
      const qs = sorted.map(([k, v]) => `${k}=${v}`).join('&');
      coalesceKey = `${parsed.pathname}?${qs}|${auth}`;
    } else if (readOnlyRpc) {
      // Include the JSON body so two partner-display batches never share a key.
      const body = typeof init?.body === 'string' ? init.body : '';
      if (body) coalesceKey = `${parsed.pathname}|${body}|${auth}`;
    }
  }

  return { lane, coalesceKey, violations, isAuth, bypassModerator: false };
}
