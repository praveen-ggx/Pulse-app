import {
  hasIncomingAssignableTrips,
  isIncomingAssignableTrip,
  shouldShowDriverAvailableSurface,
} from "@/features/driver/utils/driverIncomingAssignment.util";

describe("driverIncomingAssignment.util", () => {
  it("treats assigned-not-started as incoming", () => {
    expect(isIncomingAssignableTrip({ status: "assigned", started_at: null })).toBe(
      true,
    );
    expect(
      isIncomingAssignableTrip({
        status: "assigned",
        started_at: "2026-11-24T10:00:00Z",
      }),
    ).toBe(false);
    expect(
      isIncomingAssignableTrip({ status: "in_transit", started_at: null }),
    ).toBe(false);
  });

  it("detects any incoming trip in a list", () => {
    expect(
      hasIncomingAssignableTrips([
        { status: "completed", started_at: null },
        { status: "assigned", started_at: null },
      ]),
    ).toBe(true);
    expect(
      hasIncomingAssignableTrips([{ status: "in_transit", started_at: "x" }]),
    ).toBe(false);
  });

  it("keeps Available off when an assignment is waiting", () => {
    const base = {
      participationKnown: true,
      availabilityLoading: false,
      availabilityError: false,
      isDcoEligible: true,
      available: true as boolean | undefined,
      hasIncomingAssignment: false,
      incomingAssignmentKnown: true,
    };
    expect(shouldShowDriverAvailableSurface(base)).toBe(true);
    expect(
      shouldShowDriverAvailableSurface({
        ...base,
        hasIncomingAssignment: true,
      }),
    ).toBe(false);
    expect(
      shouldShowDriverAvailableSurface({
        ...base,
        incomingAssignmentKnown: false,
      }),
    ).toBe(false);
    expect(
      shouldShowDriverAvailableSurface({
        ...base,
        available: false,
      }),
    ).toBe(false);
  });
});
