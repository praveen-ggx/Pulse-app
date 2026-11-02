/**
 * The half-open probe must always be given back. Before the fix, a probe that was
 * aborted, timed out or rejected from the request queue never settled, so
 * `halfOpenProbeInFlight` stayed true and every later request failed fast with
 * "Service Unavailable 503" until something called resetSupabaseCircuit().
 *
 * Also: a dead zone (device offline) must not open the shared origin circuit.
 */
import { fetchWithTimeoutAndRetryRawForTests as rawFetch } from "@/lib/supabase";
import {
  SUPABASE_CIRCUIT_COOLDOWN_MS,
  admitSupabaseRequest,
  isSupabaseCircuitOpen,
  noteSupabaseOriginDown,
  resetSupabaseCircuit,
  setSupabaseDeviceConnectivity,
} from "@/lib/supabaseHttp.util";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const URL_REST = "https://example.supabase.co/rest/v1/profiles?select=id";
const originalFetch = global.fetch;

function ok(): Response {
  return { ok: true, status: 200, headers: new Headers(), clone() { return this; }, text: async () => "[]", json: async () => [] } as unknown as Response;
}

/** Open the circuit and move past its cooldown, so the next request is the probe. */
function openPastCooldown() {
  const now = Date.now();
  jest.setSystemTime(now);
  noteSupabaseOriginDown();
  jest.setSystemTime(now + SUPABASE_CIRCUIT_COOLDOWN_MS + 1);
}

describe("supabase fetch wrapper: half-open probe always settles", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    resetSupabaseCircuit();
    setSupabaseDeviceConnectivity(null);
  });
  afterEach(() => {
    global.fetch = originalFetch;
    resetSupabaseCircuit();
    setSupabaseDeviceConnectivity(null);
    jest.useRealTimers();
  });

  it("an aborted probe leaves the circuit able to probe again", async () => {
    openPastCooldown();
    const controller = new AbortController();
    global.fetch = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const abort = () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          };
          // Like real fetch: an already-aborted signal rejects immediately.
          if (init?.signal?.aborted) abort();
          init?.signal?.addEventListener("abort", abort);
        }),
    ) as typeof fetch;

    const pending = rawFetch(URL_REST, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeDefined();

    // Not latched: the next caller is admitted as the probe, not rejected.
    expect(admitSupabaseRequest()).toBe("probe");
  });

  it("a timed-out probe leaves the circuit able to probe again", async () => {
    openPastCooldown();
    global.fetch = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const abort = () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          };
          // Like real fetch: an already-aborted signal rejects immediately.
          if (init?.signal?.aborted) abort();
          init?.signal?.addEventListener("abort", abort);
        }),
    ) as typeof fetch;

    const pending = rawFetch(URL_REST);
    const settled = pending.catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(60_000);
    const error = (await settled) as Error;
    expect(error.name).toBe("TimeoutError");

    expect(admitSupabaseRequest()).toBe("probe");
  });

  it("a successful probe closes the circuit", async () => {
    openPastCooldown();
    global.fetch = jest.fn(async () => ok()) as typeof fetch;
    await rawFetch(URL_REST);
    expect(isSupabaseCircuitOpen()).toBe(false);
  });

  it("a transport failure while the device is offline does not open the circuit", async () => {
    setSupabaseDeviceConnectivity(false);
    global.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as typeof fetch;

    await expect(rawFetch(URL_REST)).rejects.toMatchObject({ name: "DeviceOfflineError" });
    expect(isSupabaseCircuitOpen()).toBe(false);
    // Failed fast: no retries while offline.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("a transport failure with unknown connectivity still opens the circuit (unchanged)", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as typeof fetch;

    const settled = rawFetch(URL_REST).catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(30_000);
    await settled;
    expect(isSupabaseCircuitOpen()).toBe(true);
  });
});
