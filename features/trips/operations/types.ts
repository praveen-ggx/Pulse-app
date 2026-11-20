export type FuelType = "diesel" | "petrol" | "cng" | "other";
export type OperationalPaymentOwner =
  | "organization"
  | "driver"
  | "supplier"
  | "fleet_card"
  | "fastag"
  | "cash_advance"
  | "credit_vendor"
  | "unknown";
export type OperationalPaymentMode =
  | "cash"
  | "fastag"
  | "card"
  | "credit"
  | "pending"
  | "unknown";
export type OperationalApprovalState =
  | "reported"
  | "review_pending"
  | "approved"
  | "rejected"
  | "settled";
export type OperationalLedgerState = "not_posted" | "posted" | "void";
export type OperationalPostingState =
  | "pending"
  | "approved"
  | "posted"
  | "rejected"
  | "failed";
export type ReimbursementState =
  | "reported"
  | "approved"
  | "reimbursement_pending"
  | "reimbursed"
  | "rejected";

/** Fixed by the server at insert (20271007190418). */
export type TripExpenseContext = "employer" | "dco" | "personal";
export type TripExpenseStatus =
  | "personal"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled";

export interface TripExpenseOwnership {
  expense_context?: TripExpenseContext;
  owner_user_id?: string | null;
  employer_org_id?: string | null;
  expense_status?: TripExpenseStatus;
  rejection_reason?: string | null;
}

export interface TripFuelEntry extends TripExpenseOwnership {
  id: string;
  trip_id: string;
  amount_inr: number;
  liters: number | null;
  fuel_type: FuelType | null;
  station_name: string | null;
  notes: string | null;
  bill_storage_path: string | null;
  ocr_job_id: string | null;
  entered_by: string | null;
  entered_at: string;
  updated_at: string;
  source: string;
  status: "active" | "voided";
  payment_owner: OperationalPaymentOwner;
  payment_mode: OperationalPaymentMode | null;
  approval_state: OperationalApprovalState;
  ledger_state: OperationalLedgerState;
  posting_state?: OperationalPostingState;
  posting_error?: string | null;
  last_retry_at?: string | null;
  retry_count?: number;
  reimbursement_state?: ReimbursementState;
  reimbursement_updated_at?: string | null;
  reimbursed_at?: string | null;
  reimbursed_by?: string | null;
  reimbursement_notes?: string | null;
  approved_by: string | null;
  approved_at: string | null;
  idempotency_key?: string | null;
}

export interface TripTollEntry extends TripExpenseOwnership {
  id: string;
  trip_id: string;
  amount_inr: number;
  plaza_name: string | null;
  notes: string | null;
  is_estimated: boolean;
  receipt_storage_path: string | null;
  ocr_job_id: string | null;
  entered_by: string | null;
  entered_at: string;
  updated_at: string;
  source: string;
  status: "active" | "voided";
  payment_owner: OperationalPaymentOwner;
  payment_mode: OperationalPaymentMode | null;
  approval_state: OperationalApprovalState;
  ledger_state: OperationalLedgerState;
  posting_state?: OperationalPostingState;
  posting_error?: string | null;
  last_retry_at?: string | null;
  retry_count?: number;
  reimbursement_state?: ReimbursementState;
  reimbursement_updated_at?: string | null;
  reimbursed_at?: string | null;
  reimbursed_by?: string | null;
  reimbursement_notes?: string | null;
  approved_by: string | null;
  approved_at: string | null;
  idempotency_key?: string | null;
}

export interface SaveFuelEntryInput {
  tripId: string;
  amountInr: number;
  liters: number | null;
  fuelType: FuelType | null;
  stationName: string | null;
  notes: string | null;
  enteredBy: string | null;
  actorRole?: "driver" | "user" | null;
  paymentOwner?: OperationalPaymentOwner | null;
  paymentMode?: OperationalPaymentMode | null;
  /** When DCO, save path forces driver-owned opex (not org reimbursement/P&L). */
  operatingMode?: string | null;
  billPhotoLocalUri?: string | null;
  ocrJobId?: string | null;
}

export type UpdateFuelEntryInput = Omit<SaveFuelEntryInput, "actorRole"> & {
  entryId: string;
};

export interface SaveTollEntryInput {
  tripId: string;
  amountInr: number;
  plazaName: string | null;
  notes: string | null;
  isEstimated: boolean;
  enteredBy: string | null;
  actorRole?: "driver" | "user" | null;
  paymentOwner?: OperationalPaymentOwner | null;
  paymentMode?: OperationalPaymentMode | null;
  operatingMode?: string | null;
  receiptLocalUri?: string | null;
  ocrJobId?: string | null;
}

export type UpdateTollEntryInput = Omit<SaveTollEntryInput, "actorRole"> & {
  entryId: string;
};

export type TripOtherExpenseCategory =
  | "parking"
  | "challan"
  | "loading"
  | "unloading"
  | "detention"
  | "maintenance"
  | "fastag"
  | "advance"
  | "food"
  | "weighbridge"
  | "misc";

export interface TripOtherExpenseEntry extends TripExpenseOwnership {
  id: string;
  trip_id: string;
  expense_category: TripOtherExpenseCategory;
  amount_inr: number;
  description: string | null;
  location_name: string | null;
  notes: string | null;
  receipt_storage_path: string | null;
  ocr_job_id: string | null;
  entered_by: string | null;
  entered_at: string;
  updated_at: string;
  source: string;
  status: "active" | "voided";
  payment_owner: OperationalPaymentOwner;
  payment_mode: OperationalPaymentMode | null;
  approval_state: OperationalApprovalState;
  ledger_state: OperationalLedgerState;
  posting_state?: OperationalPostingState;
  posting_error?: string | null;
  last_retry_at?: string | null;
  retry_count?: number;
  reimbursement_state?: ReimbursementState;
  reimbursement_updated_at?: string | null;
  reimbursed_at?: string | null;
  reimbursed_by?: string | null;
  reimbursement_notes?: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

export interface SaveOtherExpenseInput {
  tripId: string;
  expenseCategory: TripOtherExpenseCategory;
  amountInr: number;
  description?: string | null;
  locationName?: string | null;
  notes?: string | null;
  enteredBy: string | null;
  actorRole?: "driver" | "user" | null;
  paymentOwner?: OperationalPaymentOwner | null;
  paymentMode?: OperationalPaymentMode | null;
  operatingMode?: string | null;
  receiptLocalUri?: string | null;
  ocrJobId?: string | null;
  /** Same value on a retry of the same save, so a network retry can't add it twice. */
  idempotencyKey?: string | null;
}

export type UpdateOtherExpenseInput = Omit<SaveOtherExpenseInput, "actorRole"> & {
  entryId: string;
};

export type MaintenanceType =
  | "service"
  | "repair"
  | "puncture"
  | "tyre"
  | "oil_change"
  | "permit"
  | "insurance"
  | "fitness";

export interface VehicleMaintenanceEntry {
  id: string;
  organization_id: string;
  vehicle_id: string;
  trip_id: string | null;
  maintenance_type: MaintenanceType;
  amount_inr: number;
  notes: string | null;
  invoice_storage_path: string | null;
  next_due_km: number | null;
  next_due_date: string | null;
  entered_by: string | null;
  entered_at: string;
  updated_at: string;
  status: "active" | "void";
}

export interface SaveVehicleMaintenanceInput {
  organizationId: string;
  vehicleId: string;
  tripId?: string | null;
  maintenanceType: MaintenanceType;
  amountInr: number;
  notes?: string | null;
  nextDueKm?: number | null;
  nextDueDate?: string | null;
  enteredBy: string | null;
  invoiceLocalUri?: string | null;
}

export type VehicleLedgerSourceType =
  | "fuel"
  | "toll"
  | "maintenance"
  | "repair"
  | "service"
  | "insurance"
  | "permit"
  | "manual_adjustment";

export type VehicleLedgerApprovalState = "draft" | "verified" | "approved" | "ignored";

export interface VehicleOperationLedgerEntry {
  id: string;
  organization_id: string;
  vehicle_id: string;
  source_type: VehicleLedgerSourceType;
  source_id: string;
  trip_id: string | null;
  entry_type: "expense" | "adjustment";
  amount: number;
  approval_state: VehicleLedgerApprovalState;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}
