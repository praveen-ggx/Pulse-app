/**
 * Mobile vault category — Order Details–style card: hero, meta, status + upload log.
 */
import { HUB_MOBILE_COMMERCE_REF } from "@/components/hub/hubMobileTicketTokens";
import Theme from "@/constants/Theme";
import {
  DocumentUploadAttributionRow,
  documentUploadAttributionHasContent,
  type DocumentUploadAttribution,
} from "@/features/trips/components/trip-detail/DocumentUploadAttributionRow";
import {
  VaultCardLrStylePreview,
  type VaultPreviewSignContext,
} from "@/features/trips/components/trip-detail/VaultCardLrStylePreview";
import {
  formatSelectedVaultFileMeta,
  type TripDocFile,
  type TripDocItem,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

const SHOP = HUB_MOBILE_COMMERCE_REF;

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

export function TripMobileVaultCategoryRow({
  doc,
  statusLabel,
  error = null,
  uploading = false,
  canAdd = false,
  onPreview,
  onAdd,
  sign,
  resolveUploadAttribution,
}: {
  doc: TripDocItem;
  statusLabel: string;
  error?: string | null;
  uploading?: boolean;
  canAdd?: boolean;
  onPreview: (fileIndex: number) => void;
  onAdd: () => void;
  sign?: VaultPreviewSignContext;
  resolveUploadAttribution?: (
    file: TripDocFile | null,
    doc: TripDocItem,
  ) => DocumentUploadAttribution | null;
}) {
  const [selectedFile, setSelectedFile] = useState<TripDocFile | null>(null);
  const meta = uploading
    ? "Uploading…"
    : error ?? formatSelectedVaultFileMeta(selectedFile, statusLabel, doc);
  const uploadAttribution =
    !uploading && !error
      ? resolveUploadAttribution?.(selectedFile, doc) ?? null
      : null;
  const showUploadLog = documentUploadAttributionHasContent(uploadAttribution);
  const onFile =
    !uploading &&
    !error &&
    (doc.status === "Verified" ||
      doc.status === "Uploaded" ||
      Boolean(selectedFile?.storagePath) ||
      Boolean(doc.storagePath));
  const uploadedWhen = String(
    uploadAttribution?.uploadedAt ?? selectedFile?.uploadedAt ?? doc.uploadedAt ?? "",
  ).trim();
  const uploadedDate = uploadedWhen ? new Date(uploadedWhen) : null;
  const uploadedLabel =
    uploadedDate && !Number.isNaN(uploadedDate.getTime())
      ? uploadedDate.toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      : onFile
        ? "On file"
        : uploading
          ? "Uploading…"
          : "Awaiting upload";

  return (
    <View style={styles.card} accessibilityLabel={doc.label}>
      <VaultCardLrStylePreview
        doc={doc}
        density="shop"
        disabled={uploading}
        onAdd={canAdd ? onAdd : undefined}
        onPressFile={onPreview}
        onSelectedFile={setSelectedFile}
        sign={sign}
        uploadAttribution={uploadAttribution}
      />

      <View style={styles.metaBlock}>
        <Text style={[styles.brand, WEB_COPY]} numberOfLines={1}>
          {doc.label}
        </Text>
        <Text
          style={[styles.metaLine, WEB_COPY, error ? styles.metaError : null]}
          numberOfLines={1}
        >
          {meta}
        </Text>
      </View>

      <View
        style={[
          styles.statusCard,
          error
            ? styles.statusCardError
            : onFile
              ? styles.statusCardOn
              : styles.statusCardOff,
        ]}
      >
        <View style={styles.statusRow}>
          <View style={styles.statusCopy}>
            <Text style={styles.statusKicker}>
              {error ? "Issue" : onFile ? "Uploaded" : "Status"}
            </Text>
            <Text
              style={[styles.statusDate, (!onFile || error) && styles.statusDateMuted]}
              numberOfLines={1}
            >
              {error ? error : uploadedLabel}
            </Text>
          </View>
          {showUploadLog ? (
            <View style={styles.statusLog}>
              <DocumentUploadAttributionRow
                {...uploadAttribution!}
                size={22}
                compact
                hideWhen
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SHOP.hairline,
    backgroundColor: Theme.cardWhite,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  metaBlock: {
    width: "100%",
    alignItems: "center",
    gap: 1,
    paddingHorizontal: 4,
  },
  brand: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: SHOP.ink,
    letterSpacing: -0.15,
    textAlign: "center",
  },
  metaLine: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: SHOP.muted,
    textAlign: "center",
  },
  metaError: {
    color: Theme.negative,
  },
  statusCard: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 0,
  },
  statusCardOn: {
    backgroundColor: SHOP.successSoft,
  },
  statusCardOff: {
    backgroundColor: SHOP.warningSoft,
  },
  statusCardError: {
    backgroundColor: SHOP.dangerSoft,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  statusKicker: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    color: SHOP.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  statusDate: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: SHOP.success,
    letterSpacing: -0.1,
  },
  statusDateMuted: {
    color: SHOP.warning,
    fontSize: 12,
    lineHeight: 16,
  },
  statusLog: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: "48%",
    minWidth: 96,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
