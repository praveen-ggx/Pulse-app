import { LoadingIndicator } from '@/components/LoadingIndicator';
import type { ComplianceVaultFile } from "@/features/tripCompliance/services/complianceVaultUpload.service";
import Layout from '@/constants/Layout';
import { Theme } from '@/constants/Theme';
import {
  EwayBillLrStrip,
  type EwayBillStripRow,
  type EwayFieldValues,
} from '@/features/trips/components/trip-detail/EwayBillVaultTab';
import {
  formatLrVaultNumberLabel,
  isEwayBillVaultDoc,
  isLrVaultDoc,
  isTripDetailsVaultDoc,
  isDriverPodVaultDoc,
  type TripDocItem,
  vaultDocHasPreviewableFile,
} from '@/features/trips/components/trip-detail/tripDocTypes';
import { platformShadow } from '@/lib/platformShadow';
import Feather from '@expo/vector-icons/Feather';
import { MotiView } from 'moti';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type DocTone = 'critical' | 'pending' | 'ok';

function resolveDocTone(status: TripDocItem['status'] | string): DocTone {
  if (status === 'Missing') return 'critical';
  if (status === 'Pending') return 'pending';
  return 'ok';
}

function toneStyles(tone: DocTone) {
  if (tone === 'critical') {
    return {
      iconWrap: styles.cardIconCritical,
      iconColor: Theme.negative,
      chip: styles.statusChipCritical,
      chipText: styles.statusTextCritical,
    };
  }
  if (tone === 'ok') {
    return {
      iconWrap: styles.cardIconOk,
      iconColor: Theme.darkGreen,
      chip: styles.statusChipOk,
      chipText: styles.statusTextOk,
    };
  }
  return {
    iconWrap: styles.cardIconPending,
    iconColor: Theme.textMuted,
    chip: styles.statusChipPending,
    chipText: styles.statusTextPending,
  };
}

type Props = {
  docs: TripDocItem[];
  canUploadTripDocs: boolean;
  uploadingDocId: string | null;
  vehicleId: string | null;
  onCardPress: (doc: TripDocItem) => void;
  onAddPress?: (doc: TripDocItem) => void;
  ewayStripRows?: EwayBillStripRow[];
  onViewEwayBill?: (rowId: string) => void;
  onUploadEwayBill?: (rowId: string) => void;
  canUploadEwayBill?: boolean;
  canEditEwayBill?: boolean;
  onSaveEwayBill?: (values: EwayFieldValues[]) => Promise<boolean>;
  /** "Add e-way number" with its required document (number + file saved together). */
  onAddEwayBillWithFile?: (entry: EwayFieldValues, file: ComplianceVaultFile) => Promise<boolean>;
};

export function TripAssetVaultPanel({
  docs,
  canUploadTripDocs,
  uploadingDocId,
  vehicleId: _vehicleId,
  onCardPress,
  onAddPress,
  ewayStripRows = [],
  onViewEwayBill,
  onUploadEwayBill,
  canUploadEwayBill,
  canEditEwayBill,
  onSaveEwayBill,
  onAddEwayBillWithFile,
}: Props) {
  const cardDocs = docs.filter((doc) => !isEwayBillVaultDoc(doc));
  const verifiedCount = cardDocs.filter((doc) => doc.status !== 'Pending').length;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Feather name="shield" size={17} color={Theme.brandBlueInk} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Asset Vault</Text>
          <Text style={styles.subtitle}>Operational Compliance Registry</Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>
            {verifiedCount}/{cardDocs.length}
          </Text>
        </View>
      </View>

      <View style={[styles.grid, cardDocs.length <= 3 && styles.gridCompact]}>
        {cardDocs.map((doc, index) => {
          const tone = resolveDocTone(doc.status);
          const palette = toneStyles(tone);
          const isUploading = uploadingDocId === doc.id;
          const isPending = doc.status === 'Pending';
          const previewReady = vaultDocHasPreviewableFile(doc);
          const showAddBtn = Boolean(canUploadTripDocs && onAddPress);
          const opensDialog =
            isTripDetailsVaultDoc(doc) ||
            doc.id === "vehicle-documents" ||
            doc.id === "driver-documents" ||
            isDriverPodVaultDoc(doc);

          return (
            <MotiView
              key={doc.id}
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{
                type: 'timing',
                duration: 320,
                delay: index * 60,
              }}
              style={[
                styles.card,
                cardDocs.length <= 3 && styles.cardCompact,
              ]}
            >
              <View style={styles.cardTopRow}>
                <View style={[styles.cardIconWrap, palette.iconWrap]}>
                  <Feather
                    name={tone === 'critical' ? 'alert-triangle' : 'file-text'}
                    size={14}
                    color={palette.iconColor}
                  />
                </View>
                <View style={[styles.statusChip, palette.chip]}>
                  <Text style={[styles.statusText, palette.chipText]} numberOfLines={1}>
                    {!isPending && isLrVaultDoc(doc)
                      ? formatLrVaultNumberLabel(doc.documentNumber) || doc.status
                      : isTripDetailsVaultDoc(doc)
                      ? doc.status
                      : !isPending && (doc.files?.length ?? 0) > 1
                      ? doc.id === 'vehicle-documents' || doc.id === 'driver-documents' || doc.id === 'trip-details'
                        ? doc.type
                        : `${doc.files?.length} files`
                      : doc.documentNumber?.trim()
                        ? doc.documentNumber.trim()
                        : doc.id === 'vehicle-documents' || doc.id === 'driver-documents' || doc.id === 'trip-details'
                          ? doc.type
                          : doc.status}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={opensDialog ? 0.88 : 1}
                disabled={isUploading || !opensDialog}
                onPress={() => onCardPress(doc)}
                accessibilityRole={opensDialog ? "button" : undefined}
                accessibilityLabel={opensDialog ? `Open ${doc.label}` : undefined}
              >
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {doc.label}
                </Text>
              </TouchableOpacity>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    styles.actionBtnFlex,
                    previewReady ? styles.actionBtnPreview : styles.actionBtnPreviewIdle,
                  ]}
                  onPress={() => onCardPress(doc)}
                  activeOpacity={0.88}
                  disabled={isUploading || (!previewReady && !opensDialog)}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: !previewReady && !opensDialog,
                  }}
                  accessibilityLabel={
                    opensDialog
                      ? `Open ${doc.label}`
                      : previewReady
                      ? `Preview ${doc.label}`
                      : `${doc.label} preview unavailable — no document on file`
                  }
                >
                  {isUploading ? (
                    <LoadingIndicator
                      size="small"
                      color={previewReady ? Theme.buttonDarkText : Theme.textMuted}
                    />
                  ) : (
                    <>
                      <Feather
                        name="eye"
                        size={12}
                        color={previewReady ? Theme.buttonDarkText : Theme.textMuted}
                      />
                      <Text
                        style={
                          previewReady ? styles.actionTextPreview : styles.actionTextPreviewIdle
                        }
                      >
                        Preview
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                {showAddBtn ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary, styles.actionBtnFlex]}
                    onPress={() => onAddPress?.(doc)}
                    activeOpacity={0.88}
                    disabled={isUploading}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${doc.label}`}
                  >
                    <Feather name="plus" size={12} color={Theme.brandBlueInk} />
                    <Text style={styles.actionTextPrimary}>Add</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </MotiView>
          );
        })}
      </View>
      <View style={styles.ewayWrap}>
        <EwayBillLrStrip
          rows={ewayStripRows}
          onView={onViewEwayBill ?? (() => undefined)}
          onUpload={onUploadEwayBill}
          canUpload={canUploadEwayBill}
          canEdit={canEditEwayBill}
          onSave={onSaveEwayBill}
          onAddWithFile={onAddEwayBillWithFile}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: Layout.screenPaddingHorizontal - 6,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  headerBadge: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.brandBlueInk,
    letterSpacing: 0.2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'stretch',
  },
  gridCompact: {
    flexWrap: 'nowrap',
  },
  ewayWrap: {
    width: '100%',
  },
  card: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 0,
    minHeight: 128,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    justifyContent: 'space-between',
    gap: 10,
    ...platformShadow('0 8px 22px rgba(15, 23, 42, 0.05)', {
      color: Theme.shadow,
      opacity: 0.05,
      radius: 10,
      offsetY: 4,
      elevation: 2,
    }),
  },
  cardCompact: {
    width: undefined,
    flex: 1,
    flexBasis: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  cardIconPending: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  cardIconCritical: {
    backgroundColor: Theme.negativeMuted,
    borderColor: 'rgba(220,38,38,0.22)',
  },
  cardIconOk: {
    backgroundColor: 'rgba(5,150,105,0.1)',
    borderColor: 'rgba(5,150,105,0.22)',
  },
  statusChip: {
    maxWidth: '58%',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  statusChipPending: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  statusChipCritical: {
    backgroundColor: Theme.negativeMuted,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.2)',
  },
  statusChipOk: {
    backgroundColor: 'rgba(5,150,105,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(5,150,105,0.2)',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'capitalize',
  },
  statusTextPending: {
    color: Theme.textMuted,
  },
  statusTextCritical: {
    color: Theme.negative,
  },
  statusTextOk: {
    color: Theme.darkGreen,
  },
  cardTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    lineHeight: 16,
    minHeight: 32,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  actionBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 34,
  },
  actionBtnFlex: {
    flex: 1,
  },
  actionBtnPreview: {
    backgroundColor: Theme.buttonDark,
    borderColor: Theme.buttonDark,
  },
  actionBtnPreviewIdle: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  actionBtnPrimary: {
    backgroundColor: Theme.brandBlueWashSubtle,
    borderColor: Theme.brandBlueRing,
  },
  actionTextPreview: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.buttonDarkText,
  },
  actionTextPreviewIdle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textMuted,
  },
  actionTextPrimary: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.brandBlueInk,
  },
});
