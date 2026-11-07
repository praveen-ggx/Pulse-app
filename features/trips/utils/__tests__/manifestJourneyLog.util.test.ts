import {
  buildManifestJourneyLogs,
  collectManifestJourneyActorIds,
  getManifestCurrentStepIndex,
  getVisibleManifestJourneyLogs,
  resolveDriverAcceptanceAt,
  resolveManifestAssignerUserId,
} from "@/features/trips/utils/manifestJourneyLog.util";
import { resolveTripAssignedAtIso } from "@/features/trips/utils/simulateTripStage.util";
import type { TripRow } from "@/features/trips/services/trips.service";

const trip = {
  status: "at_drop",
  pickup_area: "Mumbai, Maharashtra",
  drop_location: "Delhi",
  drop_area: "Delhi",
  started_at: "2026-08-18T11:16:00.000Z",
  completed_at: null,
  updated_at: "2026-09-29T12:48:00.000Z",
  created_at: "2026-08-13T04:52:00.000Z",
  driver_id: "driver-1",
} as TripRow;

describe("manifest journey simulation flow", () => {
  it("shows drop-off arrival from the simulation, not as delivered", () => {
    const logs = buildManifestJourneyLogs({
      trip,
      assignmentAuditRows: [],
      simLogs: [
        {
          status: "in_progress",
          timestamp: "2026-08-18T11:16:00.000Z",
          lat: 19.07,
          lng: 72.87,
          userName: "Bhujesh",
          locationLabel: "Mumbai, Maharashtra",
        },
        {
          status: "in_transit",
          timestamp: "2026-09-29T08:09:00.000Z",
          lat: 19.07,
          lng: 72.87,
          userName: "Bhujesh",
          locationLabel: "Mumbai, Maharashtra",
        },
        {
          status: "at_drop",
          timestamp: "2026-09-29T12:48:00.000Z",
          lat: 28.6139,
          lng: 77.209,
          userName: "Bhujesh",
        },
      ],
      simLocationByKey: {
        "at_drop|2026-09-29T12:48:00.000Z": "Kartavya Path, New Delhi, 110001, India",
      },
    });
    const visible = getVisibleManifestJourneyLogs(
      logs,
      getManifestCurrentStepIndex(trip),
    );
    const drop = visible.find((row) => row.stepKey === "drop_off");
    expect(drop?.status).toBe("Arrived at drop-off");
    expect(drop?.location).toBe("Delhi");
    expect(drop?.atIso).toBe("2026-09-29T12:48:00.000Z");
    expect(visible.some((row) => row.stepKey === "delivered")).toBe(false);
    expect(visible.find((row) => row.stepKey === "pickup")?.location).toBe(
      "Mumbai, Maharashtra",
    );
  });

  it("lists assignment change history on the driver-accepted step", () => {
    const logs = buildManifestJourneyLogs({
      trip,
      assignmentAuditRows: [
        {
          id: "a1",
          trip_id: "t1",
          event_type: "assignment",
          driver_id_prev: null,
          driver_id_new: "driver-1",
          vehicle_id_prev: null,
          vehicle_id_new: "veh-1",
          changed_at: "2026-08-13T05:00:00.000Z",
          changed_by: "staff-1",
        },
        {
          id: "a2",
          trip_id: "t1",
          event_type: "reassignment",
          driver_id_prev: "driver-1",
          driver_id_new: "driver-2",
          vehicle_id_prev: "veh-1",
          vehicle_id_new: "veh-1",
          changed_at: "2026-08-13T06:00:00.000Z",
          changed_by: "staff-1",
        },
      ],
      driverNames: { "driver-1": "Ravi", "driver-2": "Imran" },
      vehicleLabels: { "veh-1": "TN 01 AB 1234" },
      actorNameById: { "staff-1": "Meena" },
      driverDisplayName: "Imran",
    });
    const accepted = logs.find((row) => row.stepKey === "driver_accepted");
    expect(accepted?.history?.map((line) => line.action)).toEqual(
      expect.arrayContaining([
        "Assigned · driver Ravi · vehicle TN 01 AB 1234",
        "Reassigned · driver Ravi → Imran · vehicle TN 01 AB 1234",
      ]),
    );
    expect(accepted?.history?.[0]?.actor).toBe("Meena");
  });

  it("never substitutes the viewing member's name or a generic Staff label", () => {
    const logs = buildManifestJourneyLogs({
      trip: {
        ...trip,
        assigned_by_user_id: null,
        created_by_user_id: "creator-1",
        created_at: "2026-08-13T04:52:00.000Z",
      } as TripRow,
      assignmentAuditRows: [
        {
          id: "a1",
          trip_id: "t1",
          event_type: "assignment",
          driver_id_prev: null,
          driver_id_new: "driver-1",
          vehicle_id_prev: null,
          vehicle_id_new: null,
          changed_at: "2026-08-13T05:00:00.000Z",
          changed_by: "staff-other",
        },
        {
          id: "a2",
          trip_id: "t1",
          event_type: "assignment",
          driver_id_prev: null,
          driver_id_new: "driver-1",
          vehicle_id_prev: null,
          vehicle_id_new: null,
          changed_at: "2026-08-13T05:30:00.000Z",
          changed_by: null,
        },
      ],
      actorNameById: {
        "staff-other": "Nihas",
        "creator-1": "Meena Creator",
      },
      currentUserId: "viewer-1",
      staffDisplayName: "Praveen Viewer",
      driverDisplayName: "Ravi",
      simLogs: [
        {
          status: "in_progress",
          timestamp: "2026-08-18T11:16:00.000Z",
          userName: "",
        },
      ],
    });
    const assigned = logs.find((row) => row.stepKey === "assigned");
    const actors = (assigned?.history ?? []).map((line) => line.actor);
    expect(actors).toContain("Nihas");
    // Missing changed_by falls through to the resolved trip assigner (audit),
    // not the viewing member and not a generic Staff label.
    expect(actors.every((name) => name === "Nihas" || name === "Meena Creator")).toBe(
      true,
    );
    expect(actors).not.toContain("Staff");
    expect(actors).not.toContain("Praveen Viewer");
    const pickup = logs.find((row) => row.stepKey === "pickup");
    const simActors = (pickup?.history ?? [])
      .filter((line) => line.action.startsWith("Simulated"))
      .map((line) => line.actor);
    expect(simActors.every((name) => name === "")).toBe(true);
    expect(simActors).not.toContain("Praveen Viewer");
    expect(simActors).not.toContain("Staff");
  });

  it("collectManifestJourneyActorIds gathers trip + audit user ids", () => {
    const ids = collectManifestJourneyActorIds(
      {
        created_by_user_id: "c1",
        assigned_by_user_id: "a1",
        status_updated_by: "s1",
      } as TripRow,
      [
        { changed_by: "x1" } as never,
        { changed_by: "a1" } as never,
      ],
    );
    expect(ids.sort()).toEqual(["a1", "c1", "s1", "x1"]);
  });

  it("resolves assigner from assignment audit changed_by before trip creator", () => {
    expect(
      resolveManifestAssignerUserId(
        {
          created_by_user_id: "creator-1",
          assigned_by_user_id: null,
        } as TripRow,
        [
          {
            id: "a1",
            trip_id: "t1",
            event_type: "assignment",
            driver_id_prev: null,
            driver_id_new: "d1",
            vehicle_id_prev: null,
            vehicle_id_new: null,
            changed_at: "2026-11-02T07:52:00.000Z",
            changed_by: "assigner-9",
          },
        ],
      ),
    ).toBe("assigner-9");

    const logs = buildManifestJourneyLogs({
      trip: {
        ...trip,
        status: "assigned",
        driver_id: "driver-1",
        assigned_by_user_id: null,
        created_by_user_id: "creator-1",
      } as TripRow,
      assignmentAuditRows: [
        {
          id: "a1",
          trip_id: "t1",
          event_type: "assignment",
          driver_id_prev: null,
          driver_id_new: "driver-1",
          vehicle_id_prev: null,
          vehicle_id_new: null,
          changed_at: "2026-11-02T07:52:00.000Z",
          changed_by: "assigner-9",
        },
      ],
      actorNameById: {
        "assigner-9": "Mohamed Asik Hussain",
        "creator-1": "Someone Else",
      },
      driverDisplayName: "RAJESH YERRAGUNTA",
    });
    const assigned = logs.find((row) => row.stepKey === "assigned");
    expect(assigned?.history?.[0]?.actor).toBe("Mohamed Asik Hussain");
    expect(assigned?.history?.[0]?.action).toContain("Assigned");
  });

  it("keeps Assigned on the assignment audit and never borrows updated_at after revoke", () => {
    const assignedAt = "2026-11-07T11:42:00.000Z";
    const tripRow = {
      ...trip,
      status: "assigned",
      started_at: null,
      updated_at: "2026-11-07T12:00:00.000Z",
      created_at: "2026-11-01T00:00:00.000Z",
      driver_id: "driver-1",
    } as TripRow;
    const audits = [
      {
        id: "a1",
        trip_id: "t1",
        event_type: "assignment" as const,
        driver_id_prev: null,
        driver_id_new: "driver-1",
        vehicle_id_prev: null,
        vehicle_id_new: null,
        changed_at: assignedAt,
        changed_by: "staff-1",
      },
      {
        id: "a2",
        trip_id: "t1",
        event_type: "driver_accepted" as const,
        driver_id_prev: "driver-1",
        driver_id_new: "driver-1",
        vehicle_id_prev: null,
        vehicle_id_new: null,
        changed_at: "2026-11-07T11:50:00.000Z",
        changed_by: "driver-1",
      },
    ];
    expect(resolveTripAssignedAtIso(tripRow, audits)).toBe(assignedAt);

    const logs = buildManifestJourneyLogs({
      trip: {
        ...tripRow,
        status: "in_progress",
        started_at: "2026-11-02T06:45:00.000Z",
        updated_at: "2026-11-07T12:05:00.000Z",
        notes:
          "[BISIM|in_progress|2026-11-02T06:45:00.000Z|1|2|Ops|assigned|Pickup]",
      } as TripRow,
      assignmentAuditRows: audits,
      driverDisplayName: "ahjd",
    });
    expect(logs.find((row) => row.stepKey === "assigned")?.atIso).toBe(assignedAt);
    expect(logs.find((row) => row.stepKey === "driver_accepted")?.atIso).toBe(
      "2026-11-07T11:50:00.000Z",
    );
    expect(logs.find((row) => row.stepKey === "pickup")?.atIso).toBe(
      "2026-11-02T06:45:00.000Z",
    );
  });

  it("does not treat Pickup started_at as Driver Accepted", () => {
    expect(
      resolveDriverAcceptanceAt({
        trip: {
          status: "in_progress",
          started_at: "2026-11-02T06:45:00.000Z",
          completed_at: null,
          updated_at: "2026-11-07T12:05:00.000Z",
          notes: null,
        },
        assignmentAuditRows: [],
        assignedAtIso: "2026-11-07T11:42:00.000Z",
      }),
    ).toBeNull();
  });
});
