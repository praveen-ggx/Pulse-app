/**
 * End-to-end util coverage for Ground Ops simulate → Journey + Activity clocks.
 * Does not click the UI; covers the same note shape the Ground Ops RPC writes.
 */
import { buildTripAuditLog } from "@/lib/trips/buildTripAuditLog.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import { buildManifestJourneyLogs } from "@/features/trips/utils/manifestJourneyLog.util";
import {
  parseTripSimulationNotes,
  unrevokedBisimEntries,
} from "@/features/trips/utils/simulateTripStage.util";
import { revokeGroundOpsPickupStatus } from "@/features/trips/services/groundOpsPickup.service";

const tripBase = {
  id: "t-go-1",
  organization_id: "o1",
  created_at: "2026-11-11T10:00:00.000Z",
  created_by_user_id: "u1",
  pickup_area: "Perambra, Kerala",
} as TripRow;

describe("Ground Ops simulate → Journey + Activity (util e2e)", () => {
  const stageAt = "2026-11-20T11:00:00.000Z";
  const savedAt = "2026-11-23T11:53:00.000Z";
  /** Shape matches 20271123101500 migration with editedAt. */
  const notesWithEditedAt = `[BISIM|in_progress|${stageAt}|||Saravanan|assigned||${savedAt}]`;
  /** Shape still on preprod if SQL Editor never re-ran the editedAt revision. */
  const notesWithoutEditedAt = `[BISIM|in_progress|${stageAt}|||Saravanan|assigned]`;

  it("parses Ground Ops BISIM with editedAt for both clocks", () => {
    const { sims } = parseTripSimulationNotes(notesWithEditedAt);
    expect(sims).toHaveLength(1);
    expect(sims[0]?.timestamp).toBe(stageAt);
    expect(sims[0]?.editedAt).toBe(savedAt);
    expect(sims[0]?.userName).toBe("Saravanan");
    expect(unrevokedBisimEntries(notesWithEditedAt)[0]?.editedAt).toBe(savedAt);
  });

  it("Journey: right side = picker, under stage = save clock when editedAt present", () => {
    const logs = buildManifestJourneyLogs({
      trip: {
        ...tripBase,
        status: "in_progress",
        started_at: stageAt,
        updated_at: savedAt,
        notes: notesWithEditedAt,
      } as TripRow,
      assignmentAuditRows: [],
      simLogs: [
        {
          status: "in_progress",
          timestamp: stageAt,
          lat: null,
          lng: null,
          userName: "Saravanan",
          editedAt: savedAt,
        },
      ],
      statusAuditRows: [
        {
          status_to: "in_progress",
          changed_by: "u-sara",
          changed_at: savedAt,
        },
      ],
      actorNameById: { "u-sara": "Saravanan" },
    });
    const pickup = logs.find((row) => row.stepKey === "pickup");
    expect(pickup?.atIso).toBe(stageAt);
    expect(pickup?.history?.[0]?.atIso).toBe(savedAt);
    expect(pickup?.history?.[0]?.actor).toMatch(/Saravanan/i);
    expect(pickup?.atIso).not.toBe(pickup?.history?.[0]?.atIso);
  });

  it("Journey: without editedAt, under stage uses updated_at — not picker time", () => {
    const logs = buildManifestJourneyLogs({
      trip: {
        ...tripBase,
        status: "in_progress",
        started_at: stageAt,
        updated_at: savedAt,
        notes: notesWithoutEditedAt,
      } as TripRow,
      assignmentAuditRows: [],
      simLogs: [
        {
          status: "in_progress",
          timestamp: stageAt,
          lat: null,
          lng: null,
          userName: "Saravanan",
        },
      ],
    });
    const pickup = logs.find((row) => row.stepKey === "pickup");
    expect(pickup?.atIso).toBe(stageAt);
    expect(pickup?.history?.[0]?.atIso).toBe(savedAt);
  });

  it("Activity: names actor, uses edit time, keeps Stage time for picker", () => {
    const entries = buildTripAuditLog({
      trip: {
        ...tripBase,
        status: "in_progress",
        started_at: stageAt,
        updated_at: savedAt,
        notes: notesWithEditedAt,
      } as TripRow,
      tripRef: "SAT812GOGTRIP002326",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: [],
      transactions: [],
      currentUserId: "u-sara",
      userDisplayById: { "u-sara": "Saravanan" },
      statusAuditRows: [
        {
          id: "a1",
          status_from: "assigned",
          status_to: "in_progress",
          changed_by: "u-sara",
          changed_at: savedAt,
        },
      ],
    });
    const pickup = entries.find((row) => row.title === "simulated pickup");
    expect(pickup?.recordedBy).toMatch(/Saravanan/i);
    expect(pickup?.at).toBe(savedAt);
    expect(pickup?.detail).toMatch(/Stage time/i);
    expect(pickup?.detail).toMatch(/20 Nov 2026/i);
    expect(entries.some((row) => row.title === "edited this trip")).toBe(false);
  });

  it("blocks Ground Ops revoke at the service layer", async () => {
    const result = await revokeGroundOpsPickupStatus("t-go-1");
    expect(result.ok).toBe(false);
  });
});
