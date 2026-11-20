/**
 * Pick → upload → register a driver KYC document. Shared by the driver
 * Documents screen (normal driver documents) and the DCO status screen
 * (DCO-only documents), so both go through the same storage path
 * (driver-documents/{uid}/{docType}-{ts}.ext) and the same
 * submitDriverKycDocument insert/resubmit rules.
 */
import { useAuth } from '@/contexts/AuthContext';
import {
  submitDriverKycDocument,
  type DriverKycDocType,
  type DriverKycDocument,
} from '@/features/drivers/services/driverKycDocuments.service';
import { supabase } from '@/lib/supabase';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';

function normalizeDocMimeType(rawMime: string | null | undefined): string {
  const mime = (rawMime ?? '').toLowerCase();
  if (mime.includes('png')) return 'image/png';
  if (mime.includes('webp')) return 'image/webp';
  if (mime.includes('pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const maybeBuffer = (globalThis as { Buffer?: { from: (value: string, enc: string) => Uint8Array } }).Buffer;
  if (maybeBuffer?.from) return maybeBuffer.from(normalized, 'base64');
  throw new Error('Base64 decoding is not available on this device');
}

async function readAssetBytes(uri: string, base64?: string): Promise<ArrayBuffer | Uint8Array> {
  if (typeof base64 === 'string' && base64.trim().length > 0) {
    return base64ToUint8Array(base64.trim());
  }

  // Web picker commonly returns blob: URLs; fetch() reads these reliably.
  try {
    const response = await fetch(uri);
    if (response.ok) {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 0) return bytes;
    }
  } catch {
    // fall through to expo-file-system
  }

  const bytes = await new File(uri).arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('Could not read selected document');
  return bytes;
}

export async function openDriverKycDocument(doc: DriverKycDocument | undefined): Promise<void> {
  if (!doc?.storage_path?.trim()) return;
  try {
    const { data, error } = await supabase()
      .storage
      .from('driver-documents')
      .createSignedUrl(doc.storage_path, 60 * 10);
    if (error || !data?.signedUrl) {
      Alert.alert('Preview unavailable', error?.message || 'Could not open document.');
      return;
    }
    await Linking.openURL(data.signedUrl);
  } catch (e) {
    Alert.alert('Preview unavailable', e instanceof Error ? e.message : 'Could not open document.');
  }
}

export function useDriverKycDocUpload(onUploaded: () => void | Promise<void>) {
  const { profile } = useAuth();
  const [uploadingDocKey, setUploadingDocKey] = useState<DriverKycDocType | null>(null);

  const uploadDocumentFrom = useCallback(
    async (docType: DriverKycDocType, label: string, source: 'gallery' | 'camera') => {
      if (!profile?.uid || uploadingDocKey) return;
      setUploadingDocKey(docType);
      try {
        // Web has no media-library permission model — the browser's own file
        // dialog is the consent step. Requesting it there can resolve un-granted
        // and block a picker that would otherwise work fine.
        if (Platform.OS === 'web') {
          // no-op: fall through to launchImageLibraryAsync
        } else if (source === 'gallery') {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission required', 'Photo library access is needed to upload this document.');
            return;
          }
        } else {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission required', 'Camera access is needed to capture this document.');
            return;
          }
        }

        const result =
          source === 'gallery'
            ? await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.9,
                base64: true,
              })
            : await ImagePicker.launchCameraAsync({
                allowsEditing: false,
                quality: 0.9,
                base64: true,
              });
        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];
        const mimeType = normalizeDocMimeType(asset.mimeType);
        const extByMime =
          mimeType === 'image/png'
            ? 'png'
            : mimeType === 'image/webp'
              ? 'webp'
              : mimeType === 'application/pdf'
                ? 'pdf'
                : 'jpg';
        const ext = (asset.fileName?.split('.').pop() || extByMime).toLowerCase();
        const path = `${profile.uid}/${docType}-${Date.now()}.${ext}`;
        const uploadBytes = await readAssetBytes(
          asset.uri,
          typeof asset.base64 === 'string' ? asset.base64 : undefined,
        );

        const { error: uploadError } = await supabase()
          .storage
          .from('driver-documents')
          .upload(path, uploadBytes, {
            contentType: mimeType,
            upsert: true,
          });
        if (uploadError) {
          Alert.alert('Upload failed', uploadError.message || `Could not upload ${label}.`);
          return;
        }

        const { error: submitError } = await submitDriverKycDocument({
          doc_type: docType,
          storage_path: path,
          file_name: asset.fileName ?? `${docType}.${ext}`,
          mime_type: mimeType,
          file_size_bytes: asset.fileSize ?? undefined,
        });
        if (submitError) {
          // The record was refused, so the stored file is unreferenced — remove
          // it rather than leave an orphan, and don't claim it was submitted.
          await supabase().storage.from('driver-documents').remove([path]);
          const unsupportedType = /doc_type_check|check constraint/i.test(submitError.message);
          Alert.alert(
            'Could not save document',
            unsupportedType
              ? `${label} can't be saved yet — this document type isn't enabled on the server. Please try again later.`
              : submitError.message,
          );
          return;
        }

        await onUploaded();
        Alert.alert('Submitted', `${label} submitted for review.`);
      } catch (e) {
        Alert.alert('Upload failed', e instanceof Error ? e.message : `Could not upload ${label}.`);
      } finally {
        setUploadingDocKey(null);
      }
    },
    [profile?.uid, uploadingDocKey, onUploaded],
  );

  /**
   * Standard row tap: view a pending/verified doc, otherwise offer
   * Gallery / Camera (straight to the file picker on web).
   */
  const promptUpload = useCallback(
    (doc: DriverKycDocument | undefined, docType: DriverKycDocType, label: string) => {
      const canReupload = !doc?.storage_path || doc.status === 'rejected' || doc.status === 'expired';

      if (doc?.storage_path && !canReupload) {
        // Verified or pending — view only. Pending review shouldn't be silently
        // overwritten while an admin may already be looking at it.
        void openDriverKycDocument(doc);
        return;
      }

      // RN Web's Alert.alert renders a window.confirm and silently ignores any
      // button past the first two, so the Gallery/Camera sheet never appears on
      // web. Web has no camera roll distinction anyway — go straight to the
      // file picker, which is what the browser's own dialog provides.
      if (Platform.OS === 'web') {
        void uploadDocumentFrom(docType, label, 'gallery');
        return;
      }

      const actions: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Gallery', onPress: () => void uploadDocumentFrom(docType, label, 'gallery') },
        { text: 'Camera', onPress: () => void uploadDocumentFrom(docType, label, 'camera') },
      ];
      if (doc?.storage_path) {
        actions.splice(1, 0, { text: 'View current', onPress: () => void openDriverKycDocument(doc) });
      }
      // Android shows at most 3 buttons: with "View current" added, Camera was
      // silently dropped. There, drop Cancel (tap outside / Back cancels).
      const shownActions =
        Platform.OS === 'android' && actions.length > 3
          ? actions.filter((a) => a.style !== 'cancel')
          : actions;
      Alert.alert(
        label,
        doc?.status === 'rejected' && doc.rejection_notes
          ? `Rejected: ${doc.rejection_notes}\n\nUpload a new one?`
          : 'Upload this document now?',
        shownActions,
        { cancelable: true },
      );
    },
    [uploadDocumentFrom],
  );

  return { uploadingDocKey, uploadDocumentFrom, promptUpload };
}
