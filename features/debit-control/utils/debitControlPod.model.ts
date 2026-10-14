/** Debit Control POD Received row and the charge lines captured at validation. */

export const POD_VALIDATED_EVENT = "pod.debit_control_validated";

/** Document charge taken off when the compliance advance was posted. */
export const ADVANCE_DOCUMENT_COST_EVENT = "compliance.advance_document_cost";

export type IndentType = "Contract" | "Adhoc" | "Spot";

export type PodChargeLines = {
  cost: number;
  loading: number;
  halting: number;
  unloading: number;
  extraPoint: number;
  other: number;
  specialApproval: number;
  delay: number;
  damage: number;
  productMissing: number;
  documentCost: number;
  podDelaySubmission: number;
  /** Fixed vendor deduction stored once for an IBond receipt. Not an editable charge. */
  ibondDeductible: number;
};

export type ChargeDraft = Record<keyof PodChargeLines, string>;

export const EMPTY_CHARGE_LINES: PodChargeLines = {
  cost: 0,
  loading: 0,
  halting: 0,
  unloading: 0,
  extraPoint: 0,
  other: 0,
  specialApproval: 0,
  delay: 0,
  damage: 0,
  productMissing: 0,
  documentCost: 0,
  podDelaySubmission: 0,
  ibondDeductible: 0,
};

/** Taken off vendor cost once when the hard-copy receipt was saved as IBond. */
export const IBOND_DEDUCTIBLE_COST = 1500;

/** Amounts that roll into Total Client Value / Total Vendor Value. */
export const INCLUDED_CHARGE_KEYS = [
  "cost",
  "loading",
  "halting",
  "unloading",
  "extraPoint",
  "other",
  "specialApproval",
] as const satisfies readonly (keyof PodChargeLines)[];

/** Deducted from the side's total. Document cost is vendor-only. */
export const EXCLUDED_CHARGE_KEYS = [
  "delay",
  "damage",
  "productMissing",
  "documentCost",
  "podDelaySubmission",
  "ibondDeductible",
] as const satisfies readonly (keyof PodChargeLines)[];

export type ChargeFieldKey = keyof PodChargeLines;

export type ChargeField = {
  key: ChargeFieldKey;
  clientLabel: string;
  vendorLabel: string;
  included: boolean;
  /** Shown on the vendor side only. */
  vendorOnly?: boolean;
  /** Stored with the vendor charges. Not shown as an editable amount. */
  fixed?: boolean;
};

export const CHARGE_FIELDS: readonly ChargeField[] = [
  { key: "cost", clientLabel: "Client Cost", vendorLabel: "Vendor Cost", included: true },
  { key: "loading", clientLabel: "Client Loading Value", vendorLabel: "Vendor Loading Value", included: true },
  { key: "halting", clientLabel: "Client Halting", vendorLabel: "Vendor Halting", included: true },
  { key: "unloading", clientLabel: "Client Unloading", vendorLabel: "Vendor Unloading", included: true },
  { key: "extraPoint", clientLabel: "Client Extra Point", vendorLabel: "Vendor Extra Point", included: true },
  { key: "other", clientLabel: "Client Other Value", vendorLabel: "Vendor Other Value", included: true },
  { key: "specialApproval", clientLabel: "Client Special Approval", vendorLabel: "Vendor Special Approval", included: true },
  { key: "delay", clientLabel: "Client Delay Delivery", vendorLabel: "Vendor Delay Delivery", included: false },
  { key: "damage", clientLabel: "Client Damage Value", vendorLabel: "Vendor Damage Value", included: false },
  { key: "productMissing", clientLabel: "Client Product Missing", vendorLabel: "Vendor Product Missing", included: false },
  {
    key: "documentCost",
    clientLabel: "Document Cost",
    vendorLabel: "Vendor Document Cost",
    included: false,
    vendorOnly: true,
  },
  {
    key: "podDelaySubmission",
    clientLabel: "POD Delay Submission",
    vendorLabel: "Vendor POD Delay Submission",
    included: false,
    vendorOnly: true,
  },
  {
    key: "ibondDeductible",
    clientLabel: "IBond Deductible Cost",
    vendorLabel: "IBond Deductible Cost",
    included: false,
    vendorOnly: true,
    fixed: true,
  },
];

export type DebitControlPendingTrip = {
  id: string;
  displayId: string;
  tripDate: string | null;
  lrNumbers: string[];
  from: string;
  to: string;
  clientName: string;
  vendorName: string;
  hasSoftPod: boolean;
};

export type DebitControlReceivedTrip = {
  id: string;
  displayId: string;
  tripDate: string | null;
  lrNumbers: string[];
  from: string;
  to: string;
  indentType: IndentType;
  clientName: string;
  clientHub: string;
  vendorName: string;
  vehicleType: string;
  vehicleNumber: string;
  clientInvoiceNumber: string | null;
  /** Sale on the trip, used to prefill Client Cost before validation. */
  clientPrice: number;
  /** Buy on the trip, used to prefill Vendor Cost before validation. */
  supplierRate: number;
  /** Set once POD validation is stored. Blocks another validation. */
  validatedAt: string | null;
  remarks: string | null;
  totalClientValue: number | null;
  totalVendorValue: number | null;
  clientCharges: PodChargeLines | null;
  vendorCharges: PodChargeLines | null;
};

export function podValidationIdempotencyKey(tripId: string): string {
  return `${tripId}:${POD_VALIDATED_EVENT}`;
}
