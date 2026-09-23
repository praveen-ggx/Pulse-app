/**
 * Vehicle documents — upload, view, delete for RC, insurance, fitness, PUC.
 * Storage: vehicle-documents bucket, path {orgId}/{vehicleId}/{docType}.{ext}.
 * Metadata: vehicles.documents JSONB column (no separate table).
 *
 * Edge cases handled:
 *  - File size/type validation before upload
 *  - Rollback: if DB update fails after storage upload, the orphaned file is removed
 *  - Re-upload (upsert): overwrites same path, so no orphan files accumulate
 *  - Delete: removes storage object + clears JSONB key in one call
 */
import { supabase } from '@/lib/supabase';
import { createStorageSignedUrlCache } from '@/lib/storageSignedUrlCache';
import type {
  DocumentWithExpiry,
  VehicleComplianceDocType,
  VehicleDocuments,
  VehicleExtraDocument,
} from '../utils/vehicleDocuments.util';

const BUCKET = 'vehicle-documents';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const STORAGE_RETRY_DELAYS_MS = [250, 800, 1800] as const;

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

export interface UploadVehicleDocumentResult {
  storagePath: string | null;
  error: Error | null;
}

export interface DeleteVehicleDocumentResult {
  error: Error | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve the org that owns `vehicles.documents` for this vehicle.
 * Trip detail often passes the trip/viewer org, while the truck may live on a
 * supplier-linked org — using the wrong orgId makes UPDATE match 0 rows.
 */
export async function resolveVehicleDocumentsWriteTarget(
  vehicleId: string,
  preferredOrgIds: Array<string | null | undefined> = [],
): Promise<{ orgId: string; documents: VehicleDocuments | null } | null> {
  const tried = new Set<string>();
  for (const candidate of preferredOrgIds) {
    const orgId = (candidate ?? "").trim();
    if (!orgId || tried.has(orgId)) continue;
    tried.add(orgId);
    const { data, error } = await supabase()
      .from("vehicles")
      .select("organization_id, documents")
      .eq("id", vehicleId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!error && data?.organization_id) {
      return {
        orgId: String(data.organization_id),
        documents: (data.documents ?? null) as VehicleDocuments | null,
      };
    }
  }

  const { data } = await supabase()
    .from("vehicles")
    .select("organization_id, documents")
    .eq("id", vehicleId)
    .maybeSingle();
  if (data?.organization_id) {
    return {
      orgId: String(data.organization_id),
      documents: (data.documents ?? null) as VehicleDocuments | null,
    };
  }
  return null;
}

function isTransientStorageError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('connection') ||
    m.includes('network') ||
    m.includes('fetch failed') ||
    m.includes('gateway')
  );
}

async function runWithStorageRetry<T>(op: () => Promise<T>, classifyError: (value: T) => string | null): Promise<T> {
  let lastResult: T | null = null;
  for (let i = 0; i < STORAGE_RETRY_DELAYS_MS.length + 1; i += 1) {
    const result = await op();
    lastResult = result;
    const errMessage = classifyError(result);
    if (!errMessage || !isTransientStorageError(errMessage)) return result;
    if (i < STORAGE_RETRY_DELAYS_MS.length) {
      await sleep(STORAGE_RETRY_DELAYS_MS[i]);
    }
  }
  return lastResult as T;
}

const vehicleDocSignedUrls = createStorageSignedUrlCache({
  async signOne(path, expiresInSec) {
    const { data, error } = await runWithStorageRetry(
      () =>
        supabase()
          .storage
          .from(BUCKET)
          .createSignedUrl(path, expiresInSec, { download: false }),
      (result) => result.error?.message ?? null,
    );
    return {
      signedUrl: data?.signedUrl ?? null,
      error: error?.message ?? null,
    };
  },
  async signMany(paths, expiresInSec) {
    const { data, error } = await runWithStorageRetry(
      () =>
        supabase()
          .storage
          .from(BUCKET)
          .createSignedUrls(paths, expiresInSec, { download: false }),
      (value) => value.error?.message ?? null,
    );
    if (error) {
      return paths.map((path) => ({
        path,
        signedUrl: null,
        error: error.message,
      }));
    }
    return (data ?? []).map((row) => ({
      path: row.path ?? '',
      signedUrl: row.error ? null : row.signedUrl,
      error: row.error,
    }));
  },
});

function invalidateVehicleDocUrl(storagePath: string, extraPrefix?: string): void {
  vehicleDocSignedUrls.invalidate(storagePath);
  if (extraPrefix) vehicleDocSignedUrls.invalidatePrefix(extraPrefix);
}

/**
 * Validate file before attempting an upload. Returns null if valid, or an error message.
 * O(1) — two constant-time checks.
 */
export function validateDocumentFile(file: { arrayBuffer: ArrayBuffer; mimeType: string }): string | null {
  if (!file.arrayBuffer?.byteLength) return 'File is empty';
  if (file.arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES)
    return `File too large (${(file.arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`;
  const mime = (file.mimeType ?? '').toLowerCase();
  if (mime && !ALLOWED_MIME_TYPES.has(mime))
    return `Unsupported file type (${mime}). Use JPEG, PNG, WebP, or PDF.`;
  return null;
}

/**
 * Get a time-limited signed URL for viewing a vehicle document.
 * Vault files live in `vehicle-documents`; trip fallback uploads may live in
 * `compliance-documents` (entity_documents path shape: org/vehicle|driver/... ).
 */
export async function getVehicleDocumentViewUrl(storagePath: string): Promise<string | null> {
  const path = (storagePath ?? "").trim();
  if (!path) return null;

  const looksLikeComplianceEntityPath = /\/(vehicle|driver|trip)\//i.test(path);

  if (looksLikeComplianceEntityPath) {
    try {
      const { getComplianceDocumentSignedUrl } = await import(
        "@/features/compliance/services/documents.service"
      );
      const { url } = await getComplianceDocumentSignedUrl(path);
      if (url) return url;
    } catch {
      /* try vehicle bucket below */
    }
  }

  const fromVehicleBucket = await vehicleDocSignedUrls.getUrl(path);
  if (fromVehicleBucket) return fromVehicleBucket;

  try {
    const { getComplianceDocumentSignedUrl } = await import(
      "@/features/compliance/services/documents.service"
    );
    const { url } = await getComplianceDocumentSignedUrl(path);
    return url;
  } catch {
    return null;
  }
}

/** Resolve preview URLs for many paths (vehicle vault and/or compliance). */
export async function getVehicleDocumentViewUrls(
  storagePaths: string[],
): Promise<Record<string, string | null>> {
  const unique = [...new Set(storagePaths.map((p) => (p ?? "").trim()).filter(Boolean))];
  const byPath: Record<string, string | null> = {};
  await Promise.all(
    unique.map(async (path) => {
      byPath[path] = await getVehicleDocumentViewUrl(path);
    }),
  );
  const out: Record<string, string | null> = {};
  for (const raw of storagePaths) {
    const path = (raw ?? "").trim();
    out[raw] = path ? byPath[path] ?? null : null;
  }
  return out;
}

/**
 * Fill empty vault slots from viewer-org entity_documents (trip fallback uploads).
 * Vault JSON wins when both exist for the same type — unless the vault URL is
 * empty/whitespace.
 */
export async function mergeEntityDocumentsIntoVehicleVault(
  vehicleId: string,
  viewerOrgId: string,
  base: VehicleDocuments | null,
): Promise<VehicleDocuments | null> {
  const { data, error } = await supabase()
    .from("entity_documents")
    .select("doc_type, storage_path, expiry_date, created_at, status")
    .eq("organization_id", viewerOrgId)
    .eq("entity_type", "vehicle")
    .eq("entity_id", vehicleId)
    .neq("status", "replaced")
    .order("created_at", { ascending: false });
  if (error || !data?.length) return base;

  const merged: VehicleDocuments = { ...(base ?? {}) };
  const filled = new Set<string>();
  for (const row of data) {
    const type = row.doc_type as VehicleComplianceDocType;
    if (type !== "rc" && type !== "insurance" && type !== "fitness" && type !== "pollution") {
      continue;
    }
    if (filled.has(type)) continue;
    if (!row.storage_path) continue;
    // Prefer entity_documents when vault slot is empty (cross-org Save to vault fallback).
    if (merged[type]?.url?.trim()) {
      filled.add(type);
      continue;
    }
    filled.add(type);
    merged[type] = {
      url: row.storage_path,
      expiryDate: row.expiry_date ?? "",
      uploadedAt: row.created_at ?? undefined,
    };
  }
  return Object.keys(merged).length > 0 || (base && Object.keys(base).length > 0)
    ? merged
    : base;
}

function extraDocumentId(): string {
  return `extra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Upload a document file for a vehicle. Returns storage path on success.
 *
 * Path scheme: {orgId}/{vehicleId}/{docType}.{ext}
 *   → deterministic per doc type, so re-upload overwrites (no orphan files).
 *
 * O(1) — one storage write (upsert).
 */
export async function uploadVehicleDocument(
  orgId: string,
  vehicleId: string,
  docType: VehicleComplianceDocType,
  file: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string; blob?: Blob },
): Promise<UploadVehicleDocumentResult> {
  const validationError = validateDocumentFile(file);
  if (validationError) return { storagePath: null, error: new Error(validationError) };

  const ext = file.fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${orgId}/${vehicleId}/${docType}.${ext}`;

  const { error } = await runWithStorageRetry(
    () =>
      supabase()
        .storage
        .from(BUCKET)
        .upload(path, file.blob ?? file.arrayBuffer, {
          contentType: file.mimeType || 'image/jpeg',
          upsert: true,
        }),
    (result) => result.error?.message ?? null,
  );

  if (error) return { storagePath: null, error: new Error(error.message) };
  invalidateVehicleDocUrl(path, `${orgId}/${vehicleId}/${docType}.`);
  return { storagePath: path, error: null };
}

/**
 * Remove a vehicle document from storage.
 * O(1) — single storage delete.
 */
export async function deleteVehicleDocumentFile(storagePath: string): Promise<DeleteVehicleDocumentResult> {
  if (!storagePath?.trim()) return { error: null };
  const { error } = await runWithStorageRetry(
    () =>
      supabase()
        .storage
        .from(BUCKET)
        .remove([storagePath]),
    (result) => result.error?.message ?? null,
  );
  if (error) return { error: new Error(error.message) };
  invalidateVehicleDocUrl(storagePath);
  return { error: null };
}

/**
 * Full upload + DB save in a single transaction-like call.
 * If the DB update fails, the uploaded file is rolled back (deleted).
 *
 * O(1) — one storage write + one DB update (+ optional rollback delete).
 */
export async function uploadAndSaveVehicleDocument(
  orgId: string,
  vehicleId: string,
  docType: VehicleComplianceDocType,
  file: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string; blob?: Blob },
  expiryDate: string,
  existingDocuments: VehicleDocuments | null,
): Promise<{ documents: VehicleDocuments | null; error: Error | null }> {
  const resolved = await resolveVehicleDocumentsWriteTarget(vehicleId, [orgId]);
  const owningOrgId = resolved?.orgId ?? orgId;
  const baseDocuments = resolved?.documents ?? existingDocuments;

  // 1. Upload to storage (path must use the vehicle's owning org folder)
  const { storagePath, error: uploadErr } = await uploadVehicleDocument(
    owningOrgId,
    vehicleId,
    docType,
    file,
  );
  if (uploadErr || !storagePath) return { documents: null, error: uploadErr ?? new Error('Upload failed') };

  // 2. Build updated JSONB
  const updated: VehicleDocuments = { ...(baseDocuments ?? {}) };
  updated[docType] = {
    url: storagePath,
    expiryDate,
    uploadedAt: new Date().toISOString(),
  };

  // 3. Persist to vehicles.documents on the owning org row
  const { data: savedRow, error: dbError } = await supabase()
    .from('vehicles')
    .update({ documents: updated })
    .eq('organization_id', owningOrgId)
    .eq('id', vehicleId)
    .select('id, documents')
    .maybeSingle();

  if (dbError || !savedRow) {
    // Rollback: remove the just-uploaded file so we don't leave orphans
    await deleteVehicleDocumentFile(storagePath).catch(() => {});
    return {
      documents: null,
      error: new Error(
        dbError?.message ??
          'Could not save this document to the vehicle vault. You may not have permission to update this vehicle, or the vehicle record was not found.',
      ),
    };
  }

  const persistedDocs = (savedRow.documents ?? {}) as VehicleDocuments;
  return { documents: persistedDocs, error: null };
}

/** Update expiry on an existing vault slot (Insurance / FC) without re-uploading. */
export async function updateVehicleDocumentExpiry(
  orgId: string,
  vehicleId: string,
  docType: VehicleComplianceDocType,
  expiryDate: string,
  existingDocuments: VehicleDocuments | null,
): Promise<{ documents: VehicleDocuments | null; error: Error | null }> {
  const trimmed = expiryDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { documents: null, error: new Error("Use YYYY-MM-DD for the expiry date (for example 2027-03-15).") };
  }
  const resolved = await resolveVehicleDocumentsWriteTarget(vehicleId, [orgId]);
  const owningOrgId = resolved?.orgId ?? orgId;
  const base = resolved?.documents ?? existingDocuments;
  const current = base?.[docType];
  if (!current?.url?.trim()) {
    return { documents: null, error: new Error("Upload this document before setting an expiry date.") };
  }
  const updated: VehicleDocuments = {
    ...(base ?? {}),
    [docType]: {
      ...current,
      expiryDate: trimmed,
    },
  };
  const { data: savedRow, error: dbError } = await supabase()
    .from("vehicles")
    .update({ documents: updated })
    .eq("organization_id", owningOrgId)
    .eq("id", vehicleId)
    .select("id, documents")
    .maybeSingle();
  if (dbError || !savedRow) {
    return {
      documents: null,
      error: new Error(
        dbError?.message ??
          "Could not save the expiry date for this vehicle document.",
      ),
    };
  }
  return { documents: (savedRow.documents ?? updated) as VehicleDocuments, error: null };
}

/**
 * Trip Manifest vault write for RC / insurance / FC / PUC.
 * 1) Try the normal org-owned vault path.
 * 2) If that fails (cross-org truck / RLS), upload under the viewer org's
 *    storage folder and persist via save_vehicle_document_for_trip RPC.
 */
export async function uploadAndSaveVehicleDocumentForTrip(
  viewerOrgId: string,
  tripId: string,
  vehicleId: string,
  docType: VehicleComplianceDocType,
  file: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string; blob?: Blob },
  expiryDate: string,
  existingDocuments: VehicleDocuments | null,
  preferredOrgIds: Array<string | null | undefined> = [],
): Promise<{ documents: VehicleDocuments | null; error: Error | null }> {
  const preferred = [viewerOrgId, ...preferredOrgIds];
  const resolved = await resolveVehicleDocumentsWriteTarget(vehicleId, preferred);
  if (resolved) {
    const owned = await uploadAndSaveVehicleDocument(
      resolved.orgId,
      vehicleId,
      docType,
      file,
      expiryDate,
      resolved.documents ?? existingDocuments,
    );
    if (!owned.error) return owned;
  } else {
    const owned = await uploadAndSaveVehicleDocument(
      viewerOrgId,
      vehicleId,
      docType,
      file,
      expiryDate,
      existingDocuments,
    );
    if (!owned.error) return owned;
  }

  // Cross-org fallback: storage under viewer org + SECURITY DEFINER metadata write.
  const { storagePath, error: uploadErr } = await uploadVehicleDocument(
    viewerOrgId,
    vehicleId,
    docType,
    file,
  );
  if (uploadErr || !storagePath) {
    return { documents: null, error: uploadErr ?? new Error("Upload failed") };
  }

  const { data, error: rpcError } = await supabase().rpc("save_vehicle_document_for_trip", {
    p_trip_id: tripId,
    p_vehicle_id: vehicleId,
    p_viewer_org_id: viewerOrgId,
    p_doc_type: docType,
    p_storage_path: storagePath,
    p_expiry_date: expiryDate || null,
  });

  if (rpcError) {
    await deleteVehicleDocumentFile(storagePath).catch(() => {});
    const msg = rpcError.message || "";
    // Trip RPC may be missing on preprod (404 / PGRST202). Always try
    // entity_documents under the viewer org so Save to vault still works.
    try {
      const { uploadComplianceDocument } = await import(
        "@/features/compliance/services/documents.service"
      );
      const { data: authData } = await supabase().auth.getUser();
      const actorId = authData.user?.id;
      if (!actorId) {
        return {
          documents: null,
          error: new Error("Could not save vehicle document. Sign in again and retry."),
        };
      }
      const { document, error: entityError } = await uploadComplianceDocument({
        orgId: viewerOrgId,
        entityType: "vehicle",
        entityId: vehicleId,
        docType,
        file: {
          arrayBuffer: file.arrayBuffer,
          mimeType: file.mimeType,
          fileName: file.fileName,
        },
        uploadedBy: actorId,
        expiryDate: expiryDate || null,
      });
      if (entityError || !document) {
        return {
          documents: null,
          error:
            entityError ??
            new Error(msg || "Could not save vehicle document."),
        };
      }
      const merged: VehicleDocuments = {
        ...(existingDocuments ?? {}),
        [docType]: {
          url: document.storage_path,
          expiryDate: document.expiry_date ?? "",
          uploadedAt: document.created_at,
        },
      };
      return { documents: merged, error: null };
    } catch (fallbackErr) {
      return {
        documents: null,
        error: new Error(
          fallbackErr instanceof Error
            ? fallbackErr.message
            : msg || "Could not save vehicle document.",
        ),
      };
    }
  }

  return { documents: (data ?? null) as VehicleDocuments | null, error: null };
}

/**
 * Upload extra vehicle files from the trip vault (does not replace RC / insurance / fitness / PUC).
 * Path: {orgId}/{vehicleId}/extras/{id}.{ext}
 */
export async function uploadAndSaveVehicleExtraDocuments(
  orgId: string,
  vehicleId: string,
  files: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string }[],
  existingDocuments: VehicleDocuments | null,
): Promise<{ documents: VehicleDocuments | null; error: Error | null }> {
  if (files.length === 0) {
    return { documents: existingDocuments, error: new Error('No files selected') };
  }

  const resolved = await resolveVehicleDocumentsWriteTarget(vehicleId, [orgId]);
  const owningOrgId = resolved?.orgId ?? orgId;
  const baseDocuments = resolved?.documents ?? existingDocuments;

  const uploaded: VehicleExtraDocument[] = [];
  for (const file of files) {
    const validationError = validateDocumentFile(file);
    if (validationError) {
      await Promise.all(uploaded.map((item) => deleteVehicleDocumentFile(item.url).catch(() => {})));
      return { documents: null, error: new Error(validationError) };
    }
    const extraId = extraDocumentId();
    const ext = file.fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${owningOrgId}/${vehicleId}/extras/${extraId}.${ext}`;
    const { error } = await runWithStorageRetry(
      () =>
        supabase()
          .storage
          .from(BUCKET)
          .upload(path, file.arrayBuffer, {
            contentType: file.mimeType || 'image/jpeg',
            upsert: false,
          }),
      (result) => result.error?.message ?? null,
    );
    if (error) {
      await Promise.all(uploaded.map((item) => deleteVehicleDocumentFile(item.url).catch(() => {})));
      return { documents: null, error: new Error(error.message) };
    }
    invalidateVehicleDocUrl(path);
    uploaded.push({
      id: extraId,
      url: path,
      expiryDate: '',
      uploadedAt: new Date().toISOString(),
      fileName: file.fileName,
    });
  }

  const updated: VehicleDocuments = {
    ...(baseDocuments ?? {}),
    extras: [...(baseDocuments?.extras ?? []), ...uploaded],
  };

  const { data: savedRow, error: dbError } = await supabase()
    .from('vehicles')
    .update({ documents: updated })
    .eq('organization_id', owningOrgId)
    .eq('id', vehicleId)
    .select('id, documents')
    .maybeSingle();

  if (dbError || !savedRow) {
    await Promise.all(uploaded.map((item) => deleteVehicleDocumentFile(item.url).catch(() => {})));
    return {
      documents: null,
      error: new Error(
        dbError?.message ??
          'Could not save this document to the vehicle vault. You may not have permission to update this vehicle, or the vehicle record was not found.',
      ),
    };
  }

  return { documents: (savedRow.documents ?? updated) as VehicleDocuments, error: null };
}

export async function deleteVehicleExtraDocument(
  orgId: string,
  vehicleId: string,
  extraId: string,
  existingDocuments: VehicleDocuments | null,
): Promise<{ documents: VehicleDocuments | null; error: Error | null }> {
  const extras = existingDocuments?.extras ?? [];
  const extra = extras.find((item) => item.id === extraId);
  if (!extra) {
    return {
      documents: existingDocuments,
      error: new Error("That vehicle file is no longer on record."),
    };
  }
  if (extra.url?.trim()) {
    await deleteVehicleDocumentFile(extra.url).catch(() => {});
  }
  const nextExtras = extras.filter((item) => item.id !== extraId);
  const updated: VehicleDocuments = { ...(existingDocuments ?? {}) };
  if (nextExtras.length > 0) updated.extras = nextExtras;
  else delete updated.extras;

  const { error: dbError } = await supabase()
    .from("vehicles")
    .update({ documents: updated })
    .eq("organization_id", orgId)
    .eq("id", vehicleId);

  if (dbError) return { documents: null, error: new Error(dbError.message) };
  return { documents: updated, error: null };
}

/**
 * Delete a document type for a vehicle (storage file + clear JSONB key).
 *
 * O(1) — one storage delete + one DB update.
 */
export async function deleteVehicleDocument(
  orgId: string,
  vehicleId: string,
  docType: VehicleComplianceDocType,
  existingDocuments: VehicleDocuments | null,
): Promise<{ documents: VehicleDocuments | null; error: Error | null }> {
  const doc: DocumentWithExpiry | undefined = existingDocuments?.[docType];
  const storagePath = doc?.url;

  // Remove storage file (best-effort; even if missing, clear JSONB)
  if (storagePath?.trim()) {
    await deleteVehicleDocumentFile(storagePath).catch(() => {});
  }

  const updated: VehicleDocuments = { ...(existingDocuments ?? {}) };
  delete updated[docType];

  const { error: dbError } = await supabase()
    .from('vehicles')
    .update({ documents: updated })
    .eq('organization_id', orgId)
    .eq('id', vehicleId);

  if (dbError) return { documents: null, error: new Error(dbError.message) };
  return { documents: updated, error: null };
}
