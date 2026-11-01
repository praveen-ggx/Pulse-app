/**
 * Pulse Exchange payments — Marketplace money between a shipper (payer) and the
 * winning bidder (payee) on an Exchange trip. Each side's Finance rows post
 * against its own account for the other org (or the DCO payee). A DCO payee
 * works the same rows from the Driver App.
 *
 * Gate 1: either side records a payment (claim). Gate 2: the other side
 * confirms it; only then does it post to both orgs' ledgers. All writes are
 * RPCs; `exchange_payments` is read-only to clients.
 */
import { supabase } from "@/lib/supabase";

export type ExchangePaymentMode = "CASH" | "UPI" | "BANK" | "CHEQUE";
export type ExchangePaymentStatus = "claimed" | "confirmed" | "rejected" | "cancelled";
export type ExchangeSide = "payer" | "payee";

export interface ExchangePaymentRow {
  id: string;
  trip_id: string;
  market_bid_id: string | null;
  payer_organization_id: string;
  /** Null when the payee is an individual DCO (`payee_dco_payee_id`). */
  payee_organization_id: string | null;
  payee_dco_payee_id: string | null;
  amount: number;
  payment_mode: ExchangePaymentMode;
  payment_reference: string | null;
  paid_on: string;
  notes: string | null;
  status: ExchangePaymentStatus;
  claimed_by_side: ExchangeSide;
  claimed_by: string | null;
  claimed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  payer_transaction_id: string | null;
  payee_transaction_id: string | null;
}

export interface ExchangeTripSummary {
  trip_id: string;
  trip_number: string | null;
  viewer_side: ExchangeSide;
  /** `dco`: an individual DCO, who acts from the Driver App and has no Finance ledger. */
  payee_kind: "organization" | "dco";
  payer_organization_id: string;
  payer_organization_name: string | null;
  payee_organization_id: string | null;
  /** The bidder org's name, or the DCO's name. */
  payee_organization_name: string | null;
  agreed_amount: number;
  confirmed_amount: number;
  claimed_amount: number;
  /** The viewer's Finance party for the other side; confirmed payments post against it. */
  ledger_contact_type: "supplier" | "client" | "dco" | null;
  ledger_contact_id: string | null;
  payments: ExchangePaymentRow[];
}

/** One row of Finance's Marketplace trips lane. */
export interface ExchangeLaneTrip extends ExchangeTripSummary {
  /** The viewer org's own trip for the award: the shipper's trip, or the bidder's execution trip. */
  viewer_trip_id: string;
  viewer_trip_number: string | null;
  ledger_contact_name: string | null;
}

export interface ClaimExchangePaymentInput {
  tripId: string;
  amount: number;
  paymentMode: ExchangePaymentMode;
  /** Stable per submit so a retried submit returns the same claim. */
  idempotencyKey: string;
  paymentReference?: string | null;
  paidOn?: string | null;
  notes?: string | null;
}

/** A claim waiting this long for the other side is flagged overdue (no auto-confirm). */
export const EXCHANGE_CONFIRMATION_SLA_HOURS = 72;

const EXCHANGE_ERROR_MESSAGES: Record<string, string> = {
  over_settlement: "This would take recorded payments past the agreed amount for this trip.",
  duplicate_reference: "This UTR / reference is already recorded on this trip.",
  not_exchange_trip: "This trip is not settled through Pulse Exchange.",
  ambiguous_side: "You belong to both organizations on this trip, so you can't record or confirm its payments.",
  award_changed: "The Marketplace award on this trip changed after this payment was recorded.",
  marketplace_account_reserved: "A Marketplace partner you are not connected to can only be the supplier on its Marketplace trip.",
  marketplace_fee_party_reserved: "Pulse Marketplace (fees) is used only for Marketplace platform fees.",
};

export function exchangeErrorMessage(raw: string): string {
  const code = raw.match(/^([a-z_]+):/)?.[1];
  if (code && EXCHANGE_ERROR_MESSAGES[code]) return EXCHANGE_ERROR_MESSAGES[code];
  return raw.replace(/^[a-z_]+:\s*/, "");
}

export function newExchangeIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Same logical payment always yields the same Exchange idempotency key. */
export function stableExchangeIdempotencyKey(
  orgId: string,
  input: Omit<ClaimExchangePaymentInput, "idempotencyKey">,
): string {
  return [
    "exchange-claim",
    orgId.trim(),
    input.tripId.trim(),
    String(Math.round(Number(input.amount) || 0)),
    input.paymentMode,
    (input.paymentReference ?? "").trim().toLowerCase(),
    (input.paidOn ?? "").slice(0, 10),
  ].join(":");
}

const pendingClaims = new Map<string, Promise<{ error: Error | null; payment: ExchangePaymentRow | null }>>();

/**
 * Claims from a form that has no key of its own (Finance). The same payment
 * always reuses one deterministic key, including timeout-after-commit retries.
 */
export async function claimExchangePaymentOnce(
  orgId: string,
  input: Omit<ClaimExchangePaymentInput, "idempotencyKey">,
): Promise<{ error: Error | null; payment: ExchangePaymentRow | null }> {
  const key = stableExchangeIdempotencyKey(orgId, input);
  const pending = pendingClaims.get(key);
  if (pending) return pending;
  const run = claimExchangePayment({ ...input, idempotencyKey: key });
  pendingClaims.set(key, run);
  try {
    return await run;
  } finally {
    if (pendingClaims.get(key) === run) pendingClaims.delete(key);
  }
}

export function isExchangeClaimOverdue(
  payment: Pick<ExchangePaymentRow, "status" | "claimed_at">,
  now: Date = new Date(),
): boolean {
  if (payment.status !== "claimed") return false;
  const claimedAt = Date.parse(payment.claimed_at);
  if (!Number.isFinite(claimedAt)) return false;
  return now.getTime() - claimedAt > EXCHANGE_CONFIRMATION_SLA_HOURS * 3_600_000;
}

/** Maps the Finance description `Mode:` label to an Exchange payment mode. */
export function exchangeModeFromLedgerLabel(label: string | null | undefined): ExchangePaymentMode {
  const v = String(label ?? "").trim().toLowerCase();
  if (v === "upi") return "UPI";
  if (v === "cheque") return "CHEQUE";
  if (v === "bank transfer" || v === "bank" || v === "neft" || v === "rtgs" || v === "imps") return "BANK";
  return "CASH";
}

/** True when a Finance party on this trip is the viewer's Exchange counterparty, so its payments go through Exchange. */
export function isExchangeLedgerContact(
  summary: Pick<ExchangeTripSummary, "ledger_contact_type" | "ledger_contact_id"> | null,
  contactType: string | null | undefined,
  contactId: string | null | undefined,
): boolean {
  if (!summary?.ledger_contact_type) return false;
  if (String(contactType ?? "").toLowerCase() !== summary.ledger_contact_type) return false;
  return summary.ledger_contact_type === "dco" || (!!contactId && contactId === summary.ledger_contact_id);
}

export async function getExchangeTripSummary(
  tripId: string,
): Promise<{ error: Error | null; summary: ExchangeTripSummary | null }> {
  const { data, error } = await supabase().rpc("get_exchange_trip_summary", { p_trip_id: tripId });
  if (error) return { error: new Error(error.message), summary: null };
  return { error: null, summary: (data as ExchangeTripSummary | null) ?? null };
}

export async function listExchangeTrips(
  orgId: string,
): Promise<{ error: Error | null; trips: ExchangeLaneTrip[] }> {
  const { data, error } = await supabase().rpc("list_exchange_trips", { p_org_id: orgId });
  if (error) return { error: new Error(error.message), trips: [] };
  return { error: null, trips: (data as ExchangeLaneTrip[] | null) ?? [] };
}

async function exchangeRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ error: Error | null; payment: ExchangePaymentRow | null }> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) return { error: new Error(exchangeErrorMessage(error.message)), payment: null };
  return { error: null, payment: data as ExchangePaymentRow };
}

export function claimExchangePayment(input: ClaimExchangePaymentInput) {
  return exchangeRpc("claim_exchange_payment", {
    p_trip_id: input.tripId,
    p_amount: input.amount,
    p_payment_mode: input.paymentMode,
    p_idempotency_key: input.idempotencyKey,
    p_payment_reference: input.paymentReference?.trim() || null,
    p_paid_on: input.paidOn?.slice(0, 10) || null,
    p_notes: input.notes?.trim() || null,
  });
}

export function confirmExchangePayment(paymentId: string) {
  return exchangeRpc("confirm_exchange_payment", { p_exchange_payment_id: paymentId });
}

export function rejectExchangePayment(paymentId: string, reason: string) {
  return exchangeRpc("reject_exchange_payment", { p_exchange_payment_id: paymentId, p_reason: reason });
}

export function cancelExchangePayment(paymentId: string) {
  return exchangeRpc("cancel_exchange_payment", { p_exchange_payment_id: paymentId });
}
