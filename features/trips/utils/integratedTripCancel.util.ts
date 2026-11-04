/**
 * Cancel rules for an integrated trip: a GoGoVan indent awarded to a supplier,
 * with a driver or truck, before pickup. Marketplace awards are out of scope.
 *
 * Indent: clear the trip link and reopen the indent so another supplier can be awarded.
 * Money: refuse when an advance, payment, or invoice is already posted.
 * Planned rates (driver commission, supplier rate) do not block.
 * Subcontracts: refuse until the downstream assignment is cleared. Do not cascade.
 */

export const INTEGRATED_TRIP_CANCEL_REASONS = [
  { id: "client_requested", label: "Client requested cancellation" },
  { id: "no_driver_vehicle", label: "No driver/vehicle available" },
  { id: "duplicate_trip", label: "Duplicate trip" },
  { id: "rate_pricing", label: "Rate/pricing issue" },
  { id: "operational", label: "Operational issue" },
  { id: "other", label: "Other" },
] as const;

export type IntegratedTripCancelReasonId =
  (typeof INTEGRATED_TRIP_CANCEL_REASONS)[number]["id"];

export type IntegratedTripCancelBlock =
  | "not_integrated"
  | "marketplace"
  | "already_picked_up"
  | "compliance_review"
  | "posted_money"
  | "subcontract"
  | "reason_required";

const PICKED_UP_OR_LATER = new Set([
  "picked_up",
  "pickup",
  "in_progress",
  "in_transit",
  "dispatched",
  "transit",
  "at_drop",
  "unloading",
  "arrived",
  "at_destination",
  "completed",
  "delivered",
  "done",
  "cancelled",
  "canceled",
]);

const COMPLIANCE_REVIEW = new Set([
  "pending",
  "in_review",
  "approved",
  "verified",
]);

export type IntegratedTripCancelInput = {
  source?: string | null;
  sourceMarketBidId?: string | null;
  indentId?: string | null;
  supplierId?: string | null;
  status?: string | null;
  complianceDecision?: string | null;
  complianceVerifiedAt?: string | null;
  financeVerifiedAt?: string | null;
  hasPostedMoney?: boolean;
  hasSubcontract?: boolean;
  reasonId?: string | null;
  otherText?: string | null;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isMarketplaceAwardTrip(
  trip: Pick<IntegratedTripCancelInput, "source" | "sourceMarketBidId">,
): boolean {
  if (norm(trip.source) === "market_bid") return true;
  return Boolean(trip.sourceMarketBidId?.trim());
}

/** Indent awarded to a supplier, and not a marketplace award. */
export function isIntegratedAwardTrip(
  trip: Pick<IntegratedTripCancelInput, "source" | "sourceMarketBidId" | "indentId" | "supplierId">,
): boolean {
  if (isMarketplaceAwardTrip(trip)) return false;
  return Boolean(trip.indentId?.trim()) && Boolean(trip.supplierId?.trim());
}

const RESOLVED_SUBCONTRACT = new Set([
  "cancelled",
  "canceled",
  "void",
  "closed",
  "resolved",
]);

const VOID_MONEY = new Set(["void", "cancelled", "canceled"]);

export function subcontractBlocksCancel(statuses: readonly string[]): boolean {
  return statuses.some((status) => !RESOLVED_SUBCONTRACT.has(norm(status)));
}

function ledgerRowHasAmount(row: {
  amount?: number | null;
  amountIn?: number | null;
  amountOut?: number | null;
}): boolean {
  return (
    Math.abs(Number(row.amount) || 0) > 0 ||
    Math.abs(Number(row.amountIn) || 0) > 0 ||
    Math.abs(Number(row.amountOut) || 0) > 0
  );
}

export function postedMoneyBlocksCancel(input: {
  advancePaid?: number | null;
  amountPaid?: number | null;
  transactionAmounts?: readonly {
    amount?: number | null;
    amountIn?: number | null;
    amountOut?: number | null;
    status?: string | null;
  }[];
  invoiceStatuses?: readonly string[];
}): boolean {
  if (Number(input.advancePaid) > 0 || Number(input.amountPaid) > 0) return true;
  if (
    (input.transactionAmounts ?? []).some(
      (row) => ledgerRowHasAmount(row) && !VOID_MONEY.has(norm(row.status)),
    )
  ) {
    return true;
  }
  return (input.invoiceStatuses ?? []).some((status) => !VOID_MONEY.has(norm(status)));
}

/** True when the Cancel trip action should be offered. Money and review checks run on confirm. */
export function integratedTripCancelOffered(
  trip: Pick<
    IntegratedTripCancelInput,
    "source" | "sourceMarketBidId" | "indentId" | "supplierId" | "status"
  >,
): boolean {
  if (!isIntegratedAwardTrip(trip)) return false;
  return !PICKED_UP_OR_LATER.has(norm(trip.status));
}

export const INTEGRATED_TRIP_INVOICE_BLOCK_MESSAGE =
  "An invoice is already on this trip. Resolve it in Finance before cancelling.";

export function integratedTripCancelMessage(block: IntegratedTripCancelBlock): string {
  switch (block) {
    case "not_integrated":
      return "Only an integrated trip awarded from an indent can be cancelled here.";
    case "marketplace":
      return "Marketplace trips stay on the exchange flow.";
    case "already_picked_up":
      return "This trip is already past pickup.";
    case "compliance_review":
      return "Clear compliance or finance review before cancelling.";
    case "posted_money":
      return "Clear the advance, payment, or invoice before cancelling.";
    case "subcontract":
      return "Resolve the subcontract before cancelling this trip.";
    case "reason_required":
      return "Choose a cancel reason. Other needs a short note.";
  }
}

export function integratedTripCancelBlock(
  trip: IntegratedTripCancelInput,
): IntegratedTripCancelBlock | null {
  if (isMarketplaceAwardTrip(trip)) return "marketplace";
  if (!isIntegratedAwardTrip(trip)) return "not_integrated";
  if (PICKED_UP_OR_LATER.has(norm(trip.status))) return "already_picked_up";
  if (
    trip.complianceVerifiedAt?.trim() ||
    trip.financeVerifiedAt?.trim() ||
    COMPLIANCE_REVIEW.has(norm(trip.complianceDecision))
  ) {
    return "compliance_review";
  }
  if (trip.hasPostedMoney) return "posted_money";
  if (trip.hasSubcontract) return "subcontract";
  const reason = (trip.reasonId ?? "").trim() as IntegratedTripCancelReasonId;
  const known = INTEGRATED_TRIP_CANCEL_REASONS.some((item) => item.id === reason);
  if (!known) return "reason_required";
  if (reason === "other" && !(trip.otherText ?? "").trim()) return "reason_required";
  return null;
}
