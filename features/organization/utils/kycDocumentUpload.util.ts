import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import {
  uploadVerificationDocument,
  type AddressProofFile,
  type DocVerifyTypedValues,
  type VerificationDocumentType,
} from '@/features/organization/services/businessVerification.service';
import type { OrganizationKycDocType } from '@/features/organization/types/organizationKycDocuments.types';
import type { AddressProofType } from '@/types/organization';

export type PickedVerificationDocument = {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  localUri?: string;
  extractedGstin?: string | null;
  extractedPan?: string | null;
  extractedCin?: string | null;
  extractedMsme?: string | null;
  extractedIec?: string | null;
};

/** Distinguishes cancel vs OCR/upload failure — callers must not toast success on error. */
export type PickVerificationDocumentResult =
  | { status: 'ok'; document: PickedVerificationDocument }
  | { status: 'cancelled' }
  | { status: 'error'; error: Error };

function failResult(message: string): PickVerificationDocumentResult {
  // Native Alert is fine; on web Alert.alert is a no-op so callers must surface `error`.
  if (Platform.OS !== 'web') {
    Alert.alert('Upload failed', message);
  }
  return { status: 'error', error: new Error(message) };
}

/** address_proof has no single enum member — it maps to one of three
 * sub-types based on what the user picked in the document-type chips. */
function resolveVerificationDocumentType(
  docType: OrganizationKycDocType,
  addressProofType?: AddressProofType,
): VerificationDocumentType | null {
  if (docType === 'address_proof') {
    switch (addressProofType) {
      case 'lease': return 'address_proof_lease';
      case 'utility_bill': return 'address_proof_utility_bill';
      default: return 'address_proof_other';
    }
  }
  if (
    docType === 'gst_certificate' ||
    docType === 'pan_card' ||
    docType === 'cin_certificate' ||
    docType === 'msme_certificate' ||
    docType === 'iec_certificate' ||
    docType === 'incorporation_certificate' ||
    docType === 'partnership_deed' ||
    docType === 'llp_agreement' ||
    docType === 'aadhaar_card'
  ) {
    return docType;
  }
  return null;
}

async function ensureBase64(asset: {
  uri: string;
  base64?: string | null;
}): Promise<string | undefined> {
  if (asset.base64) return asset.base64;
  if (Platform.OS === 'web') return undefined;
  return FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function processAsset(
  orgId: string,
  docType: OrganizationKycDocType,
  asset: {
    uri: string;
    mimeType?: string | null;
    fileName?: string | null;
    base64?: string | null;
    fileSize?: number | null;
  },
  addressProofType?: AddressProofType,
  typedValues?: DocVerifyTypedValues,
): Promise<PickVerificationDocumentResult> {
  const verificationDocType = resolveVerificationDocumentType(docType, addressProofType);
  if (!verificationDocType) {
    return failResult('This document type is not yet supported.');
  }
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const fileName = asset.fileName ?? `${docType}-${Date.now()}.jpg`;

  let base64: string | undefined;
  try {
    base64 = await ensureBase64(asset);
  } catch (err) {
    return failResult(err instanceof Error ? err.message : 'Could not read the selected file.');
  }

  const file: AddressProofFile = {
    uri: asset.uri,
    mimeType,
    fileName,
    base64,
  };
  const { path, error, verify } = await uploadVerificationDocument(
    orgId,
    verificationDocType,
    file,
    typedValues,
  );
  if (error || !path) {
    return failResult(error?.message ?? 'Could not upload document.');
  }
  return {
    status: 'ok',
    document: {
      path,
      fileName,
      mimeType,
      sizeBytes: asset.fileSize ?? undefined,
      localUri: asset.uri,
      extractedGstin: verify?.extracted?.gstin ?? null,
      extractedPan: verify?.extracted?.pan ?? null,
      extractedCin: verify?.extracted?.cin ?? null,
      extractedMsme: verify?.extracted?.msme ?? null,
      extractedIec: verify?.extracted?.iec ?? null,
    },
  };
}

async function pickAndUploadVerificationDocumentWeb(
  orgId: string,
  docType: OrganizationKycDocType,
  addressProofType?: AddressProofType,
  typedValues?: DocVerifyTypedValues,
): Promise<PickVerificationDocumentResult> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return { status: 'cancelled' };
    const a = res.assets[0];
    return await processAsset(
      orgId,
      docType,
      {
        uri: a.uri,
        mimeType: a.mimeType ?? 'application/pdf',
        fileName: a.name,
        fileSize: a.size,
      },
      addressProofType,
      typedValues,
    );
  } catch (err) {
    return failResult(err instanceof Error ? err.message : 'File error.');
  }
}

/** Document picker — camera, gallery, or PDF. `addressProofType` is required when docType === 'address_proof'. */
export function pickAndUploadVerificationDocument(
  orgId: string,
  docType: OrganizationKycDocType,
  addressProofType?: AddressProofType,
  typedValues?: DocVerifyTypedValues,
): Promise<PickVerificationDocumentResult> {
  if (Platform.OS === 'web') {
    return pickAndUploadVerificationDocumentWeb(orgId, docType, addressProofType, typedValues);
  }
  return new Promise((resolve) => {
    Alert.alert('Upload document', 'Choose a source', [
      {
        text: 'Camera',
        onPress: () => {
          void (async () => {
            try {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) {
                resolve(failResult('Camera access is needed.'));
                return;
              }
              const res = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.85,
                base64: true,
              });
              if (res.canceled || !res.assets[0]) {
                resolve({ status: 'cancelled' });
                return;
              }
              resolve(await processAsset(orgId, docType, res.assets[0], addressProofType, typedValues));
            } catch (err) {
              resolve(failResult(err instanceof Error ? err.message : 'Camera error.'));
            }
          })();
        },
      },
      {
        text: 'Gallery',
        onPress: () => {
          void (async () => {
            try {
              const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!perm.granted) {
                resolve(failResult('Photo library access is needed.'));
                return;
              }
              const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images', 'livePhotos'],
                quality: 0.85,
                base64: true,
              });
              if (res.canceled || !res.assets[0]) {
                resolve({ status: 'cancelled' });
                return;
              }
              resolve(await processAsset(orgId, docType, res.assets[0], addressProofType, typedValues));
            } catch (err) {
              resolve(failResult(err instanceof Error ? err.message : 'Gallery error.'));
            }
          })();
        },
      },
      {
        text: 'PDF / File',
        onPress: () => {
          void (async () => {
            try {
              const res = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                copyToCacheDirectory: true,
              });
              if (res.canceled || !res.assets[0]) {
                resolve({ status: 'cancelled' });
                return;
              }
              const a = res.assets[0];
              resolve(
                await processAsset(
                  orgId,
                  docType,
                  {
                    uri: a.uri,
                    mimeType: a.mimeType ?? 'application/pdf',
                    fileName: a.name,
                    fileSize: a.size,
                  },
                  addressProofType,
                  typedValues,
                ),
              );
            } catch (err) {
              resolve(failResult(err instanceof Error ? err.message : 'File error.'));
            }
          })();
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve({ status: 'cancelled' }) },
    ], { cancelable: true, onDismiss: () => resolve({ status: 'cancelled' }) });
  });
}

/** @deprecated Use pickAndUploadVerificationDocument(orgId, 'address_proof') */
export function pickAndUploadAddressProof(orgId: string) {
  return pickAndUploadVerificationDocument(orgId, 'address_proof');
}
