import type { ComplianceViewSource } from "@/features/tripCompliance/services/complianceDocumentView.service";
import type { ComplianceDocRow } from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import type { VaultCategoryPreviewFile } from "@/features/trips/components/trip-detail/vaultCategoryPreview.types";

/**
 * Storage signer for a checklist row. Must follow the row, not the active tab —
 * All-docs view mixes finance, trip, vehicle, and driver files.
 */
export function compliancePreviewSourceForRow(
  row: Pick<ComplianceDocRow, "doc" | "entityDoc"> | null | undefined,
): ComplianceViewSource {
  if (!row) return "trip";
  if (row.entityDoc?.source === "supplier-kyc" && !row.doc) return "supplier-kyc";
  if (row.doc) return "trip";
  const source = row.entityDoc?.source;
  if (
    source === "vehicle-vault" ||
    source === "driver-kyc" ||
    source === "entity" ||
    source === "supplier-kyc"
  ) {
    return source;
  }
  if (row.entityDoc?.entity_type === "vehicle") return "vehicle-vault";
  if (row.entityDoc?.entity_type === "driver") return "driver-kyc";
  if (row.entityDoc?.entity_type === "supplier") return "supplier-kyc";
  return "trip";
}

/** Category carousel files — trip memos must not sign as compliance-documents. */
export function compliancePreviewSourceForVaultFile(
  file: Pick<
    VaultCategoryPreviewFile,
    "category" | "complianceType" | "driverKind" | "deleteKind"
  > | null | undefined,
): ComplianceViewSource {
  if (!file) return "trip";
  if (file.category === "bank_docs") return "supplier-kyc";
  if (file.driverKind) return "compliance";
  if (file.deleteKind === "vehicle_extra") return "vehicle-vault";
  if (file.complianceType || file.deleteKind === "vehicle_compliance") return "entity";
  return "trip";
}
