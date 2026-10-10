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
  pending_for_docs: "Docs Follow Up",
  compliance_pending: "Ready to Verify",
  compliance_verified: "Compliance Verified",
  advance_payment_processed: "Advance Payment Processed",
  // Bucket is "delivered + advance, hard-copy not yet marked" (awaiting Ops).
  hard_copy_pod_received: "Awaiting Hard-Copy POD",
  balance_pending: "Balance Pending",
  payment_settled: "Payment Settled",
};

/** Shorter filter-chip labels from the Compliance Verification workbench. */
export const COMPLIANCE_STAGE_FILTER_LABEL: Record<ComplianceStage, string> = {
  pending_for_docs: "Docs Follow Up",
  compliance_pending: "Ready to Verify",
  compliance_verified: "Verified",
  advance_payment_processed: "Advance Processed",
  hard_copy_pod_received: "POD",
  balance_pending: "Settlement",
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

/** Vehicle/driver/supplier docs shown on Compliance — vault JSONB, KYC, or entity_documents. */
export type ComplianceEntityDocumentSource = "vehicle-vault" | "driver-kyc" | "entity" | "supplier-kyc";

export type ComplianceEntityDocument = {
  id: string;
  entity_type: "vehicle" | "driver" | "supplier";
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
  /** `transactions.created_at` — when the row was posted (paidAt is the user-entered day). */
  postedAt?: string | null;
  /**
   * Ops confirmed Paid at / Txn Date in Compliance (QMETA `compliance_txn_date_set`).
   * Until true, Paid at / Txn Date UI stays blank even if Finance stamped a day.
   */
  txnDateConfirmed?: boolean;
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
  /** Latest decline (decline_trip_compliance). Active only while complianceVerifiedAt is null. */
  complianceDeclinedAt: string | null;
  complianceDeclinedBy: string | null;
  complianceDeclineReason: string | null;
  advance: CompliancePaymentSummary | null;
  /**
   * A `compliance_advance` row while the trip is not yet verified. Shown on file
   * but not counted as `advance` until verify (Finance posts advances; Compliance
   * does not). Once verified, the same row becomes `advance`.
   */
  advanceBeforeVerification?: CompliancePaymentSummary | null;
  balance: CompliancePaymentSummary | null;
  hardCopyPod: {
    received: boolean;
    receivedAt: string | null;
    courier: string | null;
    awbNumber: string | null;
    receivedBy: string | null;
    /** Hard copy was marked IBond. Absent on older cached summaries. */
    ibond?: boolean;
    /** POD charges were saved. The trip then leaves the POD Received list. */
    chargesSaved?: boolean;
    /** Every LR number on this trip. */
    lrNumbers?: string[];
    /** Subset of `lrNumbers` whose hard copy has been received. */
    receivedLrNumbers?: string[];
  };
};

/** `trips` compliance / hard-copy POD columns read by the Compliance pipeline. */
export type ComplianceTripFlags = {
  compliance_verified_at: string | null;
  compliance_verified_by: string | null;
  compliance_decision: ComplianceDecision | null;
  compliance_exception_reason: string | null;
  compliance_outstanding_summary: ComplianceOutstandingSummary | null;
  compliance_declined_at: string | null;
  compliance_declined_by: string | null;
  compliance_decline_reason: string | null;
  pod_hard_copy_courier: string | null;
  pod_hard_copy_awb_number: string | null;
  pod_hard_copy_received_by: string | null;
  /** The hard-copy-POD-received gate (courier/AWB/received-by are display metadata). */
  pod_received_at: string | null;
  /** Set when the hard-copy receipt event was saved as IBond. */
  pod_ibond?: boolean;
  /** Set when POD client/vendor charges have been saved. */
  pod_charges_saved?: boolean;
  /**
   * LR numbers already logged as hard-copy received.
   * Read from the courier workflow event, not a trips column.
   */
  received_lr_numbers?: string[];
};

/**
 * Raw per-trip inputs a `ComplianceTripSummary` is derived from. The pipeline
 * cache stores these; summaries are a pure function of them, so a write only
 * has to replace the input it actually changed.
 *
 * Trip-specific: `documents`, `flags`, `taggedAdvance`, `balance` (and `trip`).
 * Shared: `vehicleDocuments` (every trip on the same vehicle) and
 * `driverDocuments` (every trip with the same driver).
 */
export type ComplianceTripInputs = {
  trip: TripRow;
  documents: ComplianceDocumentRow[];
  flags: ComplianceTripFlags | null;
  /** Latest `compliance_advance` transaction; `trips.amount_paid` is the fallback at derive time. */
  taggedAdvance: CompliancePaymentSummary | null;
  balance: CompliancePaymentSummary | null;
  vehicleDocuments: ComplianceEntityDocument[];
  driverDocuments: ComplianceEntityDocument[];
  /** `vehicles.id` whose vault JSON fed `vehicleDocuments` (id, owner id, or number match). */
  vaultVehicleId: string | null;
};

/** Trimmed decline reason length bounds — mirror trips_compliance_decline_reason_length_check. */
export const COMPLIANCE_DECLINE_REASON_MIN = 3;
export const COMPLIANCE_DECLINE_REASON_MAX = 500;

/** Length as Postgres `char_length` counts it (code points, not UTF-16 units). */
export function complianceDeclineReasonLength(reason: string): number {
  return Array.from(reason.trim()).length;
}

/** Trip docs required before a trip can be marked Compliance Verified. */
export const REQUIRED_COMPLIANCE_DOCUMENT_TYPES: readonly string[] = [
  "lr",
  "eway_bill",
  "invoice",
];

/** Extra trip-doc types the review sheet can add — not required to mark verified. */
export const COMPLIANCE_TRIP_OTHER_DOCUMENT_TYPES: readonly string[] = [
  "pod",
  "memo",
];

/**
 * Asset Vault finance slots: Memo, Other Documents, Bank Docs.
 * LR / Invoice stay on the Trip tab.
 */
export const COMPLIANCE_FINANCE_DOCUMENT_TYPES: readonly string[] = [
  "memo",
  "other",
  "bank_docs",
];

/** Finance slots marked Required in the Finance list (labelling only — not a Verified gate). */
export const REQUIRED_COMPLIANCE_FINANCE_DOCUMENT_TYPES: readonly string[] = ["memo"];

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
