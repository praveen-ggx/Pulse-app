/**
 * Coverage for the two change types `ComplianceDetailsScreen.tsx` now drives
 * through `useComplianceChangeSync()` (verify, payment) instead of a manual
 * invalidate + refetch + separate Finance sync.
 *
 * This exercises the SHARED sync hook with realistic cache fixtures — it is
 * not a screen-level integration test (the screen itself still has no
 * render test). `fetchTripPaymentInputs` and `syncFinanceComplianceCaches`
 * are mocked at the module boundary so the assertions stay about cache
 * shape, not live network behavior.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import React from "react";

let mockOrgId = "org-detail";
jest.mock("@/contexts/OrganizationContext", () => ({
  useOptionalOrganization: () => ({ currentOrganization: { id: mockOrgId } }),
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" } }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: () => {
    throw new Error("unexpected Supabase call from the hook under test");
  },
}));

const mockTripsRefetch = jest.fn();
let mockTripsState: { data: unknown[]; dataUpdatedAt: number };
jest.mock("@/lib/queries/useTripsQuery", () => ({
  useComplianceTripCatalogQuery: () => ({
    data: mockTripsState.data,
    dataUpdatedAt: mockTripsState.dataUpdatedAt,
    isSuccess: true,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: mockTripsRefetch,
  }),
}));

const mockLoad = jest.fn();
const mockPatchForTrips = jest.fn();
jest.mock("@/features/tripCompliance/services/compliancePipelineSync.service", () => {
  const actual = jest.requireActual("@/features/tripCompliance/services/compliancePipelineSync.service");
  return {
    ...actual,
    loadCompliancePipelineInputs: (...args: unknown[]) => mockLoad(...args),
    patchForPipelineTrips: (...args: unknown[]) => mockPatchForTrips(...args),
  };
});

const mockFetchTripPaymentInputs = jest.fn();
jest.mock("@/features/tripCompliance/services/tripComplianceRead.service", () => {
  const actual = jest.requireActual("@/features/tripCompliance/services/tripComplianceRead.service");
  return {
    ...actual,
    fetchTripPaymentInputs: (...args: unknown[]) => mockFetchTripPaymentInputs(...args),
  };
});

const mockSyncFinanceComplianceCaches = jest.fn();
jest.mock("@/lib/queries/syncFinanceComplianceCaches", () => ({
  syncFinanceComplianceCaches: (...args: unknown[]) => mockSyncFinanceComplianceCaches(...args),
}));

import { useComplianceChangeSync, useComplianceTripsQuery } from "@/features/tripCompliance/hooks/useComplianceTripsQuery";
import type { ComplianceTripFlags, ComplianceTripInputs } from "@/features/tripCompliance/tripCompliance.types";
import type { TripRow } from "@/features/trips/services/trips.service";
import { queryKeys } from "@/lib/queryKeys";

const VERIFIED_FLAGS: ComplianceTripFlags = {
  compliance_verified_at: "2026-10-27T00:00:00Z",
  compliance_verified_by: "u0",
  compliance_decision: "approved",
  compliance_exception_reason: null,
  compliance_outstanding_summary: null,
  compliance_declined_at: null,
  compliance_declined_by: null,
  compliance_decline_reason: null,
  pod_hard_copy_courier: null,
  pod_hard_copy_awb_number: null,
  pod_hard_copy_received_by: null,
  pod_received_at: null,
};

function trip(id: string, amountPaid = 0): TripRow {
  return {
    id,
    organization_id: mockOrgId,
    status: "delivered",
    driver_id: "d1",
    vehicle_id: null,
    amount_paid: amountPaid,
    updated_at: "2026-10-01T00:00:00Z",
  } as TripRow;
}

function inputsFor(trips: TripRow[], verifiedIds: ReadonlySet<string> = new Set()): ComplianceTripInputs[] {
  return trips.map((t) => ({
    trip: t,
    documents: [],
    flags: verifiedIds.has(t.id) ? VERIFIED_FLAGS : null,
    taggedAdvance: null,
    balance: null,
    vehicleDocuments: [],
    driverDocuments: [],
    vaultVehicleId: null,
  }));
}

function setup(orgId: string, verifiedIds: ReadonlySet<string> = new Set()) {
  mockOrgId = orgId;
  const trips = [trip("t1"), trip("t2")];
  mockTripsState = { data: trips, dataUpdatedAt: 1 };
  // Mirror the real loadCompliancePipelineInputs contract (compliancePipelineSync.service.ts):
  // a non-"full" call must return `previous` unchanged, not fabricate fresh rows — otherwise a
  // real second queryFn run (React Query revalidating in the background) clobbers an
  // in-flight sync()'s patch with stale unpatched data, which is a test-mock gap, not
  // something the production incremental path does (it always merges onto `previous`).
  mockLoad.mockImplementation(async (previous: ComplianceTripInputs[] | undefined, _trips: unknown, opts: { full: boolean }) =>
    opts.full || !previous ? inputsFor(trips, verifiedIds) : previous,
  );
  mockPatchForTrips.mockImplementation(async () => (cur: ComplianceTripInputs[]) => cur);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => ({ query: useComplianceTripsQuery(), sync: useComplianceChangeSync() }),
    { wrapper },
  );
  return { qc, hook };
}

beforeEach(() => {
  mockLoad.mockReset();
  mockPatchForTrips.mockReset();
  mockTripsRefetch.mockReset();
  mockFetchTripPaymentInputs.mockReset();
  mockSyncFinanceComplianceCaches.mockReset();
});

describe("detail-screen verify (complianceVerified)", () => {
  it("patches the pipeline row, syncs Finance caches, and invalidates only this trip's detail key — no org-wide pipeline refetch", async () => {
    const { qc, hook } = setup("org-verify-detail");
    await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const mockLoadCallsBeforeSync = mockLoad.mock.calls.length;

    await act(async () => {
      await hook.result.current.sync({ type: "complianceVerified", tripId: "t1", actorId: "u1" });
    });

    await waitFor(() => expect(hook.result.current.query.summaries[0].complianceDecision).toBe("approved"));
    expect(hook.result.current.query.summaries[0].complianceVerifiedBy).toBe("u1");
    expect(hook.result.current.query.summaries[0].complianceVerifiedAt).toBeTruthy();
    // Untouched trip's summary is unaffected (confirms a patch, not a rebuild).
    expect(hook.result.current.query.summaries[1].complianceVerifiedAt).toBeNull();

    // sync() for an async change type (this one awaits patchForComplianceChange)
    // can race one extra background pipeline revalidation — preserveNewerWrites
    // (hook's write log) is what keeps the patch correct despite it, which this
    // test's assertions above already prove. The call count itself is not the
    // contract; it must not keep growing (no retry loop / no refetch() on top).
    expect(mockLoad.mock.calls.length - mockLoadCallsBeforeSync).toBeLessThanOrEqual(1);
    expect(mockTripsRefetch).not.toHaveBeenCalled();
    expect(mockSyncFinanceComplianceCaches).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-verify-detail", tripId: "t1", includeCompliance: false }),
    );
    // Exact-match, not "contains": this is the actual contract — only this
    // trip's detail key, plus the narrow Advance Processed key the hook
    // deliberately busts for verify/payment/decline (unrelated to and far
    // narrower than the org-wide pipeline key this whole fix exists to avoid
    // invalidating). The pipeline key must never appear here.
    const invalidatedKeys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(invalidatedKeys).toEqual([
      JSON.stringify(queryKeys.tripCompliance.detail("org-verify-detail", "t1")),
      JSON.stringify(["q", "tripCompliance", "advanceProcessed"]),
    ]);
    expect(invalidatedKeys).not.toContain(JSON.stringify(queryKeys.tripCompliance.pipeline("org-verify-detail")));
  });
});

describe("detail-screen payment", () => {
  it("re-reads server-confirmed amount_paid/advance/balance, syncs Finance caches, and invalidates only this trip's detail key — no org-wide pipeline refetch", async () => {
    // Payment is only reachable on an already-verified trip in the real app —
    // `advance` on the summary is gated on complianceVerifiedAt (see
    // summarizeComplianceTrip), so seed t1 verified to observe it surface.
    const { qc, hook } = setup("org-pay-detail", new Set(["t1"]));
    await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const mockLoadCallsBeforeSync = mockLoad.mock.calls.length;

    const serverAdvance = {
      amount: 5000,
      paymentMode: "UPI",
      utr: "UTR123",
      paidAt: "2026-10-28",
      actorId: "u1",
      transactionId: "txn-1",
    };
    mockFetchTripPaymentInputs.mockResolvedValue(
      new Map([
        [
          "t1",
          {
            taggedAdvance: serverAdvance,
            balance: null,
            tripFields: { amount_paid: 5000, updated_at: "2026-10-28T10:00:00Z" },
          },
        ],
      ]),
    );

    await act(async () => {
      await hook.result.current.sync({ type: "payment", tripId: "t1" });
    });

    await waitFor(() => expect(hook.result.current.query.summaries[0].advance).toEqual(serverAdvance));
    // amount_paid comes from the server read, not client arithmetic.
    expect(hook.result.current.query.summaries[0].trip.amount_paid).toBe(5000);
    expect(mockFetchTripPaymentInputs).toHaveBeenCalledWith(["t1"]);
    // Other trip's row is untouched.
    expect(hook.result.current.query.summaries[1].trip.amount_paid).toBe(0);
    expect(hook.result.current.query.summaries[1].advance).toBeNull();

    // See the verify test above for why this is <=1 extra, not ===0: an async
    // change type can race one background revalidation; preserveNewerWrites is
    // what keeps the result correct (proven by the assertions above this line).
    expect(mockLoad.mock.calls.length - mockLoadCallsBeforeSync).toBeLessThanOrEqual(1);
    expect(mockTripsRefetch).not.toHaveBeenCalled();
    expect(mockSyncFinanceComplianceCaches).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-pay-detail", tripId: "t1", includeCompliance: false }),
    );
    // See the verify test above: exact-match includes the narrow Advance
    // Processed key the hook deliberately busts; the org-wide pipeline key
    // (what this fix exists to avoid invalidating) must never appear.
    const invalidatedKeys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(invalidatedKeys).toEqual([
      JSON.stringify(queryKeys.tripCompliance.detail("org-pay-detail", "t1")),
      JSON.stringify(["q", "tripCompliance", "advanceProcessed"]),
    ]);
    expect(invalidatedKeys).not.toContain(JSON.stringify(queryKeys.tripCompliance.pipeline("org-pay-detail")));
  });

  it("a trip missing from fetchTripPaymentInputs' result leaves the pipeline row untouched (no false success)", async () => {
    const { hook } = setup("org-pay-miss");
    await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
    const before = hook.result.current.query.summaries[0];

    mockFetchTripPaymentInputs.mockResolvedValue(new Map()); // server returned nothing for this trip

    await act(async () => {
      await hook.result.current.sync({ type: "payment", tripId: "t1" });
    });

    // identity patch: same object, amount_paid did not silently flip to some
    // client-guessed value.
    expect(hook.result.current.query.summaries[0]).toBe(before);
    expect(hook.result.current.query.summaries[0].trip.amount_paid).toBe(0);
  });

  it("a thrown read falls back to invalidating the pipeline instead of applying a partial/incorrect patch", async () => {
    const { qc, hook } = setup("org-pay-error");
    await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    mockFetchTripPaymentInputs.mockRejectedValue(new Error("network down"));

    await act(async () => {
      await hook.result.current.sync({ type: "payment", tripId: "t1" });
    });

    const invalidatedKeys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(invalidatedKeys).toContain(JSON.stringify(queryKeys.tripCompliance.pipeline("org-pay-error")));
  });
});
