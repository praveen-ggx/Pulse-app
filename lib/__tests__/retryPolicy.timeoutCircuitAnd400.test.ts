/**
 * Retry architecture: timeouts, overlapping callers, circuit-open,
 * permanent 400/not-found, and bounded transient 5xx recovery.
 */
import { shouldRetryQuery } from "@/lib/queryClient";
import { infrastructureShouldRetry } from "@/lib/queryRetry";
import {
  canRetryFetchAttempt,
  FETCH_MAX_RETRIES,
  isRetryableHttpResponse,
  isRetryableStorageError,
  noteSupabaseOriginDown,
  resetSupabaseCircuit,
  TIMEOUT_MAX_RETRIES,
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

  it("does not retry a Postgres statement timeout", () => {
    const err = { message: "canceling statement due to statement timeout", code: "57014" };
    expect(shouldRetryQuery(0, err)).toBe(false);
    expect(infrastructureShouldRetry(0, err)).toBe(false);
  });
});

describe("concurrent duplicate request evaluation", () => {
  it("all overlapping callers refuse a 400 not-found", () => {
    const err = { status: 400, message: "Object not found" };
    const decisions = [0, 1, 2].map(() => ({
      query: shouldRetryQuery(0, err),
      infra: infrastructureShouldRetry(0, err),
      storage: isRetryableStorageError(err.message),
    }));
    expect(decisions.every((d) => !d.query && !d.infra && !d.storage)).toBe(true);
  });

  it("all overlapping callers refuse retries after a 5xx opens the circuit", () => {
    noteSupabaseOriginDown();
    const blip = new Error("network blip");
    const decisions = [0, 1, 2].map(() => ({
      query: shouldRetryQuery(0, blip),
      fetch: canRetryFetchAttempt({
        attempt: 0,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: blip,
      }),
      storage: isRetryableStorageError("gateway timeout"),
    }));
    expect(decisions.every((d) => !d.query && !d.fetch && !d.storage)).toBe(true);
  });
});

describe("circuit-open behavior", () => {
  it("does not retry timeouts or 5xx while the circuit is open", () => {
    noteSupabaseOriginDown();
    expect(shouldRetryQuery(0, timeoutError())).toBe(false);
    expect(shouldRetryQuery(0, { message: "Internal Server Error", status: 500 })).toBe(false);
    expect(shouldRetryQuery(0, { message: "Service Unavailable", status: 503 })).toBe(false);
    expect(isRetryableHttpResponse(http(503))).toBe(false);
    expect(isRetryableHttpResponse(http(504))).toBe(false);
  });
});

describe("permanent 400 / not-found", () => {
  it("does not retry JSON or HTML 400/404", () => {
    expect(isRetryableHttpResponse(http(400, "application/json"))).toBe(false);
    expect(isRetryableHttpResponse(http(400, "text/html"))).toBe(false);
    expect(isRetryableHttpResponse(http(404, "text/html"))).toBe(false);
    expect(shouldRetryQuery(0, { status: 400, message: "Object not found" })).toBe(false);
    expect(shouldRetryQuery(0, new Error("The resource was not found"))).toBe(false);
    expect(isRetryableStorageError("Object not found")).toBe(false);
  });
});

describe("transient 5xx recovery", () => {
  it("allows one bounded retry for Cloudflare 522, then stops", () => {
    const err = new Error("Connection timed out (522)");
    expect(isRetryableHttpResponse(http(522))).toBe(true);
    expect(shouldRetryQuery(0, err)).toBe(true);
    expect(shouldRetryQuery(1, err)).toBe(false);
    expect(infrastructureShouldRetry(0, err)).toBe(true);
    expect(infrastructureShouldRetry(1, err)).toBe(false);
    expect(
      canRetryFetchAttempt({
        attempt: 0,
        maxRetries: FETCH_MAX_RETRIES,
        timeoutMaxRetries: TIMEOUT_MAX_RETRIES,
        error: new Error("Network request failed"),
      }),
    ).toBe(true);
  });

  it("does not treat origin-down 5xx as recoverable retries", () => {
    expect(isRetryableHttpResponse(http(500))).toBe(false);
    expect(isRetryableHttpResponse(http(502))).toBe(false);
    expect(isRetryableHttpResponse(http(503))).toBe(false);
    expect(shouldRetryQuery(0, { message: "Bad Gateway", status: 502 })).toBe(false);
  });

  it("after the circuit resets, a 522 is eligible again", () => {
    noteSupabaseOriginDown();
    const err = new Error("Connection timed out (522)");
    expect(shouldRetryQuery(0, err)).toBe(false);
    resetSupabaseCircuit();
    expect(shouldRetryQuery(0, err)).toBe(true);
  });
});
