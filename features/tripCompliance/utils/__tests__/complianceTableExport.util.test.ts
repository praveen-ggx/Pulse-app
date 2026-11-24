import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { buildComplianceTableSheetRows } from "@/features/tripCompliance/utils/complianceTableExport.util";

function summary(id: string, supplierName: string | null = null): ComplianceTripSummary {
  return {
    trip: {
      id,
      trip_number: id,
      supplier_name: supplierName,
      client_name: "Apollo",
      pickup_area: "Perambra",
      drop_location: "Cuttack",
      vehicle_display_number: "TN34AJ2946",
      status: "delivered",
    },
    stage: "pending_for_docs",
    documentCounts: { total: 0, approved: 0, pending: 0, rejected: 0, missing: 0 },
    documents: [],
    vehicleDocuments: [],
    driverDocuments: [],
    advance: null,
    balance: null,
  } as unknown as ComplianceTripSummary;
}

describe("complianceTableExport.util — Vendor Name", () => {
  it("uses the resolved vendor shown on screen when the trip row has none", () => {
    const [row] = buildComplianceTableSheetRows([summary("t1")], true, { t1: "Sri Balaji Transports" });
    expect(row["Vendor Name"]).toBe("Sri Balaji Transports");
  });

  it("falls back to the trip's own supplier name", () => {
    const [row] = buildComplianceTableSheetRows([summary("t2", "KPN Logistics")], true, {});
    expect(row["Vendor Name"]).toBe("KPN Logistics");
  });

  it("ignores the — placeholder and leaves the cell blank when nothing is known", () => {
    const [row] = buildComplianceTableSheetRows([summary("t3")], true, { t3: "—" });
    expect(row["Vendor Name"]).toBe("");
  });
});
