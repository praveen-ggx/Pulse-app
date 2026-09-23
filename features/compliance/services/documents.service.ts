/**
 * Compliance & Document Intelligence — service layer.
 *
 * Backed by the polymorphic `public.entity_documents` table
 * (`20260827200000_document_compliance.sql` +
 * `20260828010000_compliance_documents_fix_and_extend.sql`) and the
 * private `compliance-documents` storage bucket
 * (`20260828000000_compliance_documents_storage_bucket.sql`).
 *
 * Surface:
 *   • CRUD on documents (per-entity + per-org listing)
 *   • Upload / replace / signed-URL / delete on storage
 *   • Audit-log access (table is auto-populated by a trigger, but the
 *     service still records `downloaded` events explicitly)
 *   • RPC wrappers: get_compliance_summary, get_expiring_documents,
 *     compute_compliance_score, is_compliance_blocking
 *
 * All file operations:
 *   - validate MIME + size before touching the bucket
 *   - retry transient network errors (250 / 800 / 1800 ms backoff)
 *   - cache signed URLs (TTL = `SIGNED_URL_EXPIRY_SEC - 120`) to avoid
 *     hammering Supabase for the same doc when a list re-renders
 *   - roll back the storage object if the DB row insert fails (no
 *     orphan files in the bucket)
 *
 * Naming: this file keeps the original three function names
 * (`getDocumentsByEntity`, `getComplianceSummary`, `getExpiringDocuments`)
 * exported so existing call sites don't break; everything else is new.
 */

import { supabase } from "@/lib/supabase";
import type {
  ComplianceBlockResult,
  ComplianceScore,
  DocumentAuditAction,
  DocumentAuditEntry,
  EntityType,
} from "../types/compliance.types";

// ── Row contracts ───────────────────────────────────────────────────────────

export interface DocumentRow {
  id: string;
  organization_id: string;
  entity_type: EntityType;
  entity_id: string;
  doc_type: string;
  doc_label: string | null;
  doc_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  issued_by: string | null;
  status:
    | "active"
    | "expired"
    | "pending"
    | "verified"
    | "rejected"
    | "replaced";
  storage_path: string | null;
  notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  replaced_by_id?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceSummaryRow {
  entity_type: string;
  total_docs: number;
  active_docs: number;
  expired_docs: number;
  expiring_7d: number;
  expiring_30d: number;
  pending_docs: number;
  verified_docs: number;
}

export interface ExpiringDocRow {
  id: string;
  entity_type: string;
  entity_id: string;
  doc_type: string;
  doc_label: string | null;
  doc_number: string | null;
  expiry_date: string;
  days_until: number;
  status: string;
}

// ── Storage constants ──────────────────────────────────────────────────────

export const COMPLIANCE_BUCKET = "compliance-documents";

const SIGNED_URL_EXPIRY_SEC = 3600;
const SIGNED_URL_CACHE_TTL_MS = (SIGNED_URL_EXPIRY_SEC - 120) * 1000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const STORAGE_RETRY_DELAYS_MS = [250, 800, 1800] as const;

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

type SignedUrlCacheEntry = { url: string; expiresAtMs: number };
const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

// ── Internals ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("connection") ||
    m.includes("network") ||
    m.includes("fetch failed") ||
    m.includes("gateway")
  );
}

async function runWithRetry<T>(
  op: () => Promise<T>,
  classify: (value: T) => string | null,
): Promise<T> {
  let last: T | null = null;
  for (let i = 0; i < STORAGE_RETRY_DELAYS_MS.length + 1; i += 1) {
    const result = await op();
    last = result;
    const err = classify(result);
    if (!err || !isTransient(err)) return result;
    if (i < STORAGE_RETRY_DELAYS_MS.length) {
      await sleep(STORAGE_RETRY_DELAYS_MS[i]);
    }
  }
  return last as T;
}

function extOfFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "bin";
  return name.slice(dot + 1).toLowerCase();
}

function uuidLike(): string {
  // Lightweight client-side id — collisions are astronomically unlikely for
  // per-doc filenames and the underlying row PK is still server-generated.
  const r = () => Math.random().toString(16).slice(2);
  return `${Date.now().toString(16)}-${r()}-${r()}`.slice(0, 32);
}

function buildStoragePath(input: {
  orgId: string;
  entityType: EntityType;
  entityId: string;
  docType: string;
  ext: string;
}): string {
  return `${input.orgId}/${input.entityType}/${input.entityId}/${input.docType}_${uuidLike()}.${input.ext}`;
}

// ── Validation ─────────────────────────────────────────────────────────────

export function validateComplianceFile(file: {
  arrayBuffer: ArrayBuffer;
  mimeType: string;
}): string | null {
  if (file.arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    return `File is too large (max ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB).`;
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimeType.toLowerCase())) {
    return "Unsupported file type. Use JPG, PNG, WEBP, HEIC, or PDF.";
  }
  return null;
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getDocumentsByEntity(
  orgId: string,
  entityType: EntityType,
  entityId: string,
  signal?: AbortSignal,
): Promise<{ error: Error | null; documents: DocumentRow[] }> {
  const query = supabase()
    .from("entity_documents")
    .select("*")
    .eq("organization_id", orgId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .neq("status", "replaced")
    .order("expiry_date", { ascending: true, nullsFirst: false });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);

  return {
    error: (error as Error | null) ?? null,
    documents: (data ?? []) as DocumentRow[],
  };
}

/**
 * Batched entity-document read for a page of vehicles/drivers — one query,
 * not one round-trip per card. Used by the Compliance work queue.
 */
export async function getDocumentsForEntities(
  orgId: string,
  entityIds: string[],
  entityTypes: EntityType[] = ["vehicle", "driver"],
): Promise<{ error: Error | null; documents: DocumentRow[] }> {
  if (!orgId || entityIds.length === 0) return { error: null, documents: [] };
  const { data, error } = await supabase()
    .from("entity_documents")
    .select("*")
    .eq("organization_id", orgId)
    .in("entity_type", entityTypes)
    .in("entity_id", entityIds)
    .neq("status", "replaced");

  return {
    error: (error as Error | null) ?? null,
    documents: (data ?? []) as DocumentRow[],
  };
}

export interface GetOrgDocumentsOptions {
  entityType?: EntityType;
  status?: DocumentRow["status"] | "any";
  /** Filter to docs expiring within N days (inclusive of expired). */
  expiringWithinDays?: number;
  /** Only docs missing a `storage_path` (i.e. metadata-only / uploaded elsewhere). */
  fileless?: boolean;
  /** Default 200 — Document Center pages with virtualized list. */
  limit?: number;
  offset?: number;
}

export async function getOrgComplianceDocuments(
  orgId: string,
  options: GetOrgDocumentsOptions = {},
): Promise<{ error: Error | null; documents: DocumentRow[] }> {
  let q = supabase()
    .from("entity_documents")
    .select("*")
    .eq("organization_id", orgId);

  if (options.entityType) q = q.eq("entity_type", options.entityType);
  if (options.status && options.status !== "any") {
    q = q.eq("status", options.status);
  } else {
    q = q.neq("status", "replaced");
  }

  if (typeof options.expiringWithinDays === "number") {
    const days = Math.max(options.expiringWithinDays, 0);
    const upper = new Date(Date.now() + days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    q = q.not("expiry_date", "is", null).lte("expiry_date", upper);
  }
  if (options.fileless === true) q = q.is("storage_path", null);

  q = q
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (typeof options.limit === "number") {
    const from = options.offset ?? 0;
    q = q.range(from, from + options.limit - 1);
  }

  const { data, error } = await q;
  return {
    error: (error as Error | null) ?? null,
    documents: (data ?? []) as DocumentRow[],
  };
}

// ── Writes (metadata) ──────────────────────────────────────────────────────

export async function createDocument(
  doc: Omit<
    DocumentRow,
    | "id"
    | "created_at"
    | "updated_at"
    | "verified_by"
    | "verified_at"
    | "replaced_by_id"
  >,
): Promise<{ error: Error | null; document: DocumentRow | null }> {
  const { data, error } = await supabase()
    .from("entity_documents")
    .insert(doc)
    .select()
    .single();
  return {
    error: (error as Error | null) ?? null,
    document: (data as DocumentRow | null) ?? null,
  };
}

export async function updateDocumentStatus(
  docId: string,
  status: DocumentRow["status"],
  notes?: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("entity_documents")
    .update({
      status,
      notes: notes ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  return { error: (error as Error | null) ?? null };
}

export async function verifyDocument(
  docId: string,
  verifiedBy: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("entity_documents")
    .update({
      status: "verified",
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
    })
    .eq("id", docId);
  return { error: (error as Error | null) ?? null };
}

/** Set expiry on an entity document (Insurance / FC / DL require this before Approve). */
export async function updateEntityDocumentExpiry(
  docId: string,
  expiryDate: string,
): Promise<{ error: Error | null }> {
  const trimmed = expiryDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { error: new Error("Use YYYY-MM-DD for the expiry date (for example 2027-03-15).") };
  }
  const { error } = await supabase()
    .from("entity_documents")
    .update({
      expiry_date: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  return { error: (error as Error | null) ?? null };
}

export async function rejectDocument(
  docId: string,
  reason: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("entity_documents")
    .update({
      status: "rejected",
      notes: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  return { error: (error as Error | null) ?? null };
}

// ── Storage ────────────────────────────────────────────────────────────────

export interface UploadComplianceDocumentInput {
  orgId: string;
  entityType: EntityType;
  entityId: string;
  docType: string;
  docLabel?: string;
  docNumber?: string;
  issuedDate?: string | null;
  expiryDate?: string | null;
  issuedBy?: string | null;
  notes?: string | null;
  file: {
    arrayBuffer: ArrayBuffer;
    mimeType: string;
    fileName: string;
  };
  /** Auth user id — written to `created_by` so the audit trigger picks it up. */
  uploadedBy: string;
}

export interface UploadComplianceDocumentResult {
  error: Error | null;
  document: DocumentRow | null;
}

/**
 * One-shot upload: validate → put object → insert row. Rolls back the
 * storage object if the row insert fails so we never leak orphans.
 */
export async function uploadComplianceDocument(
  input: UploadComplianceDocumentInput,
): Promise<UploadComplianceDocumentResult> {
  const validation = validateComplianceFile({
    arrayBuffer: input.file.arrayBuffer,
    mimeType: input.file.mimeType,
  });
  if (validation) return { error: new Error(validation), document: null };

  const ext = extOfFileName(input.file.fileName);
  const path = buildStoragePath({
    orgId: input.orgId,
    entityType: input.entityType,
    entityId: input.entityId,
    docType: input.docType,
    ext,
  });

  // 1) Upload to storage with retry.
  const uploadResult = await runWithRetry(
    () =>
      supabase()
        .storage.from(COMPLIANCE_BUCKET)
        .upload(path, input.file.arrayBuffer, {
          contentType: input.file.mimeType,
          upsert: false,
        }),
    (r) => (r.error ? r.error.message : null),
  );

  if (uploadResult.error) {
    return {
      error: new Error(uploadResult.error.message),
      document: null,
    };
  }

  // 2) Insert metadata row.
  const { data: row, error: insertError } = await supabase()
    .from("entity_documents")
    .insert({
      organization_id: input.orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      doc_type: input.docType,
      doc_label: input.docLabel ?? null,
      doc_number: input.docNumber ?? null,
      issued_date: input.issuedDate ?? null,
      expiry_date: input.expiryDate ?? null,
      issued_by: input.issuedBy ?? null,
      notes: input.notes ?? null,
      storage_path: path,
      status: "pending",
      created_by: input.uploadedBy,
    })
    .select()
    .single();

  if (insertError) {
    // Roll back orphan file.
    await supabase().storage.from(COMPLIANCE_BUCKET).remove([path]);
    return {
      error: new Error(insertError.message),
      document: null,
    };
  }

  return { error: null, document: (row as DocumentRow) ?? null };
}

/**
 * Replace an existing document: marks the old row as `replaced` and
 * uploads a new one with `replaced_by_id` pointing to it.
 */
export async function replaceComplianceDocument(input: {
  existingDocId: string;
  upload: UploadComplianceDocumentInput;
}): Promise<UploadComplianceDocumentResult> {
  const upload = await uploadComplianceDocument(input.upload);
  if (upload.error || !upload.document) return upload;

  const { error: updateErr } = await supabase()
    .from("entity_documents")
    .update({
      status: "replaced",
      replaced_by_id: upload.document.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.existingDocId);

  if (updateErr) {
    return {
      error: new Error(updateErr.message),
      document: upload.document,
    };
  }
  return upload;
}

/** Generate (or reuse a cached) signed URL for the doc's file. */
export async function getComplianceDocumentSignedUrl(
  storagePath: string,
): Promise<{ url: string | null; error: Error | null }> {
  if (!storagePath) {
    return { url: null, error: new Error("Missing storage path.") };
  }

  const now = Date.now();
  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expiresAtMs > now) {
    return { url: cached.url, error: null };
  }

  const { data, error } = await supabase()
    .storage.from(COMPLIANCE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SEC);

  if (error || !data?.signedUrl) {
    return { url: null, error: new Error(error?.message ?? "No signed URL.") };
  }

  signedUrlCache.set(storagePath, {
    url: data.signedUrl,
    expiresAtMs: now + SIGNED_URL_CACHE_TTL_MS,
  });

  return { url: data.signedUrl, error: null };
}

/** Hard delete — removes storage object and DB row (audit row remains). */
export async function deleteComplianceDocument(
  docId: string,
  storagePath: string | null,
): Promise<{ error: Error | null }> {
  if (storagePath) {
    await supabase().storage.from(COMPLIANCE_BUCKET).remove([storagePath]);
    signedUrlCache.delete(storagePath);
  }
  const { error } = await supabase()
    .from("entity_documents")
    .delete()
    .eq("id", docId);
  return { error: (error as Error | null) ?? null };
}

// ── Audit log ──────────────────────────────────────────────────────────────

export async function getDocumentAuditLog(
  documentId: string,
  options: { limit?: number } = {},
): Promise<{ error: Error | null; entries: DocumentAuditEntry[] }> {
  let q = supabase()
    .from("document_audit_log")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (options.limit) q = q.limit(options.limit);

  const { data, error } = await q;
  if (error) {
    return { error: new Error(error.message), entries: [] };
  }
  const entries: DocumentAuditEntry[] = (data ?? []).map((r) => ({
    id: r.id,
    documentId: r.document_id,
    organizationId: r.organization_id,
    entityType: r.entity_type as EntityType,
    entityId: r.entity_id,
    action: r.action as DocumentAuditAction,
    actorId: r.actor_id,
    oldStatus: r.old_status,
    newStatus: r.new_status,
    notes: r.notes,
    metadata: r.metadata,
    createdAt: r.created_at,
  }));
  return { error: null, entries };
}

/**
 * Record a manual audit event (e.g. a user opened / downloaded a doc) —
 * INSERT / UPDATE / DELETE on `entity_documents` is captured by a trigger,
 * so use this only for actions that don't mutate the row.
 */
export async function recordDocumentAuditEvent(input: {
  documentId: string;
  organizationId: string;
  entityType: EntityType;
  entityId: string;
  action: DocumentAuditAction;
  actorId?: string | null;
  notes?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ error: Error | null }> {
  const { error } = await supabase().from("document_audit_log").insert({
    document_id: input.documentId,
    organization_id: input.organizationId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    actor_id: input.actorId ?? null,
    notes: input.notes ?? null,
    metadata: input.metadata ?? null,
  });
  return { error: (error as Error | null) ?? null };
}

// ── RPC wrappers ───────────────────────────────────────────────────────────

export async function getComplianceSummary(
  orgId: string,
): Promise<{ error: Error | null; summary: ComplianceSummaryRow[] }> {
  const { data, error } = await supabase().rpc("get_compliance_summary", {
    p_org_id: orgId,
  });
  return {
    error: (error as Error | null) ?? null,
    summary: (data ?? []) as ComplianceSummaryRow[],
  };
}

export async function getExpiringDocuments(
  orgId: string,
  daysAhead = 30,
): Promise<{ error: Error | null; documents: ExpiringDocRow[] }> {
  const { data, error } = await supabase().rpc("get_expiring_documents", {
    p_org_id: orgId,
    p_days_ahead: daysAhead,
  });
  return {
    error: (error as Error | null) ?? null,
    documents: (data ?? []) as ExpiringDocRow[],
  };
}

/**
 * Server-side compliance score for a single entity. Mirrors the TS
 * `computeComplianceScore` implementation; use it when you only need the
 * score (no document list) — saves a round-trip per row in dashboards.
 */
export async function getComplianceScoreForEntity(
  entityType: EntityType,
  entityId: string,
): Promise<{ error: Error | null; score: ComplianceScore | null }> {
  const { data, error } = await supabase().rpc("compute_compliance_score", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) {
    return { error: new Error(error.message), score: null };
  }
  return { error: null, score: (data as ComplianceScore | null) ?? null };
}

/**
 * Pre-flight gate for trip allocation. Pass either / both ids; returns
 * `{ blocked, reasons[] }`. Empty `reasons` → all clear.
 */
export async function checkComplianceBlocking(input: {
  vehicleId?: string | null;
  driverId?: string | null;
}): Promise<{ error: Error | null; result: ComplianceBlockResult | null }> {
  const { data, error } = await supabase().rpc("is_compliance_blocking", {
    p_vehicle_id: input.vehicleId ?? null,
    p_driver_id: input.driverId ?? null,
  });
  if (error) {
    return { error: new Error(error.message), result: null };
  }
  return {
    error: null,
    result: (data as ComplianceBlockResult | null) ?? null,
  };
}
