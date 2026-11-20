const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: mockFrom }),
}));

import {
  mergeSupplierFreight,
  readTripSupplierFreight,
} from "@/features/tripCompliance/services/complianceAdvanceFinanceBreakdown.service";

function tripsQuery(rows: unknown[]) {
  return {
    select: () => ({ in: () => Promise.resolve({ data: rows, error: null }) }),
  };
}

describe("readTripSupplierFreight", () => {
  beforeEach(() => mockFrom.mockReset());

  it("keeps a blank trip basis blank and never reads the indent basis (TRP002851)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "trips") {
        return tripsQuery([
          { id: "t1", supplier_rate: 205920, supplier_rate_basis: null, load_tons: 64.35 },
        ]);
      }
      throw new Error(`unexpected table ${table}`);
    });
    const freight = await readTripSupplierFreight("t1");
    expect(freight).toEqual({ supplierRate: 205920, supplierRateBasis: null, loadTons: 64.35 });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    const merged = mergeSupplierFreight(
      { supplier_rate: 205920, supplier_rate_basis: "per_mt", load_tons: 64.35 },
      freight,
    );
    expect(merged.supplier_rate_basis).toBeNull();
  });

  it("keeps an explicit per_mt trip basis", async () => {
    mockFrom.mockImplementation(() =>
      tripsQuery([{ id: "t2", supplier_rate: 2500, supplier_rate_basis: " per_mt ", load_tons: 30 }]),
    );
    const freight = await readTripSupplierFreight("t2");
    expect(freight?.supplierRateBasis).toBe("per_mt");
  });
});
