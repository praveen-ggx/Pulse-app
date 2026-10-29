/**
 * Reusable Workspace Vehicle Documents — Trip Compliance.
 *
 * Lets a compliance reviewer attach an already-verified vehicle document
 * (public.entity_documents, entity_type = 'vehicle') as a trip's own 'rc'/
 * 'insurance' compliance evidence, without re-uploading the file and without
 * duplicating it into storage. See migration
 * 20260921144726_use_vehicle_document_for_trip.sql for the full architecture
 * rationale (why entity_documents — not the vehicles.documents vault — is
 * the reuse source, and why a reused trip_documents row's storage_path is a
 * synthetic reference marker rather than a copied file).
 *
 * The write path goes through the `use_vehicle_document_for_trip` SECURITY
 * DEFINER RPC — never a direct trip_documents insert/update — so every
 * eligibility/authorization check (org match, vehicle match, doc type match,
 * verified status, expiry) is enforced server-side, not just in this file.
 * This service only pre-flights the same checks client-side so the UI can
 * show "Existing document found — expired" instead of offering a doomed
 * action, and reads use the existing `getDocumentsByEntity` /
 * `getComplianceDocumentSignedUrl` (features/compliance/services/
 * documents.service.ts) — no second document store, no second preview path.
 */
import { supabase } from "@/lib/supabase";
import {
  getComplianceDocumentSignedUrl,
  getDocumentsByEntity,
  type DocumentRow,
} from "@/features/compliance/services/documents.service";
import { tryGetDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";

export type ReusableVehicleDocumentType = "rc" | "insurance";

/** The only vehicle doc types `trip_documents_document_type_check` accepts. */
export const REUSABLE_VEHICLE_DOCUMENT_TYPES: readonly ReusableVehicleDocumentType[] = [
  "rc",
  "insurance",
];

export function isReusableVehicleDocumentType(
  type: string,
): type is ReusableVehicleDocumentType {
  return (REUSABLE_VEHICLE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Why a document currently on file can or cannot be offered for reuse.
 * Mirrors the RPC's own checks (kept in sync deliberately — the RPC is the
 * real boundary; this is only used to render the right UI copy up front).
 */
export type VehicleDocumentReuseEligibility =
  | "eligible"
  | "expired"
  | "rejected"
  | "pending"
  | "unverified";

export interface VehicleDocumentReuseCandidate {
  document: DocumentRow;
  eligibility: VehicleDocumentReuseEligibility;
  /** 1-based position in this vehicle+doc_type's replace chain ("v3"). */
  versionOrdinal: number;
}

export interface VehicleDocumentReuseSlot {
  documentType: ReusableVehicleDocumentType;
  /** The current (non-replaced) document on file for this type, if any. */
  candidate: VehicleDocumentReuseCandidate | null;
}

const REF_PATH_PREFIX = "ref:vehicle-document:";

/** True for a trip_documents.storage_path written by use_vehicle_document_for_trip — never a real bucket object. */
export function isVehicleDocumentReferencePath(storagePath: string | null | undefined): boolean {
  return Boolean(storagePath && storagePath.startsWith(REF_PATH_PREFIX));
}

function classifyEligibility(doc: DocumentRow): VehicleDocumentReuseEligibility {
  if (doc.status === "rejected") return "rejected";
  if (doc.status === "pending") return "pending";
  if (doc.status === "expired") return "expired";
  if (doc.status !== "verified") return "unverified"; // e.g. 'active' — not independently verified
  if (doc.expiry_date) {
    const expiry = new Date(`${doc.expiry_date}T00:00:00Z`);
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < todayUtc) return "expired";
  }
  return "eligible";
}

/**
 * 1-based position of `documentId` in its vehicle+doc_type replace chain,
 * counting every row (including 'replaced' ones) created at or before it.
 * Computed via a count query rather than a new SQL function — entity_documents
 * is already RLS-readable to org members, so no new server-side surface is
 * needed for a display-only number.
 */
export async function resolveEntityDocumentVersionOrdinal(
  orgId: string,
  vehicleId: string,
  docType: string,
  createdAt: string,
): Promise<number> {
  const { count, error } = await supabase()
    .from("entity_documents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("entity_type", "vehicle")
    .eq("entity_id", vehicleId)
    .eq("doc_type", docType)
    .lte("created_at", createdAt);
  if (error || count == null) return 1;
  return Math.max(count, 1);
}

/**
 * The current reusable-or-not state of a vehicle's rc/insurance documents —
 * one slot per type, always present, `candidate: null` meaning "no document
 * on file at all" (distinct from "on file but ineligible").
 */
export async function getReusableVehicleDocuments(
  orgId: string,
  vehicleId: string,
): Promise<{ error: Error | null; slots: VehicleDocumentReuseSlot[] }> {
  const { error, documents } = await getDocumentsByEntity(orgId, "vehicle", vehicleId);
  if (error) {
    return {
      error,
      slots: REUSABLE_VEHICLE_DOCUMENT_TYPES.map((documentType) => ({ documentType, candidate: null })),
    };
  }

  const slots: VehicleDocumentReuseSlot[] = [];
  for (const documentType of REUSABLE_VEHICLE_DOCUMENT_TYPES) {
    // getDocumentsByEntity already excludes status='replaced', so at most one
    // non-superseded row should exist per (entity, doc_type); guard with
    // "most recently created" in case more than one somehow does.
    const current = documents
      .filter((d) => d.doc_type === documentType)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!current) {
      slots.push({ documentType, candidate: null });
      continue;
    }
    const versionOrdinal = await resolveEntityDocumentVersionOrdinal(
      orgId,
      vehicleId,
      documentType,
      current.created_at,
    );
    slots.push({
      documentType,
      candidate: { document: current, eligibility: classifyEligibility(current), versionOrdinal },
    });
  }
  return { error: null, slots };
}

export interface UseVehicleDocumentForTripResult {
  error: Error | null;
  tripDocumentId: string | null;
  alreadyAttached: boolean;
}

/**
 * "Use for this trip" — the domain operation. Goes through the
 * `use_vehicle_document_for_trip` RPC, which re-validates every eligibility
 * condition server-side and is idempotent: attaching the same
 * (trip, document_type, entity_document_id) combination twice returns the
 * existing row (`alreadyAttached: true`) instead of creating a duplicate.
 */
export async function useVehicleDocumentForTrip(params: {
  tripId: string;
  entityDocumentId: string;
  documentType: ReusableVehicleDocumentType;
}): Promise<UseVehicleDocumentForTripResult> {
  const { data, error } = await supabase().rpc("use_vehicle_document_for_trip", {
    p_trip_id: params.tripId,
    p_entity_document_id: params.entityDocumentId,
    p_document_type: params.documentType,
  });
  if (error) {
    return { error: new Error(error.message), tripDocumentId: null, alreadyAttached: false };
  }
  const result = (data ?? null) as { trip_document_id?: string; already_attached?: boolean } | null;
  return {
    error: null,
    tripDocumentId: result?.trip_document_id ?? null,
    alreadyAttached: Boolean(result?.already_attached),
  };
}

function guessMimeFromStoragePath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return null;
  }
}

export interface ResolvedVehicleDocumentSource {
  document: DocumentRow;
  url: string | null;
  mimeGuess: string | null;
}

function isCrossOrganizationSource(
  document: DocumentRow,
  organizationId: string | null | undefined,
): boolean {
  return Boolean(organizationId && document.organization_id !== organizationId);
}

/**
 * Resolve the real file + metadata for a trip_documents row's
 * `source_entity_document_id` — used by preview, since the trip_documents
 * row itself only carries a synthetic reference marker as its storage_path
 * (see isVehicleDocumentReferencePath). Signs against the compliance-documents
 * bucket via the existing compliance service, exactly like any other
 * entity_documents preview — not a new signer.
 */
export async function resolveVehicleDocumentSource(
  sourceEntityDocumentId: string,
  options?: { organizationId?: string | null },
): Promise<{ error: Error | null; resolved: ResolvedVehicleDocumentSource | null }> {
  const { data, error } = await supabase()
    .from("entity_documents")
    .select("*")
    .eq("id", sourceEntityDocumentId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), resolved: null };
  if (!data) return { error: new Error("Vehicle document not found."), resolved: null };

  const document = data as DocumentRow;
  if (isCrossOrganizationSource(document, options?.organizationId)) {
    return { error: new Error("Vehicle document not found."), resolved: null };
  }
  if (!document.storage_path) {
    return { error: null, resolved: { document, url: null, mimeGuess: null } };
  }
  const { url, error: urlError } = await getComplianceDocumentSignedUrl(document.storage_path);
  return {
    error: urlError,
    resolved: { document, url, mimeGuess: guessMimeFromStoragePath(document.storage_path) },
  };
}

export interface TripDocumentPreviewInput {
  storagePath?: string | null;
  sourceEntityDocumentId?: string | null;
  organizationId?: string | null;
}

/**
 * Generic trip-document preview. `source_entity_document_id` is the
 * historical pin when present. A synthetic `ref:vehicle-document:` path
 * without that pin is never signed against the trip-documents bucket.
 */
export async function resolveTripDocumentPreviewUrl(
  input: TripDocumentPreviewInput,
): Promise<string | null> {
  const storagePath = (input.storagePath ?? "").trim();
  const sourceId = (input.sourceEntityDocumentId ?? "").trim();
  // After reject → replace, the row keeps a new trip-documents object path and
  // may still carry the old vault pin. Preview the current file, not the pin.
  if (storagePath && !isVehicleDocumentReferencePath(storagePath)) {
    return tryGetDocumentViewUrl(storagePath);
  }
  if (sourceId) {
    const { resolved } = await resolveVehicleDocumentSource(sourceId, {
      organizationId: input.organizationId,
    });
    return resolved?.url ?? null;
  }
  if (!storagePath) return null;
  if (isVehicleDocumentReferencePath(storagePath)) return null;
  return tryGetDocumentViewUrl(storagePath);
}

export interface PinnedVehicleDocumentMeta {
  document: DocumentRow;
  /** 1-based position in the replace chain, pinned to this exact document — see resolveEntityDocumentVersionOrdinal. */
  versionOrdinal: number;
}

/**
 * Metadata (version ordinal + expiry, no signed URL) for the exact
 * entity_documents row a trip's `source_entity_document_id` points at.
 * Distinct from `resolveVehicleDocumentSource`, which additionally signs a
 * preview URL — this lighter call is for rendering "v{N} · Valid until …"
 * next to "Used for this trip" pinned to the reused version, not to
 * whatever the vehicle's current document happens to be right now (which
 * `VehicleDocumentReuseSlot.candidate` reflects and can drift after a later
 * replacement). Org/entity/doc_type/created_at are read from the resolved
 * row itself, not passed in, so the ordinal is always computed for the
 * pinned document's own identity.
 */
export async function resolvePinnedVehicleDocumentMeta(
  sourceEntityDocumentId: string,
): Promise<{ error: Error | null; meta: PinnedVehicleDocumentMeta | null }> {
  const { data, error } = await supabase()
    .from("entity_documents")
    .select("*")
    .eq("id", sourceEntityDocumentId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), meta: null };
  if (!data) return { error: new Error("Vehicle document not found."), meta: null };

  const document = data as DocumentRow;
  const versionOrdinal = await resolveEntityDocumentVersionOrdinal(
    document.organization_id,
    document.entity_id,
    document.doc_type,
    document.created_at,
  );
  return { error: null, meta: { document, versionOrdinal } };
}
