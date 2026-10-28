import {
  buildManifestJourneyLogs,
  getManifestCurrentStepIndex,
  getVisibleManifestJourneyLogs,
} from "@/features/trips/utils/manifestJourneyLog.util";
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
});
