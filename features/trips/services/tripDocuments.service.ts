/**
 * Trip documents — list and upload for a trip.
 * Storage: trip-documents bucket, path {tripId}/{type}/{uuid}.{ext}.
 * Table: trip_documents (trip_id, file_name, storage_path, mime_type, size_bytes, uploaded_by, document_type).
 *
 * document_type discriminates business concepts: 'pod' | 'manifest' | 'invoice' | 'eway_bill' | 'loading_slip'.
 * Fallback when DB is unavailable: list storage prefix {tripId}/ and infer type from path segment.
 */
import {
  canMaterializeStoragePreview,
  invalidateStoragePreviewPath,
  previewPrivateObject,
} from "@/features/trips/utils/storagePreviewObjectUrl.util";
import { supabase } from "@/lib/supabase";
import { getPlatformEventBus } from "@/lib/platform/events/InProcessEventBus";
import { recordTripWorkflowEvent } from "@/features/trips/services/tripWorkflow.service";
import { createStorageSignedUrlCache } from "@/lib/storageSignedUrlCache";
import { listOcrJobsForTripDocuments } from "@/features/ocr/services/ocrJob.service";
import { runWithConcurrencyLimit } from "@/features/trips/services/tripDocumentLrPod.service";
import { parseLrFieldsFromOcrJob, parseLrFieldValues, preferredLrDocumentNumber, serializeLrFieldValues, LR_FIELDS_FILE_NAME, lrFieldsStoragePath, isLrFieldsMetaPath } from "@/features/trips/services/lrDocumentOcr.util";
import {
  checkOrgDuplicateLrNumbersForTrip,
  invalidateOrgLrIndexForTrip,
} from "@/features/trips/services/orgLrDuplicate.service";
import {
  lrNumberFromStoredDocumentNumber,
  ORG_LR_DUPLICATE_MESSAGE,
} from "@/features/trips/services/orgLrNumber.util";
import { readStoredElrSnapshot } from "@/features/trips/services/elrSnapshot.util";
import { expandLR } from "@/lib/utils/lr";
import {
  EWAY_BILL_FIELDS_FILE_NAME,
  ewayBillFieldsStoragePath,
  ewayFieldsCarryOnDelete,
  applyEwayNumbersByFile,
  ewayFieldsSourceRow,
  ewayFieldsWriteTarget,
  isEwayBillMetaPath,
  isEwayEntriesJson,
  parseEwayFieldEntries,
  serializeEwayFieldEntries,
  sortEwayRowsNewestFirst,
  type EwayFieldValues,
} from "@/features/trips/services/ewayBillFields.util";

const BUCKET = "trip-documents";
/**
 * `storage.search` sorts by name with the bucket/name index. Sorting by
 * `updated_at` switches it to a case-insensitive scan of the whole bucket:
 * production measured 946 ms mean, 24 s max, and about 81,000 buffer hits
 * per call. Page by name, then order the files here.
 * A single page of 500 would hide later names. Current folders top out at 29
 * objects; the page loop still continues while a page comes back full.
 */
const LEGACY_STORAGE_PAGE = 500;
const LEGACY_STORAGE_MAX_OBJECTS = 2000;
const LEGACY_STORAGE_SORT = { column: "name", order: "asc" } as const;
const LEGACY_STORAGE_TRUNCATED = "Storage listing stopped at 2000 objects and is incomplete.";

type LegacyStorageEntry = { name: string; id?: string; updated_at?: string | null };

async function listLegacyStorageFolder(path: string): Promise<{
  data: LegacyStorageEntry[] | null;
  error: { message: string } | null;
  truncated: boolean;
}> {
  const rows: LegacyStorageEntry[] = [];
  for (let offset = 0; offset < LEGACY_STORAGE_MAX_OBJECTS; offset += LEGACY_STORAGE_PAGE) {
    const { data, error } = await supabase()
      .storage
      .from(BUCKET)
      .list(path, { limit: LEGACY_STORAGE_PAGE, offset, sortBy: LEGACY_STORAGE_SORT });
    if (error) {
      return { data: rows.length > 0 ? rows : null, error, truncated: false };
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < LEGACY_STORAGE_PAGE) {
      return { data: rows, error: null, truncated: false };
    }
  }
  return { data: null, error: { message: LEGACY_STORAGE_TRUNCATED }, truncated: true };
}

function newestStorageObjectsFirst<T extends { name?: string | null; updated_at?: string | null }>(
  files: T[],
): T[] {
  return [...files].sort((a, b) => {
    const at = a.updated_at ?? "";
    const bt = b.updated_at ?? "";
    if (at !== bt) return at < bt ? 1 : -1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

/** Synthetic marker written by use_vehicle_document_for_trip — never a trip-documents object. */
const VEHICLE_DOCUMENT_REF_PREFIX = "ref:vehicle-document:";

const TRIP_DOCUMENTS_SELECT =
  "id, trip_id, file_name, storage_path, mime_type, size_bytes, uploaded_at, uploaded_by, document_type, document_number, ocr_job_id, status";
const TRIP_DOCUMENTS_SELECT_WITH_SOURCE = `${TRIP_DOCUMENTS_SELECT}, source_entity_document_id, rejection_reason`;

function isVehicleDocumentReferenceStoragePath(storagePath: string | null | undefined): boolean {
  return Boolean(storagePath && storagePath.startsWith(VEHICLE_DOCUMENT_REF_PREFIX));
}

function isMissingTripDocumentsColumn(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? "").toUpperCase();
  if (code === "42703" || code === "PGRST204") return true;
  const message = String(err.message ?? "").toLowerCase();
  return message.includes("source_entity_document_id") && (message.includes("does not exist") || message.includes("schema cache"));
}
/** Practical ceiling for large phone scans / multi-page PDFs (storage-friendly). */
export const MAX_TRIP_DOC_BYTES = 100 * 1024 * 1024;
const MAX_TRIP_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
/** Max simultaneous Storage `list()` calls across a trip's document-type subfolders. */
const SUBFOLDER_LIST_CONCURRENCY = 3;

/**
 * Postgres/PostgREST: table missing from DB or not in API schema cache (`supabase db push`).
 * When true after a successful storage upload, callers can treat POD as stored and use storage-only metadata.
 */
export function isTripDocumentsMetaTableUnavailable(
  err: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!err?.message && !err?.code) return false;
  const m = String(err.message ?? "").toLowerCase();
  const code = String(err.code ?? "").toUpperCase();
  if (code === "42P01") return true;
  if (m.includes("schema cache")) return true;
  if (m.includes("could not find the table") && m.includes("trip_documents")) return true;
  if (m.includes("relation") && m.includes("trip_documents") && m.includes("does not exist"))
    return true;
  return false;
}

/** PostgREST: table not exposed / not in schema cache (HTTP 404 on /rest/v1/trip_documents). */
export function isTripDocumentsRestEndpointMissing(
  err: { message?: string; code?: string; status?: number } | null | undefined,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? "").toUpperCase();
  if (code === "PGRST205") return true;
  if (err.status === 404) return true;
  if (isTripDocumentsMetaTableUnavailable(err)) return true;
  const m = String(err.message ?? "").toLowerCase();
  if (m.includes("trip_documents") && m.includes("not found")) return true;
  return false;
}

export function isTripDocumentsStoragePathConflict(
  err: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const message = String(err.message ?? "").toLowerCase();
  return (
    code === "23505" ||
    message.includes("trip_documents_storage_path_unique") ||
    (message.includes("duplicate key") && message.includes("storage_path"))
  );
}

/** Generate a UUID v4-style string (React Native has no global crypto). */
function randomUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type TripDocumentType =
  | 'lr'
  | 'pod'
  | 'manifest'
  | 'invoice'
  | 'memo'
  | 'other'
  | 'bank_docs'
  | 'eway_bill'
  | 'loading_slip'
  | 'odometer_start_photo'
  | 'odometer_end_photo'
  | 'fuel_bill_photo'
  | 'toll_receipt_photo'
  | 'trip_expense_receipt_photo'
  | 'maintenance_invoice_photo'
  | 'insurance'
  | 'rc';

export interface TripDocumentRow {
  id: string;
  trip_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  uploaded_by: string | null;
  document_type: TripDocumentType;
  ocr_job_id?: string | null;
  /** Optional user-entered document number (printed LR or e-way bill number). */
  document_number?: string | null;
  /** Printed LR date from OCR (client-enriched; not a dedicated column). */
  document_date?: string | null;
  /** Compliance review state: pending / verified / rejected. */
  status?: string | null;
  /** Reviewer's note when status is rejected. */
  rejection_reason?: string | null;
  /**
   * Exact `entity_documents.id` when this row is reused workspace-vehicle
   * evidence. Null for a normal trip-documents upload. Authoritative pin —
   * do not infer reuse from storage_path alone when this is present.
   */
  source_entity_document_id?: string | null;
}

export interface UploadTripDocumentResult {
  doc: TripDocumentRow | null;
  error: Error | null;
}

export interface UploadTripChatImageResult {
  fileName: string;
  mimeType: string | null;
  storagePath: string;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function attachLrOcrFields(rows: TripDocumentRow[]): Promise<TripDocumentRow[]> {
  const lrIds = rows
    .filter((row) => row.document_type === "lr" && row.id && !row.id.startsWith("storage-"))
    .map((row) => row.id);
  if (lrIds.length === 0) return rows;
  try {
    const jobs = await listOcrJobsForTripDocuments(lrIds);
    const latestByDoc = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) {
      const docId = job.trip_document_id;
      if (!docId || latestByDoc.has(docId)) continue;
      latestByDoc.set(docId, job);
    }
    return rows.map((row) => {
      if (row.document_type !== "lr") return row;
      if (readStoredElrSnapshot(row.document_number)) return row;
      const fields = parseLrFieldsFromOcrJob(latestByDoc.get(row.id) ?? null);
      const stored = parseLrFieldValues(row.document_number);
      const lrNumber = preferredLrDocumentNumber(
        stored.lrNumber,
        fields.lrNumber,
      );
      return {
        ...row,
        document_number: serializeLrFieldValues({
          lrNumber: lrNumber ?? "",
          date: stored.date || fields.lrDate || "",
          invoice: stored.invoice,
        }) || row.document_number,
        document_date:
          stored.date || fields.lrDate || row.document_date || null,
      };
    });
  } catch {
    return rows;
  }
}

const tripDocSignedUrls = createStorageSignedUrlCache({
  async signOne(path, expiresInSec) {
    const { data, error } = await supabase()
      .storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSec, { download: false });
    return {
      signedUrl: data?.signedUrl ?? null,
      error: error?.message ?? null,
    };
  },
  async signMany(paths, expiresInSec) {
    const { data, error } = await supabase()
      .storage
      .from(BUCKET)
      .createSignedUrls(paths, expiresInSec, { download: false });
    if (error) {
      return paths.map((path) => ({
        path,
        signedUrl: null,
        error: error.message,
      }));
    }
    return (data ?? []).map((row) => ({
      path: row.path ?? "",
      signedUrl: row.error ? null : row.signedUrl,
      error: row.error,
    }));
  },
});

/**
 * Get a URL to view a trip document (POD). Uses a signed URL so it works for private buckets.
 * Use for "View" in the app.
 */
export async function getDocumentViewUrl(storagePath: string): Promise<string> {
  if (isVehicleDocumentReferenceStoragePath(storagePath)) {
    return "";
  }
  const signed = await tripDocSignedUrls.getUrl(storagePath);
  if (signed) return signed;
  const { data: publicData } = supabase().storage.from(BUCKET).getPublicUrl(storagePath);
  return publicData.publicUrl;
}

/**
 * Strict preview URL — returns null when the storage object is missing/deleted.
 * Prefer this for galleries so deleted files do not become empty pages.
 */
export async function tryGetDocumentViewUrl(
  storagePath: string,
): Promise<string | null> {
  if (/^(blob:|data:|file:|content:)/i.test(storagePath.trim())) {
    return storagePath.trim();
  }
  if (isVehicleDocumentReferenceStoragePath(storagePath) || isDetailsMarkerPath(storagePath)) {
    return null;
  }
  // Web paints a downloaded Blob and signs only if that download fails, so a
  // pre-signed URL is an unused Storage call there. Native viewers use it.
  const signed = canMaterializeStoragePreview() ? null : await tripDocSignedUrls.getUrl(storagePath);
  const preview = await previewPrivateObject(BUCKET, storagePath, signed);
  return preview.url;
}

/**
 * Drop cached signed / blob preview for a path and resolve a fresh view URL.
 * Use when Image/PDF paint fails so Retry is not stuck on a dead cache entry.
 */
export async function refreshDocumentViewUrl(
  storagePath: string,
): Promise<string | null> {
  const path = storagePath.trim();
  if (!path) return null;
  if (/^(blob:|data:|file:|content:)/i.test(path)) return path;
  tripDocSignedUrls.invalidate(path);
  invalidateStoragePreviewPath(BUCKET, path);
  return tryGetDocumentViewUrl(path);
}

/** One storage round-trip for all uncached paths. Cached / in-flight paths are reused. */
function isDetailsMarkerPath(path: string): boolean {
  const base = path.trim().split("?")[0]?.split("/").pop()?.toLowerCase() ?? "";
  return base === "fields.json" || base.endsWith("-fields.json");
}

export async function getDocumentViewUrls(
  storagePaths: string[],
): Promise<Record<string, string | null>> {
  const physical = storagePaths.filter(
    (path) => !isVehicleDocumentReferenceStoragePath(path) && !isDetailsMarkerPath(path),
  );
  // Web downloads each object (see tryGetDocumentViewUrl) — skip the batch sign there.
  const signed =
    physical.length > 0 && !canMaterializeStoragePreview()
      ? await tripDocSignedUrls.getUrls(physical)
      : {};
  const byPath: Record<string, string | null> = {};
  await Promise.all(
    storagePaths.map(async (path) => {
      if (/^(blob:|data:|file:|content:)/i.test(path.trim())) {
        byPath[path] = path.trim();
        return;
      }
      if (isVehicleDocumentReferenceStoragePath(path) || isDetailsMarkerPath(path)) {
        byPath[path] = null;
        return;
      }
      const preview = await previewPrivateObject(BUCKET, path, signed[path] ?? null);
      byPath[path] = preview.url;
    }),
  );
  return byPath;
}

/** True for real storage objects; false for folder markers / placeholders after delete. */
export function isUsableStorageListObject(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.trim();
  if (!n || n.startsWith('.')) return false;
  if (n === '.emptyFolderPlaceholder') return false;
  // Real files have an extension; folder markers never do, but some placeholders do.
  return /\.[A-Za-z0-9]+$/.test(n);
}

/**
 * List documents for a trip (e.g. POD). Used to show count and enable Complete.
 * 1) Reads from trip_documents table (indexed by trip_id).
 * 2) If table returns no rows and includeStorageFallback is true, list storage
 *    prefix {tripId}/ so POD still shows when the file exists in storage but the
 *    table row is missing. Trip Detail defers this until the Documents/POD viewer.
 *
 * Storage listing is off unless the caller opts in. Production `storage.search`
 * has a 401 ms floor and a 24 s worst case, so a list or count must not pay it.
 */
export type GetDocumentsByTripIdOptions = {
  /** Join OCR jobs for LR rows. Default true for non–trip-detail callers. */
  includeOcr?: boolean;
  /**
   * List Storage when the table returns no rows. Off by default. Pass true only
   * for a viewer that must still show a legacy file with no trip_documents row.
   */
  includeStorageFallback?: boolean;
  /** Cap table rows (trip detail Docs tab). */
  limit?: number;
};

/** Same folder is not listed again while a viewer remounts or a second card asks. */
const STORAGE_FALLBACK_TTL_MS = 60_000;

type StorageFallbackResult = { documents: TripDocumentRow[]; error: Error | null };

const storageFallbackCache = new Map<string, { at: number; result: StorageFallbackResult }>();
const storageFallbackInflight = new Map<string, Promise<StorageFallbackResult>>();

/** Test hook. A real upload writes a trip_documents row, so the next read skips this cache. */
export function clearTripDocumentStorageFallbackCache(): void {
  storageFallbackCache.clear();
  storageFallbackInflight.clear();
}

export async function getDocumentsByTripId(
  tripId: string,
  options?: GetDocumentsByTripIdOptions,
): Promise<{ documents: TripDocumentRow[]; error: Error | null }> {
  const includeOcr = options?.includeOcr !== false;
  const includeStorageFallback = options?.includeStorageFallback === true;
  const runSelect = (columns: string) => {
    const q = supabase()
      .from("trip_documents")
      .select(columns)
      .eq("trip_id", tripId)
      .order("uploaded_at", { ascending: false });
    return options?.limit ? q.limit(options.limit) : q;
  };
  let { data, error } = await runSelect(TRIP_DOCUMENTS_SELECT_WITH_SOURCE);
  if (error && isMissingTripDocumentsColumn(error)) {
    ({ data, error } = await runSelect(TRIP_DOCUMENTS_SELECT));
  }
  let tableError: Error | null = null;
  let rows: TripDocumentRow[] = [];
  if (error) {
    tableError = new Error(error.message);
  } else {
    rows = (data ?? []).map((r) => {
      const row = r as unknown as TripDocumentRow;
      return {
        ...row,
        document_type: row.document_type ?? 'pod',
      };
    }) as TripDocumentRow[];
    if (rows.length > 0) {
      return {
        documents: includeOcr ? await attachLrOcrFields(rows) : rows,
        error: null,
      };
    }
  }

  if (!includeStorageFallback) {
    return { documents: [], error: tableError };
  }

  const cachedFallback = storageFallbackCache.get(tripId);
  if (cachedFallback && Date.now() - cachedFallback.at < STORAGE_FALLBACK_TTL_MS) {
    return cachedFallback.result;
  }
  const pendingFallback = storageFallbackInflight.get(tripId);
  if (pendingFallback) return pendingFallback;

  const listing = loadLegacyStorageDocuments(tripId, tableError).then((result) => {
    storageFallbackCache.set(tripId, { at: Date.now(), result });
    return result;
  });
  storageFallbackInflight.set(tripId, listing);
  void listing.finally(() => {
    if (storageFallbackInflight.get(tripId) === listing) storageFallbackInflight.delete(tripId);
  });
  return listing;
}

async function loadLegacyStorageDocuments(
  tripId: string,
  tableError: Error | null,
): Promise<{ documents: TripDocumentRow[]; error: Error | null }> {
  // Fallback: list storage folder for this trip so dispatcher/supplier can still preview POD
  const listed = await listLegacyStorageFolder(tripId);
  if (listed.truncated) {
    return { documents: [], error: new Error(LEGACY_STORAGE_TRUNCATED) };
  }
  const { data: listData, error: listError } = listed;
  if (listError || !listData || listData.length === 0) {
    return {
      documents: [],
      error: tableError ?? (listError ? new Error(listError.message) : null),
    };
  }

  // Supabase list() returns only immediate children — separate files (have a dot)
  // from subfolder entries (no dot). Old-style uploads are at tripId/uuid.jpg;
  // new-style uploads are inside tripId/{type}/uuid.jpg and appear as folder entries.
  const KNOWN_SUBFOLDER_TYPES: TripDocumentType[] = [
    'lr',
    'pod',
    'manifest',
    'invoice',
    'memo',
    'other',
    'bank_docs',
    'eway_bill',
    'loading_slip',
    'odometer_start_photo',
    'odometer_end_photo',
    'fuel_bill_photo',
    'toll_receipt_photo',
    'trip_expense_receipt_photo',
    'maintenance_invoice_photo',
  ];

  const topLevelFiles = newestStorageObjectsFirst(
    listData.filter((f) => isUsableStorageListObject(f.name)),
  );
  const subFolderEntries = listData.filter(
    (f) => f.name && !f.name.includes('.') && KNOWN_SUBFOLDER_TYPES.includes(f.name as TripDocumentType),
  );

  // Fetch files inside each recognised subfolder — bounded to at most
  // SUBFOLDER_LIST_CONCURRENCY in flight at once (was an unbounded Promise.all
  // across up to KNOWN_SUBFOLDER_TYPES.length subfolders per call, doubled by
  // useTripDetail's two independent viewer-open effects; see the 2026-09-16
  // Trip Document storage-fallback forensic report).
  const subFolderFilePairs = await runWithConcurrencyLimit(
    subFolderEntries,
    SUBFOLDER_LIST_CONCURRENCY,
    async (entry) => {
      const subListed = await listLegacyStorageFolder(`${tripId}/${entry.name}`);
      return {
        type: entry.name as TripDocumentType,
        truncated: subListed.truncated,
        files: newestStorageObjectsFirst(
          (subListed.data ?? []).filter((f) => isUsableStorageListObject(f.name)),
        ),
      };
    },
  );

  function makeStorageFallbackRow(
    file: { name: string; id?: string; updated_at?: string },
    storagePath: string,
    docType: TripDocumentType,
  ): TripDocumentRow {
    const fileWithMeta = file as { id?: string; updated_at?: string; name: string };
    return {
      id: fileWithMeta.id ?? `storage-${tripId}-${docType}-${fileWithMeta.name}`,
      trip_id: tripId,
      file_name: fileWithMeta.name,
      storage_path: storagePath,
      mime_type: null,
      size_bytes: null,
      uploaded_at: fileWithMeta.updated_at ?? new Date().toISOString(),
      uploaded_by: null,
      document_type: docType,
    };
  }

  if (subFolderFilePairs.some((pair) => pair.truncated)) {
    return { documents: [], error: new Error(LEGACY_STORAGE_TRUNCATED) };
  }

  const fallbackRows: TripDocumentRow[] = [
    // Old-style files directly under tripId/ — treat as pod (pre-refactor uploads)
    ...topLevelFiles.map((f) =>
      makeStorageFallbackRow(f as { name: string; id?: string; updated_at?: string }, `${tripId}/${f.name}`, 'pod'),
    ),
    // New-style files under tripId/{type}/ — type is the subfolder name
    ...subFolderFilePairs.flatMap(({ type, files }) =>
      files.map((f) =>
        makeStorageFallbackRow(f as { name: string; id?: string; updated_at?: string }, `${tripId}/${type}/${f.name}`, type),
      ),
    ),
  ].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());

  return { documents: fallbackRows, error: null };
}

/**
 * PODUploaded (docs/architecture/10-platform-event-catalog.md) — fires once per successful
 * 'pod' upload, at either of uploadTripDocument's two success returns (real trip_documents
 * insert, or the metadata-table-unavailable fallback that treats a durable storage write as
 * sufficient). No idempotency guard is needed here the way TripAssigned/TripStarted/TripDelivered
 * need one: every call generates a fresh storage path (randomUUID()), so there is no "retry of
 * the same commit" case to dedupe — each successful call is a genuinely new document.
 *
 * Also records the `pod.uploaded` trip_workflow_events entry (singleton, idempotent via its
 * own `${tripId}:pod.uploaded` key) — this is the only place that milestone is recorded, so
 * `deriveWorkflowState().docComplete` stays accurate.
 */
function publishPodUploadedEvent(
  tripId: string,
  doc: TripDocumentRow,
  organizationId?: string | null,
): void {
  const publish = (workspaceId: string) => {
    void recordTripWorkflowEvent({
      tripId,
      orgId: workspaceId,
      eventType: "pod.uploaded",
    }).catch((err) => {
      if (__DEV__) console.warn("[tripDocuments] recordTripWorkflowEvent(pod.uploaded) failed:", err);
    });
    return getPlatformEventBus().publish({
      name: "PODUploaded",
      workspaceId,
      correlationId: randomUUID(),
      occurredAt: new Date().toISOString(),
      payload: {
        tripId,
        documentId: doc.id,
        storagePath: doc.storage_path,
        fileName: doc.file_name,
        uploadedBy: doc.uploaded_by ?? null,
      },
    });
  };
  const knownOrgId = organizationId?.trim() ?? "";
  if (knownOrgId) {
    void Promise.resolve(publish(knownOrgId)).catch((err: unknown) => {
      if (__DEV__) console.warn("[tripDocuments] PODUploaded publish failed:", err);
    });
    return;
  }
  void Promise.resolve(
    supabase().from("trips").select("organization_id").eq("id", tripId).maybeSingle(),
  )
    .then(({ data, error }) => {
      const workspaceId = !error && data ? (data as { organization_id?: string | null }).organization_id : null;
      if (!workspaceId) return;
      return publish(workspaceId);
    })
    .catch((err: unknown) => {
      if (__DEV__) console.warn("[tripDocuments] PODUploaded publish failed:", err);
    });
}

type ReplacedTripDocumentSnapshot = {
  id: string;
  file_name: string;
  storage_path: string;
  document_number: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  status: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
};

/**
 * Writes a `document_audit_log` row (action='replaced') snapshotting the
 * superseded document's full state — same entity_type/entity_id convention
 * `verify_trip_document` already uses for trip_documents (entity_id is the
 * trip_documents.id, document_id stays null since that FK targets
 * entity_documents, not trip_documents). Best-effort: swallows its own
 * errors so a legitimate replace is never blocked by an audit-write hiccup.
 */
async function recordTripDocumentReplacedAudit(params: {
  tripId: string;
  existing: ReplacedTripDocumentSnapshot;
  newStoragePath: string;
  newFileName: string;
  actorId: string;
  organizationId?: string | null;
}): Promise<void> {
  const { tripId, existing, newStoragePath, newFileName, actorId } = params;
  try {
    let organizationId = params.organizationId?.trim() || null;
    if (!organizationId) {
      const { data: trip, error: tripError } = await supabase()
        .from("trips")
        .select("organization_id")
        .eq("id", tripId)
        .maybeSingle();
      organizationId = !tripError
        ? (trip as { organization_id?: string | null } | null)?.organization_id ?? null
        : null;
    }
    if (!organizationId) return;

    await supabase()
      .from("document_audit_log")
      .insert({
        document_id: null,
        organization_id: organizationId,
        entity_type: "trip_document",
        entity_id: existing.id,
        action: "replaced",
        actor_id: actorId,
        old_status: existing.status ?? "pending",
        new_status: "pending",
        notes: `Replaced by re-upload (${newFileName}).`,
        metadata: {
          old_storage_path: existing.storage_path,
          old_file_name: existing.file_name,
          old_document_number: existing.document_number,
          old_uploaded_by: existing.uploaded_by,
          old_uploaded_at: existing.uploaded_at,
          old_verified_by: existing.verified_by,
          old_verified_at: existing.verified_at,
          old_rejection_reason: existing.rejection_reason,
          new_storage_path: newStoragePath,
          new_file_name: newFileName,
        },
      });
  } catch (err) {
    if (__DEV__) console.warn("[tripDocuments] recordTripDocumentReplacedAudit failed:", err);
  }
}

/**
 * Trip Activity looks up `document_audit_log` by `entity_id ∈ { tripId, live doc ids }`.
 * Create + delete are keyed on `trip_id` so both survive after the row is gone
 * (live "uploaded" milestones disappear with the row). Best-effort.
 */
async function resolveTripOrgAndActor(
  tripId: string,
  organizationIdHint?: string | null,
): Promise<{ organizationId: string; actorId: string | null } | null> {
  let organizationId = organizationIdHint?.trim() || null;
  const authPromise = supabase().auth.getUser();
  if (!organizationId) {
    const { data: trip, error: tripError } = await supabase()
      .from("trips")
      .select("organization_id")
      .eq("id", tripId)
      .maybeSingle();
    organizationId = !tripError
      ? (trip as { organization_id?: string | null } | null)?.organization_id ?? null
      : null;
  }
  if (!organizationId) return null;
  const auth = await authPromise;
  return { organizationId, actorId: auth.data?.user?.id ?? null };
}

async function recordTripDocumentCreatedAudit(
  doc: TripDocumentRow,
  organizationIdHint?: string | null,
): Promise<void> {
  const tripId = String(doc.trip_id ?? "").trim();
  if (!tripId || doc.id.startsWith("storage-")) return;
  try {
    const resolved = await resolveTripOrgAndActor(tripId, organizationIdHint);
    if (!resolved) return;
    const fileName = String(doc.file_name ?? "").trim();
    const documentType = String(doc.document_type ?? "").trim();
    await supabase().from("document_audit_log").insert({
      document_id: null,
      organization_id: resolved.organizationId,
      entity_type: "trip_document",
      entity_id: tripId,
      action: "created",
      actor_id: resolved.actorId ?? doc.uploaded_by ?? null,
      old_status: null,
      new_status: doc.status ?? "pending",
      notes: fileName ? `Added ${fileName} to this trip.` : "Document added to this trip.",
      metadata: {
        trip_document_id: doc.id,
        document_type: documentType || null,
        file_name: fileName || null,
        storage_path: doc.storage_path,
        document_number: doc.document_number ?? null,
        uploaded_by: doc.uploaded_by,
        uploaded_at: doc.uploaded_at,
      },
    });
  } catch (err) {
    if (__DEV__) console.warn("[tripDocuments] recordTripDocumentCreatedAudit failed:", err);
  }
}

async function recordTripDocumentDeletedAudit(doc: TripDocumentRow): Promise<void> {
  const tripId = String(doc.trip_id ?? "").trim();
  if (!tripId) return;
  try {
    const resolved = await resolveTripOrgAndActor(tripId);
    if (!resolved) return;
    const fileName = String(doc.file_name ?? "").trim();
    const documentType = String(doc.document_type ?? "").trim();

    await supabase().from("document_audit_log").insert({
      document_id: null,
      organization_id: resolved.organizationId,
      entity_type: "trip_document",
      // Trip id so Activity still finds this after the row is gone.
      entity_id: tripId,
      action: "deleted",
      actor_id: resolved.actorId,
      old_status: doc.status ?? null,
      new_status: null,
      notes: fileName ? `Removed ${fileName} from this trip.` : "Document removed from this trip.",
      metadata: {
        trip_document_id: doc.id,
        document_type: documentType || null,
        file_name: fileName || null,
        old_file_name: fileName || null,
        storage_path: doc.storage_path,
        document_number: doc.document_number ?? null,
        uploaded_by: doc.uploaded_by,
        uploaded_at: doc.uploaded_at,
      },
    });
  } catch (err) {
    if (__DEV__) console.warn("[tripDocuments] recordTripDocumentDeletedAudit failed:", err);
  }
}

type UploadTripDocumentOptions = {
  stopId?: string | null;
  replaceExistingOfType?: boolean;
  /** Replace this exact row in place (same rules as replaceExistingOfType). */
  replaceDocumentId?: string | null;
  organizationId?: string | null;
};

/**
 * Upload a trip document. Pass documentType to correctly classify the file.
 * Storage path: {tripId}/{documentType}/{uuid}.{ext}
 */
export async function uploadTripDocument(
  tripId: string,
  uploadedBy: string,
  file: { arrayBuffer?: ArrayBuffer; blob?: Blob; fileName: string; mimeType: string },
  documentType: TripDocumentType = 'pod',
  documentNumber?: string,
  options?: UploadTripDocumentOptions,
): Promise<UploadTripDocumentResult> {
  try {
    return await uploadTripDocumentRow(tripId, uploadedBy, file, documentType, documentNumber, options);
  } finally {
    if (documentType === "lr") invalidateOrgLrIndexForTrip(tripId);
  }
}

async function uploadTripDocumentRow(
  tripId: string,
  uploadedBy: string,
  file: { arrayBuffer?: ArrayBuffer; blob?: Blob; fileName: string; mimeType: string },
  documentType: TripDocumentType,
  documentNumber: string | undefined,
  options: UploadTripDocumentOptions | undefined,
): Promise<UploadTripDocumentResult> {
  const byteLength = file.blob?.size ?? file.arrayBuffer?.byteLength ?? 0;
  const body = file.blob ?? file.arrayBuffer;
  if (!body || byteLength <= 0) {
    return { doc: null, error: new Error("File is empty") };
  }
  if (byteLength > MAX_TRIP_DOC_BYTES) {
    return {
      doc: null,
      error: new Error(
        `File too large (${formatMb(byteLength)}). Maximum is ${formatMb(MAX_TRIP_DOC_BYTES)}.`,
      ),
    };
  }
  if (documentType === "lr") {
    const lrNumber = lrNumberFromStoredDocumentNumber(documentNumber);
    if (lrNumber) {
      let duplicate: Awaited<ReturnType<typeof checkOrgDuplicateLrNumbersForTrip>>;
      try {
        duplicate = await checkOrgDuplicateLrNumbersForTrip({ tripId, lrNumbers: [lrNumber] });
      } catch (e) {
        return { doc: null, error: e instanceof Error ? e : new Error(String(e)) };
      }
      if (duplicate) {
        return { doc: null, error: new Error(ORG_LR_DUPLICATE_MESSAGE) };
      }
    }
  }
  const ext = file.fileName.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tripId}/${documentType}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase()
    .storage.from(BUCKET)
    .upload(path, body, {
      contentType: file.mimeType || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    return {
      doc: null,
      error: new Error(uploadError.message),
    };
  }

  const trimmedDocumentNumber = documentNumber?.trim() || null;
  const stopId = options?.stopId?.trim() || null;
  const tripDocSelect =
    "id, trip_id, file_name, storage_path, mime_type, size_bytes, uploaded_at, uploaded_by, document_type, document_number, ocr_job_id";
  const metadata = {
    trip_id: tripId,
    file_name: file.fileName,
    storage_path: path,
    mime_type: file.mimeType || null,
    size_bytes: byteLength,
    uploaded_by: uploadedBy,
    document_type: documentType,
    document_number: trimmedDocumentNumber,
    ...(stopId ? { stop_id: stopId } : {}),
  };

  if (options?.replaceExistingOfType || options?.replaceDocumentId) {
    const existingQuery = supabase()
      .from("trip_documents")
      .select(
        "id, file_name, storage_path, document_number, uploaded_at, uploaded_by, status, verified_by, verified_at, rejection_reason",
      )
      .eq("trip_id", tripId)
      .eq("document_type", documentType);
    const { data: existingRows, error: existingError } = await (options?.replaceDocumentId
      ? existingQuery.eq("id", options.replaceDocumentId).limit(1)
      : existingQuery.order("uploaded_at", { ascending: false }).limit(1));
    if (existingError && !isTripDocumentsMetaTableUnavailable(existingError)) {
      return { doc: null, error: new Error(existingError.message) };
    }
    const existing = existingRows?.[0];
    if (options?.replaceDocumentId && !existing?.id) {
      return { doc: null, error: new Error("This file no longer exists. Refresh and try again.") };
    }
    if (existing?.id && !String(existing.id).startsWith("storage-")) {
      const replacePatch = {
        file_name: file.fileName,
        storage_path: path,
        mime_type: file.mimeType || null,
        size_bytes: byteLength,
        uploaded_by: uploadedBy,
        document_number: trimmedDocumentNumber,
        status: "pending",
        verified_by: null,
        verified_at: null,
        rejection_reason: null,
        source_entity_document_id: null,
        ...(stopId ? { stop_id: stopId } : {}),
      };
      let { data: updated, error: updateError } = await supabase()
        .from("trip_documents")
        .update(replacePatch)
        .eq("id", existing.id)
        .select(tripDocSelect)
        .single();
      if (updateError && isMissingTripDocumentsColumn(updateError)) {
        const { source_entity_document_id: _pin, ...legacyPatch } = replacePatch;
        const retried = await supabase()
          .from("trip_documents")
          .update(legacyPatch)
          .eq("id", existing.id)
          .select(tripDocSelect)
          .single();
        updated = retried.data;
        updateError = retried.error;
      }
      if (updateError) {
        return { doc: null, error: new Error(updateError.message) };
      }
      // Preserve the superseded version's history: what it was, who uploaded
      // and verified it, and when — before it's overwritten above. Never
      // deletes the old storage file, so its content stays retrievable via
      // this audit row's metadata.old_storage_path. Best-effort: a failure
      // here must not block a legitimate replace.
      void recordTripDocumentReplacedAudit({
        tripId,
        existing,
        newStoragePath: path,
        newFileName: file.fileName,
        actorId: uploadedBy,
        organizationId: options?.organizationId,
      });
      const replacedDoc = {
        ...(updated as TripDocumentRow),
        document_type: ((updated as TripDocumentRow).document_type ?? documentType) as TripDocumentType,
      };
      if (documentType === "pod") {
        publishPodUploadedEvent(tripId, replacedDoc, options?.organizationId);
      }
      return { doc: replacedDoc, error: null };
    }
  }

  const { data: row, error: insertError } = await supabase()
    .from("trip_documents")
    .insert(metadata)
    .select(tripDocSelect)
    .single();

  if (insertError) {
    if (isTripDocumentsMetaTableUnavailable(insertError)) {
      const now = new Date().toISOString();
      const syntheticId = `storage-meta-${randomUUID()}`;
      const fallbackDoc: TripDocumentRow = {
        id: syntheticId,
        trip_id: tripId,
        file_name: file.fileName,
        storage_path: path,
        mime_type: file.mimeType || null,
        size_bytes: file.arrayBuffer?.byteLength ?? byteLength,
        uploaded_at: now,
        uploaded_by: uploadedBy,
        document_type: documentType,
        document_number: trimmedDocumentNumber,
      };
      if (documentType === "pod") {
        publishPodUploadedEvent(tripId, fallbackDoc, options?.organizationId);
      }
      return { doc: fallbackDoc, error: null };
    }
    if (isTripDocumentsStoragePathConflict(insertError)) {
      const { data: existingByPath } = await supabase()
        .from("trip_documents")
        .select(tripDocSelect)
        .eq("storage_path", path)
        .maybeSingle();
      if (existingByPath) {
        return {
          doc: {
            ...(existingByPath as TripDocumentRow),
            document_type: ((existingByPath as TripDocumentRow).document_type ?? documentType) as TripDocumentType,
          },
          error: null,
        };
      }
      return {
        doc: null,
        error: new Error(
          "This file is already on the trip. Close Review and open it again, or use Replace on the existing row.",
        ),
      };
    }
    return {
      doc: null,
      error: new Error(insertError.message),
    };
  }

  const insertedDoc = {
    ...(row as TripDocumentRow),
    document_type: ((row as TripDocumentRow).document_type ?? documentType) as TripDocumentType,
  } as TripDocumentRow;
  // Durable create event — live milestones vanish when the row is deleted.
  void recordTripDocumentCreatedAudit(insertedDoc, options?.organizationId);
  if (documentType === "pod") {
    publishPodUploadedEvent(tripId, insertedDoc, options?.organizationId);
  }
  return { doc: insertedDoc, error: null };
}

/**
 * Upload a trip image for chat/progress updates only (non-POD).
 * Stores the file under a dedicated folder and does not create a trip_documents row.
 */
export async function uploadTripChatImage(
  tripId: string,
  file: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string },
): Promise<{ result: UploadTripChatImageResult | null; error: Error | null }> {
  if (!file.arrayBuffer?.byteLength) {
    return { result: null, error: new Error("Image is empty") };
  }
  if (file.arrayBuffer.byteLength > MAX_TRIP_CHAT_IMAGE_BYTES) {
    return {
      result: null,
      error: new Error(
        `Chat image too large (${formatMb(file.arrayBuffer.byteLength)}). Maximum is ${formatMb(MAX_TRIP_CHAT_IMAGE_BYTES)}.`,
      ),
    };
  }
  const ext = file.fileName.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tripId}/chat/${randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase()
    .storage.from(BUCKET)
    .upload(path, file.arrayBuffer, {
      contentType: file.mimeType || "image/jpeg",
      upsert: false,
    });
  if (uploadError) {
    return {
      result: null,
      error: new Error(uploadError.message),
    };
  }
  return {
    result: {
      fileName: file.fileName,
      mimeType: file.mimeType || null,
      storagePath: path,
    },
    error: null,
  };
}

/**
 * Remove a POD file from storage and the trip_documents row (when present).
 * Synthetic IDs from storage fallback list still delete by storage_path only.
 * Writes a `document_audit_log` 'deleted' row (who / when) for Trip Activity.
 */
export async function deleteTripDocument(doc: TripDocumentRow): Promise<{ error: Error | null }> {
  // Row first: when the database refuses (approved / locked document), the file
  // must stay, or the row would point at a file that no longer exists.
  const synthetic = doc.id.startsWith("storage-") || doc.id.startsWith("storage-meta-");
  // The cached row can be stale: re-read the status so an approved document is
  // never sent for deletion (and no 'deleted' audit row is written for it).
  if (!synthetic) {
    const { data: current } = await supabase()
      .from("trip_documents")
      .select("status")
      .eq("id", doc.id)
      .maybeSingle();
    if (String((current as { status?: string | null } | null)?.status ?? "") === "verified") {
      return { error: new Error("Approved documents cannot be deleted.") };
    }
  }
  // Snapshot audit before the row disappears so Activity keeps who deleted / when.
  await recordTripDocumentDeletedAudit(doc);
  if (!synthetic) {
    const { data: deleted, error: dbErr } = await supabase()
      .from("trip_documents")
      .delete()
      .eq("id", doc.id)
      .select("id");
    if (dbErr) {
      // REST 404 / PGRST205: relation missing from API — storage remove still clears the file.
      if (isTripDocumentsRestEndpointMissing(dbErr)) {
        const { error: storageErr } = await supabase().storage.from(BUCKET).remove([doc.storage_path]);
        if (storageErr) return { error: new Error(storageErr.message) };
        tripDocSignedUrls.invalidate(doc.storage_path);
        return { error: null };
      }
      return { error: new Error(dbErr.message) };
    }
    if ((deleted ?? []).length === 0) {
      return { error: new Error("This document could not be deleted. Refresh and try again.") };
    }
  }

  const { error: storageErr } = await supabase().storage.from(BUCKET).remove([doc.storage_path]);
  if (storageErr) {
    return {
      error: new Error(
        `The document record was removed, but the file may still be in storage. ${storageErr.message}`,
      ),
    };
  }
  tripDocSignedUrls.invalidate(doc.storage_path);
  return { error: null };
}

/**
 * Check if a trip has at least one POD document uploaded.
 * Informational only — trip completion does not require a POD (R2).
 */
export async function hasPodDocument(tripId: string): Promise<boolean> {
  const { data, error } = await supabase()
    .from('trip_documents')
    .select('id')
    .eq('trip_id', tripId)
    .eq('document_type', 'pod')
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

/**
 * Check if a trip has an LR (Lorry Receipt) uploaded.
 * Used to confirm goods are picked up / in transit.
 */
export async function hasLrDocument(tripId: string): Promise<boolean> {
  const { data, error } = await supabase()
    .from('trip_documents')
    .select('id')
    .eq('trip_id', tripId)
    .eq('document_type', 'lr')
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

export async function updateTripDocumentNumber(
  documentId: string,
  documentNumber: string,
): Promise<Error | null> {
  const trimmed = documentNumber.trim();
  if (!trimmed || documentId.startsWith("storage-")) return null;
  const lrNumber = lrNumberFromStoredDocumentNumber(trimmed);
  let lrTripId = "";
  if (lrNumber) {
    const { data: row } = await supabase()
      .from("trip_documents")
      .select("trip_id, document_type")
      .eq("id", documentId)
      .maybeSingle();
    const tripId = String((row as { trip_id?: string } | null)?.trip_id ?? "").trim();
    const docType = String((row as { document_type?: string } | null)?.document_type ?? "");
    if (tripId && docType === "lr") {
      lrTripId = tripId;
      let duplicate: Awaited<ReturnType<typeof checkOrgDuplicateLrNumbersForTrip>>;
      try {
        duplicate = await checkOrgDuplicateLrNumbersForTrip({ tripId, lrNumbers: [lrNumber] });
      } catch (e) {
        return e instanceof Error ? e : new Error(String(e));
      }
      if (duplicate) return new Error(ORG_LR_DUPLICATE_MESSAGE);
    }
  }
  const { error } = await supabase()
    .from("trip_documents")
    .update({ document_number: trimmed })
    .eq("id", documentId);
  if (lrNumber && lrTripId) invalidateOrgLrIndexForTrip(lrTripId);
  return error ? new Error(error.message) : null;
}

const EWAY_NUMBER_NOT_SAVED =
  "The e-way bill number was not saved. This document cannot be changed right now.";

/**
 * Persist e-way bill fields typed in the strip (one or more numbers).
 * Reuses an existing e-way file row when present; otherwise stores a metadata-only row.
 * Writes document_number only. Touching uploaded_at is rejected for anyone who
 * is not a trip-org manager, so the number looked saved and then came back blank.
 */
export async function upsertEwayBillFields(input: {
  tripId: string;
  uploadedBy: string;
  values: EwayFieldValues[];
}): Promise<{ error: Error | null }> {
  const serialized = serializeEwayFieldEntries(input.values);
  const writeNumber = async (
    documentId: string,
  ): Promise<{ error: Error | null; saved: boolean }> => {
    const { data, error } = await supabase()
      .from("trip_documents")
      .update({ document_number: serialized })
      .eq("id", documentId)
      .select("id");
    if (error) return { error: new Error(error.message), saved: false };
    return { error: null, saved: (data ?? []).length > 0 };
  };
  const listed = await listEwayFieldsRows(input.tripId);
  if (listed.error) {
    if (isTripDocumentsRestEndpointMissing(listed.error)) {
      return {
        error: new Error(
          "E-way bill details cannot be saved until trip documents are available.",
        ),
      };
    }
    return { error: new Error(listed.error.message) };
  }
  // Write to the row the screens read (newest row holding numbers). Writing to
  // any other file row made a save look ignored, and put the numbers on a file
  // whose removal later erased them.
  const target = ewayFieldsWriteTarget(listed.rows);

  if (target) {
    const written = await writeNumber(target.id);
    if (!written.error && written.saved) {
      await clearStaleEwayEntryLists(listed.rows, target.id);
      return { error: null };
    }
    // Refused on the row the screens read (e.g. Ground Ops on a locked trip may
    // only change their own recent upload): put the whole list on the newest
    // e-way row instead. The screens read the newest row holding numbers, so
    // the full list still shows.
    const newest = sortEwayRowsNewestFirst(listed.rows)[0];
    if (newest && newest.id !== target.id) {
      const retried = await writeNumber(newest.id);
      if (!retried.error && retried.saved) {
        await clearStaleEwayEntryLists(listed.rows, newest.id);
        return { error: null };
      }
    }
    if (written.error) return { error: written.error };
    return { error: new Error(EWAY_NUMBER_NOT_SAVED) };
  }

  const path = ewayBillFieldsStoragePath(input.tripId);
  const { error: insertError } = await supabase()
    .from("trip_documents")
    .insert({
      trip_id: input.tripId,
      file_name: EWAY_BILL_FIELDS_FILE_NAME,
      storage_path: path,
      mime_type: "application/json",
      size_bytes: 0,
      uploaded_by: input.uploadedBy,
      document_type: "eway_bill",
      document_number: serialized,
    });

  if (!insertError) return { error: null };
  if (insertError.code === "23505") {
    const { data, error: updateError } = await supabase()
      .from("trip_documents")
      .update({ document_number: serialized })
      .eq("storage_path", path)
      .select("id");
    if (updateError) return { error: new Error(updateError.message) };
    if ((data ?? []).length === 0) return { error: new Error(EWAY_NUMBER_NOT_SAVED) };
    return { error: null };
  }
  return { error: new Error(insertError.message) };
}

/**
 * Older copies of the entry list left on other e-way rows (written there by
 * the old save) are not shown on Trip Detail, but the Trips hub tags, expiry
 * badge and e-LR prefill read every row, so they showed numbers that had been
 * changed or removed. Once a save has landed, clear those copies. Plain single
 * numbers (Trips hub sheet) are left alone. Best effort: a refused clear
 * (e.g. Ground Ops on a locked trip) does not undo the save.
 */
async function clearStaleEwayEntryLists(rows: readonly EwayFieldsRow[], keepId: string): Promise<void> {
  const stale = rows
    .filter((row) => row.id !== keepId && isEwayEntriesJson(row.document_number))
    .map((row) => row.id);
  if (stale.length === 0) return;
  await supabase().from("trip_documents").update({ document_number: null }).in("id", stale);
}

/**
 * Numbers typed per e-way file (Trips hub update sheet) go into the trip's
 * one e-way entry list, linked to their file — never onto the file rows,
 * where a single number hid the list from Trip Detail / Compliance.
 * `typedByPath` maps a file's storage path to the number typed for it.
 */
export async function saveEwayNumbersByFile(input: {
  tripId: string;
  uploadedBy: string;
  typedByPath: Record<string, string>;
}): Promise<{ error: Error | null }> {
  const listed = await listEwayFieldsRows(input.tripId);
  if (listed.error) return { error: new Error(listed.error.message) };
  const entries = parseEwayFieldEntries(ewayFieldsSourceRow(listed.rows)?.document_number);
  const filePaths = sortEwayRowsNewestFirst(listed.rows)
    .filter((row) => !isEwayBillMetaPath(row.storage_path, row.file_name))
    .map((row) => row.storage_path?.trim() ?? "")
    .filter(Boolean);
  const next = applyEwayNumbersByFile({ entries, filePaths, typedByPath: input.typedByPath });
  if (!next.changed) return { error: null };
  return upsertEwayBillFields({ tripId: input.tripId, uploadedBy: input.uploadedBy, values: next.entries });
}

/**
 * Attach an uploaded e-way file to an existing entry that has no file yet
 * (Upload pressed on that entry's card). Re-reads the current list so a save
 * made meanwhile is not overwritten; the entry must still be at `entryIndex`
 * with the same number, else nothing changes.
 */
export async function linkEwayEntryToFile(input: {
  tripId: string;
  uploadedBy: string;
  entryIndex: number;
  ewayNo: string;
  filePath: string;
}): Promise<{ error: Error | null; linked: boolean }> {
  const listed = await listEwayFieldsRows(input.tripId);
  if (listed.error) return { error: new Error(listed.error.message), linked: false };
  const entries = parseEwayFieldEntries(ewayFieldsSourceRow(listed.rows)?.document_number);
  const entry = entries[input.entryIndex];
  if (!entry || entry.filePath || entry.ewayNo !== input.ewayNo) return { error: null, linked: false };
  entries[input.entryIndex] = { ...entry, filePath: input.filePath };
  const saved = await upsertEwayBillFields({ tripId: input.tripId, uploadedBy: input.uploadedBy, values: entries });
  return { error: saved.error, linked: !saved.error };
}

/**
 * Add one new e-way bill with its own document: upload the file, then add
 * the number to the trip's list linked to that file (list re-read first, so
 * a save made meanwhile is kept). A new e-way bill always has its document —
 * a number-only entry used to show the trip's first e-way image instead.
 */
export async function addEwayBillWithFile(input: {
  tripId: string;
  uploadedBy: string;
  organizationId?: string | null;
  entry: EwayFieldValues;
  file: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string };
}): Promise<{ error: Error | null }> {
  const { doc, error: uploadError } = await uploadTripDocument(
    input.tripId,
    input.uploadedBy,
    input.file,
    "eway_bill",
    undefined,
    { organizationId: input.organizationId ?? null },
  );
  if (uploadError) return { error: uploadError };
  const filePath = doc?.storage_path?.trim();
  if (!filePath) return { error: new Error("The e-way bill document was not saved. Try again.") };
  const listed = await listEwayFieldsRows(input.tripId);
  if (listed.error) {
    return { error: new Error(`The document was uploaded, but the e-way number was not saved: ${listed.error.message}`) };
  }
  const entries = parseEwayFieldEntries(ewayFieldsSourceRow(listed.rows)?.document_number);
  const saved = await upsertEwayBillFields({
    tripId: input.tripId,
    uploadedBy: input.uploadedBy,
    values: [...entries, { ...input.entry, filePath }],
  });
  if (saved.error) {
    return {
      error: new Error(
        `The document was uploaded, but the e-way number was not saved: ${saved.error.message} Use Edit on its card to add the number.`,
      ),
    };
  }
  return { error: null };
}

type EwayFieldsRow = {
  id: string;
  storage_path: string;
  file_name: string;
  uploaded_at: string | null;
  document_number: string | null;
};

async function listEwayFieldsRows(
  tripId: string,
): Promise<{ rows: EwayFieldsRow[]; error: { message: string; code?: string } | null }> {
  const { data, error } = await supabase()
    .from("trip_documents")
    .select("id, storage_path, file_name, uploaded_at, document_number")
    .eq("trip_id", tripId)
    .eq("document_type", "eway_bill");
  if (error) return { rows: [], error };
  const rows = ((data ?? []) as EwayFieldsRow[]).filter((row) => !row.id.startsWith("storage-"));
  return { rows, error: null };
}

const EWAY_NUMBERS_NOT_KEPT =
  "Nothing was removed: the e-way numbers saved with this file could not be kept on another e-way row.";

/**
 * Remove one e-way bill file without losing the trip's e-way numbers.
 * The numbers live on one e-way row; when that is the row being removed, they
 * are first copied to the row the screens read next (or a new details row),
 * and only then is the file deleted. If the copy fails, nothing is deleted.
 */
export async function deleteEwayBillDocument(
  doc: TripDocumentRow,
  uploadedBy: string | null | undefined,
): Promise<{ error: Error | null }> {
  if (doc.id.startsWith("storage-")) return deleteTripDocument(doc);
  const listed = await listEwayFieldsRows(doc.trip_id);
  if (listed.error) return { error: new Error(listed.error.message) };
  const carry = ewayFieldsCarryOnDelete(listed.rows, doc.id);
  if (carry.kind === "move") {
    const { data, error } = await supabase()
      .from("trip_documents")
      .update({ document_number: carry.documentNumber })
      .eq("id", carry.toId)
      .select("id");
    if (error) return { error: new Error(`${EWAY_NUMBERS_NOT_KEPT} ${error.message}`) };
    if ((data ?? []).length === 0) return { error: new Error(EWAY_NUMBERS_NOT_KEPT) };
  } else if (carry.kind === "create") {
    if (!uploadedBy) return { error: new Error(EWAY_NUMBERS_NOT_KEPT) };
    const { error } = await supabase()
      .from("trip_documents")
      .insert({
        trip_id: doc.trip_id,
        file_name: EWAY_BILL_FIELDS_FILE_NAME,
        storage_path: ewayBillFieldsStoragePath(doc.trip_id),
        mime_type: "application/json",
        size_bytes: 0,
        uploaded_by: uploadedBy,
        document_type: "eway_bill",
        document_number: carry.documentNumber,
      });
    if (error) return { error: new Error(`${EWAY_NUMBERS_NOT_KEPT} ${error.message}`) };
  }
  return deleteTripDocument(doc);
}

function uniqueExpandedLrNumbers(raw: string): string[] {
  return Array.from(
    new Set(
      expandLR(raw)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

/**
 * Persist LR numbers typed in POD Overview (one or more, comma/range).
 * Reuses an existing LR file row when present; otherwise stores a metadata-only row.
 */
export async function upsertTripLrNumbers(input: {
  tripId: string;
  uploadedBy: string;
  lrInput: string;
}): Promise<{ error: Error | null; lrNumbers: string[] }> {
  try {
    return await writeTripLrNumbers(input);
  } finally {
    invalidateOrgLrIndexForTrip(input.tripId);
  }
}

async function writeTripLrNumbers(input: {
  tripId: string;
  uploadedBy: string;
  lrInput: string;
}): Promise<{ error: Error | null; lrNumbers: string[] }> {
  const lrNumbers = uniqueExpandedLrNumbers(input.lrInput);
  // One org index for the whole range — a range like 100-150 used to run 51 full sweeps.
  let duplicate: Awaited<ReturnType<typeof checkOrgDuplicateLrNumbersForTrip>>;
  try {
    duplicate = await checkOrgDuplicateLrNumbersForTrip({ tripId: input.tripId, lrNumbers });
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), lrNumbers: [] };
  }
  if (duplicate) {
    return { error: new Error(ORG_LR_DUPLICATE_MESSAGE), lrNumbers: [] };
  }
  const { data, error: listError } = await supabase()
    .from("trip_documents")
    .select("id, storage_path, file_name, document_number")
    .eq("trip_id", input.tripId)
    .eq("document_type", "lr");

  if (listError) {
    if (isTripDocumentsRestEndpointMissing(listError)) {
      return {
        error: new Error(
          "LR numbers cannot be saved until trip documents are available.",
        ),
        lrNumbers: [],
      };
    }
    return { error: new Error(listError.message), lrNumbers: [] };
  }

  const rows = (data ?? []) as {
    id: string;
    storage_path: string;
    file_name: string;
    document_number: string | null;
  }[];
  const persisted = rows.filter((row) => !row.id.startsWith("storage-"));
  const target =
    persisted.find(
      (row) => !isLrFieldsMetaPath(row.storage_path, row.file_name),
    ) ??
    persisted.find((row) =>
      isLrFieldsMetaPath(row.storage_path, row.file_name),
    ) ??
    persisted[0];

  const existingFields = parseLrFieldValues(target?.document_number);
  const serialized = serializeLrFieldValues({
    lrNumber: lrNumbers.join(", "),
    date: existingFields.date,
    invoice: existingFields.invoice,
  });

  const applyOnRow = async (documentId: string): Promise<Error | null> => {
    const { error } = await supabase()
      .from("trip_documents")
      .update({ document_number: serialized || null })
      .eq("id", documentId);
    return error ? new Error(error.message) : null;
  };

  if (target) {
    const updateError = await applyOnRow(target.id);
    if (updateError) return { error: updateError, lrNumbers: [] };
    const siblings = persisted.filter((row) => row.id !== target.id);
    for (const sibling of siblings) {
      const { error: clearError } = await supabase()
        .from("trip_documents")
        .update({ document_number: null })
        .eq("id", sibling.id);
      if (clearError) return { error: new Error(clearError.message), lrNumbers: [] };
    }
    return { error: null, lrNumbers };
  }

  if (lrNumbers.length === 0) {
    return { error: null, lrNumbers: [] };
  }

  const path = lrFieldsStoragePath(input.tripId);
  const { error: insertError } = await supabase()
    .from("trip_documents")
    .insert({
      trip_id: input.tripId,
      file_name: LR_FIELDS_FILE_NAME,
      storage_path: path,
      mime_type: "application/json",
      size_bytes: 0,
      uploaded_by: input.uploadedBy,
      document_type: "lr",
      document_number: serialized,
    });

  if (!insertError) return { error: null, lrNumbers };
  if (insertError.code === "23505") {
    const { error: updateError } = await supabase()
      .from("trip_documents")
      .update({ document_number: serialized })
      .eq("storage_path", path);
    return {
      error: updateError ? new Error(updateError.message) : null,
      lrNumbers,
    };
  }
  return { error: new Error(insertError.message), lrNumbers: [] };
}
