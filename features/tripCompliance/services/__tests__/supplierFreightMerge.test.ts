import { mergeSupplierFreight } from "@/features/tripCompliance/services/complianceAdvanceFinanceBreakdown.service";

describe("mergeSupplierFreight", () => {
  it("replaces a missing list basis with the freight stored on the trip", () => {
    const trip = mergeSupplierFreight(
      { supplier_rate: 0, supplier_rate_basis: null, load_tons: null },
      { supplierRate: 57000, supplierRateBasis: "per_trip", loadTons: 12 },
    );
    expect(trip.supplier_rate).toBe(57000);
    expect(trip.supplier_rate_basis).toBe("per_trip");
    expect(trip.load_tons).toBe(12);
  });

  it("keeps the list trip when the freight read did not return a row", () => {
    const trip = { supplier_rate: 1000, supplier_rate_basis: "per_trip" as const, load_tons: 4 };
    expect(mergeSupplierFreight(trip, null)).toBe(trip);
  });
});
