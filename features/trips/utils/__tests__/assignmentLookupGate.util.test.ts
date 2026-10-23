import {
  assignmentLookupBlocksSubmit,
  isBusyOnExcludedTrip,
  isCurrentAssignedPhone,
} from "@/features/trips/utils/assignmentLookupGate.util";

describe("assignmentLookupGate", () => {
  it("matches assigned phones by last 10 digits", () => {
    expect(isCurrentAssignedPhone("9888466754", "+91 98884 66754")).toBe(true);
    expect(isCurrentAssignedPhone("9888466755", "9888466754")).toBe(false);
    expect(isCurrentAssignedPhone("98884", "9888466754")).toBe(false);
  });

  it("does not block confirm for the current assigned driver", () => {
    expect(
      assignmentLookupBlocksSubmit({
        inTrip: true,
        loading: true,
        skipDriverSteps: false,
        isCurrentAssignedPhone: true,
      }),
    ).toBe(false);
  });

  it("does not block confirm when only the vehicle is changing", () => {
    expect(
      assignmentLookupBlocksSubmit({
        inTrip: true,
        loading: true,
        skipDriverSteps: true,
        isCurrentAssignedPhone: false,
      }),
    ).toBe(false);
  });

  it("blocks confirm when a different driver is busy or still looking up", () => {
    expect(
      assignmentLookupBlocksSubmit({
        inTrip: true,
        loading: false,
        skipDriverSteps: false,
        isCurrentAssignedPhone: false,
      }),
    ).toBe(true);
    expect(
      assignmentLookupBlocksSubmit({
        inTrip: false,
        loading: true,
        skipDriverSteps: false,
        isCurrentAssignedPhone: false,
      }),
    ).toBe(true);
  });

  it("treats the excluded trip as not a conflict", () => {
    expect(isBusyOnExcludedTrip("trip-a", "trip-a")).toBe(true);
    expect(isBusyOnExcludedTrip("trip-a", "trip-b")).toBe(false);
  });
});
