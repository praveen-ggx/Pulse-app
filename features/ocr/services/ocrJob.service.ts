import { supabase } from "@/lib/supabase";

import type { ExpenseOcrKind, OcrJobRow, OcrMetricsSummary } from "@/features/ocr/types/ocr.types";

const EXPENSE_OCR_TABLE: Record<ExpenseOcrKind, "trip_fuel_entries" | "trip_toll_entries" | "trip_other_expenses"> = {
  fuel: "trip_fuel_entries",
  toll: "trip_toll_entries",
  other: "trip_other_expenses",
};

function mapJob(row: Record<string, unknown>): OcrJobRow {
  return row as unknown as OcrJobRow;
}

export async function getOcrJobForPodAttachment(
  podAttachmentId: string,
): Promise<OcrJobRow | null> {
  const { data, error } = await supabase()
    .from("ocr_jobs")
    .select("*")
    .eq("pod_attachment_id", podAttachmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapJob(data) : null;
}

export async function getOcrJobById(jobId: string): Promise<OcrJobRow | null> {
  const { data, error } = await supabase()
    .from("ocr_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapJob(data) : null;
}

export async function getOcrJobForTripDocument(
  tripDocumentId: string,
): Promise<OcrJobRow | null> {
  const { data, error } = await supabase()
    .from("ocr_jobs")
    .select("*")
    .eq("trip_document_id", tripDocumentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapJob(data) : null;
}

export async function getCompletedOcrJobByFingerprint(
  fingerprint: string,
  engineVersion: string,
): Promise<OcrJobRow | null> {
  const { data, error } = await supabase()
    .from("ocr_jobs")
    .select("*")
    .eq("document_fingerprint", fingerprint)
    .eq("engine_version", engineVersion)
    .eq("status", "completed")
    .eq("force_rescan", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapJob(data) : null;
}

export async function createOcrJobRow(
  input: Omit<OcrJobRow, "id" | "created_at" | "updated_at"> & { id?: string },
): Promise<OcrJobRow> {
  const { data, error } = await supabase()
    .from("ocr_jobs")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapJob(data);
}

export async function claimOcrJob(jobId: string): Promise<OcrJobRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase()
    .from("ocr_jobs")
    .update({
      status: "processing",
      processing_started_at: now,
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapJob(data) : null;
}

export async function completeOcrJob(
  jobId: string,
  patch: {
    ocr_model: string | null;
    confidence_score: number | null;
    result_json: Record<string, unknown>;
    raw_model_json?: Record<string, unknown> | null;
    processing_duration_ms: number;
  },
): Promise<OcrJobRow> {
  const now = new Date().toISOString();
  const completedPatch = {
    status: "completed" as const,
    ocr_model: patch.ocr_model,
    confidence_score: patch.confidence_score,
    result_json: patch.result_json,
    raw_model_json: patch.raw_model_json ?? null,
    processing_duration_ms: patch.processing_duration_ms,
    processing_completed_at: now,
    error_message: null,
  };
  const { data, error } = await supabase()
    .from("ocr_jobs")
    .update(completedPatch)
    .eq("id", jobId)
    .select("*")
    .single();
  if (error && isOcrCompletedFingerprintConflict(error)) {
    // The same photo already has a completed scan that this user can't see
    // (or two scans finished together). The unique index allows one completed
    // row per photo, so the scan "failed" with "duplicate key value violates
    // ocr_jobs_fingerprint_engine_completed_uidx" and the reading was lost.
    // Keep this scan's result: save it outside the dedupe slot.
    const retry = await supabase()
      .from("ocr_jobs")
      .update({ ...completedPatch, force_rescan: true })
      .eq("id", jobId)
      .select("*")
      .single();
    if (retry.error) throw new Error(retry.error.message);
    return mapJob(retry.data);
  }
  if (error) throw new Error(error.message);
  return mapJob(data);
}

/** Unique violation on the "one completed scan per photo" index. */
function isOcrCompletedFingerprintConflict(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" ||
    /ocr_jobs_fingerprint_engine_completed_uidx|duplicate key value/i.test(error.message ?? "")
  );
}

export async function failOcrJob(jobId: string, message: string): Promise<OcrJobRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabase()
    .from("ocr_jobs")
    .update({
      status: "failed",
      error_message: message,
      processing_completed_at: now,
    })
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapJob(data);
}

export async function linkTripDocumentOcrJob(
  tripDocumentId: string,
  ocrJobId: string,
): Promise<void> {
  const { error } = await supabase()
    .from("trip_documents")
    .update({ ocr_job_id: ocrJobId })
    .eq("id", tripDocumentId);
  if (error) throw new Error(error.message);
}

export async function listOcrJobsForTripDocuments(
  tripDocumentIds: string[],
): Promise<OcrJobRow[]> {
  const ids = tripDocumentIds.filter(Boolean);
  if (ids.length === 0) return [];
  const { data, error } = await supabase()
    .from("ocr_jobs")
    .select("*")
    .in("trip_document_id", ids)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapJob(row as Record<string, unknown>));
}

export async function linkExpenseEntryOcrJob(
  expenseKind: ExpenseOcrKind,
  entryId: string,
  ocrJobId: string | null,
): Promise<void> {
  const table = EXPENSE_OCR_TABLE[expenseKind];
  const { error } = await supabase()
    .from(table)
    .update({ ocr_job_id: ocrJobId })
    .eq("id", entryId);
  if (error) throw new Error(error.message);
}

export async function createDuplicateOcrJob(
  source: OcrJobRow,
  input: {
    organization_id: string;
    document_fingerprint: string;
    source_kind: OcrJobRow["source_kind"];
    source_subtype?: string | null;
    trip_id?: string | null;
    trip_document_id?: string | null;
    pod_attachment_id?: string | null;
    storage_path?: string | null;
    created_by?: string | null;
  },
): Promise<OcrJobRow> {
  try {
    return await insertDuplicateOcrJobRow(source, input);
  } catch (e) {
    // The source scan already holds the single "completed" slot for this photo
    // (ocr_jobs_fingerprint_engine_completed_uidx), so a completed duplicate
    // row can never be inserted. Reuse the source scan's result instead of
    // showing the driver a "duplicate key" error.
    if (e instanceof Error && isOcrCompletedFingerprintConflict(e)) return source;
    throw e;
  }
}

async function insertDuplicateOcrJobRow(
  source: OcrJobRow,
  input: Parameters<typeof createDuplicateOcrJob>[1],
): Promise<OcrJobRow> {
  return createOcrJobRow({
    organization_id: input.organization_id,
    document_fingerprint: input.document_fingerprint,
    source_kind: input.source_kind,
    source_subtype: input.source_subtype ?? source.source_subtype,
    trip_id: input.trip_id ?? source.trip_id,
    trip_document_id: input.trip_document_id ?? null,
    pod_attachment_id: input.pod_attachment_id ?? null,
    storage_path: input.storage_path ?? source.storage_path,
    status: "completed",
    engine_name: source.engine_name,
    engine_version: source.engine_version,
    prompt_version: source.prompt_version,
    ocr_model: source.ocr_model,
    confidence_score: source.confidence_score,
    result_json: source.result_json,
    raw_model_json: source.raw_model_json,
    error_message: null,
    is_duplicate: true,
    duplicate_of_job_id: source.id,
    force_rescan: false,
    processing_started_at: source.processing_started_at,
    processing_completed_at: source.processing_completed_at,
    processing_duration_ms: 0,
    created_by: input.created_by ?? source.created_by,
  });
}

export async function getOcrMetrics(
  organizationId: string,
  days = 30,
): Promise<OcrMetricsSummary> {
  const { data, error } = await supabase().rpc("get_ocr_metrics", {
    p_org_id: organizationId,
    p_days: days,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    jobs_today: Number(row?.jobs_today ?? 0),
    jobs_this_month: Number(row?.jobs_this_month ?? 0),
    jobs_in_window: Number(row?.jobs_in_window ?? 0),
    avg_duration_ms:
      row?.avg_duration_ms != null ? Number(row.avg_duration_ms) : null,
    avg_confidence:
      row?.avg_confidence != null ? Number(row.avg_confidence) : null,
    failed_count: Number(row?.failed_count ?? 0),
    duplicate_count: Number(row?.duplicate_count ?? 0),
    quota_used: Number(row?.quota_used ?? 0),
    quota_limit: row?.quota_limit != null ? Number(row.quota_limit) : null,
    quota_remaining:
      row?.quota_remaining != null ? Number(row.quota_remaining) : null,
    quota_tier: String(row?.quota_tier ?? "pulse_core"),
  };
}
