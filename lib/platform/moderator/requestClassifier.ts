/**
 * Classifies outgoing Supabase HTTP requests for the Moderator: which lane they
 * belong to, whether they can be coalesced, and whether their query shape is
 * unbounded or over-selecting.
 *
 * Everything is derived from the PostgREST URL, so no service file has to be
 * changed to opt in.
 */
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

  // Auth, storage and realtime traffic is never moderated: queuing a token
  // refresh behind data reads is exactly how a recovering client gets stuck.
  if (isAuth || raw.includes('/storage/v1/') || raw.includes('/realtime/v1/')) {
    return { lane: 'interactive', violations: [], isAuth };
  }

  const isWrite = method !== 'GET' && method !== 'HEAD';

  // Writes are ALWAYS interactive, whatever a caller asked for. A queued read is
  // a slow screen; a shed write is lost user data (a trip status, a payment, a
  // POD). The breaker must never drop one, so writes never enter a sheddable lane.
  const explicit = headerOf(init, LANE_HEADER);
  const lane: RequestLane =
    isWrite ? 'interactive' : isLane(explicit) ? explicit : 'interactive';

  let parsed: URL | null = null;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }

  const isRead = method === 'GET';
  const violations: ShapeViolation[] = [];
  let coalesceKey: string | undefined;

  if (parsed && isRead) {
    const params = parsed.searchParams;
    const select = params.get('select');
    if (select === '*' || select === null) violations.push('select-star');
    if (isUnbounded(params, init)) violations.push('unbounded');

    // Sort params so identical filters in different orders share a key.
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const qs = sorted.map(([k, v]) => `${k}=${v}`).join('&');
    // The auth token is part of the identity of a read under RLS: two users
    // must never share a coalesced response.
    const auth = headerOf(init, 'authorization') ?? '';
    coalesceKey = `${parsed.pathname}?${qs}|${auth}`;
  }

  return { lane, coalesceKey, violations, isAuth };
}
