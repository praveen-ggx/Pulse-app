export const OBLIGATION_AGE_BUCKETS = [
  "current",
  "d1_15",
  "d16_30",
  "d31_60",
  "d60",
] as const;

export type ObligationAgeBucket = (typeof OBLIGATION_AGE_BUCKETS)[number];

export const OBLIGATION_AGE_LABELS: Record<ObligationAgeBucket, string> = {
  current: "Current",
  d1_15: "1–15",
  d16_30: "16–30",
  d31_60: "31–60",
  d60: "60+",
};

export type PipelineStageId =
  | "completed"
  | "pod_pending"
  | "pod_received_not_invoiced"
  | "ready_to_invoice"
  | "invoiced"
  | "cash_attributed";

export type CanvasSelection = {
  clientId: string | null;
  clientName: string | null;
  ageBucket: ObligationAgeBucket | null;
  pipelineStage: PipelineStageId | null;
  vintageMonthKey: string | null;
  vintageMonthLabel: string | null;
};

export const EMPTY_CANVAS_SELECTION: CanvasSelection = {
  clientId: null,
  clientName: null,
  ageBucket: null,
  pipelineStage: null,
  vintageMonthKey: null,
  vintageMonthLabel: null,
};

export const PIPELINE_STAGE_LABELS: Record<PipelineStageId, string> = {
  completed: "Completed",
  pod_pending: "POD pending",
  pod_received_not_invoiced: "POD received",
  ready_to_invoice: "Ready to invoice",
  invoiced: "Invoiced",
  cash_attributed: "Cash attributed",
};

export type TripFinancialFact = {
  tripId: string;
  clientId: string;
  clientName: string;
  tripLabel: string;
  status: string;
  sales: number;
  remainingDue: number;
  pickupDate: string | null;
  daysOld: number | null;
  ageBucket: ObligationAgeBucket | null;
  podReceived: boolean;
  physicalPodReceived: boolean;
  invoiced: boolean;
  completed: boolean;
};

export type OpenTripObligation = TripFinancialFact;

export type ClientCollectionRow = {
  id: string;
  name: string;
  billed: number;
  attributedReceipts: number;
  outstanding: number;
  openTrips: number;
  oldestObligationDays: number | null;
  ageMix: Record<ObligationAgeBucket, number>;
  shareOfOutstanding: number;
  isLedgerOnly: boolean;
};

export type PipelineStage = {
  id: PipelineStageId;
  count: number;
  value: number;
  customerCount: number;
};

export type VintageMonthPoint = {
  key: string;
  label: string;
  billed: number;
  attributedReceipts: number;
  outstanding: number;
  tripCount: number;
  customerCount: number;
};

export type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  value: number;
  href: "pipeline" | "invoice" | "pod" | "collections" | "intelligence";
};

export type FinanceProModel = {
  billed: number;
  attributedReceipts: number;
  outstanding: number;
  collectionPct: number;
  clientsWithBalance: number;
  clientRows: ClientCollectionRow[];
  tripFacts: TripFinancialFact[];
  openTrips: OpenTripObligation[];
  ageTotals: Record<ObligationAgeBucket, number>;
  unagedOutstanding: number;
  pipeline: PipelineStage[];
  vintage: VintageMonthPoint[];
  concentration: ClientCollectionRow[];
  attention: AttentionItem[];
  issuedInvoiceDocuments: {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    clientName: string | null;
    documentAmount: number;
    status: string;
    tripIds: string[];
    sourceLabel?: string;
    sourceReference?: string;
  }[];
  issuedThisMonthValue: number;
  issuedThisMonthCount: number;
  issuedLast30Value: number;
  issuedLast30Count: number;
};
