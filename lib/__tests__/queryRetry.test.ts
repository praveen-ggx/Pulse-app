import {
  infrastructureRetryDelay,
  infrastructureShouldRetry,
  isInfrastructureError,
  isOriginDownError,
} from "@/lib/queryRetry";

import { resetSupabaseCircuit } from "@/lib/supabaseHttp.util";

describe("queryRetry infrastructure policy", () => {
  afterEach(() => {
    resetSupabaseCircuit();
  });

  it("classifies origin-down messages", () => {
    expect(isOriginDownError({ message: "HTTP 503" })).toBe(true);
    expect(isOriginDownError(new Error("521 web server is down"))).toBe(true);
    expect(isOriginDownError({ message: "57P03 not accepting connections" })).toBe(true);
    expect(isOriginDownError(new Error("JWT expired"))).toBe(false);
  });

  it("does not retry origin-down", () => {
    expect(infrastructureShouldRetry(0, { message: "Service Unavailable 503" })).toBe(false);
    expect(infrastructureShouldRetry(0, new Error("error code 521"))).toBe(false);
    expect(infrastructureShouldRetry(0, { message: "Internal Server Error", status: 500 })).toBe(false);
    expect(infrastructureShouldRetry(0, { message: "Gateway Timeout", status: 504 })).toBe(false);
  });

  it("does not retry statement timeouts (message-shaped, not only TimeoutError name)", () => {
    expect(
      infrastructureShouldRetry(0, {
        message: "canceling statement due to statement timeout",
        code: "57014",
      }),
    ).toBe(false);
    const named = new Error("Request timed out");
    named.name = "TimeoutError";
    expect(infrastructureShouldRetry(0, named)).toBe(false);
  });

  it("retries a brief 522 once at TanStack layer with long backoff", () => {
    const err = new Error("Connection timed out (522)");
    expect(isInfrastructureError(err)).toBe(true);
    expect(infrastructureShouldRetry(0, err)).toBe(true);
    expect(infrastructureShouldRetry(1, err)).toBe(false);
    expect(infrastructureShouldRetry(2, err)).toBe(false);
    expect(infrastructureRetryDelay(0, () => 0.5)).toBe(15_000);
    expect(infrastructureRetryDelay(1, () => 0.5)).toBe(30_000);
    expect(infrastructureRetryDelay(2, () => 0.5)).toBe(60_000);
    expect(infrastructureRetryDelay(0, new Error('Gateway Timeout'))).toBeGreaterThanOrEqual(12_000);
    expect(infrastructureRetryDelay(0, new Error('Gateway Timeout'))).toBeLessThanOrEqual(18_000);
  });

  it("does not retry abort errors", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(infrastructureShouldRetry(0, abort)).toBe(false);
  });
});
