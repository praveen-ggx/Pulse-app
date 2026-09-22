/**
 * In-app Compliance document preview — same shape as the driver POD lightbox.
 * Signs nothing itself; the caller passes a URL already resolved from the
 * stored object path (one Storage sign, no extra bucket probes).
 */
import Theme from "@/constants/Theme";
import { PdfViewer } from "@/components/PdfViewer";
import { complianceTripDocPreviewKind } from "@/features/tripCompliance/utils/complianceTripDocumentFormat.util";
import {
  displayComplianceActorDetail,
  formatComplianceActivityTime,
  type ComplianceActorDetail,
  type ComplianceDocumentActivityEntry,
} from "@/features/tripCompliance/utils/complianceDocumentActivity.util";
import type { StopProofDocumentSummary } from "@/features/driver/job-card/deliveryProof";
import { Download, X } from "lucide-react-native";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function ComplianceDocumentPreviewModal({
  visible,
  title,
  fileName,
  url,
  mime,
  loading,
  placeProof,
  activity,
  actorDetails,
  onClose,
  emptyMessage,
  onUnreadable,
}: {
  visible: boolean;
  title: string;
  fileName?: string | null;
  url: string | null;
  mime: string | null;
  loading: boolean;
  placeProof: StopProofDocumentSummary | null;
  activity?: ComplianceDocumentActivityEntry[];
  actorDetails?: Record<string, ComplianceActorDetail>;
  onClose: () => void;
  emptyMessage?: string | null;
  onUnreadable?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const previewKind = complianceTripDocPreviewKind(mime);
  const log = activity ?? [];
  const details = actorDetails ?? {};

  const handleDownload = useCallback(() => {
    if (!url) return;
    void Linking.openURL(url);
  }, [url]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}
        onPress={onClose}
      >
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.topBar}>
            <View style={styles.titleBlock}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {fileName ? (
                <Text style={styles.fileName} numberOfLines={1}>
                  {fileName}
                </Text>
              ) : null}
            </View>
            {url ? (
              <TouchableOpacity
                onPress={handleDownload}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Download document"
              >
                <Download size={16} color={Theme.textPrimary} strokeWidth={2.2} />
                <Text style={styles.closeText}>Download</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
            >
              <X size={18} color={Theme.textPrimary} strokeWidth={2.2} />
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          {log.length > 0 ? (
              <View style={styles.logBox} accessibilityLabel="Document activity log">
              <Text style={styles.logHeading}>Activity</Text>
              {log.map((entry, index) => {
                const actor = displayComplianceActorDetail(entry.actorId, details);
                return (
                <View key={`${entry.kind}-${entry.at ?? index}`} style={styles.logItem}>
                  <View style={styles.logMain}>
                    <View style={styles.logTextCol}>
                      <Text style={styles.logAction}>{entry.label}</Text>
                      <Text style={styles.logActor} numberOfLines={1}>
                        {actor.name}
                      </Text>
                      {actor.meta ? (
                        <Text style={styles.logMeta} numberOfLines={1}>
                          {actor.meta}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.logTime}>{formatComplianceActivityTime(entry.at)}</Text>
                  </View>
                  {entry.note ? (
                    <Text style={styles.logNote} numberOfLines={2}>
                      {entry.note}
                    </Text>
                  ) : null}
                </View>
                );
              })}
            </View>
          ) : null}

          {placeProof ? (
            <View style={styles.placeBox}>
              <Text style={styles.placeLabel}>{placeProof.label}</Text>
              <Text style={styles.placeHint}>
                {placeProof.note ??
                  (placeProof.kind === "pickup"
                    ? "Pickup place was recorded without a photo."
                    : "Delivery place was recorded without a photo.")}
              </Text>
            </View>
          ) : loading ? (
            <View style={styles.body}>
              <ActivityIndicator size="large" color={Theme.textMuted} />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          ) : url && previewKind === "pdf" ? (
            <View style={styles.previewFrame}>
              <PdfViewer pdfUri={url} />
            </View>
          ) : url && previewKind === "image" ? (
            <View style={styles.previewFrame}>
              <Image
                source={{ uri: url }}
                style={styles.image}
                resizeMode="contain"
                onError={() => onUnreadable?.()}
              />
            </View>
          ) : (
            <Text style={styles.missing}>
              {emptyMessage ??
                (url
                  ? "This file type can't be previewed here. Download it from Trip documents if you need to inspect it."
                  : "No preview is available for this file.")}
            </Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "92%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    overflow: "hidden",
    padding: 12,
    gap: 10,
  },
  topBar: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  titleBlock: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary },
  fileName: { fontSize: 11, color: Theme.textMuted },
  closeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
  },
  closeText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimary },
  logBox: {
    backgroundColor: Theme.compliancePageBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
  },
  logHeading: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  logItem: { gap: 4 },
  logMain: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  logTextCol: { flex: 1, minWidth: 0, gap: 1 },
  logAction: { fontSize: 12, fontWeight: "700", color: Theme.textPrimary },
  logActor: { fontSize: 13, fontWeight: "600", color: Theme.textPrimary },
  logMeta: { fontSize: 11, color: Theme.textSecondary },
  logTime: { fontSize: 11, color: Theme.textMuted, flexShrink: 0, textAlign: "right", maxWidth: 160 },
  logNote: { fontSize: 11, color: Theme.textMuted, lineHeight: 15 },
  body: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { fontSize: 12, color: Theme.textMuted },
  previewFrame: {
    width: "100%",
    minHeight: 280,
    height: 360,
    backgroundColor: Theme.compliancePageBg,
    borderRadius: 8,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  placeBox: { paddingVertical: 28, paddingHorizontal: 12, alignItems: "center", gap: 8 },
  placeLabel: { fontSize: 18, fontWeight: "700", color: Theme.textPrimary, textAlign: "center" },
  placeHint: { fontSize: 13, color: Theme.textMuted, textAlign: "center", lineHeight: 18 },
  missing: { fontSize: 13, color: Theme.textMuted, textAlign: "center", paddingVertical: 32 },
});
