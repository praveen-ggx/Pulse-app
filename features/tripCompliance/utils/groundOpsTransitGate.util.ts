/**
 * Ground Ops "Start trip" gate: before a Ground Ops member moves a trip from
 * reached pickup (in_progress) to in transit, every required document must be
 * on file — the same Required rows as the Document Upload page:
 *   Trip:    LR · E-way bill · Invoice · Memo
 *   Vehicle: RC · Insurance · Fitness (not expired)
 *   Driver:  Driving licence (not expired)
 * A rejected file does not count. The database RPC
 * `simulate_ground_ops_pickup_status` re-checks the trip documents listed in
 * `organizations.settings.groundOpsMandatoryDocumentTypes` (default LR).
 */
import type {
  ComplianceDocumentRow,
  ComplianceEntityDocument,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  REQUIRED_COMPLIANCE_FINANCE_DOCUMENT_TYPES,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  REQUIRED_VEHICLE_DOCUMENT_TYPES,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  isEntityDocumentSlotVerified,
  isTripVaultDocumentOnFile,
} from "@/features/tripCompliance/utils/complianceChecklist.util";

export const GROUND_OPS_TRANSIT_REQUIRED_TRIP_TYPES: readonly string[] = [
  ...REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  ...REQUIRED_COMPLIANCE_FINANCE_DOCUMENT_TYPES.filter(
    (type) => !REQUIRED_COMPLIANCE_DOCUMENT_TYPES.includes(type),
  ),
];

const LABELS: Record<string, string> = {
  lr: "LR",
  eway_bill: "E-way bill",
  invoice: "Invoice",
  memo: "Memo",
  rc: "RC",
  insurance: "Insurance",
  fitness: "Fitness (FC)",
  license: "Driving licence",
};

export function groundOpsTransitDocLabel(type: string): string {
  return LABELS[type] ?? type.replace(/_/g, " ");
}

/** Required document types still missing (in display order); empty = may start the trip. */
export function listMissingDocsForGroundOpsTransit(
  input: {
    documents: readonly ComplianceDocumentRow[];
    vehicleDocuments: readonly Pick<
      ComplianceEntityDocument,
      "doc_type" | "status" | "expiry_date" | "storage_path"
    >[];
    driverDocuments: readonly Pick<
      ComplianceEntityDocument,
      "doc_type" | "status" | "expiry_date" | "storage_path"
    >[];
  },
  now: Date = new Date(),
): string[] {
  const tripOnFile = new Set(
    input.documents
      .filter((doc) => isTripVaultDocumentOnFile(doc))
      .map((doc) => doc.document_type as string),
  );
  const entityOnFile = (
    rows: typeof input.vehicleDocuments,
  ): Set<string> =>
    new Set(
      rows
        .filter((doc) => isEntityDocumentSlotVerified(doc, now, doc.doc_type))
        .map((doc) => doc.doc_type),
    );
  const vehicleOnFile = entityOnFile(input.vehicleDocuments);
  const driverOnFile = entityOnFile(input.driverDocuments);

  return [
    ...GROUND_OPS_TRANSIT_REQUIRED_TRIP_TYPES.filter((type) => !tripOnFile.has(type)),
    ...REQUIRED_VEHICLE_DOCUMENT_TYPES.filter((type) => !vehicleOnFile.has(type)),
    ...REQUIRED_DRIVER_DOCUMENT_TYPES.filter((type) => !driverOnFile.has(type)),
  ];
}
