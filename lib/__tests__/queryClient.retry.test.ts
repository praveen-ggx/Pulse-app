// lib/queryClient.ts transitively imports lib/crashReporter.ts -> @sentry/react-native,
// which jest can't transform (ESM). Mock the logger so this file loads in isolation —
// shouldRetryQuery itself has no runtime dependency on it.
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

import {
  makeQueryClient,
  shouldRetryQuery,
  shouldSkipOriginUnavailableLog,
} from "@/lib/queryClient";
import {
  noteSupabaseOriginDown,
  noteSupabaseOriginDownIfTransportFailure,
  resetSupabaseCircuit,
} from "@/lib/supabaseHttp.util";

describe("shouldRetryQuery", () => {
  afterEach(() => {
    resetSupabaseCircuit();
  });

  it("retries a client queue reject once (not an origin 503)", () => {
    const err = new Error("Supabase request queue is full");
    err.name = "SupabaseQueueRejectedError";
    expect(shouldRetryQuery(0, err)).toBe(true);
    expect(shouldRetryQuery(1, err)).toBe(false);
  });

  it("retries a plain transient error once", () => {
    expect(shouldRetryQuery(0, new Error("network blip"))).toBe(true);
  });

  it("does not retry after the first failure (retry: 1 semantics preserved)", () => {
    expect(shouldRetryQuery(1, new Error("network blip"))).toBe(false);
    expect(shouldRetryQuery(2, new Error("network blip"))).toBe(false);
  });

  it("does not retry an aborted/cancelled request", () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    expect(shouldRetryQuery(0, abortError)).toBe(false);
    const cancelled = new Error("Request cancelled");
    cancelled.name = "AbortError";
    expect(shouldRetryQuery(0, cancelled)).toBe(false);
  });

  it("does not retry a Postgres statement timeout (57014)", () => {
    expect(
      shouldRetryQuery(0, { message: "canceling statement due to statement timeout", code: "57014" }),
    ).toBe(false);
  });

  it("does not retry a plain 'timed out' message", () => {
    const timeout = new Error("Request timed out");
    timeout.name = "TimeoutError";
    expect(shouldRetryQuery(0, timeout)).toBe(false);
    expect(shouldRetryQuery(0, new Error("Request timed out"))).toBe(false);
  });

  it("does not retry a permanent Storage 400 / object not found", () => {
    expect(shouldRetryQuery(0, { status: 400, message: "Object not found" })).toBe(false);
    expect(shouldRetryQuery(0, { status: 404, message: "not found" })).toBe(false);
  });

  it("does not retry HTTP 500 (PostgREST Warp / pool exhaustion)", () => {
    expect(shouldRetryQuery(0, { message: "Internal Server Error", status: 500 })).toBe(false);
  });

  it("does not retry origin-down 503 / 504 / 521 / 57P03", () => {
    expect(shouldRetryQuery(0, { message: "Service Unavailable", status: 503 })).toBe(false);
    expect(shouldRetryQuery(0, { message: "Gateway Timeout", status: 504 })).toBe(false);
    expect(shouldRetryQuery(0, new Error("error code 521: web server is down"))).toBe(false);
    expect(
      shouldRetryQuery(0, { message: "the database system is not accepting connections", code: "57P03" }),
    ).toBe(false);
  });

  it("does not treat JWT/auth failures as origin-down retries to suppress", () => {
    // Auth errors are not origin-down; with failureCount 0 they still get one retry
    // under the default policy (same as other non-timeout, non-abort errors).
    expect(shouldRetryQuery(0, { message: "JWT expired", code: "PGRST301" })).toBe(true);
    expect(shouldRetryQuery(0, new Error("Invalid login credentials"))).toBe(true);
  });

  it("does not stack a TanStack retry on 522 — fetch owns that one proxy retry", () => {
    expect(shouldRetryQuery(0, new Error("Connection timed out (522)"))).toBe(false);
    expect(shouldRetryQuery(0, { status: 429, message: "Too Many Requests" })).toBe(false);
  });

  it("still does not retry origin-down when status is 503 even if message says timed out", () => {
    expect(
      shouldRetryQuery(0, { message: "Connection timed out", status: 503 }),
    ).toBe(false);
  });

  it("does not retry after Safari Load failed opens the circuit", () => {
    expect(noteSupabaseOriginDownIfTransportFailure(new Error("Load failed"))).toBe(true);
    expect(shouldRetryQuery(0, new Error("Load failed"))).toBe(false);
  });

  it("does not retry a PostgREST 544 body", () => {
    expect(shouldRetryQuery(0, new Error("JSON could not be generated (544)"))).toBe(false);
  });

  it("does not retry a missing suppliers.primary_region column (42703)", () => {
    expect(
      shouldRetryQuery(0, {
        code: "42703",
        message: 'column "primary_region" of relation "suppliers" does not exist',
      }),
    ).toBe(false);
    expect(
      shouldRetryQuery(0, {
        code: "PGRST204",
        message: "Could not find the 'beneficiary_name' column of 'entity_bank_accounts' in the schema cache",
      }),
    ).toBe(false);
  });

  it("does not retry storage.objects RLS denial (42501)", () => {
    expect(
      shouldRetryQuery(0, {
        code: "42501",
        message: "permission denied for table storage.objects",
      }),
    ).toBe(false);
    expect(
      shouldRetryQuery(0, {
        message: "new row violates row-level security policy for table \"storage.objects\"",
      }),
    ).toBe(false);
  });

  it("does not retry any error while the origin-down circuit is open", () => {
    noteSupabaseOriginDown();
    expect(shouldRetryQuery(0, new Error("network blip"))).toBe(false);
    expect(shouldRetryQuery(0, {})).toBe(false);
  });

  it("does not run invalidateQueries while the circuit is open (refocus / cache bust)", async () => {
    const client = makeQueryClient();
    const queryFn = jest.fn().mockResolvedValue({ ok: true });
    await client.fetchQuery({ queryKey: ["q", "trips", "org-1"], queryFn });
    expect(queryFn).toHaveBeenCalledTimes(1);

    noteSupabaseOriginDown();
    await client.invalidateQueries({ queryKey: ["q", "trips", "org-1"] });
    await Promise.resolve();
    expect(queryFn).toHaveBeenCalledTimes(1);
    client.clear();
  });
});

describe("shouldSkipOriginUnavailableLog", () => {
  afterEach(() => {
    resetSupabaseCircuit();
  });

  it("skips the client circuit ServiceUnavailableError", () => {
    const err = new Error("Service Unavailable 503");
    err.name = "ServiceUnavailableError";
    expect(shouldSkipOriginUnavailableLog(err)).toBe(true);
  });

  it("still allows a first genuine origin 504 to be logged", () => {
    expect(
      shouldSkipOriginUnavailableLog({ message: "Gateway Timeout", status: 504 }),
    ).toBe(false);
  });

  it("skips origin-down noise once the circuit is already open", () => {
    noteSupabaseOriginDown();
    expect(
      shouldSkipOriginUnavailableLog({ message: "Service Unavailable", status: 503 }),
    ).toBe(true);
  });
});
