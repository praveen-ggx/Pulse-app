/**
 * Shared TanStack Query retry policy for Supabase / edge proxy failures.
 * Origin-down (503/521) is not retried — that was the 2026-09-18 client storm.
 * Other infra errors back off 15s → 30s → 60s (cap) so a brief 522 does not
 * pile onto a recovering Postgres.
 */

import { isOriginDownError as isOriginDownErrorShared } from '@/lib/supabaseHttp.util';

const INFRA_PATTERN =
  /522|521|520|500|502|503|504|429|timeout|timed out|network|fetch failed|gateway|connection|schema cache/i;

function errorMessage(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(error);
}

export function isInfrastructureError(error: unknown): boolean {
  if (!error) return false;
  return INFRA_PATTERN.test(errorMessage(error));
}

export function isOriginDownError(error: unknown): boolean {
  return isOriginDownErrorShared(error);
}

function isTimeoutErrorMessage(message: string): boolean {
  // Narrower than queryClient's historical timed-out regex: Cloudflare 522 bodies
  // say "Connection timed out" but are transient origin-proxy failures we still
  // want a bounded infrastructure retry for.
  if (/\b522\b/.test(message)) return false;
  return /\b57014\b|statement timeout|canceling statement due to|Request timed out/i.test(
    message,
  );
}

/** Max 2 attempts (initial + 1 retry). Fetch already does bounded HTTP retries;
 * keeping a second TanStack retry with long backoff without stacking 3× fetch cycles.
 * Origin-down and timeouts are not retried. */
export function infrastructureShouldRetry(failureCount: number, error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return false;
  if (isTimeoutErrorMessage(errorMessage(error))) return false;
  if (isOriginDownError(error)) return false;
  return failureCount < 1 && isInfrastructureError(error);
}

export function infrastructureRetryDelay(
  attemptIndex: number,
  randomOrError?: (() => number) | unknown,
): number {
  // TanStack Query calls retryDelay(failureCount, error). Tests may pass a
  // deterministic RNG as the second arg. Never invoke an Error as random().
  const random =
    typeof randomOrError === 'function'
      ? (randomOrError as () => number)
      : Math.random;
  const base = Math.min(60_000, 15_000 * 2 ** attemptIndex);
  const jitter = base * 0.2 * (random() * 2 - 1);
  return Math.round(base + jitter);
}
