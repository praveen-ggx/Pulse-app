import {
  AUTH_TOKEN_MAX_RETRIES,
  FETCH_MAX_RETRIES,
  TIMEOUT_MAX_RETRIES,
  canRetryFetchAttempt,
  retryDelayMs,
} from "@/lib/supabaseHttp.util";

describe("supabaseRetry policy", () => {
  it("caps fetch retries at 2 extra attempts (3 total)", () => {
    expect(FETCH_MAX_RETRIES).toBe(2);
    expect(AUTH_TOKEN_MAX_RETRIES).toBe(2);
    expect(TIMEOUT_MAX_RETRIES).toBe(0);
  });

  it("does not retry timeouts or aborts", () => {
    const timeout = new Error("Request timed out");
    timeout.name = "TimeoutError";
    const abort = new Error("Request cancelled");
    abort.name = "AbortError";
    expect(
      canRetryFetchAttempt({
        attempt: 0,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: timeout,
      }),
    ).toBe(false);
    expect(
      canRetryFetchAttempt({
        attempt: 0,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: abort,
      }),
    ).toBe(false);
  });

  it("retries transient network errors only within the cap", () => {
    const err = new Error("Network request failed");
    expect(
      canRetryFetchAttempt({
        attempt: 0,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: err,
      }),
    ).toBe(true);
    expect(
      canRetryFetchAttempt({
        attempt: 2,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: err,
      }),
    ).toBe(false);
  });

  it("uses exponential backoff with jitter", () => {
    expect(retryDelayMs(1, () => 0.5)).toBe(2_000);
    expect(retryDelayMs(2, () => 0.5)).toBe(4_000);
    const low = retryDelayMs(1, () => 0);
    const high = retryDelayMs(1, () => 1);
    expect(low).toBeLessThan(2_000);
    expect(high).toBeGreaterThan(2_000);
  });
});
