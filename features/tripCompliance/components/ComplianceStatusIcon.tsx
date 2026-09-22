/**
 * Restrained, glyph-based status treatment shared by every Compliance
 * surface (card chips, table pills, review sheet) — one visual language
 * instead of each screen inventing its own colored-badge convention.
 * Colors follow the app's existing semantic tokens (Theme.success /
 * Theme.warning / Theme.teslaRed), not new ad-hoc hex values.
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
    <View style={[styles.chip, compact && styles.chipCompact, { backgroundColor: meta.bg }]}>
      <Text style={[styles.glyph, { color: meta.color }]}>{meta.glyph}</Text>
      <Text style={[styles.label, { color: meta.color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipCompact: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  glyph: { fontSize: 10, fontWeight: "700" },
  label: { fontSize: 10, fontWeight: "600" },
});
