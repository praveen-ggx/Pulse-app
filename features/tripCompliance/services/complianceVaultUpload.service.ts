/**
 * Compliance vault uploads: pick + validate a file, then write it to the right
 * store for its scope. Trip docs go to trip_documents, vehicle RC/insurance/etc.
 * prefer the vehicle vault, and everything else lands in entity_documents.
 * Shared by the Cards workspace (inline Upload / Add) and the review sheet.
 */
import { uploadComplianceDocument } from "@/features/compliance/services/documents.service";
import type { ComplianceEntityDocument } from "@/features/tripCompliance/tripCompliance.types";
import {
  COMPLIANCE_TRIP_DOC_PICKER_TYPES,
  validateComplianceTripDocumentFile,
} from "@/features/tripCompliance/utils/complianceTripDocumentFormat.util";
import {
  isTripDocumentsStoragePathConflict,
  uploadTripDocument,
  type TripDocumentType,
} from "@/features/trips/services/tripDocuments.service";
import {
  resolveVehicleDocumentsWriteTarget,
  uploadAndSaveVehicleDocument,
} from "@/features/vehicles/services/vehicleDocuments.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import type { VehicleComplianceDocType } from "@/features/vehicles/utils/vehicleDocuments.util";
import * as DocumentPicker from "expo-document-picker";

export type ComplianceVaultScope = "trip" | "vehicle" | "driver";

export type ComplianceVaultFile = {
  arrayBuffer: ArrayBuffer;
  fileName: string;
  mimeType: string;
};

/** Vehicle doc types stored on `vehicles.documents` (the vehicle vault). */
export const COMPLIANCE_VEHICLE_VAULT_TYPES = new Set([
  "rc",
  "insurance",
  "fitness",
  "pollution",
  "permit",
  "road_tax",
]);

async function vaultFileFromAsset(
  type: string,
  asset: DocumentPicker.DocumentPickerAsset,
): Promise<ComplianceVaultFile> {
  const fileName = asset.name ?? `${type}.pdf`;
  if (typeof asset.size === "number") {
    const early = validateComplianceTripDocumentFile({
      fileName,
      mimeType: asset.mimeType,
      byteLength: asset.size,
    });
    if (!early.ok) throw new Error(early.reason);
  }
  const arrayBuffer = await fetch(asset.uri).then((r) => r.arrayBuffer());
  const format = validateComplianceTripDocumentFile({
    fileName,
    mimeType: asset.mimeType,
    byteLength: arrayBuffer.byteLength,
  });
  if (!format.ok) throw new Error(format.reason);
  return { arrayBuffer, fileName, mimeType: format.mimeType };
}

/** Opens the file picker. Users can select any number of files. Empty when cancelled. */
export async function pickComplianceVaultFiles(type: string): Promise<ComplianceVaultFile[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [...COMPLIANCE_TRIP_DOC_PICKER_TYPES],
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (res.canceled || !res.assets?.length) return [];
  const files: ComplianceVaultFile[] = [];
  for (const asset of res.assets) {
    files.push(await vaultFileFromAsset(type, asset));
  }
  return files;
}

/** Opens the file picker and validates format/size. `null` when the user cancels. */
export async function pickComplianceVaultFile(type: string): Promise<ComplianceVaultFile | null> {
  const files = await pickComplianceVaultFiles(type);
  return files[0] ?? null;
}

export type ComplianceVaultUploadInput = {
  scope: ComplianceVaultScope;
  type: string;
  tripId: string;
  organizationId: string;
  actorId: string;
  vehicleId: string | null;
  /** Vehicle or driver id for entity scopes; ignored for trip scope. */
  entityId: string | null;
  /** Current file for this type. Extra files of the same type skip the vehicle vault overwrite. */
  existing: ComplianceEntityDocument | null | undefined;
  /** Extra files of an already-used type append instead of replacing the vault slot. */
  append?: boolean;
  file: ComplianceVaultFile;
  expiryDate: string | null;
};

/**
 * Writes one vault file. Throws on failure. A trip-documents storage path
 * conflict means the file already landed, so it is treated as success.
 */
export async function uploadComplianceVaultFile(input: ComplianceVaultUploadInput): Promise<void> {
  const { scope, type, tripId, organizationId, actorId, vehicleId, entityId, existing, append, file, expiryDate } = input;

  if (scope === "trip") {
    const { error } = await uploadTripDocument(
      tripId,
      actorId,
      file,
      type as TripDocumentType,
      undefined,
      { replaceExistingOfType: false },
    );
    if (error && !isTripDocumentsStoragePathConflict({ message: error.message })) throw error;
    return;
  }

  if (!entityId) {
    throw new Error(
      scope === "vehicle"
        ? "Assign a vehicle on this trip before uploading documents."
        : "Assign a driver on this trip before uploading documents.",
    );
  }

  if (scope === "vehicle" && COMPLIANCE_VEHICLE_VAULT_TYPES.has(type) && vehicleId && !existing && !append) {
    // Prefer the vehicle vault when this org owns the truck. Cross-org / RLS-blocked
    // vault writes fall back to entity_documents so Compliance can still collect it.
    // Extra files of the same type append as entity_documents (existing is set).
    const owned = await getVehicleById(organizationId, vehicleId);
    if (owned.error) throw owned.error;

    let savedToVault = false;
    if (owned.vehicle) {
      const { error } = await uploadAndSaveVehicleDocument(
        organizationId,
        vehicleId,
        type as VehicleComplianceDocType,
        file,
        expiryDate ?? "",
        owned.vehicle.documents ?? null,
      );
      savedToVault = !error;
    } else {
      const resolved = await resolveVehicleDocumentsWriteTarget(vehicleId, [organizationId]);
      if (resolved) {
        const { error } = await uploadAndSaveVehicleDocument(
          resolved.orgId,
          vehicleId,
          type as VehicleComplianceDocType,
          file,
          expiryDate ?? "",
          resolved.documents,
        );
        savedToVault = !error;
      }
    }
    if (savedToVault) return;

    const upload = {
      orgId: organizationId,
      entityType: "vehicle" as const,
      entityId: vehicleId,
      docType: type,
      file,
      uploadedBy: actorId,
      expiryDate: expiryDate || null,
    };
    const { error } = await uploadComplianceDocument(upload);
    if (error) throw error;
    return;
  }

  const upload = {
    orgId: organizationId,
    entityType: scope,
    entityId,
    docType: type,
    file,
    uploadedBy: actorId,
    expiryDate: expiryDate || null,
  };
  const { error } = await uploadComplianceDocument(upload);
  if (error) throw error;
}
