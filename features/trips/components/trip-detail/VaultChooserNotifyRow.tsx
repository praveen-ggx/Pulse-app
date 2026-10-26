/**
 * Vault document card — title, number, and a preview that fills the frame.
 */
import { RegistryPrimaryButton } from "@/components/AlertRegistryCardActions";
import Theme from "@/constants/Theme";
import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import { isInlinePreviewUri } from "@/features/trips/utils/storagePreviewObjectUrl.util";
import { isPdfTripDoc } from "@/features/trips/components/trip-detail/tripDocTypes";
import { VaultDocThumb } from "@/features/trips/components/trip-detail/VaultDocThumb";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { FileText, Pencil } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

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
  /** ISO date (YYYY-MM-DD or timestamp) shown as Valid till. */
  expiryDate?: string | null;
  /** When true, show Valid till even if the date is still missing. */
  needsExpiry?: boolean;
  /** All active files for this type. Falls back to `preview` when omitted. */
  previews?: VaultChooserPreview[];
  onPreview?: () => void;
  /** Tap a specific file when more than one is on file. */
  onPreviewAt?: (index: number) => void;
  /** Edit Valid till without opening the file first. */
  onEditExpiry?: () => void;
  /** Opens the vault preview sheet (same UI as trip vault). */
  onEdit?: () => void;
  onAdd: () => void;
};

function normalizeExpiryIso(raw?: string | null): string | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function formatCardExpiry(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const WEB_POINTER = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : null;

function isCardPreviewable(item: VaultChooserPreview): boolean {
  if (item.previewUri?.trim()) return true;
  const path = item.storagePath?.trim() ?? "";
  if (!path) return false;
  if (isInlinePreviewUri(path)) return true;
  if (path.startsWith("ref:")) return false;
  const base = path.split("?")[0]?.split("/").pop()?.toLowerCase() ?? "";
  if (base === "fields.json" || base.endsWith("-fields.json")) return false;
  return true;
}

function ChooserQuoteDoc({
  preview,
  onPress,
  tiled = false,
}: {
  preview: VaultChooserPreview;
  onPress: () => void;
  tiled?: boolean;
}) {
  const readyUri = preview.previewUri?.trim() || "";
  const [uri, setUri] = useState<string | null>(readyUri || null);
  const [pending, setPending] = useState(!readyUri);

  useEffect(() => {
    const ready = preview.previewUri?.trim() || "";
    if (ready) {
      setUri(ready);
      setPending(false);
      return;
    }
    const path = preview.storagePath?.trim() || "";
    if (!path || path.startsWith("ref:")) {
      setUri(null);
      setPending(false);
      return;
    }
    if (isInlinePreviewUri(path)) {
      setUri(path);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
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
      if (cancelled) return;
      setUri(signed);
      setPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [preview.entityId, preview.organizationId, preview.previewUri, preview.source, preview.storagePath]);

  if (!pending && !uri) return null;

  const pdf = isPdfTripDoc({
    fileName: preview.fileName,
    mimeType: preview.mimeHint,
    storagePath: preview.storagePath,
  });

  return (
    <Pressable
      onPress={(event) => {
        event?.stopPropagation?.();
        onPress();
      }}
      style={[tiled && styles.quoteCell, styles.quoteDoc, WEB_POINTER]}
      accessibilityRole="button"
      accessibilityLabel={`Preview ${preview.fileName || "document"}`}
    >
      {uri ? (
        <VaultDocThumb
          uri={uri}
          isPdf={pdf}
          fileName={preview.fileName}
          sizing="cover"
          style={styles.quoteImage}
        />
      ) : (
        <View style={styles.quoteLoading}>
          <ActivityIndicator size="small" color={Theme.actionBtnInk} />
        </View>
      )}
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
  previews,
  actionText,
  required,
  expiryDate,
  needsExpiry = false,
  onPreview,
  onPreviewAt,
  onEditExpiry,
  onEdit,
  onAdd,
}: Props) {
  const allPreviews = (
    previews && previews.length > 0 ? previews : preview ? [preview] : []
  ).filter(isCardPreviewable);
  const showDoc = onFile && allPreviews.length > 0;
  const fileCount = allPreviews.length;
  const numberLine = actionText?.trim() || "";
  const expiryIso = normalizeExpiryIso(expiryDate);
  const expiryLine = expiryIso ? formatCardExpiry(expiryIso) : "";
  const showExpiry = Boolean(expiryLine) || (needsExpiry && onFile);
  const caption = redundantMeta(meta, onFile) || meta.trim() === numberLine ? "" : meta.trim();
  const onFileLabel = fileCount > 1 ? `${fileCount} on file` : "On file";
  const openEditor = onEdit ?? onPreview;
  const previewFile = (index: number) => {
    if (onPreviewAt) {
      onPreviewAt(index);
      return;
    }
    openEditor?.();
  };

  return (
    <View
      accessibilityLabel={`${label}${numberLine ? ` ${numberLine}` : ""}`}
      style={styles.card}
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
                {onFile ? onFileLabel : "Pending"}
              </Text>
            </View>
          </View>
          {numberLine ? (
            <Text style={styles.number} numberOfLines={1} ellipsizeMode="tail" selectable>
              {numberLine}
            </Text>
          ) : null}
          {showExpiry ? (
            <Pressable
              onPress={onEditExpiry}
              disabled={!onEditExpiry}
              style={styles.expiryRow}
              accessibilityRole={onEditExpiry ? "button" : "none"}
              accessibilityLabel={
                expiryLine
                  ? `Valid till ${expiryLine}${onEditExpiry ? ", edit" : ""}`
                  : "Add expiry date"
              }
            >
              <Text style={styles.expiryLabel}>Valid till</Text>
              <Text
                style={[styles.expiryValue, !expiryLine && styles.expiryMissing]}
                numberOfLines={1}
              >
                {expiryLine || "Add date"}
              </Text>
              {onEditExpiry ? <Text style={styles.expiryEdit}>Edit</Text> : null}
            </Pressable>
          ) : null}
          {caption ? (
            <Text style={styles.caption} numberOfLines={1} ellipsizeMode="tail">
              {caption}
            </Text>
          ) : null}
        </View>
        {(onFile && openEditor) || canUpload ? (
          <View style={styles.headerActions}>
            {onFile && openEditor ? (
              <Pressable
                onPress={openEditor}
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${label}`}
              >
                <Pencil size={16} color={Theme.actionBtnInk} strokeWidth={2.2} />
              </Pressable>
            ) : null}
            {canUpload ? (
              <RegistryPrimaryButton label="Add" onPress={onAdd} style={ADD_BTN} />
            ) : null}
          </View>
        ) : null}
      </View>

      {showDoc && allPreviews.length === 1 ? (
        <ChooserQuoteDoc preview={allPreviews[0]} onPress={() => previewFile(0)} />
      ) : showDoc ? (
        <View style={styles.quoteGrid}>
          {allPreviews.map((item, index) => (
            <ChooserQuoteDoc
              key={`${item.storagePath ?? item.previewUri ?? item.fileName ?? "file"}-${index}`}
              preview={item}
              tiled
              onPress={() => previewFile(index)}
            />
          ))}
        </View>
      ) : (
        <Pressable
          onPress={canUpload ? onAdd : undefined}
          disabled={!canUpload}
          style={styles.emptyQuote}
          accessibilityRole={canUpload ? "button" : "none"}
          accessibilityLabel={`${label} has no file yet`}
        >
          <FileText size={18} color={Theme.textMuted} strokeWidth={1.8} />
          <Text style={styles.emptyQuoteText}>No file in this slot yet</Text>
        </Pressable>
      )}
    </View>
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
  editBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
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
  expiryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
    minHeight: 44,
    paddingTop: 1,
  },
  expiryEdit: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: "800",
    color: Theme.brandBlueInk,
  },
  expiryLabel: {
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Theme.textMuted,
  },
  expiryValue: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
  },
  expiryMissing: {
    fontWeight: "600",
    color: Theme.complianceStagePendingFg,
  },
  caption: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  quoteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quoteCell: {
    flexGrow: 0,
    flexBasis: "47%",
    width: "47%",
    minWidth: 140,
    maxWidth: "48.5%",
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
  quoteLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePreviewCanvas,
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
