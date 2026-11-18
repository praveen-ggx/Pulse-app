import {
  recordTripCatalogFetch,
  resetTripCatalogFetchMetricsForTests,
  tripCatalogFetchSnapshot,
  tripCatalogFetchTotals,
} from "@/lib/trips/tripCatalogFetchMetrics";

describe("tripCatalogFetchMetrics", () => {
  beforeEach(() => {
    resetTripCatalogFetchMetricsForTests();
  });

  it("counts a joined duplicate separately from a later refresh", () => {
    recordTripCatalogFetch({
      orgId: "org-a",
      kind: "compliance",
      joined: false,
      ok: true,
      durationMs: 12000,
    });
    recordTripCatalogFetch({
      orgId: "org-a",
      kind: "compliance",
      joined: true,
      ok: true,
      durationMs: 20,
    });
    recordTripCatalogFetch({
      orgId: "org-b",
      kind: "compliance",
      joined: false,
      ok: false,
      durationMs: 400,
    });

    expect(tripCatalogFetchSnapshot("org-a", "compliance")).toMatchObject({
      calls: 2,
      joined: 1,
      failures: 0,
    });
    expect(tripCatalogFetchSnapshot("org-b", "compliance").failures).toBe(1);
    expect(tripCatalogFetchSnapshot("org-a", "catalog").calls).toBe(0);
  });

  it("publishes totals without organisation ids", () => {
    recordTripCatalogFetch({
      orgId: "5b471ecb-secret",
      kind: "compliance",
      joined: false,
      ok: true,
      durationMs: 11000,
    });
    const totals = tripCatalogFetchTotals();
    expect(totals.byKind.compliance.calls).toBe(1);
    expect(JSON.stringify(totals)).not.toContain("5b471ecb");
  });
});
