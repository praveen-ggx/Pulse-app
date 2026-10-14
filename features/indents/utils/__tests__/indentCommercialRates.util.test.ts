import {
  clientCommercialRates,
  commercialMarginPct,
  formatCommercialLines,
  supplierCommercialRates,
} from "@/features/indents/utils/indentCommercialRates.util";

describe("indentCommercialRates", () => {
  it("expands a per-MT supplier target by kilograms stored as weight", () => {
    const pair = supplierCommercialRates({
      basis: "per_mt",
      supplierTarget: 3200,
      weightKg: 38830,
    });
    expect(pair.perMt).toBe(3200);
    expect(pair.overall).toBe(124256);
    expect(formatCommercialLines(pair).perMt).toMatch(/3,200\/MT$/);
    expect(formatCommercialLines(pair).overall).toMatch(/1,24,256$/);
  });

  it("keeps a per-trip target as the trip total and derives ₹/MT when weight is known", () => {
    const pair = supplierCommercialRates({
      basis: "per_trip",
      supplierTarget: 90000,
      weightKg: 30000,
    });
    expect(pair.overall).toBe(90000);
    expect(pair.perMt).toBe(3000);
  });

  it("does not invent a trip total for a per-MT rate with no weight", () => {
    const pair = supplierCommercialRates({
      basis: "per_mt",
      supplierTarget: 3200,
      weightKg: null,
    });
    expect(pair).toEqual({ perMt: 3200, overall: null });
  });

  it("uses the client unit rate and the billed trip total together", () => {
    const pair = clientCommercialRates({
      basis: "per_mt",
      clientPrice: 124256,
      saleUnitRate: 3200,
      weightKg: 38830,
    });
    expect(pair.perMt).toBe(3200);
    expect(pair.overall).toBe(124256);
  });

  it("compares margin on ₹/MT when both sides have it", () => {
    const client = clientCommercialRates({
      basis: "per_mt",
      clientPrice: 0,
      saleUnitRate: 4000,
      weightKg: null,
    });
    const supplier = supplierCommercialRates({
      basis: "per_mt",
      supplierTarget: 3200,
      weightKg: null,
    });
    expect(commercialMarginPct(client, supplier)).toBe(20);
  });

  it("does not compare a ₹/MT figure to a trip total", () => {
    expect(
      commercialMarginPct(
        { perMt: 4000, overall: null },
        { perMt: null, overall: 90000 },
      ),
    ).toBeNull();
  });
});
