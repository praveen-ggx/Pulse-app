/**
 * Covers the P2 #3 audit finding: markSelectedTripsHardCopyPodReceived and
 * executeLogIncomingPods each fanned out two unbounded Promise.all rounds
 * (per-trip mark-received writes, then per-trip log_activity RPCs) over a
 * user-selected batch of trips. Bounded to LOG_PODS_CONCURRENCY (3) via the
 * existing runWithConcurrencyLimit helper (features/trips/services/
 * tripDocumentLrPod.service.ts) already used for the same class of fan-out
 * elsewhere. These tests cover only the concurrency-limiting behavior.
 */
jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: mockRpc }),
}));
jest.mock("@/features/trips/services/tripDocumentLrPod.service", () => {
  const actual = jest.requireActual("@/features/trips/services/tripDocumentLrPod.service");
  return {
    ...actual,
    markTripHardCopyPodReceived: (...args: unknown[]) => mockMarkTripHardCopyPodReceived(...args),
  };
});

const mockRpc = jest.fn();
const mockMarkTripHardCopyPodReceived = jest.fn();

import { markSelectedTripsHardCopyPodReceived, executeLogIncomingPods } from "../logPods.service";
import type { LogPodsPayload } from "../logPods.service";

/** Tracks the maximum number of concurrently in-flight calls to a mocked async fn. */
function trackConcurrency<T>(impl: (...args: unknown[]) => Promise<T>) {
  let active = 0;
  let max = 0;
  const fn = jest.fn(async (...args: unknown[]) => {
    active++;
    max = Math.max(max, active);
    try {
      return await impl(...args);
    } finally {
      active--;
    }
  });
  return { fn, getMax: () => max };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockMarkTripHardCopyPodReceived.mockResolvedValue({ error: null });
});

describe("markSelectedTripsHardCopyPodReceived — bounded concurrency", () => {
  it("never runs more than 3 mark-received calls concurrently, and processes all trips", async () => {
    const tripIds = Array.from({ length: 10 }, (_, i) => `trip-${i}`);
    const { fn, getMax } = trackConcurrency(async () => {
      await delay(5);
      return { error: null };
    });
    mockMarkTripHardCopyPodReceived.mockImplementation(fn);

    const res = await markSelectedTripsHardCopyPodReceived({
      tripInternalIds: tripIds,
      receivedAt: "2026-01-01T00:00:00Z",
      method: "in_hand",
    });

    expect(res.error).toBeNull();
    expect(res.updatedCount).toBe(10);
    expect(fn).toHaveBeenCalledTimes(10);
    expect(getMax()).toBeLessThanOrEqual(3);
    expect(getMax()).toBeGreaterThan(0);
  });

  it("never runs more than 3 log_activity RPC calls concurrently, and issues one per trip", async () => {
    const tripIds = Array.from({ length: 8 }, (_, i) => `trip-${i}`);
    const { fn, getMax } = trackConcurrency(async () => {
      await delay(5);
      return { data: null, error: null };
    });
    mockRpc.mockImplementation(fn);

    await markSelectedTripsHardCopyPodReceived({
      tripInternalIds: tripIds,
      receivedAt: "2026-01-01T00:00:00Z",
      method: "courier",
      courierName: "DTDC",
    });

    expect(fn).toHaveBeenCalledTimes(8);
    expect(getMax()).toBeLessThanOrEqual(3);
  });

  it("preserves the existing behavior: a failed mark-received short-circuits before any log_activity call, reporting the first failure by input order", async () => {
    mockMarkTripHardCopyPodReceived.mockImplementation(async (id: string) => {
      if (id === "trip-1") return { error: new Error("boom-1") };
      if (id === "trip-2") return { error: new Error("boom-2") };
      return { error: null };
    });

    const res = await markSelectedTripsHardCopyPodReceived({
      tripInternalIds: ["trip-0", "trip-1", "trip-2"],
      receivedAt: "2026-01-01T00:00:00Z",
      method: "in_hand",
    });

    // Input-order "first error" semantics preserved (trip-1 precedes trip-2).
    expect(res.error?.message).toBe("boom-1");
    expect(res.updatedCount).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("Phase 4: routes courier/AWB metadata through the same authoritative markTripHardCopyPodReceived operation", async () => {
    await markSelectedTripsHardCopyPodReceived({
      tripInternalIds: ["trip-0"],
      receivedAt: "2026-01-01T00:00:00Z",
      method: "courier",
      courierName: "DTDC",
      trackingId: "AWB999",
    });
    expect(mockMarkTripHardCopyPodReceived).toHaveBeenCalledWith("trip-0", {
      courier: "DTDC",
      awbNumber: "AWB999",
      comment: null,
    });
  });

  it('Phase 4: an "in_hand" receipt still calls the same operation, with a courier label and no AWB', async () => {
    await markSelectedTripsHardCopyPodReceived({
      tripInternalIds: ["trip-0"],
      receivedAt: "2026-01-01T00:00:00Z",
      method: "in_hand",
    });
    expect(mockMarkTripHardCopyPodReceived).toHaveBeenCalledWith("trip-0", {
      courier: "In hand",
      awbNumber: null,
      comment: null,
    });
  });
});

describe("executeLogIncomingPods — bounded concurrency", () => {
  function payload(tripCount: number): LogPodsPayload {
    const selectedLRs: Record<string, string[]> = {};
    for (let i = 0; i < tripCount; i++) selectedLRs[`trip-${i}`] = [`LR-${i}`];
    return {
      selectedLRs,
      allTrips: [],
      courierValue: "custom",
      customCourierName: "",
      trackingId: "",
      dbCourierPartners: [],
      mappedAttachments: [],
      receivedAt: "2026-01-01T00:00:00Z",
    };
  }

  it("never runs more than 3 mark-received calls concurrently across a large selection", async () => {
    const { fn, getMax } = trackConcurrency(async () => {
      await delay(5);
      return { error: null };
    });
    mockMarkTripHardCopyPodReceived.mockImplementation(fn);

    const res = await executeLogIncomingPods(payload(12));

    expect(res.error).toBeNull();
    expect(fn).toHaveBeenCalledTimes(12);
    expect(getMax()).toBeLessThanOrEqual(3);
    expect(getMax()).toBeGreaterThan(0);
  });

  it("never runs more than 3 log_activity RPC calls concurrently, one per selected trip", async () => {
    const { fn, getMax } = trackConcurrency(async () => {
      await delay(5);
      return { data: null, error: null };
    });
    mockRpc.mockImplementation(fn);

    await executeLogIncomingPods(payload(9));

    expect(fn).toHaveBeenCalledTimes(9);
    expect(getMax()).toBeLessThanOrEqual(3);
  });

  it("preserves existing behavior: a mark-received failure still rejects before any log_activity call", async () => {
    mockMarkTripHardCopyPodReceived.mockImplementation(async (id: string) =>
      id === "trip-1" ? { error: new Error("update failed") } : { error: null },
    );

    const res = await executeLogIncomingPods(payload(3));

    expect(res.error?.message).toBe("update failed");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("Phase 4: routes courier/AWB metadata through the same authoritative markTripHardCopyPodReceived operation", async () => {
    const p = payload(1);
    // Non-"custom" courierValue with no matching dbCourierPartners entry ->
    // resolveCourierName() falls back to courierValue itself, avoiding the
    // ensureCustomCourierPartner() DB round-trip this test doesn't mock.
    p.courierValue = "BlueDart";
    p.trackingId = "AWB123";
    await executeLogIncomingPods(p);
    expect(mockMarkTripHardCopyPodReceived).toHaveBeenCalledWith("trip-0", {
      courier: "BlueDart",
      awbNumber: "AWB123",
    });
  });
});
