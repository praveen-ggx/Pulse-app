/**
 * Shared document-row derivation — used by the Trip Detail document table,
 * the Compliance trip card, the list-level table's expandable rows, and the
 * document review sheet, so all four surfaces agree on exactly the same
 * Missing/Pending/Verified/Rejected/Expired classification from one place.
 */
import {
  COMPLIANCE_TRIP_OTHER_DOCUMENT_TYPES,
  REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  documentRequiresExpiry,
  isRequiredDriverDocumentType,
  isRequiredVehicleDocumentType,
  type ComplianceDocumentRow,
  type ComplianceDocumentStatus,
  type ComplianceEntityDocument,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  isEntityDocumentExpired,
  isEntityDocumentSlotVerified,
} from "@/features/tripCompliance/utils/complianceChecklist.util";

export const DOC_TYPE_LABEL: Record<string, string> = {
  lr: "LR",
  invoice: "Invoice",
  eway_bill: "E-way Bill",
  pod: "POD",
  manifest: "Trip Manifest",
  loading_slip: "Loading Slip",
  insurance: "Insurance",
  rc: "RC",
  fitness: "FC",
  permit: "Permit",
  pollution: "Pollution",
  road_tax: "Tax",
  license: "Driving License",
  aadhaar: "Aadhaar",
};

export function labelForDocType(type: string): string {
  return DOC_TYPE_LABEL[type] ?? type.replace(/_/g, " ");
}

export type ComplianceDocRowStatus = ComplianceDocumentStatus | "missing" | "expired";

export type ComplianceDocRow = {
  key: string;
  type: string;
  required: boolean;
  status: ComplianceDocRowStatus;
  doc: ComplianceDocumentRow | null;
  entityDoc: ComplianceEntityDocument | null;
};

function latestDocByType(documents: ComplianceDocumentRow[]): Map<string | null, ComplianceDocumentRow> {
  const byType = new Map<string | null, ComplianceDocumentRow>();
  for (const doc of documents) {
    const current = byType.get(doc.document_type);
    if (!current || (doc.uploaded_at ?? "") > (current.uploaded_at ?? "")) {
      byType.set(doc.document_type, doc);
    }
  }
  return byType;
}

function rowForType(
  type: string,
  required: boolean,
  byType: Map<string | null, ComplianceDocumentRow>,
): ComplianceDocRow {
  const doc = byType.get(type) ?? null;
  return { key: type, type, required, status: doc ? doc.status : "missing", doc, entityDoc: null };
}

function latestEntityDoc(documents: ComplianceEntityDocument[]): ComplianceEntityDocument | null {
  const usable = documents.filter((doc) => doc.status !== "replaced");
  const list = usable.length > 0 ? usable : documents;
  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

function isEntityDocRequired(type: string): boolean {
  return isRequiredVehicleDocumentType(type) || isRequiredDriverDocumentType(type);
}

function entityRowStatus(
  doc: ComplianceEntityDocument | null,
  now = new Date(),
  docType?: string,
): ComplianceDocRowStatus {
  if (!doc) return "missing";
  if (doc.status === "rejected") return "rejected";
  if (doc.status === "expired" || isEntityDocumentExpired(doc, now)) return "expired";
  if (docType && documentRequiresExpiry(docType) && !doc.expiry_date?.trim()) return "pending";
  if (doc.status === "pending") return "pending";
  if (isEntityDocumentSlotVerified(doc, now, docType ?? doc.doc_type)) return "verified";
  return "pending";
}

/** Vehicle or driver types from vault / entity_documents. */
export function deriveEntityComplianceRows(
  types: readonly string[],
  documents: ComplianceEntityDocument[],
  now = new Date(),
): ComplianceDocRow[] {
  const byType = new Map<string, ComplianceEntityDocument[]>();
  for (const doc of documents) {
    const list = byType.get(doc.doc_type) ?? [];
    list.push(doc);
    byType.set(doc.doc_type, list);
  }
  return types.map((type) => {
    const entityDoc = latestEntityDoc(byType.get(type) ?? []);
    return {
      key: type,
      type,
      required: isEntityDocRequired(type),
      status: entityRowStatus(entityDoc, now, type),
      doc: null,
      entityDoc,
    };
  });
}

/** Required trip types first, then other trip upload options only. */
export function deriveComplianceDocumentRows(documents: ComplianceDocumentRow[]): ComplianceDocRow[] {
  const byType = latestDocByType(documents);
  const requiredRows = REQUIRED_COMPLIANCE_DOCUMENT_TYPES.map((type) => rowForType(type, true, byType));
  const otherRows = COMPLIANCE_TRIP_OTHER_DOCUMENT_TYPES.map((type) => rowForType(type, false, byType));
  return [...requiredRows, ...otherRows];
}

/** Progress is always measured against required documents only. */
export function groupComplianceReviewRows(rows: ComplianceDocRow[]): {
  needsAction: ComplianceDocRow[];
  missing: ComplianceDocRow[];
  pending: ComplianceDocRow[];
  verified: ComplianceDocRow[];
} {
  const needsAction: ComplianceDocRow[] = [];
  const missing: ComplianceDocRow[] = [];
  const pending: ComplianceDocRow[] = [];
  const verified: ComplianceDocRow[] = [];
  for (const row of rows) {
    if (row.status === "rejected" || row.status === "expired") needsAction.push(row);
    else if (row.status === "missing") missing.push(row);
    else if (row.status === "verified") verified.push(row);
    else pending.push(row);
  }
  return { needsAction, missing, pending, verified };
}

export function requirementScopeLabel(required: boolean): string {
  return required ? "Required" : "Optional";
}

export function requiredRowNextAction(row: ComplianceDocRow): string {
  if (row.status === "missing") return "Upload a file before Approve / Decline.";
  if (row.status === "expired") return "Replace the expired file, then Approve.";
  if (row.status === "pending") {
    if (documentRequiresExpiry(row.type) && !row.entityDoc?.expiry_date?.trim()) {
      return "Add expiry date, then Approve.";
    }
    return "Preview then Approve or Decline.";
  }
  if (row.status === "rejected") return "Replace the file, then Approve.";
  return "View, or Decline if this file should not stay verified.";
}

export function complianceProgress(rows: ComplianceDocRow[]): { verified: number; total: number } {
  const required = rows.filter((r) => r.required);
  return { verified: required.filter((r) => r.status === "verified").length, total: required.length };
}
