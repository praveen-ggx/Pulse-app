import { createFakePostgrest, fakeUuid, shuffled } from "@/lib/__tests__/fakePostgrest";

const mockServer = createFakePostgrest();
const mockOrgTripIds = ["trip-a", "trip-b", "trip-c"];

jest.mock("@/lib/supabase", () => ({ supabase: () => mockServer.client }));

const mockLoadLrRows = jest.fn();
jest.mock("@/features/trips/services/tripDocumentLrPod.service", () => ({
  loadLrDocumentRowsByTripIds: (ids: string[]) => mockLoadLrRows(ids),
}));

import {
  __resetOrgLrDuplicateCacheForTests,
  checkOrgDuplicateLrNumbersForTrip,
  findOrgDuplicateLrNumberForTrip,
  findOrgDuplicateLrNumbersForTrip,
  invalidateOrgLrIndexForTrip,
  OrgLrIndexUnavailableError,
} from "../orgLrDuplicate.service";

/** Org-wide trip sweeps = first keyset page of the org trips read. */
const orgSweeps = () =>
  mockServer.requests.filter(
    (r) => r.table === "trips" && r.filters.includes("organization_id=eq.org-1") && r.afterId === null,
  ).length;
const tripOrgLookups = () =>
  mockServer.requests.filter((r) => r.table === "trips" && r.filters.some((f) => f.startsWith("id=eq."))).length;

beforeEach(() => {
  __resetOrgLrDuplicateCacheForTests();
  mockServer.requests.length = 0;
  mockServer.state.failRequest = null;
  mockServer.tables.trips = mockOrgTripIds.map((id) => ({ id, organization_id: "org-1", deleted_at: null }));
  mockLoadLrRows.mockReset();
  mockLoadLrRows.mockResolvedValue([
    { trip_id: "trip-a", document_type: "lr", document_number: "LR 100" },
    { trip_id: "trip-b", document_type: "lr", document_number: "lr-200" },
  ]);
});

describe("org LR duplicate check", () => {
  it("finds the same LR on another trip, ignoring case and spacing", async () => {
    await expect(
      findOrgDuplicateLrNumberForTrip({ tripId: "trip-c", lrNumber: "  lr   100 " }),
    ).resolves.toEqual({ tripId: "trip-a", lrNumber: "LR 100" });
  });

  it("allows the same LR on the same trip", async () => {
    await expect(
      findOrgDuplicateLrNumberForTrip({ tripId: "trip-a", lrNumber: "LR 100" }),
    ).resolves.toBeNull();
  });

  it("reads LR rows through the batch loader, never per-chunk table scans", async () => {
    await findOrgDuplicateLrNumberForTrip({ tripId: "trip-c", lrNumber: "X" });
    expect(mockLoadLrRows).toHaveBeenCalledTimes(1);
    expect(mockLoadLrRows).toHaveBeenCalledWith(mockOrgTripIds);
  });

  it("reuses one org sweep across repeated checks (typing, confirm, upload)", async () => {
    for (const lrNumber of ["L", "LR", "LR 1", "LR 10", "LR 100"]) {
      await findOrgDuplicateLrNumberForTrip({ tripId: "trip-c", lrNumber });
    }
    expect(orgSweeps()).toBe(1);
    expect(mockLoadLrRows).toHaveBeenCalledTimes(1);
    // trip → org is looked up once too.
    expect(tripOrgLookups()).toBe(1);
  });

  it("joins concurrent checks onto one in-flight build", async () => {
    await Promise.all(
      Array.from({ length: 6 }, () =>
        findOrgDuplicateLrNumberForTrip({ tripId: "trip-c", lrNumber: "LR 100" }),
      ),
    );
    expect(mockLoadLrRows).toHaveBeenCalledTimes(1);
  });

  it("checks a whole LR range against one index", async () => {
    const lrNumbers = Array.from({ length: 51 }, (_, i) => `LR-${100 + i}`);
    lrNumbers.push("LR-200");
    await expect(
      findOrgDuplicateLrNumbersForTrip({ tripId: "trip-c", lrNumbers }),
    ).resolves.toEqual({ tripId: "trip-b", lrNumber: "LR-200" });
    expect(orgSweeps()).toBe(1);
  });

  it("rebuilds after an LR write so a newly saved number is caught", async () => {
    await findOrgDuplicateLrNumberForTrip({ tripId: "trip-c", lrNumber: "LR 300" });
    mockLoadLrRows.mockResolvedValue([
      { trip_id: "trip-c", document_type: "lr", document_number: "LR 300" },
    ]);
    invalidateOrgLrIndexForTrip("trip-c");
    await expect(
      findOrgDuplicateLrNumberForTrip({ tripId: "trip-a", lrNumber: "LR 300" }),
    ).resolves.toEqual({ tripId: "trip-c", lrNumber: "LR 300" });
    expect(mockLoadLrRows).toHaveBeenCalledTimes(2);
  });

  it("does not cache a build that was in flight when an LR write happened", async () => {
    let release: (rows: unknown[]) => void = () => {};
    mockLoadLrRows.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    const stale = findOrgDuplicateLrNumberForTrip({ tripId: "trip-c", lrNumber: "LR 9" });
    await new Promise((r) => setTimeout(r, 0));
    invalidateOrgLrIndexForTrip("trip-c");
    release([]);
    await stale;
    mockLoadLrRows.mockResolvedValue([
      { trip_id: "trip-c", document_type: "lr", document_number: "LR 9" },
    ]);
    await expect(
      findOrgDuplicateLrNumberForTrip({ tripId: "trip-a", lrNumber: "LR 9" }),
    ).resolves.toEqual({ tripId: "trip-c", lrNumber: "LR 9" });
  });

  it("advisory find* reports no duplicate when the org index cannot be built", async () => {
    mockLoadLrRows.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      findOrgDuplicateLrNumberForTrip({ tripId: "trip-c", lrNumber: "LR 100" }),
    ).resolves.toBeNull();
  });
});

describe("org LR index over the 1000-row server cap", () => {
  it("indexes LRs of all 1200 org trips; a duplicate on trip #1150 is found", async () => {
    const tripIds = Array.from({ length: 1200 }, (_, i) => fakeUuid(i, 6));
    mockServer.tables.trips = shuffled([
      ...tripIds.map((id) => ({ id, organization_id: "org-1", deleted_at: null })),
      ...Array.from({ length: 50 }, (_, i) => ({ id: fakeUuid(5000 + i, 6), organization_id: "org-1", deleted_at: "2026-10-01" })),
      ...Array.from({ length: 300 }, (_, i) => ({ id: fakeUuid(9000 + i, 6), organization_id: "org-2", deleted_at: null })),
    ]);
    mockLoadLrRows.mockImplementation(async (ids: string[]) =>
      ids.includes(tripIds[1150]) ? [{ trip_id: tripIds[1150], document_type: "lr", document_number: "LR-OLD-1150" }] : [],
    );

    await expect(
      checkOrgDuplicateLrNumbersForTrip({ tripId: tripIds[3], lrNumbers: ["lr-old-1150"] }),
    ).resolves.toEqual({ tripId: tripIds[1150], lrNumber: "LR-OLD-1150" });
    const loaded = mockLoadLrRows.mock.calls[0][0] as string[];
    expect(loaded).toHaveLength(1200);
    expect(new Set(loaded)).toEqual(new Set(tripIds));
  });
});

describe("fail-closed check for write paths", () => {
  it("throws when an org trips page fails, and does not cache the failure", async () => {
    mockServer.state.failRequest = (req) => req.table === "trips" && req.afterId !== null;
    await expect(
      checkOrgDuplicateLrNumbersForTrip({ tripId: "trip-c", lrNumbers: ["LR 100"] }),
    ).rejects.toBeInstanceOf(OrgLrIndexUnavailableError);
    mockServer.state.failRequest = null;
    await expect(
      checkOrgDuplicateLrNumbersForTrip({ tripId: "trip-c", lrNumbers: ["LR 100"] }),
    ).resolves.toEqual({ tripId: "trip-a", lrNumber: "LR 100" });
  });

  it("throws when the LR rows cannot be loaded completely", async () => {
    mockLoadLrRows.mockRejectedValueOnce(new Error("chunk failed"));
    await expect(
      checkOrgDuplicateLrNumbersForTrip({ tripId: "trip-c", lrNumbers: ["LR 100"] }),
    ).rejects.toBeInstanceOf(OrgLrIndexUnavailableError);
  });

  it("throws when the trip → org lookup errors", async () => {
    mockServer.state.failRequest = (req) => req.filters.some((f) => f.startsWith("id=eq."));
    await expect(
      checkOrgDuplicateLrNumbersForTrip({ tripId: "trip-c", lrNumbers: ["LR 100"] }),
    ).rejects.toBeInstanceOf(OrgLrIndexUnavailableError);
  });

  it("a trip the user cannot see is still not checked (unchanged behaviour)", async () => {
    await expect(
      checkOrgDuplicateLrNumbersForTrip({ tripId: "trip-unknown", lrNumbers: ["LR 100"] }),
    ).resolves.toBeNull();
  });
});
