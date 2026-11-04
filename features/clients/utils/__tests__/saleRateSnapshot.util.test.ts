import {
  computeClientPrice,
  hasConvertibleSale,
} from "@/features/clients/utils/saleRateSnapshot.util";
import {
  buildClientLanePrefill,
  isWeightBasedLane,
  laneUnitRatePerMt,
  resolveLaneSaleAmount,
} from "@/features/clients/utils/clientLanePrefill.util";
import type { ClientLaneRate } from "@/features/clients/types/clientManagement.types";

function lane(partial: Partial<ClientLaneRate>): ClientLaneRate {
  return {
    id: "lane-1",
    organization_id: "org",
    client_id: "client",
    agreement_id: null,
    origin_warehouse_id: null,
    destination_warehouse_id: null,
    origin_label: "Pune",
    destination_label: "Mumbai",
    destination_gstin: null,
    destination_address: null,
    warehouse_zone: null,
    distance_km: null,
    pricing_model: null,
    base_rate: null,
    per_mt_rate: null,
    per_km_rate: null,
    vehicle_type: "32ft",
    rate: null,
    rate_type: "per_trip",
    default_load_type: null,
    default_load_tons: null,
    min_billing: null,
    fuel_clause: null,
    toll_included: false,
    detention_included: false,
    valid_from: null,
    valid_to: null,
    is_spot_rate: false,
    notes: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("computeClientPrice", () => {
  it("multiplies per-MT by tons", () => {
    expect(
      computeClientPrice({ basis: "per_mt", unitRate: 3140, tons: 30 }),
    ).toBe(94200);
  });

  it("keeps exact per-MT product without rupee rounding", () => {
    expect(
      computeClientPrice({ basis: "per_mt", unitRate: 2520, tons: 29.877 }),
    ).toBe(75290.04);
  });

  it("returns 0 when per-MT tons are unknown", () => {
    expect(
      computeClientPrice({ basis: "per_mt", unitRate: 3140, tons: null }),
    ).toBe(0);
  });

  it("uses the flat total for per-trip", () => {
    expect(
      computeClientPrice({
        basis: "per_trip",
        unitRate: null,
        tons: 30,
        flatPrice: 50000,
      }),
    ).toBe(50000);
  });
});

describe("lane per-MT detection", () => {
  it("treats per_mt_km + per_mt_rate as weight", () => {
    const row = lane({
      pricing_model: "per_mt_km",
      per_mt_rate: 3140,
      rate_type: "per_trip",
      default_load_tons: 30,
    });
    expect(isWeightBasedLane(row)).toBe(true);
    expect(laneUnitRatePerMt(row)).toBe(3140);
    expect(resolveLaneSaleAmount(row)).toBe(94200);
  });

  it("does not stamp raw ₹/MT as the trip total when tons are missing", () => {
    const row = lane({
      pricing_model: "per_mt_km",
      per_mt_rate: 3140,
      rate_type: "per_trip",
    });
    expect(resolveLaneSaleAmount(row)).toBeNull();
    expect(buildClientLanePrefill(row).clientPrice).toBe("");
    expect(buildClientLanePrefill(row).saleUnitRate).toBe(3140);
  });

  it("allows convert when only the unit rate is set", () => {
    expect(
      hasConvertibleSale({ basis: "per_mt", unitRate: 3140, clientPrice: 0 }),
    ).toBe(true);
  });
});
