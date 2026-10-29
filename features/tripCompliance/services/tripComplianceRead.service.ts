import type { DocumentRow } from "@/features/compliance/services/documents.service";
import { getDocumentsForEntities } from "@/features/compliance/services/documents.service";
import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";
import {
    REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
    REQUIRED_DRIVER_DOCUMENT_TYPES,
    REQUIRED_VEHICLE_DOCUMENT_TYPES,
    type ComplianceDecision,
    type ComplianceDocumentRow,
    type ComplianceEntityDocument,
    type ComplianceOutstandingSummary,
    type CompliancePaymentSummary,
    type ComplianceStage,
    type ComplianceTripFlags,
    type ComplianceTripInputs,
    type ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import { buildComplianceChecklist, listExpiredRequiredVehicleDocTypes } from "@/features/tripCompliance/utils/complianceChecklist.util";
import { isComplianceTxnDateConfirmed } from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import { classifyTripDocument } from "@/features/tripCompliance/utils/tripDocumentClassification.util";
import { deriveEntityComplianceRows } from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import {
    mergeComplianceEntityDocs,
    normalizeTripDocumentType,
    normalizeVaultVehicleNumber,
    vehicleVaultDocumentsToEntityDocs,
} from "@/features/tripCompliance/utils/complianceVaultDocuments.util";
import { fetchComplianceVehicleVaultForTrips } from "@/features/tripCompliance/services/complianceListFacts.service";
import {
  isSoftPodDocumentType,
  fetchHardCopyIbondTripIds,
  tripPodIsReceived,
} from "@/features/trips/services/tripDocumentLrPod.service";
import { lrNumbersFromDocumentNumber } from "@/features/trips/utils/hardCopyPodLrSelection.util";
import {
  POD_NOT_FOUND_EVENT,
  POD_REVALIDATE_EVENT,
  POD_SETTLEMENT_RELEASED_EVENT,
  POD_VALIDATED_EVENT,
} from "@/features/debit-control/utils/debitControlPod.model";
import {
  resolvePodChargeWorkflow,
  workflowEventPostedMs,
  type PodChargeWorkflowFlags,
} from "@/features/debit-control/utils/podChargeWorkflow.util";
import { podDebitIdentifiedFromPayload } from "@/features/debit-control/utils/podExceptionDebit.util";
import { decodeCourierLrRemarks, lrReceiptForTrip } from "@/features/trips/utils/lrReceiptStatus.util";
import {
  isCompletedTripStatus,
  isOperationsDeliveredTrip,
} from "@/features/trips/utils/tripHubMetrics";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";
import { chunkIdsForRead, readAllPages } from "@/lib/pagination";
import { supabase } from "@/lib/supabase";

/**
 * `trip_documents.status`/`verified_by`/`verified_at`/`rejection_reason` and
 * `trips.compliance_verified_*`/`pod_hard_copy_*` ship in migration
 * 20260915162440 — not yet applied while the production schema freeze holds.
 * Every read below degrades gracefully (missing-column / missing-relation
 * errors) so the rest of the app, and this feature's read-only surfaces,
 * keep working before that migration lands.
 */
export function isMissingColumnOrRelation(error: { code?: string; message?: string }): boolean {
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42703" || // undefined_column
    error.code === "42P01" || // undefined_table
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("does not exist")
  );
}

type RawTripDocRow = {
  id: string;
  trip_id: string;
  document_type: string | null;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
  uploaded_by?: string | null;
  status?: ComplianceDocumentRow["status"];
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  mime_type?: string | null;
  document_number?: string | null;
  source_entity_document_id?: string | null;
};

const TRIP_DOC_SELECT_STATUS =
  "id, trip_id, document_type, file_name, storage_path, uploaded_at, uploaded_by, status, verified_by, verified_at, rejection_reason, mime_type, document_number";
const TRIP_DOC_SELECT_STATUS_AND_SOURCE = `${TRIP_DOC_SELECT_STATUS}, source_entity_document_id`;
const TRIP_DOC_SELECT_BASE =
  "id, trip_id, document_type, file_name, storage_path, uploaded_at, uploaded_by";

async function readTripDocumentsSelect(
  tripIds: string[],
  select: string,
): Promise<{ data: RawTripDocRow[]; error: { message: string; code?: string } | null }> {
  const { data, error } = await readAllPages<RawTripDocRow, { message: string; code?: string }>(
    (afterId, limit) => {
      let q = supabase().from("trip_documents").select(select).in("trip_id", tripIds);
      if (afterId) q = q.gt("id", afterId);
      return q.order("id", { ascending: true }).limit(limit);
    },
  );
  return { data, error };
}

async function readTripDocumentsChunk(tripIds: string[]): Promise<RawTripDocRow[]> {
  let result = await readTripDocumentsSelect(tripIds, TRIP_DOC_SELECT_STATUS_AND_SOURCE);
  if (result.error && isMissingColumnOrRelation(result.error)) {
    const withoutSource = await readTripDocumentsSelect(tripIds, TRIP_DOC_SELECT_STATUS);
    result = {
      data: withoutSource.data.map((row) => ({ ...row, source_entity_document_id: null })),
      error: withoutSource.error,
    };
  }
  if (result.error && isMissingColumnOrRelation(result.error)) {
    const fallback = await readTripDocumentsSelect(tripIds, TRIP_DOC_SELECT_BASE);
    if (fallback.error) throw new Error(fallback.error.message);
    return fallback.data.map((row) => ({ ...row, status: "pending" as const }));
  }
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function fetchTripDocumentsForTrips(
  tripIds: string[],
): Promise<Map<string, ComplianceDocumentRow[]>> {
  const byTrip = new Map<string, ComplianceDocumentRow[]>();
  const chunks = chunkIdsForRead(tripIds);
  if (chunks.length === 0) return byTrip;

  const rows: RawTripDocRow[] = [];
  for (const chunk of chunks) {
    rows.push(...(await readTripDocumentsChunk(chunk)));
  }

  for (const r of rows) {
    const doc: ComplianceDocumentRow = {
      id: r.id,
      trip_id: r.trip_id,
      document_type: normalizeTripDocumentType(r.document_type),
      file_name: r.file_name,
      storage_path: r.storage_path,
      uploaded_at: r.uploaded_at,
      uploaded_by: r.uploaded_by ?? null,
      status: r.status ?? "pending",
      verified_by: r.verified_by ?? null,
      verified_at: r.verified_at ?? null,
      rejection_reason: r.rejection_reason ?? null,
      mime_type: r.mime_type ?? null,
      document_number: r.document_number ?? null,
      source_entity_document_id: r.source_entity_document_id ?? null,
    };
    const list = byTrip.get(doc.trip_id) ?? [];
    list.push(doc);
    byTrip.set(doc.trip_id, list);
  }
  return byTrip;
}

export async function fetchComplianceTripFlags(
  tripIds: string[],
): Promise<Map<string, ComplianceTripFlags>> {
  const byTrip = new Map<string, ComplianceTripFlags>();
  if (tripIds.length === 0) return byTrip;

  const SELECT_BASE =
    "id, compliance_verified_at, compliance_verified_by, compliance_decision, compliance_exception_reason, compliance_outstanding_summary, pod_hard_copy_courier, pod_hard_copy_awb_number, pod_hard_copy_received_by, pod_received_at";
  // Decline columns come from 20270929162901_trip_compliance_decline.sql.
  const SELECT_WITH_DECLINE = `${SELECT_BASE}, compliance_declined_at, compliance_declined_by, compliance_decline_reason`;
  // Finance verify columns come from 20261010122824_finance_verified_step.sql.
  const SELECT_WITH_FINANCE = `${SELECT_WITH_DECLINE}, finance_verified_at, finance_verified_by`;
  const SELECT_WITH_RESUBMIT = `${SELECT_WITH_FINANCE}, compliance_reject_return_to, compliance_resubmitted_at`;
  // Resubmit note comes from 20271008115000_compliance_resubmit_note.sql.
  const SELECT_WITH_RESUBMIT_NOTE = `${SELECT_WITH_RESUBMIT}, compliance_resubmit_note`;
  // Finance flag comes from 20271008117000_compliance_flow_hardening.sql.
  const SELECT_WITH_FLAG = `${SELECT_WITH_RESUBMIT_NOTE}, finance_flagged_at, finance_flagged_by, finance_flag_note`;

  let result: { data: unknown[] | null; error: { code?: string; message: string } | null } = await supabase()
    .from("trips")
    .select(SELECT_WITH_FLAG)
    .in("id", tripIds);

  if (result.error && isMissingColumnOrRelation(result.error)) {
    result = await supabase().from("trips").select(SELECT_WITH_RESUBMIT_NOTE).in("id", tripIds);
  }

  if (result.error && isMissingColumnOrRelation(result.error)) {
    result = await supabase().from("trips").select(SELECT_WITH_RESUBMIT).in("id", tripIds);
  }

  if (result.error && isMissingColumnOrRelation(result.error)) {
    result = await supabase().from("trips").select(SELECT_WITH_FINANCE).in("id", tripIds);
  }

  if (result.error && isMissingColumnOrRelation(result.error)) {
    // Finance verify migration not applied yet: keep the decline columns.
    result = await supabase().from("trips").select(SELECT_WITH_DECLINE).in("id", tripIds);
  }

  if (result.error && isMissingColumnOrRelation(result.error)) {
    // Decline migration not applied yet: retry the original select so
    // verified / exception / hard-copy flags are never lost.
    result = await supabase().from("trips").select(SELECT_BASE).in("id", tripIds);
  }

  const { data, error } = result;
  if (error) {
    if (isMissingColumnOrRelation(error)) return byTrip; // pre-migration: all flags absent
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    byTrip.set(r.id as string, {
      compliance_verified_at: r.compliance_verified_at as string | null,
      compliance_verified_by: r.compliance_verified_by as string | null,
      compliance_decision: (r.compliance_decision as ComplianceDecision | null) ?? null,
      compliance_exception_reason: (r.compliance_exception_reason as string | null) ?? null,
      compliance_outstanding_summary: (r.compliance_outstanding_summary as ComplianceOutstandingSummary | null) ?? null,
      compliance_declined_at: (r.compliance_declined_at as string | null | undefined) ?? null,
      compliance_declined_by: (r.compliance_declined_by as string | null | undefined) ?? null,
      compliance_decline_reason: (r.compliance_decline_reason as string | null | undefined) ?? null,
      compliance_reject_return_to:
        r.compliance_reject_return_to === "pending_for_docs" || r.compliance_reject_return_to === "compliance_pending"
          ? r.compliance_reject_return_to
          : null,
      compliance_resubmitted_at: (r.compliance_resubmitted_at as string | null | undefined) ?? null,
      compliance_resubmit_note: (r.compliance_resubmit_note as string | null | undefined) ?? null,
      finance_flagged_at: (r.finance_flagged_at as string | null | undefined) ?? null,
      finance_flagged_by: (r.finance_flagged_by as string | null | undefined) ?? null,
      finance_flag_note: (r.finance_flag_note as string | null | undefined) ?? null,
      finance_verified_at: (r.finance_verified_at as string | null | undefined) ?? null,
      finance_verified_by: (r.finance_verified_by as string | null | undefined) ?? null,
      pod_hard_copy_courier: r.pod_hard_copy_courier as string | null,
      pod_hard_copy_awb_number: r.pod_hard_copy_awb_number as string | null,
      pod_hard_copy_received_by: r.pod_hard_copy_received_by as string | null,
      pod_received_at: r.pod_received_at as string | null,
    });
  }
  return byTrip;
}

/** LR numbers logged as received on the courier workflow event (one row per trip). */
export async function fetchHardCopyReceivedLrNumbers(
  tripIds: string[],
): Promise<Map<string, string[]>> {
  const byTrip = new Map<string, string[]>();
  if (tripIds.length === 0) return byTrip;
  const { data, error } = await supabase()
    .from("trip_workflow_events")
    .select("trip_id, payload")
    .eq("event_type", "pod.hard_copy_courier_dispatched")
    .in("trip_id", tripIds);
  if (error) {
    if (isMissingColumnOrRelation(error)) return byTrip;
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const record = row as { trip_id?: string; payload?: { remarks?: string | null } | null };
    const tripId = String(record.trip_id ?? "").trim();
    if (!tripId) continue;
    const received = decodeCourierLrRemarks(record.payload?.remarks).receivedLrs;
    if (received.length > 0) byTrip.set(tripId, received);
  }
  return byTrip;
}

function attachIbondFlags(
  flagsByTrip: Map<string, ComplianceTripFlags>,
  ibondTripIds: Set<string>,
): Map<string, ComplianceTripFlags> {
  if (ibondTripIds.size === 0) return flagsByTrip;
  const next = new Map(flagsByTrip);
  for (const tripId of ibondTripIds) {
    const flags = next.get(tripId);
    if (!flags) continue;
    next.set(tripId, { ...flags, pod_ibond: true });
  }
  return next;
}

/** Latest validate / revalidate times so Settlement vs Reverification stay in sync. */
export async function fetchPodChargeWorkflowFlags(
  tripIds: string[],
): Promise<Map<string, PodChargeWorkflowFlags>> {
  const out = new Map<string, PodChargeWorkflowFlags>();
  if (tripIds.length === 0) return out;
  const { data, error } = await supabase()
    .from("trip_workflow_events")
    .select("trip_id, event_type, payload, created_at")
    .in("event_type", [
      POD_VALIDATED_EVENT,
      POD_REVALIDATE_EVENT,
      POD_NOT_FOUND_EVENT,
      POD_SETTLEMENT_RELEASED_EVENT,
    ])
    .in("trip_id", tripIds);
  if (error) {
    if (isMissingColumnOrRelation(error)) return out;
    throw new Error(error.message);
  }
  const validatedAt = new Map<string, number>();
  const validatedPayload = new Map<string, unknown>();
  const revalidateAt = new Map<string, number>();
  const notFoundAt = new Map<string, number>();
  const releasedAt = new Map<string, number>();
  for (const row of data ?? []) {
    const tripId = String((row as { trip_id?: string }).trip_id ?? "").trim();
    const eventType = String((row as { event_type?: string }).event_type ?? "").trim();
    if (!tripId) continue;
    const ms = workflowEventPostedMs({
      createdAt: (row as { created_at?: string }).created_at,
      payload: (row as { payload?: unknown }).payload,
    });
    if (eventType === POD_VALIDATED_EVENT) {
      const prev = validatedAt.get(tripId) ?? 0;
      if (ms >= prev) {
        validatedAt.set(tripId, ms);
        validatedPayload.set(tripId, (row as { payload?: unknown }).payload);
      }
    }
    if (eventType === POD_REVALIDATE_EVENT) {
      revalidateAt.set(tripId, Math.max(revalidateAt.get(tripId) ?? 0, ms));
    }
    if (eventType === POD_NOT_FOUND_EVENT) {
      notFoundAt.set(tripId, Math.max(notFoundAt.get(tripId) ?? 0, ms));
    }
    if (eventType === POD_SETTLEMENT_RELEASED_EVENT) {
      releasedAt.set(tripId, Math.max(releasedAt.get(tripId) ?? 0, ms));
    }
  }
  for (const tripId of new Set([
    ...validatedAt.keys(),
    ...revalidateAt.keys(),
    ...notFoundAt.keys(),
    ...releasedAt.keys(),
  ])) {
    const workflow = resolvePodChargeWorkflow({
      validatedAtMs: validatedAt.get(tripId) ?? null,
      revalidateAtMs: revalidateAt.get(tripId) ?? null,
      notFoundAtMs: notFoundAt.get(tripId) ?? null,
      settlementReleasedAtMs: releasedAt.get(tripId) ?? null,
    });
    const hasDebit =
      workflow.chargesSaved && podDebitIdentifiedFromPayload(validatedPayload.get(tripId));
    out.set(tripId, {
      ...workflow,
      hasDebit,
      noDebit: workflow.chargesSaved && !hasDebit,
    });
  }
  return out;
}

/** Trips whose POD client/vendor charges have been saved. */
export async function fetchPodChargeValidatedTripIds(tripIds: string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  const flags = await fetchPodChargeWorkflowFlags(tripIds);
  for (const [tripId, workflow] of flags) {
    if (workflow.chargesSaved) ids.add(tripId);
  }
  return ids;
}

function attachChargesSavedFlags(
  flagsByTrip: Map<string, ComplianceTripFlags>,
  workflowByTrip: Map<string, PodChargeWorkflowFlags>,
): Map<string, ComplianceTripFlags> {
  if (workflowByTrip.size === 0) return flagsByTrip;
  const next = new Map(flagsByTrip);
  for (const [tripId, workflow] of workflowByTrip) {
    const flags = next.get(tripId);
    if (!flags) continue;
    next.set(tripId, {
      ...flags,
      ...(workflow.chargesSaved ? { pod_charges_saved: true } : { pod_charges_saved: false }),
      ...(workflow.revalidateRequested
        ? { pod_revalidate_requested: true }
        : { pod_revalidate_requested: false }),
      ...(workflow.settlementReleased
        ? { pod_settlement_released: true }
        : { pod_settlement_released: false }),
      ...(workflow.noDebit ? { pod_no_debit: true } : { pod_no_debit: false }),
      ...(workflow.hasDebit ? { pod_has_debit: true } : { pod_has_debit: false }),
    });
  }
  return next;
}

function attachReceivedLrNumbers(
  flagsByTrip: Map<string, ComplianceTripFlags>,
  receivedByTrip: Map<string, string[]>,
): Map<string, ComplianceTripFlags> {
  if (receivedByTrip.size === 0) return flagsByTrip;
  const next = new Map(flagsByTrip);
  for (const [tripId, numbers] of receivedByTrip) {
    const flags = next.get(tripId);
    if (!flags || numbers.length === 0) continue;
    next.set(tripId, { ...flags, received_lr_numbers: numbers });
  }
  return next;
}

type RawTxnRow = {
  id: string;
  trip_id: string | null;
  amount_in: number;
  amount_out: number;
  description: string | null;
  transaction_date: string;
  created_at?: string | null;
  created_by: string | null;
  ledger_category: string | null;
  /** Stored UTR column; preferred over the UTR parsed from the description. */
  payment_reference?: string | null;
};

export async function fetchComplianceTransactions(
  tripIds: string[],
): Promise<Map<string, { advance: RawTxnRow[]; balance: RawTxnRow[] }>> {
  const byTrip = new Map<string, { advance: RawTxnRow[]; balance: RawTxnRow[] }>();
  if (tripIds.length === 0) return byTrip;

  const { data, error } = await supabase()
    .from("transactions")
    .select("id, trip_id, amount_in, amount_out, description, transaction_date, created_at, created_by, ledger_category")
    .in("trip_id", tripIds)
    .in("ledger_category", ["compliance_advance", "compliance_balance"]);

  if (error) {
    if (isMissingColumnOrRelation(error)) return byTrip; // ledger_category not queryable — no payments yet
    throw new Error(error.message);
  }
  for (const row of (data ?? []) as RawTxnRow[]) {
    if (!row.trip_id) continue;
    const bucket = byTrip.get(row.trip_id) ?? { advance: [], balance: [] };
    if (row.ledger_category === "compliance_advance") bucket.advance.push(row);
    else if (row.ledger_category === "compliance_balance") bucket.balance.push(row);
    byTrip.set(row.trip_id, bucket);
  }
  return byTrip;
}

/** `trips` payment columns kept in step on the cached row (`amount_paid` is display-only, never the advance). */
export async function fetchTripPaymentFields(
  tripIds: string[],
): Promise<Map<string, Pick<TripRow, "amount_paid" | "updated_at">>> {
  const byTrip = new Map<string, Pick<TripRow, "amount_paid" | "updated_at">>();
  if (tripIds.length === 0) return byTrip;
  const { data, error } = await supabase().from("trips").select("id, amount_paid, updated_at").in("id", tripIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    byTrip.set(row.id as string, {
      amount_paid: (row as { amount_paid: TripRow["amount_paid"] }).amount_paid,
      updated_at: (row as { updated_at: TripRow["updated_at"] }).updated_at,
    });
  }
  return byTrip;
}

function toEntityDocument(doc: DocumentRow): ComplianceEntityDocument {
  return {
    id: doc.id,
    entity_type: doc.entity_type === "driver" ? "driver" : "vehicle",
    entity_id: doc.entity_id,
    doc_type: doc.doc_type,
    status: doc.status,
    storage_path: doc.storage_path,
    expiry_date: doc.expiry_date,
    verified_at: doc.verified_at,
    verified_by: doc.verified_by,
    notes: doc.notes,
    created_at: doc.created_at,
    created_by: doc.created_by,
    source: "entity",
  };
}

/** Ledger descriptions end with a machine `[[QMETA:{…}]]` tag; never show it to Ops. */
export function stripLedgerMetaTag(value: string | null | undefined): string | null {
  const raw = String(value ?? "");
  const idx = raw.indexOf("[[QMETA:");
  const clean = (idx < 0 ? raw : raw.slice(0, idx)).trim();
  return clean || null;
}

export function toPaymentSummary(rows: RawTxnRow[]): CompliancePaymentSummary | null {
  if (rows.length === 0) return null;
  // Most recent posting represents the payment's current display state —
  // matches "derive, don't duplicate" (Phase 7/9): we don't track a separate
  // paid/pending flag, presence of the row is the state.
  const latest = [...rows].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))[0];
  const structured = interpretLedgerRowStructured(latest);
  return {
    amount: Number(latest.amount_in || latest.amount_out || 0),
    paymentMode: stripLedgerMetaTag(structured.payment_mode),
    utr: stripLedgerMetaTag(latest.payment_reference) ?? stripLedgerMetaTag(structured.reference_number),
    paidAt: latest.transaction_date,
    actorId: latest.created_by,
    transactionId: latest.id,
    postedAt: latest.created_at ?? null,
    txnDateConfirmed: isComplianceTxnDateConfirmed(latest.description),
  };
}

/**
 * @deprecated Finance posts `compliance_advance`; posting time vs verify no longer
 * gates whether the advance counts. Kept for older call sites/tests only.
 */
export function isAdvancePostedAfterVerification(
  advance: Pick<CompliancePaymentSummary, "postedAt">,
  complianceVerifiedAt: string,
): boolean {
  if (!advance.postedAt) return true;
  const posted = Date.parse(advance.postedAt);
  const verified = Date.parse(complianceVerifiedAt);
  if (!Number.isFinite(posted) || !Number.isFinite(verified)) return true;
  return posted >= verified;
}

/**
 * Derives the single displayed compliance stage for a trip from independent
 * signals — never a persisted status column (Phase 4's explicit instruction).
 *
 * The exclusive stage is the doc / verify lane. An unverified trip stays in
 * Pending Docs while a required file is missing, and in Compliance Pending
 * once every required file is on file, including holds. Delivery does not
 * take it out of that lane.
 *
 * `advance` must already be gated by the caller (summarizeComplianceTrip): a
 * compliance_advance posted after compliance_verified_at, never a Finance receipt.
 *
 * Awaiting POD is parallel: a completed (Trip Operations Delivered) trip
 * also appears there until hard-copy is marked, even while it is still in
 * Pending Docs or Compliance Pending. See tripAppearsInAwaitingPod.
 * After Verify, the exclusive stage itself becomes Awaiting POD, then
 * Balance Pending once hard-copy is marked, then Settled once balance is posted.
 *
 * Documented interpretation of a genuine spec ambiguity: "HARD_COPY_POD_RECEIVED"
 * and "BALANCE_PENDING" describe what is, functionally, the same instant (Phase 11:
 * "once hard copy POD received, show BALANCE PENDING"). Since a trip can only sit
 * in one filter bucket at a time, HARD_COPY_POD_RECEIVED means a delivered trip
 * whose physical POD is not yet marked, and BALANCE_PENDING begins when Ops
 * marks it received.
 */
export function deriveComplianceStage(input: {
  documentCount: number;
  /** Required trip types still missing (LR / E-way / Invoice). Prefer over raw count. */
  missingRequiredCount?: number;
  /**
   * Required vehicle (RC / Insurance / FC) and driver (licence) files still
   * missing. Optional docs do not count. Keeps the trip in Pending Docs.
   */
  missingRequiredEntityCount?: number;
  /**
   * Required vehicle docs (RC / Insurance / FC) that are on file but past
   * expiry. Forces Pending Docs until the trip is compliance-verified.
   * A verified Delivered trip still stays in the POD lane.
   */
  hasExpiredRequiredVehicleDocs?: boolean;
  complianceVerifiedAt: string | null;
  /** Finance verify (mark_trip_finance_verified). Splits Verified into Compliance / Finance Verified. */
  financeVerifiedAt?: string | null;
  advance: CompliancePaymentSummary | null;
  tripStatus: string;
  /**
   * Trip Operations Delivered, including at-destination trips that have a soft
   * POD but are not yet status=delivered. Completed statuses are detected from
   * `tripStatus` when this flag is omitted.
   */
  opsDelivered?: boolean;
  hardCopyReceived: boolean;
  balance: CompliancePaymentSummary | null;
}): ComplianceStage {
  if (input.balance && input.complianceVerifiedAt) return "payment_settled";
  const missingRequired =
    input.missingRequiredCount ??
    (input.documentCount === 0 ? REQUIRED_COMPLIANCE_DOCUMENT_TYPES.length : 0);
  const docsStillOpen =
    Boolean(input.hasExpiredRequiredVehicleDocs) ||
    missingRequired > 0 ||
    (input.missingRequiredEntityCount ?? 0) > 0;
  // Unverified trips stay on the doc lane. Delivery does not pull them into
  // Awaiting POD. Holds (decline) do not change this stage.
  if (!input.complianceVerifiedAt) {
    return docsStillOpen ? "pending_for_docs" : "compliance_pending";
  }
  const delivered = Boolean(input.opsDelivered || isCompletedTripStatus(input.tripStatus));
  // Delivered + hard-copy → balance. Delivered without hard-copy → Awaiting POD
  // once the advance is posted. Before that the trip stays with Finance
  // (Advance Verification / Advance Payment); the Awaiting POD list still shows it.
  if (delivered) {
    if (input.hardCopyReceived) return "balance_pending";
    if (input.advance) return "hard_copy_pod_received";
    return input.financeVerifiedAt ? "finance_verified" : "compliance_verified";
  }
  // Expired RC / Insurance / FC override payment-progress chips on undelivered
  // trips — Ops must renew before Advance Processed.
  if (input.hasExpiredRequiredVehicleDocs) return "pending_for_docs";
  // Hard-copy on an undelivered trip only opens balance once a real advance is on file.
  // POD alone must not pull a verified trip off Verified (no advance).
  if (input.advance && input.hardCopyReceived) return "balance_pending";
  if (input.advance) return "advance_payment_processed";
  return input.financeVerifiedAt ? "finance_verified" : "compliance_verified";
}

/**
 * Awaiting POD membership, independent of the exclusive doc/verify stage.
 * Completed trips stay listed here until hard-copy POD is marked, including
 * ones that also sit in Pending Docs or Compliance Pending.
 */
export function tripAppearsInAwaitingPod(
  summary: Pick<ComplianceTripSummary, "trip" | "stage" | "documents" | "balance" | "hardCopyPod">,
): boolean {
  if (summary.balance || summary.hardCopyPod.received) return false;
  if (summary.stage === "balance_pending" || summary.stage === "payment_settled") return false;
  if (summary.stage === "hard_copy_pod_received") return true;
  return isOperationsDeliveredTrip(
    summary.trip,
    summary.documents.some((doc) => isSoftPodDocumentType(doc.document_type)),
  );
}

function missingRequiredEntityDocumentCount(
  vehicleDocuments: ComplianceEntityDocument[],
  driverDocuments: ComplianceEntityDocument[],
): number {
  const rows = [
    ...deriveEntityComplianceRows(REQUIRED_VEHICLE_DOCUMENT_TYPES, vehicleDocuments),
    ...deriveEntityComplianceRows(REQUIRED_DRIVER_DOCUMENT_TYPES, driverDocuments),
  ];
  return rows.filter((row) => row.required && row.status === "missing").length;
}

/**
 * Still missing required trip docs (LR / E-way / Invoice) and not yet verified.
 * Stage chips use exclusive `summary.stage` counts — do not use this for filter
 * totals (it overlaps payment-progress stages).
 */
export function tripNeedsPendingDocs(summary: {
  complianceVerifiedAt: string | null;
  documents: { document_type: string }[];
}): boolean {
  if (summary.complianceVerifiedAt) return false;
  const present = new Set(summary.documents.map((d) => d.document_type));
  return REQUIRED_COMPLIANCE_DOCUMENT_TYPES.some((type) => !present.has(type));
}

async function fetchEntityDocumentsByIds(
  orgId: string | null | undefined,
  entityIds: string[],
  entityTypes: Array<"vehicle" | "driver">,
): Promise<Map<string, DocumentRow[]>> {
  const byEntity = new Map<string, DocumentRow[]>();
  const ids = Array.from(new Set(entityIds.filter(Boolean)));
  if (!orgId || ids.length === 0) return byEntity;

  const { error, documents } = await getDocumentsForEntities(orgId, ids, entityTypes);
  if (error) {
    if (isMissingColumnOrRelation(error)) return byEntity;
    throw error;
  }
  for (const doc of documents) {
    const list = byEntity.get(doc.entity_id) ?? [];
    list.push(doc);
    byEntity.set(doc.entity_id, list);
  }
  return byEntity;
}

type VaultEntry = { vehicleId: string; docs: ComplianceEntityDocument[] };

function indexVehicleVaultDocs(
  byKey: Map<string, VaultEntry>,
  entry: VaultEntry,
  ...keys: Array<string | null | undefined>
) {
  if (entry.docs.length === 0) return;
  for (const key of keys) {
    if (key) byKey.set(key, entry);
  }
}

/**
 * Trips whose vault docs can only be found by plate: no linked vehicle, a
 * manual `vehicle_display_number`, and no vehicle already indexed under that
 * plate. Trips with a vehicle_id are resolved by the vault RPC — even when the
 * vehicle has no documents — so they never fall back.
 * (`owner_vehicle_id` references owner_vehicles, not vehicles, and is not used.)
 */
export function tripsNeedingVaultPlateFallback(
  trips: TripRow[],
  knownVehicleKeys: ReadonlySet<string>,
): TripRow[] {
  return trips.filter((trip) => {
    if (trip.vehicle_id) return false;
    const number = normalizeVaultVehicleNumber(trip.vehicle_display_number);
    return Boolean(number) && !knownVehicleKeys.has(number);
  });
}

/**
 * Asset Vault (vehicles.documents) for the trips' linked vehicles in one
 * `get_compliance_vehicle_vault_for_trips` call — partner trucks included,
 * authorized per trip server-side for `viewerOrgId`.
 */
async function fetchVehicleVaultDocumentsForTrips(
  trips: TripRow[],
  viewerOrgId: string,
): Promise<Map<string, VaultEntry>> {
  const byKey = new Map<string, VaultEntry>();
  if (!viewerOrgId) return byKey;

  // Every vehicle the RPC returned is resolved — with or without documents.
  const resolvedKeys = new Set<string>();
  const tripIdsWithVehicle = trips.filter((trip) => trip.vehicle_id).map((trip) => trip.id);
  if (tripIdsWithVehicle.length > 0) {
    const rows = await fetchComplianceVehicleVaultForTrips(viewerOrgId, tripIdsWithVehicle);
    for (const row of rows) {
      const number = normalizeVaultVehicleNumber(row.vehicle_number);
      resolvedKeys.add(row.vehicle_id);
      if (number) resolvedKeys.add(number);
      const docs = vehicleVaultDocumentsToEntityDocs(row.vehicle_id, row.documents ?? null);
      indexVehicleVaultDocs(byKey, { vehicleId: row.vehicle_id, docs }, row.vehicle_id, number);
    }
  }

  const missingByNumber = tripsNeedingVaultPlateFallback(trips, resolvedKeys);
  if (missingByNumber.length > 0) {
    const { data, error } = await supabase()
      .from("vehicles")
      .select("id, vehicle_number, documents")
      .eq("organization_id", viewerOrgId);
    if (error && !isMissingColumnOrRelation(error)) throw new Error(error.message);
    const byNumber = new Map<string, { id: string; documents: VehicleDocuments | null }>();
    for (const row of data ?? []) {
      const number = normalizeVaultVehicleNumber(row.vehicle_number);
      if (number) byNumber.set(number, { id: row.id, documents: (row.documents ?? null) as VehicleDocuments | null });
    }
    for (const trip of missingByNumber) {
      const number = normalizeVaultVehicleNumber(trip.vehicle_display_number);
      const match = number ? byNumber.get(number) : undefined;
      if (!match) continue;
      const docs = vehicleVaultDocumentsToEntityDocs(match.id, match.documents);
      indexVehicleVaultDocs(byKey, { vehicleId: match.id, docs }, match.id, number);
    }
  }

  return byKey;
}

async function fetchDriverKycDocumentsForTrips(
  trips: TripRow[],
): Promise<Map<string, ComplianceEntityDocument[]>> {
  const byDriver = new Map<string, ComplianceEntityDocument[]>();
  const driverIds = Array.from(new Set(trips.map((trip) => trip.driver_id).filter((id): id is string => Boolean(id))));
  if (driverIds.length === 0) return byDriver;

  const { data: driverRows, error: driverError } = await supabase()
    .from("drivers")
    .select("id, user_id")
    .in("id", driverIds);
  if (driverError) {
    if (isMissingColumnOrRelation(driverError)) return byDriver;
    return byDriver;
  }

  const userIdByDriverId = new Map<string, string>();
  const userIds: string[] = [];
  for (const row of driverRows ?? []) {
    if (!row.user_id) continue;
    userIdByDriverId.set(row.id, row.user_id);
    userIds.push(row.user_id);
  }
  for (const driverId of driverIds) {
    if (!userIdByDriverId.has(driverId)) userIds.push(driverId);
  }
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) return byDriver;

  const { data: kycRows, error: kycError } = await supabase()
    .from("driver_kyc_documents")
    .select("id, driver_user_id, doc_type, status, storage_path, verified_at, rejection_notes, created_at")
    .in("driver_user_id", uniqueUserIds)
    .in("doc_type", ["license", "aadhaar"])
    .is("deleted_at", null);
  if (kycError) {
    if (isMissingColumnOrRelation(kycError)) return byDriver;
    return byDriver;
  }

  const driverIdByUserId = new Map<string, string>();
  for (const [driverId, userId] of userIdByDriverId) driverIdByUserId.set(userId, driverId);

  for (const row of kycRows ?? []) {
    const driverId = driverIdByUserId.get(row.driver_user_id) ?? row.driver_user_id;
    const mapped: ComplianceEntityDocument = {
      id: row.id,
      entity_type: "driver",
      entity_id: driverId,
      doc_type: row.doc_type,
      status: row.status,
      storage_path: row.storage_path,
      expiry_date: null,
      verified_at: row.verified_at,
      notes: row.rejection_notes,
      created_at: row.created_at,
      source: "driver-kyc",
    };
    const list = byDriver.get(driverId) ?? [];
    list.push(mapped);
    byDriver.set(driverId, list);
  }
  return byDriver;
}

function assembleVehicleDocuments(
  trip: TripRow,
  entityDocsById: Map<string, DocumentRow[]>,
  vault: Map<string, VaultEntry>,
): { vehicleDocuments: ComplianceEntityDocument[]; vaultVehicleId: string | null } {
  const entityVehicleDocs = trip.vehicle_id
    ? (entityDocsById.get(trip.vehicle_id) ?? []).filter((d) => d.entity_type === "vehicle").map(toEntityDocument)
    : [];
  const vaultEntry =
    (trip.vehicle_id ? vault.get(trip.vehicle_id) : undefined) ??
    vault.get(normalizeVaultVehicleNumber(trip.vehicle_display_number));
  return {
    vehicleDocuments: mergeComplianceEntityDocs(entityVehicleDocs, vaultEntry?.docs ?? []),
    vaultVehicleId: vaultEntry?.vehicleId ?? null,
  };
}

function assembleDriverDocuments(
  trip: TripRow,
  entityDocsById: Map<string, DocumentRow[]>,
  kyc: Map<string, ComplianceEntityDocument[]>,
): ComplianceEntityDocument[] {
  const entityDriverDocs = trip.driver_id
    ? (entityDocsById.get(trip.driver_id) ?? []).filter((d) => d.entity_type === "driver").map(toEntityDocument)
    : [];
  const kycDriver = trip.driver_id ? (kyc.get(trip.driver_id) ?? []) : [];
  return mergeComplianceEntityDocs(kycDriver, entityDriverDocs);
}

function paymentInputs(txns: { advance: RawTxnRow[]; balance: RawTxnRow[] } | undefined) {
  return {
    taggedAdvance: toPaymentSummary(txns?.advance ?? []),
    balance: toPaymentSummary(txns?.balance ?? []),
  };
}

function orgIdOf(trips: TripRow[]): string | null {
  return trips.find((trip) => trip.organization_id)?.organization_id ?? null;
}

/**
 * Batched read of every input for a set of trips — trip_documents + flags +
 * transactions + entity documents + Asset Vault vehicle JSON + driver KYC.
 * Used for first load and for trips that newly enter the pipeline; targeted
 * writes use the per-input fetchers below instead. `viewerOrgId` is the
 * signed-in org (not a trip's org) — the vault RPC authorizes every trip for it.
 */
export async function fetchComplianceTripInputs(
  trips: TripRow[],
  viewerOrgId: string,
): Promise<ComplianceTripInputs[]> {
  if (trips.length === 0) return [];
  const tripIds = trips.map((t) => t.id);
  const entityIds = trips.flatMap((trip) => [trip.vehicle_id, trip.driver_id].filter((id): id is string => Boolean(id)));
  const [docsByTrip, flagsByTrip, receivedLrsByTrip, ibondTripIds, chargeWorkflow, txnsByTrip, entityDocsById, vault, driverKycDocs] =
    await Promise.all([
      fetchTripDocumentsForTrips(tripIds),
      fetchComplianceTripFlags(tripIds),
      fetchHardCopyReceivedLrNumbers(tripIds),
      fetchHardCopyIbondTripIds(tripIds),
      fetchPodChargeWorkflowFlags(tripIds),
      fetchComplianceTransactions(tripIds),
      fetchEntityDocumentsByIds(orgIdOf(trips), entityIds, ["vehicle", "driver"]),
      fetchVehicleVaultDocumentsForTrips(trips, viewerOrgId),
      fetchDriverKycDocumentsForTrips(trips),
    ]);
  const flagsWithLrs = attachChargesSavedFlags(
    attachIbondFlags(attachReceivedLrNumbers(flagsByTrip, receivedLrsByTrip), ibondTripIds),
    chargeWorkflow,
  );
  return trips.map((trip) => ({
    trip,
    documents: docsByTrip.get(trip.id) ?? [],
    flags: flagsWithLrs.get(trip.id) ?? null,
    ...paymentInputs(txnsByTrip.get(trip.id)),
    ...assembleVehicleDocuments(trip, entityDocsById, vault),
    driverDocuments: assembleDriverDocuments(trip, entityDocsById, driverKycDocs),
  }));
}

/** Pure: one trip's summary from its inputs. No I/O. */
export function summarizeComplianceTrip(inputs: ComplianceTripInputs): ComplianceTripSummary {
  const { trip, documents, flags, taggedAdvance, balance, vehicleDocuments, driverDocuments } = inputs;
  // Finance posts compliance_advance (not Compliance). Once the trip is verified,
  // any tagged advance counts — posting before/after verified_at does not matter.
  // Finance client receipts (trips.amount_paid) never count as the advance.
  // Before verify, a tagged row is kept as advanceBeforeVerification only (stage
  // stays Pending Docs / Compliance Pending; no Advance Processed chip yet).
  const verifiedAt = flags?.compliance_verified_at ?? null;
  const advance = verifiedAt && taggedAdvance ? taggedAdvance : null;
  const advanceBeforeVerification = taggedAdvance && !advance ? taggedAdvance : null;
  // Phase 4: the gate is pod_received_at (the pre-existing, pervasively-used
  // signal), not the courier/AWB/received-by columns — those are display
  // metadata only. See ComplianceTripFlags.pod_received_at.
  const hardCopyReceived = tripPodIsReceived({ pod_received_at: flags?.pod_received_at ?? null });
  const checklist = buildComplianceChecklist({
    tripDocuments: documents,
    vehicleDocuments,
    driverDocuments,
  });

  // Presence and counts come from the classifier: an `empty` row (no file,
  // no typed values, no reference) is not a document.
  const presentDocuments = documents.filter((d) => classifyTripDocument(d).present);
  const documentCounts = {
    total: presentDocuments.length,
    verified: presentDocuments.filter((d) => d.status === "verified").length,
    rejected: presentDocuments.filter((d) => d.status === "rejected").length,
    pending: presentDocuments.filter((d) => d.status === "pending").length,
  };
  const presentRequired = new Set(
    presentDocuments
      .map((d) => d.document_type)
      .filter((type) => REQUIRED_COMPLIANCE_DOCUMENT_TYPES.includes(type)),
  );
  const missingRequiredCount = REQUIRED_COMPLIANCE_DOCUMENT_TYPES.filter(
    (type) => !presentRequired.has(type),
  ).length;
  const hasExpiredRequiredVehicleDocs =
    listExpiredRequiredVehicleDocTypes(vehicleDocuments).length > 0;
  const opsDelivered = isOperationsDeliveredTrip(
    trip,
    documents.some((doc) => isSoftPodDocumentType(doc.document_type)),
  );

  const stage = deriveComplianceStage({
    documentCount: documentCounts.total,
    missingRequiredCount,
    missingRequiredEntityCount: missingRequiredEntityDocumentCount(vehicleDocuments, driverDocuments),
    hasExpiredRequiredVehicleDocs,
    complianceVerifiedAt: flags?.compliance_verified_at ?? null,
    financeVerifiedAt: flags?.finance_verified_at ?? null,
    advance,
    tripStatus: trip.status,
    opsDelivered,
    hardCopyReceived,
    balance,
  });

  const lrReceipt = lrReceiptForTrip(
    documents.flatMap((doc) =>
      (doc.document_type ?? "").toLowerCase() === "lr"
        ? lrNumbersFromDocumentNumber(doc.document_number)
        : [],
    ),
    flags?.received_lr_numbers ?? [],
  );
  // Flags are the live trip columns (and get patched on verify); the list row can be
  // stale or omit them. Payment prerequisites read summary.trip, so keep it in step.
  const tripWithFlags = flags
    ? {
        ...trip,
        compliance_verified_at: flags.compliance_verified_at,
        finance_verified_at: flags.finance_verified_at ?? null,
        finance_flagged_at: flags.finance_flagged_at ?? null,
        pod_received_at: flags.pod_received_at,
      }
    : trip;

  return {
    trip: tripWithFlags,
    stage,
    documents,
    vehicleDocuments,
    driverDocuments,
    documentCounts,
    checklist,
    complianceVerifiedAt: flags?.compliance_verified_at ?? null,
    complianceVerifiedBy: flags?.compliance_verified_by ?? null,
    complianceDecision: flags?.compliance_decision ?? null,
    complianceExceptionReason: flags?.compliance_exception_reason ?? null,
    complianceOutstandingSummary: flags?.compliance_outstanding_summary ?? null,
    complianceDeclinedAt: flags?.compliance_declined_at ?? null,
    complianceDeclinedBy: flags?.compliance_declined_by ?? null,
    complianceDeclineReason: flags?.compliance_decline_reason ?? null,
    complianceRejectReturnTo: flags?.compliance_reject_return_to ?? null,
    complianceResubmittedAt: flags?.compliance_resubmitted_at ?? null,
    complianceResubmitNote: flags?.compliance_resubmit_note ?? null,
    // Finance flag retired (Finance rejects directly since 12 Oct). Ignored in
    // the UI so no badge, note, block or "Flagged by finance" list appears.
    financeFlaggedAt: null,
    financeFlagNote: null,
    financeVerifiedAt: flags?.finance_verified_at ?? null,
    financeVerifiedBy: flags?.finance_verified_by ?? null,
    advance,
    advanceBeforeVerification,
    balance,
    hardCopyPod: {
      received: hardCopyReceived,
      receivedAt: trip.pod_received_at ?? null,
      courier: flags?.pod_hard_copy_courier ?? null,
      awbNumber: flags?.pod_hard_copy_awb_number ?? null,
      receivedBy: flags?.pod_hard_copy_received_by ?? null,
      ibond: flags?.pod_ibond === true,
      ...(flags?.pod_charges_saved ? { chargesSaved: true } : {}),
      ...(flags?.pod_revalidate_requested ? { revalidateRequested: true } : {}),
      ...(flags?.pod_settlement_released ? { settlementReleased: true } : {}),
      ...(flags?.pod_no_debit ? { noDebit: true } : {}),
      ...(flags?.pod_has_debit ? { hasDebit: true } : {}),
      lrNumbers: [...lrReceipt.received, ...lrReceipt.pending],
      receivedLrNumbers: lrReceipt.received,
    },
  };
}

/** Batched inputs → summaries (detail screen, report, tests). */
export async function buildComplianceTripSummaries(
  trips: TripRow[],
  viewerOrgId: string,
): Promise<ComplianceTripSummary[]> {
  return (await fetchComplianceTripInputs(trips, viewerOrgId)).map(summarizeComplianceTrip);
}

/**
 * Vehicle-document inputs for the given trips (entity vehicle docs + vault).
 * Callers pass every trip sharing the changed vehicle so all of them update.
 */
export async function fetchVehicleDocumentsForTrips(
  trips: TripRow[],
  viewerOrgId: string,
): Promise<Map<string, { vehicleDocuments: ComplianceEntityDocument[]; vaultVehicleId: string | null }>> {
  const byTrip = new Map<string, { vehicleDocuments: ComplianceEntityDocument[]; vaultVehicleId: string | null }>();
  if (trips.length === 0) return byTrip;
  const vehicleIds = trips.map((trip) => trip.vehicle_id).filter((id): id is string => Boolean(id));
  const [entityDocsById, vault] = await Promise.all([
    fetchEntityDocumentsByIds(orgIdOf(trips), vehicleIds, ["vehicle"]),
    fetchVehicleVaultDocumentsForTrips(trips, viewerOrgId),
  ]);
  for (const trip of trips) byTrip.set(trip.id, assembleVehicleDocuments(trip, entityDocsById, vault));
  return byTrip;
}

/** Driver-document inputs (KYC + entity driver docs) for every trip passed. */
export async function fetchDriverDocumentsForTrips(
  trips: TripRow[],
): Promise<Map<string, ComplianceEntityDocument[]>> {
  const byTrip = new Map<string, ComplianceEntityDocument[]>();
  if (trips.length === 0) return byTrip;
  const driverIds = trips.map((trip) => trip.driver_id).filter((id): id is string => Boolean(id));
  const [entityDocsById, kyc] = await Promise.all([
    fetchEntityDocumentsByIds(orgIdOf(trips), driverIds, ["driver"]),
    fetchDriverKycDocumentsForTrips(trips),
  ]);
  for (const trip of trips) byTrip.set(trip.id, assembleDriverDocuments(trip, entityDocsById, kyc));
  return byTrip;
}

/**
 * Trip-specific inputs only (documents, flags, compliance transactions) for
 * many trips in 3 batched reads. Vehicle / driver documents are NOT re-read —
 * they are shared inputs refreshed only when a vehicle/driver write happens
 * or a trip's vehicle/driver identity changes.
 */
export async function fetchTripScopedInputs(
  tripIds: string[],
): Promise<Map<string, Pick<ComplianceTripInputs, "documents" | "flags" | "taggedAdvance" | "balance">>> {
  const byTrip = new Map<string, Pick<ComplianceTripInputs, "documents" | "flags" | "taggedAdvance" | "balance">>();
  if (tripIds.length === 0) return byTrip;
  const [docsByTrip, flagsByTrip, receivedLrsByTrip, ibondTripIds, chargeWorkflow, txnsByTrip] = await Promise.all([
    fetchTripDocumentsForTrips(tripIds),
    fetchComplianceTripFlags(tripIds),
    fetchHardCopyReceivedLrNumbers(tripIds),
    fetchHardCopyIbondTripIds(tripIds),
    fetchPodChargeWorkflowFlags(tripIds),
    fetchComplianceTransactions(tripIds),
  ]);
  const flagsWithLrs = attachChargesSavedFlags(
    attachIbondFlags(attachReceivedLrNumbers(flagsByTrip, receivedLrsByTrip), ibondTripIds),
    chargeWorkflow,
  );
  for (const id of tripIds) {
    byTrip.set(id, {
      documents: docsByTrip.get(id) ?? [],
      flags: flagsWithLrs.get(id) ?? null,
      ...paymentInputs(txnsByTrip.get(id)),
    });
  }
  return byTrip;
}

/** A client receipt posted in Finance for a trip (feeds `trips.amount_paid`). */
export type ComplianceFinanceReceipt = CompliancePaymentSummary;

const ADVANCE_LEDGER_SELECT =
  "id, trip_id, amount_in, amount_out, description, transaction_date, created_at, created_by, ledger_category, payment_reference";

/**
 * Live ledger rows behind a trip's advance: the `compliance_advance` posting and
 * the Finance client receipts that feed `trips.amount_paid`. Not org-filtered —
 * the amount_paid trigger sums receipts from every org on the trip, and RLS
 * already scopes what this user may read.
 */
export async function fetchTripAdvanceLedger(tripId: string): Promise<{
  complianceAdvance: CompliancePaymentSummary | null;
  receipts: ComplianceFinanceReceipt[];
}> {
  const { data, error } = await supabase()
    .from("transactions")
    .select(ADVANCE_LEDGER_SELECT)
    .eq("trip_id", tripId)
    // Client receipts are money in; compliance advance / balance are supplier
    // payouts (money out) — match both, not only amount_in.
    .or("amount_in.gt.0,ledger_category.in.(compliance_advance,compliance_balance)")
    .order("transaction_date", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RawTxnRow[];
  const receipts = rows
    .filter((row) => row.ledger_category !== "compliance_advance" && row.ledger_category !== "compliance_balance")
    .map((row) => toPaymentSummary([row]))
    .filter((row): row is ComplianceFinanceReceipt => row != null);
  return {
    complianceAdvance: toPaymentSummary(rows.filter((row) => row.ledger_category === "compliance_advance")),
    receipts,
  };
}

/** Cost-side cash out on a trip — compliance tags plus Finance supplier/driver payouts. */
export async function fetchTripCostLedgerPaid(tripId: string): Promise<{
  taggedAdvance: number;
  taggedBalance: number;
  ledgerCostPaid: number;
}> {
  const empty = { taggedAdvance: 0, taggedBalance: 0, ledgerCostPaid: 0 };
  const id = String(tripId ?? "").trim();
  if (!id) return empty;
  const { data, error } = await supabase()
    .from("transactions")
    .select("amount_out, ledger_category, contact_type")
    .eq("trip_id", id)
    .gt("amount_out", 0);
  if (error) return empty;
  let taggedAdvance = 0;
  let taggedBalance = 0;
  let ledgerCostPaid = 0;
  for (const row of data ?? []) {
    const out = Number((row as { amount_out?: number | null }).amount_out ?? 0);
    if (!Number.isFinite(out) || out <= 0) continue;
    const category = String((row as { ledger_category?: string | null }).ledger_category ?? "");
    const contact = String((row as { contact_type?: string | null }).contact_type ?? "").toLowerCase();
    if (category === "compliance_advance") taggedAdvance += out;
    if (category === "compliance_balance") taggedBalance += out;
    if (
      category === "compliance_advance" ||
      category === "compliance_balance" ||
      contact === "supplier" ||
      contact === "driver"
    ) {
      ledgerCostPaid += out;
    }
  }
  return {
    taggedAdvance: Math.round(taggedAdvance * 100) / 100,
    taggedBalance: Math.round(taggedBalance * 100) / 100,
    ledgerCostPaid: Math.round(ledgerCostPaid * 100) / 100,
  };
}

/** Payment inputs (compliance transactions + `trips.amount_paid`) for one or more trips. */
export async function fetchTripPaymentInputs(
  tripIds: string[],
): Promise<
  Map<string, { taggedAdvance: CompliancePaymentSummary | null; balance: CompliancePaymentSummary | null; tripFields: Pick<TripRow, "amount_paid" | "updated_at"> | null }>
> {
  const byTrip = new Map<
    string,
    { taggedAdvance: CompliancePaymentSummary | null; balance: CompliancePaymentSummary | null; tripFields: Pick<TripRow, "amount_paid" | "updated_at"> | null }
  >();
  if (tripIds.length === 0) return byTrip;
  const [txnsByTrip, fieldsByTrip] = await Promise.all([
    fetchComplianceTransactions(tripIds),
    fetchTripPaymentFields(tripIds),
  ]);
  for (const id of tripIds) {
    byTrip.set(id, { ...paymentInputs(txnsByTrip.get(id)), tripFields: fieldsByTrip.get(id) ?? null });
  }
  return byTrip;
}

/** Whether every Compliance-required document type on a trip is verified. */
export function canMarkComplianceVerified(documents: ComplianceDocumentRow[]): {
  ok: boolean;
  missing: string[];
} {
  const byType = new Map(documents.map((d) => [d.document_type, d]));
  const missing: string[] = [];
  for (const type of REQUIRED_COMPLIANCE_DOCUMENT_TYPES) {
    const doc = byType.get(type);
    if (!doc || doc.status !== "verified") missing.push(type);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Client-side mirror of `approve_trip_compliance_with_exception`'s outstanding
 * capture — for display only. The RPC re-derives this server-side; this is
 * never trusted as authorization, only used to render the confirmation panel.
 */
export function buildComplianceOutstandingSummary(
  documents: ComplianceDocumentRow[],
): ComplianceOutstandingSummary {
  const byType = new Map(documents.map((d) => [d.document_type, d]));
  const missing: string[] = [];
  const pending_verification: string[] = [];
  const rejected: string[] = [];
  for (const type of REQUIRED_COMPLIANCE_DOCUMENT_TYPES) {
    const doc = byType.get(type);
    if (!doc) missing.push(type);
    else if (doc.status === "pending") pending_verification.push(type);
    else if (doc.status === "rejected") rejected.push(type);
  }
  return { missing, pending_verification, rejected };
}

/**
 * A trip is eligible for "Approve with Exception" only while it hasn't been
 * decided yet and at least one required document is outstanding — a fully
 * compliant trip should go through normal `mark_trip_compliance_verified`.
 */
export function canApproveComplianceWithException(input: {
  documents: ComplianceDocumentRow[];
  complianceVerifiedAt: string | null;
}): { ok: boolean; outstanding: ComplianceOutstandingSummary } {
  const outstanding = buildComplianceOutstandingSummary(input.documents);
  const hasOutstanding =
    outstanding.missing.length > 0 || outstanding.pending_verification.length > 0 || outstanding.rejected.length > 0;
  return { ok: hasOutstanding && !input.complianceVerifiedAt, outstanding };
}

export type OrganizationPayoutAccount = {
  id: string;
  /** e.g. "HDFC Bank ••1234" */
  label: string;
};

/**
 * The organisation's own bank accounts (entity_bank_accounts, entity_type
 * "organization"), primary first. Used for the optional "Paid from" choice
 * when posting a compliance payment.
 */
export async function fetchOrganizationPayoutAccounts(
  organizationId: string,
): Promise<OrganizationPayoutAccount[]> {
  if (!organizationId) return [];
  const { data, error } = await supabase()
    .from("entity_bank_accounts")
    .select("id, bank_name, account_number, is_primary")
    .eq("organization_id", organizationId)
    .eq("entity_type", "organization")
    .eq("entity_id", organizationId)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .limit(10);
  if (error || !data) return [];
  return data.map((row) => {
    const r = row as { id: string; bank_name: string | null; account_number: string | null };
    const digits = (r.account_number ?? "").replace(/\s+/g, "");
    const last4 = digits.length >= 4 ? digits.slice(-4) : digits;
    const bank = r.bank_name?.trim() || "Bank account";
    return { id: r.id, label: last4 ? `${bank} ••${last4}` : bank };
  });
}
