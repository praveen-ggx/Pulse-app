import { Fragment, memo } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import {
  IndentHubAlertPulseIcon,
  IndentHubClockPulseIcon,
  IndentHubGlyphSlot,
  IndentHubMedalGlyph,
  IndentHubTrophyGlyph,
} from "@/features/indents/components/IndentHubAnimatedGlyphs";

import Theme from "@/constants/Theme";
import { IndentHubPerforation } from "@/features/indents/components/IndentHubPerforation";
import { indentReviewHubLayout } from "@/features/indents/styles/indentReviewHubStyles";
import type { IndentBidAlertInfo } from "@/features/indents/utils/bidding/indentBidAlert.util";
import type {
  IndentBidFooterInsight,
  IndentBidFooterMetric,
  IndentBidMetricTone,
} from "@/features/indents/utils/bidding/indentLiveBids.util";

const RECO_STAR = "#D97706";

function MetricValueText({
  metric,
  compact,
}: {
  metric: IndentBidFooterMetric;
  compact?: boolean;
}) {
  return (
    <Text
      style={[
        styles.metricValue,
        compact && styles.metricValueCompact,
        metric.label === "TARGET RATE" && styles.metricValueTarget,
        metric.label === "TARGET RATE" && compact && styles.metricValueTargetCompact,
        metricValueStyle(metric.tone),
      ]}
      numberOfLines={2}
    >
      {metric.value}
    </Text>
  );
}

function metricValueStyle(tone: IndentBidMetricTone) {
  switch (tone) {
    case "positive":
      return styles.metricValuePositive;
    case "negative":
      return styles.metricValueNegative;
    default:
      return styles.metricValueNeutral;
  }
}

function alertPanelStyles(tone: IndentBidAlertInfo["tone"]) {
  switch (tone) {
    case "overdue":
      return { panel: styles.alertOverdue, text: styles.alertTextOverdue, icon: "#DC2626" };
    case "urgent":
      return { panel: styles.alertUrgent, text: styles.alertTextUrgent, icon: "#EA580C" };
    case "soon":
      return { panel: styles.alertSoon, text: styles.alertTextSoon, icon: "#CA8A04" };
    default:
      return {
        panel: styles.alertNeutral,
        text: styles.alertTextNeutral,
        icon: Theme.textRouteCard,
      };
  }
}

function TicketMetrics({
  metrics,
  compact,
}: {
  metrics: IndentBidFooterMetric[];
  compact?: boolean;
}) {
  const shown = metrics.slice(0, 3);
  if (shown.length === 0) return null;

  return (
    <View style={styles.metricsRow}>
      {shown.map((metric, index) => (
        <Fragment key={metric.label}>
          {index > 0 ? (
            <View style={[styles.metricDivider, compact && styles.metricDividerCompact]} />
          ) : null}
          <View style={styles.metricCell}>
            <Text style={[styles.metricLabel, compact && styles.metricLabelCompact]}>
              {metric.label}
            </Text>
            <MetricValueText metric={metric} compact={compact} />
          </View>
        </Fragment>
      ))}
    </View>
  );
}

export type IndentHubInsightTicketTailProps = {
  insight?: IndentBidFooterInsight | null;
  alertInfo?: IndentBidAlertInfo | null;
  contentPadding?: number;
  perforationDashColor?: string;
  /** Third metric line (e.g. VS HIGHEST on live bid cards). */
  extraMetric?: IndentBidFooterMetric | null;
  /** Tighter metrics block for live bid cards on white tickets. */
  compact?: boolean;
};

/** Detachable ticket stub — perforation + white metrics card + recommendation + alerts. */
export const IndentHubInsightTicketTail = memo(function IndentHubInsightTicketTail({
  insight,
  alertInfo,
  contentPadding = indentReviewHubLayout.summaryCardPadding,
  perforationDashColor,
  extraMetric,
  compact = false,
}: IndentHubInsightTicketTailProps) {
  const reco = insight?.recommendation?.trim() ?? "";
  const hasMetricsPanel =
    (insight?.metrics.length ?? 0) > 0 || !!extraMetric || !!reco;
  const alertPanel = alertInfo ? alertPanelStyles(alertInfo.tone) : null;
  const hasAlert = Boolean(alertInfo && alertPanel);

  if (!hasMetricsPanel && !hasAlert) return null;
  const recoIcon =
    /lowest|competing|recommended/i.test(reco) ? "star" : "info";

  return (
    <View style={[styles.tail, compact && styles.tailCompact]}>
      <IndentHubPerforation
        contentPadding={contentPadding}
        dashColor={perforationDashColor}
      />
      <View style={[styles.tailStack, compact && styles.tailStackCompact]}>
        {hasMetricsPanel ? (
          <View style={[styles.metricsPanel, compact && styles.metricsPanelCompact]}>
            {insight && insight.metrics.length > 0 ? (
              <TicketMetrics metrics={insight.metrics} compact={compact} />
            ) : null}
            {extraMetric ? (
              <Text
                style={[styles.metricExtraLine, compact && styles.metricExtraLineCompact]}
                numberOfLines={1}
              >
                {extraMetric.label}:{" "}
                <Text
                  style={[
                    styles.metricExtraValue,
                    metricValueStyle(extraMetric.tone),
                  ]}
                >
                  {extraMetric.value}
                </Text>
              </Text>
            ) : null}
            {reco ? (
              <View style={[styles.recoRow, compact && styles.recoRowCompact]}>
                {recoIcon === "star" ? (
                  <IndentHubGlyphSlot size={compact ? 12 : 13}>
                    <IndentHubMedalGlyph size={compact ? 12 : 13} />
                  </IndentHubGlyphSlot>
                ) : (
                  <Feather name="info" size={compact ? 10 : 11} color={RECO_STAR} />
                )}
                <Text
                  style={[styles.recoText, compact && styles.recoTextCompact]}
                  numberOfLines={2}
                >
                  {reco}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {hasAlert && alertInfo && alertPanel ? (
          <View style={[styles.alertPanel, alertPanel.panel]}>
            {alertInfo.awardedAgoLabel ? (
              <View style={styles.alertLine}>
                <IndentHubGlyphSlot size={14} alignTop>
                  <IndentHubTrophyGlyph size={14} />
                </IndentHubGlyphSlot>
                <Text style={styles.alertAwarded}>{alertInfo.awardedAgoLabel}</Text>
              </View>
            ) : null}
            {alertInfo.dueByLabel ? (
              <View style={styles.alertLine}>
                <IndentHubGlyphSlot size={14} alignTop>
                  {alertInfo.tone === "overdue" ? (
                    <IndentHubAlertPulseIcon color={alertPanel.icon} size={12} />
                  ) : (
                    <IndentHubClockPulseIcon color={alertPanel.icon} size={12} />
                  )}
                </IndentHubGlyphSlot>
                <Text style={[styles.alertDue, alertPanel.text]} numberOfLines={2}>
                  {alertInfo.dueByLabel}
                </Text>
              </View>
            ) : null}
            {alertInfo.tone === "overdue" ? (
              <View style={styles.alertLine}>
                <IndentHubGlyphSlot size={14} alignTop>
                  <IndentHubAlertPulseIcon color={alertPanel.icon} size={12} />
                </IndentHubGlyphSlot>
                <Text style={[styles.alertDue, alertPanel.text]} numberOfLines={2}>
                  Contact shipper to confirm — pickup window has passed
                </Text>
              </View>
            ) : null}
            {!alertInfo.awardedAgoLabel && !alertInfo.dueByLabel && alertInfo.summaryLine ? (
              <Text style={[styles.alertDue, alertPanel.text]} numberOfLines={2}>
                {alertInfo.summaryLine}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const panelShadow = Platform.select<ViewStyle>({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  android: { elevation: 1 },
  web: { boxShadow: "0 1px 4px rgba(15, 23, 42, 0.08)" },
  default: {},
});

const styles = StyleSheet.create({
  tail: {
    marginTop: 4,
    zIndex: 1,
  },
  tailCompact: {
    marginTop: 2,
  },
  tailStack: {
    gap: 8,
  },
  tailStackCompact: {
    gap: 6,
  },
  metricsPanel: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    gap: 10,
    ...panelShadow,
  },
  metricsPanelCompact: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 6,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    ...Platform.select<ViewStyle>({
      web: { boxShadow: "none" },
      default: { elevation: 0 },
    }),
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingHorizontal: 2,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderMedium,
    marginHorizontal: 10,
    alignSelf: "stretch",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.15,
    textTransform: "uppercase",
    color: Theme.textRouteCard,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  metricLabelCompact: {
    fontSize: 9,
    letterSpacing: 0.15,
  },
  metricValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  metricValueCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  metricValueTarget: {
    fontSize: 13,
    color: Theme.textPrimaryDark,
  },
  metricValueTargetCompact: {
    fontSize: 11,
  },
  metricDividerCompact: {
    marginHorizontal: 6,
  },
  metricValuePositive: {
    color: Theme.success,
  },
  metricValueNegative: {
    color: Theme.teslaRed,
  },
  metricValueNeutral: {
    color: Theme.textPrimaryDark,
  },
  recoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  recoRowCompact: {
    paddingTop: 0,
    gap: 6,
  },
  recoText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textRouteCard,
    lineHeight: 14,
  },
  recoTextCompact: {
    fontSize: 9,
    lineHeight: 12,
  },
  metricExtraLine: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textRouteCard,
  },
  metricExtraLineCompact: {
    fontSize: 9,
  },
  metricExtraValue: {
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  alertPanel: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  alertLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  alertAwarded: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
  },
  alertDue: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  alertOverdue: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  alertUrgent: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },
  alertSoon: {
    backgroundColor: "#FEFCE8",
    borderColor: "#FEF08A",
  },
  alertNeutral: {
    backgroundColor: Theme.surface,
    borderColor: Theme.surfaceBorder,
  },
  alertTextOverdue: { color: "#B91C1C" },
  alertTextUrgent: { color: "#C2410C" },
  alertTextSoon: { color: "#A16207" },
  alertTextNeutral: { color: Theme.textRouteCard },
});
