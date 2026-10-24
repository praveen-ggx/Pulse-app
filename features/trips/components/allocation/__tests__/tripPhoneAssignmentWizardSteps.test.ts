import {
  getTripPhoneWizardSteps,
  isTripPhoneWizardStepComplete,
} from "@/features/trips/components/allocation/tripPhoneAssignmentWizardSteps";

const baseState = {
  driverPhone: "9876543210",
  driverName: "Ravi",
  vehiclePlate: "TN18D2522",
  phoneComplete: true,
  phoneLookupLoading: false,
  phoneInTrip: false,
  phoneMatches: [] as const,
  selectedMatchUserId: null,
  vehicleRequired: true,
};

describe("getTripPhoneWizardSteps", () => {
  it("uses Edit → Continue → Confirm for a driver reassign", () => {
    const steps = getTripPhoneWizardSteps({
      isReassign: true,
      reassignFocus: "driver",
      vehicleRequired: true,
    });
    expect(steps.map((step) => step.id)).toEqual([
      "driverPhone",
      "driverName",
      "vehicle",
      "review",
    ]);
  });

  it("skips driver steps when only the vehicle is replaced", () => {
    const steps = getTripPhoneWizardSteps({
      isReassign: true,
      reassignFocus: "vehicle",
      vehicleRequired: true,
    });
    expect(steps.map((step) => step.id)).toEqual(["vehicle", "review"]);
  });
});

describe("isTripPhoneWizardStepComplete", () => {
  it("rejects the generic profile label Driver as a trip name", () => {
    expect(
      isTripPhoneWizardStepComplete("driverName", { ...baseState, driverName: "Driver" }),
    ).toBe(false);
  });

  it("requires a real trip-specific name before Confirm", () => {
    expect(isTripPhoneWizardStepComplete("review", baseState)).toBe(true);
    expect(
      isTripPhoneWizardStepComplete("review", { ...baseState, driverName: "  " }),
    ).toBe(false);
  });

  it("keeps a complete existing plate when the vehicle field is cleared during reassign", () => {
    expect(
      isTripPhoneWizardStepComplete("vehicle", {
        ...baseState,
        vehiclePlate: "",
        existingVehiclePlate: "KA01AB1234",
      }),
    ).toBe(true);
  });
});
