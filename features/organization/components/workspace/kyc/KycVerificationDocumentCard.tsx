import Theme from "@/constants/Theme";
import { Layout } from "@/constants/Layout";
import { VaultDocThumb } from "@/features/trips/components/trip-detail/VaultDocThumb";
import { VaultFullDocumentModal } from "@/features/trips/components/trip-detail/VaultFullDocumentModal";
import { isPdfTripDoc } from "@/features/trips/components/trip-detail/tripDocTypes";
import type {
  OrganizationKycDocDefinition,
  OrganizationKycDocument,
  OrganizationKycDocType,
} from "@/features/organization/types/organizationKycDocuments.types";
import { getVerificationDocumentSignedUrl } from "@/features/organization/services/businessVerification.service";
import {
  addressProofTypeLabel,
  latestOrgKycDocumentMatching,
  resolveAcceptTypes,
} from "@/features/organization/utils/kycVerification.util";
import {
  GREEN,
  GREEN_TINT,
} from "@/features/organization/components/workspace/workspacePanelUi";
import type { WorkspaceKyc } from "@/types/organization";
import Feather from "@expo/vector-icons/Feather";
import { FileText } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

type Props = {
  definition: OrganizationKycDocDefinition;
  documents: OrganizationKycDocument[];
  kyc: WorkspaceKyc | null;
  canEdit: boolean;
  uploading: boolean;
  onOpenUpdate: (definition: OrganizationKycDocDefinition) => void;
  onRemove?: (docType: OrganizationKycDocType) => void;
  onDismiss?: () => void;
};

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KycVerificationDocumentCard({
  definition,
  documents,
  kyc,
  canEdit,
  uploading,
  onOpenUpdate,
  onRemove,
  onDismiss,
}: Props) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const acceptTypes = useMemo(() => resolveAcceptTypes(definition), [definition]);
  const doc = latestOrgKycDocumentMatching(documents, acceptTypes);
  const legacyPath =
    definition.type === "address_proof" ? kyc?.address_proof_path?.trim() : null;
  const storagePath = doc?.storage_path?.trim() || legacyPath || null;
  const hasDoc = Boolean(storagePath);
  const sizeLabel = formatFileSize(doc?.file_size_bytes);
  const fileName = doc?.file_name?.trim() || (hasDoc ? `${definition.label}.pdf` : "");
  const pendingReview =
    doc?.status === "pending" ||
    (hasDoc &&
      (kyc?.verification_status === "pending" || kyc?.verification_status === "verified") &&
      doc?.status !== "verified");
  const rejected = doc?.status === "rejected";
  const statusLabel = rejected
    ? "Needs a new file"
    : pendingReview
      ? "Pending review"
      : hasDoc
        ? "On file"
        : "Not uploaded";
  const proofLine =
    definition.type === "address_proof"
      ? addressProofTypeLabel(kyc?.address_proof_type)
      : "";
  const facts = [fileName, sizeLabel, proofLine].filter(Boolean).join(" · ");
  const pdf = isPdfTripDoc({
    fileName,
    mimeType: doc?.mime_type,
    storagePath,
  });

  useEffect(() => {
    if (!storagePath) {
      setPreviewUri(null);
      return;
    }
    let cancelled = false;
    setSigning(true);
    void getVerificationDocumentSignedUrl(storagePath).then((url) => {
      if (cancelled) return;
      setPreviewUri(url);
      setSigning(false);
    });
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWash}>
          <FileText size={13} color={Theme.actionBtnInk} strokeWidth={2} />
        </View>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, WEB_COPY]} numberOfLines={1}>
              {definition.label}
            </Text>
            <View style={[styles.chip, definition.mandatory ? styles.chipRequired : styles.chipOptional]}>
              <Text
                style={[
                  styles.chipText,
                  definition.mandatory ? styles.chipRequiredText : styles.chipOptionalText,
                  WEB_COPY,
                ]}
              >
                {definition.mandatory ? "Required" : "Optional"}
              </Text>
            </View>
          </View>
          <Text style={[styles.hint, WEB_COPY]} numberOfLines={2}>
            {definition.hint}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <View
            style={[
              styles.statusPill,
              rejected
                ? styles.statusReject
                : hasDoc
                  ? styles.statusOn
                  : styles.statusOff,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                rejected
                  ? styles.statusRejectText
                  : hasDoc
                    ? styles.statusOnText
                    : styles.statusOffText,
                WEB_COPY,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
          {canEdit ? (
            <Pressable
              onPress={() => onOpenUpdate(definition)}
              disabled={uploading}
              style={styles.addBtn}
              accessibilityRole="button"
              accessibilityLabel={`${hasDoc ? "Update" : "Upload"} ${definition.label}`}
            >
              <Text style={[styles.addBtnText, WEB_COPY]}>
                {uploading ? "…" : hasDoc ? "Update" : "Upload"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {hasDoc ? (
        <View style={styles.previewFrame}>
          {previewUri ? (
            <VaultDocThumb
              uri={previewUri}
              isPdf={pdf}
              fileName={fileName}
              sizing="cover"
              style={styles.previewImage}
            />
          ) : (
            <View style={styles.previewLoading}>
              {signing ? (
                <ActivityIndicator size="small" color={Theme.actionBtnInk} />
              ) : (
                <FileText size={22} color={Theme.textMuted} strokeWidth={1.8} />
              )}
            </View>
          )}
          {previewUri ? (
            <Pressable
              onPress={() => setFullOpen(true)}
              style={styles.eyeBtn}
              accessibilityRole="button"
              accessibilityLabel={`Preview ${definition.label}`}
            >
              <Feather name="eye" size={13} color={Theme.actionBtnInk} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={canEdit ? () => onOpenUpdate(definition) : undefined}
          disabled={!canEdit || uploading}
          style={styles.emptyQuote}
          accessibilityRole={canEdit ? "button" : "none"}
        >
          <Feather name="upload" size={16} color={Theme.textMuted} />
          <Text style={[styles.emptyQuoteText, WEB_COPY]}>
            {canEdit ? "Tap to upload this document" : "No file in this slot yet"}
          </Text>
        </Pressable>
      )}

      {hasDoc && facts ? (
        <Text style={[styles.facts, WEB_COPY]} numberOfLines={1}>
          {facts}
        </Text>
      ) : null}

      {hasDoc && canEdit ? (
        <View style={styles.footer}>
          {previewUri ? (
            <Pressable
              onPress={() => setFullOpen(true)}
              style={styles.ghostBtn}
              accessibilityRole="button"
              accessibilityLabel={`Preview ${definition.label}`}
            >
              <Text style={[styles.ghostBtnText, WEB_COPY]}>Preview</Text>
            </Pressable>
          ) : null}
          {onRemove && doc ? (
            <Pressable
              onPress={() => onRemove(doc.doc_type)}
              style={styles.ghostBtn}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${definition.label}`}
            >
              <Text style={[styles.removeText, WEB_COPY]}>Remove</Text>
            </Pressable>
          ) : onDismiss ? (
            <Pressable
              onPress={onDismiss}
              style={styles.ghostBtn}
              accessibilityRole="button"
            >
              <Text style={[styles.removeText, WEB_COPY]}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ) : !hasDoc && onDismiss ? (
        <View style={styles.footer}>
          <Pressable onPress={onDismiss} style={styles.ghostBtn}>
            <Text style={[styles.removeText, WEB_COPY]}>Remove</Text>
          </Pressable>
        </View>
      ) : null}

      <VaultFullDocumentModal
        visible={fullOpen}
        uri={previewUri}
        isPdf={pdf}
        title={definition.label}
        documentKey={storagePath}
        documentVersion={doc?.id}
        headerFacts={facts || null}
        onClose={() => setFullOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder ?? Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 10,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  iconWash: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash ?? Theme.surfaceGray,
    flexShrink: 0,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: 2, paddingTop: 2 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  chip: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chipRequired: { backgroundColor: Theme.complianceStageDocsBg ?? Theme.brandBlueSoft },
  chipOptional: { backgroundColor: Theme.surfaceGray },
  chipText: { fontSize: 9, lineHeight: 12, fontWeight: "700" },
  chipRequiredText: { color: Theme.complianceStageDocsFg ?? Theme.primary },
  chipOptionalText: { color: Theme.textMuted },
  hint: { fontSize: 11, lineHeight: 15, color: Theme.textMuted },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  statusPill: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  statusOn: { backgroundColor: GREEN_TINT },
  statusOff: { backgroundColor: Theme.surfaceGray },
  statusReject: { backgroundColor: Theme.surface },
  statusText: { fontSize: 9, lineHeight: 12, fontWeight: "700" },
  statusOnText: { color: GREEN },
  statusOffText: { color: Theme.textMuted },
  statusRejectText: { color: Theme.destructive },
  addBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Theme.actionBtnInk,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
  },
  addBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.cardWhite,
  },
  previewFrame: {
    width: "100%",
    height: 168,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Theme.compliancePreviewCanvas ?? Theme.surface,
    position: "relative",
  },
  previewImage: { width: "100%", height: "100%" },
  previewLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeBtn: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
  },
  emptyQuote: {
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.complianceCardBorder ?? Theme.borderLight,
    backgroundColor: Theme.compliancePageBg ?? Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
  },
  emptyQuoteText: { fontSize: 12, fontWeight: "500", color: Theme.textMuted },
  facts: { fontSize: 11, lineHeight: 15, fontWeight: "500", color: Theme.textMuted },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  ghostBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  ghostBtnText: { fontSize: 12, fontWeight: "700", color: Theme.actionBtnInk },
  removeText: { fontSize: 12, fontWeight: "600", color: Theme.destructive },
});
