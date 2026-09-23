/**
 * Auth engine — pure state machine + helpers for auth context.
 *
 * Separates "what state are we in" from React wiring.
 * The provider is a thin adapter around this engine.
 */
import type { AuthProfile, AuthUser } from "@/features/auth/services/auth.service";
import { captureMessage } from "@/lib/crashReporter";
import { runWithFetchAbortScope } from "@/lib/supabaseAbort.util";

// ---------------------------------------------------------------------------
// AuthStatus — single source of truth replaces loading + sessionExpired
// ---------------------------------------------------------------------------

export type AuthStatus =
  | "restoring"
  | "authenticated"
  | "unauthenticated"
  | "expired";

// ---------------------------------------------------------------------------
// AuthState — the full state snapshot
// ---------------------------------------------------------------------------

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  profile: UserProfile | null;
  roleVerified: boolean;
}

export const INITIAL_AUTH_STATE: AuthState = {
  status: "restoring",
  user: null,
  profile: null,
  roleVerified: false,
};

// ---------------------------------------------------------------------------
// UserProfile — public profile shape exposed to consumers
// ---------------------------------------------------------------------------

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "user" | "driver";
  aggregated?: boolean;
  asset?: boolean;
  full_name?: string;
  avatar_url?: string;
  avatar_seed?: string;
  phone?: string;
  company_name?: string;
  status_text?: string;
}

// ---------------------------------------------------------------------------
// Typed auth errors — callers get a code for tailored UI (retry vs. generic)
// ---------------------------------------------------------------------------

export type AuthErrorCode =
  | "NETWORK_TIMEOUT"
  | "PROFILE_VERIFICATION_FAILED"
  | "SESSION_EXPIRED"
  | "FORCED_SIGN_OUT"
  | "CIRCUIT_BREAKER_TRIPPED"
  | "UNKNOWN";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Profile mapping & comparison
// ---------------------------------------------------------------------------

export function authProfileToUserProfile(p: AuthProfile): UserProfile {
  return {
    uid: p.uid,
    email: p.email,
    displayName: p.displayName,
    role: p.role,
    aggregated: p.aggregated ?? true,
    asset: p.asset ?? true,
    full_name: p.full_name,
    avatar_url: p.avatar_url,
    avatar_seed: p.avatar_seed,
    phone: p.phone,
    company_name: p.company_name,
    status_text: p.status_text,
  };
}

export function areUserProfilesEqual(
  a: UserProfile | null,
  b: UserProfile | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.uid === b.uid &&
    a.email === b.email &&
    a.displayName === b.displayName &&
    a.role === b.role &&
    a.aggregated === b.aggregated &&
    a.asset === b.asset &&
    a.full_name === b.full_name &&
    a.avatar_url === b.avatar_url &&
    a.avatar_seed === b.avatar_seed &&
    a.phone === b.phone &&
    a.company_name === b.company_name &&
    a.status_text === b.status_text
  );
}

/**
 * Merge auth metadata profile with DB profile.
 *
 * Precedence:
 * - identity fields (uid, email): always from auth
 * - profile fields (avatar, phone, etc.): DB wins when non-null
 * - status/role: DB is source of truth
 */
export function mergeAuthProfiles(
  base: AuthProfile,
  db: AuthProfile | null,
): AuthProfile {
  if (!db) return freezeInDev(base);
  const merged = {
    ...base,
    ...db,
    avatar_url: db.avatar_url ?? base.avatar_url,
    avatar_seed: db.avatar_seed ?? base.avatar_seed,
    status_text: db.status_text ?? base.status_text,
    company_name: db.company_name ?? base.company_name,
    phone: db.phone ?? base.phone,
    full_name: db.full_name ?? base.full_name,
    displayName: db.displayName || base.displayName,
  };
  return freezeInDev(merged);
}

/**
 * Freeze profile in dev to catch accidental mutation.
 */
export function freezeInDev<T extends object>(obj: T): T {
  if (__DEV__) Object.freeze(obj);
  return obj;
}

// ---------------------------------------------------------------------------
// In-memory log buffer (dev) — dump via shake gesture or dev menu
// ---------------------------------------------------------------------------

export interface AuthLogEntry {
  ts: number;
  severity: LogSeverity;
  event: string;
  details: Record<string, unknown>;
}

const DEV_LOG_BUFFER_MAX = 200;
let devLogBuffer: AuthLogEntry[] = [];

/** Read all buffered auth log entries (dev only, empty in prod). */
export function getAuthLogBuffer(): readonly AuthLogEntry[] {
  return devLogBuffer;
}

/** Clear the in-memory log buffer. */
export function clearAuthLogBuffer(): void {
  devLogBuffer = [];
}

// ---------------------------------------------------------------------------
// Structured logging with severity
// ---------------------------------------------------------------------------

export type LogSeverity = "info" | "warn" | "error";

export function logAuth(
  event: string,
  details: Record<string, unknown> = {},
  severity: LogSeverity = "info",
) {
  const ts = Date.now();
  const payload = { event, ...details, scope: "auth_guard", ts };

  if (__DEV__) {
    const fn = severity === "error" ? console.error
      : severity === "warn" ? console.warn
      : console.info;
    fn(`[AuthGuard] ${event}`, details);

    devLogBuffer.push({ ts, severity, event, details });
    if (devLogBuffer.length > DEV_LOG_BUFFER_MAX) {
      devLogBuffer = devLogBuffer.slice(-DEV_LOG_BUFFER_MAX);
    }
    return;
  }

  // Production: error/warn only — funnel through the crash reporter.
  if (severity === "error") {
    console.error("[AuthGuard]", payload);
    captureMessage(`[AuthGuard] ${event}`, "error", payload);
  } else if (severity === "warn") {
    console.warn("[AuthGuard]", payload);
    captureMessage(`[AuthGuard] ${event}`, "warning", payload);
  }
}

export function logAuthError(
  event: string,
  err: unknown,
  extra: Record<string, unknown> = {},
) {
  const message = err instanceof Error ? err.message : String(err);
  logAuth(event, { error: message, ...extra }, "error");
}

/** Map unknown failures to a typed AuthError for UI and monitoring. */
export function authErrorFromUnknown(
  err: unknown,
  code: AuthErrorCode = "UNKNOWN",
): AuthError {
  if (err instanceof AuthError) return err;
  if (err instanceof TimeoutError) {
    return new AuthError("NETWORK_TIMEOUT", err.message, err);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AuthError(code, message || code, err);
}

// ---------------------------------------------------------------------------
// Dev invariant — fail hard in dev, fail soft (log + continue) in prod
// ---------------------------------------------------------------------------

export function assertAuthInvariant(
  condition: boolean,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (condition) return;
  if (__DEV__) {
    console.error(`[AuthGuard] INVARIANT VIOLATION: ${message}`, context);
  }
  logAuth("invariant_violation", { message, ...context }, "error");
}

// ---------------------------------------------------------------------------
// Dev toggles — simulate failure paths without clearing Keychain/localStorage
// ---------------------------------------------------------------------------

declare const global: typeof globalThis & {
  __FORCE_EXPIRED_SESSION__?: boolean;
};

export function isForceExpiredSessionEnabled(): boolean {
  if (!__DEV__) return false;
  try {
    return global.__FORCE_EXPIRED_SESSION__ === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Timeout utility with jitter
// ---------------------------------------------------------------------------

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Identity-independent TimeoutError check. `instanceof` is unreliable here: this
 * module is reachable from more than one lazily-loaded web chunk, so a rejection
 * created in one chunk can fail `instanceof` against the class in another. That
 * made a benign sign-out timeout log at error level (GX-PULSE-10).
 */
export function isTimeoutError(e: unknown): e is Error {
  if (e instanceof TimeoutError) return true;
  const name = (e as { name?: unknown } | null)?.name;
  if (name === "TimeoutError") return true;
  const message = (e as { message?: unknown } | null)?.message;
  return typeof message === "string" && /^Operation timed out after \d+ms$/.test(message);
}

/**
 * Race work against a timeout and abort the underlying HTTPS request.
 * Prefer the factory form so the fetch starts inside the abort scope:
 *   withTimeout((signal) => supabase().rpc(..., { abortSignal: signal }), 15_000)
 * Passing an already-started Promise still aborts the scope for later
 * retries, but cannot cancel a fetch that already left the client.
 */
export async function withTimeout<T>(
  work: Promise<T> | ((signal: AbortSignal) => Promise<T>),
  ms: number,
  { jitter = true }: { jitter?: boolean } = {},
): Promise<T> {
  const controller = new AbortController();
  const jitterMs = jitter ? Math.random() * 500 : 0;
  const deadline = ms + jitterMs;

  return runWithFetchAbortScope(controller.signal, () => {
    const promise = typeof work === "function" ? work(controller.signal) : work;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        reject(new TimeoutError(ms));
      }, deadline);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  });
}

/** Default timeout for network-bound auth operations (getSession, refreshSession, getProfile). */
export const AUTH_TIMEOUT_MS = 15_000;
/** Cold-start refresh — align with lib/supabase fetch timeout (25s) + one retry window. */
export const AUTH_RESTORE_REFRESH_TIMEOUT_MS = 25_000;
/** Timeout for profile verification (may chain getProfile + provision + re-fetch). */
export const PROFILE_VERIFY_TIMEOUT_MS = 45_000;
/** Skip restore-time getUser() when access token has more than this TTL remaining. */
export const AUTH_SESSION_FRESH_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Circuit breaker — suppress forced sign-out loops when backend is down
// ---------------------------------------------------------------------------

const CIRCUIT_BREAKER_WINDOW_MS = 60_000;
const CIRCUIT_BREAKER_MAX_TRIPS = 3;

let circuitBreakerHits: number[] = [];

/**
 * Returns true if forced sign-outs are happening too frequently,
 * indicating the backend profile service may be down.
 */
export function isCircuitBreakerTripped(): boolean {
  const now = Date.now();
  circuitBreakerHits = circuitBreakerHits.filter(
    (t) => now - t < CIRCUIT_BREAKER_WINDOW_MS,
  );
  return circuitBreakerHits.length >= CIRCUIT_BREAKER_MAX_TRIPS;
}

export function recordCircuitBreakerHit(): void {
  circuitBreakerHits.push(Date.now());
}

export function resetCircuitBreaker(): void {
  circuitBreakerHits = [];
}
