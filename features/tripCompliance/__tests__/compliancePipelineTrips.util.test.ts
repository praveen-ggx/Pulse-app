import {
  isCompletedDeliveredStatus,
  isComplianceOpsPipelineTrip,
  isPendingDocsDeliveredTrip,
  isPendingDocsInTransitTrip,
  selectCompliancePipelineTrips,
} from "@/features/tripCompliance/utils/compliancePipelineTrips.util";
import type { TripRow } from "@/features/trips/services/trips.service";

function trip(partial: Partial<TripRow> & Pick<TripRow, "id" | "status">): TripRow {
  return {
    organization_id: "org-1",
    driver_id: "driver-1",
    vehicle_id: "vehicle-1",
    created_at: "2026-09-01T00:00:00Z",
    ...partial,
  } as TripRow;
}

describe("compliancePipelineTrips", () => {
  it("keeps Loading through Completed and drops Assigned / unknown statuses", () => {
    const rows = [
      trip({ id: "a", status: "assigned" }),
      trip({ id: "b", status: "in_progress" }),
      trip({ id: "c", status: "in_transit" }),
      trip({ id: "d", status: "at_drop" }),
      trip({ id: "e", status: "completed", driver_id: null }),
      trip({ id: "f", status: "cancelled" }),
      trip({ id: "g", status: "weird_status" }),
    ];
    expect(selectCompliancePipelineTrips(rows).map((t) => t.id)).toEqual(["b", "c", "d", "e"]);
  });

  it("recognizes completed/delivered statuses", () => {
    expect(isCompletedDeliveredStatus("completed")).toBe(true);
    expect(isComplianceOpsPipelineTrip(trip({ id: "1", status: "loading" }))).toBe(true);
    expect(isComplianceOpsPipelineTrip(trip({ id: "2", status: "assigned" }))).toBe(false);
  });

  it("splits Pending Docs transit subtabs from trip.status", () => {
    expect(isPendingDocsInTransitTrip({ trip: { status: "in_transit" } })).toBe(true);
    expect(isPendingDocsInTransitTrip({ trip: { status: "at_destination" } })).toBe(true);
    expect(isPendingDocsInTransitTrip({ trip: { status: "loading" } })).toBe(true);
    expect(isPendingDocsDeliveredTrip({ trip: { status: "delivered" } })).toBe(true);
    expect(isPendingDocsDeliveredTrip({ trip: { status: "completed" } })).toBe(true);
    expect(isPendingDocsInTransitTrip({ trip: { status: "delivered" } })).toBe(false);
  });
});
