/**
 * Background (tail) load of the Compliance pipeline:
 *  - the first 40 trips paint, the rest load afterwards
 *  - a failed tail or reconcile is never silent: the hook reports an incomplete queue
 *  - retry reads only trips that still need inputs, once at a time
 *  - stale reads (older run, other org/session) never overwrite newer data
 *  - another org's rows are never this org's queue
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import React from "react";

let mockOrgId = "org-a";
jest.mock("@/contexts/OrganizationContext", () => ({
  useOptionalOrganization: () => ({ currentOrganization: { id: mockOrgId } }),
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "user-1" } }),
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

import { useComplianceTripsQuery } from "@/features/tripCompliance/hooks/useComplianceTripsQuery";
import type { ComplianceTripInputs } from "@/features/tripCompliance/tripCompliance.types";
import type { TripRow } from "@/features/trips/services/trips.service";
import { queryKeys } from "@/lib/queryKeys";

function trip(id: string, orgId = mockOrgId): TripRow {
  return { id, organization_id: orgId, status: "delivered", driver_id: "d1", vehicle_id: null } as TripRow;
}

function trips(count: number, prefix = "t"): TripRow[] {
  return Array.from({ length: count }, (_, i) => trip(`${prefix}${i}`));
}

function inputsFor(list: TripRow[], marker = "x"): ComplianceTripInputs[] {
  return list.map((t) => ({
    trip: t,
    documents: [
      {
        id: `${t.id}-lr`,
        trip_id: t.id,
        document_type: "lr",
        file_name: `${marker}.pdf`,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const HEAD = 40;

/** Reads of the first `HEAD` trips answer at once; every other read is held until the test settles it. */
function holdTails() {
  const held: Array<{ trips: TripRow[]; d: ReturnType<typeof deferred<ComplianceTripInputs[]>> }> = [];
  mockLoad.mockImplementation(async (_previous: unknown, list: TripRow[]) => {
    if (list.length <= HEAD && list.every((t) => t.id.startsWith("t") && Number(t.id.slice(1)) < HEAD)) {
      return inputsFor(list);
    }
    const d = deferred<ComplianceTripInputs[]>();
    held.push({ trips: list, d });
    return d.promise;
  });
  return held;
}

function setup(orgId: string, list: TripRow[], seed?: (qc: QueryClient) => void) {
  mockOrgId = orgId;
  mockTripsState = { data: list, dataUpdatedAt: 1 };
  mockPatchForTrips.mockImplementation(async () => (cur: ComplianceTripInputs[]) => cur);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(qc);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const history: boolean[] = [];
  const hook = renderHook(
    () => {
      const query = useComplianceTripsQuery();
      history.push(query.pipelineIncomplete);
      return query;
    },
    { wrapper },
  );
  return { qc, hook, history };
}

const ids = (rows: Array<{ trip: { id: string } }>) => rows.map((row) => row.trip.id);
const tripIds = (list: TripRow[]) => list.map((t) => t.id);

beforeEach(() => {
  mockLoad.mockReset();
  mockPatchForTrips.mockReset();
  mockTripsRefetch.mockReset();
});

describe("head then tail", () => {
  it("paints the first 40, then loads the rest: complete, unique ids", async () => {
    const held = holdTails();
    const { hook } = setup("org-ok", trips(100));
    await waitFor(() => expect(hook.result.current.summaries).toHaveLength(HEAD));
    expect(hook.result.current.pipelineIncomplete).toBe(true);
    expect(hook.result.current.pipelineLoadFailed).toBe(false);
    expect(hook.result.current.pipelineLoadedCount).toBe(HEAD);
    expect(hook.result.current.pipelineTotalCount).toBe(100);
    expect(hook.result.current.isError).toBe(false);

    await waitFor(() => expect(held).toHaveLength(1));
    expect(held[0].trips).toHaveLength(60);
    await act(async () => held[0].d.resolve(inputsFor(held[0].trips)));

    await waitFor(() => expect(hook.result.current.summaries).toHaveLength(100));
    expect(hook.result.current.pipelineIncomplete).toBe(false);
    expect(hook.result.current.pipelineLoadFailed).toBe(false);
    expect(new Set(ids(hook.result.current.summaries)).size).toBe(100);
  });

  it("a tail that repeats head trips never duplicates ids", async () => {
    const held = holdTails();
    const { hook } = setup("org-dupe", trips(100));
    await waitFor(() => expect(held).toHaveLength(1));
    await act(async () => held[0].d.resolve([...inputsFor(trips(5)), ...inputsFor(held[0].trips)]));
    await waitFor(() => expect(hook.result.current.summaries).toHaveLength(100));
    expect(new Set(ids(hook.result.current.summaries)).size).toBe(100);
  });
});

describe("tail failure is visible", () => {
  it("rejection: incomplete + failed, query still successful, nothing thrown", async () => {
    const held = holdTails();
    const { hook } = setup("org-reject", trips(100));
    await waitFor(() => expect(held).toHaveLength(1));
    await act(async () => held[0].d.reject(new Error("boom")));
    await waitFor(() => expect(hook.result.current.pipelineLoadFailed).toBe(true));
    expect(hook.result.current.pipelineIncomplete).toBe(true);
    expect(hook.result.current.pipelineLoadedCount).toBe(HEAD);
    expect(hook.result.current.summaries).toHaveLength(HEAD);
    expect(hook.result.current.isError).toBe(false);
  });

  it("timeout is treated as a failure, not as an empty tail", async () => {
    const held = holdTails();
    const { hook } = setup("org-timeout", trips(100));
    await waitFor(() => expect(held).toHaveLength(1));
    const timeout = Object.assign(new Error("Request timed out"), { name: "TimeoutError" });
    await act(async () => held[0].d.reject(timeout));
    await waitFor(() => expect(hook.result.current.pipelineLoadFailed).toBe(true));
    expect(hook.result.current.pipelineIncomplete).toBe(true);
  });

  it("head failure keeps the existing error path and never starts a tail", async () => {
    mockLoad.mockImplementation(async () => {
      throw new Error("statement timeout");
    });
    const { hook } = setup("org-head-fail", trips(100));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.summaries).toHaveLength(0);
    expect(hook.result.current.pipelineLoadFailed).toBe(false);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });
});

describe("retry", () => {
  async function failedTail(orgId: string) {
    const held = holdTails();
    const ctx = setup(orgId, trips(100));
    await waitFor(() => expect(held).toHaveLength(1));
    await act(async () => held[0].d.reject(new Error("boom")));
    await waitFor(() => expect(ctx.hook.result.current.pipelineLoadFailed).toBe(true));
    return { ...ctx, held };
  }

  it("reads only the missing trips, once at a time, and recovers", async () => {
    const { hook, held } = await failedTail("org-retry");

    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = hook.result.current.retryTail();
      second = hook.result.current.retryTail(); // ignored: one retry in flight
    });
    await waitFor(() => expect(held).toHaveLength(2));
    expect(mockLoad).toHaveBeenCalledTimes(3); // head, failed tail, ONE retry
    const [previous, retryTrips, options] = mockLoad.mock.calls[2];
    expect(previous).toBeUndefined();
    expect(options).toEqual({ full: true, viewerOrgId: "org-retry" });
    expect(tripIds(retryTrips as TripRow[])).toEqual(trips(100).slice(HEAD).map((t) => t.id));
    expect(hook.result.current.pipelineLoadFailed).toBe(false); // loading again, not failed

    await act(async () => {
      held[1].d.resolve(inputsFor(held[1].trips));
      await Promise.all([first, second]);
    });
    await waitFor(() => expect(hook.result.current.summaries).toHaveLength(100));
    expect(hook.result.current.pipelineIncomplete).toBe(false);
    expect(hook.result.current.pipelineLoadFailed).toBe(false);
    expect(new Set(ids(hook.result.current.summaries)).size).toBe(100);
  });

  it("a failed retry stays visible and can be retried again", async () => {
    const { hook, held } = await failedTail("org-retry-twice");
    await act(async () => {
      void hook.result.current.retryTail();
    });
    await waitFor(() => expect(held).toHaveLength(2));
    await act(async () => held[1].d.reject(new Error("still down")));
    await waitFor(() => expect(hook.result.current.pipelineLoadFailed).toBe(true));
    expect(hook.result.current.pipelineIncomplete).toBe(true);

    await act(async () => {
      void hook.result.current.retryTail();
    });
    await waitFor(() => expect(held).toHaveLength(3));
    await act(async () => held[2].d.resolve(inputsFor(held[2].trips)));
    await waitFor(() => expect(hook.result.current.pipelineIncomplete).toBe(false));
  });

  it("a failed reconcile is reported, and retry reads only the trip that is missing", async () => {
    mockLoad.mockImplementation(async (_previous: unknown, list: TripRow[]) => inputsFor(list));
    const { hook } = setup("org-reconcile", trips(2));
    await waitFor(() => expect(hook.result.current.summaries).toHaveLength(2));
    expect(hook.result.current.pipelineLoadFailed).toBe(false);

    mockPatchForTrips.mockRejectedValue(new Error("reconcile down"));
    mockTripsState = { data: trips(3), dataUpdatedAt: 2 };
    await act(async () => hook.rerender({}));
    await waitFor(() => expect(hook.result.current.pipelineLoadFailed).toBe(true));
    expect(hook.result.current.pipelineIncomplete).toBe(true);
    expect(hook.result.current.pipelineLoadedCount).toBe(2);
    expect(hook.result.current.pipelineTotalCount).toBe(3);

    mockLoad.mockClear();
    mockPatchForTrips.mockImplementation(async () => (cur: ComplianceTripInputs[]) => cur); // backend is back
    await act(async () => {
      await hook.result.current.retryTail();
    });
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(tripIds(mockLoad.mock.calls[0][1] as TripRow[])).toEqual(["t2"]);
    await waitFor(() => expect(hook.result.current.summaries).toHaveLength(3));
    expect(hook.result.current.pipelineIncomplete).toBe(false);
    expect(hook.result.current.pipelineLoadFailed).toBe(false);
  });

  it("nothing missing: retry reads nothing and clears the failed flag", async () => {
    mockLoad.mockImplementation(async (_previous: unknown, list: TripRow[]) => inputsFor(list));
    const { hook } = setup("org-nothing", trips(2));
    await waitFor(() => expect(hook.result.current.summaries).toHaveLength(2));
    mockPatchForTrips.mockRejectedValue(new Error("reconcile down"));
    mockTripsState = { data: trips(2), dataUpdatedAt: 2 };
    await act(async () => hook.rerender({}));
    await waitFor(() => expect(hook.result.current.pipelineLoadFailed).toBe(true));
    mockLoad.mockClear();
    mockPatchForTrips.mockImplementation(async () => (cur: ComplianceTripInputs[]) => cur); // backend is back
    await act(async () => {
      await hook.result.current.retryTail();
    });
    expect(mockLoad).not.toHaveBeenCalled();
    expect(hook.result.current.pipelineLoadFailed).toBe(false);
  });
});

describe("catalog change while the tail loads", () => {
  it("does not read the tail a second time; trips that joined are picked up once the load settles", async () => {
    const held = holdTails();
    const { hook } = setup("org-catalog", trips(100));
    await waitFor(() => expect(held).toHaveLength(1));
    const tailIds = new Set(tripIds(held[0].trips));

    mockPatchForTrips.mockClear();
    const next = [...trips(100).filter((t) => t.id !== "t50"), trip("t100")];
    mockTripsState = { data: next, dataUpdatedAt: 2 };
    await act(async () => hook.rerender({}));
    await waitFor(() => expect(mockPatchForTrips).toHaveBeenCalled());
    // While loading, reconcile is scoped to trips already in the cache.
    for (const call of mockPatchForTrips.mock.calls) {
      for (const t of call[1] as TripRow[]) expect(tailIds.has(t.id)).toBe(false);
    }
    expect(held).toHaveLength(1);

    mockPatchForTrips.mockClear();
    await act(async () => held[0].d.resolve(inputsFor(held[0].trips)));
    await waitFor(() => expect(mockPatchForTrips).toHaveBeenCalled());
    // Settled: reconcile now sees the whole current pipeline, including the new trip.
    const settledTrips = tripIds(mockPatchForTrips.mock.calls[mockPatchForTrips.mock.calls.length - 1][1] as TripRow[]);
    expect(settledTrips).toContain("t100");

    const loaded = ids(hook.result.current.summaries);
    expect(new Set(loaded).size).toBe(loaded.length);
    expect(loaded).not.toContain("t50"); // left the pipeline while the tail ran
    expect(loaded).toContain("t99");
  });
});

describe("stale reads never overwrite newer data", () => {
  it("a tail that lands after a header refresh is dropped; the new tail wins", async () => {
    const held = holdTails();
    const { hook } = setup("org-refresh", trips(100));
    await waitFor(() => expect(held).toHaveLength(1));

    await act(async () => {
      await hook.result.current.refetch();
    });
    await waitFor(() => expect(held).toHaveLength(2)); // the refresh started its own tail

    await act(async () => held[0].d.resolve(inputsFor(held[0].trips, "old")));
    expect(hook.result.current.summaries).toHaveLength(HEAD); // old tail ignored
    expect(hook.result.current.pipelineIncomplete).toBe(true);

    await act(async () => held[1].d.resolve(inputsFor(held[1].trips, "new")));
    await waitFor(() => expect(hook.result.current.summaries).toHaveLength(100));
    const tailDocs = hook.result.current.summaries.slice(HEAD).map((s) => s.documents[0].file_name);
    expect(new Set(tailDocs)).toEqual(new Set(["new.pdf"]));
  });

  it("an old tail failing after a header refresh does not flag the new load as failed", async () => {
    const held = holdTails();
    const { hook } = setup("org-refresh-fail", trips(100));
    await waitFor(() => expect(held).toHaveLength(1));
    await act(async () => {
      await hook.result.current.refetch();
    });
    await waitFor(() => expect(held).toHaveLength(2));
    await act(async () => held[0].d.reject(new Error("old tail failed")));
    expect(hook.result.current.pipelineLoadFailed).toBe(false);
  });

  it("another org's rows are never the current org's queue, and its tail cannot land here", async () => {
    const held = holdTails();
    const { qc, hook } = setup("org-a", trips(100));
    await waitFor(() => expect(held).toHaveLength(1));
    const orgAKey = queryKeys.tripCompliance.pipeline("org-a");
    expect(qc.getQueryData<ComplianceTripInputs[]>(orgAKey)).toHaveLength(HEAD);

    // Switch org; its first read stays pending, so keepPreviousData would show org-a rows.
    const orgB = deferred<ComplianceTripInputs[]>();
    mockLoad.mockImplementation(() => orgB.promise);
    mockOrgId = "org-b";
    mockTripsState = { data: trips(3, "b"), dataUpdatedAt: 1 };
    await act(async () => hook.rerender({}));
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(3)); // org-a head, org-a tail, org-b head

    expect(hook.result.current.summaries).toHaveLength(0);
    expect(hook.result.current.isLoading).toBe(true);
    expect(hook.result.current.pipelineLoadedCount).toBe(0);
    expect(hook.result.current.dataUpdatedAt).toBe(0);

    // The org-a tail lands late (and fails late): neither touches org-b.
    await act(async () => held[0].d.resolve(inputsFor(held[0].trips)));
    expect(qc.getQueryData<ComplianceTripInputs[]>(orgAKey)).toHaveLength(HEAD);
    expect(hook.result.current.pipelineLoadFailed).toBe(false);
    expect(hook.result.current.summaries).toHaveLength(0);

    await act(async () => orgB.resolve(inputsFor(trips(3, "b"))));
    await waitFor(() => expect(hook.result.current.summaries).toHaveLength(3));
    expect(ids(hook.result.current.summaries)).toEqual(["b0", "b1", "b2"]);
    expect(hook.result.current.pipelineIncomplete).toBe(false);
  });
});

describe("persisted / hydrated cache", () => {
  it("a complete hydrated queue is never flagged incomplete", async () => {
    mockLoad.mockImplementation(async (_previous: unknown, list: TripRow[]) => inputsFor(list));
    const list = trips(3);
    const { hook, history } = setup("org-hydrated", list, (qc) => {
      qc.setQueryData(queryKeys.tripCompliance.pipeline("org-hydrated"), inputsFor(list), {
        updatedAt: Date.now() - 60 * 60_000,
      });
    });
    expect(history[0]).toBe(false);
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.summaries).toHaveLength(3));
    expect(history.every((incomplete) => incomplete === false)).toBe(true);
  });
});
