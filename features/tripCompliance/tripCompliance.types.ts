import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * The 7 named stages from the product spec, plus "all" for the filter chip.
 * Derived, never persisted as a single column — see deriveComplianceStage().
 */
export type ComplianceStage =
  | "pending_for_docs"
  | "compliance_pending"
  | "compliance_verified"
  | "advance_payment_processed"
  | "hard_copy_pod_received"
  | "balance_pending"
  | "payment_settled";

export const COMPLIANCE_STAGES: readonly ComplianceStage[] = [
  "pending_for_docs",
  "compliance_pending",
  "compliance_verified",
  "advance_payment_processed",
  "hard_copy_pod_received",
  "balance_pending",
  "payment_settled",
];

export const COMPLIANCE_STAGE_LABEL: Record<ComplianceStage, string> = {
  pending_for_docs: "Pending for Docs",
  compliance_pending: "Compliance Pending",
  compliance_verified: "Compliance Verified",
  advance_payment_processed: "Advance Payment Processed",
  hard_copy_pod_received: "Hard Copy POD Received",
  balance_pending: "Balance Pending",
  payment_settled: "Payment Settled",
};

/** Shorter filter-chip labels from the Compliance Verification workbench. */
export const COMPLIANCE_STAGE_FILTER_LABEL: Record<ComplianceStage, string> = {
  pending_for_docs: "Pending Docs",
  compliance_pending: "Compliance Pending",
  compliance_verified: "Verified",
  advance_payment_processed: "Advance Processed",
  hard_copy_pod_received: "POD Received",
  balance_pending: "Balance Pending",
  payment_settled: "Settled",
};

export type ComplianceChecklistTone = "success" | "warning" | "danger";

export type ComplianceChecklistSlot = {
  type: string;
  verified: boolean;
};

export type ComplianceChecklistGroup = {
  key: "trip" | "vehicle" | "driver";
  label: "Trip" | "Vehicle" | "Driver";
  slots: ComplianceChecklistSlot[];
  verified: number;
  total: number;
  tone: ComplianceChecklistTone;
};

export type ComplianceChecklist = {
  groups: [ComplianceChecklistGroup, ComplianceChecklistGroup, ComplianceChecklistGroup];
  verified: number;
  total: number;
  tone: ComplianceChecklistTone;
};

export type ComplianceDocumentStatus = "pending" | "verified" | "rejected";

/**
 * How `compliance_verified_at`/`compliance_verified_by` was reached. Null
 * until a decision is made. Distinct from `ComplianceStage` — this only
 * disambiguates the approval path, it never gates the settlement stage.
 */
export type ComplianceDecision = "approved" | "approved_with_exception";

export type ComplianceOutstandingSummary = {
  missing: string[];
  pending_verification: string[];
  rejected: string[];
};

export type ComplianceDocumentRow = {
  id: string;
  trip_id: string;
  document_type: string | null;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
  uploaded_by?: string | null;
  status: ComplianceDocumentStatus;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  mime_type?: string | null;
  document_number?: string | null;
  source_entity_document_id?: string | null;
};

/** Vehicle/driver docs shown on Compliance — vault JSONB, KYC, or entity_documents. */
export type ComplianceEntityDocumentSource = "vehicle-vault" | "driver-kyc" | "entity";

export type ComplianceEntityDocument = {
  id: string;
  entity_type: "vehicle" | "driver";
  entity_id: string;
  doc_type: string;
  status: string;
  storage_path: string | null;
  expiry_date: string | null;
  verified_at: string | null;
  verified_by?: string | null;
  notes: string | null;
  created_at: string;
  created_by?: string | null;
  source?: ComplianceEntityDocumentSource;
};

/** Canonical Finance payment state, read (not duplicated) from `transactions`. */
export type CompliancePaymentSummary = {
  amount: number;
  paymentMode: string | null;
  utr: string | null;
  paidAt: string;
  actorId: string | null;
  transactionId: string;
};

export type ComplianceTripSummary = {
  trip: TripRow;
  stage: ComplianceStage;
  documents: ComplianceDocumentRow[];
  vehicleDocuments: ComplianceEntityDocument[];
  driverDocuments: ComplianceEntityDocument[];
  documentCounts: { total: number; verified: number; rejected: number; pending: number };
  checklist: ComplianceChecklist;
  complianceVerifiedAt: string | null;
  complianceVerifiedBy: string | null;
  complianceDecision: ComplianceDecision | null;
  complianceExceptionReason: string | null;
  complianceOutstandingSummary: ComplianceOutstandingSummary | null;
  advance: CompliancePaymentSummary | null;
  balance: CompliancePaymentSummary | null;
  hardCopyPod: {
    received: boolean;
    receivedAt: string | null;
    courier: string | null;
    awbNumber: string | null;
    receivedBy: string | null;
  };
};

/** Trip docs required before a trip can be marked Compliance Verified. */
export const REQUIRED_COMPLIANCE_DOCUMENT_TYPES: readonly string[] = [
  "lr",
  "eway_bill",
  "invoice",
];

/** Extra trip-doc types the review sheet can add — not required to mark verified. */
export const COMPLIANCE_TRIP_OTHER_DOCUMENT_TYPES: readonly string[] = [
  "pod",
  "loading_slip",
  "manifest",
];

/** Vehicle checklist — RC, insurance, FC, permit, pollution, tax. */
export const REQUIRED_VEHICLE_DOCUMENT_TYPES: readonly string[] = [
  "rc",
  "insurance",
  "fitness",
];

export const OPTIONAL_VEHICLE_DOCUMENT_TYPES: readonly string[] = [
  "permit",
  "pollution",
  "road_tax",
];

export const COMPLIANCE_VEHICLE_DOCUMENT_TYPES: readonly string[] = [
  ...REQUIRED_VEHICLE_DOCUMENT_TYPES,
  ...OPTIONAL_VEHICLE_DOCUMENT_TYPES,
];

/** Driver checklist — licence mandatory; Aadhaar optional. */
export const REQUIRED_DRIVER_DOCUMENT_TYPES: readonly string[] = ["license"];

export const OPTIONAL_DRIVER_DOCUMENT_TYPES: readonly string[] = ["aadhaar"];

export const COMPLIANCE_DRIVER_DOCUMENT_TYPES: readonly string[] = [
  ...REQUIRED_DRIVER_DOCUMENT_TYPES,
  ...OPTIONAL_DRIVER_DOCUMENT_TYPES,
];

/** Insurance, FC, and DL require an expiry date; RC does not. */
export function documentRequiresExpiry(docType: string): boolean {
  return docType === "insurance" || docType === "fitness" || docType === "license";
}

export function isRequiredVehicleDocumentType(docType: string): boolean {
  return (REQUIRED_VEHICLE_DOCUMENT_TYPES as readonly string[]).includes(docType);
}

export function isRequiredDriverDocumentType(docType: string): boolean {
  return (REQUIRED_DRIVER_DOCUMENT_TYPES as readonly string[]).includes(docType);
}
