import Theme from "@/constants/Theme";
import {
  podCopyWatermarkLabel,
  type PodVerificationKind,
} from "@/features/tripCompliance/utils/podVerificationDocuments.util";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

export const PodCopyWatermark = memo(function PodCopyWatermark({
  kind,
  label,
  tone = "copy",
}: {
  kind?: PodVerificationKind;
  label?: string;
  tone?: "copy" | "cancelled";
}) {
  const mark = label ?? (kind ? podCopyWatermarkLabel(kind) : "");
  if (!mark) return null;
  return (
    <View pointerEvents="none" style={styles.wrap} accessibilityElementsHidden>
      <Text style={[styles.mark, tone === "cancelled" && styles.markCancelled]}>{mark}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "lowercase",
    color: Theme.textPrimaryDark,
    opacity: 0.18,
    transform: [{ rotate: "-18deg" }],
  },
  markCancelled: {
    fontSize: 28,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: Theme.negative,
    opacity: 0.28,
    borderWidth: 3,
    borderColor: "rgba(190, 18, 60, 0.32)",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
});
