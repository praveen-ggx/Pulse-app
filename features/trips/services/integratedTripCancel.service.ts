/**
 * Cancel an integrated award before pickup.
 * Unlinks the trip from the indent, then reopens that indent for a new award.
 * Does not reverse ledger rows or cascade subcontracts.
 */
import { supabase } from "@/lib/supabase";
import {
  INTEGRATED_TRIP_INVOICE_BLOCK_MESSAGE,
  integratedTripCancelBlock,
  integratedTripCancelMessage,
  postedMoneyBlocksCancel,
  subcontractBlocksCancel,
  type IntegratedTripCancelReasonId,
} from "@/features/trips/utils/integratedTripCancel.util";

const VOID_INVOICE = new Set(["void", "cancelled", "canceled"]);

export type CancelIntegratedTripResult = {
  error: Error | null;
};

function fail(message: string): CancelIntegratedTripResult {
  return { error: new Error(message) };
}

export async function cancelIntegratedTrip(input: {
  tripId: string;
  reasonId: IntegratedTripCancelReasonId;
  otherText?: string | null;
}): Promise<CancelIntegratedTripResult> {
  const tripId = input.tripId.trim();
  if (!tripId) return fail("Trip not found.");

  const tripQuery = await supabase()
    .from("trips")
    .select(
      "id, status, source, source_market_bid_id, indent_id, supplier_id, compliance_decision, compliance_verified_at, finance_verified_at, advance_paid, amount_paid",
    )
    .eq("id", tripId)
    .maybeSingle();
  if (tripQuery.error) return fail("Could not load this trip. Try again.");
  if (!tripQuery.data) return fail("Trip not found.");

  const [subs, ledger, invoices] = await Promise.all([
    supabase().from("trip_subcontracts").select("status").eq("trip_id", tripId),
    supabase()
      .from("transactions")
      .select("amount_in, amount_out")
      .eq("trip_id", tripId),
    supabase().from("invoices").select("status").contains("trip_ids", [tripId]),
  ]);
  if (subs.error) return fail("Could not check subcontracts. Try again.");
  if (ledger.error) return fail("Could not check posted payments. Try again.");
  if (invoices.error) return fail("Could not check invoices. Try again.");

  const trip = tripQuery.data;
  const invoiceStatuses = (invoices.data ?? []).map((row) => row.status ?? "");
  const openInvoice = invoiceStatuses.some(
    (status) => !VOID_INVOICE.has(status.trim().toLowerCase()),
  );
  const hasPostedMoney = postedMoneyBlocksCancel({
    advancePaid: trip.advance_paid,
    amountPaid: trip.amount_paid,
    transactionAmounts: (ledger.data ?? []).map((row) => ({
      amountIn: row.amount_in,
      amountOut: row.amount_out,
    })),
    invoiceStatuses,
  });
  const block = integratedTripCancelBlock({
    source: trip.source,
    sourceMarketBidId: trip.source_market_bid_id,
    indentId: trip.indent_id,
    supplierId: trip.supplier_id,
    status: trip.status,
    complianceDecision: trip.compliance_decision,
    complianceVerifiedAt: trip.compliance_verified_at,
    financeVerifiedAt: trip.finance_verified_at,
    hasPostedMoney,
    hasSubcontract: subcontractBlocksCancel((subs.data ?? []).map((row) => row.status)),
    reasonId: input.reasonId,
    otherText: input.otherText,
  });
  if (block === "posted_money" && openInvoice && Number(trip.advance_paid) <= 0 && Number(trip.amount_paid) <= 0) {
    const ledgerOpen = (ledger.data ?? []).some(
      (row) => Math.abs(Number(row.amount_in) || 0) > 0 || Math.abs(Number(row.amount_out) || 0) > 0,
    );
    if (!ledgerOpen) return fail(INTEGRATED_TRIP_INVOICE_BLOCK_MESSAGE);
  }
  if (block) return fail(integratedTripCancelMessage(block));

  const now = new Date().toISOString();
  const user = await supabase().auth.getUser();
  const note = input.reasonId === "other" ? (input.otherText ?? "").trim() : null;
  const cancelled = await supabase()
    .from("trips")
    .update({
      status: "cancelled",
      indent_id: null,
      cancel_reason: input.reasonId,
      cancel_reason_note: note,
      cancelled_at: now,
      cancelled_by: user.data.user?.id ?? null,
      status_change_origin: "integrated_cancel",
      updated_at: now,
    })
    .eq("id", tripId)
    .select("id")
    .maybeSingle();
  if (cancelled.error || !cancelled.data) {
    return fail(cancelled.error?.message || "Could not cancel this trip.");
  }

  const indentId = trip.indent_id?.trim();
  if (!indentId) return { error: null };

  const reopened = await supabase()
    .from("indents")
    .update({
      status: "open",
      assigned_supplier_id: null,
      assigned_supplier_rate: null,
      award_revoked_at: now,
    })
    .eq("id", indentId)
    .select("id")
    .maybeSingle();
  if (reopened.error || !reopened.data) {
    return fail(
      "This trip was cancelled, but the indent could not be reopened. Reopen it from Indents.",
    );
  }
  return { error: null };
}
