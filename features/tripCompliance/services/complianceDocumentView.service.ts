/**
 * Resolve a Compliance checklist file to a viewable HTTPS URL.
 * Driver-app pattern: sign the stored object path once on its source bucket.
 * Do not probe extra vault extensions or download blobs (that fans out Storage/RLS).
 *
 * Vehicle RC/insurance/FC may live in `vehicle-documents` (vault) or
 * `compliance-documents` (entity_documents fallback). Cross-org vault paths
 * often cannot be signed by the trip org — rewrite under the viewer org and
 * look up entity_documents when the primary sign fails.
 */
import { getComplianceDocumentSignedUrl } from "@/features/compliance/services/documents.service";
import { tryGetDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";
import { parseComplianceStorageRef } from "@/features/tripCompliance/utils/complianceVaultDocuments.util";
import { getVehicleDocumentViewUrl } from "@/features/vehicles/services/vehicleDocuments.service";
import { supabase } from "@/lib/supabase";
import {
  isVehicleDocumentReferencePath,
  resolveTripDocumentPreviewUrl,
} from "@/features/tripCompliance/services/vehicleDocumentReuse.service";
import {
  composeComplianceActorDetail,
  type ComplianceActorDetail,
} from "@/features/tripCompliance/utils/complianceDocumentActivity.util";

export type ComplianceViewSource = "vehicle-vault" | "driver-kyc" | "entity" | "trip" | null | undefined;

function rewriteStoragePathOrg(path: string, organizationId: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  if (parts[0] === organizationId) return null;
  return [organizationId, ...parts.slice(1)].join("/");
}

async function lookupEntityDocumentStoragePath(input: {
  organizationId: string;
  entityId: string;
  docType: string;
}): Promise<string | null> {
  const { data, error } = await supabase()
    .from("entity_documents")
    .select("storage_path")
    .eq("organization_id", input.organizationId)
    .eq("entity_type", "vehicle")
    .eq("entity_id", input.entityId)
    .eq("doc_type", input.docType)
    .neq("status", "replaced")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.storage_path) return null;
  return String(data.storage_path).trim() || null;
}

export async function signCompliancePreviewUrl(input: {
  storagePath: string | null | undefined;
  source?: ComplianceViewSource;
  sourceEntityDocumentId?: string | null;
  organizationId?: string | null;
  entityId?: string | null;
  docType?: string | null;
}): Promise<string | null> {
  const raw = (input.storagePath ?? "").trim();
  if (input.sourceEntityDocumentId || isVehicleDocumentReferencePath(raw)) {
    return resolveTripDocumentPreviewUrl({
      storagePath: raw,
      sourceEntityDocumentId: input.sourceEntityDocumentId,
      organizationId: input.organizationId,
    });
  }
  if (!raw) return null;
  const parsed = parseComplianceStorageRef(raw);
  if (parsed.kind === "url") return parsed.value;
  const path = parsed.value.trim();
  if (!path) return null;
  const source = input.source ?? "trip";
  const orgId = (input.organizationId ?? "").trim();

  try {
    if (source === "vehicle-vault") {
      const candidates = [path];
      if (orgId) {
        const rewritten = rewriteStoragePathOrg(path, orgId);
        if (rewritten) candidates.push(rewritten);
      }
      for (const candidate of candidates) {
        const url = await getVehicleDocumentViewUrl(candidate);
        if (url) return url;
      }
      if (orgId && input.entityId && input.docType) {
        const entityPath = await lookupEntityDocumentStoragePath({
          organizationId: orgId,
          entityId: input.entityId,
          docType: input.docType,
        });
        if (entityPath) {
          const { url } = await getComplianceDocumentSignedUrl(entityPath);
          if (url) return url;
          const viaVehicleHelper = await getVehicleDocumentViewUrl(entityPath);
          if (viaVehicleHelper) return viaVehicleHelper;
        }
      }
      return null;
    }
    if (source === "entity") {
      const { url } = await getComplianceDocumentSignedUrl(path);
      if (url) return url;
      return await getVehicleDocumentViewUrl(path);
    }
    if (source === "driver-kyc") {
      const { data } = await supabase().storage.from("driver-documents").createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    }
    const tripUrl = await tryGetDocumentViewUrl(path);
    if (tripUrl) return tripUrl;
    // Last resort: path may actually be a vehicle/compliance object.
    return await getVehicleDocumentViewUrl(path);
  } catch {
    return null;
  }
}

/** @deprecated Use signCompliancePreviewUrl — kept for callers that still pass vault guess fields. */
export async function resolveComplianceDocumentViewUrl(input: {
  storagePath: string | null | undefined;
  source?: ComplianceViewSource;
  organizationId?: string | null;
  entityId?: string | null;
  docType?: string | null;
}): Promise<string | null> {
  return signCompliancePreviewUrl({
    storagePath: input.storagePath,
    source: input.source,
  });
}

export function guessCompliancePreviewMime(
  pathOrName: string | null | undefined,
  mimeType?: string | null,
): string | null {
  const declared = (mimeType ?? "").trim().toLowerCase();
  if (declared) return declared;
  const value = (pathOrName ?? "").toLowerCase();
  if (value.endsWith(".pdf") || value.includes(".pdf?")) return "application/pdf";
  if (value.endsWith(".png") || value.includes(".png?")) return "image/png";
  if (value.endsWith(".webp") || value.includes(".webp?")) return "image/webp";
  if (/\.jpe?g(\?|$)/.test(value)) return "image/jpeg";
  if (value.endsWith(".txt") || value.includes(".txt?")) return "text/plain";
  return null;
}

/** Resolve org member (or profile) details for document activity actors. */
export async function resolveComplianceActorDetails(
  ids: Array<string | null | undefined>,
  orgId?: string | null,
): Promise<Record<string, ComplianceActorDetail>> {
  const unique = [...new Set(ids.map((id) => (id ?? "").trim()).filter(Boolean))];
  if (unique.length === 0) return {};
  const details: Record<string, ComplianceActorDetail> = {};

  if (orgId) {
    const { data } = await supabase().rpc("get_org_members_with_profiles", { p_org_id: orgId });
    for (const row of data ?? []) {
      const userId = typeof row.user_id === "string" ? row.user_id : "";
      if (!userId || !unique.includes(userId) || details[userId]) continue;
      details[userId] = composeComplianceActorDetail({
        fullName: typeof row.full_name === "string" ? row.full_name : null,
        phone: typeof row.phone === "string" ? row.phone : null,
        email: typeof row.email === "string" ? row.email : null,
        role: typeof row.role === "string" ? row.role : null,
      });
    }
  }

  const missing = unique.filter((id) => !details[id]);
  if (missing.length === 0) return details;

  const { data: profiles } = await supabase()
    .from("profiles")
    .select("id, full_name, phone, email")
    .in("id", missing);
  for (const row of profiles ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    details[id] = composeComplianceActorDetail({
      fullName: typeof row.full_name === "string" ? row.full_name : null,
      phone: typeof row.phone === "string" ? row.phone : null,
      email: typeof row.email === "string" ? row.email : null,
      role: null,
    });
  }

  return details;
}

/** @deprecated Prefer resolveComplianceActorDetails — name-only map for older callers. */
export async function resolveComplianceActorNames(
  ids: Array<string | null | undefined>,
  orgId?: string | null,
): Promise<Record<string, string>> {
  const details = await resolveComplianceActorDetails(ids, orgId);
  const names: Record<string, string> = {};
  for (const [id, detail] of Object.entries(details)) names[id] = detail.name;
  return names;
}
