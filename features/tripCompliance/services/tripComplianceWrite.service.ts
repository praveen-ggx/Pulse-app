import { supabase } from "@/lib/supabase";
import { createLedgerEntry, updateLedgerEntry, type CreateLedgerEntryData } from "@/features/finance/services/finance.service";
import {
  buildLedgerSyncDescriptionLine,
  interpretLedgerRowStructured,
} from "@/features/finance/ledger/ledgerEntryModel";
import {
  isCashPaymentMode,
  normalizeComplianceRequestId,
  normalizeComplianceUtr,
  validateComplianceRequestId,
  validateComplianceUtr,
  withLedgerDescriptionRequestId,
  withLedgerDescriptionUtr,
} from "@/features/tripCompliance/utils/compliancePaymentReference.util";
import {
  normalizeComplianceTransactionDate,
  validateComplianceTransactionDate,
  withLedgerDescriptionTxnDateConfirmed,
} from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import { evaluateCompliancePaymentGuard, type ComplianceLedgerCategory } from "@/features/tripCompliance/utils/compliancePaymentGuard.util";
import { recordAdvanceDocumentCostSnapshot } from "@/features/debit-control/services/debitControlPod.service";
import { fetchComplianceTransactions } from "@/features/tripCompliance/services/tripComplianceRead.service";
import {
  COMPLIANCE_DECLINE_REASON_MAX,
  COMPLIANCE_DECLINE_REASON_MIN,
  complianceDeclineReasonLength,
  type ComplianceDocumentRow,
  type ComplianceDocumentStatus,
} from "@/features/tripCompliance/tripCompliance.types";

/**
 * Verify or reject a single trip document. Goes through the
 * `verify_trip_document` SECURITY DEFINER RPC (migration 20260915162440) —
 * NOT a raw `.update()` — so the `trip_compliance.documents.verify` grant is
 * enforced server-side, not just hidden in the UI. The RPC also writes the
 * `document_audit_log` row atomically with the status change.
 */
export async function setTripDocumentVerification(params: {
  document: Pick<ComplianceDocumentRow, "id" | "status">;
  organizationId: string;
  actorId: string;
  status: Extract<ComplianceDocumentStatus, "verified" | "rejected">;
  rejectionReason?: string | null;
}): Promise<{ error: Error | null }> {
  const { document, status, rejectionReason } = params;
  if (status === "rejected" && !rejectionReason?.trim()) {
    return { error: new Error("A rejection reason is required.") };
  }
  const { error } = await supabase().rpc("verify_trip_document", {
    p_document_id: document.id,
    p_status: status,
    p_rejection_reason: status === "rejected" ? rejectionReason!.trim() : null,
  });
  return { error: error ? new Error(error.message) : null };
}

/**
 * Mark a trip's compliance fully verified. Goes through
 * `mark_trip_compliance_verified`, which re-derives the required-documents
 * gate server-side (never trusts the client's own check) and enforces
 * `trip_compliance.trip.mark_verified`. Required types are LR, invoice, and
 * e-way bill — the same set as REQUIRED_COMPLIANCE_DOCUMENT_TYPES.
 */
export async function markTripComplianceVerified(params: {
  tripId: string;
  actorId: string;
}): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc("mark_trip_compliance_verified", {
    p_trip_id: params.tripId,
  });
  return { error: error ? new Error(error.message) : null };
}

/**
 * Approve a trip's compliance despite outstanding required documents. Goes
 * through `approve_trip_compliance_with_exception`, which re-derives the
 * missing/pending/rejected snapshot server-side, enforces the same
 * `trip_compliance.trip.mark_verified` grant as normal approval, requires a
 * non-empty comment, and is safe under retry (idempotent on
 * `trip_workflow_events`). Does not post any payment or touch the Finance
 * ledger — it only makes the trip eligible for the existing advance flow,
 * exactly like `markTripComplianceVerified` does.
 */
export async function approveComplianceWithException(params: {
  tripId: string;
  comment: string;
}): Promise<{ error: Error | null }> {
  if (!params.comment.trim()) {
    return { error: new Error("A comment is required to approve compliance with an exception.") };
  }
  const { error } = await supabase().rpc("approve_trip_compliance_with_exception", {
    p_trip_id: params.tripId,
    p_comment: params.comment.trim(),
  });
  return { error: error ? new Error(error.message) : null };
}

function formatDeclineComplianceError(error: { message?: string; code?: string }): string {
  const raw = (error.message ?? "").trim();
  const lower = raw.toLowerCase();
  if (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    lower.includes("could not find the function") ||
    (lower.includes("decline_trip_compliance") && lower.includes("does not exist"))
  ) {
    return "Decline isn't available yet — database update pending.";
  }
  if (lower.includes("not authorized")) {
    return "You don't have permission to decline compliance for this trip.";
  }
  if (lower.includes("already verified")) {
    return "This trip is already verified and can't be declined.";
  }
  if (lower.includes("decline reason")) {
    return `Please enter a reason between ${COMPLIANCE_DECLINE_REASON_MIN} and ${COMPLIANCE_DECLINE_REASON_MAX} characters.`;
  }
  return raw || "Couldn't decline compliance.";
}

/**
 * Decline a trip's compliance with a reason. Goes through the
 * `decline_trip_compliance` SECURITY DEFINER RPC (migration
 * 20270929162901), which enforces the `trip_compliance.trip.mark_verified`
 * grant, rejects already-verified trips, and audits to `trip_workflow_events`.
 * Pass `idempotencyKey` (stable per submit) so a retried submit is a no-op.
 * The trip stays in Compliance Pending. Throws a user-facing Error on failure.
 */
export async function declineTripCompliance(params: {
  tripId: string;
  reason: string;
  idempotencyKey?: string;
}): Promise<void> {
  const reason = params.reason.trim();
  const length = complianceDeclineReasonLength(reason);
  if (length < COMPLIANCE_DECLINE_REASON_MIN || length > COMPLIANCE_DECLINE_REASON_MAX) {
    throw new Error(
      `Please enter a reason between ${COMPLIANCE_DECLINE_REASON_MIN} and ${COMPLIANCE_DECLINE_REASON_MAX} characters.`,
    );
  }
  const { error } = await supabase().rpc("decline_trip_compliance", {
    p_trip_id: params.tripId,
    p_reason: reason,
    p_idempotency_key: params.idempotencyKey ?? undefined,
  });
  if (error) {
    throw new Error(formatDeclineComplianceError(error));
  }
}

function formatRejectComplianceError(error: { message?: string; code?: string } | null): string {
  const raw = (error?.message ?? "").trim();
  const lower = raw.toLowerCase();
  if (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    lower.includes("could not find the function") ||
    lower.includes("function does not exist")
  ) {
    return "Reject isn't available yet — database update pending.";
  }
  if (lower.includes("not authorized to reject")) {
    return "You don't have permission to reject compliance for this trip.";
  }
  if (lower.includes("not verified") || lower.includes("use decline instead")) {
    return "This trip isn't verified yet. Use Decline instead.";
  }
  if (lower.includes("reject reason between") || lower.includes("decline reason between")) {
    return `Please enter a reason between ${COMPLIANCE_DECLINE_REASON_MIN} and ${COMPLIANCE_DECLINE_REASON_MAX} characters.`;
  }
  if (lower.includes("compliance decline fields can only be changed")) {
    return raw;
  }
  return raw || "Couldn't reject compliance.";
}

/**
 * Reject a *verified* Compliance trip with a remark. Keeps
 * `compliance_verified_at` so the trip stays under Verified with a red
 * Rejected visual. Writes via `reject_trip_compliance` (migration
 * 20270930124500).
 */
export async function rejectTripCompliance(params: {
  tripId: string;
  reason: string;
  idempotencyKey?: string;
}): Promise<void> {
  const reason = params.reason.trim();
  const length = complianceDeclineReasonLength(reason);
  if (length < COMPLIANCE_DECLINE_REASON_MIN || length > COMPLIANCE_DECLINE_REASON_MAX) {
    throw new Error(
      `Please enter a reason between ${COMPLIANCE_DECLINE_REASON_MIN} and ${COMPLIANCE_DECLINE_REASON_MAX} characters.`,
    );
  }
  const { error } = await supabase().rpc("reject_trip_compliance", {
    p_trip_id: params.tripId,
    p_reason: reason,
    p_idempotency_key: params.idempotencyKey ?? undefined,
  });
  if (error) {
    throw new Error(formatRejectComplianceError(error));
  }
}

export type { ComplianceLedgerCategory } from "@/features/tripCompliance/utils/compliancePaymentGuard.util";
export { evaluateCompliancePaymentGuard } from "@/features/tripCompliance/utils/compliancePaymentGuard.util";

export async function checkCompliancePaymentAllowed(params: {
  tripId: string;
  category: ComplianceLedgerCategory;
}): Promise<{ ok: boolean; reason?: string }> {
  const byTrip = await fetchComplianceTransactions([params.tripId]);
  const bucket = byTrip.get(params.tripId) ?? { advance: [], balance: [] };
  return evaluateCompliancePaymentGuard(params.category, bucket);
}

/**
 * The only "expected amount" concept this schema actually has is the trip's
 * total `client_price` — there is no advance/balance split ratio anywhere to
 * validate against, so this is a sanity ceiling (catches a stray extra
 * digit), not a new precise business rule. Skipped when client_price isn't
 * set (0/null), matching how the rest of Compliance treats an unset price.
 */
export function validateCompliancePaymentAmount(params: {
  amount: number;
  trip: Pick<TripRow, "client_price">;
}): { ok: boolean; reason?: string } {
  const clientPrice = Number(params.trip.client_price ?? 0);
  if (clientPrice <= 0) return { ok: true };
  if (params.amount > clientPrice) {
    return {
      ok: false,
      reason: `Amount ₹${params.amount.toLocaleString("en-IN")} exceeds the trip value ₹${clientPrice.toLocaleString("en-IN")}.`,
    };
  }
  return { ok: true };
}

/**
 * `transactions.payment_reference` (migration 20260921105432) is the
 * authoritative "already processed" signal at the DB level — a unique index
 * on (trip_id, ledger_category) for compliance rows means a concurrent or
 * retried post fails with 23505, not a generic error. Not yet applied to any
 * live database (production is frozen) — this only changes how a 23505 is
 * *worded* if/when it occurs; it doesn't fabricate protection that isn't
 * really there in the DB.
 */
function isDuplicateComplianceLedgerWrite(error: Error): boolean {
  return (error as Error & { code?: string }).code === "23505";
}

/**
 * Migration 20260921125437 (Phase 6) is the real server-side boundary: two
 * RESTRICTIVE RLS policies on `transactions` reject a compliance_advance
 * insert/update unless `trips.compliance_verified_at IS NOT NULL`, and a
 * compliance_balance one unless `trips.pod_received_at IS NOT NULL` — closing
 * the P0 Phase 5 found (compliance/POD prerequisites were UI-only). A
 * rejected write surfaces as Postgres 42501 (insufficient_privilege).
 */
function isComplianceLedgerPrerequisiteRejection(error: Error): boolean {
  return (error as Error & { code?: string }).code === "42501";
}

/**
 * Client-side mirror of the RLS prerequisite (fail fast with a specific
 * message instead of a generic RLS error) — NOT the security boundary
 * itself, which is migration 20260921125437. Exception approval counts as
 * approved: compliance_verified_at is set by both mark_trip_compliance_verified()
 * and approve_trip_compliance_with_exception(), so checking it alone (not
 * compliance_decision) already means "approved OR approved_with_exception".
 */
function checkComplianceLedgerPrerequisite(
  category: ComplianceLedgerCategory,
  trip: Pick<TripRow, "compliance_verified_at" | "pod_received_at">,
): { ok: boolean; reason?: string } {
  if (category === "compliance_advance" && !trip.compliance_verified_at) {
    return { ok: false, reason: "Compliance must be approved before an advance payment can be posted." };
  }
  if (category === "compliance_balance" && !trip.pod_received_at) {
    return { ok: false, reason: "Hard-copy POD must be received before a balance payment can be posted." };
  }
  return { ok: true };
}

type ComplianceLedgerFlags = Pick<TripRow, "compliance_verified_at" | "pod_received_at">;

/**
 * Callers pass a cached trip (list summary, bulk validation map) that can be
 * minutes old, so the prerequisite reads the live flags. A failed read falls
 * back to the cached trip; RLS still rejects the insert either way.
 */
async function readComplianceLedgerFlags(trip: TripRow): Promise<ComplianceLedgerFlags> {
  const { data, error } = await supabase()
    .from("trips")
    .select("compliance_verified_at, pod_received_at")
    .eq("id", trip.id)
    .maybeSingle();
  if (error || !data) return trip;
  return data as ComplianceLedgerFlags;
}

/**
 * Post a compliance advance/balance payment through the canonical Finance
 * ledger write path (`createLedgerEntry` → `transactions`). This is the ONLY
 * write path — Compliance never inserts into `transactions` directly, and
 * never maintains its own amount/status copy (Phase 7/9/12's explicit rule).
 * Shared by both the single-payment and bulk-import flows.
 */
export async function postCompliancePayment(params: {
  organizationId: string;
  trip: TripRow;
  category: ComplianceLedgerCategory;
  amount: number;
  paymentModeId: string;
  paymentModeLabel: string;
  utr?: string | null;
  transactionDate?: string;
  notes?: string | null;
}): Promise<{ error: Error | null }> {
  const guard = await checkCompliancePaymentAllowed({ tripId: params.trip.id, category: params.category });
  if (!guard.ok) return { error: new Error(guard.reason) };

  const prerequisite = checkComplianceLedgerPrerequisite(params.category, await readComplianceLedgerFlags(params.trip));
  if (!prerequisite.ok) return { error: new Error(prerequisite.reason) };

  const amountCheck = validateCompliancePaymentAmount({ amount: params.amount, trip: params.trip });
  if (!amountCheck.ok) return { error: new Error(amountCheck.reason) };

  const description = buildLedgerSyncDescriptionLine({
    categoryOrKind: params.category === "compliance_advance" ? "Compliance Advance" : "Compliance Balance",
    paymentModeLabel: params.paymentModeLabel,
    paymentModeId: params.paymentModeId,
    paymentReference: params.utr,
    notes: params.notes,
  });

  const entry: CreateLedgerEntryData = {
    trip_id: params.trip.id,
    trip_number: params.trip.booking_ref ?? null,
    party_name: params.trip.client_name || "Client",
    description,
    amount_in: params.amount,
    amount_out: 0,
    transaction_date: params.transactionDate,
    contact_id: params.trip.client_id,
    contact_type: params.trip.client_id ? "client" : null,
    ledger_category: params.category,
    ledger_entity_type: "client",
    ledger_flow_type: "receivable",
    payment_reference: params.utr?.trim() || null,
  };

  const { error } = await createLedgerEntry(params.organizationId, entry);
  if (error && isDuplicateComplianceLedgerWrite(error)) {
    return {
      error: new Error(
        `This ${params.category === "compliance_advance" ? "advance" : "balance"} payment has already been posted for this trip. Refresh to see the existing entry.`,
      ),
    };
  }
  if (error && isComplianceLedgerPrerequisiteRejection(error)) {
    // Reached only if server-side trip state disagreed with the client-side
    // pre-check above (e.g. stale cached trip data) — the RLS policy is the
    // real boundary here, this is just a clearer message than a raw 42501.
    return {
      error: new Error(
        params.category === "compliance_advance"
          ? "Compliance must be approved before an advance payment can be posted. Refresh and try again."
          : "Hard-copy POD must be received before a balance payment can be posted. Refresh and try again.",
      ),
    };
  }
  if (!error && params.category === "compliance_advance") {
    try {
      await recordAdvanceDocumentCostSnapshot(params.trip.id, {
        organizationId: params.trip.organization_id || params.organizationId,
        supplierRate: params.trip.supplier_rate,
        supplierRateBasis:
          (params.trip as { supplier_rate_basis?: string | null }).supplier_rate_basis ?? null,
        loadTons: params.trip.load_tons ?? null,
      });
    } catch {
      // The ledger row is already posted. POD validation still resolves the slab.
    }
  }
  return { error };
}

type CompliancePaymentRowTarget = {
  tripId: string;
  transactionId: string;
  /** `finance_receipt` = a client receipt posted in Finance (feeds `trips.amount_paid`). */
  category: ComplianceLedgerCategory | "finance_receipt";
};

/**
 * Reads the payment row and confirms it is this trip's advance / receipt. Not
 * org-filtered: receipts on a shared trip may belong to the partner org; the
 * trip match plus RLS decide what this user may edit.
 */
async function readCompliancePaymentRow(
  target: CompliancePaymentRowTarget,
): Promise<{ row: { description: string | null } | null; error: Error | null }> {
  const notFound = { row: null, error: new Error("Payment not found. Refresh and try again.") };
  if (target.transactionId.startsWith("amount-paid:")) return notFound;
  const { data: row, error } = await supabase()
    .from("transactions")
    .select("id, trip_id, description, ledger_category, amount_in")
    .eq("id", target.transactionId)
    .maybeSingle();
  if (error) return { row: null, error: new Error(error.message) };
  const isComplianceRow =
    row?.ledger_category === "compliance_advance" || row?.ledger_category === "compliance_balance";
  const matches =
    row != null &&
    row.trip_id === target.tripId &&
    (target.category === "finance_receipt"
      ? !isComplianceRow && Number(row.amount_in ?? 0) > 0
      : row.ledger_category === target.category);
  return matches ? { row, error: null } : notFound;
}

async function writeCompliancePaymentRow(
  transactionId: string,
  payload: Record<string, unknown>,
  fallbackPayload?: Record<string, unknown>,
): Promise<{ error: Error | null }> {
  const update = (body: Record<string, unknown>) =>
    supabase().from("transactions").update(body).eq("id", transactionId).select("id").maybeSingle();
  let { data, error } = await update(payload);
  if (error && fallbackPayload && /payment_reference/i.test(error.message)) {
    ({ data, error } = await update(fallbackPayload));
  }
  if (error) return { error: new Error(error.message) };
  if (!data) return { error: new Error("You don't have permission to edit this payment.") };
  return { error: null };
}

/** Edit only the transaction date (Paid at / Txn Date) of a posted payment. */
export async function updateCompliancePaymentTransactionDate(
  params: CompliancePaymentRowTarget & { transactionDate: string },
): Promise<{ error: Error | null }> {
  const normalized = normalizeComplianceTransactionDate(params.transactionDate);
  const invalid = validateComplianceTransactionDate(normalized);
  if (invalid) return { error: new Error(invalid) };
  const { row, error } = await readCompliancePaymentRow(params);
  if (!row) return { error };
  return writeCompliancePaymentRow(params.transactionId, {
    transaction_date: normalized,
    description: withLedgerDescriptionTxnDateConfirmed(row.description),
  });
}

/**
 * Edit only the UTR of a posted compliance payment. Amount, mode, date, party and
 * notes are left untouched, so the ledger's double entry does not change.
 * `updateLedgerEntry` is not used because it truncates `transaction_date` to a
 * day (moving "Paid at") and rebuilds the description without notes.
 */
export async function updateCompliancePaymentReference(
  params: CompliancePaymentRowTarget & { utr: string },
): Promise<{ error: Error | null }> {
  const invalid = validateComplianceUtr(params.utr);
  if (invalid) return { error: new Error(invalid) };
  const utr = normalizeComplianceUtr(params.utr);
  const { row, error } = await readCompliancePaymentRow(params);
  if (!row) return { error };
  const mode = interpretLedgerRowStructured({ description: row.description }).payment_mode;
  if (isCashPaymentMode(mode)) {
    return { error: new Error("Cash payments don't carry a UTR.") };
  }
  const description = withLedgerDescriptionUtr(row.description, utr);
  return writeCompliancePaymentRow(params.transactionId, { description, payment_reference: utr }, { description });
}

/**
 * Remove this trip's Compliance advance so it returns to Verified and can be
 * posted again. Only `compliance_advance` ledger rows are deleted — Finance
 * receipts and a posted balance are left untouched.
 */
export async function withdrawComplianceAdvancePayment(params: {
  tripId: string;
  transactionId?: string | null;
}): Promise<{ error: Error | null }> {
  const tripId = params.tripId.trim();
  const requestedId = (params.transactionId ?? "").trim();
  if (requestedId.startsWith("amount-paid:")) {
    return { error: new Error("This advance was posted in Finance. It can't be sent back from Compliance.") };
  }

  const byTrip = await fetchComplianceTransactions([tripId]);
  const bucket = byTrip.get(tripId) ?? { advance: [], balance: [] };
  if (bucket.balance.length > 0) {
    return { error: new Error("This trip already has a balance payment, so it can't go back to Verified.") };
  }
  if (bucket.advance.length === 0) {
    return { error: new Error("No advance payment to send back. Refresh and try again.") };
  }
  const row =
    (requestedId ? bucket.advance.find((item) => item.id === requestedId) : null) ??
    (requestedId ? null : bucket.advance[0]);
  if (!row) {
    return { error: new Error("Payment not found. Refresh and try again.") };
  }

  const { data, error } = await supabase()
    .from("transactions")
    .delete()
    .eq("id", row.id)
    .eq("trip_id", tripId)
    .eq("ledger_category", "compliance_advance")
    .select("id")
    .maybeSingle();
  if (error) return { error: new Error(error.message) };
  if (!data) {
    return { error: new Error("You don't have permission to send this trip back to Verified.") };
  }
  return { error: null };
}

/** Edit only the Request ID of a posted compliance payment (stored on its description). */
export async function updateCompliancePaymentRequestId(
  params: CompliancePaymentRowTarget & { requestId: string },
): Promise<{ error: Error | null }> {
  const invalid = validateComplianceRequestId(params.requestId);
  if (invalid) return { error: new Error(invalid) };
  const requestId = normalizeComplianceRequestId(params.requestId);
  const { row, error } = await readCompliancePaymentRow(params);
  if (!row) return { error };
  return writeCompliancePaymentRow(params.transactionId, {
    description: withLedgerDescriptionRequestId(row.description, requestId),
  });
}

/**
 * Update an already-posted compliance payment's UTR (or amount/mode) through
 * the canonical `updateLedgerEntry()` — never a direct `transactions` write.
 * Rebuilds the description with the existing encoding convention so
 * `interpretLedgerRowStructured()` keeps reading it back correctly.
 */
export async function updateCompliancePaymentUtr(params: {
  organizationId: string;
  transactionId: string;
  trip: TripRow;
  category: ComplianceLedgerCategory;
  paymentModeId: string;
  paymentModeLabel: string;
  utr?: string | null;
  amount: number;
}): Promise<{ error: Error | null }> {
  const description = buildLedgerSyncDescriptionLine({
    categoryOrKind: params.category === "compliance_advance" ? "Compliance Advance" : "Compliance Balance",
    paymentModeLabel: params.paymentModeLabel,
    paymentModeId: params.paymentModeId,
    paymentReference: params.utr,
  });
  const { error } = await updateLedgerEntry(params.organizationId, params.transactionId, {
    trip_id: params.trip.id,
    party_name: params.trip.client_name || "Client",
    description,
    amount_in: params.amount,
    amount_out: 0,
    contact_id: params.trip.client_id,
    contact_type: params.trip.client_id ? "client" : null,
    ledger_category: params.category,
    ledger_entity_type: "client",
    ledger_flow_type: "receivable",
    payment_reference: params.utr?.trim() || null,
  });
  return { error };
}
