import {
  decodeHardCopyPodComment,
  encodeHardCopyPodComment,
  indexLrPodDocuments,
  isSoftPodDocumentType,
  receivedLrNumbersForTrip,
  resolveHardCopyPodStatus,
  vendorFreightBeforeIbond,
  tripHasHubPodFlag,
  tripPodIsReceived,
  tripPodStatusFlags,
  tripIsDeliveredStatus,
  tripMatchesCompletionFilter,
  runWithConcurrencyLimit,
} from "../tripDocumentLrPod.service";

/** Wraps a worker to record how many calls were in flight at once. */
function trackConcurrency<T, R>(worker: (item: T, index: number) => Promise<R>) {
  let active = 0;
  let maxActive = 0;
  const tracked = async (item: T, index: number): Promise<R> => {
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      return await worker(item, index);
    } finally {
      active--;
    }
  };
  return { tracked, getMaxActive: () => maxActive };
}

describe("runWithConcurrencyLimit", () => {
  it("Case A: 0 items resolves to an empty array without invoking the worker", async () => {
    const worker = jest.fn(async (x: number) => x);
    const result = await runWithConcurrencyLimit<number, number>([], 3, worker);
    expect(result).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it("Case B: 1-3 items may all run concurrently when limit >= item count", async () => {
    const { tracked, getMaxActive } = trackConcurrency(async (x: number) => {
      await Promise.resolve();
      return x;
    });
    const result = await runWithConcurrencyLimit([1, 2, 3], 3, tracked);
    expect(result).toEqual([1, 2, 3]);
    expect(getMaxActive()).toBe(3);
  });

  it("Case C: 4-6 items never exceed the concurrency limit of 3", async () => {
    const { tracked, getMaxActive } = trackConcurrency(async (x: number) => {
      await Promise.resolve();
      await Promise.resolve();
      return x;
    });
    const result = await runWithConcurrencyLimit([1, 2, 3, 4, 5, 6], 3, tracked);
    expect(result).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getMaxActive()).toBe(3);
  });

  it("Case D: a large input (3000 items) never exceeds the concurrency limit of 3", async () => {
    const items = Array.from({ length: 3000 }, (_, i) => i);
    const { tracked, getMaxActive } = trackConcurrency(async (x: number) => {
      await Promise.resolve();
      return x;
    });
    const result = await runWithConcurrencyLimit(items, 3, tracked);
    expect(result).toEqual(items);
    expect(getMaxActive()).toBeLessThanOrEqual(3);
    expect(getMaxActive()).toBeGreaterThan(0);
  });

  it("Case E: a chunk whose worker catches its own error and returns a fallback does not stop the others — matches the existing per-chunk try/catch at every call site", async () => {
    const worker = async (item: number) => {
      if (item === 2) {
        // Mirrors loadLrPodIndexByTripIds / loadHubPodReceiptFlags: the real
        // Supabase error is caught inside the worker, which resolves with a
        // fallback instead of throwing.
        return -1;
      }
      return item;
    };
    const result = await runWithConcurrencyLimit([1, 2, 3], 3, worker);
    expect(result).toEqual([1, -1, 3]);
  });

  it("Case F: results preserve input order regardless of completion order", async () => {
    const delays = [30, 10, 20, 5];
    const worker = async (item: number, index: number) => {
      await new Promise((resolve) => setTimeout(resolve, delays[index]));
      return item;
    };
    const result = await runWithConcurrencyLimit([10, 20, 30, 40], 3, worker);
    expect(result).toEqual([10, 20, 30, 40]);
  });

  it("does not mutate the input array", async () => {
    const items = [1, 2, 3, 4, 5];
    const snapshot = [...items];
    await runWithConcurrencyLimit(items, 2, async (x: number) => x);
    expect(items).toEqual(snapshot);
  });
});

describe("indexLrPodDocuments", () => {
  it("maps lr document_number and pod presence by trip_id", () => {
    const index = indexLrPodDocuments([
      { trip_id: "t1", document_type: "lr", document_number: "101,102" },
      { trip_id: "t1", document_type: "pod", document_number: null },
      { trip_id: "t2", document_type: "lr", document_number: '{"lrNumber":"AB9"}' },
    ]);
    expect(index.get("t1")?.lrNumbers).toEqual(["101", "102"]);
    expect(index.get("t1")?.hasPodDocument).toBe(true);
    expect(index.get("t2")?.lrNumbers).toEqual(["AB9"]);
    expect(index.get("t2")?.hasPodDocument).toBe(false);
  });

  it("treats POD / soft_pod types as digital soft copy", () => {
    const index = indexLrPodDocuments([
      { trip_id: "T1", document_type: "POD" },
      { trip_id: "t2", document_type: "soft_pod" },
    ]);
    expect(index.get("t1")?.hasPodDocument).toBe(true);
    expect(index.get("t2")?.hasPodDocument).toBe(true);
    expect(isSoftPodDocumentType("pod_soft")).toBe(true);
    expect(isSoftPodDocumentType("lr")).toBe(false);
  });
});

describe("tripHasHubPodFlag", () => {
  it("matches Pulse POD trip ids case-insensitively", () => {
    const flags = new Set(["cf9bd120-5e8d-4694-9ce2-e558a46596fe"]);
    expect(
      tripHasHubPodFlag(flags, "CF9BD120-5E8D-4694-9CE2-E558A46596FE"),
    ).toBe(true);
    expect(tripHasHubPodFlag(flags, "missing")).toBe(false);
    expect(tripHasHubPodFlag(undefined, "cf9bd120-5e8d-4694-9ce2-e558a46596fe")).toBe(
      false,
    );
  });
});

describe("tripPodIsReceived / receivedLrNumbersForTrip", () => {
  it("treats pod_received_at as trip-level received", () => {
    expect(tripPodIsReceived({ pod_received_at: "2026-09-10T00:00:00Z" })).toBe(
      true,
    );
    expect(tripPodIsReceived({ pod_received_at: null })).toBe(false);
  });

  it("fills received LRs when the trip has a POD document or received timestamp", () => {
    const lrs = ["A1", "A2"];
    expect(
      receivedLrNumbersForTrip(lrs, {
        tripReceived: true,
        hasPodDocument: false,
      }),
    ).toEqual(lrs);
    expect(
      receivedLrNumbersForTrip(lrs, {
        tripReceived: false,
        hasPodDocument: true,
      }),
    ).toEqual(lrs);
    expect(
      receivedLrNumbersForTrip(lrs, {
        tripReceived: false,
        hasPodDocument: false,
      }),
    ).toEqual([]);
  });
});

describe("tripIsDeliveredStatus", () => {
  it("is true only for delivered/completed/done", () => {
    expect(tripIsDeliveredStatus("delivered")).toBe(true);
    expect(tripIsDeliveredStatus("completed")).toBe(true);
    expect(tripIsDeliveredStatus("in_transit")).toBe(false);
    expect(tripIsDeliveredStatus("assigned", "DELIVERED")).toBe(true);
    expect(tripIsDeliveredStatus("in_progress", "IN TRANSIT")).toBe(false);
  });
});

describe("tripMatchesCompletionFilter", () => {
  it("all keeps every trip; completed/not_completed split on delivery", () => {
    expect(tripMatchesCompletionFilter("all", "in_transit")).toBe(true);
    expect(tripMatchesCompletionFilter("completed", "completed")).toBe(true);
    expect(tripMatchesCompletionFilter("completed", "in_transit")).toBe(false);
    expect(tripMatchesCompletionFilter("not_completed", "in_transit")).toBe(
      true,
    );
    expect(tripMatchesCompletionFilter("not_completed", "delivered")).toBe(
      false,
    );
  });
});

describe("tripPodStatusFlags — independent soft vs hard POD", () => {
  it("covers all four combinations without conflating sources", () => {
    expect(
      tripPodStatusFlags({ hasPodDocument: false, pod_received_at: null }),
    ).toEqual({ softCopyReceived: false, hardCopyReceived: false });
    expect(
      tripPodStatusFlags({
        hasPodDocument: true,
        pod_received_at: null,
      }),
    ).toEqual({ softCopyReceived: true, hardCopyReceived: false });
    expect(
      tripPodStatusFlags({
        hasPodDocument: false,
        pod_received_at: "2026-09-11T00:00:00Z",
      }),
    ).toEqual({ softCopyReceived: false, hardCopyReceived: true });
    expect(
      tripPodStatusFlags({
        hasPodDocument: true,
        pod_received_at: "2026-09-11T00:00:00Z",
      }),
    ).toEqual({ softCopyReceived: true, hardCopyReceived: true });
  });
});

describe("resolveHardCopyPodStatus", () => {
  it("maps received / courier-in-transit / pending from existing trips columns", () => {
    expect(
      resolveHardCopyPodStatus({ pod_received_at: "2026-09-22T10:00:00Z" }),
    ).toBe("RECEIVED");
    expect(
      resolveHardCopyPodStatus({
        pod_received_at: null,
        pod_hard_copy_courier: "DHL",
        pod_hard_copy_awb_number: "AWB1",
      }),
    ).toBe("IN_TRANSIT");
    expect(
      resolveHardCopyPodStatus({
        pod_received_at: null,
        pod_hard_copy_courier: null,
        pod_hard_copy_awb_number: null,
      }),
    ).toBe("PENDING");
  });
});

describe("encodeHardCopyPodComment / decodeHardCopyPodComment", () => {
  it("round-trips structured person receipt metadata and keeps plain comments readable", () => {
    const encoded = encodeHardCopyPodComment({
      remarks: "At gate",
      receivedDate: "2026-09-22",
      receivedTime: "14:30",
      receiptMethod: "person",
    });
    expect(decodeHardCopyPodComment(encoded)).toEqual({
      remarks: "At gate",
      receivedDate: "2026-09-22",
      receivedTime: "14:30",
      receiptMethod: "person",
      dispatchDate: null,
      expectedDeliveryDate: null,
      ibond: false,
      ibondDeductibleCost: null,
      vendorCostBefore: null,
      vendorCostAfter: null,
    });
    expect(decodeHardCopyPodComment("Checked at gate")).toEqual({
      remarks: "Checked at gate",
      receivedDate: null,
      receivedTime: null,
      receiptMethod: null,
      dispatchDate: null,
      expectedDeliveryDate: null,
      ibond: false,
      ibondDeductibleCost: null,
      vendorCostBefore: null,
      vendorCostAfter: null,
    });
    const ibond = decodeHardCopyPodComment(
      encodeHardCopyPodComment({
        ibond: true,
        ibondDeductibleCost: 1500,
        vendorCostBefore: 57000,
        vendorCostAfter: 55500,
      }),
    );
    expect(ibond.ibond).toBe(true);
    expect(ibond.ibondDeductibleCost).toBe(1500);
    expect(ibond.vendorCostBefore).toBe(57000);
    expect(ibond.vendorCostAfter).toBe(55500);
    expect(ibond.vendorCostAfter).toBe(55500);
    expect(vendorFreightBeforeIbond({ supplier_rate: 57000, supplier_rate_basis: "per_trip" })).toBe(57000);
    expect(
      vendorFreightBeforeIbond({ supplier_rate: 57000, supplier_rate_basis: "per_trip" }),
    ).toBe(57000);
  });
});
