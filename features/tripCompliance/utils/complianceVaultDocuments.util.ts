/**
 * Map Trip Operations Asset Vault files onto Compliance entity rows.
 * Vehicle files live on `vehicles.documents` (same JSON the vault reads).
 */
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";
import {
  COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
  type ComplianceEntityDocument,
} from "@/features/tripCompliance/tripCompliance.types";

const VAULT_VEHICLE_TYPES = ["rc", "insurance", "fitness", "pollution", "permit", "road_tax"] as const;

const TRIP_DOC_TYPE_ALIASES: Record<string, string> = {
  eway: "eway_bill",
  ewaybill: "eway_bill",
  e_way_bill: "eway_bill",
  eway_bill: "eway_bill",
  lorry_receipt: "lr",
  lorry: "lr",
  tax_invoice: "invoice",
  inv: "invoice",
};

const STORAGE_OBJECT_RE =
  /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/[^/]+\/(.+?)(?:\?|$)/i;
const STORAGE_BUCKET_PREFIX_RE =
  /^(vehicle-documents|compliance-documents|driver-documents|trip-documents|documents|pod-documents)\//;

export function parseComplianceStorageRef(raw: string): { kind: "url" | "path"; value: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "path", value: "" };
  if (/^(blob:|data:|file:|content:)/i.test(trimmed)) {
    return { kind: "url", value: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const fromStorage = trimmed.match(STORAGE_OBJECT_RE);
    if (fromStorage?.[1]) return { kind: "path", value: decodeURIComponent(fromStorage[1]) };
    return { kind: "url", value: trimmed };
  }
  return {
    kind: "path",
    value: trimmed.replace(/^\//, "").replace(STORAGE_BUCKET_PREFIX_RE, ""),
  };
}

const VAULT_FILE_EXTS = ["pdf", "jpg", "jpeg", "png", "webp"] as const;

export function complianceStoragePathCandidates(input: {
  rawPath: string | null | undefined;
  organizationId?: string | null;
  entityId?: string | null;
  docType?: string | null;
}): { url: string | null; paths: string[] } {
  const raw = input.rawPath?.trim() ?? "";
  const paths: string[] = [];
  if (raw) {
    const parsed = parseComplianceStorageRef(raw);
    if (parsed.kind === "url") return { url: parsed.value, paths: [] };
    if (parsed.value) paths.push(parsed.value);
    // Stored object paths already identify the file. Guessing extra
    // extensions signs 5×4 missing objects per preview and times out
    // storage RLS while the DB is degraded.
    if (parsed.value && /\.[A-Za-z0-9]+$/.test(parsed.value)) {
      return { url: null, paths };
    }
  }
  const orgId = input.organizationId?.trim();
  const entityId = input.entityId?.trim();
  const docType = input.docType?.trim();
  if (orgId && entityId && docType) {
    for (const ext of VAULT_FILE_EXTS) {
      const guess = `${orgId}/${entityId}/${docType}.${ext}`;
      if (!paths.includes(guess)) paths.push(guess);
    }
  }
  return { url: null, paths };
}

export function normalizeVaultVehicleNumber(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeTripDocumentType(type: string | null | undefined): string | null {
  if (!type) return type ?? null;
  const key = type.toLowerCase().replace(/[\s-]+/g, "_");
  return TRIP_DOC_TYPE_ALIASES[key] ?? key;
}

function vaultApprovalStatus(verifiedAt: string | null | undefined): "verified" | "pending" {
  return verifiedAt?.trim() ? "verified" : "pending";
}

function extraDocType(
  extra: { docType?: string | null; fileName?: string },
): string | null {
  const tagged = extra.docType?.trim().toLowerCase() ?? "";
  if (tagged && COMPLIANCE_VEHICLE_DOCUMENT_TYPES.includes(tagged)) return tagged;
  const name = (extra.fileName ?? "").toLowerCase();
  if (name.includes("permit")) return "permit";
  if (name.includes("road_tax") || name.includes("road tax") || name.includes("tax token") || /\btax\b/.test(name)) {
    return "road_tax";
  }
  if (name.includes("insurance")) return "insurance";
  if (name.includes("fitness") || /\bfc\b/.test(name)) return "fitness";
  if (name.includes("pollution") || name.includes("puc")) return "pollution";
  if (name.includes("registration") || /\brc\b/.test(name)) return "rc";
  return null;
}

export function vehicleVaultDocumentsToEntityDocs(
  vehicleId: string,
  documents: VehicleDocuments | null | undefined,
): ComplianceEntityDocument[] {
  if (!documents) return [];
  const rows: ComplianceEntityDocument[] = [];

  for (const docType of VAULT_VEHICLE_TYPES) {
    const slot = documents[docType];
    const path = slot?.url?.trim();
    if (!path) continue;
    rows.push({
      id: `${vehicleId}-${docType}`,
      entity_type: "vehicle",
      entity_id: vehicleId,
      doc_type: docType,
      status: vaultApprovalStatus(slot?.verifiedAt),
      storage_path: path,
      expiry_date: slot?.expiryDate ?? null,
      verified_at: slot?.verifiedAt?.trim() || null,
      notes: null,
      created_at: slot?.uploadedAt ?? new Date(0).toISOString(),
      source: "vehicle-vault",
    });
  }

  for (const extra of documents.extras ?? []) {
    const path = extra.url?.trim();
    const docType = extraDocType(extra);
    if (!path || !docType || !COMPLIANCE_VEHICLE_DOCUMENT_TYPES.includes(docType)) continue;
    if (rows.some((row) => row.storage_path === path)) continue;
    rows.push({
      id: extra.id || `${vehicleId}-${docType}-${path}`,
      entity_type: "vehicle",
      entity_id: vehicleId,
      doc_type: docType,
      status: vaultApprovalStatus(extra.verifiedAt),
      storage_path: path,
      expiry_date: extra.expiryDate ?? null,
      verified_at: extra.verifiedAt?.trim() || null,
      notes: extra.fileName ?? null,
      created_at: extra.uploadedAt ?? new Date(0).toISOString(),
      source: "vehicle-vault",
    });
  }

  return rows;
}

function entityDocKey(doc: ComplianceEntityDocument): string {
  const path = doc.storage_path?.trim();
  if (path) return `path:${path}`;
  return `id:${doc.id}`;
}

export function mergeComplianceEntityDocs(
  preferred: ComplianceEntityDocument[],
  fallback: ComplianceEntityDocument[],
): ComplianceEntityDocument[] {
  const byKey = new Map<string, ComplianceEntityDocument>();
  for (const doc of fallback) byKey.set(entityDocKey(doc), doc);
  for (const doc of preferred) {
    const key = entityDocKey(doc);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, doc);
      continue;
    }
    const preferredExpiry = doc.expiry_date?.trim() || null;
    const fallbackExpiry = existing.expiry_date?.trim() || null;
    byKey.set(key, {
      ...doc,
      expiry_date: preferredExpiry ?? fallbackExpiry,
    });
  }
  return Array.from(byKey.values());
}
