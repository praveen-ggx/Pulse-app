import { mergeAssignmentIntoTripRow } from "@/features/trips/utils/assignmentCachePatch.util";

describe("mergeAssignmentIntoTripRow", () => {
  it("writes the local driver name onto the trip row immediately", () => {
    const next = mergeAssignmentIntoTripRow(
      {
        id: "t1",
        driver_id: "d1",
        driver_display_name: "Old",
        vehicle_display_number: "TG12T2777",
      },
      { driverDisplayName: "Zenith" },
    );
    expect(next.driver_display_name).toBe("Zenith");
    expect(next.driver_id).toBe("d1");
  });

  it("writes the new plate onto the trip row", () => {
    const next = mergeAssignmentIntoTripRow(
      {
        id: "t1",
        vehicle_id: "v1",
        vehicle_display_number: "OLD11",
      },
      { vehicleId: "v2", vehicleDisplayNumber: "TG12T2777", vehicleType: "Trailer" },
    );
    expect(next.vehicle_id).toBe("v2");
    expect(next.vehicle_display_number).toBe("TG12T2777");
  });
});
