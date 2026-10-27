/**
 * Compliance vault uploads: pick + validate a file, then write it to the right
 * store for its scope. Trip docs go to trip_documents, vehicle RC/insurance/etc.
 * prefer the vehicle vault, and everything else lands in entity_documents.
 * Shared by the Cards workspace (inline Upload / Add) and the review sheet.
 */
import { uploadComplianceDocument } from "@/features/compliance/services/documents.service";
import { invalidateCompliancePreviewCache } from "@/features/tripCompliance/services/complianceDocumentView.service";
import type { ComplianceEntityDocument } from "@/features/tripCompliance/tripCompliance.types";
import {
  COMPLIANCE_TRIP_DOC_PICKER_TYPES,
  inferComplianceTripDocMime,
  validateComplianceTripDocumentFile,
} from "@/features/tripCompliance/utils/complianceTripDocumentFormat.util";
import { readVaultPickerAsset } from "@/features/trips/components/trip-detail/vaultPickerFile.util";
import {
  isTripDocumentsStoragePathConflict,
  uploadTripDocument,
  type TripDocumentType,
} from "@/features/trips/services/tripDocuments.service";
import { uploadAndSaveVehicleDocumentForTrip } from "@/features/vehicles/services/vehicleDocuments.service";
import type { VehicleComplianceDocType } from "@/features/vehicles/utils/vehicleDocuments.util";
import * as DocumentPicker from "expo-document-picker";

export type ComplianceVaultScope = "trip" | "vehicle" | "driver";

export type ComplianceVaultFile = {
  arrayBuffer: ArrayBuffer;
  fileName: string;
  mimeType: string;
  uri?: string;
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
  const picked = await readVaultPickerAsset(asset, `${type}.pdf`, (name, mime) => {
    return inferComplianceTripDocMime({ fileName: name, mimeType: mime }) ?? mime ?? "application/octet-stream";
  });
  if (typeof asset.size === "number" && asset.size > 0 && picked.arrayBuffer.byteLength === 0) {
    throw new Error("Could not read the selected file. Choose it again.");
  }
  const format = validateComplianceTripDocumentFile({
    fileName: picked.fileName,
    mimeType: picked.mimeType,
    byteLength: picked.arrayBuffer.byteLength,
  });
  if (!format.ok) throw new Error(format.reason);
  return {
    arrayBuffer: picked.arrayBuffer,
    fileName: picked.fileName,
    mimeType: format.mimeType,
    uri: picked.uri,
  };
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
  /**
   * Ground Ops cannot finish a vehicles.documents write (and a failed vault
   * upsert+rollback can delete the existing RC/FC object). Write entity_documents.
   */
  skipVehicleVault?: boolean;
  file: ComplianceVaultFile;
  expiryDate: string | null;
};

/**
 * Writes one vault file. Throws on failure. A trip-documents storage path
 * conflict means the file already landed, so it is treated as success.
 */
export async function uploadComplianceVaultFile(input: ComplianceVaultUploadInput): Promise<void> {
  const { scope, type, tripId, organizationId, actorId, vehicleId, entityId, existing, append, skipVehicleVault, file, expiryDate } = input;

  if (scope === "trip") {
    const { error } = await uploadTripDocument(
      tripId,
      actorId,
      file,
      type as TripDocumentType,
      undefined,
      { replaceExistingOfType: false },
    );
    if (error && !isTripDocumentsStoragePathConflict({ message: error.message })) {
      const denied = /row-level security|violates|policy|permission/i.test(error.message);
      throw new Error(
        denied
          ? "Could not save this trip file. Ground Ops can upload only when document upload is on for the organization and the trip is in your warehouse."
          : error.message,
      );
    }
    invalidateCompliancePreviewCache([existing?.storage_path]);
    return;
  }

  if (!entityId) {
    throw new Error(
      scope === "vehicle"
        ? "Assign a vehicle on this trip before uploading documents."
        : "Assign a driver on this trip before uploading documents.",
    );
  }

  if (scope === "vehicle" && COMPLIANCE_VEHICLE_VAULT_TYPES.has(type) && vehicleId && !append && !skipVehicleVault) {
    // First file for RC / FC / insurance / etc. overwrites the vault slot (same
    // path as Trip Detail). Extra files in the same picker still append below.
    const saved = await uploadAndSaveVehicleDocumentForTrip(
      organizationId,
      tripId,
      vehicleId,
      type as VehicleComplianceDocType,
      file,
      expiryDate ?? "",
      null,
      [organizationId],
    );
    if (saved.error) throw saved.error;
    const slot = saved.documents?.[type as VehicleComplianceDocType];
    invalidateCompliancePreviewCache([slot?.url, existing?.storage_path]);
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
  const { error, document } = await uploadComplianceDocument(upload);
  if (error) throw error;
  invalidateCompliancePreviewCache([document?.storage_path, existing?.storage_path]);
}
