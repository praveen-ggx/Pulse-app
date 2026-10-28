import { isNonPersistedTripsQueryKey, queryKeys, tripIdsHashKey } from "@/lib/queryKeys";

describe("tripIdsHashKey", () => {
  it("ignores order, case, whitespace and duplicates", () => {
    expect(tripIdsHashKey(["B", "a ", "a"])).toBe(tripIdsHashKey(["a", "b"]));
  });

  it("differs for different sets and stays short", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    const key = tripIdsHashKey(ids);
    expect(key.length).toBeLessThan(24);
    expect(key.startsWith("400-")).toBe(true);
    expect(tripIdsHashKey(ids.slice(1))).not.toBe(key);
    expect(tripIdsHashKey(["ab", "c"])).not.toBe(tripIdsHashKey(["a", "bc"]));
  });
});

describe("isNonPersistedTripsQueryKey", () => {
  it("matches hub search, doc numbers, driver phones and export status times", () => {
    expect(isNonPersistedTripsQueryKey(queryKeys.trips.hubSearch("org", "abc"))).toBe(true);
    expect(isNonPersistedTripsQueryKey(queryKeys.trips.hubDateRange("org", "2026-09-01", "2026-09-30"))).toBe(true);
    expect(isNonPersistedTripsQueryKey(queryKeys.trips.hubDocNumbers("org", "k"))).toBe(true);
    expect(isNonPersistedTripsQueryKey(queryKeys.trips.hubDriverPhones("org", "k"))).toBe(true);
    expect(isNonPersistedTripsQueryKey(queryKeys.trips.opsExportStatusTimes("org", "k"))).toBe(true);
  });

  it("leaves other trips queries persisted", () => {
    expect(isNonPersistedTripsQueryKey(queryKeys.trips.finite("org"))).toBe(false);
    expect(isNonPersistedTripsQueryKey(queryKeys.trips.all("org"))).toBe(false);
    expect(isNonPersistedTripsQueryKey(["q", "trips", "doc-trip-ids", "v7-pod-eway", "org", "a,b"])).toBe(false);
    expect(isNonPersistedTripsQueryKey(queryKeys.trips.detail("hub-search"))).toBe(false);
  });
});
