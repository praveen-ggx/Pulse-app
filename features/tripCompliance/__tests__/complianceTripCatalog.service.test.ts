jest.mock("@/features/trips/services/trips.service", () => ({
  getComplianceOpsPipelinePage: jest.fn(),
  loadHubTripKeysetRange: jest.fn(),
}));

import { loadComplianceTripCatalog } from "@/features/tripCompliance/services/complianceTripCatalog.service";
import {
  getComplianceOpsPipelinePage,
  loadHubTripKeysetRange,
  type TripRow,
} from "@/features/trips/services/trips.service";

const loadPage = getComplianceOpsPipelinePage as jest.Mock;
const loadHub = loadHubTripKeysetRange as jest.Mock;

function trip(id: string, status: string, driverId: string | null = "driver-1"): TripRow {
  return { id, status, driver_id: driverId, created_at: `2026-01-01T00:00:${id.length}0.000Z` } as TripRow;
}

describe("loadComplianceTripCatalog", () => {
  beforeEach(() => {
    loadPage.mockReset();
    loadHub.mockReset();
  });

  it("walks the ops-pipeline pages and does not call the hub walk", async () => {
    loadPage
      .mockResolvedValueOnce({
        error: null,
        missing: false,
        hasMore: true,
        total: 2,
        trips: [trip("a", "completed", null)],
      })
      .mockResolvedValueOnce({
        error: null,
        missing: false,
        hasMore: false,
        total: 2,
        trips: [trip("b", "loading")],
      });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.error).toBeNull();
    expect(res.trips.map((row) => row.id)).toEqual(["a", "b"]);
    expect(loadHub).not.toHaveBeenCalled();
    expect(loadPage.mock.calls[0][1]).toEqual({ includeAssigned: true });
  });

  it("returns no rows when a later page repeats an id", async () => {
    const row = trip("a", "completed", null);
    loadPage
      .mockResolvedValueOnce({ error: null, missing: false, hasMore: true, total: 2, trips: [row] })
      .mockResolvedValueOnce({ error: null, missing: false, hasMore: false, total: 2, trips: [row] });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.trips).toEqual([]);
    expect(res.error?.message).toMatch(/repeated/);
  });

  it("returns no rows when the loaded count does not match the server total", async () => {
    loadPage.mockResolvedValue({
      error: null,
      missing: false,
      hasMore: false,
      total: 4,
      trips: [trip("a", "completed", null)],
    });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.trips).toEqual([]);
    expect(res.error?.message).toMatch(/1 of 4/);
  });

  it("uses the hub active and history walks together when the pipeline function is not installed", async () => {
    loadPage.mockResolvedValue({ error: null, missing: true, hasMore: false, total: null, trips: [] });
    let started = 0;
    loadHub.mockImplementation(async (_orgId: string, opts?: { bucket?: string }) => {
      started += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(started).toBe(2);
      if (opts?.bucket === "history") {
        return {
          error: null,
          trips: [{ ...trip("old-completed", "completed", null), created_at: "2026-01-02T00:00:00.000Z" }],
        };
      }
      if (opts?.bucket === "active") {
        return {
          error: null,
          trips: [
            { ...trip("loading-now", "loading"), created_at: "2026-01-03T00:00:00.000Z" },
            { ...trip("cancelled", "cancelled"), created_at: "2026-01-04T00:00:00.000Z" },
            { ...trip("no-driver", "loading", null), created_at: "2026-01-01T00:00:00.000Z" },
          ],
        };
      }
      return { error: new Error(`unexpected bucket ${opts?.bucket ?? ""}`), trips: [] };
    });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.error).toBeNull();
    expect(res.trips.map((row) => row.id)).toEqual(["loading-now", "old-completed"]);
    expect(loadHub).toHaveBeenCalledWith("org-1", { bucket: "active" });
    expect(loadHub).toHaveBeenCalledWith("org-1", { bucket: "history" });
    expect(loadHub).not.toHaveBeenCalledWith("org-1");
  });

  it("keeps a history-only queue when the active book is empty", async () => {
    loadPage.mockResolvedValue({ error: null, missing: true, hasMore: false, total: null, trips: [] });
    loadHub.mockImplementation(async (_orgId: string, opts?: { bucket?: string }) => {
      if (opts?.bucket === "active") return { error: null, trips: [] };
      return {
        error: null,
        trips: [{ ...trip("done", "completed"), created_at: "2026-02-01T00:00:00.000Z" }],
      };
    });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.error).toBeNull();
    expect(res.trips.map((row) => row.id)).toEqual(["done"]);
  });

  it("keeps an active-only queue when the history book is empty", async () => {
    loadPage.mockResolvedValue({ error: null, missing: true, hasMore: false, total: null, trips: [] });
    loadHub.mockImplementation(async (_orgId: string, opts?: { bucket?: string }) => {
      if (opts?.bucket === "history") return { error: null, trips: [] };
      return {
        error: null,
        trips: [{ ...trip("moving", "in_transit"), created_at: "2026-02-02T00:00:00.000Z" }],
      };
    });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.error).toBeNull();
    expect(res.trips.map((row) => row.id)).toEqual(["moving"]);
  });

  it("returns no rows when the active book fails", async () => {
    loadPage.mockResolvedValue({ error: null, missing: true, hasMore: false, total: null, trips: [] });
    loadHub.mockImplementation(async (_orgId: string, opts?: { bucket?: string }) => {
      if (opts?.bucket === "active") return { error: new Error("active unavailable"), trips: [] };
      return { error: null, trips: [trip("done", "completed")] };
    });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.trips).toEqual([]);
    expect(res.error?.message).toBe("active unavailable");
  });

  it("returns no rows when the same trip is in both books", async () => {
    loadPage.mockResolvedValue({ error: null, missing: true, hasMore: false, total: null, trips: [] });
    const shared = { ...trip("same", "loading"), created_at: "2026-03-01T00:00:00.000Z" };
    loadHub.mockImplementation(async (_orgId: string, opts?: { bucket?: string }) => {
      if (opts?.bucket === "history") return { error: null, trips: [{ ...shared, status: "completed" }] };
      return { error: null, trips: [shared] };
    });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.trips).toEqual([]);
    expect(res.error?.message).toMatch(/repeated/);
  });

  it("orders trips with the same timestamp by id descending", async () => {
    loadPage.mockResolvedValue({ error: null, missing: true, hasMore: false, total: null, trips: [] });
    const stamp = "2026-04-01T00:00:00.000Z";
    loadHub.mockImplementation(async (_orgId: string, opts?: { bucket?: string }) => {
      if (opts?.bucket === "history") return { error: null, trips: [] };
      return {
        error: null,
        trips: [
          { ...trip("aaaa", "loading"), created_at: stamp },
          { ...trip("zzzz", "in_transit"), created_at: stamp },
        ],
      };
    });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.error).toBeNull();
    expect(res.trips.map((row) => row.id)).toEqual(["zzzz", "aaaa"]);
  });

  it("returns no rows when either hub bucket fails", async () => {
    loadPage.mockResolvedValue({ error: null, missing: true, hasMore: false, total: null, trips: [] });
    loadHub.mockImplementation(async (_orgId: string, opts?: { bucket?: string }) => {
      if (opts?.bucket === "history") return { error: new Error("history unavailable"), trips: [] };
      return { error: null, trips: [trip("loading-now", "loading")] };
    });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.trips).toEqual([]);
    expect(res.error?.message).toBe("history unavailable");
  });
});
