/**
 * Complete-history freshness. These tests use a real QueryClient and the same
 * functions the trip mutation, realtime handler, and garage refresh call.
 * They do not call the network.
 */
import { QueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { queryKeys } from "@/lib/queryKeys";
import {
  flushInvalidations,
  getInvalidationSchedulerMetrics,
  __resetInvalidationSchedulerForTests,
} from "@/lib/platform/moderator";
import { applyTripRealtimeEvent } from "@/lib/queries/useRealtimeInvalidation";
import {
  applyOptimisticTripStatus,
  invalidateGarageFinanceTripCaches,
  readTripCatalogSnapshots,
  rollbackOptimisticTripStatus,
} from "@/lib/queries/tripCatalogFreshness";
import { syncFinanceComplianceCaches } from "@/lib/queries/syncFinanceComplianceCaches";
import { patchAssignmentCaches } from "@/features/trips/utils/assignmentCachePatch.util";

jest.mock("@/features/finance/services/finance.service", () => ({
  toLedgerRow: (row: Record<string, unknown>) => row,
  getTripLedgerEmbed: async () => ({ error: null, embed: null }),
}));

jest.mock("@/lib/realtimeRegistry", () => ({
  subscribeSharedPostgresChanges: jest.fn(),
}));

jest.mock("@/lib/cache/cacheMetadataStore", () => ({
  clearDomainCacheMeta: jest.fn(() => Promise.resolve()),
}));

const orgId = "org-1";

type Trip = {
  id: string;
  status: string;
  client_price: number;
  supplier_rate: number;
  margin: number;
  amount_paid: number;
  payment_status: string;
  driver_id: string;
  vehicle_id: string;
  client_id: string;
  client_name: string;
  supplier_id: string | null;
  last_location_at: string | null;
  updated_at: string;
};

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "t1",
    status: "in_transit",
    client_price: 1000,
    supplier_rate: 700,
    margin: 300,
    amount_paid: 0,
    payment_status: "pending",
    driver_id: "d1",
    vehicle_id: "v1",
    client_id: "c1",
    client_name: "Acme",
    supplier_id: null,
    last_location_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-11-17T00:00:00Z",
    ...overrides,
  };
}

function payload(
  eventType: "INSERT" | "UPDATE" | "DELETE",
  newRow: Record<string, unknown> | null,
  oldRow: Record<string, unknown> | null = null,
): RealtimePostgresChangesPayload<Record<string, unknown>> {
  return {
    eventType,
    new: newRow ?? {},
    old: oldRow ?? {},
    schema: "public",
    table: "trips",
    commit_timestamp: "2026-11-17T00:00:00Z",
    errors: [],
  } as unknown as RealtimePostgresChangesPayload<Record<string, unknown>>;
}

function seed(qc: QueryClient) {
  const older = trip({ id: "t-old", client_price: 50, status: "completed" });
  const current = trip();
  qc.setQueryData(queryKeys.trips.finite(orgId), [current]);
  qc.setQueryData(queryKeys.trips.complete(orgId), [current, older]);
  qc.setQueryData(queryKeys.trips.compliance(orgId), [current]);
  return { current, older };
}

beforeEach(() => {
  __resetInvalidationSchedulerForTests();
});

describe("complete trip catalog freshness", () => {
  it("patches a financial edit into the complete history without refetching it", () => {
    const qc = new QueryClient();
    let fetches = 0;
    const older = trip({ id: "t-old", client_price: 50 });
    const initial = [trip(), older];
    qc.setQueryData(queryKeys.trips.complete(orgId), initial);
    qc.setQueryData(queryKeys.trips.finite(orgId), [trip()]);
    qc.setQueryDefaults(queryKeys.trips.complete(orgId), {
      queryFn: async () => {
        fetches += 1;
        return initial;
      },
    });

    applyTripRealtimeEvent(
      qc,
      orgId,
      payload(
        "UPDATE",
        trip({ client_price: 1800, supplier_rate: 900, margin: 900, updated_at: "2026-11-17T01:00:00Z" }),
        { id: "t1" },
      ),
    );

    const complete = qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))!;
    expect(complete).toHaveLength(2);
    expect(complete[0].client_price).toBe(1800);
    expect(complete[0].supplier_rate).toBe(900);
    expect(complete[0].margin).toBe(900);
    expect(complete[1]).toEqual(older);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.finite(orgId))).toHaveLength(1);
    expect(qc.getQueryState(queryKeys.trips.complete(orgId))?.isInvalidated).toBe(false);
    expect(fetches).toBe(0);
  });

  it("patches a status edit into complete history and compliance", () => {
    const qc = new QueryClient();
    seed(qc);
    applyTripRealtimeEvent(
      qc,
      orgId,
      payload("UPDATE", trip({ status: "completed", updated_at: "2026-11-17T01:00:00Z" }), { id: "t1" }),
    );
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))![0].status).toBe("completed");
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.compliance(orgId))![0].status).toBe("completed");
    expect(qc.getQueryState(queryKeys.trips.complete(orgId))?.isInvalidated).toBe(false);
  });

  it("patches a driver and vehicle assignment into complete history only", () => {
    const qc = new QueryClient();
    seed(qc);
    const finiteBefore = qc.getQueryData<Trip[]>(queryKeys.trips.finite(orgId));
    patchAssignmentCaches(qc, {
      tripId: "t1",
      organizationId: orgId,
      patch: { driverId: "d2", vehicleId: "v2", driverDisplayName: "Ravi" },
    });
    const complete = qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))!;
    expect(complete[0].driver_id).toBe("d2");
    expect(complete[0].vehicle_id).toBe("v2");
    expect(complete).toHaveLength(2);
    expect(complete).not.toBe(finiteBefore);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.finite(orgId))).toHaveLength(1);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.compliance(orgId))![0].driver_id).toBe("d2");
  });

  it("does not refetch or rewrite complete history on a GPS ping", () => {
    const qc = new QueryClient();
    const { current } = seed(qc);
    const completeBefore = qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId));
    for (let i = 0; i < 25; i += 1) {
      applyTripRealtimeEvent(
        qc,
        orgId,
        payload(
          "UPDATE",
          trip({ last_location_at: `2026-11-17T00:00:${String(i).padStart(2, "0")}Z` }),
          { id: "t1" },
        ),
      );
    }
    flushInvalidations();
    expect(qc.getQueryData(queryKeys.trips.complete(orgId))).toBe(completeBefore);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))![0]).toEqual(current);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.finite(orgId))![0].last_location_at).toBe(
      "2026-11-17T00:00:24Z",
    );
    expect(qc.getQueryState(queryKeys.trips.complete(orgId))?.isInvalidated).toBe(false);
    expect(getInvalidationSchedulerMetrics().flushes).toBe(0);
  });

  it("marks the complete catalog stale on a garage refresh without copying the finite list", () => {
    const qc = new QueryClient();
    seed(qc);
    const completeBefore = qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId));
    invalidateGarageFinanceTripCaches(qc, orgId);
    expect(qc.getQueryState(queryKeys.trips.complete(orgId))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKeys.trips.finite(orgId))?.isInvalidated).toBe(true);
    expect(qc.getQueryData(queryKeys.trips.complete(orgId))).toEqual(completeBefore);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))).toHaveLength(2);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.finite(orgId))).toHaveLength(1);
  });

  it("never writes the finite list over the complete list", () => {
    const qc = new QueryClient();
    seed(qc);
    const completeBefore = qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId));
    qc.setQueryData(queryKeys.trips.finite(orgId), [trip({ client_price: 1 })]);
    expect(qc.getQueryData(queryKeys.trips.complete(orgId))).toBe(completeBefore);

    applyTripRealtimeEvent(
      qc,
      orgId,
      payload("UPDATE", trip({ last_location_at: "2026-11-17T01:00:00Z" }), { id: "t1" }),
    );

    const complete = qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))!;
    expect(complete).toBe(completeBefore);
    expect(complete.map((row) => row.id)).toEqual(["t1", "t-old"]);
    expect(complete[0].client_price).toBe(1000);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.finite(orgId))!.map((row) => row.id)).toEqual(["t1"]);
  });

  it("rolls a failed status edit back on the complete catalog only", () => {
    const qc = new QueryClient();
    seed(qc);
    const previous = readTripCatalogSnapshots<Trip>(qc, orgId, "t1");
    applyOptimisticTripStatus(qc, orgId, "t1", { status: "completed" });
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))![0].status).toBe("completed");
    rollbackOptimisticTripStatus(qc, orgId, "t1", previous, "completed");
    const complete = qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))!;
    expect(complete[0].status).toBe("in_transit");
    expect(complete[0].client_price).toBe(1000);
    expect(complete.map((row) => row.id)).toEqual(["t1", "t-old"]);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.finite(orgId))![0].status).toBe("in_transit");
  });

  it("ignores an older realtime price and does not insert a missing trip", () => {
    const qc = new QueryClient();
    seed(qc);
    const completeBefore = qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId));
    applyTripRealtimeEvent(
      qc,
      orgId,
      payload(
        "UPDATE",
        trip({ client_price: 5, updated_at: "2026-11-16T00:00:00Z" }),
        { id: "t1" },
      ),
    );
    applyTripRealtimeEvent(
      qc,
      orgId,
      payload(
        "UPDATE",
        trip({ id: "t-new", client_price: 9, updated_at: "2026-11-17T02:00:00Z" }),
        { id: "t-new" },
      ),
    );
    expect(qc.getQueryData(queryKeys.trips.complete(orgId))).toBe(completeBefore);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))!.map((row) => row.id)).toEqual([
      "t1",
      "t-old",
    ]);
  });

  it("keeps a newer status when an older edit fails", () => {
    const qc = new QueryClient();
    seed(qc);
    const first = readTripCatalogSnapshots<Trip>(qc, orgId, "t1");
    applyOptimisticTripStatus(qc, orgId, "t1", { status: "loading" });
    applyOptimisticTripStatus(qc, orgId, "t1", { status: "in_transit" });
    rollbackOptimisticTripStatus(qc, orgId, "t1", first, "loading");
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))![0].status).toBe("in_transit");
  });

  it("collapses a burst of trip-linked payment syncs into one complete refetch", () => {
    const qc = new QueryClient();
    seed(qc);
    for (let i = 0; i < 8; i += 1) {
      syncFinanceComplianceCaches({
        queryClient: qc,
        organizationId: orgId,
        tripId: "t1",
      });
    }
    expect(getInvalidationSchedulerMetrics().flushes).toBe(0);
    flushInvalidations();
    expect(getInvalidationSchedulerMetrics().flushes).toBe(1);
    expect(qc.getQueryState(queryKeys.trips.complete(orgId))?.isInvalidated).toBe(true);
    expect(qc.getQueryData<Trip[]>(queryKeys.trips.complete(orgId))).toHaveLength(2);
  });
});
