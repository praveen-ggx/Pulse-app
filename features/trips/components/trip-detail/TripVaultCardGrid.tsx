/**
 * Asset Vault — four cards in a row. Image opens preview; plus uploads.
 */
import { Theme } from "@/constants/Theme";
import { DRIVER_IDENTITY_TYPE_HINT } from "@/features/drivers/utils/driverIdentityDocuments.util";
import {
  EwayBillLrStrip,
  type EwayBillStripRow,
  type EwayFieldValues,
} from "@/features/trips/components/trip-detail/EwayBillVaultTab";
import { neoStyles } from "@/features/trips/components/trip-detail/TripDetailScreen.styles";
import { VaultCardLrStylePreview } from "@/features/trips/components/trip-detail/VaultCardLrStylePreview";
import {
  isDriverIdentityVaultDoc,
  isDriverPodVaultDoc,
  isEwayBillVaultDoc,
  isTripDetailsVaultDoc,
  type TripDocItem,
  vaultDocHasPreviewableFile,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { VEHICLE_COMPLIANCE_TYPE_HINT } from "@/features/vehicles/utils/vehicleDocuments.util";
import { Platform, StyleSheet, Text, View } from "react-native";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

type Props = {
  docs: TripDocItem[];
  uploadingDocId: string | null;
  uploadError?: { slotId: string; message: string } | null;
  canUpload: (doc: TripDocItem) => boolean;
  vehicleSummary?: string;
  driverSummary?: string;
  onOpen: (doc: TripDocItem, fileIndex?: number) => void;
  onAdd: (doc: TripDocItem) => void;
  ewayStripRows: EwayBillStripRow[];
  onViewEwayBill: (rowId: string) => void;
  onUploadEwayBill: (rowId?: string) => void;
  canUploadEwayBill: boolean;
  canEditEwayBill: boolean;
  onSaveEwayBill: (values: EwayFieldValues[]) => Promise<boolean>;
  columns?: 2 | 3 | 4;
  compact?: boolean;
};

function opensVaultDialog(doc: TripDocItem): boolean {
  return (
    isTripDetailsVaultDoc(doc) ||
    doc.id === "vehicle-documents" ||
    isDriverIdentityVaultDoc(doc) ||
    isDriverPodVaultDoc(doc)
  );
}

function cardStatus(
  doc: TripDocItem,
  vehicleSummary: string,
  driverSummary: string,
): string {
  if (doc.id === "vehicle-documents" || doc.category === "vehicle") {
    return vehicleSummary || VEHICLE_COMPLIANCE_TYPE_HINT;
  }
  if (isDriverIdentityVaultDoc(doc)) {
    return driverSummary || DRIVER_IDENTITY_TYPE_HINT;
  }
  if (doc.status === "Verified") return "Uploaded";
  return doc.status;
}

export function TripVaultCardGrid({
  docs,
  uploadingDocId,
  uploadError = null,
  canUpload,
  vehicleSummary = "",
  driverSummary = "",
  onOpen,
  onAdd,
  ewayStripRows,
  onViewEwayBill,
  onUploadEwayBill,
  canUploadEwayBill,
  canEditEwayBill,
  onSaveEwayBill,
}: Props) {
  const cards = docs.filter((doc) => !isEwayBillVaultDoc(doc));

  return (
    <View style={[neoStyles.vaultGrid, neoStyles.vaultGridFour]}>
      <View style={styles.cardRow}>
      {cards.map((doc) => {
        const isUploadingThis = uploadingDocId === doc.id;
        const dialog = opensVaultDialog(doc);
        const previewReady = vaultDocHasPreviewableFile(doc);
        const showAdd = canUpload(doc);
        const statusLabel = cardStatus(doc, vehicleSummary, driverSummary);
        const failure =
          uploadError?.slotId === doc.id ? uploadError.message : null;
        const previewDisabled = isUploadingThis || (!previewReady && !dialog);
        return (
          <View key={doc.id} style={[neoStyles.vaultCard, neoStyles.vaultCardQuarter, styles.card]}>
            <View style={styles.header}>
              <Text style={[styles.title, WEB_COPY]} numberOfLines={1}>
                {doc.label}
              </Text>
              <Text
                style={[styles.meta, WEB_COPY, failure ? styles.metaFail : null]}
                numberOfLines={1}
              >
                {isUploadingThis ? "Uploading…" : failure ?? statusLabel}
              </Text>
            </View>
            <View style={styles.preview}>
              <VaultCardLrStylePreview
                doc={doc}
                disabled={previewDisabled}
                onAdd={showAdd ? () => onAdd(doc) : undefined}
                onPressFile={(index) => {
                  if (!previewDisabled) onOpen(doc, index);
                }}
              />
            </View>
          </View>
        );
      })}
      </View>
      <View style={neoStyles.vaultEwayWrap}>
        <EwayBillLrStrip
          rows={ewayStripRows}
          onView={onViewEwayBill}
          onUpload={onUploadEwayBill}
          canUpload={canUploadEwayBill}
          canEdit={canEditEwayBill}
          onSave={onSaveEwayBill}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  card: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 248,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 10,
  },
  header: {
    width: "100%",
    minHeight: 38,
    gap: 3,
  },
  title: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Theme.textPrimaryDark,
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    letterSpacing: 0.15,
    color: Theme.textSecondary,
  },
  metaFail: {
    color: Theme.negative,
  },
  preview: {
    flex: 1,
    minHeight: 200,
    width: "100%",
  },
});
