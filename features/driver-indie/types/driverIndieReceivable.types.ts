/** Shared Independent DRIVER book types — kept out of the service module to avoid offline import cycles. */

export type DriverIndieParty = {
  id: string;
  name: string;
  phone?: string | null;
};

export type DriverIndieReceivable = {
  id: string;
  owner_user_id: string;
  party_id: string;
  billed_amount: number;
  billed_version: number;
  status: "draft" | "issued" | "received" | "void";
  operational_trip_id: string | null;
  party_label: string | null;
  issued_at: string | null;
};

export type DriverIndieCollection = {
  id: string;
  receivable_id: string;
  amount: number;
  payment_mode: string;
  reference: string | null;
  paid_on: string | null;
  created_at: string;
};

export type DriverIndieReceivableListRow = {
  receivable: DriverIndieReceivable;
  collected: number;
  outstanding: number;
};
