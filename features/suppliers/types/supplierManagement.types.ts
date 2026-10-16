/**
 * Supplier management types — mirror of client management types adapted for suppliers.
 */
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";

export type SupplierProfileTab =
  | "overview"
  | "kyc"
  | "compliance"
  | "contracts"
  | "fleet"
  | "drivers"
  | "warehouses"
  | "performance"
  | "finance"
  | "timeline";

// ── Contacts ─────────────────────────────────────────────────────────────────

export type SupplierContactRow = {
  id: string;
  organization_id: string;
  supplier_id: string;
  name: string;
  designation?: string | null;
  mobile?: string | null;
  email?: string | null;
  department?: string | null;
  is_primary: boolean;
  is_operations: boolean;
  is_finance: boolean;
  is_dispatch: boolean;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

// ── KYC ──────────────────────────────────────────────────────────────────────

export type SupplierKycDocType =
  | "pan"
  | "gstin"
  | "cin"
  | "partnership_deed"
  | "certificate_of_incorporation"
  | "board_resolution"
  | "aadhaar_front"
  | "aadhaar_back"
  | "msme"
  | "udyam"
  | "gumasta"
  | "cancelled_cheque"
  | "bank_statement"
  | "bank_proof_other"
  | "physical_verification"
  | "signed_agreement"
  | "tds_supporting_document"
  | "other";

export const SUPPLIER_KYC_DOC_LABELS: Record<SupplierKycDocType, string> = {
  pan: "PAN Card",
  gstin: "GST Certificate",
  cin: "CIN",
  partnership_deed: "Partnership Deed",
  certificate_of_incorporation: "Certificate of Incorporation",
  board_resolution: "Board Resolution",
  aadhaar_front: "Aadhaar Front",
  aadhaar_back: "Aadhaar Back",
  msme: "MSME Certificate",
  udyam: "Udyam Certificate",
  gumasta: "Gumasta Certificate",
  cancelled_cheque: "Bank Proof",
  bank_statement: "Bank Statement",
  bank_proof_other: "Bank Proof (Other)",
  physical_verification: "Physical Verification Photo",
  signed_agreement: "Signed Vendor Document",
  tds_supporting_document: "TDS supporting document",
  other: "Other",
};

/** Vendor lifecycle status (suppliers.vendor_status). */
export type SupplierVendorStatus = "active" | "inactive" | "blacklisted";

export const MANDATORY_SUPPLIER_KYC_TYPES: SupplierKycDocType[] = [
  "pan", "gstin", "cin", "certificate_of_incorporation",
];

export type SupplierKycDocument = {
  id: string;
  doc_type: SupplierKycDocType;
  doc_label?: string | null;
  doc_number?: string | null;
  storage_path?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  status: "pending" | "uploaded" | "verified" | "rejected";
  verified_by?: string | null;
  verified_at?: string | null;
  expiry_date?: string | null;
  remarks?: string | null;
  version_number: number;
  created_at?: string | null;
  updated_at?: string | null;
};

// ── Compliance ────────────────────────────────────────────────────────────────

export type ComplianceDocType =
  | "insurance"
  | "pollution"
  | "gst"
  | "labor_license"
  | "other";

export type TrafficLight = "green" | "amber" | "red";

export type ComplianceDocument = {
  id: string;
  doc_type: ComplianceDocType;
  label: string;
  expiry_date?: string | null;
  status: TrafficLight;
  daysToExpiry?: number | null;
};

// ── Contracts ─────────────────────────────────────────────────────────────────

export type ContractMode = "road_ftl" | "road_ptl" | "container" | "express";
export type RateType =
  | "per_trip"
  | "per_ton"
  | "per_ton_km"
  | "per_km"
  | "per_vehicle"
  | "monthly_fixed"
  | "hybrid";

export type ContractLaneRate = {
  id: string;
  origin: string;
  destination: string;
  vehicle_type: string;
  rate: number;
  rate_type: RateType;
};

export type ContractSla = {
  pod_submission_days: number;
  pod_penalty_per_day: number;
  pod_grace_days: number;
  pod_max_penalty: number;
  detention_free_hours: number;
  detention_rate_per_hour: number;
  placement_delay_grace_hours: number;
  placement_delay_penalty_per_hour: number;
};

export type SupplierContract = {
  id: string;
  contract_name: string;
  effective_date: string;
  expiry_date?: string | null;
  branch?: string | null;
  region?: string | null;
  mode: ContractMode;
  rate_type: RateType;
  lane_rates: ContractLaneRate[];
  sla: ContractSla;
  status: "active" | "expired" | "draft";
};

// ── Fleet ─────────────────────────────────────────────────────────────────────

export type SupplierVehicle = {
  id: string;
  vehicle_number: string;
  vehicle_type: string;
  capacity_tons?: number | null;
  ownership: "owned" | "leased" | "hired";
  insurance_expiry?: string | null;
  fitness_expiry?: string | null;
  permit_expiry?: string | null;
  gps_available: boolean;
  status: "active" | "inactive" | "blocked";
};

// ── Warehouse ─────────────────────────────────────────────────────────────────

export type SupplierWarehouse = {
  id: string;
  name: string;
  code?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contact_number?: string | null;
  storage_capacity_sqft?: number | null;
  loading_bays?: number | null;
  working_hours?: string | null;
};

// ── Performance ───────────────────────────────────────────────────────────────

export type SupplierPerformanceMetrics = {
  on_time_pickup_pct: number;
  on_time_delivery_pct: number;
  pod_compliance_pct: number;
  claim_pct: number;
  damage_pct: number;
  trip_acceptance_pct: number;
  cancellation_pct: number;
  avg_detention_hours: number;
  avg_rating: number | null;
  settlement_compliance_pct: number;
  overall_score: number;
  grade: "A+" | "A" | "B" | "C" | "D";
  total_trips: number;
};

// ── CRM ───────────────────────────────────────────────────────────────────────

export type SupplierCrmStatus =
  | "preferred"
  | "strategic"
  | "blocked"
  | "watchlist"
  | "standard";

export type SupplierCrmNote = {
  id: string;
  note_type: "meeting" | "escalation" | "internal" | "general";
  content: string;
  created_by: string;
  created_at: string;
};

// ── Timeline ──────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | "supplier_created"
  | "contract_uploaded"
  | "kyc_approved"
  | "vehicle_added"
  | "driver_added"
  | "trip_assigned"
  | "penalty_applied"
  | "penalty_waived"
  | "payment_released"
  | "document_expired"
  | "status_changed";

export type TimelineEvent = {
  id: string;
  event_type: TimelineEventType;
  description: string;
  actor?: string | null;
  meta?: Record<string, string> | null;
  created_at: string;
};

// ── Main bundle ───────────────────────────────────────────────────────────────

/** Trip fields the Supplier Overview/Finance panels actually read (id, status for the
 * completed-trip count, supplier_rate for spend/revenue totals) — matches the columns
 * `getTripsBySupplierForOrg` selects. */
export type SupplierBundleTripRow = Pick<TripRow, "id" | "status" | "supplier_rate">;

export type SupplierManagementBundle = {
  supplier: SupplierRow;
  trips: SupplierBundleTripRow[];
  transactions: LedgerRow[];
  drivers: DriverRow[];
  /** Pending driver salary/advance requests filed under the supplier's own linked org, if linked. */
  driverSalaryRequests: SupplierDriverSalaryRequest[];
  contacts: SupplierContactRow[];
  kyc_documents: SupplierKycDocument[];
  compliance_docs: ComplianceDocument[];
  contracts: SupplierContract[];
  fleet: SupplierVehicle[];
  warehouses: SupplierWarehouse[];
  performance: SupplierPerformanceMetrics | null;
  crm_status: SupplierCrmStatus;
  crm_notes: SupplierCrmNote[];
  timeline: TimelineEvent[];
};

export type SupplierDriverSalaryRequest = {
  id: string;
  driver_id: string;
  driver_name: string | null;
  request_type: string;
  amount: number;
  status: string;
  note: string | null;
  created_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildSupplierPerformanceFromTrips(
  trips: SupplierBundleTripRow[],
): SupplierPerformanceMetrics {
  const completed = trips.filter(
    (t) => t.status === "completed" || t.status === "done" || t.status === "delivered",
  );
  const total = trips.length;
  if (total === 0) {
    return {
      on_time_pickup_pct: 0,
      on_time_delivery_pct: 0,
      pod_compliance_pct: 0,
      claim_pct: 0,
      damage_pct: 0,
      trip_acceptance_pct: 100,
      cancellation_pct: 0,
      avg_detention_hours: 0,
      avg_rating: null,
      settlement_compliance_pct: 100,
      overall_score: 0,
      grade: "D",
      total_trips: 0,
    };
  }
  const onTimePct = Math.min(100, Math.round((completed.length / total) * 100));
  const score = Math.round(
    onTimePct * 0.4 + 100 * 0.2 + Math.min(100, (completed.length / Math.max(1, total)) * 100) * 0.4,
  );
  const grade: SupplierPerformanceMetrics["grade"] =
    score >= 90 ? "A+" : score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";

  return {
    on_time_pickup_pct: onTimePct,
    on_time_delivery_pct: onTimePct,
    pod_compliance_pct: onTimePct,
    claim_pct: 0,
    damage_pct: 0,
    trip_acceptance_pct: 100,
    cancellation_pct: 0,
    avg_detention_hours: 0,
    avg_rating: null,
    settlement_compliance_pct: 100,
    overall_score: score,
    grade,
    total_trips: total,
  };
}

export function buildDefaultBundle(supplier: SupplierRow, trips: TripRow[], transactions: LedgerRow[], drivers: DriverRow[]): SupplierManagementBundle {
  return {
    supplier,
    trips,
    transactions,
    drivers,
    driverSalaryRequests: [],
    contacts: [],
    kyc_documents: [],
    compliance_docs: [],
    contracts: [],
    fleet: [],
    warehouses: [],
    performance: buildSupplierPerformanceFromTrips(trips),
    crm_status: "standard",
    crm_notes: [],
    timeline: [
      {
        id: "created",
        event_type: "supplier_created",
        description: `Supplier ${supplier.name ?? "record"} created`,
        actor: null,
        meta: null,
        created_at: supplier.created_at,
      },
    ],
  };
}
