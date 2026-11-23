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
    const assigned = logs.find((row) => row.stepKey === "assigned");
    expect(assigned?.atIso).toBe("2026-08-13T06:00:00.000Z");
    expect(assigned?.history?.map((line) => line.action)).toEqual(
      expect.arrayContaining([
        "Assigned · driver Ravi · vehicle TN 01 AB 1234",
        "Reassigned · driver Ravi → Imran · vehicle TN 01 AB 1234",
      ]),
    );
    expect(assigned?.history?.map((line) => line.actor)).toEqual(["Meena", "Meena"]);
    const accepted = logs.find((row) => row.stepKey === "driver_accepted");
    expect(accepted?.history?.map((line) => line.action) ?? []).toEqual([]);
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
    // A row with no changed_by stays blank. It does not borrow another person.
    expect(actors.every((name) => name === "Nihas" || name === "")).toBe(true);
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

  it("shows the revised Pickup time after In Transit is revoked", () => {
    const revisedPickup = "2026-11-01T06:00:00.000Z";
    const tripRow = {
      ...trip,
      status: "in_progress",
      started_at: revisedPickup,
      updated_at: "2026-11-12T10:00:00.000Z",
      notes: [
        "[BISIM|in_progress|2026-11-10T08:00:00.000Z|1|2|Ops|assigned|Pickup]",
        "[BISIM|in_transit|2026-11-12T09:30:00.000Z|1|2|Ops|in_progress|Route]",
        "[BISIM_REVOKE|in_transit|in_progress|2026-11-12T10:00:00.000Z|1|2|Ops]",
      ].join("\n"),
    } as TripRow;
    const logs = buildManifestJourneyLogs({
      trip: tripRow,
      assignmentAuditRows: [],
      simLogs: [
        {
          status: "in_progress",
          timestamp: "2026-11-10T08:00:00.000Z",
          lat: 19.07,
          lng: 72.87,
          userName: "Ops",
          locationLabel: "Mumbai, Maharashtra",
        },
      ],
    });
    expect(logs.find((row) => row.stepKey === "pickup")?.atIso).toBe(revisedPickup);
    expect(logs.find((row) => row.stepKey === "pickup")?.history?.[0]?.atIso).toBe(
      tripRow.updated_at,
    );
    expect(
      logs.find((row) => row.stepKey === "in_transit")?.history?.some((line) =>
        line.atIso === "2026-11-12T09:30:00.000Z",
      ),
    ).toBe(false);
    const visible = getVisibleManifestJourneyLogs(
      logs,
      getManifestCurrentStepIndex(tripRow),
    );
    expect(visible.some((row) => row.stepKey === "in_transit")).toBe(false);
    expect(visible[visible.length - 1]?.stepKey).toBe("pickup");
  });

  it("shows a Pickup re-saved after revoke instead of the previous started_at", () => {
    const revisedPickup = "2026-11-05T04:30:00.000Z";
    const transitAt = "2026-11-05T04:36:00.000Z";
    const tripRow = {
      ...trip,
      status: "in_transit",
      started_at: "2026-11-10T08:00:00.000Z",
      updated_at: "2026-11-18T02:20:00.000Z",
      notes: [
        "[BISIM|in_progress|2026-11-10T08:00:00.000Z|1|2|Ops|assigned|Pickup]",
        "[BISIM_REVOKE|in_transit|in_progress|2026-11-12T10:00:00.000Z|1|2|Ops]",
        `[BISIM|in_progress|${revisedPickup}|1|2|Ops|assigned|Pickup]`,
        `[BISIM|in_transit|${transitAt}|1|2|Ops|in_progress|Route]`,
      ].join("\n"),
    } as TripRow;
    const logs = buildManifestJourneyLogs({
      trip: tripRow,
      assignmentAuditRows: [],
      simLogs: [
        {
          status: "in_progress",
          timestamp: "2026-11-10T08:00:00.000Z",
          lat: null,
          lng: null,
          userName: "Ops",
          locationLabel: "Old pickup",
        },
        {
          status: "in_progress",
          timestamp: revisedPickup,
          lat: null,
          lng: null,
          userName: "Ops",
          locationLabel: "Perambra",
        },
        {
          status: "in_transit",
          timestamp: transitAt,
          lat: null,
          lng: null,
          userName: "Ops",
          locationLabel: "Perambra",
        },
      ],
    });
    expect(logs.find((row) => row.stepKey === "pickup")?.atIso).toBe(revisedPickup);
    // Right side stays the picker; under-stage uses save clock (updated_at when
    // the note has no editedAt), never the picker instant.
    expect(logs.find((row) => row.stepKey === "pickup")?.history?.[0]?.atIso).toBe(
      tripRow.updated_at,
    );
    expect(logs.find((row) => row.stepKey === "in_transit")?.atIso).toBe(transitAt);
    expect(logs.find((row) => row.stepKey === "in_transit")?.history?.[0]?.atIso).toBe(
      tripRow.updated_at,
    );
  });

  it("keeps each stage's last editor and time independent", () => {
    const logs = buildManifestJourneyLogs({
      trip: {
        ...trip,
        status: "in_transit",
        driver_id: "driver-1",
        started_at: "2026-11-10T09:10:00.000Z",
        updated_at: "2026-11-20T09:25:00.000Z",
        assigned_by_user_id: "jeeva",
        created_by_user_id: "smk",
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
          changed_at: "2026-11-11T15:27:00.000Z",
          changed_by: "smk",
        },
        {
          id: "a2",
          trip_id: "t1",
          event_type: "reassignment",
          driver_id_prev: "driver-1",
          driver_id_new: "driver-1",
          vehicle_id_prev: null,
          vehicle_id_new: null,
          changed_at: "2026-11-11T15:49:00.000Z",
          changed_by: "jeeva",
        },
        {
          id: "a3",
          trip_id: "t1",
          event_type: "driver_accepted",
          driver_id_prev: "driver-1",
          driver_id_new: "driver-1",
          vehicle_id_prev: null,
          vehicle_id_new: null,
          changed_at: "2026-11-11T16:05:00.000Z",
          changed_by: "driver-1",
        },
      ],
      actorNameById: {
        smk: "SMK LOGISTICS",
        jeeva: "Jeeva",
        "driver-1": "SELVARAJU S",
      },
      driverNames: { "driver-1": "SELVARAJU S" },
      driverDisplayName: "SELVARAJU S",
      simLogs: [
        {
          status: "in_progress",
          timestamp: "2026-11-10T09:10:00.000Z",
          userName: "Satham Hussain",
          locationLabel: "Perambra, Kerala",
        },
        {
          status: "in_transit",
          timestamp: "2026-11-10T12:25:00.000Z",
          userName: "Satham Hussain",
          locationLabel: "Perambra, Kerala",
        },
      ],
    });
    const assigned = logs.find((row) => row.stepKey === "assigned");
    const accepted = logs.find((row) => row.stepKey === "driver_accepted");
    const pickup = logs.find((row) => row.stepKey === "pickup");
    const transit = logs.find((row) => row.stepKey === "in_transit");

    expect(assigned?.atIso).toBe("2026-11-11T15:49:00.000Z");
    expect(assigned?.history?.at(-1)).toMatchObject({
      actor: "Jeeva",
      atIso: "2026-11-11T15:49:00.000Z",
    });
    expect(assigned?.history?.[0]).toMatchObject({
      actor: "SMK LOGISTICS",
      atIso: "2026-11-11T15:27:00.000Z",
    });

    expect(accepted?.atIso).toBe("2026-11-11T16:05:00.000Z");
    expect(accepted?.history).toEqual([
      expect.objectContaining({
        actor: "SELVARAJU S",
        atIso: "2026-11-11T16:05:00.000Z",
      }),
    ]);

    expect(pickup?.atIso).toBe("2026-11-10T09:10:00.000Z");
    expect(pickup?.history).toEqual([
      expect.objectContaining({
        actor: "Satham Hussain",
        // No editedAt on these sims → under-stage uses trip.updated_at.
        atIso: "2026-11-20T09:25:00.000Z",
      }),
    ]);
    expect(transit?.atIso).toBe("2026-11-10T12:25:00.000Z");
    expect(transit?.history).toEqual([
      expect.objectContaining({
        actor: "Satham Hussain",
        atIso: "2026-11-20T09:25:00.000Z",
      }),
    ]);
  });

  it("shows simulated time on the right and actual last-edit time under the stage", () => {
    const pickupStageAt = "2026-11-14T10:33:00.000Z";
    const transitStageAt = "2026-11-17T06:43:00.000Z";
    const pickupSavedAt = "2026-11-23T07:08:20.000Z";
    const transitSavedAt = "2026-11-23T07:10:00.000Z";
    const notes = [
      "[BISIM_REVOKE|in_transit|in_progress|2026-11-23T07:08:00.000Z|||Satham Hussain]",
      `[BISIM|in_progress|${pickupStageAt}|9.93|76.26|Satham Hussain|assigned|Perambra, Kerala|${pickupSavedAt}]`,
      `[BISIM|in_transit|${transitStageAt}|9.93|76.26|Satham Hussain|in_progress|Perambra, Kerala|${transitSavedAt}]`,
    ].join("\n");
    const logs = buildManifestJourneyLogs({
      trip: {
        ...trip,
        status: "in_transit",
        started_at: pickupStageAt,
        updated_at: transitSavedAt,
        notes,
      } as TripRow,
      assignmentAuditRows: [],
      actorNameById: { satham: "Satham Hussain" },
      simLogs: [
        {
          status: "in_progress",
          timestamp: pickupStageAt,
          userName: "Satham Hussain",
          locationLabel: "Perambra, Kerala",
          editedAt: pickupSavedAt,
        },
        {
          status: "in_transit",
          timestamp: transitStageAt,
          userName: "Business",
          locationLabel: "Perambra, Kerala",
          editedAt: transitSavedAt,
        },
      ],
      statusAuditRows: [
        {
          status_to: "in_progress",
          changed_by: "satham",
          changed_at: pickupSavedAt,
        },
        {
          status_to: "in_transit",
          changed_by: "satham",
          changed_at: transitSavedAt,
        },
      ],
    });
    const pickup = logs.find((row) => row.stepKey === "pickup");
    const transit = logs.find((row) => row.stepKey === "in_transit");
    expect(pickup?.atIso).toBe(pickupStageAt);
    expect(pickup?.history?.[0]).toMatchObject({
      actor: "Satham Hussain",
      atIso: pickupSavedAt,
    });
    expect(transit?.atIso).toBe(transitStageAt);
    expect(transit?.history?.[0]).toMatchObject({
      actor: "Satham Hussain",
      atIso: transitSavedAt,
    });
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
