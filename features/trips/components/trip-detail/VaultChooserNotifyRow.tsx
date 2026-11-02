/**
 * Vault document card — title, number, and a preview that fills the frame.
 */
import { HUB_MOBILE_COMMERCE_REF } from "@/components/hub/hubMobileTicketTokens";
import Theme from "@/constants/Theme";
import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import { isInlinePreviewUri } from "@/features/trips/utils/storagePreviewObjectUrl.util";
import {
  DocumentUploadAttributionRow,
  documentUploadAttributionHasContent,
  type DocumentUploadAttribution,
} from "@/features/trips/components/trip-detail/DocumentUploadAttributionRow";
import { isPdfTripDoc } from "@/features/trips/components/trip-detail/tripDocTypes";
import { VaultDocThumb } from "@/features/trips/components/trip-detail/VaultDocThumb";
import { VaultFullDocumentModal } from "@/features/trips/components/trip-detail/VaultFullDocumentModal";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import Feather from "@expo/vector-icons/Feather";
import { FileText, Pencil } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const SHOP = HUB_MOBILE_COMMERCE_REF;

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap" as const, letterSpacing: 0 })
    : {};

export type VaultChooserPreviewSource =
  | "trip"
  | "vehicle"
  | "vehicle-vault"
  | "compliance"
  | "entity"
  | "driver-kyc"
  | "supplier-kyc";

export type VaultChooserPreview = {
  storagePath?: string | null;
  previewUri?: string | null;
  fileName?: string | null;
  mimeHint?: string | null;
  source?: VaultChooserPreviewSource;
  organizationId?: string | null;
  entityId?: string | null;
  /** Helps vehicle-vault → entity_documents fallback when the vault object is missing. */
  docType?: string | null;
  /** Short caption on cluster thumbs (LR, RC, DL). */
  label?: string | null;
};

/** Map card preview source → Storage signer used by signCompliancePreviewUrl. */
export function vaultChooserSignSource(
  source: VaultChooserPreviewSource | null | undefined,
): "trip" | "vehicle-vault" | "compliance" | "entity" | "driver-kyc" | "supplier-kyc" {
  if (source === "vehicle" || source === "vehicle-vault") return "vehicle-vault";
  if (source === "supplier-kyc") return "supplier-kyc";
  if (source === "driver-kyc") return "driver-kyc";
  if (source === "entity") return "entity";
  if (source === "compliance") return "compliance";
  return "trip";
}

type Props = {
  label: string;
  meta: string;
  onFile: boolean;
  canUpload: boolean;
  entityType?: PartyEntityType;
  preview?: VaultChooserPreview | null;
  /** LR / invoice / e-way number, shown under the title. */
  actionText?: string;
  /**
   * Label · value row under the title (e.g. Memo supplier rate).
   * Aligns like Valid till: label left, tabular value right.
   */
  detailFact?: { label: string; value: string } | null;
  /** Uploader avatar + name + timestamp under the document number. */
  uploadAttribution?: DocumentUploadAttribution | null;
  required?: boolean;
  /** ISO date (YYYY-MM-DD or timestamp) shown as Valid till. */
  expiryDate?: string | null;
  /** When true, show Valid till even if the date is still missing. */
  needsExpiry?: boolean;
  /** All active files for this type. Falls back to `preview` when omitted. */
  previews?: VaultChooserPreview[];
  /** Highlight this file in the tiny strip (cluster cards). */
  selectedPreviewIndex?: number;
  onPreview?: () => void;
  /** Tap a specific file when more than one is on file. */
  onPreviewAt?: (index: number) => void;
  /** Edit Valid till without opening the file first. */
  onEditExpiry?: () => void;
  /** Opens the vault preview sheet (same UI as trip vault). */
  onEdit?: () => void;
  /** Full document viewer with next / previous across files. */
  onOpenFull?: (index: number) => void;
  onAdd: () => void;
  /** Replace the rejected trip file in place. When set, Add is hidden. */
  onReplace?: () => void;
  /** Retail-clean card chrome for Compliance mobile detail. */
  appearance?: "default" | "shop";
  /** Hide View / Add / Replace / Edit under the upload log. */
  hideShopActions?: boolean;
  /** Larger hero when this card is the document-detail preview. */
  shopSize?: "card" | "pane";
  /** Empty type slots on the cluster strip (LR / RC / DL still to upload). */
  pendingThumbs?: { key: string; label: string }[];
  /** Highlight this pending type on the strip. */
  selectedPendingKey?: string | null;
  onPendingThumb?: (key: string) => void;
  /** Thumb rail for the document-detail pane. */
  shopRail?: boolean;
  /** Horizontal filmstrip (mobile). Vertical rail is the desktop default. */
  shopRailHorizontal?: boolean;
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

function shopThumbCaptionLabel(item: VaultChooserPreview): string {
  const raw = (item.label ?? item.docType ?? "").trim();
  if (!raw) return "";
  if (/\d/.test(raw) || raw.includes("\n")) return raw;
  return raw.toUpperCase();
}

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
  onOpenFull,
  tiled = false,
  headerFacts = null,
  hero = false,
  mini = false,
}: {
  preview: VaultChooserPreview;
  onPress: () => void;
  onOpenFull?: () => void;
  tiled?: boolean;
  headerFacts?: string | null;
  /** Tall centered preview for retail Order Details–style cards. */
  hero?: boolean;
  /** Compact strip thumb. */
  mini?: boolean;
}) {
  const readyUri = preview.previewUri?.trim() || "";
  const [uri, setUri] = useState<string | null>(readyUri || null);
  const [pending, setPending] = useState(!readyUri);
  const [fullOpen, setFullOpen] = useState(false);

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
      source: vaultChooserSignSource(preview.source),
      organizationId: preview.organizationId,
      entityId: preview.entityId,
      docType: preview.docType,
    }).then((signed) => {
      if (cancelled) return;
      setUri(signed);
      setPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    preview.docType,
    preview.entityId,
    preview.organizationId,
    preview.previewUri,
    preview.source,
    preview.storagePath,
  ]);

  if (!pending && !uri) return null;

  const pdf = isPdfTripDoc({
    fileName: preview.fileName,
    mimeType: preview.mimeHint,
    storagePath: preview.storagePath,
  });
  const title = preview.fileName?.trim() || "Document";

  return (
    <View
      style={[
        tiled && !hero && !mini && styles.quoteCell,
        styles.quoteDoc,
        hero && styles.quoteDocHero,
        mini && styles.quoteDocMini,
        WEB_POINTER,
      ]}
    >
      <Pressable
        onPress={(event) => {
          event?.stopPropagation?.();
          onPress();
        }}
        style={styles.quoteHit}
        accessibilityRole="button"
        accessibilityLabel={`Preview ${title}`}
      >
        {uri ? (
          <VaultDocThumb
            uri={uri}
            isPdf={pdf}
            fileName={preview.fileName}
            sizing={hero ? "fit" : "cover"}
            style={styles.quoteImage}
          />
        ) : (
          <View style={styles.quoteLoading}>
            <ActivityIndicator size="small" color={Theme.actionBtnInk} />
          </View>
        )}
      </Pressable>
      {uri && !mini ? (
        <Pressable
          onPress={(event) => {
            event?.stopPropagation?.();
            if (onOpenFull) {
              onOpenFull();
              return;
            }
            setFullOpen(true);
          }}
          style={({ pressed }) => [
            styles.quoteEye,
            hero && styles.quoteEyeHero,
            pressed && styles.quoteEyePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`View full ${title}`}
        >
          <Feather name="eye" size={hero ? 16 : 12} color={hero ? SHOP.ink : Theme.actionBtnInk} />
        </Pressable>
      ) : null}
      <VaultFullDocumentModal
        visible={fullOpen}
        uri={uri}
        isPdf={pdf}
        title={title}
        documentKey={preview.storagePath ?? preview.previewUri ?? title}
        documentVersion={preview.fileName}
        headerFacts={headerFacts}
        onClose={() => setFullOpen(false)}
      />
    </View>
  );
}

function redundantMeta(meta: string, onFile: boolean): boolean {
  const value = meta.trim().toLowerCase();
  if (!value) return true;
  if (/^\d+\s*\/\s*\d+\s+on file$/.test(value)) return true;
  return value === "on file" || value === "not uploaded" || value === (onFile ? "on file" : "not uploaded");
}

export function VaultChooserNotifyRow({
  label,
  meta,
  onFile,
  canUpload,
  preview = null,
  previews,
  selectedPreviewIndex = 0,
  actionText,
  detailFact = null,
  uploadAttribution = null,
  required,
  expiryDate,
  needsExpiry = false,
  onPreview,
  onPreviewAt,
  onEditExpiry,
  onEdit,
  onOpenFull,
  onAdd,
  onReplace,
  appearance = "default",
  hideShopActions = false,
  shopSize = "card",
  pendingThumbs = [],
  selectedPendingKey = null,
  onPendingThumb,
  shopRail = false,
  shopRailHorizontal = false,
}: Props) {
  const shop = appearance === "shop";
  const shopPane = shop && shopSize === "pane";
  const allPreviews = (
    previews && previews.length > 0 ? previews : preview ? [preview] : []
  ).filter(isCardPreviewable);
  const showDoc = onFile && allPreviews.length > 0;
  const fileCount = allPreviews.length;
  const numberLine = actionText?.trim() || "";
  const factLabel = detailFact?.label?.trim() || "";
  const factValue = detailFact?.value?.trim() || "";
  const showDetailFact = Boolean(factLabel && factValue);
  const expiryIso = normalizeExpiryIso(expiryDate);
  const expiryLine = expiryIso ? formatCardExpiry(expiryIso) : "";
  const showExpiry = Boolean(expiryLine) || (needsExpiry && onFile);
  const caption = redundantMeta(meta, onFile) || meta.trim() === numberLine ? "" : meta.trim();
  const headerFacts = [
    numberLine,
    showDetailFact ? `${factLabel} ${factValue}` : "",
    expiryLine ? `Valid till ${expiryLine}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const onFileLabel = fileCount > 1 ? `${fileCount} on file` : "On file";
  const openEditor = onEdit ?? onPreview;
  const previewFile = (index: number) => {
    if (onPreviewAt) {
      onPreviewAt(index);
      return;
    }
    openEditor?.();
  };

  const a11yLabel = `${label}${numberLine ? ` ${numberLine}` : ""}${
    showDetailFact ? ` ${factLabel} ${factValue}` : ""
  }`;

  if (shop) {
    const uploadedWhen = String(uploadAttribution?.uploadedAt ?? "").trim();
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
          : "Awaiting upload";
    const metaBits = [
      required === true ? "Required" : required === false ? "Optional" : null,
      onFile ? onFileLabel : "Pending",
      numberLine || null,
      showDetailFact ? `${factLabel} ${factValue}` : null,
    ].filter(Boolean);
    const showView = onFile && Boolean(onOpenFull || openEditor);
    const showEdit = onFile && Boolean(openEditor && onOpenFull);
    const heroIndex =
      selectedPreviewIndex >= 0 && selectedPreviewIndex < allPreviews.length
        ? selectedPreviewIndex
        : 0;
    const heroPreview = allPreviews[heroIndex];
    const showHero = shopPane && !shopRail;
    const showStrip = allPreviews.length > 0 || pendingThumbs.length > 0;
    const thumbItems = (
      <>
        {allPreviews.map((item, index) => {
          const caption = shopThumbCaptionLabel(item);
          const selected = index === heroIndex;
          return (
            <Pressable
              key={`${item.storagePath ?? item.previewUri ?? item.fileName ?? "file"}-${index}`}
              onPress={() => previewFile(index)}
              style={[
                styles.shopThumb,
                shopRail && styles.shopThumbRailItem,
                selected && styles.shopThumbSelected,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Preview ${caption || item.fileName || label}`}
            >
              <ChooserQuoteDoc mini preview={item} onPress={() => previewFile(index)} />
              {caption ? (
                <View style={styles.shopThumbCaption}>
                  <Text
                    style={[styles.shopThumbCaptionText, WEB_COPY]}
                    numberOfLines={2}
                  >
                    {caption}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {pendingThumbs.map((item) => {
          const selected = item.key === selectedPendingKey;
          return (
            <Pressable
              key={`pending-${item.key}`}
              onPress={() => onPendingThumb?.(item.key)}
              style={[
                styles.shopThumb,
                shopRail && styles.shopThumbRailItem,
                styles.shopThumbPending,
                selected && styles.shopThumbSelected,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Pending ${item.label || label}`}
            >
              <View style={styles.shopThumbPendingBody}>
                <FileText size={14} color={SHOP.muted} strokeWidth={1.7} />
              </View>
              {item.label ? (
                <View style={styles.shopThumbCaption}>
                  <Text
                    style={[styles.shopThumbCaptionText, WEB_COPY]}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </>
    );
    if (shopRail) {
      if (shopRailHorizontal) {
        return (
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.shopThumbFilmScroll}
            contentContainerStyle={styles.shopThumbFilm}
            accessibilityLabel={a11yLabel}
          >
            {thumbItems}
          </ScrollView>
        );
      }
      return (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.shopThumbRailScroll}
          contentContainerStyle={styles.shopThumbRail}
          accessibilityLabel={a11yLabel}
        >
          {thumbItems}
        </ScrollView>
      );
    }
    return (
      <View style={[styles.card, styles.cardShop]} accessibilityLabel={a11yLabel}>
        {showHero ? (
          <View style={styles.shopHeroBand}>
            {showDoc && heroPreview ? (
              <View style={[styles.shopHeroFrame, styles.shopHeroFramePane]}>
                <ChooserQuoteDoc
                  hero
                  preview={heroPreview}
                  onPress={() => previewFile(heroIndex)}
                  onOpenFull={onOpenFull ? () => onOpenFull(heroIndex) : undefined}
                  headerFacts={headerFacts || null}
                />
              </View>
            ) : (
              <Pressable
                onPress={canUpload ? onAdd : undefined}
                disabled={!canUpload}
                style={[styles.emptyQuote, styles.emptyQuoteShopHero]}
                accessibilityRole={canUpload ? "button" : "none"}
                accessibilityLabel={`${label} has no file yet`}
              >
                <FileText size={16} color={SHOP.muted} strokeWidth={1.6} />
                <Text style={[styles.emptyQuoteText, styles.emptyQuoteTextShop]}>No file yet</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {showStrip ? (
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shopThumbStrip}
          >
            {thumbItems}
          </ScrollView>
        ) : null}

        <View style={styles.shopMetaBlock}>
          <Text style={[styles.shopBrand, WEB_COPY]} numberOfLines={1}>
            {label}
          </Text>
          {metaBits.length > 0 ? (
            <Text style={styles.shopMetaLine} numberOfLines={1}>
              {metaBits.join(" · ")}
            </Text>
          ) : null}
        </View>

        <View
          style={[
            styles.shopStatusCard,
            onFile ? styles.shopStatusCardOn : styles.shopStatusCardOff,
          ]}
        >
          <View style={styles.shopStatusRow}>
            <View style={styles.shopStatusCopy}>
              <Text style={styles.shopStatusKicker}>
                {onFile ? "Uploaded" : "Status"}
              </Text>
              <Text
                style={[styles.shopStatusDate, !onFile && styles.shopStatusDateMuted]}
                numberOfLines={1}
              >
                {uploadedLabel}
              </Text>
            </View>
            {documentUploadAttributionHasContent(uploadAttribution) ? (
              <View style={styles.shopStatusLog}>
                <DocumentUploadAttributionRow
                  {...uploadAttribution!}
                  size={16}
                  compact
                  hideWhen
                />
              </View>
            ) : null}
          </View>
        </View>

        {hideShopActions ? null : showView || canUpload || showEdit ? (
          <View style={styles.shopActionsRow}>
            {showView ? (
              <Pressable
                onPress={() => {
                  if (onOpenFull) onOpenFull(0);
                  else openEditor?.();
                }}
                style={styles.shopActionBtn}
                accessibilityRole="button"
                accessibilityLabel={`View ${label}`}
              >
                <Feather name="eye" size={11} color={SHOP.ink} />
                <Text style={styles.shopActionText}>View</Text>
              </Pressable>
            ) : null}
            {canUpload && onReplace ? (
              <Pressable
                onPress={onReplace}
                style={styles.shopActionBtn}
                accessibilityRole="button"
                accessibilityLabel={`Replace ${label}`}
              >
                <Feather name="refresh-cw" size={11} color={SHOP.ink} />
                <Text style={styles.shopActionText}>Replace</Text>
              </Pressable>
            ) : canUpload ? (
              <Pressable
                onPress={onAdd}
                style={styles.shopActionBtn}
                accessibilityRole="button"
                accessibilityLabel={`Add ${label}`}
              >
                <Feather name="plus" size={11} color={SHOP.ink} />
                <Text style={styles.shopActionText}>Add</Text>
              </Pressable>
            ) : null}
            {showEdit ? (
              <Pressable
                onPress={openEditor}
                style={styles.shopActionBtn}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${label}`}
              >
                <Pencil size={10} color={SHOP.ink} strokeWidth={2} />
                <Text style={styles.shopActionText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showExpiry ? (
          <Pressable
            onPress={onEditExpiry}
            disabled={!onEditExpiry}
            style={styles.shopExpiryRow}
            accessibilityRole={onEditExpiry ? "button" : "none"}
            accessibilityLabel={
              expiryLine
                ? `Valid till ${expiryLine}${onEditExpiry ? ", edit" : ""}`
                : "Add expiry date"
            }
          >
            <Text style={styles.expiryLabel}>Valid till</Text>
            <Text style={[styles.expiryValue, !expiryLine && styles.expiryMissing]} numberOfLines={1}>
              {expiryLine || "Add date"}
            </Text>
            {onEditExpiry ? <Text style={[styles.expiryEdit, styles.expiryEditShop]}>Edit</Text> : null}
          </Pressable>
        ) : null}
        {caption ? (
          <Text style={styles.shopCaption} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={a11yLabel}
      onPress={showDoc ? () => previewFile(0) : undefined}
      disabled={!showDoc}
      style={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.iconWash} accessibilityElementsHidden>
          <FileText size={12} color={Theme.actionBtnInk} strokeWidth={2} />
        </View>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, WEB_COPY]} numberOfLines={1} ellipsizeMode="tail">
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
          </View>
          {numberLine ? (
            <Text style={styles.number} numberOfLines={1} ellipsizeMode="tail" selectable>
              {numberLine}
            </Text>
          ) : null}
          {documentUploadAttributionHasContent(uploadAttribution) ? (
            <DocumentUploadAttributionRow {...uploadAttribution!} size={22} compact />
          ) : null}
          {showDetailFact ? (
            <View style={styles.detailFactRow} accessibilityRole="text">
              <Text style={[styles.detailFactLabel, WEB_COPY]} numberOfLines={1}>
                {factLabel}
              </Text>
              <Text style={[styles.detailFactValue, WEB_COPY]} numberOfLines={1} selectable>
                {factValue}
              </Text>
            </View>
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
              <Text style={[styles.expiryValue, !expiryLine && styles.expiryMissing]} numberOfLines={1}>
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
        <View style={styles.headerActions}>
          <View style={[styles.statusPill, onFile ? styles.statusOnFile : styles.statusPending]}>
            <View style={[styles.statusDot, onFile ? styles.statusDotOn : styles.statusDotOff]} />
            <Text style={[styles.statusText, onFile ? styles.statusTextOn : styles.statusTextOff, WEB_COPY]}>
              {onFile ? onFileLabel : "Pending"}
            </Text>
          </View>
          {onFile && onOpenFull ? (
            <Pressable
              onPress={(event) => {
                event?.stopPropagation?.();
                onOpenFull(0);
              }}
              style={styles.editBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`View full ${label}`}
            >
              <Feather name="eye" size={12} color={Theme.actionBtnInk} />
            </Pressable>
          ) : null}
          {onFile && openEditor ? (
            <Pressable
              onPress={(event) => {
                event?.stopPropagation?.();
                openEditor();
              }}
              style={styles.editBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${label}`}
            >
              <Pencil size={12} color={Theme.actionBtnInk} strokeWidth={2} />
            </Pressable>
          ) : null}
          {canUpload && onReplace ? (
            <Pressable
              onPress={(event) => {
                event?.stopPropagation?.();
                onReplace();
              }}
              style={styles.addBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Replace ${label}`}
            >
              <Text style={[styles.addBtnText, WEB_COPY]}>Replace</Text>
            </Pressable>
          ) : canUpload ? (
            <Pressable
              onPress={(event) => {
                event?.stopPropagation?.();
                onAdd();
              }}
              style={styles.addBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Add ${label}`}
            >
              <Text style={[styles.addBtnText, WEB_COPY]}>Add</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {showDoc && allPreviews.length === 1 ? (
        <ChooserQuoteDoc
          preview={allPreviews[0]}
          onPress={() => previewFile(0)}
          onOpenFull={onOpenFull ? () => onOpenFull(0) : undefined}
          headerFacts={headerFacts || null}
        />
      ) : showDoc ? (
        <View style={styles.quoteGrid}>
          {allPreviews.map((item, index) => (
            <ChooserQuoteDoc
              key={`${item.storagePath ?? item.previewUri ?? item.fileName ?? "file"}-${index}`}
              preview={item}
              tiled
              onPress={() => previewFile(index)}
              onOpenFull={onOpenFull ? () => onOpenFull(index) : undefined}
              headerFacts={headerFacts || null}
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
    padding: 8,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  editBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
  },
  addBtn: {
    height: 26,
    minHeight: 26,
    paddingHorizontal: 9,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.actionBtnInk,
    flexGrow: 0,
    flexShrink: 0,
  },
  addBtnText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: Theme.cardWhite,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    height: 26,
  },
  iconWash: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash,
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 5,
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    minHeight: 16,
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
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0.1,
    color: Theme.textMuted,
  },
  detailFactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
    minHeight: 18,
    marginTop: 2,
  },
  detailFactLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 0,
    color: Theme.textMuted,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  detailFactValue: {
    flexShrink: 0,
    maxWidth: "58%",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 0,
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
    includeFontPadding: false,
    textAlignVertical: "center",
    textAlign: "right",
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
    position: "relative",
  },
  quoteHit: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  quoteEye: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    zIndex: 2,
  },
  quoteEyePressed: {
    opacity: 0.85,
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
  cardShop: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 8,
    gap: 6,
    borderRadius: 10,
    borderColor: SHOP.hairline,
    backgroundColor: Theme.cardWhite,
  },
  shopHeroBand: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  shopHeroFrame: {
    width: 176,
    height: 232,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F7F7F8",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SHOP.hairline,
  },
  shopHeroFramePane: {
    width: 176,
    height: 232,
    borderRadius: 12,
  },
  shopHeroFrameTiled: {
    width: 64,
    height: 84,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F7F7F8",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SHOP.hairline,
  },
  quoteDocHero: {
    width: "100%",
    height: "100%",
    borderRadius: 0,
    backgroundColor: "#F7F7F8",
  },
  quoteEyeHero: {
    width: 36,
    height: 36,
    borderRadius: 18,
    right: 10,
    bottom: 10,
  },
  quoteGridShop: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  emptyQuoteShopHero: {
    width: 176,
    height: 232,
    minHeight: 232,
    borderRadius: 8,
    borderColor: SHOP.hairline,
    backgroundColor: "#FAFAFB",
    gap: 6,
    alignSelf: "center",
  },
  emptyQuoteTextShop: {
    color: SHOP.muted,
    fontSize: 10,
    textAlign: "center",
  },
  shopMetaBlock: {
    width: "100%",
    alignItems: "center",
    gap: 1,
    paddingHorizontal: 4,
  },
  shopBrand: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: SHOP.ink,
    letterSpacing: -0.15,
    textAlign: "center",
  },
  shopMetaLine: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "500",
    color: SHOP.muted,
    textAlign: "center",
  },
  shopStatusCard: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 0,
  },
  shopStatusCardOn: {
    backgroundColor: SHOP.successSoft,
  },
  shopStatusCardOff: {
    backgroundColor: SHOP.warningSoft,
  },
  shopStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shopStatusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  shopStatusKicker: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
    color: SHOP.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  shopStatusDate: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    color: SHOP.success,
    letterSpacing: -0.1,
  },
  shopStatusDateMuted: {
    color: SHOP.warning,
    fontSize: 10,
    lineHeight: 13,
  },
  shopStatusLog: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: "48%",
    minWidth: 96,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  shopActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shopActionBtn: {
    flex: 1,
    minHeight: 24,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D4D5D9",
    backgroundColor: Theme.cardWhite,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  shopActionText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    color: SHOP.ink,
  },
  shopExpiryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 0,
  },
  shopCaption: {
    fontSize: 10,
    lineHeight: 13,
    color: SHOP.muted,
    textAlign: "center",
  },
  shopThumbStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  shopThumbFilmScroll: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
  },
  shopThumbFilm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  shopThumbRailScroll: {
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
  },
  shopThumbRail: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  shopThumbRailItem: {
    width: 52,
    height: 70,
  },
  shopThumb: {
    width: 56,
    height: 72,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: SHOP.hairline,
    backgroundColor: Theme.compliancePageBg,
  },
  shopThumbSelected: {
    borderColor: Theme.actionBtnInk,
  },
  shopThumbPending: {
    borderStyle: "dashed",
    backgroundColor: "#FAFAFB",
  },
  shopThumbPendingBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 14,
  },
  shopThumbCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 2,
    backgroundColor: Theme.cardWhite,
  },
  shopThumbCaptionText: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "700",
    color: SHOP.ink,
    textAlign: "center",
    letterSpacing: 0,
  },
  quoteDocMini: {
    width: "100%",
    height: "100%",
    borderRadius: 0,
    backgroundColor: Theme.compliancePageBg,
  },
  expiryEditShop: { color: SHOP.link },
});
