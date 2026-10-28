import { accumulateTripPartyCounts } from "@/features/trips/services/trips.service";

describe("accumulateTripPartyCounts", () => {
  it("counts every owned trip per party, not a catalog slice", () => {
    const counts = accumulateTripPartyCounts([
      { client_id: "c1", supplier_id: "s1", driver_id: "d1" },
      { client_id: "c1", supplier_id: null, driver_id: "d1" },
      { client_id: "c2", supplier_id: "s1", driver_id: "  " },
    ]);
    expect(counts.byClientId).toEqual({ c1: 2, c2: 1 });
    expect(counts.bySupplierId).toEqual({ s1: 2 });
    expect(counts.byDriverId).toEqual({ d1: 2 });
  });
});
