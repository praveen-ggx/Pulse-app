import type { LedgerEntryReceiptDetailRow } from "@/components/ledger/LedgerEntryReceiptCard";
import {
  isAggregateTrip,
  tripEarningsDetailForDriver,
  type DriverTripPayoutTerms,
} from "@/features/drivers/utils/driverUtils.util";
import { getDriverTripDisplayNumber } from "@/features/driver/utils/driverTripSequence.util";
import type { DriverLedgerRow } from "@/features/drivers/services/drivers.service";
import { formatLedgerReceiptDate } from "@/features/finance/utils/ledgerTransactionReceipt.util";
import type { TripRow } from "@/features/trips/services/trips.service";

export type DriverTripPaymentStatus =
  | "salary"
  | "settled"
  | "fleet_marked"
  | "pending"
  | "action_required"
  | "incomplete";

export type DriverTripSettlementTone = "success" | "info" | "warning" | "fleet" | "muted";

export type DriverTripSettlementView = {
  status: DriverTripPaymentStatus;
  statusLabel: string;
  statusTone: DriverTripSettlementTone;
  /** Amount to verify / record / display as active payment */
  amount: number;
  /** Trip commission / expected driver earning */
  expectedAmount: number;
  /** True when expectedAmount has no agreed commission/salary terms behind it — a legacy 10% guess, not a real figure. */
  isEstimated: boolean;
  /** Trip org matches a linked employer — earnings / commission block applies. */
  isFleetLinked: boolean;
  /**
   * Agreed commission (trip_commission / per_km / %) with a positive amount.
   * Salary trips and estimated guesses are false.
   */
  commissionApplies: boolean;
  /** Show the primary estimated/salary/earning row when fleet-linked and there is something to show. */
  showEstimatedEarning: boolean;
  /** Bonus + positive adjustment credits for this trip (excludes settlement / reimbursements). */
  otherIncomeAmount: number;
  /** Deduction ledger total for this trip (absolute INR). */
  deductionsAmount: number;
  /** Fleet-marked amount before driver verifies (if any) */
  fleetMarkedAmount: number | null;
  /** Verified settlement amount (if settled) */
  receivedAmount: number | null;
  /** Remaining unpaid vs expected (before settlement) */
  outstandingAmount: number;
  /** Expected minus accepted payment when fleet pays or settled less than expected */
  writeOffAmount: number;
  hasPaymentShortfall: boolean;
  partialPaymentAccepted: boolean;
  isSalary: boolean;
  fleetName: string;
  displayId: string;
  from: string;
  to: string;
  settlementLedger: DriverLedgerRow | null;
  fleetPendingLedger: DriverLedgerRow | null;
  paymentMode: string | null;
  utr: string | null;
  capturedAtRaw: string | null;
  transactionId: string | null;
  canRequestPayment: boolean;
  canMarkAsPaid: boolean;
  canVerifyFleetPayment: boolean;
  canShareReceipt: boolean;
};

/** Other income = non-settlement trip credits (bonus / positive adjustment). */
export function sumTripOtherIncome(
  entries: DriverLedgerRow[],
  tripId: string,
): number {
  const tid = tripId.trim();
  if (!tid) return 0;
  let total = 0;
  for (const entry of entries) {
    if (String(entry.trip_id ?? "").trim() !== tid) continue;
    const type = String(entry.type ?? "").toLowerCase();
    if (type !== "bonus" && type !== "adjustment") continue;
    const amt = Math.round(Number(entry.amount) || 0);
    if (amt > 0) total += amt;
  }
  return total;
}

export function sumTripLedgerDeductions(
  entries: DriverLedgerRow[],
  tripId: string,
): number {
  const tid = tripId.trim();
  if (!tid) return 0;
  let total = 0;
  for (const entry of entries) {
    if (String(entry.trip_id ?? "").trim() !== tid) continue;
    if (String(entry.type ?? "").toLowerCase() !== "deduction") continue;
    total += Math.abs(Math.round(Number(entry.amount) || 0));
  }
  return total;
}

export function computeTripPaymentDifference(input: {
  expectedAmount: number;
  receivedAmount: number;
  fleetMarkedAmount: number | null;
  isSettled: boolean;
  hasFleetPending: boolean;
}) {
  const expected = Math.max(0, Math.round(input.expectedAmount));
  const received = Math.max(0, Math.round(input.receivedAmount));
  const fleetMarked =
    input.fleetMarkedAmount != null ? Math.max(0, Math.round(input.fleetMarkedAmount)) : null;

  const activePaymentAmount = input.isSettled
    ? received
    : input.hasFleetPending && fleetMarked != null
      ? fleetMarked
      : 0;

  const hasPaymentShortfall =
    expected > 0 && activePaymentAmount > 0 && activePaymentAmount < expected;

  const writeOffAmount = hasPaymentShortfall ? expected - activePaymentAmount : 0;

  const creditedTowardExpected =
    received > 0
      ? received
      : input.hasFleetPending && fleetMarked != null
        ? fleetMarked
        : 0;

  const outstandingAmount = input.isSettled
    ? 0
    : Math.max(0, expected - creditedTowardExpected);

  const partialPaymentAccepted = received > 0 && received < expected;

  return {
    activePaymentAmount,
    hasPaymentShortfall,
    writeOffAmount,
    outstandingAmount,
    partialPaymentAccepted,
  };
}

export function buildMarkPaidConfirmMessage(input: {
  tripDisplay: string;
  expectedAmount: number;
  paymentAmount: number;
  writeOffAmount: number;
  hasPaymentShortfall: boolean;
  utr?: string | null;
  mode?: string | null;
  isFleetVerify: boolean;
}): string {
  const paymentStr = `₹${Math.round(input.paymentAmount).toLocaleString("en-IN")}`;
  const expectedStr = `₹${Math.round(input.expectedAmount).toLocaleString("en-IN")}`;
  const writeOffStr = `₹${Math.round(input.writeOffAmount).toLocaleString("en-IN")}`;

  if (input.isFleetVerify) {
    const mode = formatDriverPaymentModeLabel(input.mode ?? null);
    const utr = input.utr ?? "—";
    if (input.hasPaymentShortfall && input.writeOffAmount > 0) {
      return `Fleet marked ${paymentStr} for ${input.tripDisplay} (trip earning ${expectedStr}, Mode: ${mode}, UTR: ${utr}). ${writeOffStr} will be written off. Accept and mark as settled?`;
    }
    return `Verify fleet marked payment for ${input.tripDisplay}: ${paymentStr} (Mode: ${mode}, UTR: ${utr}). This will update your cash balance.`;
  }

  if (input.hasPaymentShortfall && input.writeOffAmount > 0) {
    return `Record ${paymentStr} for ${input.tripDisplay} (trip earning ${expectedStr}). ${writeOffStr} will be written off. This will update your cash balance.`;
  }

  return `Record ${paymentStr} for ${input.tripDisplay} as received? This will update your cash balance.`;
}

export function extractDriverPaymentUtr(raw?: string | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/\bUTR\b\s*[:=]?\s*([0-9A-Za-z-]{8,24})\b/i);
  return m?.[1] ?? null;
}

export function deriveDriverPaymentMode(raw?: string | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const modeToken = s.match(/\bMode\s*:\s*([A-Za-z][A-Za-z_/ -]{0,24})/i)?.[1]?.trim();
  if (modeToken) {
    const id = modeToken.toUpperCase();
    if (id.includes("UPI")) return "UPI";
    if (id.includes("CHEQUE") || id === "CHECK") return "CHEQUE";
    if (
      id.includes("BANK") ||
      id.includes("NEFT") ||
      id.includes("RTGS") ||
      id.includes("IMPS")
    ) {
      return "BANK TRANSFER";
    }
    if (id === "CASH" || id.startsWith("CASH ")) return "CASH";
    return id;
  }

  const lower = s.toLowerCase();
  if (/\bupi\b/.test(lower)) return "UPI";
  if (/\b(neft|rtgs|imps|bank transfer)\b/.test(lower) || /\bbank\b/.test(lower)) {
    return "BANK TRANSFER";
  }
  if (/\bcheque\b/.test(lower)) return "CHEQUE";
  // Instrument only — never treat "cash in" / "cash balance" as cash mode.
  if (/\b(paid in cash|cash payment|mode\s*:\s*cash)\b/.test(lower)) return "CASH";
  return null;
}

export function formatDriverPaymentModeLabel(mode: string | null | undefined): string {
  const raw = (mode ?? "").trim();
  if (!raw || raw === "—") return "—";
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function hasFleetPaidPendingToken(raw?: string | null): boolean {
  const s = (raw ?? "").trim();
  if (!s) return false;
  return /Sync\s*:\s*FLEET_PAID_PENDING/i.test(s);
}

export function isLegacyFleetPendingEvidence(raw?: string | null): boolean {
  const s = (raw ?? "").trim();
  if (!s) return false;
  return /(\bUTR\b|\bMode\s*:|\bTrip\s*Commission\b|\bTrip\s*Payment\b|\bSettlement\b)/i.test(s);
}

export type DriverLedgerTripIndex = {
  receivedByTripId: Record<string, number>;
  latestCreditLedgerByTripId: Record<string, DriverLedgerRow>;
  latestFleetPaidPendingLedgerByTripId: Record<string, DriverLedgerRow>;
};

export function indexDriverLedgerForTrips(entries: DriverLedgerRow[]): DriverLedgerTripIndex {
  const receivedByTripId: Record<string, number> = {};
  const latestCreditLedgerByTripId: Record<string, DriverLedgerRow> = {};
  const latestFleetPaidPendingLedgerByTripId: Record<string, DriverLedgerRow> = {};

  const receivedEntries = entries
    .filter((entry) => entry.type === "settlement" && (Number(entry.amount) || 0) > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  for (const entry of receivedEntries) {
    const tid = entry.trip_id?.trim() || "";
    if (!tid) continue;
    receivedByTripId[tid] = (receivedByTripId[tid] ?? 0) + (Number(entry.amount) || 0);
    if (!latestCreditLedgerByTripId[tid]) latestCreditLedgerByTripId[tid] = entry;
  }

  for (const entry of entries) {
    const tid = entry.trip_id?.trim() || null;
    if (!tid) continue;
    if ((receivedByTripId[tid] ?? 0) > 0) continue;
    if (entry.type === "settlement") continue;
    const amt = Number(entry.amount) || 0;
    if (amt <= 0) continue;
    const desc = entry.description;
    if (!hasFleetPaidPendingToken(desc) && !isLegacyFleetPendingEvidence(desc)) continue;
    const prev = latestFleetPaidPendingLedgerByTripId[tid];
    const prevT = prev?.created_at ? new Date(prev.created_at).getTime() : 0;
    const nextT = entry.created_at ? new Date(entry.created_at).getTime() : 0;
    if (!prev || nextT > prevT) latestFleetPaidPendingLedgerByTripId[tid] = entry;
  }

  return { receivedByTripId, latestCreditLedgerByTripId, latestFleetPaidPendingLedgerByTripId };
}

function paidSubLabel(desc: string | null | undefined): string {
  const hasReceiptMeta = !!desc && /(\bUTR\b|\bMode\s*:)/i.test(String(desc));
  const paymentMode = deriveDriverPaymentMode(desc);
  if (hasReceiptMeta) return "Paid synced";
  if (paymentMode === "UPI") return "Paid via UPI";
  if (paymentMode === "BANK TRANSFER") return "Paid to bank";
  if (paymentMode === "CASH") return "Paid in cash";
  return "Paid to bank";
}

function fleetPendingSubLabel(desc: string | null | undefined): string {
  const mode = deriveDriverPaymentMode(desc);
  if (mode === "UPI") return "Fleet marked paid (UPI)";
  if (mode === "BANK TRANSFER") return "Fleet marked paid (Bank)";
  if (mode === "CASH") return "Fleet marked paid (Cash)";
  return "Fleet marked paid";
}

export function buildDriverTripSettlementView(input: {
  trip: TripRow;
  ledgerEntries: DriverLedgerRow[];
  fleetOrgName: string;
  driverTripNumberById: Record<string, string>;
  tripCompleted: boolean;
  payoutTerms?: DriverTripPayoutTerms | null;
  /** Employer org matches trip org (history Fleet Trips rule). Defaults to true when omitted for back-compat. */
  isFleetLinked?: boolean;
}): DriverTripSettlementView {
  const {
    trip,
    ledgerEntries,
    fleetOrgName,
    driverTripNumberById,
    tripCompleted,
    payoutTerms,
  } = input;
  const isFleetLinked = input.isFleetLinked !== false;
  const displayId = getDriverTripDisplayNumber(trip, driverTripNumberById);
  const from = trip.pickup_area?.trim() || "Unknown origin";
  const to = trip.drop_location?.trim() || "Unknown destination";
  const isSalary = isAggregateTrip(trip);
  const earningsDetail = tripEarningsDetailForDriver(trip, payoutTerms);
  const expectedAmount = Math.round(earningsDetail.amount);
  const isEstimated = earningsDetail.isEstimated;
  const commissionApplies =
    isFleetLinked &&
    !isSalary &&
    !isEstimated &&
    (earningsDetail.basis === "trip_commission" ||
      earningsDetail.basis === "per_km" ||
      earningsDetail.basis === "commission_percent") &&
    expectedAmount > 0;
  const showEstimatedEarning =
    isFleetLinked && (isSalary || expectedAmount > 0 || isEstimated);
  const otherIncomeAmount = sumTripOtherIncome(ledgerEntries, trip.id);
  const deductionsAmount = sumTripLedgerDeductions(ledgerEntries, trip.id);

  const earningsFlags = {
    isFleetLinked,
    commissionApplies,
    showEstimatedEarning,
    otherIncomeAmount,
    deductionsAmount,
  };

  if (isSalary) {
    return {
      status: "salary",
      statusLabel: "Salary trip",
      statusTone: "info",
      amount: 0,
      expectedAmount,
      isEstimated,
      ...earningsFlags,
      fleetMarkedAmount: null,
      receivedAmount: null,
      outstandingAmount: 0,
      writeOffAmount: 0,
      hasPaymentShortfall: false,
      partialPaymentAccepted: false,
      isSalary: true,
      fleetName: fleetOrgName,
      displayId,
      from,
      to,
      settlementLedger: null,
      fleetPendingLedger: null,
      paymentMode: null,
      utr: null,
      capturedAtRaw: null,
      transactionId: null,
      canRequestPayment: false,
      canMarkAsPaid: false,
      canVerifyFleetPayment: false,
      canShareReceipt: false,
    };
  }

  const { receivedByTripId, latestCreditLedgerByTripId, latestFleetPaidPendingLedgerByTripId } =
    indexDriverLedgerForTrips(ledgerEntries);

  const receivedAmt = receivedByTripId[trip.id] ?? 0;
  const settlementLedgerEarly = latestCreditLedgerByTripId[trip.id] ?? null;

  if (!tripCompleted) {
    const outstandingAmount = Math.max(0, expectedAmount - receivedAmt);
    const partial = receivedAmt > 0 && outstandingAmount > 0;
    return {
      status: "incomplete",
      statusLabel: partial ? "Trip not completed · Partial collected" : "Trip not completed",
      statusTone: partial ? "warning" : "muted",
      amount: expectedAmount,
      expectedAmount,
      isEstimated,
      ...earningsFlags,
      fleetMarkedAmount: null,
      receivedAmount: receivedAmt > 0 ? receivedAmt : null,
      outstandingAmount,
      writeOffAmount: 0,
      hasPaymentShortfall: false,
      partialPaymentAccepted: partial,
      isSalary: false,
      fleetName: fleetOrgName,
      displayId,
      from,
      to,
      settlementLedger: settlementLedgerEarly,
      fleetPendingLedger: null,
      paymentMode: deriveDriverPaymentMode(settlementLedgerEarly?.description),
      utr: extractDriverPaymentUtr(settlementLedgerEarly?.description),
      capturedAtRaw: settlementLedgerEarly?.created_at ?? null,
      transactionId: settlementLedgerEarly?.id ?? trip.id,
      canRequestPayment: false,
      canMarkAsPaid: outstandingAmount > 0,
      canVerifyFleetPayment: false,
      canShareReceipt: receivedAmt > 0,
    };
  }

  const isSettled = expectedAmount > 0 ? receivedAmt >= expectedAmount : receivedAmt > 0;
  const fleetPendingLedger = latestFleetPaidPendingLedgerByTripId[trip.id] ?? null;
  const hasFleetPending = !!fleetPendingLedger && !isSettled;
  const fleetMarkedAmount = hasFleetPending
    ? Math.round(Number(fleetPendingLedger?.amount) || 0)
    : null;
  const isActionRequired = !isSettled && !hasFleetPending && expectedAmount === 0;
  const settlementLedger = latestCreditLedgerByTripId[trip.id] ?? null;
  const activeLedger = isSettled ? settlementLedger : fleetPendingLedger;
  const activeDesc = activeLedger?.description ?? null;

  const paymentDiff = computeTripPaymentDifference({
    expectedAmount,
    receivedAmount: receivedAmt,
    fleetMarkedAmount,
    isSettled,
    hasFleetPending,
  });

  let status: DriverTripPaymentStatus = "pending";
  let statusLabel = "Pending from fleet";
  let statusTone: DriverTripSettlementTone = "info";

  if (isSettled) {
    status = "settled";
    statusLabel = paymentDiff.partialPaymentAccepted
      ? `${paidSubLabel(settlementLedger?.description)} · Partial`
      : paidSubLabel(settlementLedger?.description);
    statusTone = "success";
  } else if (receivedAmt > 0) {
    status = "pending";
    statusLabel = "Partial collected";
    statusTone = "warning";
  } else if (hasFleetPending) {
    status = "fleet_marked";
    statusLabel = paymentDiff.hasPaymentShortfall
      ? `${fleetPendingSubLabel(fleetPendingLedger?.description)} · Shortfall`
      : fleetPendingSubLabel(fleetPendingLedger?.description);
    statusTone = "fleet";
  } else if (isActionRequired) {
    status = "action_required";
    statusLabel = "Ready to claim";
    statusTone = "warning";
  }

  const amount = isSettled
    ? paymentDiff.activePaymentAmount
    : hasFleetPending
      ? paymentDiff.activePaymentAmount || expectedAmount
      : expectedAmount;

  return {
    status,
    statusLabel,
    statusTone,
    amount,
    expectedAmount,
    isEstimated,
    ...earningsFlags,
    fleetMarkedAmount,
    receivedAmount: isSettled ? receivedAmt : null,
    outstandingAmount: paymentDiff.outstandingAmount,
    writeOffAmount: paymentDiff.writeOffAmount,
    hasPaymentShortfall: paymentDiff.hasPaymentShortfall,
    partialPaymentAccepted: paymentDiff.partialPaymentAccepted,
    isSalary: false,
    fleetName: fleetOrgName,
    displayId,
    from,
    to,
    settlementLedger,
    fleetPendingLedger: hasFleetPending ? fleetPendingLedger : null,
    paymentMode: deriveDriverPaymentMode(activeDesc),
    utr: extractDriverPaymentUtr(activeDesc),
    capturedAtRaw:
      activeLedger?.created_at ??
      trip.completed_at ??
      trip.updated_at ??
      trip.created_at ??
      null,
    transactionId: activeLedger?.id ?? trip.id,
    // A trip with no agreed commission/salary terms has nothing real to claim —
    // don't let the legacy 10% guess become the basis of an actual payment
    // request or mark-as-paid action.
    canRequestPayment: (status === "pending" || status === "action_required") && !isEstimated,
    canMarkAsPaid:
      (status === "pending" || status === "action_required") &&
      paymentDiff.outstandingAmount > 0,
    canVerifyFleetPayment: status === "fleet_marked",
    canShareReceipt: status === "settled",
  };
}

export function buildDriverLedgerReceiptDetails(opts: {
  paymentDateRaw?: string | null;
  partyName: string;
  tripDisplay?: string | null;
  paymentMode?: string | null;
  reference?: string | null;
  route?: string | null;
  dateLabel?: string;
  category?: string | null;
}): LedgerEntryReceiptDetailRow[] {
  const details: LedgerEntryReceiptDetailRow[] = [
    {
      label: (opts.dateLabel ?? "").trim() || "Payment date",
      value: formatLedgerReceiptDate(opts.paymentDateRaw),
    },
    { label: "Party", value: (opts.partyName ?? "").trim() || "—" },
  ];
  const category = (opts.category ?? "").trim();
  if (category) details.push({ label: "Category", value: category });
  const trip = (opts.tripDisplay ?? "").trim();
  if (trip) details.push({ label: "Trip", value: trip });
  const route = (opts.route ?? "").trim();
  if (route) details.push({ label: "Route", value: route });
  details.push(
    { label: "Payment mode", value: (opts.paymentMode ?? "").trim() || "—" },
    { label: "Reference", value: (opts.reference ?? "").trim() || "—" },
  );
  return details;
}
