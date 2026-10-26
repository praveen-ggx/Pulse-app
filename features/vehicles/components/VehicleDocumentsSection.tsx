/**
 * Vehicle documents section — view, upload, re-upload, and delete RC, insurance, fitness, PUC.
 * Shown in Vehicle Profile modal.
 *
 * Edge cases:
 *  - File size/type validation before upload (10 MB max; JPEG/PNG/WebP/PDF).
 *  - Re-upload: user can overwrite an existing document (same storage path, no orphan).
 *  - Delete: removes storage file + clears JSONB key.
 *  - Double-tap guard: buttons are disabled while an operation is in-flight.
 *  - Rollback: if DB update fails after storage write, orphan file is cleaned up (in service).
 */
import { DocumentDateCalendar } from "@/components/DocumentDateCalendar";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import { releaseStoragePreviewUrl } from '@/features/trips/utils/storagePreviewObjectUrl.util';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DOCUMENT_EXPIRY_ORDER,
  DOCUMENT_LABELS,
  type DocumentWithExpiry,
  type VehicleComplianceDocType,
  type VehicleDocuments,
} from '../utils/vehicleDocuments.util';
import {
  deleteVehicleDocument,
  getVehicleDocumentViewUrl,
  uploadAndSaveVehicleDocument,
  validateDocumentFile,
} from '../services/vehicleDocuments.service';

function formatExpiryDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yStr, mStr, dStr] = value.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  const dt = new Date(y, m - 1, d);
  return (
    !isNaN(dt.getTime()) &&
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

function toDisplayDateFromISO(value: string): string {
  if (!isValidISODate(value)) return '';
  const [yyyy, mm, dd] = value.split('-');
  return `${dd}-${mm}-${yyyy}`;
}

function toISODateFromDisplay(value: string): string | null {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) return null;
  const [dd, mm, yyyy] = value.split('-');
  const iso = `${yyyy}-${mm}-${dd}`;
  return isValidISODate(iso) ? iso : null;
}

function getExpiryState(expiryDate: string | null | undefined): 'valid' | 'expiringSoon' | 'expired' | null {
  if (!expiryDate) return null;
  const d = new Date(expiryDate);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) return 'expired';
  const soonThreshold = new Date(today);
  soonThreshold.setDate(soonThreshold.getDate() + 30);
  if (d <= soonThreshold) return 'expiringSoon';
  return 'valid';
}

function getExpiryLabel(expiryDate: string | null | undefined): string | null {
  if (!expiryDate) return null;
  const formatted = formatExpiryDate(expiryDate);
  const state = getExpiryState(expiryDate);
  if (state === 'expired') return `Expired on ${formatted}`;
  if (state === 'expiringSoon') return `Expiring soon: ${formatted}`;
  return `Valid till ${formatted}`;
}

/** Image picker URIs on web are blob/data URLs — expo-file-system File is native-only. */
async function readPickedFileData(uri: string): Promise<{ arrayBuffer: ArrayBuffer; blob?: Blob } | null> {
  if (Platform.OS === 'web') {
    try {
      const res = await fetch(uri);
      if (!res.ok) return null;
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return { arrayBuffer, blob };
    } catch {
      return null;
    }
  }
  const { File: ExpoFile } = await import('expo-file-system');
  try {
    const arrayBuffer = await new ExpoFile(uri).arrayBuffer();
    return { arrayBuffer };
  } catch {
    return null;
  }
}

export interface VehicleDocumentsSectionProps {
  organizationId: string;
  vehicleId: string;
  documents: VehicleDocuments | null;
  onDocumentsUpdated: (documents: VehicleDocuments) => void;
}

export function VehicleDocumentsSection({
  organizationId,
  vehicleId,
  documents,
  onDocumentsUpdated,
}: VehicleDocumentsSectionProps) {
  const insets = useSafeAreaInsets();
  const [busyType, setBusyType] = useState<VehicleComplianceDocType | null>(null);
  const [expiryModalType, setExpiryModalType] = useState<VehicleComplianceDocType | null>(null);
  const [pendingExpiry, setPendingExpiry] = useState<string | null>(null);
  const [pendingExpiryInput, setPendingExpiryInput] = useState('');
  const [expiryInlineError, setExpiryInlineError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{
    arrayBuffer: ArrayBuffer;
    fileName: string;
    mimeType: string;
    blob?: Blob;
  } | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      releaseStoragePreviewUrl(previewUrl);
    };
  }, [previewUrl]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDocType, setPreviewDocType] = useState<VehicleComplianceDocType | null>(null);

  // Guard against concurrent operations
  const busyRef = useRef(false);

  const pickAndValidateFile = async (): Promise<{
    arrayBuffer: ArrayBuffer;
    fileName: string;
    mimeType: string;
    blob?: Blob;
  } | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Permission to access photos is required to upload documents.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.[0]) return null;

    const { uri, fileName, mimeType } = result.assets[0];
    const fileData = await readPickedFileData(uri);
    if (!fileData?.arrayBuffer?.byteLength) {
      Alert.alert('Error', 'Could not read image file');
      return null;
    }

    const picked = {
      arrayBuffer: fileData.arrayBuffer,
      fileName: fileName ?? `doc-${Date.now()}.jpg`,
      mimeType: mimeType ?? 'image/jpeg',
      blob: fileData.blob,
    };

    const validationError = validateDocumentFile(picked);
    if (validationError) {
      Alert.alert('Invalid file', validationError);
      return null;
    }

    return picked;
  };

  const handleUploadPress = async (docType: VehicleComplianceDocType) => {
    if (busyRef.current) return;
    const file = await pickAndValidateFile();
    if (!file) return;

    setExpiryInlineError(null);
    setPendingFile(file);
    const todayIso = toISODate(new Date());
    setPendingExpiry(todayIso);
    setPendingExpiryInput(toDisplayDateFromISO(todayIso));
    setExpiryModalType(docType);
  };

  const handleExpiryConfirm = async () => {
    if (busyRef.current) {
      setExpiryInlineError('Upload already in progress. Please wait.');
      return;
    }
    if (!expiryModalType) {
      setExpiryInlineError('Please re-open upload and try again.');
      return;
    }
    if (!pendingFile) {
      setExpiryInlineError('Please choose a file again.');
      return;
    }
    const resolvedExpiry =
      Platform.OS === 'web'
        ? toISODateFromDisplay(pendingExpiryInput.trim())
        : pendingExpiry;

    if (!resolvedExpiry || !isValidISODate(resolvedExpiry)) {
      setExpiryInlineError('Enter expiry date in DD-MM-YYYY format.');
      Alert.alert('Invalid date', 'Enter expiry date in DD-MM-YYYY format.');
      return;
    }
    const selected = new Date(`${resolvedExpiry}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selected < today) {
      setExpiryInlineError('Expiry date cannot be in the past.');
      Alert.alert('Invalid date', 'Expiry date cannot be in the past.');
      return;
    }
    setExpiryInlineError(null);

    busyRef.current = true;
    setBusyType(expiryModalType);
    const docType = expiryModalType;
    let uploadSucceeded = false;

    try {
      const { documents: updated, error } = await uploadAndSaveVehicleDocument(
        organizationId,
        vehicleId,
        docType,
        pendingFile,
        resolvedExpiry,
        documents,
      );

      if (error || !updated) {
        setExpiryInlineError(error?.message ?? 'Could not upload document.');
        Alert.alert('Upload failed', error?.message ?? 'Could not upload document');
        return;
      }

      onDocumentsUpdated(updated);
      uploadSucceeded = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not upload document';
      setExpiryInlineError(message);
      Alert.alert('Upload failed', message);
    } finally {
      busyRef.current = false;
      setBusyType(null);
      if (uploadSucceeded) {
        setExpiryModalType(null);
        setPendingFile(null);
        setPendingExpiry(null);
        setPendingExpiryInput('');
        setExpiryInlineError(null);
      }
    }
  };

  const handleExpiryCancel = () => {
    setExpiryModalType(null);
    setPendingFile(null);
    setPendingExpiry(null);
    setPendingExpiryInput('');
    setExpiryInlineError(null);
  };

  const handleViewPress = async (doc: DocumentWithExpiry, docType: VehicleComplianceDocType) => {
    if (!doc?.url?.trim()) return;
    setPreviewDocType(docType);
    setPreviewLoading(true);
    setPreviewUrl(null);
    const url = await getVehicleDocumentViewUrl(doc.url);
    if (url) {
      setPreviewUrl(url);
      setPreviewLoading(false);
    } else {
      setPreviewLoading(false);
      Alert.alert('Error', 'Could not open document');
      setPreviewDocType(null);
    }
  };

  const handleDeletePress = (docType: VehicleComplianceDocType) => {
    Alert.alert(
      'Delete document',
      `Remove ${DOCUMENT_LABELS[docType]}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (busyRef.current) return;
            busyRef.current = true;
            setBusyType(docType);
            try {
              const { documents: updated, error } = await deleteVehicleDocument(
                organizationId,
                vehicleId,
                docType,
                documents,
              );
              if (error) {
                Alert.alert('Delete failed', error.message);
                return;
              }
              if (updated) onDocumentsUpdated(updated);
            } finally {
              busyRef.current = false;
              setBusyType(null);
            }
          },
        },
      ],
    );
  };

  const isBusy = busyRef.current;
  const previewDoc = previewDocType ? documents?.[previewDocType] : null;
  const previewDocExpiry = getExpiryLabel(previewDoc?.expiryDate);
  const previewDocExpiryState = getExpiryState(previewDoc?.expiryDate);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Documents</Text>
      <View style={styles.list}>
        {DOCUMENT_EXPIRY_ORDER.map((docType, idx) => {
          const doc = documents?.[docType];
          const hasDoc = !!doc?.url?.trim();
          const busy = busyType === docType;
          const isLast = idx === DOCUMENT_EXPIRY_ORDER.length - 1;
          const expiryState = getExpiryState(doc?.expiryDate);
          const expiryLabel = getExpiryLabel(doc?.expiryDate);

          return (
            <View
              key={docType}
              style={[styles.row, isLast && styles.rowLast]}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, hasDoc ? styles.iconWrapUploaded : styles.iconWrapEmpty]}>
                  <FontAwesome
                    name={hasDoc ? 'file-text-o' : 'file-o'}
                    size={16}
                    color={hasDoc ? Theme.darkGreen : Theme.textMuted}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{DOCUMENT_LABELS[docType]}</Text>
                  <Text
                    style={[
                      styles.rowStatus,
                      expiryState === 'valid' && styles.rowStatusValid,
                      expiryState === 'expiringSoon' && styles.rowStatusWarning,
                      expiryState === 'expired' && styles.rowStatusExpired,
                    ]}
                    numberOfLines={1}
                  >
                    {hasDoc && expiryLabel
                      ? expiryLabel
                      : 'Not uploaded'}
                  </Text>
                </View>
              </View>
              <View style={styles.rowActions}>
                {hasDoc ? (
                  <View style={styles.rowActionsGroup}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleViewPress(doc!, docType)}
                      activeOpacity={0.7}
                      hitSlop={Layout.touchTargetHitSlop}
                      disabled={isBusy}
                    >
                      <FontAwesome name="eye" size={14} color={Theme.primary} />
                      <Text style={styles.actionBtnText}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtnSmall, styles.actionBtnReupload]}
                      onPress={() => handleUploadPress(docType)}
                      activeOpacity={0.7}
                      hitSlop={Layout.touchTargetHitSlop}
                      disabled={isBusy}
                    >
                      {busy ? (
                        <LoadingIndicator size="small" color={Theme.primary} />
                      ) : (
                        <FontAwesome name="refresh" size={12} color={Theme.primary} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtnSmall, styles.actionBtnDelete]}
                      onPress={() => handleDeletePress(docType)}
                      activeOpacity={0.7}
                      hitSlop={Layout.touchTargetHitSlop}
                      disabled={isBusy}
                    >
                      {busy ? (
                        <LoadingIndicator size="small" color={Theme.teslaRed} />
                      ) : (
                        <FontAwesome name="trash-o" size={12} color={Theme.teslaRed} />
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnUpload]}
                    onPress={() => handleUploadPress(docType)}
                    disabled={busy || isBusy}
                    activeOpacity={0.7}
                    hitSlop={Layout.touchTargetHitSlop}
                  >
                    {busy ? (
                      <LoadingIndicator size="small" color={Theme.textOnPrimary} />
                    ) : (
                      <>
                        <FontAwesome name="cloud-upload" size={14} color={Theme.textOnPrimary} />
                        <Text style={styles.actionBtnTextUpload}>Upload</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Expiry date picker modal */}
      {expiryModalType && (
        <Modal visible transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <TouchableOpacity
              style={styles.modalBackdropTapArea}
              activeOpacity={1}
              onPress={handleExpiryCancel}
            />
            <View
              style={[styles.modalSheet, { paddingBottom: Math.max(32, insets.bottom) }]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Set expiry — {DOCUMENT_LABELS[expiryModalType]}
                </Text>
                <TouchableOpacity onPress={handleExpiryCancel} hitSlop={12}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.modalLabel}>Expiry date</Text>
                {Platform.OS === 'web' ? (
                  <DocumentDateCalendar
                    selectedIso={pendingExpiry || toISODate(new Date())}
                    minDate={toISODate(new Date())}
                    onSelect={(iso) => {
                      setPendingExpiry(iso);
                      setPendingExpiryInput("");
                      setExpiryInlineError(null);
                    }}
                  />
                ) : Platform.OS === 'android' ? (
                  <DateTimePicker
                    value={pendingExpiry ? new Date(pendingExpiry + 'T12:00:00') : new Date()}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(e, date) => {
                      if (e.type === 'set' && date) setPendingExpiry(toISODate(date));
                    }}
                  />
                ) : (
                  <DateTimePicker
                    value={pendingExpiry ? new Date(pendingExpiry + 'T12:00:00') : new Date()}
                    mode="date"
                    display="spinner"
                    minimumDate={new Date()}
                    onChange={(_, date) => date && setPendingExpiry(toISODate(date))}
                  />
                )}
                {expiryInlineError ? (
                  <Text style={styles.modalErrorText}>{expiryInlineError}</Text>
                ) : null}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.modalConfirm,
                  (busyType || !pendingFile || !expiryModalType) && styles.modalConfirmDisabled,
                  pressed && !(busyType || !pendingFile || !expiryModalType) && styles.modalConfirmPressed,
                ]}
                onPress={() => {
                  void handleExpiryConfirm();
                }}
                disabled={!!busyType || !pendingFile || !expiryModalType}
              >
                {busyType ? (
                  <LoadingIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.modalConfirmText}>Upload & Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* Document preview modal */}
      {previewDocType != null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewDocType(null)}>
          <View style={styles.previewBackdrop}>
            <View style={[styles.previewContainer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.previewHeader}>
                <View style={styles.previewHeaderText}>
                  <Text style={styles.previewTitle} numberOfLines={1}>
                    {DOCUMENT_LABELS[previewDocType]}
                  </Text>
                  {previewDocExpiry ? (
                    <Text
                      style={[
                        styles.previewSubtitle,
                        previewDocExpiryState === 'valid' && styles.previewSubtitleValid,
                        previewDocExpiryState === 'expiringSoon' && styles.previewSubtitleWarning,
                        previewDocExpiryState === 'expired' && styles.previewSubtitleExpired,
                      ]}
                      numberOfLines={1}
                    >
                      {previewDocExpiry}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setPreviewDocType(null);
                    setPreviewUrl(null);
                  }}
                  hitSlop={12}
                  style={styles.previewClose}
                >
                  <FontAwesome name="close" size={20} color={Theme.textPrimaryDark} />
                </TouchableOpacity>
              </View>
              <View style={styles.previewBody}>
                {previewLoading ? (
                  <LoadingIndicator size="large" color={Theme.primary} />
                ) : previewUrl ? (
                  <Image
                    source={{ uri: previewUrl }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.previewPlaceholder}>
                    <FontAwesome name="exclamation-triangle" size={48} color={Theme.textMuted} />
                    <Text style={styles.previewPlaceholderText}>Could not load preview</Text>
                  </View>
                )}
              </View>
              {previewUrl && (
                <TouchableOpacity
                  style={styles.previewOpenExternal}
                  onPress={() => previewUrl && Linking.openURL(previewUrl)}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="external-link" size={14} color={Theme.primary} />
                  <Text style={styles.previewOpenExternalText}>Open in browser</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  list: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconWrapEmpty: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  iconWrapUploaded: {
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  rowStatus: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
  },
  rowStatusValid: {
    color: Theme.positive,
    fontWeight: '600',
  },
  rowStatusWarning: {
    color: Theme.warning,
    fontWeight: '600',
  },
  rowStatusExpired: {
    color: Theme.teslaRed,
    fontWeight: '600',
  },
  rowActions: {
    marginLeft: 12,
  },
  rowActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  actionBtnSmall: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnReupload: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  actionBtnDelete: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.primary,
  },
  actionBtnUpload: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
  },
  actionBtnTextUpload: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.buttonDarkText,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalBackdropTapArea: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  modalCancel: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  modalBody: {
    paddingVertical: 20,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textMuted,
    marginBottom: 12,
  },
  modalDateInput: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surface,
  },
  modalErrorText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: Theme.negative,
  },
  modalConfirm: {
    backgroundColor: Theme.darkBackground,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalConfirmDisabled: {
    opacity: 0.6,
  },
  modalConfirmPressed: {
    opacity: 0.85,
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  previewContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  previewHeaderText: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  previewSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textOnDarkMuted,
    marginTop: 4,
  },
  previewSubtitleValid: {
    color: Theme.positive,
  },
  previewSubtitleWarning: {
    color: Theme.warning,
  },
  previewSubtitleExpired: {
    color: Theme.negative,
  },
  previewClose: {
    padding: 4,
  },
  previewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    alignItems: 'center',
    gap: 12,
  },
  previewPlaceholderText: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  previewOpenExternal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  previewOpenExternalText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.primary,
  },
});
