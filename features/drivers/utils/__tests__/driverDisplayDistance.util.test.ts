import {
  buildGpsOdometerCompareModel,
  formatDriverDisplayDistanceKm,
  formatDriverOfferDistanceKm,
  resolveDriverDisplayDistanceKm,
  resolveDriverOfferDistanceKm,
  resolveDriverOdometerDistanceKm,
  resolveDriverGpsDistanceKm,
} from "@/features/drivers/utils/driverDisplayDistance.util";

describe("driverDisplayDistance.util", () => {
  it("prefers odometer_distance_km over planned distance for display", () => {
    expect(
      resolveDriverDisplayDistanceKm({
        distance: 702,
        odometer_distance_km: 4445,
      }),
    ).toBe(4445);
  });

  it("offer distance never uses odometer or GPS totals", () => {
    expect(
      resolveDriverOfferDistanceKm({
        distance: 702,
        odometer_distance_km: 4445,
        gps_distance_km: 710,
      }),
    ).toBe(702);
    expect(
      formatDriverOfferDistanceKm({
        distance: 702,
        odometer_distance_km: 4445,
      }),
    ).toBe("702 km");
  });

  it("uses odometer start/end delta when trip km is missing", () => {
    expect(
      resolveDriverOdometerDistanceKm({
        distance: null,
        start_odometer_km: 25555,
        end_odometer_km: 30000,
      }),
    ).toBe(4445);
    expect(
      resolveDriverDisplayDistanceKm({
        distance: null,
        start_odometer_km: 25555,
        end_odometer_km: 30000,
      }),
    ).toBe(4445);
  });

  it("exposes GPS separately from odometer", () => {
    expect(
      resolveDriverGpsDistanceKm({
        distance: 702,
        odometer_distance_km: 4445,
        gps_distance_km: 698,
      }),
    ).toBe(698);
  });

  it("builds compare model with conflict when Δ ≥ 10", () => {
    const model = buildGpsOdometerCompareModel({
      odometer_distance_km: 4445,
      gps_distance_km: 700,
      distance: 702,
    });
    expect(model.canCompare).toBe(true);
    expect(model.hasConflict).toBe(true);
    expect(model.lead).toBe("odometer");
    expect(model.alertText).toMatch(/Odometer is higher/i);
  });

  it("marks aligned when Δ under threshold", () => {
    const model = buildGpsOdometerCompareModel({
      odometer_distance_km: 705,
      gps_distance_km: 700,
    });
    expect(model.hasConflict).toBe(false);
    expect(model.alertText).toMatch(/align/i);
  });

  it("falls back to planned distance when no odo/gps", () => {
    expect(
      resolveDriverDisplayDistanceKm({
        distance: "702 km",
      }),
    ).toBe(702);
  });

  it("formats with locale separators", () => {
    expect(
      formatDriverDisplayDistanceKm(
        { odometer_distance_km: 4445 },
        { unit: "KM" },
      ),
    ).toBe("4,445 KM");
  });

  it("returns empty when nothing usable", () => {
    expect(resolveDriverDisplayDistanceKm({ distance: null })).toBeNull();
    expect(formatDriverDisplayDistanceKm({ distance: "—" })).toBe("—");
  });
});
