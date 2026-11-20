import { getDocumentsByEntity, verifyDocument } from "@/features/compliance/services/documents.service";
import type { ComplianceEntityDocument } from "@/features/tripCompliance/tripCompliance.types";
import { findViewerEntityCopyOfFile } from "@/features/tripCompliance/utils/complianceVaultDocuments.util";
import { markVehicleDocumentVerified } from "@/features/vehicles/services/vehicleDocuments.service";
import { isVehicleComplianceDocType } from "@/features/vehicles/utils/vehicleDocuments.util";

/**
 * Approve the vehicle file shown on Compliance (a vault row).
 * Owned trucks write `vehicles.documents.verifiedAt`. Partner trucks (BLUESTAR
 * SAT812 jobs) are not visible to the trip org on `vehicles`, so approve the
 * viewer-org `entity_documents` row holding the same file (same storage path).
 * Never approves a different copy of the slot: with no such row, it fails.
 */
export async function approveComplianceVehicleDocument(input: {
  orgId: string;
  vehicleId: string;
  docType: string;
  actorId: string;
  /** Row id and storage path of the file the reviewer is looking at. */
  displayedDocumentId: string;
  displayedStoragePath: string | null;
  vehicleDocuments?: ComplianceEntityDocument[];
}): Promise<{ error: Error | null }> {
  // vehicles.documents verification marks the slot's MAIN file for the six
  // slot types. Only write it when that main file is the one on screen
  // (vault slot rows are id `${vehicleId}-${docType}`); an extra page is not it.
  const showsSlotFile = input.displayedDocumentId === `${input.vehicleId}-${input.docType}`;
  if (showsSlotFile || !isVehicleComplianceDocType(input.docType)) {
    const vault = await markVehicleDocumentVerified(input.orgId, input.vehicleId, input.docType);
    if (!vault.error) return { error: null };
  }

  let entity = findViewerEntityCopyOfFile(input.vehicleDocuments ?? [], input.docType, input.displayedStoragePath);
  if (!entity) {
    const { documents, error } = await getDocumentsByEntity(input.orgId, "vehicle", input.vehicleId);
    if (error) return { error };
    entity = findViewerEntityCopyOfFile(
      documents.map((doc) => ({
        id: doc.id,
        entity_type: doc.entity_type === "driver" ? "driver" : "vehicle",
        doc_type: doc.doc_type,
        source: "entity" as const,
        status: doc.status,
        storage_path: doc.storage_path,
      })),
      input.docType,
      input.displayedStoragePath,
    );
  }
  if (!entity) {
    return {
      error: new Error(
        "This file is on the truck owner's records, which your company can't approve. Upload the document in Compliance (Replace) and approve that copy.",
      ),
    };
  }
  return verifyDocument(entity.id, input.actorId);
}
