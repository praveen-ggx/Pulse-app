/**
 * Batch history and confirmation. The browser submits a file and then asks the
 * database to apply one stored row at a time. It never writes payments or
 * audit events itself.
 */
import { supabase } from "@/lib/supabase";
import type { BatchStatus, BulkPreviewRow } from "@/features/bulkOperations/utils/bulkOperation.model";
import type { PaymentUpdateField } from "@/features/tripCompliance/paymentBulk/compliancePaymentField.adapter";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";

type LooseError = { message?: string; code?: string } | null;
type RpcResult = { data: Record<string, unknown> | null; error: LooseError };

type QueryResult = { data: unknown; error: LooseError };
type QueryChain = PromiseLike<QueryResult> & {
  select: (columns: string) => QueryChain;
  eq: (column: string, value: string) => QueryChain;
  order: (column: string, options: { ascending: boolean }) => QueryChain;
  limit: (count: number) => QueryChain;
  or: (filters: string) => QueryChain;
};

function table(name: string): QueryChain {
  return (supabase() as unknown as { from: (table: string) => QueryChain }).from(name);
}

function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  return (supabase() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  }).rpc(name, args);
}

export function isMissingBulkLedger(error: LooseError): boolean {
  const message = (error?.message ?? "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    error?.code === "PGRST205" ||
    message.includes("bulk_operation_") ||
    message.includes("bulk_payment_field_") ||
    message.includes("schema cache")
  );
}

export const BULK_LEDGER_PENDING_MESSAGE =
  "Bulk confirmation is disabled until migration 20271118161500 is applied. No payment was changed.";

function asError(error: LooseError, fallback: string): Error {
  if (isMissingBulkLedger(error)) return new Error(BULK_LEDGER_PENDING_MESSAGE);
  return new Error(error?.message ?? fallback);
}

export type StoredBatch = {
  id: string;
  file_name: string;
  status: BatchStatus;
  created_at: string;
  execution_started_at: string | null;
  summary: Record<string, unknown>;
  field_selection: string[];
  adapter_id: string;
  confirmed_by: string | null;
  uploaded_by: string | null;
  file_sha256: string | null;
  execution_owner: string | null;
};

export async function listBulkBatches(params: {
  organizationId: string;
  adapterId: string;
  limit?: number;
  before?: { createdAt: string; id: string } | null;
}): Promise<{ batches: StoredBatch[]; error: Error | null }> {
  let query = table("bulk_operation_batches")
    .select("id, file_name, status, created_at, execution_started_at, summary, field_selection, adapter_id, confirmed_by, uploaded_by, file_sha256, execution_owner")
    .eq("organization_id", params.organizationId)
    .eq("adapter_id", params.adapterId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(params.limit ?? 30);
  if (params.before) {
    query = query.or(
      `created_at.lt.${params.before.createdAt},and(created_at.eq.${params.before.createdAt},id.lt.${params.before.id})`,
    );
  }
  const { data, error } = await query;
  if (error) return { batches: [], error: asError(error, "Couldn't load bulk history.") };
  return { batches: (data ?? []) as StoredBatch[], error: null };
}

export async function loadBulkBatchDetail(batchId: string): Promise<{
  rows: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  error: Error | null;
}> {
  const [rows, events] = await Promise.all([
    table("bulk_operation_rows").select("*").eq("batch_id", batchId).order("row_index", { ascending: true }),
    table("bulk_operation_events").select("*").eq("batch_id", batchId).order("created_at", { ascending: true }),
  ]);
  if (rows.error || events.error) {
    const error = rows.error ?? events.error;
    return { rows: [], events: [], error: asError(error, "Couldn't load this batch.") };
  }
  const rowData = Array.isArray(rows.data) ? rows.data as Array<Record<string, unknown>> : [];
  const eventData = Array.isArray(events.data) ? events.data as Array<Record<string, unknown>> : [];
  return { rows: rowData, events: eventData, error: null };
}

export async function confirmPaymentFieldBatch(params: {
  organizationId: string;
  category: ComplianceLedgerCategory;
  fileName: string;
  fileText: string;
  mapping: Record<string, string | null>;
  selection: readonly PaymentUpdateField[];
  rows: BulkPreviewRow[];
}): Promise<{ batchId: string | null; status: BatchStatus | null; replayed: boolean; error: Error | null }> {
  const submitted = await rpc("bulk_payment_field_submit", {
    p_organization_id: params.organizationId,
    p_category: params.category,
    p_file_name: params.fileName,
    p_file_text: params.fileText,
    p_mapping: params.mapping,
    p_selection: params.selection,
    p_rows: params.rows.map((row) => ({
      rowIndex: row.rowIndex,
      recordId: row.recordId,
      proposed: {
        utr: row.proposed.utr ?? "",
        requestId: row.proposed.requestId ?? "",
        transactionDate: row.proposed.transactionDate ?? "",
      },
    })),
  });
  if (submitted.error) {
    return { batchId: null, status: null, replayed: false, error: asError(submitted.error, "Couldn't confirm this file.") };
  }
  const body = submitted.data ?? {};
  const batchId = typeof body.batchId === "string" ? body.batchId : null;
  const status = (body.status as BatchStatus | undefined) ?? null;
  if (body.replayed === true) {
    return { batchId, status, replayed: true, error: null };
  }
  if (body.inProgress === true) {
    return { batchId, status, replayed: false, error: new Error("This file is already being updated.") };
  }
  if (!batchId) {
    return { batchId: null, status, replayed: false, error: new Error("Couldn't confirm this file.") };
  }
  if (status && status !== "executing") {
    return { batchId, status, replayed: false, error: null };
  }

  const seen = new Set<string>();
  for (;;) {
    const step = await rpc("bulk_payment_field_apply_next", { p_batch_id: batchId });
    if (step.error) {
      return { batchId, status: "executing", replayed: false, error: asError(step.error, "Couldn't apply the next row.") };
    }
    const result = step.data ?? {};
    if (result.done === true) {
      return {
        batchId,
        status: (result.batchStatus as BatchStatus | undefined) ?? status,
        replayed: result.replayed === true,
        error: null,
      };
    }
    const rowId = typeof result.rowId === "string" ? result.rowId : "";
    if (!rowId || seen.has(rowId)) {
      return { batchId, status: "executing", replayed: false, error: new Error("Execution did not advance. No payment was retried.") };
    }
    seen.add(rowId);
  }
}

export async function correctPaymentField(params: {
  batchId: string;
  rowId: string;
  field: PaymentUpdateField;
  value: string;
  correctsEventId: string;
}): Promise<{ error: Error | null }> {
  const { error } = await rpc("bulk_payment_field_correct", {
    p_batch_id: params.batchId,
    p_row_id: params.rowId,
    p_field: params.field,
    p_value: params.value,
    p_corrects_event_id: params.correctsEventId,
  });
  return { error: error ? asError(error, "Couldn't save the correction.") : null };
}
