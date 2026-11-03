import {
  filterDocumentsForTrip,
  mergeTripDocumentsFromBundleSeed,
  tripDocumentsFromTableLoad,
} from "../tripDocumentsScope.util";

const tripA = "trip-a";
const tripB = "trip-b";

function doc(
  tripId: string,
  id: string,
  documentNumber?: string | null,
) {
  return { id, trip_id: tripId, document_number: documentNumber ?? null };
}

describe("filterDocumentsForTrip", () => {
  it("keeps only rows for the open trip", () => {
    expect(
      filterDocumentsForTrip(
        [doc(tripA, "1"), doc(tripB, "2"), doc(tripA, "3")],
        tripA,
      ),
    ).toEqual([doc(tripA, "1"), doc(tripA, "3")]);
  });

  it("returns [] when trip id is missing", () => {
    expect(filterDocumentsForTrip([doc(tripA, "1")], null)).toEqual([]);
  });
});

describe("tripDocumentsFromTableLoad", () => {
  it("replaces state with the table result including empty", () => {
    expect(tripDocumentsFromTableLoad([])).toEqual([]);
    expect(tripDocumentsFromTableLoad([doc(tripB, "eway")])).toEqual([
      doc(tripB, "eway"),
    ]);
    expect(tripDocumentsFromTableLoad(null)).toEqual([]);
  });
});

describe("mergeTripDocumentsFromBundleSeed", () => {
  it("does not keep another trip's e-way rows when the light bundle is empty", () => {
    expect(
      mergeTripDocumentsFromBundleSeed({
        openTripId: tripB,
        bundleTripId: tripB,
        fromBundle: [],
        prev: [doc(tripA, "eway-a")],
      }),
    ).toEqual([]);
  });

  it("keeps same-trip vault rows when the light bundle ships documents: []", () => {
    const eway = doc(tripB, "eway-b", "123");
    expect(
      mergeTripDocumentsFromBundleSeed({
        openTripId: tripB,
        bundleTripId: tripB,
        fromBundle: [],
        prev: [eway],
      }),
    ).toEqual([eway]);
  });

  it("ignores a stale bundle from a previous trip", () => {
    expect(
      mergeTripDocumentsFromBundleSeed({
        openTripId: tripB,
        bundleTripId: tripA,
        fromBundle: [doc(tripA, "eway-a")],
        prev: [],
      }),
    ).toEqual([]);
  });

  it("applies bundle rows for the open trip and preserves document_number", () => {
    const fromBundle = [doc(tripB, "eway-b", null)];
    const prev = [doc(tripB, "eway-b", '{"ewayNo":"999"}')];
    expect(
      mergeTripDocumentsFromBundleSeed({
        openTripId: tripB,
        bundleTripId: tripB,
        fromBundle,
        prev,
      }),
    ).toEqual([doc(tripB, "eway-b", '{"ewayNo":"999"}')]);
  });
});
