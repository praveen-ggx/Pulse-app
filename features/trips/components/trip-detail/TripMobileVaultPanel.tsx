/**
 * Narrow-screen vault — stacked category cards + e-way feed.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { DRIVER_IDENTITY_TYPE_HINT } from "@/features/drivers/utils/driverIdentityDocuments.util";
import {
  type EwayBillStripRow,
  type EwayFieldValues,
  EwayBillLrStrip,
} from "@/features/trips/components/trip-detail/EwayBillVaultTab";
import { TripMobileVaultCategoryRow } from "@/features/trips/components/trip-detail/TripMobileVaultCategoryRow";
import type { DocumentUploadAttribution } from "@/features/trips/components/trip-detail/DocumentUploadAttributionRow";
import type { VaultPreviewSignContext } from "@/features/trips/components/trip-detail/VaultCardLrStylePreview";
import { neoStyles } from "@/features/trips/components/trip-detail/TripDetailScreen.styles";
import {
  canMutateTripVaultDoc,
  isDriverIdentityVaultDoc,
  isEwayBillVaultDoc,
  type TripDocFile,
  type TripDocItem,
  VAULT_DOC_LIMIT_HINT,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { VEHICLE_COMPLIANCE_TYPE_HINT } from "@/features/vehicles/utils/vehicleDocuments.util";
import { memo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

type Props = {
  docs: TripDocItem[];
  canUploadTripDocs: boolean;
  tripCompleted?: boolean;
  uploadingDocId: string | null;
  uploadError?: { slotId: string; message: string } | null;
  vehicleId: string | null;
  onCardPress: (doc: TripDocItem, fileIndex?: number) => void;
  onAddMore?: (doc: TripDocItem) => void;
  ewayStripRows?: EwayBillStripRow[];
  onViewEwayBill?: (rowId: string) => void;
  onUploadEwayBill?: (rowId?: string) => void;
  canUploadEwayBill?: boolean;
  canEditEwayBill?: boolean;
  onSaveEwayBill?: (values: EwayFieldValues[]) => Promise<boolean>;
  tripIdLabel: string;
  createdAtLabel: string;
  sign?: VaultPreviewSignContext;
  resolveUploadAttribution?: (
    file: TripDocFile | null,
    doc: TripDocItem,
  ) => DocumentUploadAttribution | null;
};

function onFileSummary(doc: TripDocItem | undefined): string {
  const type = doc?.type?.trim() ?? "";
  if (!type || type === "FILES" || type === "PDF" || type === "JPG" || type === "PNG") {
    return "";
  }
  return type;
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
  if (doc.status === "Verified" || doc.status === "Uploaded") return "Uploaded";
  return "Pending";
}

export const TripMobileVaultPanel = memo(function TripMobileVaultPanel({
  docs,
  canUploadTripDocs,
  tripCompleted = false,
  uploadingDocId,
  uploadError = null,
  onCardPress,
  onAddMore,
  ewayStripRows = [],
  onViewEwayBill,
  onUploadEwayBill,
  canUploadEwayBill = false,
  canEditEwayBill = false,
  onSaveEwayBill,
  tripIdLabel,
  createdAtLabel,
  sign,
  resolveUploadAttribution,
}: Props) {
  const insets = useSafeAreaInsets();
  const vehicleCard = docs.find((doc) => doc.id === "vehicle-documents");
  const driverCard = docs.find((doc) => doc.id === "driver-documents");
  const vehicleSummary = onFileSummary(vehicleCard);
  const driverSummary = onFileSummary(driverCard);
  const cards = docs.filter((doc) => !isEwayBillVaultDoc(doc));

  return (
    <View style={[styles.root, { paddingBottom: 12 + insets.bottom }]}>
      {canUploadTripDocs ? (
        <Text style={[neoStyles.vaultLimitsHint, styles.hint, WEB_COPY]}>
          {VAULT_DOC_LIMIT_HINT}
        </Text>
      ) : null}
      <View style={styles.list}>
        {cards.map((doc) => (
          <TripMobileVaultCategoryRow
            key={doc.id}
            doc={doc}
            statusLabel={cardStatus(doc, vehicleSummary, driverSummary)}
            error={uploadError?.slotId === doc.id ? uploadError.message : null}
            uploading={uploadingDocId === doc.id}
            canAdd={
              canMutateTripVaultDoc({ doc, canUploadTripDocs, tripCompleted }) &&
              Boolean(onAddMore)
            }
            onPreview={(fileIndex) => onCardPress(doc, fileIndex)}
            onAdd={() => onAddMore?.(doc)}
            resolveUploadAttribution={resolveUploadAttribution}
            sign={sign}
          />
        ))}
      </View>
      <View style={styles.eway}>
        <EwayBillLrStrip
          rows={ewayStripRows}
          onView={onViewEwayBill ?? (() => undefined)}
          onUpload={onUploadEwayBill ?? (() => undefined)}
          canUpload={canUploadEwayBill}
          canEdit={canEditEwayBill}
          onSave={onSaveEwayBill ?? (async () => false)}
          variant="feed"
        />
      </View>
      <View style={styles.bottomBar}>
        <Text style={[styles.bottomText, WEB_COPY]} numberOfLines={2}>
          Trip ID{"\n"}
          <Text style={styles.bottomStrong}>{tripIdLabel}</Text>
        </Text>
        <Text style={[styles.bottomTextEnd, WEB_COPY]} numberOfLines={2}>
          Placed on{"\n"}
          <Text style={styles.bottomStrong}>{createdAtLabel}</Text>
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    backgroundColor: Theme.screenBackground,
  },
  hint: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 4,
  },
  list: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    gap: 12,
  },
  eway: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    gap: 8,
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
  },
  bottomText: {
    flex: 1,
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 18,
  },
  bottomTextEnd: {
    flex: 1,
    textAlign: "right",
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 18,
  },
  bottomStrong: {
    color: Theme.actionBtnInk,
    fontWeight: "600",
  },
});
