/**
 * Review gates for PR #47:
 * 1. Non-JSON 4xx (HTML/plain) are not retried by fetch or storage loops
 * 2. Circuit-open 503 is not treated as a transient higher-level retry
 * 3. 429/522: one fetch retry, no TanStack/storage stacking; concurrent callers
 *    stay bounded; a later request may retry after a genuine circuit reset
 */
import { shouldRetryQuery } from "@/lib/queryClient";
import { infrastructureShouldRetry } from "@/lib/queryRetry";
import {
  canRetryFetchAttempt,
  FETCH_MAX_RETRIES,
  isRetryableHttpResponse,
  isRetryableStorageError,
  maxRetriesForHttpResponse,
  noteSupabaseOriginDown,
  resetSupabaseCircuit,
  supabaseCircuitOpenError,
  TIMEOUT_MAX_RETRIES,
  TRANSIENT_PROXY_MAX_RETRIES,
} from "@/lib/supabaseHttp.util";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/lib/platform/scalability/queryCacheMetrics", () => ({
  recordInvalidateQueries: jest.fn(),
  recordInvalidationStorm: jest.fn(),
  recordRefetchQueries: jest.fn(),
  recordSetQueryData: jest.fn(),
}));

jest.mock("@/lib/hooks/appQueryGateState", () => ({
  isWithinAppQueryBootQuietPeriod: () => false,
}));

function http(status: number, contentType = "text/html"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) },
  } as unknown as Response;
}

function timeoutError(): Error {
  const err = new Error("Request timed out");
  err.name = "TimeoutError";
  return err;
}

afterEach(() => {
  resetSupabaseCircuit();
});

describe("1. non-JSON 4xx", () => {
  it("does not retry HTML or plain-text 400/404 at the fetch classifier", () => {
    expect(isRetryableHttpResponse(http(400, "text/html"))).toBe(false);
    expect(isRetryableHttpResponse(http(400, "text/plain"))).toBe(false);
    expect(isRetryableHttpResponse(http(404, "text/html"))).toBe(false);
    expect(isRetryableHttpResponse(http(404, "text/plain"))).toBe(false);
    expect(isRetryableHttpResponse(http(400, "application/json"))).toBe(false);
    expect(maxRetriesForHttpResponse(400)).toBe(0);
    expect(maxRetriesForHttpResponse(404)).toBe(0);
  });

  it("does not retry 400/404 messages in the outer storage loop", () => {
    expect(isRetryableStorageError("400 Bad Request")).toBe(false);
    expect(isRetryableStorageError("404 Not Found")).toBe(false);
    expect(isRetryableStorageError("<!doctype html> 404 Not Found")).toBe(false);
    expect(isRetryableStorageError("Object not found")).toBe(false);
  });
});

describe("2. circuit-open is not a transient higher-level retry", () => {
  it("does not retry the fail-fast ServiceUnavailableError at any wrapper", () => {
    const circuitErr = supabaseCircuitOpenError();
    expect(shouldRetryQuery(0, circuitErr)).toBe(false);
    expect(infrastructureShouldRetry(0, circuitErr)).toBe(false);
    expect(
      canRetryFetchAttempt({
        attempt: 0,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: circuitErr,
      }),
    ).toBe(false);
    expect(isRetryableStorageError(circuitErr.message)).toBe(false);
  });

  it("after noteSupabaseOriginDown, concurrent callers all refuse retries", () => {
    noteSupabaseOriginDown();
    const circuitErr = supabaseCircuitOpenError();
    const decisions = [0, 1, 2].map(() => ({
      query: shouldRetryQuery(0, circuitErr),
      infra: infrastructureShouldRetry(0, circuitErr),
      fetch: canRetryFetchAttempt({
        attempt: 0,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: circuitErr,
      }),
      storage: isRetryableStorageError("gateway timeout"),
    }));
    expect(decisions.every((d) => !d.query && !d.infra && !d.fetch && !d.storage)).toBe(
      true,
    );
  });
});

describe("3. bounded 429/522 recovery", () => {
  it("allows exactly one fetch-layer retry and no TanStack/storage stack", () => {
    expect(TRANSIENT_PROXY_MAX_RETRIES).toBe(1);
    expect(maxRetriesForHttpResponse(522)).toBe(1);
    expect(maxRetriesForHttpResponse(429)).toBe(1);
    expect(isRetryableHttpResponse(http(522))).toBe(true);
    expect(isRetryableHttpResponse(http(429))).toBe(true);
    expect(shouldRetryQuery(0, new Error("Connection timed out (522)"))).toBe(false);
    expect(shouldRetryQuery(0, { status: 429, message: "Too Many Requests" })).toBe(false);
    expect(infrastructureShouldRetry(0, new Error("Connection timed out (522)"))).toBe(false);
    expect(isRetryableStorageError("Connection timed out (522)")).toBe(false);
    expect(isRetryableStorageError("429 Too Many Requests")).toBe(false);
  });

  it("concurrent callers do not each schedule a TanStack 522 retry wave", () => {
    const err = new Error("Connection timed out (522)");
    const decisions = [0, 1, 2].map(() => shouldRetryQuery(0, err));
    expect(decisions).toEqual([false, false, false]);
  });

  it("a later request may retry 522 only after a genuine circuit reset", () => {
    noteSupabaseOriginDown();
    expect(isRetryableHttpResponse(http(522))).toBe(true);
    expect(shouldRetryQuery(0, new Error("Connection timed out (522)"))).toBe(false);
    expect(
      canRetryFetchAttempt({
        attempt: 0,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: new Error("Network request failed"),
      }),
    ).toBe(false);
    resetSupabaseCircuit();
    expect(maxRetriesForHttpResponse(522)).toBe(1);
    expect(
      canRetryFetchAttempt({
        attempt: 0,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: new Error("Network request failed"),
      }),
    ).toBe(true);
  });
});

describe("timeout handling", () => {
  it("does not retry a client TimeoutError at fetch or TanStack layers", () => {
    const err = timeoutError();
    expect(TIMEOUT_MAX_RETRIES).toBe(0);
    expect(
      canRetryFetchAttempt({
        attempt: 0,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: err,
      }),
    ).toBe(false);
    expect(shouldRetryQuery(0, err)).toBe(false);
    expect(infrastructureShouldRetry(0, err)).toBe(false);
  });
});
