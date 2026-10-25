import { supabase } from "@/lib/supabase";
import { PAYMENT_MODES } from "@/lib/paymentModes";
import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";
import type { TripRow } from "@/features/trips/services/trips.service";
import { fetchComplianceTransactions } from "@/features/tripCompliance/services/tripComplianceRead.service";
import { evaluateCompliancePaymentGuard } from "@/features/tripCompliance/utils/compliancePaymentGuard.util";
import {
  summarizeRequiredTripDocuments,
  type RequiredTripDocumentSummary,
} from "@/features/tripCompliance/utils/complianceReadiness.util";
import type { ComplianceDocumentRow } from "@/features/tripCompliance/tripCompliance.types";
import {
  postCompliancePayment,
  validateCompliancePaymentAmount,
  type ComplianceLedgerCategory,
} from "@/features/tripCompliance/services/tripComplianceWrite.service";

/**
 * Minimum bulk-import fields per the spec: Trip ID, Amount, Mode, Date, UTR,
 * Remarks. No dedicated CSV import schema exists elsewhere in Finance to
 * prefer instead (confirmed absent in the Phase 0 audit) — this is net-new,
 * but every accepted row still posts through `postCompliancePayment` →
 * `createLedgerEntry`, never a direct table insert.
 */
export type ComplianceBulkPaymentRow = {
  rowIndex: number;
  tripId: string;
  amount: number;
  paymentModeId: string;
  date?: string;
  utr?: string;
  remarks?: string;
};

export type ComplianceBulkRowValidation = {
  row: ComplianceBulkPaymentRow;
  errors: string[];
  gateReason?: string;
};

export type ComplianceBulkValidationResult = {
  valid: ComplianceBulkRowValidation[];
  invalid: ComplianceBulkRowValidation[];
  blocked: ComplianceBulkRowValidation[];
  alreadyPaid: ComplianceBulkRowValidation[];
  eligibleTotal: number;
};

const VALID_MODE_IDS = new Set(PAYMENT_MODES.map((m) => m.id));

async function fetchBulkTripDocuments(tripIds: string[]): Promise<Map<string, ComplianceDocumentRow[]>> {
  const byTrip = new Map<string, ComplianceDocumentRow[]>();
  if (tripIds.length === 0) return byTrip;
  const { data, error } = await supabase()
    .from("trip_documents")
    .select("id, trip_id, document_type, file_name, storage_path, uploaded_at, status, verified_by, verified_at, rejection_reason")
    .in("trip_id", tripIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as ComplianceDocumentRow[]) {
    const list = byTrip.get(row.trip_id) ?? [];
    list.push(row);
    byTrip.set(row.trip_id, list);
  }
  return byTrip;
}

function bulkRequirementBlockReason(
  category: ComplianceLedgerCategory,
  trip: TripRow | undefined,
  required: RequiredTripDocumentSummary,
): string | null {
  if (category === "compliance_advance" && !trip?.compliance_verified_at) {
    if (required.missingLabels[0]) return `${required.missingLabels[0]} missing`;
    if (required.rejectedLabels[0]) return `Rejected — ${required.rejectedLabels[0]}`;
    if (required.pendingLabels[0]) return `${required.pendingLabels[0]} pending verification`;
    return "Compliance verification not completed";
  }
  if (category === "compliance_advance" && !trip?.finance_verified_at) {
    return "Advance not approved yet";
  }
  if (category === "compliance_balance" && !trip?.pod_received_at) {
    return "Hard-copy POD has not been marked received.";
  }
  return null;
}

/** Parse a minimal CSV (Trip ID,Amount,Mode,Date,UTR,Remarks) with a header row. */
export function parseComplianceBulkPaymentCsv(csvText: string): ComplianceBulkPaymentRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map((c) => c.trim());
    return {
      rowIndex: i + 2, // 1-indexed + header row
      tripId: cols[0] ?? "",
      amount: Number(cols[1] ?? ""),
      paymentModeId: (cols[2] ?? "").toUpperCase(),
      date: cols[3] || undefined,
      utr: cols[4] || undefined,
      remarks: cols[5] || undefined,
    };
  });
}

/**
 * Validate rows against real Trip IDs scoped to the org (one batched query,
 * not one lookup per row) plus duplicate-UTR detection against both the
 * batch itself and already-posted compliance transactions for those trips.
 * Never partially processes silently — returns a full valid/invalid split
 * for the caller to show counts + [View Errors] / [Process N Payments].
 */
export async function validateComplianceBulkPayments(params: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  rows: ComplianceBulkPaymentRow[];
}): Promise<ComplianceBulkValidationResult & { tripsById: Map<string, TripRow> }> {
  const { organizationId, rows } = params;
  const tripIds = [...new Set(rows.map((r) => r.tripId).filter(Boolean))];

  const { data: tripRows, error: tripsErr } = await supabase()
    .from("trips")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", tripIds);
  if (tripsErr) throw new Error(tripsErr.message);
  const tripsById = new Map<string, TripRow>((tripRows ?? []).map((t) => [t.id as string, t as TripRow]));

  const { data: existingTxns, error: txnErr } = await supabase()
    .from("transactions")
    .select("trip_id, description, payment_reference, ledger_category")
    .in("trip_id", tripIds)
    .eq("ledger_category", params.category);
  if (txnErr) throw new Error(txnErr.message);
  const existingUtrsByTrip = new Map<string, Set<string>>();
  for (const t of existingTxns ?? []) {
    // Structured column (migration 20260921105432) is authoritative; older
    // rows written before it existed fall back to the text-parsed value —
    // see Phase 3 Section 4 on why description alone isn't trusted going forward.
    const utr =
      (t as { payment_reference?: string | null }).payment_reference ??
      interpretLedgerRowStructured(t as { description?: string | null }).reference_number;
    if (!utr) continue;
    const set = existingUtrsByTrip.get(t.trip_id as string) ?? new Set<string>();
    set.add(utr.toUpperCase());
    existingUtrsByTrip.set(t.trip_id as string, set);
  }

  const seenInBatch = new Map<string, Set<string>>(); // tripId -> utrs already claimed by an earlier valid row in this batch

  const valid: ComplianceBulkRowValidation[] = [];
  const invalid: ComplianceBulkRowValidation[] = [];

  for (const row of rows) {
    const errors: string[] = [];
    if (!row.tripId) errors.push("Missing Trip ID");
    const trip = tripsById.get(row.tripId);
    if (row.tripId && !trip) errors.push("Trip ID not found in this organization");
    if (!Number.isFinite(row.amount) || row.amount <= 0) errors.push("Invalid amount");
    else if (trip) {
      const amountCheck = validateCompliancePaymentAmount({ amount: row.amount, trip });
      if (!amountCheck.ok) errors.push(amountCheck.reason ?? "Amount mismatch");
    }
    if (!VALID_MODE_IDS.has(row.paymentModeId as (typeof PAYMENT_MODES)[number]["id"])) {
      errors.push(`Invalid payment mode "${row.paymentModeId}"`);
    }
    if (row.paymentModeId !== "CASH" && row.utr) {
      const utrUpper = row.utr.toUpperCase();
      const existing = existingUtrsByTrip.get(row.tripId);
      const batchSeen = seenInBatch.get(row.tripId);
      if (existing?.has(utrUpper) || batchSeen?.has(utrUpper)) {
        errors.push(`Duplicate UTR "${row.utr}" for this trip`);
      }
    }

    if (errors.length > 0) {
      invalid.push({ row, errors });
      continue;
    }
    if (row.paymentModeId !== "CASH" && row.utr) {
      const set = seenInBatch.get(row.tripId) ?? new Set<string>();
      set.add(row.utr.toUpperCase());
      seenInBatch.set(row.tripId, set);
    }
    valid.push({ row, errors: [] });
  }

  const buckets = await fetchComplianceTransactions(tripIds);
  const documentsByTrip = await fetchBulkTripDocuments(tripIds);
  const eligible: ComplianceBulkRowValidation[] = [];
  const blocked: ComplianceBulkRowValidation[] = [];
  const alreadyPaid: ComplianceBulkRowValidation[] = [];
  for (const item of valid) {
    const bucket = buckets.get(item.row.tripId) ?? { advance: [], balance: [] };
    const trip = tripsById.get(item.row.tripId);
    const gate = evaluateCompliancePaymentGuard(params.category, bucket, {
      podReceived: Boolean(trip?.pod_received_at),
    });
    if (!gate.ok) {
      const gated = { ...item, gateReason: gate.reason };
      if (gate.kind === "already_paid") alreadyPaid.push(gated);
      else blocked.push(gated);
      continue;
    }
    const required = summarizeRequiredTripDocuments(documentsByTrip.get(item.row.tripId) ?? []);
    const requirementReason = bulkRequirementBlockReason(params.category, trip, required);
    if (requirementReason) {
      blocked.push({ ...item, gateReason: requirementReason });
      continue;
    }
    eligible.push(item);
  }

  const eligibleTotal = eligible.reduce((sum, item) => sum + item.row.amount, 0);
  return { valid: eligible, invalid, blocked, alreadyPaid, eligibleTotal, tripsById };
}

/**
 * Process only the pre-validated rows the caller confirmed. Each row is an
 * independent canonical ledger write — one row's failure doesn't roll back
 * the others (matches how the existing single-payment flow already behaves),
 * but every outcome is reported back so nothing is silently dropped.
 */
export async function processComplianceBulkPayments(params: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  rows: ComplianceBulkRowValidation[];
  tripsById: Map<string, TripRow>;
}): Promise<{ rowIndex: number; error: Error | null }[]> {
  const results: { rowIndex: number; error: Error | null }[] = [];
  for (const { row } of params.rows) {
    const trip = params.tripsById.get(row.tripId);
    if (!trip) {
      results.push({ rowIndex: row.rowIndex, error: new Error("Trip not found") });
      continue;
    }
    const mode = PAYMENT_MODES.find((m) => m.id === row.paymentModeId);
    const { error } = await postCompliancePayment({
      organizationId: params.organizationId,
      trip,
      category: params.category,
      amount: row.amount,
      paymentModeId: row.paymentModeId,
      paymentModeLabel: mode?.name ?? row.paymentModeId,
      utr: row.utr,
      transactionDate: row.date,
      notes: row.remarks,
    });
    results.push({ rowIndex: row.rowIndex, error });
  }
  return results;
}
