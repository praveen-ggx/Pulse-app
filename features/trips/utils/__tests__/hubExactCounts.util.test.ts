import { buildOrgHubExactCounts } from "@/features/trips/utils/hubExactCounts.util";

describe("buildOrgHubExactCounts", () => {
  it("counts every owned trip, not a 400-row catalog slice", () => {
    const counts = buildOrgHubExactCounts(
      {
        trips: [
          { id: "a", status: "assigned", driver_id: "d1", indent_id: "i1", pickup_date: null, created_at: "2026-10-01" },
          { id: "b", status: "in_transit", driver_id: "d1", indent_id: null, pickup_date: null, created_at: "2026-10-02" },
          { id: "c", status: "completed", driver_id: "d1", indent_id: "i2", pickup_date: null, created_at: "2026-09-01" },
          { id: "d", status: "cancelled", driver_id: null, indent_id: null, pickup_date: null, created_at: "2026-10-03" },
        ],
        documentTripIds: [],
        indents: [
          { id: "i1", status: "open", pickup_date: null, created_at: "2026-10-01" },
          { id: "i2", status: "open", pickup_date: null, created_at: "2026-09-01" },
          { id: "i3", status: "open", pickup_date: null, created_at: "2026-10-04" },
        ],
      },
      { dateRangeFilter: "all", includeCompletedInDelivered: true },
    );

    expect(counts.active).toBe(2);
    expect(counts.history).toBe(1);
    expect(counts.metrics.assigned).toBe(1);
    expect(counts.metrics.in_transit).toBe(1);
    expect(counts.metrics.delivered_docs_pending).toBe(1);
    expect(counts.metrics.indent).toBe(1);
    expect(counts.allActive).toBe(3);
    expect(counts.indentIdsWithTrip).toEqual(expect.arrayContaining(["i1", "i2"]));
  });
});
