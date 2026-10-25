import { buildTripAuditLog, matchesTripAuditTab } from "@/lib/trips/buildTripAuditLog.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { DriverActivityTimelineRow } from "@/features/trips/components/trip-detail/hooks/useTripDetail";

const trip = {
  id: "t1",
  organization_id: "o1",
  created_at: "2026-10-20T10:00:00.000Z",
  created_by_user_id: "u1",
} as TripRow;

const timeline: DriverActivityTimelineRow[] = [
  {
    id: "status-created",
    kind: "status",
    changed_at: "2026-10-20T10:00:00.000Z",
    status_context: "created",
    status_label: "created trip",
  } as DriverActivityTimelineRow,
  {
    id: "status-transit",
    kind: "status",
    changed_at: "2026-10-21T08:00:00.000Z",
    status_context: "in_transit",
    status_label: "marked in transit",
  } as DriverActivityTimelineRow,
];

describe("buildTripAuditLog compliance scope", () => {
  it("keeps card milestones and drops trip created / in-transit", () => {
    const entries = buildTripAuditLog({
      trip,
      tripRef: "SAT1",
      assignmentAuditRows: [],
      assignmentDriverNames: {},
      assignmentVehicleLabels: {},
      timelineRows: timeline,
      transactions: [],
      scope: "compliance",
      milestones: [
        {
          id: "doc-1",
          at: "2026-10-22T09:00:00.000Z",
          title: "uploaded LR",
          detail: "lr.pdf",
          contextLabel: "Document Upload",
          lane: "document",
          actorUserId: "u2",
        },
      ],
    });
    expect(entries.map((row) => row.title)).toEqual(["uploaded LR"]);
    expect(entries[0].category).toBe("document");
    expect(matchesTripAuditTab(entries[0], "documents")).toBe(true);
    expect(matchesTripAuditTab(entries[0], "activity")).toBe(false);
  });
});
