import {
  COMPLIANCE_DRIVER_DOCUMENT_TYPES,
  COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
  REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  REQUIRED_VEHICLE_DOCUMENT_TYPES,
  documentRequiresExpiry,
  type ComplianceChecklist,
  type ComplianceChecklistGroup,
  type ComplianceChecklistTone,
  type ComplianceDocumentRow,
} from "@/features/tripCompliance/tripCompliance.types";

export function checklistTone(verified: number, total: number): ComplianceChecklistTone {
  if (total > 0 && verified >= total) return "success";
  if (verified === 0) return "danger";
  return "warning";
}

export function isEntityDocumentExpired(
  doc: { expiry_date?: string | null } | undefined,
  now = new Date(),
): boolean {
  if (!doc?.expiry_date) return false;
  const expiry = new Date(`${doc.expiry_date}T00:00:00Z`);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function isEntityDocumentSlotVerified(
  doc: { status: string; expiry_date?: string | null; storage_path?: string | null } | undefined,
  now = new Date(),
  docType?: string | null,
): boolean {
  if (!doc) return false;
  if (doc.status === "expired" || doc.status === "rejected" || doc.status === "replaced") {
    return false;
  }
  if (docType && documentRequiresExpiry(docType) && !doc.expiry_date?.trim()) {
    return false;
  }
  if (isEntityDocumentExpired(doc, now)) return false;
  if (doc.storage_path) return true;
  return doc.status === "verified" || doc.status === "active";
}

export function isTripVaultDocumentOnFile(doc: ComplianceDocumentRow): boolean {
  if (!doc.document_type || doc.status === "rejected") return false;
  return Boolean(doc.storage_path) || doc.status === "verified";
}

function buildGroup(
  key: ComplianceChecklistGroup["key"],
  label: ComplianceChecklistGroup["label"],
  types: readonly string[],
  requiredTypes: readonly string[],
  verifiedTypes: Set<string>,
): ComplianceChecklistGroup {
  const requiredSet = new Set(requiredTypes);
  const slots = types.map((type) => ({ type, verified: verifiedTypes.has(type) }));
  const requiredSlots = slots.filter((slot) => requiredSet.has(slot.type));
  const verified = requiredSlots.filter((slot) => slot.verified).length;
  const total = requiredSlots.length;
  return {
    key,
    label,
    slots,
    verified,
    total,
    tone: checklistTone(verified, total),
  };
}

export function buildComplianceChecklist(input: {
  tripDocuments: ComplianceDocumentRow[];
  vehicleDocuments: Array<{ doc_type: string; status: string; expiry_date?: string | null; storage_path?: string | null }>;
  driverDocuments: Array<{ doc_type: string; status: string; expiry_date?: string | null; storage_path?: string | null }>;
  now?: Date;
}): ComplianceChecklist {
  const now = input.now ?? new Date();
  const tripVerified = new Set(
    input.tripDocuments.filter((doc) => isTripVaultDocumentOnFile(doc)).map((doc) => doc.document_type as string),
  );
  const vehicleVerified = new Set(
    input.vehicleDocuments
      .filter((doc) => isEntityDocumentSlotVerified(doc, now, doc.doc_type))
      .map((doc) => doc.doc_type),
  );
  const driverVerified = new Set(
    input.driverDocuments
      .filter((doc) => isEntityDocumentSlotVerified(doc, now, doc.doc_type))
      .map((doc) => doc.doc_type),
  );

  const groups: ComplianceChecklist["groups"] = [
    buildGroup("trip", "Trip", REQUIRED_COMPLIANCE_DOCUMENT_TYPES, REQUIRED_COMPLIANCE_DOCUMENT_TYPES, tripVerified),
    buildGroup(
      "vehicle",
      "Vehicle",
      COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
      REQUIRED_VEHICLE_DOCUMENT_TYPES,
      vehicleVerified,
    ),
    buildGroup(
      "driver",
      "Driver",
      COMPLIANCE_DRIVER_DOCUMENT_TYPES,
      REQUIRED_DRIVER_DOCUMENT_TYPES,
      driverVerified,
    ),
  ];

  const verified = groups.reduce((sum, group) => sum + group.verified, 0);
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  return { groups, verified, total, tone: checklistTone(verified, total) };
}

export function emptyComplianceChecklist(): ComplianceChecklist {
  return buildComplianceChecklist({ tripDocuments: [], vehicleDocuments: [], driverDocuments: [] });
}

/**
 * Persisted cache can still hold the old 15-slot mock checklist. Rebuild when
 * group slot counts no longer match LR/e-way/invoice, vehicle, and driver.
 */
export function isCurrentComplianceChecklist(checklist: ComplianceChecklist | null | undefined): boolean {
  if (!checklist?.groups || checklist.groups.length !== 3 || !checklist.tone) return false;
  return (
    checklist.groups[0]?.slots.length === REQUIRED_COMPLIANCE_DOCUMENT_TYPES.length &&
    checklist.groups[1]?.slots.length === COMPLIANCE_VEHICLE_DOCUMENT_TYPES.length &&
    checklist.groups[2]?.slots.length === COMPLIANCE_DRIVER_DOCUMENT_TYPES.length &&
    checklist.groups[1]?.total === REQUIRED_VEHICLE_DOCUMENT_TYPES.length &&
    checklist.groups[2]?.total === REQUIRED_DRIVER_DOCUMENT_TYPES.length
  );
}

export function ensureComplianceChecklist(
  summary:
    | {
        checklist?: ComplianceChecklist | null;
        documents?: ComplianceDocumentRow[];
        vehicleDocuments?: Array<{ doc_type: string; status: string; expiry_date?: string | null; storage_path?: string | null }>;
        driverDocuments?: Array<{ doc_type: string; status: string; expiry_date?: string | null; storage_path?: string | null }>;
      }
    | null
    | undefined,
): ComplianceChecklist {
  return buildComplianceChecklist({
    tripDocuments: summary?.documents ?? [],
    vehicleDocuments: summary?.vehicleDocuments ?? [],
    driverDocuments: summary?.driverDocuments ?? [],
  });
}

/** Compact Verified / Pending label for table Trip/Vehicle/Driver columns. */
export function checklistGroupStatusLabel(group: ComplianceChecklistGroup | undefined): string {
  if (!group || group.total === 0) return "—";
  if (group.verified >= group.total) return "Verified";
  return "Pending";
}
