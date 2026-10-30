/**
 * Asset Vault — shop Order Details cards in a row. Image opens preview; plus uploads.
 */
import { DRIVER_IDENTITY_TYPE_HINT } from "@/features/drivers/utils/driverIdentityDocuments.util";
import {
  EwayBillLrStrip,
  type EwayBillStripRow,
  type EwayFieldValues,
} from "@/features/trips/components/trip-detail/EwayBillVaultTab";
import { neoStyles } from "@/features/trips/components/trip-detail/TripDetailScreen.styles";
import type { DocumentUploadAttribution } from "@/features/trips/components/trip-detail/DocumentUploadAttributionRow";
import { TripMobileVaultCategoryRow } from "@/features/trips/components/trip-detail/TripMobileVaultCategoryRow";
import type { VaultPreviewSignContext } from "@/features/trips/components/trip-detail/VaultCardLrStylePreview";
import {
  isDriverIdentityVaultDoc,
  isDriverPodVaultDoc,
  isEwayBillVaultDoc,
  isTripDetailsVaultDoc,
  type TripDocFile,
  type TripDocItem,
  vaultDocHasPreviewableFile,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { VEHICLE_COMPLIANCE_TYPE_HINT } from "@/features/vehicles/utils/vehicleDocuments.util";
import { StyleSheet, View } from "react-native";

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
  sign?: VaultPreviewSignContext;
  /** Resolve uploader avatar + name for the selected vault file. */
  resolveUploadAttribution?: (
    file: TripDocFile | null,
    doc: TripDocItem,
  ) => DocumentUploadAttribution | null;
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
  sign,
  resolveUploadAttribution,
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
            <View key={doc.id} style={styles.cardCell}>
              <TripMobileVaultCategoryRow
                doc={doc}
                statusLabel={statusLabel}
                error={failure}
                uploading={isUploadingThis}
                canAdd={showAdd}
                onPreview={(index) => {
                  if (!previewDisabled) onOpen(doc, index);
                }}
                onAdd={() => onAdd(doc)}
                sign={sign}
                resolveUploadAttribution={resolveUploadAttribution}
              />
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
    flexWrap: "wrap",
    gap: 12,
  },
  cardCell: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 220,
    maxWidth: "100%",
    minWidth: 200,
  },
});
