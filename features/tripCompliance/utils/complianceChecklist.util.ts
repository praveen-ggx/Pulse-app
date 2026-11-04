import {
  COMPLIANCE_DRIVER_DOCUMENT_TYPES,
  COMPLIANCE_FINANCE_DOCUMENT_TYPES,
  COMPLIANCE_TRIP_OTHER_DOCUMENT_TYPES,
  COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
  REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  REQUIRED_COMPLIANCE_FINANCE_DOCUMENT_TYPES,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  REQUIRED_VEHICLE_DOCUMENT_TYPES,
  documentRequiresExpiry,
  type ComplianceChecklist,
  type ComplianceChecklistGroup,
  type ComplianceChecklistTone,
  type ComplianceDocumentRow,
} from "@/features/tripCompliance/tripCompliance.types";
import { classifyTripDocument } from "@/features/tripCompliance/utils/tripDocumentClassification.util";

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

/** True when expiry is within the next `withinDays` (inclusive), and not already expired. */
export function isEntityDocumentExpiringSoon(
  doc: { expiry_date?: string | null } | undefined,
  now = new Date(),
  withinDays = 30,
): boolean {
  if (!doc?.expiry_date || isEntityDocumentExpired(doc, now)) return false;
  const expiry = new Date(`${doc.expiry_date}T00:00:00Z`);
  if (Number.isNaN(expiry.getTime())) return false;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const horizon = todayUtc + withinDays * 24 * 60 * 60 * 1000;
  return expiry.getTime() <= horizon;
}

type EntityDocLike = {
  doc_type: string;
  status: string;
  expiry_date?: string | null;
  storage_path?: string | null;
};

function hasOnFileEntityDoc(doc: EntityDocLike | undefined): boolean {
  if (!doc) return false;
  if (doc.status === "rejected" || doc.status === "replaced") return false;
  return Boolean(doc.storage_path) || doc.status === "verified" || doc.status === "active" || doc.status === "expired";
}

/**
 * Required vehicle slots (RC / Insurance / FC) that are on file but past expiry.
 * Used to force Pending Docs and surface expiry alerts on the Compliance queue.
 */
export function listExpiredRequiredVehicleDocTypes(
  vehicleDocuments: EntityDocLike[],
  now = new Date(),
): string[] {
  const byType = new Map<string, EntityDocLike>();
  for (const doc of vehicleDocuments) {
    if (!byType.has(doc.doc_type)) byType.set(doc.doc_type, doc);
  }
  const expired: string[] = [];
  for (const type of REQUIRED_VEHICLE_DOCUMENT_TYPES) {
    const doc = byType.get(type);
    if (!hasOnFileEntityDoc(doc) || !doc) continue;
    if (doc.status === "expired" || isEntityDocumentExpired(doc, now)) {
      expired.push(type);
    }
  }
  return expired;
}

export function listExpiringSoonRequiredVehicleDocTypes(
  vehicleDocuments: EntityDocLike[],
  now = new Date(),
  withinDays = 30,
): string[] {
  const byType = new Map<string, EntityDocLike>();
  for (const doc of vehicleDocuments) {
    if (!byType.has(doc.doc_type)) byType.set(doc.doc_type, doc);
  }
  const soon: string[] = [];
  for (const type of REQUIRED_VEHICLE_DOCUMENT_TYPES) {
    const doc = byType.get(type);
    if (!hasOnFileEntityDoc(doc) || !doc) continue;
    if (isEntityDocumentExpiringSoon(doc, now, withinDays)) soon.push(type);
  }
  return soon;
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

/**
 * Checklist presence for a trip document: the classifier says the row holds
 * something (file, typed details, vault reference, or URL) and it is not
 * rejected. Status is judged here; content is judged only by the classifier.
 */
export function isTripVaultDocumentOnFile(doc: ComplianceDocumentRow): boolean {
  if (!doc.document_type || doc.status === "rejected") return false;
  return classifyTripDocument(doc).present;
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
    buildGroup(
      "finance",
      "Finance",
      COMPLIANCE_FINANCE_DOCUMENT_TYPES,
      REQUIRED_COMPLIANCE_FINANCE_DOCUMENT_TYPES,
      tripVerified,
    ),
  ];

  const core = groups.slice(0, 3);
  const verified = core.reduce((sum, group) => sum + group.verified, 0);
  const total = core.reduce((sum, group) => sum + group.total, 0);
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
  if (!checklist?.groups || checklist.groups.length !== 4 || !checklist.tone) return false;
  return (
    checklist.groups[0]?.slots.length === REQUIRED_COMPLIANCE_DOCUMENT_TYPES.length &&
    checklist.groups[1]?.slots.length === COMPLIANCE_VEHICLE_DOCUMENT_TYPES.length &&
    checklist.groups[2]?.slots.length === COMPLIANCE_DRIVER_DOCUMENT_TYPES.length &&
    checklist.groups[3]?.slots.length === COMPLIANCE_FINANCE_DOCUMENT_TYPES.length &&
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

const TRIP_SUMMARY_DOCUMENT_TYPES = [
  ...REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  ...COMPLIANCE_TRIP_OTHER_DOCUMENT_TYPES,
] as const;

/**
 * Summary-card fraction: documents on file ÷ every document in the group.
 * Completion (green) stays on the group tone, which counts required types only.
 */
export type ComplianceGroupDecisionMark = "verified" | "declined";

function statusesForTypes(
  rows: Array<{ type: string; status: string }>,
  types: readonly string[],
): Map<string, string[]> {
  const byType = new Map<string, string[]>();
  for (const type of types) byType.set(type, []);
  for (const row of rows) {
    const bucket = byType.get(row.type);
    if (bucket) bucket.push(row.status);
  }
  return byType;
}

/**
 * Pill mark for Trip / Vehicle / Driver / Finance.
 * Declined wins when any file in the tab was rejected.
 * Verified when every required file in the tab is approved.
 */
export function complianceGroupDecisionMark(
  group: ComplianceChecklistGroup,
  input: {
    documents?: Array<{ document_type?: string | null; status?: string | null }>;
    vehicleDocuments?: Array<{ doc_type?: string | null; status?: string | null; expiry_date?: string | null; storage_path?: string | null }>;
    driverDocuments?: Array<{ doc_type?: string | null; status?: string | null; expiry_date?: string | null; storage_path?: string | null }>;
  },
  now = new Date(),
): ComplianceGroupDecisionMark | null {
  const required =
    group.key === "finance"
      ? REQUIRED_COMPLIANCE_FINANCE_DOCUMENT_TYPES
      : group.key === "vehicle"
        ? REQUIRED_VEHICLE_DOCUMENT_TYPES
        : group.key === "driver"
          ? REQUIRED_DRIVER_DOCUMENT_TYPES
          : REQUIRED_COMPLIANCE_DOCUMENT_TYPES;
  const watched = group.slots.map((slot) => slot.type);
  const tripRows = (input.documents ?? []).map((doc) => ({
    type: doc.document_type ?? "",
    status: doc.status === "rejected" ? "rejected" : doc.status === "verified" ? "verified" : "pending",
  }));
  const entityRows = (
    group.key === "vehicle" ? input.vehicleDocuments : group.key === "driver" ? input.driverDocuments : []
  )?.map((doc) => ({
    type: doc.doc_type ?? "",
    status:
      doc.status === "rejected"
        ? "rejected"
        : (doc.status === "verified" || doc.status === "active") &&
            isEntityDocumentSlotVerified(doc, now, doc.doc_type)
          ? "verified"
          : "pending",
  }));
  const byType = statusesForTypes(
    group.key === "vehicle" || group.key === "driver" ? entityRows ?? [] : tripRows,
    watched,
  );
  const declined = watched.some((type) => (byType.get(type) ?? []).includes("rejected"));
  if (declined) return "declined";
  const verified =
    required.length > 0 &&
    required.every((type) => (byType.get(type) ?? []).includes("verified"));
  return verified ? "verified" : null;
}

export function complianceGroupOnFileCount(
  group: ComplianceChecklistGroup,
  tripDocuments: ComplianceDocumentRow[] = [],
): { onFile: number; total: number } {
  if (group.key === "trip" || group.key === "finance") {
    const onFileTypes = new Set(
      tripDocuments.filter((doc) => isTripVaultDocumentOnFile(doc)).map((doc) => doc.document_type),
    );
    const types = group.key === "finance" ? COMPLIANCE_FINANCE_DOCUMENT_TYPES : TRIP_SUMMARY_DOCUMENT_TYPES;
    return {
      onFile: types.filter((type) => onFileTypes.has(type)).length,
      total: types.length,
    };
  }
  return {
    onFile: group.slots.filter((slot) => slot.verified).length,
    total: group.slots.length,
  };
}

/** Compact Verified / Pending label for table Trip/Vehicle/Driver columns. */
export function checklistGroupStatusLabel(group: ComplianceChecklistGroup | undefined): string {
  if (!group || group.total === 0) return "—";
  if (group.verified >= group.total) return "Verified";
  return "Pending";
}
