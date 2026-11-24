import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import { supabase } from "@/lib/supabase";
import type {
  OperationalApprovalState,
  OperationalLedgerState,
  OperationalPaymentMode,
  OperationalPaymentOwner,
  ReimbursementState,
  SaveOtherExpenseInput,
  TripOtherExpenseEntry,
} from "../types";
import {
  createVehicleOperationLedgerDraftFromSource,
  syncVehicleOperationLedgerDraftAmountFromSource,
  updateVehicleOperationLedgerApprovalState,
} from "../vehicle/vehicleOperationsLedger.service";
import { appendTripOperationalTimelineEventSafe } from "../timeline/timelineEvents.service";
import { isEmployerExpenseOf } from "../shared/expenseEntryEdit.util";
import { resolvePaymentOwnerForSave } from "../shared/operationsEntryOptions";
import type { UpdateOtherExpenseInput } from "../types";

async function syncOtherExpenseLedgerDraft(input: {
  entryId: string;
  approvalState: OperationalApprovalState;
  approvedBy?: string | null;
}) {
  const { data } = await supabase()
    .from("vehicle_operation_ledger_entries")
    .select("id")
    .eq("source_type", "manual_adjustment")
    .eq("source_id", input.entryId)
    .maybeSingle();
  const ledgerId = String((data as { id?: string | null } | null)?.id ?? "").trim();
  if (!ledgerId) return;
  const ledgerApproval =
    input.approvalState === "approved" || input.approvalState === "settled"
      ? "approved"
      : input.approvalState === "rejected"
        ? "ignored"
        : "draft";
  await updateVehicleOperationLedgerApprovalState({
    entryId: ledgerId,
    approvalState: ledgerApproval,
    approvedBy: input.approvedBy ?? null,
  });
}

function toNullableText(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length ? v : null;
}

export async function getTripOtherExpenses(
  tripId: string,
  signal?: AbortSignal,
): Promise<{ error: Error | null; entries: TripOtherExpenseEntry[] }> {
  const query = supabase()
    .from("trip_other_expenses")
    .select("*")
    .eq("trip_id", tripId)
    .eq("status", "active")
    .order("entered_at", { ascending: false });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) return { error: new Error(error.message), entries: [] };
  return { error: null, entries: (data ?? []) as TripOtherExpenseEntry[] };
}

export async function getTripOtherExpenseById(
  entryId: string,
): Promise<{ error: Error | null; entry: TripOtherExpenseEntry | null }> {
  const { data, error } = await supabase()
    .from("trip_other_expenses")
    .select("*")
    .eq("id", entryId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return { error: new Error(error.message), entry: null };
  if (!data) return { error: new Error("Expense not found"), entry: null };
  return { error: null, entry: data as TripOtherExpenseEntry };
}

export async function updateTripOtherExpense(
  input: UpdateOtherExpenseInput & { receiptStoragePath?: string | null; ocrJobId?: string | null },
): Promise<{ error: Error | null; entry: TripOtherExpenseEntry | null }> {
  const existing = await getTripOtherExpenseById(input.entryId);
  if (existing.error || !existing.entry) {
    return { error: existing.error ?? new Error("Expense not found"), entry: null };
  }
  if (String(existing.entry.posting_state ?? "") === "posted") {
    return { error: new Error("Posted expenses cannot be edited"), entry: null };
  }
  const paymentOwner: OperationalPaymentOwner =
    input.paymentOwner ?? existing.entry.payment_owner ?? "unknown";
  const paymentMode: OperationalPaymentMode =
    input.paymentMode ?? existing.entry.payment_mode ?? "unknown";
  const payload: Record<string, unknown> = {
    expense_category: input.expenseCategory,
    amount_inr: Math.max(0, Number(input.amountInr) || 0),
    description: toNullableText(input.description),
    location_name: toNullableText(input.locationName),
    notes: toNullableText(input.notes),
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
    .from("trip_other_expenses")
    .update(payload)
    .eq("id", input.entryId)
    .select("*")
    .single();
  if (error) return { error: new Error(error.message), entry: null };
  const entry = data as TripOtherExpenseEntry;
  if (isEmployerExpenseOf(entry, null)) {
    const sync = await syncVehicleOperationLedgerDraftAmountFromSource({
      sourceType: "manual_adjustment",
      sourceId: input.entryId,
      tripId: String(data.trip_id),
      amount: Number(data.amount_inr ?? 0),
      expectedOrganizationId: entry.employer_org_id ?? null,
    });
    if (sync.error) return { error: sync.error, entry: null };
  }
  return { error: null, entry };
}

export async function createTripOtherExpense(
  input: Omit<SaveOtherExpenseInput, "receiptLocalUri"> & {
    receiptStoragePath?: string | null;
    ocrJobId?: string | null;
  },
): Promise<{ error: Error | null; entry: TripOtherExpenseEntry | null }> {
  const paymentOwner = resolvePaymentOwnerForSave(input);
  const paymentMode: OperationalPaymentMode =
    input.paymentMode ?? (input.actorRole === "driver" ? "cash" : "unknown");
  const approvalState: OperationalApprovalState =
    input.actorRole === "driver" ? "reported" : "review_pending";
  const payload = {
    trip_id: input.tripId,
    expense_category: input.expenseCategory,
    amount_inr: Math.max(0, Number(input.amountInr) || 0),
    description: toNullableText(input.description),
    location_name: toNullableText(input.locationName),
    notes: toNullableText(input.notes),
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
  };
  const idempotencyKey = toNullableText(input.idempotencyKey);
  const insertRow = (row: typeof payload) =>
    supabase().from("trip_other_expenses").insert(row).select("*").single();
  // idempotency_key is added by 20271117120400 (not in generated types yet).
  const firstTry = await insertRow(
    (idempotencyKey ? { ...payload, idempotency_key: idempotencyKey } : payload) as typeof payload,
  );
  let result = firstTry;
  // Column not added yet (migration not applied): save the way it worked before.
  if (
    firstTry.error &&
    idempotencyKey &&
    /idempotency_key|PGRST204/i.test(`${firstTry.error.code ?? ""} ${firstTry.error.message ?? ""}`)
  ) {
    result = await insertRow(payload);
  }
  // Same save already went through (network retry): return that row, don't add another.
  if (result.error && result.error.code === "23505" && idempotencyKey) {
    const { data: existing } = await supabase()
      .from("trip_other_expenses")
      .select("*")
      .eq("idempotency_key" as never, idempotencyKey as never)
      .maybeSingle();
    if (existing) return { error: null, entry: existing as TripOtherExpenseEntry };
  }
  if (result.error || !result.data) {
    return { error: new Error(result.error?.message ?? "Could not save expense"), entry: null };
  }
  const data = result.data;
  const entry = data as TripOtherExpenseEntry;
  if (isEmployerExpenseOf(entry, null)) {
    await createVehicleOperationLedgerDraftFromSource({
      sourceType: "manual_adjustment",
      sourceId: String(data.id),
      tripId: String(data.trip_id),
      amount: Number(data.amount_inr ?? 0),
      entryType: "expense",
      expectedOrganizationId: entry.employer_org_id ?? null,
    });
  }
  await appendTripOperationalTimelineEventSafe({
    organizationId: String((data as { organization_id?: string | null }).organization_id ?? ""),
    tripId: String(data.trip_id),
    eventType: "other_expense_logged",
    sourceType: "trip_expense",
    sourceId: String(data.id),
    actorUserId: data.entered_by ?? null,
    payload: {
      amountInr: Number(data.amount_inr ?? 0),
      category: data.expense_category,
      paymentOwner,
      paymentMode,
    },
  });
  return { error: null, entry: data as TripOtherExpenseEntry };
}

export async function updateTripOtherExpenseApprovalState(input: {
  entryId: string;
  approvalState: OperationalApprovalState;
  approvedBy?: string | null;
  ledgerState?: OperationalLedgerState;
  rejectionReason?: string | null;
}): Promise<{ error: Error | null; entry: TripOtherExpenseEntry | null }> {
  const payload: Record<string, unknown> = {
    approval_state: input.approvalState,
    updated_at: new Date().toISOString(),
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
    .from("trip_other_expenses")
    .update(payload)
    .eq("id", input.entryId)
    .select("*")
    .single();
  if (error) return { error: new Error(error.message), entry: null };
  if (input.approvalState === "approved" || input.approvalState === "settled") {
    await syncOtherExpenseLedgerDraft({
      entryId: input.entryId,
      approvalState: input.approvalState,
      approvedBy: input.approvedBy,
    });
  }
  const reimbursementState: ReimbursementState =
    input.approvalState === "rejected"
      ? "rejected"
      : (data as { payment_owner?: string | null }).payment_owner === "driver"
        ? "reimbursement_pending"
        : "approved";
  await supabase()
    .from("trip_other_expenses")
    .update({
      reimbursement_state: reimbursementState,
      reimbursement_updated_at: new Date().toISOString(),
    })
    .eq("id", input.entryId);
  await appendTripOperationalTimelineEventSafe({
    organizationId: String((data as { organization_id?: string | null }).organization_id ?? ""),
    tripId: String(data.trip_id),
    eventType: "approval_changed",
    sourceType: "trip_expense",
    sourceId: String(data.id),
    actorUserId: input.approvedBy ?? null,
    payload: {
      approvalState: input.approvalState,
      category: (data as { expense_category?: string }).expense_category,
    },
  });
  return { error: null, entry: data as TripOtherExpenseEntry };
}

export async function uploadOtherExpenseReceiptPhoto(params: {
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
    "trip_expense_receipt_photo",
  );
  if (res.error || !res.doc) return { error: res.error, storagePath: null };
  return { error: null, storagePath: res.doc.storage_path };
}
