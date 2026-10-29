import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { formatComplianceUpdatedAgo } from "@/features/tripCompliance/utils/complianceUpdatedAgo.util";
import { RefreshCw } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";

/**
 * Manual Compliance refresh. The pipeline stays fresh for 2 minutes and new
 * document uploads have no realtime path, so users need an on-demand refresh
 * and to see how old the data is.
 */
export function ComplianceRefreshButton({
  updatedAt,
  refreshing,
  onRefresh,
  compact = false,
}: {
  /** Last successful read (ms epoch); 0 before the first. */
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
  /** Icon only (mobile header); the age stays in the accessibility label. */
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [updatedAt]);
  const label = refreshing ? "Refreshing…" : formatComplianceUpdatedAgo(updatedAt, now);

  return (
    <TouchableOpacity
      testID="compliance-refresh"
      onPress={onRefresh}
      disabled={refreshing}
      style={[styles.btn, compact && styles.btnCompact]}
      accessibilityRole="button"
      accessibilityLabel={label ? `Refresh Compliance. ${label}` : "Refresh Compliance"}
      accessibilityState={{ disabled: refreshing, busy: refreshing }}
      hitSlop={Layout.touchTargetHitSlop}
    >
      {refreshing ? (
        <ActivityIndicator size="small" color={Theme.textSecondary} />
      ) : (
        <RefreshCw size={compact ? 16 : 12} color={Theme.textPrimaryDark} strokeWidth={2.1} />
      )}
      {!compact && label ? <Text style={styles.label}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 8,
  },
  btnCompact: { minWidth: 36, minHeight: 36, justifyContent: "center", paddingHorizontal: 0 },
  label: { fontSize: 12, color: Theme.textSecondary },
});
