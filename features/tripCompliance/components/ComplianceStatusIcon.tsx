/**
 * Restrained status treatment shared by every Compliance surface
 * (card chips, table pills, review sheet) — Documents-style pill with a
 * status glyph, using Theme semantic tokens only.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import type { ComplianceDocRowStatus } from "@/features/tripCompliance/utils/complianceDocumentRows.util";

export const COMPLIANCE_STATUS_META: Record<
  ComplianceDocRowStatus,
  { label: string; glyph: string; color: string; bg: string }
> = {
  missing: { label: "Missing", glyph: "○", color: Theme.complianceDocNeedFg, bg: Theme.complianceDocNeedBg },
  pending: { label: "Pending", glyph: "◷", color: Theme.warning, bg: Theme.complianceDocNeedBg },
  verified: { label: "Verified", glyph: "✓", color: Theme.complianceDocOkFg, bg: Theme.complianceDocOkBg },
  rejected: { label: "Rejected", glyph: "!", color: Theme.teslaRed, bg: Theme.complianceDocNeedBg },
  replaced: { label: "Replaced", glyph: "↻", color: Theme.textSecondary, bg: Theme.complianceDocNeedBg },
  expired: { label: "Expired", glyph: "!", color: Theme.teslaRed, bg: Theme.complianceDocNeedBg },
};

export function ComplianceStatusChip({
  status,
  label,
  compact = false,
}: {
  status: ComplianceDocRowStatus;
  label: string;
  compact?: boolean;
}) {
  const meta = COMPLIANCE_STATUS_META[status];
  return (
    <View style={[styles.chip, compact && styles.chipCompact, !compact && { backgroundColor: meta.bg }]}>
      <Text style={[styles.glyph, compact && styles.glyphCompact, { color: meta.color }]}>{meta.glyph}</Text>
      <Text
        style={[
          styles.label,
          compact ? styles.labelCompact : { color: meta.color },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipCompact: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    gap: 4,
  },
  glyph: { fontSize: 10, fontWeight: "700", lineHeight: 14 },
  glyphCompact: { fontSize: 10, lineHeight: 13, width: 10, textAlign: "center" },
  label: { fontSize: 10, fontWeight: "600", lineHeight: 14 },
  labelCompact: { fontSize: 11, fontWeight: "500", color: Theme.textPrimary, lineHeight: 13 },
});
