/**
 * Compact confirm card for Compliance → Export Report (Verified by default;
 * Advance Processed passes its own subtitle and a single total tile).
 */
import Theme from "@/constants/Theme";
import { COMPLIANCE_STAGE_TONE } from "@/features/tripCompliance/utils/complianceCardVisual.util";
import { Download } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ComplianceExportConfirmModalProps = {
  visible: boolean;
  /** Verified-stage trips without a Reject remark. */
  verifiedCount: number;
  /** Verified-stage trips carrying a Reject remark. */
  rejectedCount: number;
  exporting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Other stages: override the subtitle, tiles, empty copy and confirm label. Defaults = Verified. */
  eyebrow?: string;
  stats?: ExportStat[];
  emptyHint?: string;
  confirmLabel?: string;
  /** Counts still being prepared: tiles show a spinner and confirm waits. */
  preparing?: boolean;
  /** Rows in the report when the tiles are not a partition of it. Defaults to the tile sum. */
  includedCount?: number;
};

export type ExportStat = { key: string; label: string; value: number; tone: { fg: string } };

const VERIFIED_TONE = COMPLIANCE_STAGE_TONE.compliance_verified;
const REJECTED_TONE = COMPLIANCE_STAGE_TONE.pending_for_docs;

export function ComplianceExportConfirmModal({
  visible,
  verifiedCount,
  rejectedCount,
  exporting = false,
  onCancel,
  onConfirm,
  eyebrow = "Verified stage only",
  stats: statsOverride,
  emptyHint = "Nothing in Verified stage to export yet.",
  confirmLabel = "Confirm",
  preparing = false,
  includedCount,
}: ComplianceExportConfirmModalProps) {
  const insets = useSafeAreaInsets();
  const verified = Math.max(0, Math.floor(verifiedCount));
  const rejected = Math.max(0, Math.floor(rejectedCount));
  const stats: ExportStat[] = statsOverride ?? [
    { key: "verified", label: "Verified", value: verified, tone: VERIFIED_TONE },
    { key: "rejected", label: "Rejected", value: rejected, tone: REJECTED_TONE },
  ];
  const singleStat = stats.length === 1;
  const total =
    includedCount != null
      ? Math.max(0, Math.floor(includedCount))
      : stats.reduce((sum, s) => sum + Math.max(0, Math.floor(s.value)), 0);
  const ready = !preparing && total > 0;
  const confirmDisabled = !ready || exporting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={exporting ? undefined : onCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss export confirmation"
        />
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <Download size={16} color={Theme.textPrimaryDark} strokeWidth={2.2} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Export Report</Text>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
            </View>
          </View>

          <View style={[styles.stats, singleStat && styles.statsSingle]}>
            {stats.map((stat) => (
              <View
                key={stat.key}
                style={[styles.statTile, singleStat && styles.statTileSingle]}
                accessible
                accessibilityLabel={`${stat.value} ${stat.label.toLowerCase()}`}
              >
                {singleStat ? (
                  <>
                    <Text style={styles.statLabelSingle}>{stat.label}</Text>
                    {preparing ? (
                      <View style={styles.statValueLoadingSingle}>
                        <ActivityIndicator size="small" color={Theme.textMuted} />
                      </View>
                    ) : (
                      <Text
                        style={[
                          styles.statValueSingle,
                          stat.value > 0 && { color: stat.tone.fg },
                        ]}
                      >
                        {stat.value}
                      </Text>
                    )}
                    <Text style={styles.statUnitSingle}>
                      {stat.value === 1 ? "trip in this stage" : "trips in this stage"}
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={styles.statLabelRow}>
                      <View style={[styles.statDot, { backgroundColor: stat.tone.fg }]} />
                      <Text style={styles.statLabel}>{stat.label}</Text>
                    </View>
                    {preparing ? (
                      <View style={styles.statValueLoading}>
                        <ActivityIndicator size="small" color={Theme.textMuted} />
                      </View>
                    ) : (
                      <Text style={[styles.statValue, stat.value > 0 && { color: stat.tone.fg }]}>
                        {stat.value}
                      </Text>
                    )}
                    <Text style={styles.statUnit}>{stat.value === 1 ? "trip" : "trips"}</Text>
                  </>
                )}
              </View>
            ))}
          </View>

          {preparing ? (
            <Text style={[styles.message, singleStat && styles.messageCentered]}>
              Preparing payment details…
            </Text>
          ) : ready ? (
            <Text style={[styles.message, singleStat && styles.messageCentered]}>
              {total} {total === 1 ? "trip" : "trips"} will be included in the report
            </Text>
          ) : (
            <Text style={[styles.emptyHint, singleStat && styles.messageCentered]}>{emptyHint}</Text>
          )}

          <View style={styles.actions}>
            <Pressable
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={exporting}
              accessibilityRole="button"
              accessibilityLabel="Cancel export"
              accessibilityState={{ disabled: exporting }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, confirmDisabled && styles.confirmBtnDisabled]}
              onPress={onConfirm}
              disabled={confirmDisabled}
              accessibilityRole="button"
              accessibilityLabel="Confirm export"
              accessibilityState={{ disabled: confirmDisabled }}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={Theme.cardWhite} />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceTripCardBorder,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
    shadowColor: Theme.textPrimaryDark,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.brandBlueSoft,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
    color: Theme.textMuted,
  },
  stats: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  statsSingle: {
    flexDirection: "column",
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    gap: 2,
  },
  statTileSingle: {
    flex: 0,
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.complianceTripCardBorder,
    gap: 4,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statDot: { width: 7, height: 7, borderRadius: 4 },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: Theme.textSecondary,
  },
  statLabelSingle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
  statValue: {
    marginTop: 2,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.4,
  },
  statValueSingle: {
    marginTop: 2,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "800",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.6,
    textAlign: "center",
  },
  statValueLoading: { marginTop: 2, height: 28, justifyContent: "center", alignItems: "flex-start" },
  statValueLoadingSingle: {
    marginTop: 2,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  statUnit: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  statUnitSingle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
  },
  message: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
    color: Theme.textMuted,
  },
  messageCentered: {
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.complianceStageDocsFg,
    lineHeight: 16,
    marginTop: -4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    paddingTop: 2,
  },
  cancelBtn: {
    minHeight: 38,
    minWidth: 84,
    paddingHorizontal: 14,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  confirmBtn: {
    minHeight: 38,
    minWidth: 92,
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: Theme.buttonDark,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.45,
  },
  confirmText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonDarkText,
  },
});
