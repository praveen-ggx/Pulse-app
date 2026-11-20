/**
 * Document vault UI for a personal owner vehicle (Phase 2).
 */
import Theme from '@/constants/Theme';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import {
  deleteOwnerVehicleDocument,
  getOwnerVehicleDocumentViewUrl,
  listCurrentOwnerVehicleDocuments,
  uploadOwnerVehicleDocument,
  type OwnerVehicleDocumentRow,
} from '@/features/driver/services/ownerVehicleDocuments.service';
import {
  OWNER_VEHICLE_DOC_LABELS,
  OWNER_VEHICLE_DOC_SHORT,
  OWNER_VEHICLE_DOC_TYPES,
  formatOwnerDocExpiryLabel,
  ownerDocExpiryState,
  summarizeOwnerVehicleDocuments,
  type OwnerVehicleDocType,
} from '@/features/driver/utils/ownerVehicleDocuments.util';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Eye,
  FileUp,
  Replace,
  Trash2,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  ownerUserId: string;
  ownerVehicleId: string;
};

type DraftMeta = {
  documentNumber: string;
  issuedAt: string;
  expiresAt: string;
};

const emptyDraft = (): DraftMeta => ({
  documentNumber: '',
  issuedAt: '',
  expiresAt: '',
});

async function fileFromUri(
  uri: string,
  mimeType: string,
  fileName?: string,
): Promise<{ arrayBuffer: ArrayBuffer; mimeType: string; fileName?: string }> {
  const res = await fetch(uri);
  const arrayBuffer = await res.arrayBuffer();
  return { arrayBuffer, mimeType, fileName };
}

export function OwnerVehicleDocumentsSection({
  ownerUserId,
  ownerVehicleId,
}: Props) {
  const insets = useSafeAreaInsets();
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';

  const [docs, setDocs] = useState<OwnerVehicleDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<OwnerVehicleDocType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorType, setEditorType] = useState<OwnerVehicleDocType | null>(null);
  const [draft, setDraft] = useState<DraftMeta>(emptyDraft());
  const [preview, setPreview] = useState<{
    url: string;
    mime: string | null;
    title: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const byType = useMemo(() => {
    const m = new Map<string, OwnerVehicleDocumentRow>();
    for (const d of docs) m.set(d.document_type, d);
    return m;
  }, [docs]);

  const summary = useMemo(
    () => summarizeOwnerVehicleDocuments(docs),
    [docs],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { error: listError, documents } = await listCurrentOwnerVehicleDocuments(
      ownerUserId,
      ownerVehicleId,
    );
    setLoading(false);
    if (listError) {
      setError(listError.message);
      setDocs([]);
      return;
    }
    setDocs(documents);
  }, [ownerUserId, ownerVehicleId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openEditor = (type: OwnerVehicleDocType) => {
    const existing = byType.get(type);
    setDraft({
      documentNumber: existing?.document_number ?? '',
      issuedAt: existing?.issued_at ?? '',
      expiresAt: existing?.expires_at ?? '',
    });
    setEditorType(type);
  };

  const pickAndUpload = async (type: OwnerVehicleDocType) => {
    if (!editorType) return;
    // Web: Alert.alert is a no-op there, so the button did nothing. The file
    // picker accepts images and PDFs, so open it directly.
    if (Platform.OS === 'web') {
      void pickFile(type);
      return;
    }
    const sources: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
      {
        text: 'Photo library',
        onPress: () => void pickImage(type, 'library'),
      },
      {
        text: 'Camera',
        onPress: () => void pickImage(type, 'camera'),
      },
      {
        text: 'PDF / file',
        onPress: () => void pickFile(type),
      },
    ];
    // Android shows at most 3 buttons; a 4th "Cancel" was silently dropped.
    // There, tapping outside / Back cancels instead.
    if (Platform.OS !== 'android') sources.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Upload document', 'Choose a source', sources, { cancelable: true });
  };

  const pickImage = async (
    type: OwnerVehicleDocType,
    mode: 'library' | 'camera',
  ) => {
    try {
      if (mode === 'library') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setError('Photo library permission is required.');
          return;
        }
      } else {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('Camera permission is required.');
          return;
        }
      }
      const result =
        mode === 'library'
          ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.85,
            })
          : await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mime = asset.mimeType ?? 'image/jpeg';
      const file = await fileFromUri(asset.uri, mime, asset.fileName ?? undefined);
      await runUpload(type, file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not pick image.');
    }
  };

  const pickFile = async (type: OwnerVehicleDocType) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mime = asset.mimeType ?? 'application/pdf';
      const file = await fileFromUri(asset.uri, mime, asset.name);
      await runUpload(type, file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not pick file.');
    }
  };

  const runUpload = async (
    type: OwnerVehicleDocType,
    file: { arrayBuffer: ArrayBuffer; mimeType: string; fileName?: string },
  ) => {
    setBusyType(type);
    setError(null);
    const { error: upError } = await uploadOwnerVehicleDocument({
      ownerUserId,
      ownerVehicleId,
      documentType: type,
      file,
      documentNumber: draft.documentNumber,
      issuedAt: draft.issuedAt.trim() || null,
      expiresAt: draft.expiresAt.trim() || null,
    });
    setBusyType(null);
    if (upError) {
      setError(upError.message);
      return;
    }
    setEditorType(null);
    await reload();
  };

  const openPreview = async (doc: OwnerVehicleDocumentRow) => {
    setPreviewLoading(true);
    const url = await getOwnerVehicleDocumentViewUrl(doc.storage_path);
    setPreviewLoading(false);
    if (!url) {
      setError('Could not open document preview.');
      return;
    }
    const isPdf = (doc.mime_type ?? '').includes('pdf');
    if (isPdf || Platform.OS === 'web') {
      await Linking.openURL(url);
      return;
    }
    setPreview({
      url,
      mime: doc.mime_type,
      title: OWNER_VEHICLE_DOC_LABELS[doc.document_type],
    });
  };

  const confirmDelete = (doc: OwnerVehicleDocumentRow) => {
    Alert.alert(
      'Remove document?',
      `Remove ${OWNER_VEHICLE_DOC_SHORT[doc.document_type]} from this vehicle?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyType(doc.document_type);
              const { error: delError } = await deleteOwnerVehicleDocument(
                ownerUserId,
                doc.id,
              );
              setBusyType(null);
              if (delError) {
                setError(delError.message);
                return;
              }
              await reload();
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Documents</Text>
      <Text style={[styles.headline, { color: colors.textMuted }]}>{summary.headline}</Text>
      {(summary.expired > 0 || summary.expiringSoon > 0) && (
        <View
          style={[
            styles.alertBanner,
            {
              backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(254,226,226,0.9)',
            },
          ]}
        >
          <AlertCircle size={14} color={Theme.negative} />
          <Text style={[styles.alertText, { color: Theme.negative }]}>
            {summary.expired + summary.expiringSoon} document
            {summary.expired + summary.expiringSoon === 1 ? '' : 's'} need attention
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.emerald} style={{ marginVertical: 16 }} />
      ) : (
        OWNER_VEHICLE_DOC_TYPES.map((type) => {
          const doc = byType.get(type);
          const expiry = doc ? ownerDocExpiryState(doc.expires_at) : null;
          const busy = busyType === type;
          return (
            <View
              key={type}
              style={[styles.docRow, { borderTopColor: cardBorder }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[styles.docTitle, { color: colors.text }]}>
                  {OWNER_VEHICLE_DOC_SHORT[type]}
                </Text>
                {doc ? (
                  <>
                    <Text style={[styles.docMeta, { color: colors.textMuted }]} numberOfLines={1}>
                      {doc.document_number
                        ? `No. ${doc.document_number}`
                        : OWNER_VEHICLE_DOC_LABELS[type]}
                    </Text>
                    <View style={styles.statusLine}>
                      {expiry === 'valid' ? (
                        <CheckCircle2 size={12} color={colors.emerald} />
                      ) : expiry === 'expiring_soon' ? (
                        <Clock3 size={12} color={Theme.warning} />
                      ) : expiry === 'expired' ? (
                        <AlertCircle size={12} color={Theme.negative} />
                      ) : (
                        <Clock3 size={12} color={colors.textMuted} />
                      )}
                      <Text
                        style={[
                          styles.docMeta,
                          {
                            color:
                              expiry === 'expired'
                                ? Theme.negative
                                : expiry === 'expiring_soon'
                                  ? Theme.warning
                                  : colors.textMuted,
                          },
                        ]}
                      >
                        {formatOwnerDocExpiryLabel(doc.expires_at)}
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={[styles.docMeta, { color: colors.textMuted }]}>
                    Not uploaded
                  </Text>
                )}
              </View>

              <View style={styles.actions}>
                {doc ? (
                  <>
                    <Pressable
                      onPress={() => void openPreview(doc)}
                      disabled={busy || previewLoading}
                      hitSlop={8}
                      style={styles.iconBtn}
                      accessibilityLabel={`Preview ${OWNER_VEHICLE_DOC_SHORT[type]}`}
                    >
                      <Eye size={16} color={colors.emerald} />
                    </Pressable>
                    <Pressable
                      onPress={() => openEditor(type)}
                      disabled={busy}
                      hitSlop={8}
                      style={styles.iconBtn}
                      accessibilityLabel={`Replace ${OWNER_VEHICLE_DOC_SHORT[type]}`}
                    >
                      <Replace size={16} color={colors.textMuted} />
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDelete(doc)}
                      disabled={busy}
                      hitSlop={8}
                      style={styles.iconBtn}
                      accessibilityLabel={`Delete ${OWNER_VEHICLE_DOC_SHORT[type]}`}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={Theme.negative} />
                      ) : (
                        <Trash2 size={16} color={Theme.negative} />
                      )}
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={() => openEditor(type)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.uploadChip,
                      {
                        backgroundColor: isDark
                          ? colors.emeraldMuted
                          : 'rgba(167,243,208,0.45)',
                        opacity: pressed || busy ? 0.8 : 1,
                      },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.emerald} />
                    ) : (
                      <>
                        <FileUp size={14} color={colors.emerald} />
                        <Text style={[styles.uploadChipText, { color: colors.emerald }]}>
                          Upload
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          );
        })
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal
        visible={editorType != null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditorType(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {editorType
                ? `${byType.has(editorType) ? 'Replace' : 'Upload'} ${OWNER_VEHICLE_DOC_SHORT[editorType]}`
                : 'Document'}
            </Text>
            <Text style={[styles.sheetHint, { color: colors.textMuted }]}>
              Add policy / certificate number and expiry when known.
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
              Document number
            </Text>
            <TextInput
              value={draft.documentNumber}
              onChangeText={(documentNumber) =>
                setDraft((d) => ({ ...d, documentNumber }))
              }
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: cardBorder,
                  backgroundColor: isDark ? colors.surfaceElevated : '#f8fafc',
                },
              ]}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
              Issued (YYYY-MM-DD)
            </Text>
            <TextInput
              value={draft.issuedAt}
              onChangeText={(issuedAt) => setDraft((d) => ({ ...d, issuedAt }))}
              placeholder="2026-01-12"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: cardBorder,
                  backgroundColor: isDark ? colors.surfaceElevated : '#f8fafc',
                },
              ]}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
              Expires (YYYY-MM-DD)
            </Text>
            <TextInput
              value={draft.expiresAt}
              onChangeText={(expiresAt) => setDraft((d) => ({ ...d, expiresAt }))}
              placeholder="2027-01-11"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: cardBorder,
                  backgroundColor: isDark ? colors.surfaceElevated : '#f8fafc',
                },
              ]}
            />

            <Pressable
              onPress={() => editorType && void pickAndUpload(editorType)}
              disabled={busyType != null}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: colors.emerald,
                  opacity: pressed || busyType ? 0.85 : 1,
                },
              ]}
            >
              {busyType ? (
                <ActivityIndicator color={Theme.textOnPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Choose file & save</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setEditorType(null)}
              style={styles.cancelBtn}
            >
              <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={preview != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)}>
          <View style={[styles.previewCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {preview?.title}
            </Text>
            {preview?.url ? (
              <Image
                source={{ uri: preview.url }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : null}
            <Pressable onPress={() => setPreview(null)} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.textMuted }]}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  headline: { fontSize: 12, fontWeight: '600', marginTop: 4, marginBottom: 8 },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  alertText: { fontSize: 12, fontWeight: '700', flex: 1 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
  },
  docTitle: { fontSize: 14, fontWeight: '700' },
  docMeta: { fontSize: 11, fontWeight: '600' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  uploadChipText: { fontSize: 12, fontWeight: '700' },
  errorText: {
    color: Theme.negative,
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 8,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800' },
  sheetHint: { fontSize: 12, marginBottom: 4 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  primaryBtn: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: Theme.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  cancelBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 13, fontWeight: '700' },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  previewCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  previewImage: { width: '100%', height: 360, borderRadius: 10 },
});
