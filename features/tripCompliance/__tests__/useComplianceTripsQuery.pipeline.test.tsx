/**
 * Phase 2 — hook-level guarantees of the Compliance pipeline query:
 *  - one stable pipeline query per org (trips `dataUpdatedAt` never re-keys it)
 *  - trips-list change / window focus never produce a loading state
 *  - focus refetch is incremental, not a full rebuild
 *  - Approve patches the cache: no pipeline refetch, no trips-catalog
 *    (`get_trips_for_org`) refetch or invalidation
 */
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import React from "react";

let mockOrgId = "org-a";
jest.mock("@/contexts/OrganizationContext", () => ({
  useOptionalOrganization: () => ({ currentOrganization: { id: mockOrgId } }),
}));

let mockUserId = "user-1";
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: mockUserId } }),
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

import { useComplianceChangeSync, useComplianceTripsQuery } from "@/features/tripCompliance/hooks/useComplianceTripsQuery";
import type { ComplianceTripInputs } from "@/features/tripCompliance/tripCompliance.types";
import type { TripRow } from "@/features/trips/services/trips.service";
import { queryKeys } from "@/lib/queryKeys";
import { patchCachedCompliancePod } from "@/lib/queries/hardCopyPodCache.util";

function trip(id: string, status = "delivered"): TripRow {
  return { id, organization_id: mockOrgId, status, driver_id: "d1", vehicle_id: null } as TripRow;
}

function inputsFor(trips: TripRow[]): ComplianceTripInputs[] {
  return trips.map((t) => ({
    trip: t,
    documents: [
      {
        id: `${t.id}-lr`,
        trip_id: t.id,
        document_type: "lr",
        file_name: "lr.pdf",
        storage_path: `${t.id}/lr/a.pdf`,
        uploaded_at: "2026-09-20",
        status: "pending",
        verified_by: null,
        verified_at: null,
        rejection_reason: null,
      },
    ],
    flags: null,
    taggedAdvance: null,
    balance: null,
    vehicleDocuments: [],
    driverDocuments: [],
    vaultVehicleId: null,
  }));
}

function setup(orgId: string, seed?: (qc: QueryClient) => void) {
  mockOrgId = orgId;
  const trips = [trip("t1"), trip("t2")];
  mockTripsState = { data: trips, dataUpdatedAt: 1 };
  mockLoad.mockImplementation(async () => inputsFor(trips));
  mockPatchForTrips.mockImplementation(async () => (cur: ComplianceTripInputs[]) => cur);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(qc);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const loadingHistory: boolean[] = [];
  const hook = renderHook(
    () => {
      const query = useComplianceTripsQuery();
      loadingHistory.push(query.isLoading);
      return { query, sync: useComplianceChangeSync() };
    },
    { wrapper },
  );
  const pipelineQueries = () => qc.getQueryCache().findAll({ queryKey: ["q", "tripCompliance", "pipeline"] });
  return { qc, hook, loadingHistory, pipelineQueries };
}

beforeEach(() => {
  mockLoad.mockReset();
  mockPatchForTrips.mockReset();
  mockTripsRefetch.mockReset();
});

it("trips-list change (new dataUpdatedAt) keeps ONE pipeline query and never shows loading", async () => {
  const { hook, loadingHistory, pipelineQueries } = setup("org-trips-change");
  await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
  const settledAt = loadingHistory.length;

  mockTripsState = { data: [trip("t1", "completed"), trip("t2")], dataUpdatedAt: 2 };
  hook.rerender({});
  await waitFor(() => expect(mockPatchForTrips).toHaveBeenCalled());
  expect(mockPatchForTrips.mock.calls[0][2]).toBe("org-trips-change");

  expect(pipelineQueries()).toHaveLength(1);
  expect(pipelineQueries()[0].queryKey).toEqual(queryKeys.tripCompliance.pipeline("org-trips-change"));
  expect(loadingHistory.slice(settledAt).every((loading) => loading === false)).toBe(true);
  expect(mockLoad).toHaveBeenCalledTimes(1); // no rebuild
  expect(mockLoad.mock.calls[0][2]).toEqual({ full: true, viewerOrgId: "org-trips-change" });
});

it("window focus refetch is incremental and shows no loading state", async () => {
  const { hook, loadingHistory, pipelineQueries } = setup("org-focus");
  await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
  const settledAt = loadingHistory.length;

  const realNow = Date.now;
  jest.spyOn(Date, "now").mockImplementation(() => realNow() + 3 * 60_000); // past staleTime (2 min)
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
  (Date.now as jest.Mock).mockRestore();
  focusManager.setFocused(undefined);

  expect(mockLoad.mock.calls[1][2]).toEqual({ full: false, viewerOrgId: "org-focus" });
  expect(mockLoad.mock.calls[1][0]).toHaveLength(2); // previous inputs handed in → incremental
  expect(pipelineQueries()).toHaveLength(1);
  expect(loadingHistory.slice(settledAt).every((loading) => loading === false)).toBe(true);
});

it("trip-document Approve patches the cache: no pipeline or trips-catalog refetch/invalidation", async () => {
  const { qc, hook } = setup("org-approve");
  await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
  const invalidate = jest.spyOn(qc, "invalidateQueries");
  const before = hook.result.current.query.summaries;

  await act(async () => {
    await hook.result.current.sync({
      type: "tripDocumentDecision",
      tripId: "t1",
      documentId: "t1-lr",
      status: "verified",
      actorId: "u1",
    });
  });

  await waitFor(() => expect(hook.result.current.query.summaries[0].documents[0].status).toBe("verified"));
  const after = hook.result.current.query.summaries;
  expect(after[1]).toBe(before[1]); // untouched trip keeps its summary object
  expect(mockLoad).toHaveBeenCalledTimes(1);
  expect(mockTripsRefetch).not.toHaveBeenCalled();
  const invalidatedKeys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  expect(invalidatedKeys).toEqual([JSON.stringify(queryKeys.tripCompliance.detail("org-approve", "t1"))]);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const approveT1 = {
  type: "tripDocumentDecision" as const,
  tripId: "t1",
  documentId: "t1-lr",
  status: "verified" as const,
  actorId: "u1",
};

describe("race: an older read resolving AFTER a local write never overwrites it", () => {
  it("pipeline refetch started before Approve", async () => {
    const { qc, hook } = setup("org-race-query");
    await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));

    const stale = deferred<ComplianceTripInputs[]>();
    mockLoad.mockImplementationOnce(() => stale.promise); // snapshot taken before the write
    let refetch!: Promise<unknown>;
    act(() => {
      refetch = qc.refetchQueries({ queryKey: queryKeys.tripCompliance.pipeline("org-race-query") });
    });
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));

    await act(async () => {
      await hook.result.current.sync(approveT1);
    });
    await act(async () => {
      stale.resolve(inputsFor([trip("t1"), trip("t2")])); // server snapshot still "pending"
      await refetch;
    });

    const cached = qc.getQueryData<ComplianceTripInputs[]>(queryKeys.tripCompliance.pipeline("org-race-query"));
    expect(cached?.[0].documents[0].status).toBe("verified");
    expect(cached?.[1].documents[0].status).toBe("pending");
  });

  it("trips-list reconcile fetch started before Approve", async () => {
    const { qc, hook } = setup("org-race-reconcile");
    await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));

    const stalePatch = deferred<(cur: ComplianceTripInputs[]) => ComplianceTripInputs[]>();
    mockPatchForTrips.mockImplementationOnce(() => stalePatch.promise);
    mockTripsState = { data: [trip("t1", "completed"), trip("t2")], dataUpdatedAt: 2 };
    hook.rerender({});
    await waitFor(() => expect(mockPatchForTrips).toHaveBeenCalledTimes(1));

    await act(async () => {
      await hook.result.current.sync(approveT1);
    });
    const staleT1 = inputsFor([trip("t1", "completed")])[0];
    await act(async () => {
      stalePatch.resolve((cur) => cur.map((row) => (row.trip.id === "t1" ? staleT1 : row)));
    });

    const cached = qc.getQueryData<ComplianceTripInputs[]>(queryKeys.tripCompliance.pipeline("org-race-reconcile"));
    expect(cached?.[0].documents[0].status).toBe("verified");
  });
});

describe("persisted / hydrated cache", () => {
  it("hydrated data shows immediately (no loading) and the first mount runs a FULL read", async () => {
    const hydrated = inputsFor([trip("t1"), trip("t2")]);
    hydrated[0] = { ...hydrated[0], documents: [{ ...hydrated[0].documents[0], status: "rejected" }] };
    const { hook, loadingHistory } = setup("org-hydrated", (qc) => {
      qc.setQueryData(queryKeys.tripCompliance.pipeline("org-hydrated"), hydrated, { updatedAt: Date.now() - 60 * 60_000 });
    });
    expect(loadingHistory[0]).toBe(false);
    expect(hook.result.current.query.summaries[0].documents[0].status).toBe("rejected");
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
    expect(mockLoad.mock.calls[0][2]).toEqual({ full: true, viewerOrgId: "org-hydrated" });
    await waitFor(() => expect(hook.result.current.query.summaries[0].documents[0].status).toBe("pending"));
  });

  it("a different user of the same org gets its own full read", async () => {
    mockUserId = "user-A";
    const first = setup("org-shared");
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
    first.hook.unmount();
    mockLoad.mockClear();
    mockUserId = "user-B";
    const second = setup("org-shared");
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
    expect(mockLoad.mock.calls[0][2]).toEqual({ full: true, viewerOrgId: "org-shared" });
    second.hook.unmount();
    mockUserId = "user-1";
  });
});

describe("race: writers outside the Phase 2 write log (lib hard-copy POD patch)", () => {
  const podFlags = (rows: ComplianceTripInputs[] | undefined, id: string) =>
    rows?.find((row) => row.trip.id === id)?.flags?.pod_received_at ?? null;

  it("a POD patch landing while an older pipeline read is in flight survives that read", async () => {
    const { qc, hook } = setup("org-race-pod");
    await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
    const key = queryKeys.tripCompliance.pipeline("org-race-pod");

    const stale = deferred<ComplianceTripInputs[]>();
    mockLoad.mockImplementationOnce(() => stale.promise);
    let refetch!: Promise<unknown>;
    act(() => {
      refetch = qc.refetchQueries({ queryKey: key });
    });
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));

    act(() => {
      qc.setQueriesData({ queryKey: ["q", "tripCompliance"] }, (old) =>
        patchCachedCompliancePod(old, "t1", {
          received: true,
          receivedAt: "2026-09-29T10:00:00.000Z",
          courier: "BlueDart",
          awbNumber: "AWB1",
          receivedBy: "Ravi",
        }),
      );
    });
    expect(podFlags(qc.getQueryData(key), "t1")).toBe("2026-09-29T10:00:00.000Z");

    await act(async () => {
      stale.resolve(inputsFor([trip("t1"), trip("t2")])); // snapshot from before the POD write
      await refetch;
    });
    expect(podFlags(qc.getQueryData(key), "t1")).toBe("2026-09-29T10:00:00.000Z");
  });

  it("rows only rebuilt by the trips-list reconcile do NOT block a fresher read", async () => {
    const { qc, hook } = setup("org-race-reconcile-fresh");
    await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
    const key = queryKeys.tripCompliance.pipeline("org-race-reconcile-fresh");

    const fresh = deferred<ComplianceTripInputs[]>();
    mockLoad.mockImplementationOnce(() => fresh.promise);
    let refetch!: Promise<unknown>;
    act(() => {
      refetch = qc.refetchQueries({ queryKey: key });
    });
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));

    mockPatchForTrips.mockImplementationOnce(async () => (cur: ComplianceTripInputs[]) =>
      cur.map((row) => (row.trip.id === "t1" ? { ...row, trip: { ...row.trip, status: "completed" } as TripRow } : row)),
    );
    mockTripsState = { data: [trip("t1", "completed"), trip("t2")], dataUpdatedAt: 3 };
    hook.rerender({});
    await waitFor(() => expect(mockPatchForTrips).toHaveBeenCalledTimes(1));

    const serverRows = inputsFor([trip("t1", "completed"), trip("t2")]);
    serverRows[0] = { ...serverRows[0], documents: [{ ...serverRows[0].documents[0], status: "verified" }] };
    await act(async () => {
      fresh.resolve(serverRows);
      await refetch;
    });
    expect(qc.getQueryData<ComplianceTripInputs[]>(key)?.[0].documents[0].status).toBe("verified");
  });
});

describe("manual refresh", () => {
  it("runs one FULL read even when tapped twice, and advances dataUpdatedAt", async () => {
    const { hook } = setup("org-manual-refresh");
    await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
    const before = hook.result.current.query.dataUpdatedAt;
    expect(before).toBeGreaterThan(0);

    const realNow = Date.now;
    jest.spyOn(Date, "now").mockImplementation(() => realNow() + 10_000);
    await act(async () => {
      const first = hook.result.current.query.refetch();
      const second = hook.result.current.query.refetch();
      await Promise.all([first, second]);
    });
    (Date.now as jest.Mock).mockRestore();

    expect(mockLoad).toHaveBeenCalledTimes(2); // initial + ONE manual refresh
    expect(mockLoad.mock.calls[1][2]).toEqual({ full: true, viewerOrgId: "org-manual-refresh" });
    expect(mockTripsRefetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(hook.result.current.query.dataUpdatedAt).toBeGreaterThan(before));
  });

  it("a failed refresh keeps the last successful time and the cached rows", async () => {
    const { hook } = setup("org-failed-refresh");
    await waitFor(() => expect(hook.result.current.query.summaries).toHaveLength(2));
    const before = hook.result.current.query.dataUpdatedAt;

    mockLoad.mockImplementationOnce(async () => {
      throw new Error("statement timeout");
    });
    await act(async () => {
      await hook.result.current.query.refetch();
    });

    await waitFor(() => expect(hook.result.current.query.isError).toBe(true));
    expect(hook.result.current.query.dataUpdatedAt).toBe(before);
    expect(hook.result.current.query.summaries).toHaveLength(2);
  });
});
