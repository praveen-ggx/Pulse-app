import { getDocumentsByEntity, verifyDocument } from "@/features/compliance/services/documents.service";
import type { ComplianceEntityDocument } from "@/features/tripCompliance/tripCompliance.types";
import { findViewerVehicleEntityDoc } from "@/features/tripCompliance/utils/complianceVaultDocuments.util";
import { markVehicleDocumentVerified } from "@/features/vehicles/services/vehicleDocuments.service";

/**
 * Approve a vehicle slot on Compliance.
 * Owned trucks write `vehicles.documents.verifiedAt`. Partner trucks (BLUESTAR
 * SAT812 jobs) are not visible to the trip org on `vehicles`, so approve the
 * viewer-org `entity_documents` copy instead.
 */
export async function approveComplianceVehicleDocument(input: {
  orgId: string;
  vehicleId: string;
  docType: string;
  actorId: string;
  vehicleDocuments?: ComplianceEntityDocument[];
}): Promise<{ error: Error | null }> {
  const vault = await markVehicleDocumentVerified(input.orgId, input.vehicleId, input.docType);
  if (!vault.error) return { error: null };

  let entity = findViewerVehicleEntityDoc(input.vehicleDocuments ?? [], input.docType);
  if (!entity) {
    const { documents, error } = await getDocumentsByEntity(input.orgId, "vehicle", input.vehicleId);
    if (error) return { error };
    entity = findViewerVehicleEntityDoc(
      documents.map((doc) => ({
        id: doc.id,
        entity_type: doc.entity_type === "driver" ? "driver" : "vehicle",
        doc_type: doc.doc_type,
        source: "entity" as const,
        status: doc.status,
        created_at: doc.created_at,
      })),
      input.docType,
    );
  }
  if (!entity) return { error: vault.error };
  return verifyDocument(entity.id, input.actorId);
}
