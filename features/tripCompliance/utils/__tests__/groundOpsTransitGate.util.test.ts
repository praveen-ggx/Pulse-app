import type { ComplianceDocumentRow } from "@/features/tripCompliance/tripCompliance.types";
import {
  groundOpsTransitDocLabel,
  listMissingDocsForGroundOpsTransit,
} from "@/features/tripCompliance/utils/groundOpsTransitGate.util";
import {
  isComplianceOpsPipelineTrip,
  selectCompliancePipelineTrips,
} from "@/features/tripCompliance/utils/compliancePipelineTrips.util";
import type { TripRow } from "@/features/trips/services/trips.service";

const NOW = new Date("2026-10-23T10:00:00Z");

function tripDoc(type: string, status: ComplianceDocumentRow["status"] = "pending"): ComplianceDocumentRow {
  return {
    id: `doc-${type}`,
    trip_id: "trip-1",
    document_type: type,
    file_name: `${type}.pdf`,
    storage_path: `org/trip-1/${type}/file.pdf`,
    uploaded_at: "2026-10-23T09:00:00Z",
    status,
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
  };
}

function entityDoc(docType: string, status = "pending", expiry: string | null = "2027-12-31") {
  return { doc_type: docType, status, expiry_date: expiry, storage_path: `vault/${docType}.jpg` };
}

const ALL_TRIP = ["lr", "eway_bill", "invoice", "memo"].map((t) => tripDoc(t));
const ALL_VEHICLE = ["rc", "insurance", "fitness"].map((t) => entityDoc(t));
const ALL_DRIVER = [entityDoc("license")];

describe("listMissingDocsForGroundOpsTransit", () => {
  it("is empty when every required document is on file", () => {
    expect(
      listMissingDocsForGroundOpsTransit(
        { documents: ALL_TRIP, vehicleDocuments: ALL_VEHICLE, driverDocuments: ALL_DRIVER },
        NOW,
      ),
    ).toEqual([]);
  });

  it("lists every required type when nothing is uploaded", () => {
    expect(
      listMissingDocsForGroundOpsTransit(
        { documents: [], vehicleDocuments: [], driverDocuments: [] },
        NOW,
      ),
    ).toEqual(["lr", "eway_bill", "invoice", "memo", "rc", "insurance", "fitness", "license"]);
  });

  it("does not count rejected files", () => {
    const missing = listMissingDocsForGroundOpsTransit(
      {
        documents: [...ALL_TRIP.filter((d) => d.document_type !== "lr"), tripDoc("lr", "rejected")],
        vehicleDocuments: [...ALL_VEHICLE.filter((d) => d.doc_type !== "rc"), entityDoc("rc", "rejected")],
        driverDocuments: ALL_DRIVER,
      },
      NOW,
    );
    expect(missing).toEqual(["lr", "rc"]);
  });

  it("does not count an expired licence", () => {
    expect(
      listMissingDocsForGroundOpsTransit(
        {
          documents: ALL_TRIP,
          vehicleDocuments: ALL_VEHICLE,
          driverDocuments: [entityDoc("license", "verified", "2026-01-01")],
        },
        NOW,
      ),
    ).toEqual(["license"]);
  });

  it("accepts files uploaded without an expiry date", () => {
    expect(
      listMissingDocsForGroundOpsTransit(
        {
          documents: ALL_TRIP,
          vehicleDocuments: ["rc", "insurance", "fitness"].map((t) => entityDoc(t, "pending", null)),
          driverDocuments: [entityDoc("license", "pending", null)],
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("does not count a slot with no file", () => {
    expect(
      listMissingDocsForGroundOpsTransit(
        {
          documents: ALL_TRIP,
          vehicleDocuments: [
            ...ALL_VEHICLE.filter((d) => d.doc_type !== "insurance"),
            { doc_type: "insurance", status: "verified", expiry_date: null, storage_path: null },
          ],
          driverDocuments: ALL_DRIVER,
        },
        NOW,
      ),
    ).toEqual(["insurance"]);
  });

  it("ignores optional documents", () => {
    expect(
      listMissingDocsForGroundOpsTransit(
        {
          documents: [...ALL_TRIP, tripDoc("other")],
          vehicleDocuments: ALL_VEHICLE,
          driverDocuments: ALL_DRIVER,
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("labels types for the dialog", () => {
    expect(groundOpsTransitDocLabel("eway_bill")).toBe("E-way bill");
    expect(groundOpsTransitDocLabel("license")).toBe("Driving licence");
  });
});

describe("Ground Ops queue includes Assigned trips", () => {
  const trip = (status: string, driver: string | null = "drv-1") =>
    ({ id: `t-${status}`, status, driver_id: driver }) as unknown as TripRow;

  it("keeps Assigned trips with a driver only when asked", () => {
    expect(isComplianceOpsPipelineTrip(trip("assigned"))).toBe(false);
    expect(isComplianceOpsPipelineTrip(trip("assigned"), { includeAssigned: true })).toBe(true);
    expect(isComplianceOpsPipelineTrip(trip("assigned", null), { includeAssigned: true })).toBe(false);
  });

  it("leaves the rest of the queue unchanged", () => {
    const trips = [trip("assigned"), trip("in_progress"), trip("in_transit"), trip("completed")];
    expect(selectCompliancePipelineTrips(trips).map((t) => t.status)).toEqual([
      "in_progress",
      "in_transit",
      "completed",
    ]);
    expect(
      selectCompliancePipelineTrips(trips, { includeAssigned: true }).map((t) => t.status),
    ).toEqual(["assigned", "in_progress", "in_transit", "completed"]);
  });
});
