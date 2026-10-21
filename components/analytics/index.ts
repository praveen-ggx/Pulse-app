/**
 * Reusable analytics UI primitives.
 *
 * Single import surface for KPI cards, score cards, leaderboards,
 * heatmaps, gauges, filters, and insights — used by:
 *   • Driver Fleet Ranking + Earnings Analytics
 *   • Client Performance Analytics
 *   • Supplier Reliability Analytics
 *
 * Existing inline implementations across
 * `features/{vehicles,drivers}/components/analytics/*` will be migrated
 * to these primitives in a later refactor phase. New code should import
 * from here exclusively.
 */

export {
  ChartCard,
  KPICard,
  KPIHeader,
  ScoreCard,
  SectionHeader,
} from "./AnalyticsCards";
export type {
  ChartCardProps,
  KPICardProps,
  KPIHeaderProps,
  ScoreCardProps,
  SectionHeaderProps,
} from "./AnalyticsCards";

export {
  HBarChart,
  PerformanceLeaderboard,
  RankBadge,
} from "./PerformanceLeaderboard";
export type {
  HBarChartProps,
  HBarItem,
  LeaderboardColumn,
  PerformanceLeaderboardProps,
  RankBadgeProps,
  RankTier,
} from "./PerformanceLeaderboard";

export { RiskMeter } from "./RiskMeter";
export type { RiskMeterProps } from "./RiskMeter";

export { Heatmap } from "./Heatmap";
export type { HeatmapColumn, HeatmapProps, HeatmapRow } from "./Heatmap";

export {
  AnalyticsFilters,
  FilterChip,
  PeriodPicker,
} from "./AnalyticsFilters";
export type {
  AnalyticsFiltersProps,
  FilterChipProps,
  PeriodPickerProps,
} from "./AnalyticsFilters";

export { InsightsPanel } from "./InsightsPanel";
export type { InsightsPanelProps } from "./InsightsPanel";

export {
  analyticsPanelStyles,
  resolveAnalyticsColumns,
} from "./analyticsLayout";

export { ScoreMeterRow } from "./ScoreMeterRow";
export type { ScoreMeterRowProps } from "./ScoreMeterRow";

export {
  ChartValueCallout,
  MetricHover,
} from "./ChartValueCallout";
export type { ChartValueCalloutRow } from "./ChartValueCallout";

export {
  LineChart,
  RevExpBarChart,
  TrendBarChart,
  TrendLineChart,
} from "./AnalyticsCharts";
export type {
  TrendBarChartProps,
  TrendLineChartProps,
  TrendLineTooltipRow,
  TrendPoint,
} from "./AnalyticsCharts";

export {
  PulseAnalyticsShell,
  PulseSection,
  PulseChartPanel,
  PulseKpiGrid,
  PulsePanelGrid,
  PulseHealthScorePanel,
  PulseGaugePanel,
  PulseHealthRow,
  PulseLaneBar,
  PulseInsightsPanel,
  PulseFinancialOverviewCard,
  usePulseChartWidth,
  pulseStyles,
  pulseColumnCount,
  pulseChartHeight,
  isPulseCompact,
  isPulseDesktop,
} from "./pulse";
export { partyAnalyticsLayout, usePartyAnalyticsInsetStyle, partyAnalyticsColumnCount, chunkPartyKpiRows } from "./partyAnalyticsLayout";
export type {
  PulseKpiItem,
  PulseHealthBarItem,
  PulseLaneBarItem,
  PulseInsightProps,
  PulseFinancialOverviewProps,
} from "./pulse";
