/**
 * Shared 4-metric grid (Impressions, Views, Bids, Credits Used).
 */
import Theme from "@/constants/Theme";
import { useReachCampaignMetricsQuery } from "@/lib/queries/useReachCampaignsQuery";
import { Coins, Eye, Gavel, Radio } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export function ReachMetricsGrid({
  campaignId,
  withDivider = false,
}: {
  campaignId: string;
  withDivider?: boolean;
}) {
  const metricsQ = useReachCampaignMetricsQuery(campaignId);
  const m = metricsQ.data;

  if (metricsQ.isLoading || !m) {
    return (
      <View style={styles.metricsLoading}>
        <ActivityIndicator size="small" color={Theme.primary} />
      </View>
    );
  }

  const cells = [
    { label: "Impressions", value: m.impressions.toLocaleString(), Icon: Radio, tone: "plain" as const },
    { label: "Views", value: m.views.toLocaleString(), Icon: Eye, tone: "plain" as const },
    {
      label: "Bids",
      value: String(m.bids),
      Icon: Gavel,
      tone: "bids" as const,
    },
    {
      label: "Credits",
      value: m.creditsUsed.toLocaleString(),
      Icon: Coins,
      tone: "credits" as const,
    },
  ];

  return (
    <View style={[styles.metricsRow, withDivider && styles.metricsRowDivided]}>
      {cells.map((cell) => (
        <View
          key={cell.label}
          style={[
            styles.metricCell,
            cell.tone === "credits" && styles.metricCellCredits,
          ]}
        >
          <cell.Icon
            size={12}
            color={
              cell.tone === "credits"
                ? Theme.accentBrown
                : cell.tone === "bids"
                  ? Theme.positive
                  : Theme.textMuted
            }
          />
          <Text
            style={[
              styles.metricValue,
              cell.tone === "bids" && styles.metricValueBids,
              cell.tone === "credits" && styles.metricValueCredits,
            ]}
            numberOfLines={1}
          >
            {cell.value}
          </Text>
          <Text
            style={[
              styles.metricLabel,
              cell.tone === "credits" && styles.metricLabelCredits,
            ]}
            numberOfLines={1}
          >
            {cell.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
  },
  metricsRowDivided: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  metricsLoading: { paddingVertical: 10, alignItems: "center" },
  metricCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: Theme.surface,
  },
  metricCellCredits: {
    backgroundColor: Theme.accentBrownWash,
    borderWidth: 1,
    borderColor: Theme.accentBrownBorder,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    fontVariant: ["tabular-nums"],
  },
  metricValueBids: { color: Theme.positive },
  metricValueCredits: { color: Theme.accentBrownDeep },
  metricLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  metricLabelCredits: { color: Theme.accentBrown },
});
