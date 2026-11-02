/** Shared DCO Self book types — kept out of the service module to avoid offline import cycles. */

export type DcoSelfParty = {
  id: string;
  name: string;
  phone?: string | null;
};

export type DcoSelfReceivable = {
  id: string;
  workspace_id: string;
  party_b_id: string;
  billed_amount: number;
  billed_version: number;
  status: "draft" | "issued" | "received" | "void";
  operational_trip_id: string | null;
  party_a_label: string | null;
  issued_at: string | null;
};

export type DcoSelfCollection = {
  id: string;
  receivable_id: string;
  amount: number;
  payment_mode: string;
  reference: string | null;
  paid_on: string | null;
  created_at: string;
};

export type DcoSelfReceivableListRow = {
  receivable: DcoSelfReceivable;
  collected: number;
  outstanding: number;
};
