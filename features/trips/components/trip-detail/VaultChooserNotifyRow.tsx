/**
 * Vault document card — title, number, and a preview that fills the frame.
 */
import { RegistryPrimaryButton } from "@/components/AlertRegistryCardActions";
import Theme from "@/constants/Theme";
import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import { isPdfTripDoc } from "@/features/trips/components/trip-detail/tripDocTypes";
import { VaultDocThumb } from "@/features/trips/components/trip-detail/VaultDocThumb";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { FileText } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

const ADD_BTN: ViewStyle = {
  alignSelf: "center",
  flexGrow: 0,
  minWidth: 0,
  width: "auto",
};

export type VaultChooserPreviewSource = "trip" | "vehicle" | "compliance" | "supplier-kyc";

export type VaultChooserPreview = {
  storagePath?: string | null;
  previewUri?: string | null;
  fileName?: string | null;
  mimeHint?: string | null;
  source?: VaultChooserPreviewSource;
  organizationId?: string | null;
  entityId?: string | null;
};

type Props = {
  label: string;
  meta: string;
  onFile: boolean;
  canUpload: boolean;
  entityType?: PartyEntityType;
  preview?: VaultChooserPreview | null;
  /** LR / invoice / e-way number, shown under the title. */
  actionText?: string;
  required?: boolean;
  onPreview: () => void;
  onAdd: () => void;
};

const WEB_POINTER = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : null;

function ChooserQuoteDoc({
  preview,
  onPress,
}: {
  preview: VaultChooserPreview;
  onPress: () => void;
}) {
  const [uri, setUri] = useState<string | null>(preview.previewUri?.trim() || null);

  useEffect(() => {
    const ready = preview.previewUri?.trim() || "";
    if (ready) {
      setUri(ready);
      return;
    }
    const path = preview.storagePath?.trim() || "";
    if (!path) {
      setUri(null);
      return;
    }
    if (/^https?:\/\//i.test(path)) {
      setUri(path);
      return;
    }
    let cancelled = false;
    void signCompliancePreviewUrl({
      storagePath: path,
      source:
        preview.source === "vehicle"
          ? "vehicle-vault"
          : preview.source === "supplier-kyc"
            ? "supplier-kyc"
            : preview.source === "compliance"
              ? "compliance"
              : "trip",
      organizationId: preview.organizationId,
      entityId: preview.entityId,
    }).then((signed) => {
      if (!cancelled) setUri(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [preview.entityId, preview.organizationId, preview.previewUri, preview.source, preview.storagePath]);

  const pdf = isPdfTripDoc({
    fileName: preview.fileName,
    mimeType: preview.mimeHint,
    storagePath: preview.storagePath,
  });

  return (
    <Pressable
      onPress={onPress}
      style={[styles.quoteDoc, WEB_POINTER]}
      accessibilityRole="button"
      accessibilityLabel={`Preview ${preview.fileName || "document"}`}
    >
      <VaultDocThumb
        uri={uri}
        isPdf={pdf}
        fileName={preview.fileName}
        sizing="cover"
        style={styles.quoteImage}
      />
    </Pressable>
  );
}

function redundantMeta(meta: string, onFile: boolean): boolean {
  const value = meta.trim().toLowerCase();
  if (!value) return true;
  return value === "on file" || value === "not uploaded" || value === (onFile ? "on file" : "not uploaded");
}

export function VaultChooserNotifyRow({
  label,
  meta,
  onFile,
  canUpload,
  preview = null,
  actionText,
  required,
  onPreview,
  onAdd,
}: Props) {
  const showDoc = onFile && Boolean(preview?.previewUri?.trim() || preview?.storagePath?.trim());
  const numberLine = actionText?.trim() || "";
  const caption = redundantMeta(meta, onFile) || meta.trim() === numberLine ? "" : meta.trim();

  return (
    <Pressable
      onPress={onFile ? onPreview : canUpload ? onAdd : undefined}
      disabled={!onFile && !canUpload}
      accessibilityRole="button"
      accessibilityLabel={`${label}${numberLine ? ` ${numberLine}` : ""}`}
      style={[styles.card, WEB_POINTER]}
    >
      <View style={styles.header}>
        <View style={styles.iconWash} accessibilityElementsHidden>
          <FileText size={14} color={Theme.actionBtnInk} strokeWidth={2.2} />
        </View>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {label}
            </Text>
            {required === true ? (
              <View style={[styles.chip, styles.chipRequired]}>
                <Text style={[styles.chipText, styles.chipRequiredText]}>Required</Text>
              </View>
            ) : required === false ? (
              <View style={[styles.chip, styles.chipOptional]}>
                <Text style={[styles.chipText, styles.chipOptionalText]}>Optional</Text>
              </View>
            ) : null}
            <View style={[styles.statusPill, onFile ? styles.statusOnFile : styles.statusPending]}>
              <View style={[styles.statusDot, onFile ? styles.statusDotOn : styles.statusDotOff]} />
              <Text style={[styles.statusText, onFile ? styles.statusTextOn : styles.statusTextOff]}>
                {onFile ? "On file" : "Pending"}
              </Text>
            </View>
          </View>
          {numberLine ? (
            <Text style={styles.number} numberOfLines={1} ellipsizeMode="tail" selectable>
              {numberLine}
            </Text>
          ) : null}
          {caption ? (
            <Text style={styles.caption} numberOfLines={1} ellipsizeMode="tail">
              {caption}
            </Text>
          ) : null}
        </View>
        {canUpload ? (
          <RegistryPrimaryButton label="Add" onPress={onAdd} style={ADD_BTN} />
        ) : null}
      </View>

      {showDoc && preview ? (
        <ChooserQuoteDoc preview={preview} onPress={onPreview} />
      ) : (
        <View style={styles.emptyQuote} accessibilityLabel={`${label} has no file yet`}>
          <FileText size={18} color={Theme.textMuted} strokeWidth={1.8} />
          <Text style={styles.emptyQuoteText}>No file in this slot yet</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    padding: 10,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    minWidth: 0,
  },
  iconWash: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash,
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  title: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
  },
  chip: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chipRequired: { backgroundColor: Theme.complianceStageDocsBg },
  chipOptional: { backgroundColor: Theme.complianceStageInfoBg },
  chipText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  chipRequiredText: { color: Theme.complianceStageDocsFg },
  chipOptionalText: { color: Theme.complianceStageInfoFg },
  number: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: Theme.buttonDark,
  },
  caption: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  quoteDoc: {
    width: "100%",
    height: 168,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Theme.compliancePreviewCanvas,
  },
  quoteImage: {
    width: "100%",
    height: "100%",
  },
  emptyQuote: {
    width: "100%",
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.compliancePageBg,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  emptyQuoteText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 999,
  },
  statusOnFile: {
    backgroundColor: Theme.complianceStageSuccessBg,
    borderColor: Theme.complianceStageSuccessBg,
  },
  statusPending: {
    backgroundColor: Theme.complianceStagePendingBg,
    borderColor: Theme.complianceStagePendingBg,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotOn: { backgroundColor: Theme.complianceStageSuccessFg },
  statusDotOff: { backgroundColor: Theme.complianceStagePendingFg },
  statusText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  statusTextOn: { color: Theme.complianceStageSuccessFg },
  statusTextOff: { color: Theme.complianceStagePendingFg },
});
