import {
  buildTripLocalAssignmentPatch,
  suggestedNameForPhoneLookup,
  tripLocalDriverDisplayName,
} from "@/features/trips/utils/tripLocalAssignment.util";

describe("tripLocalDriverDisplayName", () => {
  it("rejects the generic profile label Driver", () => {
    expect(tripLocalDriverDisplayName("Driver")).toBeNull();
    expect(tripLocalDriverDisplayName("  ")).toBeNull();
  });

  it("keeps a trip-specific label", () => {
    expect(tripLocalDriverDisplayName("ZZ")).toBe("ZZ");
  });
});

describe("suggestedNameForPhoneLookup", () => {
  it("fills the app name when the field is still unlocked", () => {
    expect(
      suggestedNameForPhoneLookup({
        currentName: "",
        suggestedAppName: "Ravi",
        nameOwnedLocally: false,
      }),
    ).toBe("Ravi");
  });

  it("replaces a leftover name when the number changes", () => {
    expect(
      suggestedNameForPhoneLookup({
        currentName: "Old leftover",
        suggestedAppName: "Ravi",
        nameOwnedLocally: false,
      }),
    ).toBe("Ravi");
  });

  it("does not overwrite a locally edited name for the same phone", () => {
    expect(
      suggestedNameForPhoneLookup({
        currentName: "ZZ",
        suggestedAppName: "Ravi",
        nameOwnedLocally: true,
      }),
    ).toBe("ZZ");
  });
});

describe("buildTripLocalAssignmentPatch", () => {
  it("writes the trip label and plate without a profile name field", () => {
    const patch = buildTripLocalAssignmentPatch({
      driverDisplayName: "On this trip",
      vehicleId: "veh-1",
      vehicleDisplayNumber: "TN18D2522",
    });
    expect(patch).toEqual({
      driver_display_name: "On this trip",
      vehicle_id: "veh-1",
      vehicle_display_number: "TN18D2522",
    });
    expect(patch).not.toHaveProperty("name");
  });
});
