/** Cloudflare / PostgREST "origin is gone" — retrying these is what turns a DB Unhealthy into a client storm.
 * 504 is PGRST003 (PostgREST pool wait timeout). Today's 2026-09-22 cascade
 * showed 504s on auth + rest while diagnostic crons were also failing to start;
 * retrying those 504s held the remaining pool slots. */
/** 544 is Cloudflare/custom origin timeout (avatars/storage in the 2026-09-22 cascade). */
/** 502 is origin-down, not a transient proxy hop — retrying it held pool slots. */
const ORIGIN_DOWN_STATUSES = new Set([500, 502, 503, 504, 521, 544]);

/** Transient proxy / rate-limit statuses that are worth a short retry.
 * 500/502/504 are excluded: they open the shared origin circuit instead. */
const TRANSIENT_RETRY_STATUSES = new Set([408, 425, 429, 520, 522, 524]);

const SERVICE_UNAVAILABLE_CODES = new Set(['PGRST002', 'PGRST003']);

const ORIGIN_DOWN_MESSAGE =
  /503|521|57P03|PGRST00[23]|not accepting connections|database system is shutting down|web server is down|origin is unreachable/i;

/** Normalize Cloudflare / HTML error bodies from Supabase into short retryable messages. */
export function normalizeInfrastructureErrorMessage(message: string): string {
  if (/<!doctype|error code 522|cloudflare|connection timed out/i.test(message)) {
    return 'Connection timed out (522)';
  }
  if (/json parse error|unexpected character|unexpected token/i.test(message)) {
    return 'Network request failed';
  }
  return message.length > 240 ? `${message.slice(0, 240)}…` : message;
}

export function isOriginDownHttpStatus(status: number): boolean {
  return ORIGIN_DOWN_STATUSES.has(status);
}

export function isOriginDownErrorMessage(message: string): boolean {
  return ORIGIN_DOWN_MESSAGE.test(message);
}

export function isOriginDownError(error: unknown): boolean {
  if (!error) return false;
  if (isSupabaseCircuitOpen()) return true;
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && ORIGIN_DOWN_STATUSES.has(status)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code.toUpperCase() === '57P03') return true;
  if (typeof code === 'string' && SERVICE_UNAVAILABLE_CODES.has(code.toUpperCase())) {
    return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === 'string'
        ? ((error as { message: string }).message)
        : String(error);
  return isOriginDownErrorMessage(message);
}


export function isRetryableHttpResponse(res: Response): boolean {
  if (res.ok) return false;
  // 503 = PostgREST/Postgres unavailable. 521 = Cloudflare "web server is down".
  // Retrying either holds pool connections and multiplies load while the instance
  // is already Unhealthy (2026-09-18 incident: profiles/org_members 503 every ~2s).
  if (ORIGIN_DOWN_STATUSES.has(res.status)) return false;
  if (TRANSIENT_RETRY_STATUSES.has(res.status)) return true;
  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  // HTML 5xx (Warp timeout pages) must not retry — the last-line fallback
  // used to treat any non-JSON 400+ as retryable.
  if (res.status >= 500) return false;
  return !ct.includes('json') && res.status >= 400;
}

export function isInfrastructureErrorMessage(message: string): boolean {
  return /522|521|520|500|502|503|504|429|timeout|timed out|network|fetch failed|gateway|connection|json parse|unexpected character|57P03/i.test(
    message,
  );
}

/**
 * True when a failure came from the API/DB layer being unavailable rather than
 * from the query itself. Callers use this to tell a transport failure apart
 * from a legitimate empty result, so an outage is surfaced once instead of
 * driving an application-level retry loop.
 */
export function isServiceUnavailableError(error: unknown): boolean {
  if (!error) return false;
  if (isOriginDownError(error)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && SERVICE_UNAVAILABLE_CODES.has(code.toUpperCase())) {
    return true;
  }
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 500) return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown } | null)?.message === 'string'
        ? (error as { message: string }).message
        : String(error);
  return /PGRST00[23]|schema cache/i.test(message);
}

/** Extra attempts after the first. Total attempts = 1 + this (max 3). */
export const FETCH_MAX_RETRIES = 2;
/** Auth token refresh: initial + 2 retries, still under AUTH_TIMEOUT_MS. */
export const AUTH_TOKEN_MAX_RETRIES = 2;
/**
 * Client/request timeouts are not transient under pool saturation.
 * A second 12s hold is how cancelled requests become idle-in-transaction.
 */
export const TIMEOUT_MAX_RETRIES = 0;

export function retryDelayMs(
  attempt: number,
  randomOrError?: (() => number) | unknown,
): number {
  const random =
    typeof randomOrError === 'function'
      ? (randomOrError as () => number)
      : Math.random;
  const base = Math.min(2_000 * Math.pow(2, attempt - 1), 8_000);
  const jitter = base * 0.2 * (random() * 2 - 1);
  return Math.round(base + jitter);
}

export function authTokenRetryDelayMs(
  attempt: number,
  randomOrError?: (() => number) | unknown,
): number {
  return retryDelayMs(attempt, randomOrError);
}

export function isTransientFetchError(error: Error): boolean {
  if (error.name === "TimeoutError" || error.name === "AbortError") return false;
  if (isSupabaseCircuitOpen()) return false;
  return (
    error.message === "Network request failed" ||
    error.message === "Load failed" ||
    /network|failed|access control checks|schema cache/i.test(error.message)
  );
}

export function canRetryFetchAttempt(args: {
  attempt: number;
  maxRetries: number;
  timeoutMaxRetries: number;
  error: Error;
}): boolean {
  const { attempt, maxRetries, timeoutMaxRetries, error } = args;
  if (error.name === "AbortError") return false;
  if (isSupabaseCircuitOpen()) return false;
  if (error.name === "TimeoutError") {
    return attempt < timeoutMaxRetries;
  }
  return attempt < maxRetries && isTransientFetchError(error);
}

/** After the first origin-down (503/504), fail locally for a cooldown. */
export const SUPABASE_CIRCUIT_COOLDOWN_MS = 45_000;

let circuitOpenUntilMs = 0;
let halfOpenProbeInFlight = false;

export type SupabaseHttpMetrics = {
  inFlight: number;
  queued: number;
  circuitRejects: number;
  queueRejects: number;
  timeouts: number;
  status5xx: number;
  pgrst003: number;
};

const metrics: SupabaseHttpMetrics = {
  inFlight: 0,
  queued: 0,
  circuitRejects: 0,
  queueRejects: 0,
  timeouts: 0,
  status5xx: 0,
  pgrst003: 0,
};

export function getSupabaseHttpMetrics(): SupabaseHttpMetrics {
  return { ...metrics, queued: dataFetchConcurrencyGate.queuedCount, inFlight: dataFetchConcurrencyGate.activeCount };
}

export function resetSupabaseHttpMetrics(): void {
  metrics.circuitRejects = 0;
  metrics.queueRejects = 0;
  metrics.timeouts = 0;
  metrics.status5xx = 0;
  metrics.pgrst003 = 0;
}

export function recordSupabaseHttpTimeout(): void {
  metrics.timeouts += 1;
}

export function recordSupabaseHttp5xx(status?: number, code?: string): void {
  if (typeof status === 'number' && status >= 500) metrics.status5xx += 1;
  if (code && code.toUpperCase() === 'PGRST003') metrics.pgrst003 += 1;
}

export function noteSupabaseOriginDown(code?: string): void {
  circuitOpenUntilMs = Date.now() + SUPABASE_CIRCUIT_COOLDOWN_MS;
  halfOpenProbeInFlight = false;
  if (code && code.toUpperCase() === 'PGRST003') metrics.pgrst003 += 1;
}

export function noteSupabaseHealthy(): void {
  circuitOpenUntilMs = 0;
  halfOpenProbeInFlight = false;
}

/**
 * Fully open during cooldown. After cooldown, stays latched until a single
 * successful probe (`admitSupabaseRequest` + `noteSupabaseHealthy`) so screens
 * cannot stampede PostgREST the moment the 45s window ends.
 */
export function isSupabaseCircuitOpen(now = Date.now()): boolean {
  if (circuitOpenUntilMs === 0) return false;
  if (now < circuitOpenUntilMs) return true;
  return true;
}

export type SupabaseCircuitAdmission = 'allow' | 'probe' | 'reject';

/** One shared origin circuit. Auth token refresh is admitted separately by the caller. */
export function admitSupabaseRequest(now = Date.now()): SupabaseCircuitAdmission {
  if (circuitOpenUntilMs === 0) return 'allow';
  if (now < circuitOpenUntilMs) {
    metrics.circuitRejects += 1;
    return 'reject';
  }
  if (halfOpenProbeInFlight) {
    metrics.circuitRejects += 1;
    return 'reject';
  }
  halfOpenProbeInFlight = true;
  return 'probe';
}

export function finishSupabaseCircuitProbe(ok: boolean): void {
  if (!halfOpenProbeInFlight && circuitOpenUntilMs === 0) return;
  if (ok) {
    noteSupabaseHealthy();
    return;
  }
  noteSupabaseOriginDown();
}

/**
 * A client-side request timeout means the DB didn't answer inside the
 * request budget — as strong a signal of an unhealthy origin as a received
 * 500/503/504, but TIMEOUT_MAX_RETRIES=0 means it never reaches the
 * res.status check that normally opens the circuit via noteSupabaseOriginDown.
 * Without this, every independent caller (tab refocus, other devices,
 * invalidation) keeps landing on the same overloaded pool unthrottled
 * (2026-09-22 cascade: same id-list batch queries repeating every ~13-17s).
 */
export function isClientTimeoutError(error: { name?: string } | null | undefined): boolean {
  return error?.name === 'TimeoutError';
}

/**
 * Origin-level signal for a client-side TimeoutError. Request-level policy
 * (TIMEOUT_MAX_RETRIES = 0, no HTTP retry) stays separate — this only opens
 * the 45s circuit so later callers fail fast instead of hitting PostgREST.
 * Returns true when the circuit was opened by this error.
 */
export function noteSupabaseOriginDownIfClientTimeout(
  error: { name?: string } | null | undefined,
): boolean {
  if (!isClientTimeoutError(error)) return false;
  noteSupabaseOriginDown();
  return true;
}

export function resetSupabaseCircuit(): void {
  circuitOpenUntilMs = 0;
  halfOpenProbeInFlight = false;
}

export function supabaseCircuitOpenError(): Error {
  const err = new Error("Service Unavailable 503");
  err.name = "ServiceUnavailableError";
  (err as { status?: number }).status = 503;
  return err;
}

/** Cap parallel PostgREST/Storage GETs so a hub screen cannot open 20+ 12s holds at once. */
export const MAX_CONCURRENT_DATA_FETCHES = 6;
/** Extra waiters beyond in-flight. Overflow fails fast instead of stacking 12s holds. */
export const MAX_QUEUED_DATA_FETCHES = 12;

export function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Auth + table writes skip the gate so session refresh / indent create are not queued. */
export function shouldQueueDataFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): boolean {
  const url = requestUrlString(input);
  if (url.includes("/auth/v1/")) return false;
  const method = String(init?.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return true;
  // PostgREST RPCs are POST. Leaving them ungated let Get Load / Network
  // open dozens of 12s pool holds (get_mutual_connections, get_integrated_partners)
  // and exhausted PostgREST — PGRST003 / 15k 503s on 2026-09-22.
  if (method === "POST" && /\/rest\/v1\/rpc\//i.test(url)) return true;
  return false;
}

export function createConcurrencyGate(max: number, maxQueue = MAX_QUEUED_DATA_FETCHES) {
  let active = 0;
  const waiters: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    onAbort?: () => void;
    signal?: AbortSignal;
  }> = [];

  const abortError = (): Error => {
    const err = new Error("Request cancelled");
    err.name = "AbortError";
    return err;
  };

  return {
    get activeCount() {
      return active;
    },
    get queuedCount() {
      return waiters.length;
    },
    async acquire(signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) throw abortError();
      if (active < max) {
        active += 1;
        return;
      }
      if (waiters.length >= maxQueue) {
        metrics.queueRejects += 1;
        const err = new Error("Service Unavailable 503");
        err.name = "ServiceUnavailableError";
        (err as { status?: number }).status = 503;
        throw err;
      }
      await new Promise<void>((resolve, reject) => {
        const entry: (typeof waiters)[number] = { resolve, reject, signal };
        const onAbort = () => {
          const idx = waiters.indexOf(entry);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(abortError());
        };
        entry.onAbort = onAbort;
        waiters.push(entry);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
      active += 1;
    },
    release() {
      active = Math.max(0, active - 1);
      const next = waiters.shift();
      if (!next) return;
      if (next.signal && next.onAbort) {
        next.signal.removeEventListener("abort", next.onAbort);
      }
      next.resolve();
    },
  };
}

export const dataFetchConcurrencyGate = createConcurrencyGate(
  MAX_CONCURRENT_DATA_FETCHES,
  MAX_QUEUED_DATA_FETCHES,
);
