import { supabase } from "@/lib/supabase";
import { PAYMENT_MODES } from "@/lib/paymentModes";
import {
  parseBulkCsv,
  suggestMapping,
  type BulkField,
} from "@/features/bulkOperations/utils/bulkOperation.engine.util";
import type { ColumnMapping } from "@/features/bulkOperations/utils/bulkOperation.model";
import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  fetchComplianceTransactions,
  fetchTripDocumentsForTrips,
} from "@/features/tripCompliance/services/tripComplianceRead.service";
import { evaluateCompliancePaymentGuard } from "@/features/tripCompliance/utils/compliancePaymentGuard.util";
import {
  summarizeRequiredTripDocuments,
  type RequiredTripDocumentSummary,
} from "@/features/tripCompliance/utils/complianceReadiness.util";
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
const TRIP_CODE_COLUMNS = ["trip_number", "trip_code", "trip_operational_code", "display_trip_id", "booking_ref"] as const;
const TRIP_LOOKUP_COLUMNS = "id, organization_id, trip_number, trip_code, trip_operational_code, display_trip_id, booking_ref, client_price, compliance_verified_at, finance_verified_at, pod_received_at";
const TRIP_LOOKUP_CHUNK = 80;

function isTripUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function tripMatchKeys(trip: TripRow): string[] {
  const record = trip as TripRow & Record<string, unknown>;
  return [record.id, record.trip_operational_code, record.trip_code, record.display_trip_id, record.trip_number, record.booking_ref]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

async function readTripsForPost(
  organizationId: string,
  column: "id" | (typeof TRIP_CODE_COLUMNS)[number],
  values: string[],
): Promise<TripRow[]> {
  const hits: TripRow[] = [];
  for (let index = 0; index < values.length; index += TRIP_LOOKUP_CHUNK) {
    const chunk = values.slice(index, index + TRIP_LOOKUP_CHUNK);
    const { data, error } = await supabase()
      .from("trips")
      .select(TRIP_LOOKUP_COLUMNS)
      .eq("organization_id", organizationId)
      .in(column, chunk);
    if (error) throw new Error(explainBulkPaymentReadError(error.message ?? "Couldn't read trips."));
    hits.push(...((data ?? []) as TripRow[]));
  }
  return hits;
}

/** Post sheet columns. Order in the file does not matter once the header matches. */
export const POST_PAYMENT_FIELDS: BulkField[] = [
  { key: "tripId", label: "Trip ID", required: true, aliases: ["trip id", "trip", "trip no"], example: "TRP-1001", format: "Trip code from the export, or the internal id", editable: false },
  { key: "amount", label: "Amount", required: true, aliases: ["amount", "paid amount", "value"], example: "9000", format: "Paid value, up to 2 decimals", editable: false },
  { key: "mode", label: "Mode", required: true, aliases: ["mode", "payment mode"], example: "UPI", format: "UPI, BANK, CASH, CHEQUE, FUEL_CARD, FASTAG or CREDIT", editable: false },
  { key: "date", label: "Date", required: false, aliases: ["date", "transaction date", "txn date", "paid at"], example: "2026-09-08", format: "YYYY-MM-DD", editable: false },
  { key: "utr", label: "UTR", required: false, aliases: ["utr", "reference", "payment reference"], example: "HDFC123456", format: "Bank reference", editable: false },
  { key: "remarks", label: "Remarks", required: false, aliases: ["remarks", "notes", "note"], example: "Loading advance", format: "Optional note", editable: false },
];

const MODE_ALIASES: Record<string, string> = {
  BANK_TRANSFER: "BANK",
  CHECK: "CHEQUE",
  FUELCARD: "FUEL_CARD",
  FAS_TAG: "FASTAG",
};

/** Canonical mode id. Unknown text is returned unchanged so validation can name it. */
export function canonicalPaymentModeId(raw: string): string {
  const key = raw.trim().toUpperCase().replace(/[^A-Z]+/g, "_").replace(/^_|_$/g, "");
  const id = MODE_ALIASES[key] ?? key;
  return VALID_MODE_IDS.has(id as (typeof PAYMENT_MODES)[number]["id"]) ? id : raw.trim().toUpperCase();
}

export function readCompliancePostSheet(csvText: string): { headers: string[]; rows: string[][]; rowIndexes: number[] } {
  const indexed = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), rowIndex: index + 1 }))
    .filter((item) => item.line.length > 0 && !item.line.startsWith("#"));
  if (indexed.length === 0) return { headers: [], rows: [], rowIndexes: [] };
  const sheet = parseBulkCsv(indexed.map((item) => item.line).join("\n"));
  return { headers: sheet.headers, rows: sheet.rows, rowIndexes: indexed.slice(1).map((item) => item.rowIndex) };
}

export function compliancePostRowsFromSheet(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping,
  rowIndexes?: number[],
): ComplianceBulkPaymentRow[] {
  const indexOf = new Map(headers.map((header, index) => [header, index]));
  const pick = (cells: string[], key: string) => {
    const header = mapping[key];
    const index = header ? indexOf.get(header) : undefined;
    return index == null ? "" : (cells[index] ?? "").trim();
  };
  return rows.map((cells, index) => {
    const amountText = pick(cells, "amount").replace(/[₹,\s]/g, "");
    const date = pick(cells, "date");
    const utr = pick(cells, "utr");
    const remarks = pick(cells, "remarks");
    return {
      rowIndex: rowIndexes?.[index] ?? index + 2,
      tripId: pick(cells, "tripId"),
      amount: amountText === "" ? Number.NaN : Number(amountText),
      paymentModeId: canonicalPaymentModeId(pick(cells, "mode")),
      date: date || undefined,
      utr: utr || undefined,
      remarks: remarks || undefined,
    };
  });
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

/** Parse a payment CSV. Headers can be in any order. Lines that start with # are notes. */
export function parseComplianceBulkPaymentCsv(csvText: string): ComplianceBulkPaymentRow[] {
  const sheet = readCompliancePostSheet(csvText);
  if (sheet.headers.length === 0 || sheet.rows.length === 0) return [];
  const mapping = suggestMapping(sheet.headers, POST_PAYMENT_FIELDS);
  const positional = !mapping.tripId;
  const used: ColumnMapping = positional
    ? {
        tripId: sheet.headers[0] ?? null,
        amount: sheet.headers[1] ?? null,
        mode: sheet.headers[2] ?? null,
        date: sheet.headers[3] ?? null,
        utr: sheet.headers[4] ?? null,
        remarks: sheet.headers[5] ?? null,
      }
    : mapping;
  return compliancePostRowsFromSheet(sheet.headers, sheet.rows, used, sheet.rowIndexes);
}

export function explainBulkPaymentReadError(message: string): string {
  if (/invalid input syntax for type uuid/i.test(message)) {
    return "A Trip ID in this file is not an id from this workspace. Use the trip id, and leave out notes that start with #.";
  }
  if (/ServiceUnavailableError|Service Unavailable 503/i.test(message)) {
    return "The workspace is busy. Wait a moment and validate the rows again.";
  }
  return message;
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
  const tripKeys = [...new Set(rows.map((row) => row.tripId.trim()).filter(Boolean))];
  const hits: TripRow[] = [];
  const seenTripIds = new Set<string>();
  const matchedKeys = new Set<string>();
  const remember = (trip: TripRow) => {
    if (!trip.id || seenTripIds.has(trip.id)) return;
    seenTripIds.add(trip.id);
    hits.push(trip);
    for (const key of tripMatchKeys(trip)) matchedKeys.add(key.toUpperCase());
  };
  const uuids = tripKeys.filter(isTripUuid);
  if (uuids.length > 0) {
    for (const trip of await readTripsForPost(organizationId, "id", uuids)) remember(trip);
  }
  const codes = tripKeys.filter((key) => !isTripUuid(key));
  for (const column of TRIP_CODE_COLUMNS) {
    const remaining = codes.filter((key) => !matchedKeys.has(key.toUpperCase()));
    if (remaining.length === 0) break;
    for (const trip of await readTripsForPost(organizationId, column, remaining)) remember(trip);
  }
  const tripsById = new Map<string, TripRow>();
  const matchesByKey = new Map<string, TripRow[]>();
  for (const trip of hits) {
    if (!trip.id || tripsById.has(trip.id)) continue;
    tripsById.set(trip.id, trip);
    for (const key of tripMatchKeys(trip)) {
      const norm = key.toUpperCase();
      const list = matchesByKey.get(norm) ?? [];
      if (!list.some((item) => item.id === trip.id)) list.push(trip);
      matchesByKey.set(norm, list);
    }
  }
  const resolvedTripId = new Map<string, string>();
  for (const key of tripKeys) {
    const matches = matchesByKey.get(key.toUpperCase()) ?? [];
    if (matches.length === 1) {
      resolvedTripId.set(key, matches[0].id);
      tripsById.set(key, matches[0]);
    }
  }
  const tripIds = [...new Set([...resolvedTripId.values()])];

  const existingTxns = tripIds.length === 0
    ? []
    : await supabase()
      .from("transactions")
      .select("trip_id, description, payment_reference, ledger_category")
      .in("trip_id", tripIds)
      .eq("ledger_category", params.category)
      .then((result) => {
        if (result.error) throw new Error(explainBulkPaymentReadError(result.error.message ?? "Couldn't read posted payments."));
        return result.data ?? [];
      });
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
    const pastedKey = row.tripId.trim();
    const realTripId = resolvedTripId.get(pastedKey);
    const matchCount = matchesByKey.get(pastedKey.toUpperCase())?.length ?? 0;
    if (!pastedKey) errors.push("Missing Trip ID");
    else if (matchCount > 1) errors.push("More than one trip matches this Trip ID.");
    const trip = realTripId ? tripsById.get(realTripId) : undefined;
    if (pastedKey && matchCount <= 1 && !trip) errors.push("Trip ID not found in this organization");
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
      const existing = realTripId ? existingUtrsByTrip.get(realTripId) : undefined;
      const batchSeen = realTripId ? seenInBatch.get(realTripId) : undefined;
      if (existing?.has(utrUpper) || batchSeen?.has(utrUpper)) {
        errors.push(`Duplicate UTR "${row.utr}" for this trip`);
      }
    }

    if (errors.length > 0) {
      invalid.push({ row, errors });
      continue;
    }
    if (row.paymentModeId !== "CASH" && row.utr) {
      const set = seenInBatch.get(realTripId ?? pastedKey) ?? new Set<string>();
      set.add(row.utr.toUpperCase());
      seenInBatch.set(realTripId ?? pastedKey, set);
    }
    valid.push({ row, errors: [] });
  }

  const buckets = await fetchComplianceTransactions(tripIds);
  // Same paged reader as the Compliance list, so both judge documents identically.
  const documentsByTrip = await fetchTripDocumentsForTrips(tripIds);
  const eligible: ComplianceBulkRowValidation[] = [];
  const blocked: ComplianceBulkRowValidation[] = [];
  const alreadyPaid: ComplianceBulkRowValidation[] = [];
  for (const item of valid) {
    const realTripId = resolvedTripId.get(item.row.tripId.trim());
    const bucket = (realTripId ? buckets.get(realTripId) : undefined) ?? { advance: [], balance: [] };
    const trip = realTripId ? tripsById.get(realTripId) : undefined;
    const gate = evaluateCompliancePaymentGuard(params.category, bucket, {
      podReceived: Boolean(trip?.pod_received_at),
    });
    if (!gate.ok) {
      const gated = { ...item, gateReason: gate.reason };
      if (gate.kind === "already_paid") alreadyPaid.push(gated);
      else blocked.push(gated);
      continue;
    }
    const required = summarizeRequiredTripDocuments(documentsByTrip.get(realTripId ?? "") ?? []);
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
