import type { ComplianceViewSource } from "@/features/tripCompliance/services/complianceDocumentView.service";
import type { ComplianceEntityDocument } from "@/features/tripCompliance/tripCompliance.types";
import type { ComplianceDocRow } from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import type { VaultCategoryPreviewFile } from "@/features/trips/components/trip-detail/vaultCategoryPreview.types";
import type { VaultChooserPreviewSource } from "@/features/trips/components/trip-detail/VaultChooserNotifyRow";

const VEHICLE_COMPLIANCE_DOC_TYPES = new Set([
  "rc",
  "insurance",
  "fitness",
  "permit",
  "pollution",
  "road_tax",
]);

/** entity_documents path: `{org}/{vehicle|driver|supplier|trip}/{id}/…` */
export function isComplianceEntityStoragePath(path: string | null | undefined): boolean {
  return /(^|\/)(vehicle|driver|supplier|trip)\//i.test(String(path ?? ""));
}

/**
 * Storage signer for a checklist row. Must follow the row, not the active tab —
 * All-docs view mixes finance, trip, vehicle, and driver files.
 *
 * Vault uploads (`source: vehicle-vault` or `{org}/{vehicleId}/rc.jpeg`) live in
 * `vehicle-documents`. Compliance-page uploads (`source: entity`, path
 * `{org}/vehicle/{id}/…`) live in `compliance-documents`. Sign the real bucket
 * first; each signer falls back across buckets when the object is missing.
 */
export function compliancePreviewSourceForRow(
  row: Pick<ComplianceDocRow, "doc" | "entityDoc"> | null | undefined,
): ComplianceViewSource {
  if (!row) return "trip";
  if (row.entityDoc?.source === "supplier-kyc" && !row.doc) return "supplier-kyc";
  if (row.doc) return "trip";
  return compliancePreviewSourceForEntityDoc(row.entityDoc);
}

type EntityPreviewDoc = {
  source?: ComplianceEntityDocument["source"] | null;
  entity_type?: ComplianceEntityDocument["entity_type"] | null;
  doc_type?: string | null;
  storage_path?: string | null;
};

/** Activity / entity-doc milestones — same bucket rules as checklist thumbs. */
export function compliancePreviewSourceForEntityDoc(
  doc: EntityPreviewDoc | null | undefined,
): ComplianceViewSource {
  if (!doc) return "trip";
  const source = doc.source;
  const path = String(doc.storage_path ?? "");
  if (source === "vehicle-vault") return "vehicle-vault";
  if (source === "driver-kyc") return "driver-kyc";
  if (source === "supplier-kyc") return "supplier-kyc";
  // Compliance-page / Ground Ops entity_documents write.
  if (source === "entity" || isComplianceEntityStoragePath(path)) {
    return "entity";
  }
  // Asset vault shape on a vehicle row (no `/vehicle/` segment).
  if (doc.entity_type === "vehicle") return "vehicle-vault";
  if (doc.entity_type === "driver") return "driver-kyc";
  if (doc.entity_type === "supplier") return "supplier-kyc";
  const docType = String(doc.doc_type ?? "").trim().toLowerCase();
  if (VEHICLE_COMPLIANCE_DOC_TYPES.has(docType)) return "vehicle-vault";
  return "trip";
}

/** Card thumb source — must match the Storage bucket the object actually lives in. */
export function vaultChooserSourceForComplianceRow(
  row: Pick<ComplianceDocRow, "doc" | "entityDoc"> | null | undefined,
): VaultChooserPreviewSource {
  return vaultChooserSourceForViewSource(compliancePreviewSourceForRow(row));
}

export function vaultChooserSourceForEntityDoc(
  doc: EntityPreviewDoc | null | undefined,
): VaultChooserPreviewSource {
  return vaultChooserSourceForViewSource(compliancePreviewSourceForEntityDoc(doc));
}

function vaultChooserSourceForViewSource(
  source: ComplianceViewSource,
): VaultChooserPreviewSource {
  if (source === "vehicle-vault") return "vehicle-vault";
  if (source === "driver-kyc") return "driver-kyc";
  if (source === "supplier-kyc") return "supplier-kyc";
  if (source === "entity") return "entity";
  if (source === "compliance") return "compliance";
  return "trip";
}

/** Category carousel files — trip memos must not sign as compliance-documents. */
export function compliancePreviewSourceForVaultFile(
  file: Pick<
    VaultCategoryPreviewFile,
    | "category"
    | "categoryLabel"
    | "complianceType"
    | "driverKind"
    | "deleteKind"
    | "storagePath"
  > | null | undefined,
): ComplianceViewSource {
  if (!file) return "trip";
  if (file.category === "bank_docs" || file.categoryLabel === "Bank Docs") {
    return "supplier-kyc";
  }
  if (file.driverKind) return "compliance";
  if (file.deleteKind === "vehicle_extra") return "vehicle-vault";
  if (file.complianceType || file.deleteKind === "vehicle_compliance") {
    // Compliance-page upload → compliance-documents; Asset Vault → vehicle-documents.
    return isComplianceEntityStoragePath(file.storagePath) ? "entity" : "vehicle-vault";
  }
  return "trip";
}
