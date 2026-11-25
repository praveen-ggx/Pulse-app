import {
  formatTruckTypeWithSize,
  resolveComplianceTruckTypeLabel,
} from "@/features/tripCompliance/utils/complianceTruckType.util";

describe("formatTruckTypeWithSize", () => {
  it("joins type and size", () => {
    expect(formatTruckTypeWithSize("Closed Container", "20 FT")).toBe("Closed Container · 20 FT");
    expect(formatTruckTypeWithSize(" 20 ft ", null)).toBe("20 ft");
    expect(formatTruckTypeWithSize(null, "20 FT")).toBe("20 FT");
    expect(formatTruckTypeWithSize(null, null)).toBe("");
  });
});

describe("resolveComplianceTruckTypeLabel", () => {
  it("prefers indent over lane and vehicle master", () => {
    expect(
      resolveComplianceTruckTypeLabel({
        indentVehicleType: "20 FT",
        laneVehicleType: "Open 20 Feet",
        vehicleType: "Closed Container",
        vehicleSize: "24 MT",
      }),
    ).toBe("20 FT");
  });

  it("uses lane when indent type is blank", () => {
    expect(
      resolveComplianceTruckTypeLabel({
        indentVehicleType: "  ",
        laneVehicleType: "Open 20 Feet",
        vehicleType: "Closed Container",
        vehicleSize: "24 MT",
      }),
    ).toBe("Open 20 Feet");
  });

  it("falls back to vehicle type · size when no contract type", () => {
    expect(
      resolveComplianceTruckTypeLabel({
        indentVehicleType: null,
        laneVehicleType: null,
        vehicleType: "Closed Container",
        vehicleSize: "20 FT",
      }),
    ).toBe("Closed Container · 20 FT");
  });
});
