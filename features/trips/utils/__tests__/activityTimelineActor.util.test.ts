import {
  collectActivityTimelineActorIds,
  formatActivityTimelineActorLabel,
} from "@/features/trips/utils/activityTimelineActor.util";

describe("activityTimelineActor", () => {
  it("collects assignment and status actor ids", () => {
    expect(
      collectActivityTimelineActorIds([
        {
          kind: "status",
          id: "a",
          status_label: "Assigned",
          changed_at: "2026-10-24T12:00:00.000Z",
          status_context: "assigned",
          detail_line: "Zenith",
          actorUserId: "user-1",
        },
        {
          kind: "assignment",
          row: {
            id: "r1",
            trip_id: "t1",
            event_type: "assignment",
            driver_id_prev: null,
            driver_id_new: "d1",
            vehicle_id_prev: null,
            vehicle_id_new: "v1",
            changed_at: "2026-10-24T12:00:00.000Z",
            changed_by: "user-1",
          },
        },
      ]),
    ).toEqual(["user-1"]);
  });

  it("names the current user and other staff", () => {
    expect(
      formatActivityTimelineActorLabel({
        actorUserId: "u1",
        currentUserId: "u1",
        displayById: { u1: "Nihas" },
        fallback: "Dispatcher",
      }),
    ).toBe("Nihas (you)");
    expect(
      formatActivityTimelineActorLabel({
        actorUserId: "u2",
        currentUserId: "u1",
        displayById: { u2: "Vasanth" },
        fallback: "Dispatcher",
      }),
    ).toBe("Vasanth");
  });

  it("uses a stored staff name when created_by is not a user id", () => {
    expect(
      formatActivityTimelineActorLabel({
        actorUserId: "Nihas",
        currentUserId: "u1",
        displayById: {},
        fallback: "Staff",
      }),
    ).toBe("Nihas");
  });
});
