/**
 * Supabase client for React Native (Expo).
 * Session persistence: expo-secure-store on iOS/Android when the native module
 * is available (e.g. dev/production build); falls back to AsyncStorage on web or
 * when ExpoSecureStore is not available (e.g. some Expo Go). Same DB as pulse-unified-base.
 * RLS applies; do not use service_role key in the app.
 *
 * CONNECTION MODEL — important:
 * The JS SDK communicates over HTTPS (REST API via PostgREST + Auth + Storage).
 * It never opens a raw Postgres wire connection (port 5432 / 6543).
 * Supavisor Transaction Mode (port 6543) is for pg-wire tools ONLY:
 *   psql, pgAdmin, db migrations, Node.js `pg` driver, Edge Functions using pg.
 * Do NOT point EXPO_PUBLIC_SUPABASE_URL at port 6543 — it will break all REST calls.
 *
 * SINGLETON — this file exports one client instance created at first call.
 * Never call createClient() again elsewhere; import supabase() from this module.
 */
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { configurePlatformDb } from '@/lib/platform';
import { currentFetchAbortSignals } from '@/lib/supabaseAbort.util';
import {
  AUTH_TOKEN_MAX_RETRIES,
  FETCH_MAX_RETRIES,
  TIMEOUT_MAX_RETRIES,
  authTokenRetryDelayMs,
  canRetryFetchAttempt,
  dataFetchConcurrencyGate,
  admitSupabaseRequest,
  finishSupabaseCircuitProbe,
  isOriginDownHttpStatus,
  isRetryableHttpResponse,
  noteSupabaseHealthy,
  noteSupabaseOriginDown,
  noteSupabaseOriginDownIfClientTimeout,
  recordSupabaseHttp5xx,
  recordSupabaseHttpTimeout,
  retryDelayMs,
  shouldQueueDataFetch,
  supabaseCircuitOpenError,
} from '@/lib/supabaseHttp.util';
import {
  classifyRequest,
  moderate,
  recordOutcome,
  recordShapeViolation,
} from '@/lib/platform/moderator';

// Lazy-load SecureStore so we can fall back to AsyncStorage if native module is missing (Expo Go, etc.)
let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, guarded by try/catch
  SecureStore = require('expo-secure-store');
} catch {
  if (__DEV__) console.warn('[auth] SecureStore unavailable, falling back to AsyncStorage');
  SecureStore = null;
}

const REQUEST_TIMEOUT_MS = 12_000;
/** Writes (indent/trip insert) can wait on triggers; aborting them mid-commit looks like a failed create. */
const WRITE_REQUEST_TIMEOUT_MS = 20_000;

function requestTimeoutMs(init?: RequestInit): number {
  const method = String(init?.method ?? "GET").toUpperCase();
  if (
    method === "POST" ||
    method === "PATCH" ||
    method === "PUT" ||
    method === "DELETE"
  ) {
    return WRITE_REQUEST_TIMEOUT_MS;
  }
  return REQUEST_TIMEOUT_MS;
}
// /auth/v1/token (session refresh) gets its own retry policy with jitter.
// During a sustained DB/auth outage (see 2026-07-05 incident: clients retried
// refresh_token every 15-20s with no effective backoff, adding load while the
// backend was degraded), the default policy had no jitter, so many devices
// recovering together retried in lockstep.
//
// IMPORTANT: every caller of authService.refreshSession() wraps it in
// withTimeout(..., AUTH_TIMEOUT_MS) or withTimeout(..., AUTH_RESTORE_REFRESH_TIMEOUT_MS)
// (lib/authEngine.ts — 15s / 25s). withTimeout() aborts the scoped fetch
// when the deadline fires so abandoned HTTPS work does not keep holding
// PostgREST. Prefer the factory form so the request starts inside that scope.
function isAuthTokenRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.includes('/auth/v1/token');
}

// --- JWT-expiry recovery at the network frontier -----------------------------
// Data (PostgREST / RPC) calls that race ahead of the auto-refresh/SIGNED_OUT
// cycle fire with an already-expired JWT and get rejected — wasting a round-trip
// and adding 42501 log noise. We detect a *true expiry* response, trigger ONE
// deduped refresh, and retry the request once. We intentionally do NOT act on
// bare 42501 (permission) codes without an expiry string: those are legitimate
// cross-org RLS denials by a valid session and should return 403 immediately.
//
// Dead-session handling is deliberately left to GoTrue's SIGNED_OUT event, which
// AuthContext.onAuthStateChange already turns into clear-state + route-to-login +
// "expired" flash. We add NO second auth listener here (see the note at the end
// of getSupabase()).

/**
 * True when a 5xx body is a Postgres statement timeout (57014).
 *
 * PostgREST maps 57014 to HTTP 500, which used to be retried as transient.
 * It is not: the statement already ran to the timeout limit, so each
 * retry re-runs the same slow query and holds a pool connection for another full
 * timeout window. One 25s call becomes ~100s of pool hold across 4 attempts —
 * the amplifier behind the 2026-09-19 bootstrap incident. Retrying cannot help,
 * because nothing about the query gets faster on the second try.
 */
async function isStatementTimeoutResponse(res: Response): Promise<boolean> {
  if (res.status < 500) return false;
  try {
    const body = await res.clone().json();
    const code = String(body?.code ?? '');
    const msg = String(body?.message ?? '').toLowerCase();
    return (
      code === '57014' ||
      /canceling statement due to statement timeout/.test(msg)
    );
  } catch {
    return false;
  }
}

/** True only for genuine token-expiry responses — not for plain permission (42501) denials. */
async function isJwtExpiryResponse(res: Response): Promise<boolean> {
  if (res.status !== 401 && res.status !== 403) return false;
  try {
    const body = await res.clone().json();
    const code = body?.code ?? body?.error_code;
    const msg = String(body?.message ?? body?.msg ?? body?.error_description ?? '').toLowerCase();
    // PGRST301 = PostgREST "JWT expired". GoTrue/PostgREST also surface expiry as text.
    // Bare 42501 (RLS/permission) is excluded unless it carries an expiry string.
    return (
      code === 'PGRST301' ||
      /jwt expired|token (has )?expired|token.*expired|invalid (jwt|token)|jwt.*invalid/.test(msg)
    );
  } catch {
    return false;
  }
}

// Dedupe concurrent refreshes so a burst of expired requests triggers ONE refresh.
let inflightAuthRecovery: Promise<boolean> | null = null;
/** Refresh the session at most once for a burst of racing callers. Returns true if a live session was obtained. */
function recoverAuthOnce(): Promise<boolean> {
  if (!inflightAuthRecovery) {
    inflightAuthRecovery = (async () => {
      try {
        const { data, error } = await supabase().auth.refreshSession();
        // false → session is truly dead; GoTrue fires SIGNED_OUT and AuthContext handles it.
        return !error && !!data.session;
      } catch {
        return false;
      } finally {
        // Release on the next tick so tightly-racing callers share this attempt,
        // but a subsequent, later expiry can start a fresh recovery.
        setTimeout(() => {
          inflightAuthRecovery = null;
        }, 0);
      }
    })();
  }
  return inflightAuthRecovery;
}

function isAbortLike(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: string }).name ?? '';
  const msg = error instanceof Error ? error.message : String(error);
  return (
    name === 'AbortError' ||
    name === 'CanceledError' ||
    name === 'TimeoutError' ||
    /Aborted|Request timed out|Request cancelled/i.test(msg)
  );
}

function toTimeoutError(): Error {
  const err = new Error('Request timed out');
  err.name = 'TimeoutError';
  return err;
}

function toCancelError(): Error {
  const err = new Error('Request cancelled');
  err.name = 'AbortError';
  return err;
}

/** Fetch with timeout and retry to cope with flaky networks and backend outages. */
async function fetchWithTimeoutAndRetryRaw(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const isAuthToken = isAuthTokenRequest(input);
  const maxRetries = isAuthToken ? AUTH_TOKEN_MAX_RETRIES : FETCH_MAX_RETRIES;
  const delayForAttempt = isAuthToken ? authTokenRetryDelayMs : retryDelayMs;
  const doFetch = (signal?: AbortSignal): Promise<Response> => {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs(init));
    const combinedSignal = signal
      ? abortSignalAny(controller.signal, signal)
      : controller.signal;
    const merged: RequestInit = {
      ...init,
      signal: combinedSignal,
    };
    return fetch(input, merged)
      .catch((e) => {
        if (signal?.aborted) throw toCancelError();
        if (timedOut || isAbortLike(e)) throw toTimeoutError();
        throw e instanceof Error ? e : new Error(String(e));
      })
      .finally(() => clearTimeout(timeoutId));
  };
  const scoped = [init?.signal, ...currentFetchAbortSignals()].filter(
    (s): s is AbortSignal => !!s,
  );
  const requestSignal =
    scoped.length === 0
      ? undefined
      : scoped.length === 1
        ? scoped[0]
        : abortSignalAny(...scoped);

  const queued = shouldQueueDataFetch(input, init);
  const admission = isAuthToken ? 'allow' : admitSupabaseRequest();
  if (admission === 'reject') {
    throw supabaseCircuitOpenError();
  }
  if (queued) {
    await dataFetchConcurrencyGate.acquire(requestSignal);
  }
  try {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Same request already holds the half-open probe; do not re-admit.
        const res = await doFetch(requestSignal);
        if (res.ok) {
          if (admission === 'probe') finishSupabaseCircuitProbe(true);
          else noteSupabaseHealthy();
        } else if (isOriginDownHttpStatus(res.status)) {
          recordSupabaseHttp5xx(res.status);
          if (admission === 'probe') finishSupabaseCircuitProbe(false);
          else noteSupabaseOriginDown();
        } else if (admission === 'probe') {
          finishSupabaseCircuitProbe(true);
        }
        if (
          isRetryableHttpResponse(res) &&
          attempt < maxRetries &&
          !(await isStatementTimeoutResponse(res))
        ) {
          await new Promise((r) => setTimeout(r, delayForAttempt(attempt)));
          continue;
        }
        // JWT-expiry recovery: on the FIRST attempt of a non-auth request, if the
        // response is a true token-expiry, refresh once (deduped) and retry once so
        // the SDK re-sends with the rotated token. attempt===0 + single continue
        // bounds this to exactly one extra attempt — no loop. Never runs for
        // /auth/v1/token requests, so refreshSession() cannot recurse into itself.
        if (!isAuthToken && attempt === 0 && (await isJwtExpiryResponse(res))) {
          const recovered = await recoverAuthOnce();
          if (recovered) continue;
          // Not recovered → return the expiry response; GoTrue's SIGNED_OUT →
          // AuthContext does clear-state + route-to-login + "expired" flash.
        }
        return res;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (requestSignal?.aborted || lastError.name === 'AbortError') {
          throw lastError.name === 'AbortError' ? lastError : toCancelError();
        }
        if (!isAuthToken && noteSupabaseOriginDownIfClientTimeout(lastError)) {
          recordSupabaseHttpTimeout();
        }
        if (
          !canRetryFetchAttempt({
            attempt,
            maxRetries,
            timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
            error: lastError,
          })
        ) {
          throw lastError;
        }
        await new Promise((r) => setTimeout(r, delayForAttempt(attempt)));
      }
    }
    throw lastError ?? new Error('Network request failed');
  } finally {
    if (queued) dataFetchConcurrencyGate.release();
  }
}

/**
 * Moderated entry point — the client's actual `global.fetch`.
 *
 * Wraps fetchWithTimeoutAndRetryRaw (transport: timeouts, retries, the shared
 * origin circuit and concurrency gate) in the Requests Moderator, which governs
 * the request *stream* above it: per-device concurrency, priority lanes,
 * coalescing of duplicate reads and invalidation debouncing.
 *
 * The two layers are complementary, not competing — the transport decides
 * whether a single request should be retried or shed; the Moderator decides how
 * many run at once and in what order. It ships in observeOnly mode, where this
 * only records counters and behaviour is identical to calling the raw fn.
 *
 * Auth, storage and realtime bypass moderation entirely — queuing a token
 * refresh behind data reads is how a recovering client deadlocks.
 */
async function fetchWithTimeoutAndRetry(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const { lane, coalesceKey, violations, isAuth } = classifyRequest(input, init);

  if (isAuth) {
    return fetchWithTimeoutAndRetryRaw(input, init);
  }

  if (__DEV__ && violations.length > 0) {
    violations.forEach(recordShapeViolation);
  }

  return moderate(
    lane,
    async () => {
      const res = await fetchWithTimeoutAndRetryRaw(input, init);
      // Feed the circuit breaker: 5xx and statement timeouts mean the DB itself
      // is struggling, unlike a 4xx which is a client-side problem.
      recordOutcome(res.status >= 500);
      return res;
    },
    coalesceKey,
  );
}

/** Combine two AbortSignals so aborting either aborts the result. */
function abortSignalAny(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signals.forEach((s) => {
    if (s.aborted) abort();
    else s.addEventListener('abort', abort);
  });
  return controller.signal;
}

/** SecureStore byte limit (exceeding causes warnings / failure). Use AsyncStorage for larger values. */
const SECURE_STORE_MAX_BYTES = 2048;

function byteLength(str: string): number {
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(str, 'utf8');
  try {
    return new TextEncoder().encode(str).length;
  } catch {
    return str.length * 2;
  }
}

/** Auth storage: SecureStore when value ≤2KB; else AsyncStorage. No in-memory state so session survives Metro reload. */
function createAuthStorage(): {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
} {
  if (Platform.OS === 'web') {
    return AsyncStorage;
  }
  if (!SecureStore) {
    return AsyncStorage;
  }

  let useAsyncStorageForAll = false;

  return {
    getItem: async (key: string) => {
      if (useAsyncStorageForAll) return AsyncStorage.getItem(key);

      try {
        const secureValue = await SecureStore!.getItemAsync(key);
        if (secureValue !== null) return secureValue;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/native module|ExpoSecureStore|not found/i.test(msg)) {
          useAsyncStorageForAll = true;
        } else if (__DEV__) {
          console.warn('[pulse] SecureStore read error:', msg);
        }
      }

      return AsyncStorage.getItem(key);
    },

    setItem: async (key: string, value: string) => {
      if (useAsyncStorageForAll) return AsyncStorage.setItem(key, value);

      if (byteLength(value) > SECURE_STORE_MAX_BYTES) {
        await SecureStore!.deleteItemAsync(key).catch(() => {});
        return AsyncStorage.setItem(key, value);
      }

      try {
        await AsyncStorage.removeItem(key).catch(() => {});
        return await SecureStore!.setItemAsync(key, value);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/native module|ExpoSecureStore|not found/i.test(msg)) {
          useAsyncStorageForAll = true;
          return AsyncStorage.setItem(key, value);
        }
        throw e;
      }
    },

    removeItem: async (key: string) => {
      if (!useAsyncStorageForAll) {
        await SecureStore!.deleteItemAsync(key).catch(() => {});
      }
      await AsyncStorage.removeItem(key).catch(() => {});
    },
  };
}

const extra = Constants.expoConfig?.extra as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
} | undefined;

// Prefer runtime-injected public env vars first (especially on web), then Expo extra.
// This avoids stale Expo extra manifests when Metro/browser cache lags behind .env edits.
function pickNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s) return s;
  }
  return undefined;
}
const envSupabaseUrl = pickNonEmpty(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.VITE_SUPABASE_URL);
const envSupabaseAnonKey = pickNonEmpty(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  process.env.VITE_SUPABASE_ANON_KEY
);
const extraSupabaseUrl = pickNonEmpty(extra?.supabaseUrl);
const extraSupabaseAnonKey = pickNonEmpty(extra?.supabaseAnonKey);

const supabaseUrl = pickNonEmpty(envSupabaseUrl, extraSupabaseUrl);
const supabaseAnonKey = pickNonEmpty(envSupabaseAnonKey, extraSupabaseAnonKey);

/** Use before any Supabase call to show a config screen instead of throwing or failing network. */
export function hasSupabaseConfig(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/** Base URL for the Supabase project (same as used by the client). Use for building Edge Function URLs. */
export function getSupabaseBaseUrl(): string | undefined {
  return supabaseUrl ?? undefined;
}

/** Anon key for the Supabase project. Use for Edge Function Authorization header so the gateway accepts the request; send user JWT in X-User-Token. */
export function getSupabaseAnonKey(): string | undefined {
  return supabaseAnonKey ?? undefined;
}

/** Fresh user access token for API/proxy calls. Call before each request that requires auth. Returns null if no session (user not signed in). */
export async function getAccessToken(): Promise<string | null> {
  // getSession() returns the locally cached token and triggers a background refresh
  // when it's near expiry (autoRefreshToken: true handles this). getUser() fires a
  // network request to /auth/v1/user on every call — unnecessary and adds Auth spike.
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export const SUPABASE_CONFIG_MISSING_MESSAGE =
  'Missing Supabase config. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env in the project root, then restart: npx expo start';

function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(SUPABASE_CONFIG_MISSING_MESSAGE);
  }
  if (__DEV__) {
    try {
      const host = new URL(supabaseUrl).hostname;
      const isLocal = host === '127.0.0.1' || host === 'localhost';
      console.log(`[pulse] Supabase DB: ${isLocal ? 'LOCAL (docker)' : 'CLOUD'} — ${host}`);
      if (envSupabaseUrl && extraSupabaseUrl && envSupabaseUrl !== extraSupabaseUrl) {
        console.warn('[pulse] Supabase source mismatch: preferring env over extra', {
          envSupabaseUrl,
          extraSupabaseUrl,
        });
      }
    } catch {
      console.warn('[pulse] Supabase URL invalid:', supabaseUrl?.slice(0, 50));
    }
  }
  // SecureStore when available (native build); else AsyncStorage (web or Expo Go without native module)
  const authStorage = createAuthStorage();


  const c = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // processLock avoids navigator Web Locks races (Strict Mode, parallel refresh).
      lock: processLock,
    },
    global: {
      fetch: fetchWithTimeoutAndRetry,
    },
    realtime: {
      // Heartbeat every 30s (default 15s) — halves keepalive traffic on mobile connections.
      // 30s is well within the 60s server-side idle timeout for Supabase Realtime.
      heartbeatIntervalMs: 30_000,
      // Reconnect after 250ms, 500ms, 1s, 2s, 4s, 8s, 16s (exponential, capped at 30s).
      // Default starts at 1s which is fine; we push it slightly faster at the start.
      reconnectAfterMs: (tries: number) =>
        Math.min(250 * Math.pow(2, tries), 30_000),
    },
  });

  // Auth error recovery is handled entirely by AuthContext.onAuthStateChange.
  // A global TOKEN_REFRESHED handler here would race with AuthContext and cause
  // spurious sign-outs during normal token refresh cycles.

  return c;
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = getSupabase();
    configurePlatformDb(() => client);
  }
  return client;
}

export type { SupabaseClient };
