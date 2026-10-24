const mockTripsQueries: { kind: "org" | "single"; value: string }[] = [];
const mockOrgTripIds = ["trip-a", "trip-b", "trip-c"];

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table !== "trips") throw new Error(`unexpected table ${table}`);
      return {
        select: (columns: string) => ({
          eq: (_col: string, value: string) => {
            if (columns === "organization_id") {
              return {
                maybeSingle: async () => {
                  mockTripsQueries.push({ kind: "single", value });
                  return { data: { organization_id: "org-1" }, error: null };
                },
              };
            }
            return {
              is: async () => {
                mockTripsQueries.push({ kind: "org", value });
                return { data: mockOrgTripIds.map((id) => ({ id })), error: null };
              },
            };
          },
        }),
      };
    },
  }),
}));

const mockLoadLrRows = jest.fn();
jest.mock("@/features/trips/services/tripDocumentLrPod.service", () => ({
  loadLrDocumentRowsByTripIds: (ids: string[]) => mockLoadLrRows(ids),
}));

import {
  __resetOrgLrDuplicateCacheForTests,
  findOrgDuplicateLrNumberForTrip,
  findOrgDuplicateLrNumbersForTrip,
  invalidateOrgLrIndexForTrip,
} from "../orgLrDuplicate.service";

const orgSweeps = () => mockTripsQueries.filter((q) => q.kind === "org").length;

beforeEach(() => {
  __resetOrgLrDuplicateCacheForTests();
  mockTripsQueries.length = 0;
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
    expect(mockTripsQueries.filter((q) => q.kind === "single")).toHaveLength(1);
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

  it("fails open (no duplicate) when the org index cannot be built", async () => {
    mockLoadLrRows.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      findOrgDuplicateLrNumberForTrip({ tripId: "trip-c", lrNumber: "LR 100" }),
    ).resolves.toBeNull();
  });
});
