import { readFileSync } from "fs";
import { join } from "path";
import { canAddDcoShippers } from "@/features/drivers/domain/driverOperatingMode";

describe("useDriverOperatingModeQuery source", () => {
  it("returns canAddDcoShippers derived from operatingMode", () => {
    const src = readFileSync(
      join(__dirname, "..", "useDriverOperatingModeQuery.ts"),
      "utf8",
    );
    expect(src).toMatch(/canAddDcoShippers: ready && canAddDcoShippers\(operatingMode\)/);
    expect(src).toMatch(/canTagOfflineParty: ready && canTagOfflineParty\(operatingMode\)/);
    expect(src).toMatch(/canManageDcoSelfBook: ready && canManageDcoSelfBook\(operatingMode\)/);
  });
});

describe("canAddDcoShippers wiring", () => {
  it("is true only for DCO and DCO_VEHICLE_REQUIRED", () => {
    expect(canAddDcoShippers({
      mode: "DCO",
      dcoStatus: "APPROVED",
      isEmployeeDriver: false,
      hasActiveVehicle: true,
      marketplaceAllowed: true,
    })).toBe(true);
    expect(canAddDcoShippers({
      mode: "DCO_VEHICLE_REQUIRED",
      dcoStatus: "APPROVED",
      isEmployeeDriver: false,
      hasActiveVehicle: false,
      marketplaceAllowed: false,
    })).toBe(true);
    expect(canAddDcoShippers({
      mode: "DRIVER",
      dcoStatus: "NONE",
      isEmployeeDriver: true,
      hasActiveVehicle: false,
      marketplaceAllowed: false,
    })).toBe(false);
    expect(canAddDcoShippers({
      mode: "DCO_EMPLOYMENT_CONFLICT",
      dcoStatus: "APPROVED",
      isEmployeeDriver: true,
      hasActiveVehicle: true,
      marketplaceAllowed: false,
    })).toBe(false);
  });
});
