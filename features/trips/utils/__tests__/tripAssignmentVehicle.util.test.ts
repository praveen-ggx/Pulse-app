import {
  assignedVehiclePlate,
  tripAssignmentVehicleWrite,
} from "@/features/trips/utils/tripAssignmentVehicle.util";

describe("assignedVehiclePlate", () => {
  it("reads the plate from the label the manifest already shows", () => {
    expect(
      assignedVehiclePlate({
        vehicleLabel: "TN43R43553 · Trailer",
        vehicleDisplayNumber: null,
      }),
    ).toBe("TN43R43553");
  });

  it("does not treat Pending as assigned", () => {
    expect(assignedVehiclePlate({ vehicleLabel: "Pending" })).toBe("");
  });
});

describe("tripAssignmentVehicleWrite", () => {
  it("keeps vehicle_id when only a plate is typed", () => {
    expect(
      tripAssignmentVehicleWrite({
        resolvedVehicleId: null,
        plate: "TN43R43553",
      }),
    ).toEqual({ vehicle_display_number: "TN43R43553" });
  });

  it("writes the garage id when the plate matches a known truck", () => {
    expect(
      tripAssignmentVehicleWrite({
        resolvedVehicleId: "veh-1",
        plate: "TN43R43553",
      }),
    ).toEqual({
      vehicle_id: "veh-1",
      vehicle_display_number: "TN43R43553",
    });
  });

  it("clears only when asked", () => {
    expect(
      tripAssignmentVehicleWrite({
        plate: "TN43R43553",
        clearVehicle: true,
      }),
    ).toEqual({
      vehicle_id: null,
      vehicle_display_number: "TN43R43553",
    });
  });
});
