import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  listBulkPodParties,
  listBulkPodTripsForParty,
  tripNeedsHardCopyPod,
} from "@/features/tripCompliance/utils/bulkHardCopyPod.util";

function summary(partial: {
  id: string;
  supplierId?: string;
  supplierName?: string;
  driverId?: string;
  driverName?: string;
  received?: boolean;
  client?: string;
}): ComplianceTripSummary {
  return {
    trip: {
      id: partial.id,
      supplier_id: partial.supplierId ?? null,
      supplier_name: partial.supplierName ?? null,
      driver_id: partial.driverId ?? null,
      driver_display_name: partial.driverName ?? null,
      client_name: partial.client ?? "Sunflag",
      pickup_area: "Pune",
      drop_location: "Nagpur",
      vehicle_display_number: "MH12AB1234",
    },
    stage: "hard_copy_pod_received",
    documents: [],
    balance: null,
    hardCopyPod: {
      received: partial.received === true,
      receivedAt: partial.received ? "2026-10-25" : null,
      courier: null,
      awbNumber: null,
      receivedBy: null,
      lrNumbers: ["LR-1"],
    },
  } as ComplianceTripSummary;
}

describe("bulkHardCopyPod.util", () => {
  it("keeps only awaiting trips that still need a hard-copy POD", () => {
    expect(tripNeedsHardCopyPod(summary({ id: "a" }))).toBe(true);
    expect(tripNeedsHardCopyPod(summary({ id: "b", received: true }))).toBe(false);
  });

  it("groups missing hard-copy trips by supplier or driver", () => {
    const rows = [
      summary({ id: "1", supplierId: "s1", supplierName: "Radhe", driverId: "d1", driverName: "Amit" }),
      summary({ id: "2", supplierId: "s1", supplierName: "Radhe", driverId: "d2", driverName: "Ravi" }),
      summary({ id: "3", supplierId: "s2", supplierName: "Sivan", received: true }),
    ];
    expect(listBulkPodParties(rows, "supplier").map((row) => [row.id, row.tripCount])).toEqual([
      ["s1", 2],
    ]);
    expect(listBulkPodParties(rows, "driver").map((row) => [row.name, row.tripCount])).toEqual([
      ["Amit", 1],
      ["Ravi", 1],
    ]);
  });

  it("lists selectable trips for the chosen party", () => {
    const rows = [
      summary({ id: "1", supplierId: "s1", supplierName: "Radhe", client: "Sunflag" }),
      summary({ id: "2", supplierId: "s1", supplierName: "Radhe", client: "Apollo" }),
      summary({ id: "3", supplierId: "s2", supplierName: "Sivan" }),
    ];
    const trips = listBulkPodTripsForParty(rows, "supplier", "s1", {}, (item) => item.trip.id);
    expect(trips.map((row) => row.tripId)).toEqual(["1", "2"]);
    expect(trips[0]?.route).toBe("Pune → Nagpur");
  });
});
