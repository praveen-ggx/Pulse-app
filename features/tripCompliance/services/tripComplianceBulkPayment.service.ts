import { readByIdChunks } from "@/lib/pagination";
import { supabase } from "@/lib/supabase";
import { PAYMENT_MODES } from "@/lib/paymentModes";
import {
  parseBulkCsv,
  suggestMapping,
} from "@/features/bulkOperations/utils/bulkOperation.engine.util";
import type { BulkField, ColumnMapping } from "@/features/bulkOperations/utils/bulkOperation.model";
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
  approveComplianceWithException,
  markTripFinanceVerified,
  postCompliancePayment,
  unmarkTripFinanceVerified,
  validateCompliancePaymentAmount,
  type ComplianceLedgerCategory,
} from "@/features/tripCompliance/services/tripComplianceWrite.service";
import { quoteAdvancePayablesForTrips } from "@/features/tripCompliance/services/complianceAdvanceFinanceBreakdown.service";
import { tripIdsByLrNumber } from "@/features/tripCompliance/services/complianceBulkUpdate.service";
import { markTripHardCopyPodReceived } from "@/features/trips/services/tripDocumentLrPod.service";
import {
  advancePostAmount,
  canonicalSupplierRateBasis,
  COMPLIANCE_DEFAULT_ADVANCE_PERCENT,
} from "@/features/tripCompliance/utils/compliancePaymentAmount.util";
import { parseBulkPaymentDate } from "@/features/tripCompliance/utils/complianceBulkUpdate.util";
import { toComplianceTransactionDateInput } from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import { normalizeOrgLrNumber } from "@/features/trips/services/orgLrNumber.util";

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
  /** LR number used when Trip ID is blank, and checked against the trip when both are present. */
  lrNumber?: string;
  /** Null when the file left Amount blank. Validation fills it from the approved advance. */
  amount: number | null;
  paymentModeId: string;
  date?: string;
  utr?: string;
  remarks?: string;
  /** Percent that makes the approved advance equal `amount`. Set when the file amount differs from the current advance. */
  advancePercent?: number;
};

export type ComplianceBulkRowValidation = {
  row: ComplianceBulkPaymentRow;
  errors: string[];
  gateReason?: string;
  /** Calculated advance. An alert still leaves the row eligible. */
  notice?: string;
  noticeTone?: "preview" | "alert";
  /** Compliance, documents, or advance still open. Approval can clear the ones that are allowed. */
  alerts?: BulkHoldAlert[];
  /** Latest posted payment when this row would be a second transaction. */
  existingPayment?: ExistingCompliancePayment;
};

export type ExistingCompliancePayment = {
  date: string;
  amount: number;
  count: number;
};

/** Latest posted advance or balance. A second payment is a separate confirmation, not the default. */
export function existingCompliancePayment(
  rows: Array<{ transaction_date?: string | null; amount_out?: number | null; created_at?: string | null }>,
): ExistingCompliancePayment | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const left = String(b.transaction_date ?? b.created_at ?? "");
    const right = String(a.transaction_date ?? a.created_at ?? "");
    return left.localeCompare(right);
  });
  const latest = sorted[0];
  const amount = Number(latest?.amount_out ?? 0);
  return {
    date: toComplianceTransactionDateInput(latest?.transaction_date ?? latest?.created_at) || "",
    amount: Number.isFinite(amount) ? amount : 0,
    count: rows.length,
  };
}

export type ComplianceBulkValidationResult = {
  valid: ComplianceBulkRowValidation[];
  invalid: ComplianceBulkRowValidation[];
  blocked: ComplianceBulkRowValidation[];
  alreadyPaid: ComplianceBulkRowValidation[];
  eligibleTotal: number;
};

const VALID_MODE_IDS = new Set(PAYMENT_MODES.map((m) => m.id));
const TRIP_CODE_COLUMNS = ["trip_number", "trip_code", "trip_operational_code", "display_trip_id", "booking_ref"] as const;
const TRIP_LOOKUP_COLUMNS = "id, organization_id, trip_number, trip_code, trip_operational_code, display_trip_id, booking_ref, client_price, supplier_id, client_id, client_name, compliance_verified_at, finance_verified_at, pod_received_at";
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
      .is("deleted_at", null)
      .in(column, chunk);
    if (error) throw new Error(explainBulkPaymentReadError(error.message ?? "Couldn't read trips."));
    hits.push(...((data ?? []) as TripRow[]));
  }
  return hits;
}

/** Post sheet columns. Order in the file does not matter once the header matches. */
export const POST_PAYMENT_FIELDS: BulkField[] = [
  { key: "tripId", label: "Trip ID", required: false, aliases: ["trip id", "trip", "trip no"], example: "TRP-1001", format: "Trip code from the export, or the internal id. Trip ID or LR number is required.", editable: false },
  { key: "lrNumber", label: "LR number", required: false, aliases: ["lr", "lr no", "lr number", "lrn", "lorry receipt"], example: "LR-1001", format: "LR on the trip. Use this when Trip ID is blank.", editable: false },
  { key: "amount", label: "Amount", required: false, aliases: ["amount", "paid amount", "value"], example: "9000", format: "Posted as entered. A different current advance updates the percent, not this amount.", editable: false },
  { key: "mode", label: "Mode", required: false, aliases: ["mode", "payment mode"], example: "UPI", format: "UPI, BANK, CASH, CHEQUE, FUEL_CARD, FASTAG or CREDIT. Blank with a UTR posts as BANK.", editable: false },
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
    const parsedDate = parseBulkPaymentDate(pick(cells, "date"));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(parsedDate) ? parsedDate : "";
    const utr = pick(cells, "utr");
    const remarks = pick(cells, "remarks");
    const amount = amountText === "" ? null : Number(amountText);
    return {
      rowIndex: rowIndexes?.[index] ?? index + 2,
      tripId: pick(cells, "tripId"),
      lrNumber: pick(cells, "lrNumber") || undefined,
      amount: amountText === "" ? null : Number.isFinite(amount) ? amount : Number.NaN,
      paymentModeId: canonicalPaymentModeId(pick(cells, "mode")),
      date: date || undefined,
      utr: utr || undefined,
      remarks: remarks || undefined,
    };
  });
}

export type BulkHoldAlert = {
  kind: "compliance" | "documents" | "advance";
  title: string;
  detail: string;
};

/**
 * What is still open on a trip that can be paid after approval.
 * A missing POD is listed too. Approving that row records the hard-copy receipt, then the balance can post.
 */
export function bulkHoldAlerts(
  category: ComplianceLedgerCategory,
  trip: Pick<TripRow, "compliance_verified_at" | "finance_verified_at" | "pod_received_at"> | undefined,
  required: RequiredTripDocumentSummary,
): BulkHoldAlert[] {
  const alerts: BulkHoldAlert[] = [];
  if (category === "compliance_advance" && !trip?.compliance_verified_at) {
    alerts.push({
      kind: "compliance",
      title: "Compliance pending",
      detail: "Compliance is not verified yet. Approval saves an exception and lets this payment proceed.",
    });
    const documents = [
      ...required.missingLabels.map((label) => `${label} missing`),
      ...required.pendingLabels.map((label) => `${label} awaiting verification`),
      ...required.rejectedLabels.map((label) => `${label} rejected`),
    ];
    if (documents.length > 0) {
      alerts.push({
        kind: "documents",
        title: "Documents pending",
        detail: documents.join(" · "),
      });
    }
  }
  if (category === "compliance_advance" && !trip?.finance_verified_at) {
    alerts.push({
      kind: "advance",
      title: "Advance pending",
      detail: "The advance is approved at the supplier percent, or at 90% when the supplier has none.",
    });
  }
  if (category === "compliance_balance" && !trip?.pod_received_at) {
    alerts.push({
      kind: "documents",
      title: "POD pending",
      detail: "Hard-copy POD has not been marked received. Approval records the receipt and posts this balance.",
    });
  }
  return alerts;
}

/** Document, advance, and missing-POD blocks can be released. A posted payment cannot. */
export function blockedTripCanBeReleased(reason: string | undefined): boolean {
  const text = (reason ?? "").trim().toLowerCase();
  if (!text) return false;
  if (text.includes("already")) return false;
  if (text.includes("before the balance")) return false;
  return true;
}

function missingPodRelease(reason: string | undefined): boolean {
  const text = (reason ?? "").trim().toLowerCase();
  return text.includes("hard-copy") || text.includes("pod");
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
  const positional = !mapping.tripId && !mapping.lrNumber;
  const used: ColumnMapping = positional
    ? {
        tripId: sheet.headers[0] ?? null,
        lrNumber: null,
        amount: sheet.headers[1] ?? null,
        mode: sheet.headers[2] ?? null,
        date: sheet.headers[3] ?? null,
        utr: sheet.headers[4] ?? null,
        remarks: sheet.headers[5] ?? null,
      }
    : mapping;
  return compliancePostRowsFromSheet(sheet.headers, sheet.rows, used, sheet.rowIndexes);
}

/** `trips` has supplier_id only. The name lives on this workspace's supplier row. */
async function fillWorkspaceSupplierNames(organizationId: string, trips: TripRow[]): Promise<void> {
  const ids = [...new Set(trips.map((trip) => (trip.supplier_id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return;
  const names = new Map<string, string>();
  for (let index = 0; index < ids.length; index += TRIP_LOOKUP_CHUNK) {
    const chunk = ids.slice(index, index + TRIP_LOOKUP_CHUNK);
    const { data, error } = await supabase()
      .from("suppliers")
      .select("id, name, company_name")
      .eq("organization_id", organizationId)
      .in("id", chunk);
    if (error) return;
    for (const row of data ?? []) {
      const name = String(row.company_name ?? row.name ?? "").trim();
      if (row.id && name) names.set(row.id, name);
    }
  }
  for (const trip of trips) {
    const name = names.get((trip.supplier_id ?? "").trim());
    if (name) trip.supplier_name = name;
  }
}

type AdvanceQuote = {
  amount: number;
  percent: number | null;
  baseFreight: number | null;
  tdsAmount: number;
  documentationCharges: number;
};

async function loadAdvanceQuotes(
  organizationId: string,
  tripIds: string[],
  tripsById: Map<string, TripRow>,
): Promise<Map<string, AdvanceQuote>> {
  const stored = new Map<string, { amount: number; percent: number | null }>();
  for (let index = 0; index < tripIds.length; index += TRIP_LOOKUP_CHUNK) {
    const chunk = tripIds.slice(index, index + TRIP_LOOKUP_CHUNK);
    const { data, error } = await supabase()
      .from("payment_requests")
      .select("trip_id, approved_amount, terms_snapshot, created_at")
      .in("trip_id", chunk)
      .eq("payment_type", "advance")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    if (error) throw new Error(explainBulkPaymentReadError(error.message ?? "Couldn't read approved advances."));
    for (const row of data ?? []) {
      const tripId = String(row.trip_id ?? "");
      if (!tripId || stored.has(tripId) || row.approved_amount == null) continue;
      const amount = Number(row.approved_amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const snapshot = row.terms_snapshot as { advance_percent?: number } | null;
      const percent = snapshot?.advance_percent == null ? null : Number(snapshot.advance_percent);
      stored.set(tripId, { amount, percent: percent != null && Number.isFinite(percent) ? percent : null });
    }
  }
  const computed = await quoteAdvancePayablesForTrips(
    organizationId,
    tripIds.map((id) => ({ id, supplierId: tripsById.get(id)?.supplier_id ?? null })),
  );
  const quotes = new Map<string, AdvanceQuote>();
  for (const id of tripIds) {
    const saved = stored.get(id);
    const quote = computed.get(id);
    if (!saved && !quote) continue;
    quotes.set(id, {
      amount: saved?.amount ?? quote?.payable ?? 0,
      percent: saved?.percent ?? quote?.percent ?? null,
      baseFreight: quote?.baseFreight ?? null,
      tdsAmount: quote?.tdsAmount ?? 0,
      documentationCharges: quote?.documentationCharges ?? 0,
    });
  }
  return quotes;
}

export function explainBulkPaymentReadError(message: string): string {
  if (/column .+ does not exist/i.test(message)) {
    return "This file could not be checked against this workspace. No payment was posted.";
  }
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
  const lrKeys = [...new Set(rows.map((row) => normalizeOrgLrNumber(row.lrNumber)).filter(Boolean))];
  if (lrKeys.length > 0) {
    const byLr = await tripIdsByLrNumber(organizationId, lrKeys);
    const missingIds = [...new Set([...byLr.values()].flat())].filter((id) => !seenTripIds.has(id));
    if (missingIds.length > 0) {
      for (const trip of await readTripsForPost(organizationId, "id", missingIds)) {
        remember(trip);
        tripsById.set(trip.id, trip);
        for (const key of tripMatchKeys(trip)) {
          const norm = key.toUpperCase();
          const list = matchesByKey.get(norm) ?? [];
          if (!list.some((item) => item.id === trip.id)) list.push(trip);
          matchesByKey.set(norm, list);
        }
      }
    }
    for (const [lr, ids] of byLr) {
      const list = ids.map((id) => tripsById.get(id)).filter((trip): trip is TripRow => Boolean(trip));
      if (list.length > 0) matchesByKey.set(lr, list);
    }
  }
  await fillWorkspaceSupplierNames(organizationId, [...tripsById.values()]);
  const referenceKeys = [...new Set([...tripKeys, ...rows.map((row) => normalizeOrgLrNumber(row.lrNumber)).filter(Boolean)])];
  const resolvedTripId = new Map<string, string>();
  for (const key of referenceKeys) {
    const matches = matchesByKey.get(key.toUpperCase()) ?? [];
    if (matches.length === 1) {
      resolvedTripId.set(key, matches[0].id);
      tripsById.set(key, matches[0]);
    }
  }
  const tripIds = [...new Set([...resolvedTripId.values()])];

  const existingTxns = tripIds.length === 0
    ? []
    : await readByIdChunks(tripIds, (chunk) =>
        supabase()
          .from("transactions")
          .select("trip_id, description, payment_reference, ledger_category")
          .eq("organization_id", organizationId)
          .in("trip_id", chunk)
          .eq("ledger_category", params.category),
      ).then((result) => {
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
  const advanceQuotes = params.category === "compliance_advance"
    ? await loadAdvanceQuotes(organizationId, tripIds, tripsById)
    : new Map<string, AdvanceQuote>();

  const valid: ComplianceBulkRowValidation[] = [];
  const invalid: ComplianceBulkRowValidation[] = [];

  for (const row of rows) {
    const errors: string[] = [];
    const pastedKey = row.tripId.trim();
    const lrKey = normalizeOrgLrNumber(row.lrNumber);
    const reference = pastedKey || lrKey;
    const realTripId = (pastedKey ? resolvedTripId.get(pastedKey) : undefined) ?? (lrKey ? resolvedTripId.get(lrKey) : undefined);
    const tripMatches = pastedKey ? matchesByKey.get(pastedKey.toUpperCase()) ?? [] : [];
    const lrMatches = lrKey ? matchesByKey.get(lrKey) ?? [] : [];
    const matchCount = tripMatches.length > 0 ? tripMatches.length : lrMatches.length;
    if (!reference) errors.push("Add a Trip ID or an LR number from a trip in this workspace.");
    else if (matchCount > 1) errors.push(`${reference} matches more than one trip in this workspace. Add the Trip ID so the right trip is used.`);
    else if (pastedKey && lrKey && tripMatches.length === 1 && lrMatches.length === 1 && tripMatches[0].id !== lrMatches[0].id) {
      errors.push(`Trip ID ${pastedKey} and LR ${lrKey} are different trips in this workspace.`);
    }
    const trip = realTripId ? tripsById.get(realTripId) : undefined;
    if (reference && matchCount <= 1 && !trip && !errors.some((error) => error.includes("different trips"))) {
      errors.push(
        pastedKey
          ? `${pastedKey} is not a trip in this workspace. Only this organization's trips can be posted.`
          : `${lrKey} is not an LR number on a trip in this workspace. Only this organization's trips can be posted.`,
      );
    }
    let amount = row.amount;
    let advancePercent = row.advancePercent;
    let notice: string | undefined;
    let noticeTone: "preview" | "alert" | undefined;
    if (params.category === "compliance_advance") {
      const quote = realTripId ? advanceQuotes.get(realTripId) : undefined;
      const resolved = advancePostAmount({
        fileAmount: amount != null && Number.isFinite(amount) ? amount : null,
        payable: quote?.amount ?? null,
        advancePercent: quote?.percent ?? null,
        baseFreight: quote?.baseFreight ?? null,
        documentationCharges: quote?.documentationCharges ?? 0,
        tdsAmount: quote?.tdsAmount ?? 0,
      });
      if (resolved.error) errors.push(resolved.error);
      if (resolved.amount != null && Number.isFinite(resolved.amount) && resolved.amount > 0) amount = resolved.amount;
      if (resolved.advancePercent != null) advancePercent = resolved.advancePercent;
      notice = resolved.notice ?? undefined;
      noticeTone = resolved.tone ?? undefined;
    }
    if (amount == null) {
      errors.push(params.category === "compliance_advance" ? "This trip's advance could not be calculated. Check the supplier rate, then validate again." : "Add an amount.");
    } else if (!Number.isFinite(amount) || amount <= 0) errors.push("Invalid amount");
    if (trip && amount != null && Number.isFinite(amount) && amount > 0) {
      const amountCheck = validateCompliancePaymentAmount({ amount, trip });
      if (!amountCheck.ok) errors.push(amountCheck.reason ?? "Amount mismatch");
    }
    let paymentModeId = row.paymentModeId;
    if (!paymentModeId) {
      paymentModeId = row.utr ? "BANK" : "";
      if (!paymentModeId) errors.push("Add a mode, or a UTR so this posts as a bank transfer.");
    } else if (!VALID_MODE_IDS.has(paymentModeId as (typeof PAYMENT_MODES)[number]["id"])) {
      errors.push(`Invalid payment mode "${paymentModeId}"`);
    }
    const postedRow = { ...row, amount, paymentModeId, advancePercent };
    if (paymentModeId !== "CASH" && row.utr) {
      const utrUpper = row.utr.toUpperCase();
      const existing = realTripId ? existingUtrsByTrip.get(realTripId) : undefined;
      const batchSeen = realTripId ? seenInBatch.get(realTripId) : undefined;
      if (existing?.has(utrUpper) || batchSeen?.has(utrUpper)) {
        errors.push(`Duplicate UTR "${row.utr}" for this trip`);
      }
    }

    if (errors.length > 0) {
      invalid.push({ row: postedRow, errors, notice, noticeTone });
      continue;
    }
    if (paymentModeId !== "CASH" && row.utr) {
      const set = seenInBatch.get(realTripId ?? reference) ?? new Set<string>();
      set.add(row.utr.toUpperCase());
      seenInBatch.set(realTripId ?? reference, set);
    }
    if (reference) {
      resolvedTripId.set(reference, realTripId ?? "");
      if (trip) tripsById.set(reference, trip);
    }
    valid.push({
      row: { ...postedRow, tripId: pastedKey || lrKey, amount: amount ?? postedRow.amount },
      errors: [],
      notice,
      noticeTone,
    });
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
      const posted = params.category === "compliance_advance" ? bucket.advance : bucket.balance;
      const existingPayment = gate.kind === "already_paid" ? existingCompliancePayment(posted) ?? undefined : undefined;
      const gated = { ...item, gateReason: gate.reason, existingPayment };
      if (gate.kind === "already_paid") alreadyPaid.push(gated);
      else blocked.push(gated);
      continue;
    }
    const required = summarizeRequiredTripDocuments(documentsByTrip.get(realTripId ?? "") ?? []);
    const alerts = bulkHoldAlerts(params.category, trip, required);
    const requirementReason = alerts.length > 0
      ? alerts.map((alert) => alert.title).join(" · ")
      : bulkRequirementBlockReason(params.category, trip, required);
    if (requirementReason) {
      blocked.push({ ...item, gateReason: requirementReason, alerts });
      continue;
    }
    eligible.push(item);
  }

  const eligibleTotal = eligible.reduce((sum, item) => sum + (item.row.amount ?? 0), 0);
  return { valid: eligible, invalid, blocked, alreadyPaid, eligibleTotal, tripsById };
}

/**
 * Process only the pre-validated rows the caller confirmed. Each row is an
 * independent canonical ledger write — one row's failure doesn't roll back
 * the others (matches how the existing single-payment flow already behaves),
 * but every outcome is reported back so nothing is silently dropped.
 */
/**
 * Record the compliance exception and the advance approval for blocked trips
 * in this workspace, then the caller posts only the rows that clear.
 * A missing POD is marked received with the same comment. An already posted payment is left untouched.
 */
export async function releaseBlockedTripsForPost(params: {
  trips: Array<{ tripId: string; supplierId: string | null; complianceVerified: boolean; financeVerified: boolean; reason: string; advancePercent?: number | null }>;
  comment: string;
  /** Used when the trip's supplier has no advance percent of its own. */
  advancePercent: number | null;
  category: ComplianceLedgerCategory;
}): Promise<{ released: string[]; failed: Array<{ tripId: string; message: string }> }> {
  const comment = params.comment.trim();
  const released: string[] = [];
  const failed: Array<{ tripId: string; message: string }> = [];
  const seen = new Set<string>();
  const supplierPercent = new Map<string, number>();
  if (params.category === "compliance_advance" && params.advancePercent == null) {
    const supplierIds = [...new Set(params.trips.map((trip) => (trip.supplierId ?? "").trim()).filter(Boolean))];
    for (let index = 0; index < supplierIds.length; index += TRIP_LOOKUP_CHUNK) {
      const chunk = supplierIds.slice(index, index + TRIP_LOOKUP_CHUNK);
      const { data } = await supabase()
        .from("suppliers")
        .select("id, advance_percentage")
        .in("id", chunk);
      for (const row of data ?? []) {
        const percent = Number(row.advance_percentage);
        if (row.id && Number.isFinite(percent) && percent >= 0 && percent <= 100) supplierPercent.set(row.id, percent);
      }
    }
  }
  for (const trip of params.trips) {
    if (!blockedTripCanBeReleased(trip.reason)) continue;
    if (!trip.tripId) {
      failed.push({ tripId: "", message: "This row is not a trip in this workspace, so it was not approved." });
      continue;
    }
    if (seen.has(trip.tripId)) continue;
    seen.add(trip.tripId);
    if (missingPodRelease(trip.reason)) {
      if (!comment) {
        failed.push({ tripId: trip.tripId, message: "A comment is required to approve a blocked trip." });
        continue;
      }
      const received = await markTripHardCopyPodReceived(trip.tripId, { comment });
      if (received.error) {
        failed.push({ tripId: trip.tripId, message: received.error.message });
        continue;
      }
    }
    if (!trip.complianceVerified) {
      if (!comment) {
        failed.push({ tripId: trip.tripId, message: "A comment is required to approve a blocked trip." });
        continue;
      }
      const exception = await approveComplianceWithException({ tripId: trip.tripId, comment });
      if (exception.error) {
        failed.push({ tripId: trip.tripId, message: exception.error.message });
        continue;
      }
    }
    if (params.category === "compliance_advance" && !trip.financeVerified) {
      const percent = trip.advancePercent ?? params.advancePercent ?? supplierPercent.get((trip.supplierId ?? "").trim()) ?? COMPLIANCE_DEFAULT_ADVANCE_PERCENT;
      const finance = await markTripFinanceVerified({
        tripId: trip.tripId,
        advancePercent: percent,
        idempotencyKey: `bulk-release:${trip.tripId}`,
      });
      if (finance.error) {
        failed.push({ tripId: trip.tripId, message: finance.error.message });
        continue;
      }
    }
    released.push(trip.tripId);
  }
  return { released, failed };
}

/** A blank rate type is stored as per trip on approval, but the trip column stays blank and the payment is then refused. Write the approved type once, only when the column is empty. */
async function matchBlankAdvanceBasis(tripId: string): Promise<void> {
  const tripRead = await supabase().from("trips").select("supplier_rate_basis").eq("id", tripId).limit(1);
  if (tripRead.error) return;
  const current = String(tripRead.data?.[0]?.supplier_rate_basis ?? "").trim();
  if (current) return;
  const request = await supabase()
    .from("payment_requests")
    .select("terms_snapshot")
    .eq("trip_id", tripId)
    .eq("payment_type", "advance")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1);
  const snapshot = request.data?.[0]?.terms_snapshot as { supplier_rate_basis?: string } | null;
  const basis = canonicalSupplierRateBasis(snapshot?.supplier_rate_basis);
  if (!basis) return;
  await supabase().from("trips").update({ supplier_rate_basis: basis }).eq("id", tripId);
}

export function explainBulkPostError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("trip terms changed") || lower.includes("approval inputs changed") || lower.includes("reapprove the advance")) {
    return "This payment was not posted. The trip rate did not match the approved advance. Confirm the file again.";
  }
  if (lower.includes("must equal the approved advance") || lower.includes("exceeds the approved advance")) {
    return "This payment was not posted. The amount has to match the approved advance.";
  }
  if (lower.includes("already posted") || lower.includes("already been posted")) {
    return "This trip already has this payment, so it was not posted again.";
  }
  return message;
}

/** Move an unposted advance onto the file amount by changing only the percent. */
async function alignAdvancePercent(tripId: string, amount: number, percent: number): Promise<Error | null> {
  const { data, error } = await supabase()
    .from("payment_requests")
    .select("approved_amount")
    .eq("trip_id", tripId)
    .eq("payment_type", "advance")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return new Error(explainBulkPaymentReadError(error.message ?? "Couldn't read the approved advance."));
  const approved = data?.[0]?.approved_amount == null ? null : Number(data[0].approved_amount);
  if (approved != null && Math.round(approved * 100) === Math.round(amount * 100)) return null;
  if (approved != null) {
    const undone = await unmarkTripFinanceVerified({
      tripId,
      idempotencyKey: `bulk-advance-percent-undo:${tripId}:${amount}:${Date.now()}`,
    });
    if (undone.error) return undone.error;
  }
  const finance = await markTripFinanceVerified({
    tripId,
    advancePercent: percent,
    idempotencyKey: `bulk-advance-percent:${tripId}:${amount}:${Date.now()}`,
  });
  if (finance.error) return finance.error;
  const next = finance.approval?.approvedAmount;
  if (next == null || Math.round(next * 100) !== Math.round(amount * 100)) {
    return new Error(`The advance percent did not produce ${amount.toLocaleString("en-IN")}. The file amount was not changed.`);
  }
  return null;
}

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
    if (row.amount == null) {
      results.push({ rowIndex: row.rowIndex, error: new Error("Add an amount.") });
      continue;
    }
    if (params.category === "compliance_advance" && row.advancePercent != null) {
      const aligned = await alignAdvancePercent(trip.id, row.amount, row.advancePercent);
      if (aligned) {
        results.push({ rowIndex: row.rowIndex, error: aligned });
        continue;
      }
    }
    if (params.category === "compliance_advance") await matchBlankAdvanceBasis(trip.id);
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
    results.push({ rowIndex: row.rowIndex, error: error ? new Error(explainBulkPostError(error.message)) : null });
  }
  return results;
}
