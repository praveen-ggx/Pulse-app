import {
  applyAssignmentPaintToTrip,
  dismissAssignmentConfirm,
  liveAssignmentDriverName,
  peekAssignmentPaint,
  publishAssignmentPaint,
} from "@/features/trips/utils/assignmentPaint.util";

describe("assignmentPaint", () => {
  it("wins over a stale fallback name for the same trip", () => {
    publishAssignmentPaint({
      tripId: "t1",
      driverName: "Zenith",
      vehicleLabel: "TG12T2777",
      vehicleType: "Trailer",
      focus: "vehicle",
      confirm: true,
    });
    expect(peekAssignmentPaint()?.focus).toBe("vehicle");
    expect(liveAssignmentDriverName("t1", "Old")).toBe("Zenith");
    dismissAssignmentConfirm();
    expect(peekAssignmentPaint()?.confirm).toBe(false);
    expect(liveAssignmentDriverName("t1", "Old")).toBe("Zenith");
    expect(
      applyAssignmentPaintToTrip({
        id: "t1",
        vehicle_display_number: "TG12T2777",
      }).vehicle_display_number,
    ).toBe("TG12T2777");
    publishAssignmentPaint({
      tripId: "t1",
      driverName: "Zenith",
      vehicleLabel: "TG12T2788",
      confirm: false,
    });
    expect(
      applyAssignmentPaintToTrip({
        id: "t1",
        vehicle_display_number: "TG12T2777",
      }).vehicle_display_number,
    ).toBe("TG12T2788");
  });
});
