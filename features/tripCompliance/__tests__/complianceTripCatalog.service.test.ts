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

  it("uses the hub walk only when the pipeline function is not installed", async () => {
    loadPage.mockResolvedValue({ error: null, missing: true, hasMore: false, total: null, trips: [] });
    loadHub.mockResolvedValue({
      error: null,
      trips: [
        trip("old-completed", "completed", null),
        trip("cancelled", "cancelled"),
        trip("no-driver", "loading", null),
      ],
    });

    const res = await loadComplianceTripCatalog("org-1");

    expect(res.error).toBeNull();
    expect(res.trips.map((row) => row.id)).toEqual(["old-completed"]);
  });
});
