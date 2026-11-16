/**
 * Pulse Scan OCR usage dashboard — org-scoped metrics from get_ocr_metrics RPC.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import {
  WORKSPACE_PANEL_SUBTITLES,
  WORKSPACE_PANEL_TITLES,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import {
  PURPLE,
  PURPLE_BORDER,
  PURPLE_TINT,
  SectionHeader,
  workspacePanelStyles as panelStyles,
} from "@/features/organization/components/workspace/workspacePanelUi";
import { useOcrMetricsQuery, EMPTY_OCR_METRICS } from "@/lib/queries/useOcrMetricsQuery";
import { ScanLine } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onBack: () => void;
};

function formatPercent(confidence: number | null): string {
  if (confidence == null || !Number.isFinite(confidence)) return "—";
  return `${Math.round(confidence * 100)}%`;
}

function formatQuotaRemaining(remaining: number | null, limit: number | null): string {
  if (limit == null) return "Unlimited";
  if (remaining == null) return "—";
  return `${remaining.toLocaleString("en-IN")} left`;
}

function formatTierLabel(tier: string): string {
  switch (tier) {
    case "invoice_pro":
      return "Invoice Pro";
    case "pulse_core":
      return "Pulse Core";
    default:
      return tier.replace(/_/g, " ");
  }
}

function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  half = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "attention";
  /** Two per row. Otherwise three share the row. */
  half?: boolean;
}) {
  return (
    <View style={[styles.metricCard, half && styles.metricCardHalf]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === "attention" && styles.metricValueAttention]}>
        {value}
      </Text>
      <Text style={styles.metricHint} numberOfLines={2}>
        {hint ?? " "}
      </Text>
    </View>
  );
}

export function WorkspaceOcrUsagePanel({ onBack }: Props) {
  const { data: metrics = EMPTY_OCR_METRICS, isLoading, isError, refetch, isFetching } =
    useOcrMetricsQuery();

  const quotaLimit = metrics.quota_limit;
  const quotaUsed = metrics.quota_used;
  const quotaRatio =
    quotaLimit != null && quotaLimit > 0 ? Math.min(1, Math.max(0, quotaUsed / quotaLimit)) : null;
  const quotaTight = quotaRatio != null && quotaRatio >= 0.8;
  const quotaLine =
    quotaLimit != null
      ? `${quotaUsed.toLocaleString("en-IN")} of ${quotaLimit.toLocaleString("en-IN")} used this month`
      : `${quotaUsed.toLocaleString("en-IN")} scans this month · unlimited plan`;

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES["ocr-usage"]}
      subtitle={WORKSPACE_PANEL_SUBTITLES["ocr-usage"]}
      onBack={onBack}
      rightSlot={
        <Pressable
          onPress={() => void refetch()}
          accessibilityRole="button"
          accessibilityLabel="Refresh OCR metrics"
          style={styles.refreshBtn}
          hitSlop={8}
        >
          <Text style={styles.refreshText}>{isFetching ? "Refreshing…" : "Refresh"}</Text>
        </Pressable>
      }
    >
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <LoadingIndicator />
        </View>
      ) : isError ? (
        <View style={panelStyles.card}>
          <Text style={styles.errorText}>Could not load scan usage. Try Refresh.</Text>
        </View>
      ) : (
        <View style={panelStyles.card}>
          <View style={styles.hero}>
            <View style={styles.heroRow}>
              <View style={styles.heroIcon}>
                <ScanLine size={20} color={PURPLE} strokeWidth={1.8} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>Pulse Scan Engine</Text>
                <Text style={styles.heroSubtitle}>{formatTierLabel(metrics.quota_tier)}</Text>
              </View>
              <View style={styles.quotaRemain}>
                <Text style={[styles.quotaRemainValue, quotaTight && styles.metricValueAttention]}>
                  {formatQuotaRemaining(metrics.quota_remaining, quotaLimit)}
                </Text>
                <Text style={styles.quotaRemainLabel}>this month</Text>
              </View>
            </View>
            {quotaRatio != null ? (
              <View
                style={styles.track}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: quotaLimit ?? 0, now: quotaUsed }}
                accessibilityLabel={quotaLine}
              >
                <View
                  style={[
                    styles.fill,
                    quotaTight && styles.fillTight,
                    { width: `${Math.max(quotaRatio * 100, quotaUsed > 0 ? 4 : 0)}%` },
                  ]}
                />
              </View>
            ) : null}
            <Text style={styles.quotaLine}>{quotaLine}</Text>
          </View>

          <SectionHeader label="Usage" />
          <View style={styles.metricGrid}>
            <MetricCard label="Today" value={String(metrics.jobs_today)} hint="Scans started" />
            <MetricCard
              label="This month"
              value={String(metrics.jobs_this_month)}
              hint="Billable, excluding copies"
            />
            <MetricCard
              label="30 days"
              value={String(metrics.jobs_in_window)}
              hint="Every job created"
            />
          </View>

          <SectionHeader label="Quality" />
          <View style={styles.metricGrid}>
            <MetricCard
              half
              label="Duplicates avoided"
              value={String(metrics.duplicate_count)}
              hint="Same document, not scanned again"
            />
            <MetricCard
              half
              label="Failed"
              value={String(metrics.failed_count)}
              hint="Did not finish"
              tone={metrics.failed_count > 0 ? "attention" : "default"}
            />
            <MetricCard
              half
              label="Confidence"
              value={formatPercent(metrics.avg_confidence)}
              hint="Completed jobs, 30 days"
            />
            <MetricCard
              half
              label="Processing"
              value={
                metrics.avg_duration_ms != null
                  ? `${(metrics.avg_duration_ms / 1000).toFixed(1)}s`
                  : "—"
              }
              hint="Average time per scan"
            />
          </View>
        </View>
      )}
    </WorkspaceDetailLayout>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: PURPLE_TINT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: PURPLE_BORDER,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  heroSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: Theme.textSecondary,
  },
  quotaRemain: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  quotaRemainValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  quotaRemainLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  track: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: PURPLE,
  },
  fillTight: {
    backgroundColor: Theme.warning,
  },
  quotaLine: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
  },
  metricCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Theme.surface,
  },
  metricCardHalf: {
    flexBasis: "47%",
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  metricValueAttention: {
    color: Theme.warning,
  },
  metricHint: {
    marginTop: 4,
    minHeight: 32,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textSecondary,
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
    color: Theme.destructive,
    lineHeight: 20,
    padding: 16,
  },
  refreshBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: "600",
    color: PURPLE,
  },
});
