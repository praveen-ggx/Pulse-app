/**
 * Compact Compliance advance terms on Finance Hub Summary:
 * TDS, documentation charges, advance %, computed vs posted payable.
 */
import Theme from "@/constants/Theme";
import type { ComplianceAdvanceFinanceBreakdown } from "@/features/tripCompliance/services/complianceAdvanceFinanceBreakdown.service";
import { formatINR } from "@/lib/format";
import React, { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

function formatInr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatINR(value);
}

function Row({
  label,
  value,
  meta,
  emphasize,
  negative,
}: {
  label: string;
  value: string;
  meta?: string | null;
  emphasize?: boolean;
  negative?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabelCol}>
        <Text style={[styles.rowLabel, emphasize && styles.rowLabelEmphasize]}>
          {label}
        </Text>
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      </View>
      <Text
        style={[
          styles.rowValue,
          emphasize && styles.rowValueEmphasize,
          negative && styles.rowValueNegative,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export const ComplianceAdvanceFinanceCard = memo(
  function ComplianceAdvanceFinanceCard({
    breakdown,
    loading,
    supplierName,
  }: {
    breakdown: ComplianceAdvanceFinanceBreakdown | null | undefined;
    loading?: boolean;
    supplierName?: string | null;
  }) {
    if (loading && !breakdown) {
      return (
        <View style={styles.card} accessibilityLabel="Loading compliance finance">
          <Text style={styles.title}>Compliance advance</Text>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={styles.loadingText}>Loading TDS & deductions…</Text>
          </View>
        </View>
      );
    }

    if (!breakdown) return null;

    const tdsMeta =
      breakdown.tdsRatePercent != null && breakdown.tdsRatePercent > 0
        ? breakdown.tdsFinancialYear
          ? `FY ${breakdown.tdsFinancialYear} · ${breakdown.tdsRatePercent}% of base freight`
          : `${breakdown.tdsRatePercent}% of base freight`
        : "No TDS rate on vendor vault";

    const advanceMeta =
      breakdown.advancePercentSource === "vendor"
        ? "From supplier vendor vault"
        : "Default (vendor % not set)";

    const posted = breakdown.postedAdvanceAmount;
    const hasPosted = posted != null && posted > 0;

    return (
      <View
        style={styles.card}
        accessibilityLabel="Compliance advance finance breakdown"
      >
        <View style={styles.head}>
          <Text style={styles.title}>Compliance advance</Text>
          {supplierName?.trim() ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {supplierName.trim()}
            </Text>
          ) : null}
        </View>

        <Row label="Base freight" value={formatInr(breakdown.baseFreight)} />
        <Row
          label="Advance %"
          value={`${breakdown.advancePercent}%`}
          meta={advanceMeta}
        />
        <Row
          label="Documentation charges"
          value={
            breakdown.documentationCharges > 0
              ? `− ${formatInr(breakdown.documentationCharges)}`
              : formatInr(0)
          }
          meta={breakdown.documentationChargeNote}
          negative={breakdown.documentationCharges > 0}
        />
        <Row
          label="TDS"
          value={
            breakdown.tdsAmount > 0
              ? `− ${formatInr(breakdown.tdsAmount)}`
              : formatInr(0)
          }
          meta={tdsMeta}
          negative={breakdown.tdsAmount > 0}
        />

        <View style={styles.divider} />

        <Row
          label="Computed advance payable"
          value={formatInr(breakdown.computedAdvancePayable)}
          meta="(Base × %) − doc − TDS"
          emphasize
        />

        {hasPosted ? (
          <Row
            label="Posted in Compliance"
            value={formatInr(posted)}
            meta={[
              breakdown.postedPaymentMode,
              breakdown.postedUtr ? `UTR ${breakdown.postedUtr}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "compliance_advance"}
            emphasize
          />
        ) : (
          <Text style={styles.emptyPosted}>
            No compliance advance posted yet
          </Text>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surface,
  },
  head: {
    marginBottom: 10,
    gap: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: Theme.textRouteCard,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    color: Theme.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
    minHeight: 36,
  },
  rowLabelCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    fontSize: 13,
    color: Theme.textRouteCard,
  },
  rowLabelEmphasize: {
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  rowMeta: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textBody,
    textAlign: "right",
  },
  rowValueEmphasize: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  rowValueNegative: {
    color: Theme.warning,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderMedium,
    marginVertical: 6,
  },
  emptyPosted: {
    marginTop: 4,
    fontSize: 12,
    color: Theme.textMuted,
  },
});
