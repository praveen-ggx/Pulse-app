import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import { supabase } from "@/lib/supabase";
import type {
  OperationalApprovalState,
  OperationalLedgerState,
  OperationalPaymentMode,
  OperationalPaymentOwner,
  ReimbursementState,
  SaveTollEntryInput,
  TripTollEntry,
} from "../types";
import {
  createVehicleOperationLedgerDraftFromSource,
  syncVehicleOperationLedgerDraftAmountFromSource,
} from "../vehicle/vehicleOperationsLedger.service";
import { appendTripOperationalTimelineEventSafe } from "../timeline/timelineEvents.service";
import { isEmployerExpenseOf } from "../shared/expenseEntryEdit.util";
import { resolvePaymentOwnerForSave } from "../shared/operationsEntryOptions";
import type { UpdateTollEntryInput } from "../types";

function toNullableText(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length ? v : null;
}

export async function getTripTollEntries(
  tripId: string,
  signal?: AbortSignal,
): Promise<{ error: Error | null; entries: TripTollEntry[] }> {
  const query = supabase()
    .from("trip_toll_entries")
    .select("*")
    .eq("trip_id", tripId)
    .eq("status", "active")
    .order("entered_at", { ascending: false });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) return { error: new Error(error.message), entries: [] };
  return { error: null, entries: (data ?? []) as TripTollEntry[] };
}

/** Batched form of getTripTollEntries — one round trip for N trips instead of N. */
export async function getTripTollEntriesForTrips(
  tripIds: string[],
): Promise<{ error: Error | null; entriesByTripId: Record<string, TripTollEntry[]> }> {
  if (tripIds.length === 0) return { error: null, entriesByTripId: {} };
  const { data, error } = await supabase()
    .from("trip_toll_entries")
    .select("*")
    .in("trip_id", tripIds)
    .eq("status", "active")
    .order("entered_at", { ascending: false });
  if (error) return { error: new Error(error.message), entriesByTripId: {} };
  const entriesByTripId: Record<string, TripTollEntry[]> = {};
  for (const entry of (data ?? []) as TripTollEntry[]) {
    (entriesByTripId[entry.trip_id] ??= []).push(entry);
  }
  return { error: null, entriesByTripId };
}

export async function getTripTollEntryById(
  entryId: string,
): Promise<{ error: Error | null; entry: TripTollEntry | null }> {
  const { data, error } = await supabase()
    .from("trip_toll_entries")
    .select("*")
    .eq("id", entryId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return { error: new Error(error.message), entry: null };
  if (!data) return { error: new Error("Toll entry not found"), entry: null };
  return { error: null, entry: data as TripTollEntry };
}

export async function updateTripTollEntry(
  input: UpdateTollEntryInput & { receiptStoragePath?: string | null; ocrJobId?: string | null },
): Promise<{ error: Error | null; entry: TripTollEntry | null }> {
  const existing = await getTripTollEntryById(input.entryId);
  if (existing.error || !existing.entry) {
    return { error: existing.error ?? new Error("Toll entry not found"), entry: null };
  }
  if (String(existing.entry.posting_state ?? "") === "posted") {
    return { error: new Error("Posted toll entries cannot be edited"), entry: null };
  }
  const paymentOwner: OperationalPaymentOwner =
    input.paymentOwner ?? existing.entry.payment_owner ?? "unknown";
  const paymentMode: OperationalPaymentMode =
    input.paymentMode ?? existing.entry.payment_mode ?? "unknown";
  const payload: Record<string, unknown> = {
    amount_inr: Math.max(0, Number(input.amountInr) || 0),
    plaza_name: toNullableText(input.plazaName),
    notes: toNullableText(input.notes),
    is_estimated: input.isEstimated === true,
    payment_owner: paymentOwner,
    payment_mode: paymentMode,
  };
  if (input.receiptStoragePath !== undefined) {
    payload.receipt_storage_path = toNullableText(input.receiptStoragePath);
  }
  if (input.ocrJobId !== undefined) {
    payload.ocr_job_id = input.ocrJobId;
  }
  const { data, error } = await supabase()
    .from("trip_toll_entries")
    .update(payload)
    .eq("id", input.entryId)
    .select("*")
    .single();
  if (error) return { error: new Error(error.message), entry: null };
  const entry = data as TripTollEntry;
  if (isEmployerExpenseOf(entry, null)) {
    const sync = await syncVehicleOperationLedgerDraftAmountFromSource({
      sourceType: "toll",
      sourceId: input.entryId,
      tripId: String(data.trip_id),
      amount: Number(data.amount_inr ?? 0),
      expectedOrganizationId: entry.employer_org_id ?? null,
    });
    if (sync.error) return { error: sync.error, entry: null };
  }
  return { error: null, entry };
}

export async function createTripTollEntry(
  input: Omit<SaveTollEntryInput, "receiptLocalUri"> & {
    receiptStoragePath?: string | null;
    ocrJobId?: string | null;
    /** Offline outbox queue item id — passed through as idempotency_key so a sync retry/replay is a safe no-op. */
    queueItemId?: string | null;
  },
): Promise<{ error: Error | null; entry: TripTollEntry | null; alreadyExists?: boolean }> {
  const paymentOwner = resolvePaymentOwnerForSave(input);
  const paymentMode: OperationalPaymentMode =
    input.paymentMode ?? (input.actorRole === "driver" ? "cash" : "unknown");
  const approvalState: OperationalApprovalState =
    input.actorRole === "driver" ? "reported" : "review_pending";
  const payload = {
    trip_id: input.tripId,
    amount_inr: Math.max(0, Number(input.amountInr) || 0),
    plaza_name: toNullableText(input.plazaName),
    notes: toNullableText(input.notes),
    is_estimated: input.isEstimated === true,
    receipt_storage_path: toNullableText(input.receiptStoragePath),
    ocr_job_id: input.ocrJobId ?? null,
    entered_by: input.enteredBy,
    entered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: "manual",
    status: "active",
    payment_owner: paymentOwner,
    payment_mode: paymentMode,
    approval_state: approvalState,
    ledger_state: "not_posted" as OperationalLedgerState,
    posting_state: "pending",
    posting_error: null,
    retry_count: 0,
    last_retry_at: null,
    reimbursement_state: (paymentOwner === "driver" ? "reported" : "approved") as ReimbursementState,
    reimbursement_updated_at: new Date().toISOString(),
    reimbursed_at: null,
    reimbursed_by: null,
    reimbursement_notes: null,
    approved_by: null,
    approved_at: null,
    idempotency_key: input.queueItemId ?? null,
  };
  const { data, error, status } = await supabase()
    .from("trip_toll_entries")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    // Postgres unique violation = this queue item was already synced -> safe no-op
    if (error.code === "23505" && input.queueItemId) {
      return { error: null, entry: null, alreadyExists: true };
    }
    // Keep code + status: the save path decides from them whether to queue offline.
    return { error: Object.assign(new Error(error.message), { code: error.code, status }), entry: null };
  }
  const entry = data as TripTollEntry;
  if (isEmployerExpenseOf(entry, null)) {
    await createVehicleOperationLedgerDraftFromSource({
      sourceType: "toll",
      sourceId: String(data.id),
      tripId: String(data.trip_id),
      amount: Number(data.amount_inr ?? 0),
      entryType: "expense",
      expectedOrganizationId: entry.employer_org_id ?? null,
    });
  }
  await appendTripOperationalTimelineEventSafe({
    tripId: String(data.trip_id),
    eventType: "toll_logged",
    sourceType: "toll",
    sourceId: String(data.id),
    actorUserId: data.entered_by ?? null,
    payload: {
      amountInr: Number(data.amount_inr ?? 0),
      paymentOwner,
      paymentMode,
      estimated: data.is_estimated === true,
    },
  });
  return { error: null, entry: data as TripTollEntry };
}

export async function updateTripTollApprovalState(input: {
  entryId: string;
  approvalState: OperationalApprovalState;
  approvedBy?: string | null;
  ledgerState?: OperationalLedgerState;
  rejectionReason?: string | null;
}): Promise<{ error: Error | null; entry: TripTollEntry | null }> {
  const payload: Record<string, unknown> = {
    approval_state: input.approvalState,
  };
  if (input.ledgerState) payload.ledger_state = input.ledgerState;
  if (input.approvalState === "rejected") {
    payload.rejection_reason = input.rejectionReason?.trim() || null;
  }
  if (input.approvalState === "approved" || input.approvalState === "settled") {
    payload.posting_state = "approved";
    payload.posting_error = null;
  } else if (input.approvalState === "rejected") {
    payload.posting_state = "rejected";
  } else {
    payload.posting_state = "pending";
  }
  if (input.approvalState === "approved" || input.approvalState === "settled") {
    payload.approved_by = input.approvedBy ?? null;
    payload.approved_at = new Date().toISOString();
  } else {
    payload.approved_by = null;
    payload.approved_at = null;
  }
  const { data, error } = await supabase()
    .from("trip_toll_entries")
    .update(payload)
    .eq("id", input.entryId)
    .select("*")
    .single();
  if (error) return { error: new Error(error.message), entry: null };
  const reimbursementState: ReimbursementState =
    input.approvalState === "rejected"
      ? "rejected"
      : (data as { payment_owner?: string | null }).payment_owner === "driver"
        ? "reimbursement_pending"
        : "approved";
  await supabase()
    .from("trip_toll_entries")
    .update({
      reimbursement_state: reimbursementState,
      reimbursement_updated_at: new Date().toISOString(),
    })
    .eq("id", input.entryId);
  await appendTripOperationalTimelineEventSafe({
    tripId: String(data.trip_id),
    eventType: "approval_changed",
    sourceType: "toll",
    sourceId: String(data.id),
    actorUserId: input.approvedBy ?? null,
    payload: {
      approvalState: input.approvalState,
      ledgerState: input.ledgerState ?? null,
      postingState: (data as { posting_state?: string | null }).posting_state ?? null,
    },
  });
  return { error: null, entry: data as TripTollEntry };
}

export async function uploadTollReceiptPhoto(params: {
  tripId: string;
  userId: string;
  arrayBuffer: ArrayBuffer;
  fileName: string;
}): Promise<{ error: Error | null; storagePath: string | null }> {
  const res = await tripDocumentsService.uploadTripDocument(
    params.tripId,
    params.userId,
    {
      arrayBuffer: params.arrayBuffer,
      fileName: params.fileName,
      mimeType: "image/jpeg",
    },
    "toll_receipt_photo",
  );
  if (res.error || !res.doc) return { error: res.error, storagePath: null };
  return { error: null, storagePath: res.doc.storage_path };
}
