import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  complianceIncompleteBannerText,
  type ComplianceCompleteness,
} from "@/features/tripCompliance/utils/complianceIncomplete.util";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * The queue on screen is not the whole queue: some trips are still loading, or
 * their load failed. Counts, lists and exports cover only the loaded trips.
 */
export function ComplianceIncompleteBanner({
  loaded,
  total,
  failed,
  onRetry,
}: ComplianceCompleteness & { onRetry: () => void }) {
  return (
    <View
      testID="compliance-incomplete-banner"
      style={[styles.banner, failed && styles.bannerFailed]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>{complianceIncompleteBannerText({ loaded, total, failed })}</Text>
      {failed ? (
        <TouchableOpacity
          testID="compliance-incomplete-retry"
          onPress={onRetry}
          style={styles.retry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading the remaining trips"
          hitSlop={Layout.touchTargetHitSlop}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.border,
  },
  bannerFailed: { backgroundColor: Theme.warningMuted },
  text: { flex: 1, fontSize: 13, lineHeight: 18, color: Theme.textPrimaryDark },
  retry: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  retryText: { fontSize: 13, fontWeight: "700", color: Theme.warning },
});
