/**
 * Asset Vault cards — same four cards on every trip:
 * Trip Details, Vehicle Document, Driver Details, Driver POD, then the e-way strip.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { Theme } from "@/constants/Theme";
import { DRIVER_IDENTITY_TYPE_HINT } from "@/features/drivers/utils/driverIdentityDocuments.util";
import {
  EwayBillLrStrip,
  type EwayBillStripRow,
  type EwayFieldValues,
} from "@/features/trips/components/trip-detail/EwayBillVaultTab";
import { neoStyles } from "@/features/trips/components/trip-detail/TripDetailScreen.styles";
import {
  isDriverIdentityVaultDoc,
  isDriverPodVaultDoc,
  isEwayBillVaultDoc,
  isTripDetailsVaultDoc,
  type TripDocItem,
  vaultDocHasPreviewableFile,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { VEHICLE_COMPLIANCE_TYPE_HINT } from "@/features/vehicles/utils/vehicleDocuments.util";
import Feather from "@expo/vector-icons/Feather";
import { Text, TouchableOpacity, View } from "react-native";

type Props = {
  docs: TripDocItem[];
  uploadingDocId: string | null;
  uploadError?: { slotId: string; message: string } | null;
  canUpload: (doc: TripDocItem) => boolean;
  vehicleSummary?: string;
  driverSummary?: string;
  onOpen: (doc: TripDocItem) => void;
  onAdd: (doc: TripDocItem) => void;
  ewayStripRows: EwayBillStripRow[];
  onViewEwayBill: (rowId: string) => void;
  onUploadEwayBill: (rowId?: string) => void;
  canUploadEwayBill: boolean;
  canEditEwayBill: boolean;
  onSaveEwayBill: (values: EwayFieldValues[]) => Promise<boolean>;
  /** Desktop Asset Vault is three cards across. Narrow screens use two. */
  columns?: 2 | 3;
  /** Tighter cards for left-half desktop rail. */
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
  columns = 3,
  compact = false,
}: Props) {
  const cards = docs.filter((doc) => !isEwayBillVaultDoc(doc));
  /** Half-width phone cards are too narrow for Preview + Add side by side. */
  const stackButtons = columns === 2 && !compact;

  return (
    <View style={[neoStyles.vaultGrid, compact && neoStyles.vaultGridCompact]}>
      {cards.map((doc) => {
        const isUploadingThis = uploadingDocId === doc.id;
        const dialog = opensVaultDialog(doc);
        const previewReady = vaultDocHasPreviewableFile(doc);
        const showAdd = canUpload(doc);
        const statusLabel = cardStatus(doc, vehicleSummary, driverSummary);
        const failure =
          uploadError?.slotId === doc.id ? uploadError.message : null;
        return (
          <View
            key={doc.id}
            style={[
              neoStyles.vaultCard,
              columns === 2 && neoStyles.vaultCardHalf,
              compact && neoStyles.vaultCardCompact,
            ]}
          >
            <TouchableOpacity
              activeOpacity={dialog ? 0.9 : 1}
              disabled={isUploadingThis || !dialog}
              onPress={dialog ? () => onOpen(doc) : undefined}
              style={neoStyles.vaultCardHeader}
              accessibilityRole={dialog ? "button" : undefined}
              accessibilityLabel={dialog ? `Open ${doc.label}` : undefined}
            >
              <Feather
                name={!previewReady ? "upload-cloud" : "file-text"}
                size={compact ? 22 : 34}
                color={!previewReady ? Theme.textMuted : Theme.textSecondary}
              />
              <Text
                style={[neoStyles.vaultTitle, compact && neoStyles.vaultTitleCompact]}
                numberOfLines={2}
              >
                {doc.label}
              </Text>
              <Text
                style={[
                  neoStyles.vaultSub,
                  compact && neoStyles.vaultSubCompact,
                  failure ? { color: Theme.negative } : null,
                ]}
                numberOfLines={3}
              >
                {isUploadingThis ? "Uploading…" : failure ?? statusLabel}
              </Text>
            </TouchableOpacity>
            <View
              style={[
                neoStyles.vaultBtnRow,
                compact && neoStyles.vaultBtnRowCompact,
                stackButtons && neoStyles.vaultBtnRowStacked,
              ]}
            >
              <TouchableOpacity
                onPress={() => onOpen(doc)}
                style={[
                  neoStyles.vaultBtn,
                  neoStyles.vaultBtnFlex,
                  compact && neoStyles.vaultBtnCompact,
                  stackButtons && neoStyles.vaultBtnStacked,
                  !previewReady && neoStyles.vaultBtnPreviewIdle,
                ]}
                activeOpacity={0.85}
                disabled={isUploadingThis || (!previewReady && !dialog)}
                accessibilityState={{
                  disabled: !previewReady && !dialog,
                }}
                accessibilityLabel={
                  dialog
                    ? `Open ${doc.label}`
                    : previewReady
                      ? `Preview ${doc.label}`
                      : `${doc.label} preview unavailable — no document on file`
                }
              >
                {isUploadingThis ? (
                  <LoadingIndicator
                    size="small"
                    color={previewReady ? Theme.buttonDarkText : Theme.textMuted}
                  />
                ) : (
                  <>
                    <Feather
                      name="eye"
                      size={compact ? 11 : 12}
                      color={previewReady ? Theme.buttonDarkText : Theme.textMuted}
                    />
                    <Text
                      style={[
                        neoStyles.vaultBtnText,
                        compact && neoStyles.vaultBtnTextCompact,
                        !previewReady && neoStyles.vaultBtnTextDisabled,
                      ]}
                      numberOfLines={1}
                    >
                      Preview
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {showAdd ? (
                <TouchableOpacity
                  onPress={() => onAdd(doc)}
                  style={[
                    neoStyles.vaultBtn,
                    neoStyles.vaultBtnUpload,
                    neoStyles.vaultBtnFlex,
                    compact && neoStyles.vaultBtnCompact,
                    stackButtons && neoStyles.vaultBtnStacked,
                  ]}
                  activeOpacity={0.85}
                  disabled={isUploadingThis}
                  accessibilityLabel={`Add ${doc.label}`}
                >
                  <Feather
                    name="plus"
                    size={compact ? 11 : 12}
                    color={Theme.buttonPrimaryText}
                  />
                  <Text
                    style={[
                      neoStyles.vaultBtnText,
                      neoStyles.vaultBtnTextUpload,
                      compact && neoStyles.vaultBtnTextCompact,
                    ]}
                    numberOfLines={1}
                  >
                    Add
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}
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
