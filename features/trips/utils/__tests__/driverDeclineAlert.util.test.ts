import {
  isDriverDeclineAuditRow,
  recentEventsSuggestDriverDecline,
  shouldOpenChangeDriverAfterUnassign,
} from "@/features/trips/utils/driverDeclineAlert.util";

describe("driverDeclineAlert.util", () => {
  it("detects decline-shaped audit rows", () => {
    expect(
      isDriverDeclineAuditRow({
        event_type: "reassignment",
        driver_id_prev: "d1",
        driver_id_new: null,
        changed_by: "u1",
      }),
    ).toBe(true);
    expect(
      isDriverDeclineAuditRow({
        event_type: "declined_pending",
        driver_id_prev: "d1",
        driver_id_new: null,
      }),
    ).toBe(true);
    expect(
      isDriverDeclineAuditRow({
        event_type: "assignment",
        driver_id_prev: null,
        driver_id_new: "d1",
      }),
    ).toBe(false);
  });

  it("detects decline language in recent events", () => {
    expect(
      recentEventsSuggestDriverDecline([
        {
          id: "1",
          content: "vasanth declined or was removed from the trip",
          message_type: "assignment_update",
          sender_role: "system",
          sender_name: "Pulse",
          created_at: "2026-11-24T16:00:00Z",
          metadata: null,
        },
      ]),
    ).toBe(true);
    expect(
      recentEventsSuggestDriverDecline([
        {
          id: "1",
          content: "Driver assigned",
          message_type: "assignment_update",
          sender_role: "system",
          sender_name: "Pulse",
          created_at: "2026-11-24T16:00:00Z",
          metadata: null,
        },
      ]),
    ).toBe(false);
  });

  it("opens change-driver only on had-driver → none with assign rights", () => {
    expect(
      shouldOpenChangeDriverAfterUnassign({
        previousDriverId: "d1",
        nextDriverId: null,
        canAssign: true,
      }),
    ).toBe(true);
    expect(
      shouldOpenChangeDriverAfterUnassign({
        previousDriverId: "d1",
        nextDriverId: null,
        canAssign: false,
      }),
    ).toBe(false);
    expect(
      shouldOpenChangeDriverAfterUnassign({
        previousDriverId: null,
        nextDriverId: null,
        canAssign: true,
      }),
    ).toBe(false);
  });
});
