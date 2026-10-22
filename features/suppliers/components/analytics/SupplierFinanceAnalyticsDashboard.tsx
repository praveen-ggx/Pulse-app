/**
 * Supplier finance analytics — responsive Metronic BI (matches client dashboard).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { MetricHover, TrendBarChart, type TrendPoint } from "@/components/analytics";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import {
  computeSupplierReliabilityScore,
  deriveSupplierBadges,
  type SupplierReliabilityScore,
} from "@/features/analytics";
import { ClientAnalyticsInsightRow } from "@/features/clients/components/analytics/ClientAnalyticsInsightRow";
import { ClientAnalyticsKpiLottie } from "@/features/clients/components/analytics/ClientAnalyticsKpiLottie";
import {
  applyPartyChartFilters,
  computePartyContribution,
  tripSupplierLabel,
} from "@/features/clients/components/analytics/clientAnalyticsUtils";
import { clientFinanceAnalyticsStyles as supplierStyles } from "@/features/clients/components/analytics/clientFinanceAnalytics.styles";
import type { LedgerRow } from "@/features/finance";
import { NetworkDesktopSalesDonut } from "@/features/network/components/desktop/NetworkDesktopSalesDonut";
import { NetworkDesktopSalesLineChart } from "@/features/network/components/desktop/NetworkDesktopSalesLineChart";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type {
  SalesSlice,
  SalesTripTableRow,
  SalesTrendPoint,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import { SUPPLIER_ANALYTICS_LOTTIE } from "@/features/suppliers/components/analytics/supplierAnalyticsAssets";
import { SupplierAnalyticsMobileTripCard } from "@/features/suppliers/components/analytics/SupplierAnalyticsMobileTripCard";
import {
  computeSupplierFinancialMetrics,
  computeSupplierKpiHeader,
  computeSupplierLaneBreakdown,
  computeSupplierLoadTypeBreakdown,
  computeSupplierMonthlyTrend,
  computeSupplierOperationalMetrics,
  computeSupplierPayableAging,
  computeSupplierPricingStability,
  deriveSupplierInsights,
  type SupplierMonthlyTrendPoint,
} from "@/features/suppliers/components/analytics/supplierAnalyticsUtils";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { formatINR, formatINRChip, formatLedgerDate, formatTripTableDate } from "@/lib/format";
import { useRouter } from "expo-router";
import { useSupplierReliabilityScoreQuery } from "@/lib/queries/useAnalyticsQueries";
import { Search } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

export type SupplierAnalyticsDateRange = "3m" | "6m" | "12m" | "all";

type Props = {
  supplier: SupplierRow | null;
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
  embedded?: boolean;
};

const DATE_RANGES: { id: SupplierAnalyticsDateRange; label: string }[] = [
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "12 months" },
  { id: "all", label: "All time" },
];

const DONUT_COLORS = ["#3E97FF", "#50CD89", "#7239EA", "#FFC700", "#F1416C"];

function tripDate(t: TripRow): Date | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function filterByDateRange<T extends TripRow | LedgerRow>(
  rows: T[],
  range: SupplierAnalyticsDateRange,
  dateFn: (row: T) => Date | null,
): T[] {
  if (range === "all") return rows;
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return rows.filter((row) => {
    const d = dateFn(row);
    return d != null && d >= cutoff;
  });
}

function laneChipLabel(lane: string): string {
  if (lane.length <= 24) return lane;
  return `${lane.slice(0, 22)}…`;
}

function badgeLabel(b: string): string {
  switch (b) {
    case "preferred":
      return "Preferred vendor";
    case "high_risk":
      return "High risk";
    case "reliable":
      return "Reliable";
    case "low_quality":
      return "Low quality";
    case "best_value":
      return "Best value";
    case "frequent_canceller":
      return "Cancels often";
    default:
      return b.replace(/_/g, " ");
  }
}

function toTrendPoints(months: readonly SupplierMonthlyTrendPoint[]): SalesTrendPoint[] {
  return months.map((m) => ({
    monthKey: m.monthKey,
    label: m.label,
    trips: m.trips,
    revenue: m.payable,
  }));
}

function toPayableLinePoints(
  months: readonly SupplierMonthlyTrendPoint[],
): TrendPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.paid,
    expense: m.outstanding,
    profit: 0,
    margin: 0,
    tripCount: m.trips,
  }));
}

function FilterChip({
  label,
  active,
  onPress,
  compact,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          supplierStyles.mobileFilterChip,
          active && supplierStyles.mobileFilterChipOn,
        ]}
      >
        <Text
          style={[
            supplierStyles.mobileFilterChipText,
            active && supplierStyles.mobileFilterChipTextOn,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={[styles.salesFilterChip, active && styles.salesFilterChipOn]}
    >
      <Text
        style={[
          styles.salesFilterChipText,
          active && styles.salesFilterChipTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function KpiCard({
  label,
  value,
  sub,
  lottie,
  valueColor,
  compact,
  wide,
  solo,
}: {
  label: string;
  value: string;
  sub?: string;
  lottie: ReactNode;
  valueColor?: string;
  compact?: boolean;
  wide?: boolean;
  solo?: boolean;
}) {
  return (
    <MetricHover
      title={label}
      rows={[
        { label: "Value", value },
        ...(sub ? [{ label: "Detail", value: sub }] : []),
      ]}
    >
      <View
        style={[
          styles.salesKpiCard,
          supplierStyles.kpiCardElegant,
          compact && supplierStyles.kpiCardMobile,
          compact && (solo || wide) && supplierStyles.kpiCardMobileWide,
          compact && solo && supplierStyles.kpiCardMobileSolo,
        ]}
      >
        <View style={supplierStyles.kpiIllustrWell}>{lottie}</View>
        <View style={supplierStyles.kpiCopy}>
          <Text style={[styles.salesKpiLabel, compact && supplierStyles.kpiLabelMobile]}>
            {label}
          </Text>
          <Text style={[styles.salesKpiValue, valueColor ? { color: valueColor } : null]}>
            {value}
          </Text>
          {sub ? (
            <Text
              style={[styles.salesKpiSub, compact && supplierStyles.kpiSubMobile]}
              numberOfLines={2}
            >
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
    </MetricHover>
  );
}

function ChartShell({
  title,
  subtitle,
  children,
  compact,
  shellStyle,
  contained,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  compact?: boolean;
  shellStyle?: object;
  contained?: boolean;
}) {
  return (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPadTight,
        compact && supplierStyles.chartCardMobile,
        contained && supplierStyles.desktopQuadInner,
        shellStyle,
      ]}
    >
      <Text style={styles.salesCardTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.salesWidgetSub} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      {contained ? (
        <ScrollView
          style={supplierStyles.desktopQuadScroll}
          contentContainerStyle={supplierStyles.desktopQuadScrollContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          showsHorizontalScrollIndicator
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
}

export function SupplierFinanceAnalyticsDashboard({
  supplier,
  trips,
  transactions,
  orgId,
  embedded = false,
}: Props) {
  const router = useRouter();
  const layout = useProfileHubCompactLayout();
  const compact = layout.compact;
  const { width } = useWindowDimensions();
  const carouselCardWidth = Math.min(300, width - Layout.screenPaddingHorizontal * 2 - 12);

  const [dateRange, setDateRange] = useState<SupplierAnalyticsDateRange>("12m");
  const [laneFilter, setLaneFilter] = useState<string | null>(null);
  const [loadTypeFilter, setLoadTypeFilter] = useState<string | null>(null);
  const [agingFilter, setAgingFilter] = useState<string | null>(null);
  const [partyFilter, setPartyFilter] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [trendChartWidth, setTrendChartWidth] = useState(compact ? width - 48 : 320);
  const [collectionsChartWidth, setCollectionsChartWidth] = useState(
    compact ? carouselCardWidth - 24 : 200,
  );

  const supplierId = supplier?.id ?? null;

  const rangeTrips = useMemo(
    () => filterByDateRange(trips, dateRange, tripDate),
    [trips, dateRange],
  );

  const rangeTx = useMemo(
    () =>
      filterByDateRange(transactions, dateRange, (tx) => {
        const raw = tx.transaction_date ?? tx.created_at;
        if (!raw) return null;
        const d = new Date(raw);
        return Number.isFinite(d.getTime()) ? d : null;
      }),
    [transactions, dateRange],
  );

  const partyContribution = useMemo(
    () =>
      supplierId
        ? []
        : computePartyContribution(rangeTrips, {
            topN: 6,
            labelFor: tripSupplierLabel,
            valueFor: (t) => Math.max(0, Number(t.supplier_rate ?? 0)),
          }),
    [rangeTrips, supplierId],
  );

  const chartFilters = {
    lane: laneFilter,
    monthKey,
    loadType: loadTypeFilter,
    agingLabel: agingFilter,
    agingMode: "payable" as const,
    partyLabel: partyFilter,
    partyLabelFor: tripSupplierLabel,
    otherPartyLabels: new Set(
      partyContribution.filter((row) => row.id !== "others").map((row) => row.label),
    ),
  };

  const scopedTrips = useMemo(
    () => applyPartyChartFilters(rangeTrips, rangeTx, chartFilters),
    [rangeTrips, rangeTx, laneFilter, monthKey, loadTypeFilter, agingFilter, partyFilter, partyContribution],
  );

  const scopedTx = useMemo(() => {
    if (!laneFilter && !monthKey && !loadTypeFilter && !agingFilter && !partyFilter) return rangeTx;
    const ids = new Set(scopedTrips.map((t) => t.id));
    return rangeTx.filter((tx) => {
      const id = String(tx.trip_id ?? "").trim();
      return Boolean(id && ids.has(id));
    });
  }, [agingFilter, laneFilter, loadTypeFilter, monthKey, rangeTx, scopedTrips]);

  const { data: serverScore } = useSupplierReliabilityScoreQuery(orgId, supplierId);

  const localScore: SupplierReliabilityScore | null = useMemo(() => {
    if (serverScore || !supplierId) return null;
    return computeSupplierReliabilityScore(
      supplierId,
      scopedTrips.map((t) => ({
        id: t.id,
        supplier_id: t.supplier_id,
        supplier_rate: Number(t.supplier_rate ?? 0),
        status: t.status,
        pickup_date: t.pickup_date,
        completed_at: t.completed_at,
        created_at: t.created_at,
      })),
    );
  }, [serverScore, supplierId, scopedTrips]);

  const score = serverScore ?? localScore;
  const badges = useMemo(() => deriveSupplierBadges(score), [score]);
  const primaryBadge = badges[0] ? badgeLabel(badges[0]) : undefined;

  const kpis = useMemo(
    () => computeSupplierKpiHeader(scopedTrips, scopedTx, { score }),
    [scopedTrips, scopedTx, score],
  );
  const monthly = useMemo(
    () =>
      computeSupplierMonthlyTrend(
        applyPartyChartFilters(rangeTrips, rangeTx, chartFilters, "month"),
        rangeTx,
        { monthsBack: 12 },
      ),
    [rangeTrips, rangeTx, laneFilter, loadTypeFilter, agingFilter],
  );
  const financial = useMemo(
    () => computeSupplierFinancialMetrics(scopedTrips, scopedTx),
    [scopedTrips, scopedTx],
  );
  const operations = useMemo(
    () => computeSupplierOperationalMetrics(scopedTrips, scopedTx),
    [scopedTrips, scopedTx],
  );
  const lanes = useMemo(
    () =>
      computeSupplierLaneBreakdown(
        applyPartyChartFilters(rangeTrips, rangeTx, chartFilters, "lane"),
        { topN: 6 },
      ),
    [rangeTrips, rangeTx, monthKey, loadTypeFilter, agingFilter],
  );
  const loadTypes = useMemo(
    () =>
      computeSupplierLoadTypeBreakdown(
        applyPartyChartFilters(rangeTrips, rangeTx, chartFilters, "load"),
        { topN: 5 },
      ),
    [rangeTrips, rangeTx, laneFilter, monthKey, agingFilter],
  );
  const aging = useMemo(
    () =>
      computeSupplierPayableAging(
        applyPartyChartFilters(rangeTrips, rangeTx, chartFilters, "aging"),
        rangeTx,
      ),
    [rangeTrips, rangeTx, laneFilter, monthKey, loadTypeFilter],
  );

  const settlementPct = useMemo(() => {
    const total = financial.payable;
    const paid = financial.paid;
    return total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  }, [financial.paid, financial.payable]);

  const trend = useMemo(() => toTrendPoints(monthly), [monthly]);

  const handleSelectMonth = (key: string | null) => {
    if (!key || key === monthKey) {
      setMonthKey(null);
      return;
    }
    const point = monthly.find((m) => m.monthKey === key);
    if (!point || (point.trips === 0 && point.payable === 0)) {
      setMonthKey(null);
      return;
    }
    setMonthKey(key);
  };

  const laneSlices: SalesSlice[] = useMemo(
    () =>
      lanes.map((l, i) => ({
        label: laneChipLabel(l.label),
        value: l.payable,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      })),
    [lanes],
  );

  const loadSlices: SalesSlice[] = useMemo(
    () =>
      loadTypes.map((l, i) => ({
        label: l.label,
        value: l.payable,
        color: DONUT_COLORS[(i + 2) % DONUT_COLORS.length],
      })),
    [loadTypes],
  );

  const agingSlices: SalesSlice[] = useMemo(
    () =>
      [
        { label: "0-30d", value: aging.bucket0_30, color: "#50CD89" },
        { label: "31-60d", value: aging.bucket31_60, color: "#FFC700" },
        { label: "61-90d", value: aging.bucket61_90, color: "#F1416C" },
        { label: "90+d", value: aging.bucket90Plus, color: "#7239EA" },
      ].filter((s) => s.value > 0),
    [aging],
  );

  const contributionSlices: SalesSlice[] = useMemo(
    () =>
      partyContribution.map((row, i) => ({
        label: row.label,
        value: row.revenue,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
        valueLabel: formatINRChip(row.revenue),
      })),
    [partyContribution],
  );

  const tableRows = useMemo((): SalesTripTableRow[] => {
    const q = tableSearch.trim().toLowerCase();
    return scopedTrips
      .filter((t) => {
        if (!q) return true;
        const ref = getTripOperationalDisplay({
          trip_number: t.trip_number ?? null,
        }).toLowerCase();
        const lane = `${t.pickup_area ?? ""} ${t.drop_location ?? ""}`.toLowerCase();
        return ref.includes(q) || lane.includes(q);
      })
      .slice(0, 50)
      .map((t) => {
        const cost = Number(t.supplier_rate ?? 0);
        const pickup = (t.pickup_area ?? "").trim();
        const drop = (t.drop_location ?? "").trim();
        const lane =
          pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "—";
        return {
          id: t.id,
          tripRef: getTripOperationalDisplay({ trip_number: t.trip_number ?? null }),
          lane,
          clientName: "—",
          supplierName: supplier?.name ?? "—",
          sales: cost,
          cost,
          margin: Number(t.margin ?? 0),
          marginPct: 0,
          dateLabel: null,
          statusLabel: (t.status ?? "—").replace(/_/g, " ").toUpperCase(),
          trip: t,
        };
      });
  }, [scopedTrips, tableSearch, supplier?.name]);

  const partyDetailRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    const txByTrip = new Map<
      string,
      { paid: number; expense: number; count: number; lastTxn: string | null }
    >();
    for (const tx of scopedTx) {
      const key = String(tx.trip_id ?? "").trim().toLowerCase();
      if (!key) continue;
      const cur = txByTrip.get(key) ?? {
        paid: 0,
        expense: 0,
        count: 0,
        lastTxn: null,
      };
      const out = Number(tx.amount_out ?? 0);
      cur.paid += out;
      cur.expense += out;
      cur.count += 1;
      const d = tx.transaction_date ?? tx.created_at ?? null;
      if (d && (!cur.lastTxn || String(d) > cur.lastTxn)) cur.lastTxn = String(d);
      txByTrip.set(key, cur);
    }

    return scopedTrips
      .filter((t) => {
        if (!q) return true;
        const ref = getTripOperationalDisplay({
          trip_number: t.trip_number ?? null,
        }).toLowerCase();
        const lane = `${t.pickup_area ?? ""} ${t.drop_location ?? ""}`.toLowerCase();
        const client = (t.client_name ?? "").toLowerCase();
        const driver = (t.driver_display_name ?? "").toLowerCase();
        return (
          ref.includes(q) ||
          lane.includes(q) ||
          client.includes(q) ||
          driver.includes(q)
        );
      })
      .slice(0, 50)
      .map((t) => {
        const pickup = (t.pickup_area ?? "").trim();
        const drop = (t.drop_location ?? "").trim();
        const meta = txByTrip.get(String(t.id).trim().toLowerCase()) ?? {
          paid: 0,
          expense: 0,
          count: 0,
          lastTxn: null,
        };
        const supplierRate = Number(t.supplier_rate ?? 0);
        const cost = supplierRate > 0 ? supplierRate : meta.expense;
        const paid = meta.paid;
        const due = Math.max(0, cost - paid);
        const rawDriver = (t.driver_display_name ?? "").trim();
        const driverName =
          !rawDriver || /^driver$/i.test(rawDriver) ? "—" : rawDriver;
        const clientName = (t.client_name ?? "").trim() || "—";
        const vehicle = (t.vehicle_display_number ?? "").trim();
        return {
          trip: t,
          missionId: getTripOperationalDisplay({
            trip_number: t.trip_number ?? null,
          }),
          route: pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "—",
          clientName,
          driverName,
          vehicle,
          cost,
          paid,
          due,
          txnCount: meta.count,
          lastTxn: meta.lastTxn,
        };
      });
  }, [scopedTrips, scopedTx, tableSearch]);

  const pricing = useMemo(
    () => computeSupplierPricingStability(scopedTrips, { topLanes: 5 }),
    [scopedTrips],
  );

  const insights = useMemo(
    () => deriveSupplierInsights(monthly, kpis, operations, pricing, financial),
    [monthly, kpis, operations, pricing, financial],
  );

  const healthBars = score
    ? [
        { label: "Completion", percent: score.completionScore },
        { label: "On-time", percent: score.onTimeScore, color: Theme.positive },
        {
          label: "Cancellation",
          percent: score.cancellationScore,
          color: score.cancellationScore < 50 ? Theme.negative : Theme.primary,
        },
        { label: "Availability", percent: score.availabilityScore },
        { label: "Pricing", percent: score.pricingScore },
      ]
    : [];

  const clearFilters = () => {
    setLaneFilter(null);
    setLoadTypeFilter(null);
    setAgingFilter(null);
    setPartyFilter(null);
    setMonthKey(null);
    setTableSearch("");
  };

  const filtersActive = Boolean(
    laneFilter ||
      loadTypeFilter ||
      agingFilter ||
      partyFilter ||
      monthKey ||
      tableSearch.trim(),
  );

  const setDateRangeAndResetMonth = (range: SupplierAnalyticsDateRange) => {
    setDateRange(range);
    setMonthKey(null);
  };

  const periodFilters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={
        compact ? supplierStyles.mobileFilterScroll : styles.tagWrap
      }
    >
      {DATE_RANGES.map((range) => (
        <FilterChip
          key={range.id}
          label={range.label}
          active={dateRange === range.id}
          compact={compact}
          onPress={() => setDateRangeAndResetMonth(range.id)}
        />
      ))}
    </ScrollView>
  );

  const laneFilters =
    lanes.length > 0 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={
          compact ? supplierStyles.mobileFilterScroll : styles.tagWrap
        }
      >
        {lanes.map((l) => (
          <FilterChip
            key={l.id}
            label={laneChipLabel(l.label)}
            active={laneFilter === l.label}
            compact={compact}
            onPress={() =>
              setLaneFilter((prev) => (prev === l.label ? null : l.label))
            }
          />
        ))}
      </ScrollView>
    ) : null;

  const kpiRow = (
    <View style={compact ? supplierStyles.kpiGridMobile : styles.salesKpiRow}>
      <KpiCard
        compact={compact}
        label="Total cost"
        value={formatINRChip(financial.payable)}
        sub={`Paid ${formatINRChip(financial.paid)} · Due ${formatINRChip(financial.outstanding)}`}
        lottie={
          <ClientAnalyticsKpiLottie
            source={SUPPLIER_ANALYTICS_LOTTIE.cost}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Margin contribution"
        value={formatINRChip(financial.marginContribution)}
        sub={`${financial.marginContributionPct.toFixed(1)}% on revenue handled`}
        valueColor={
          financial.marginContribution >= 0 ? Theme.positive : Theme.negative
        }
        lottie={
          <ClientAnalyticsKpiLottie
            source={SUPPLIER_ANALYTICS_LOTTIE.margin}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Settlement rate"
        value={`${settlementPct}%`}
        sub="Paid vs total payable"
        valueColor={
          settlementPct >= 80
            ? Theme.positive
            : settlementPct >= 50
              ? Theme.warning
              : Theme.negative
        }
        lottie={
          <ClientAnalyticsKpiLottie
            source={SUPPLIER_ANALYTICS_LOTTIE.settlement}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Trips executed"
        value={String(operations.tripsCompleted)}
        sub={`${operations.onTimePct}% on-time · ${operations.completionPct.toFixed(0)}% completion`}
        lottie={
          <ClientAnalyticsKpiLottie
            source={SUPPLIER_ANALYTICS_LOTTIE.trips}
            size={34}
            renderScale={1.35}
          />
        }
      />
    </View>
  );

  const healthBody = score ? (
    <>
      <View style={supplierStyles.healthScoreRow}>
        <Text
          style={[
            supplierStyles.healthScore,
            compact && supplierStyles.healthScoreCompact,
            score.level === "critical" || score.level === "warning"
              ? { color: Theme.negative }
              : score.level === "good" || score.level === "excellent"
                ? { color: Theme.positive }
                : { color: Theme.warning },
          ]}
        >
          {Math.round(score.score)}
        </Text>
        <Text
          style={[
            supplierStyles.healthScoreMax,
            compact && supplierStyles.healthScoreMaxCompact,
          ]}
        >
          / 100
        </Text>
      </View>
      <Text style={styles.salesWidgetSub} numberOfLines={1}>
        {score.breakdown.tripsTotal} trips · last 6 months
      </Text>
      {healthBars.map((bar) => (
        <MetricHover
          key={bar.label}
          title={bar.label}
          rows={[{ label: "Score", value: `${Math.round(bar.percent)} / 100` }]}
        >
          <View style={supplierStyles.healthBarRow}>
            <Text
              style={[
                supplierStyles.healthBarLabel,
                compact && supplierStyles.healthBarLabelCompact,
              ]}
              numberOfLines={1}
            >
              {bar.label}
            </Text>
            <View style={supplierStyles.healthBarTrack}>
              <View
                style={[
                  supplierStyles.healthBarFill,
                  {
                    width: `${Math.max(0, Math.min(100, bar.percent))}%`,
                    backgroundColor:
                      bar.color ??
                      (bar.percent < 40 ? Theme.warning : METRONIC.link),
                  },
                ]}
              />
            </View>
            <Text style={supplierStyles.healthBarValue}>{Math.round(bar.percent)}</Text>
          </View>
        </MetricHover>
      ))}
    </>
  ) : (
    <Text style={styles.salesEmptySide}>
      Not enough trip history for a reliability score.
    </Text>
  );

  const healthCard = !supplierId ? (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? supplierStyles.desktopQuadInner : undefined}
      title="Supplier contribution"
      subtitle="Share of payable by supplier"
    >
      <View style={[styles.salesWidgetDonutBody, supplierStyles.desktopQuadChartBody]}>
        <NetworkDesktopSalesDonut
          slices={contributionSlices}
          stacked
          activeLabel={partyFilter}
          onSelectLabel={setPartyFilter}
          emptyMessage="No supplier spend yet."
        />
      </View>
    </ChartShell>
  ) : (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPadTight,
        compact && supplierStyles.healthCardMobile,
        !compact && supplierStyles.desktopQuadInner,
      ]}
    >
      <View style={supplierStyles.healthHeader}>
        <ClientAnalyticsKpiLottie
          source={SUPPLIER_ANALYTICS_LOTTIE.reliability}
          size={compact ? 32 : 28}
        />
        <Text style={styles.salesCardTitle} numberOfLines={1}>
          Reliability score
        </Text>
      </View>
      {compact ? (
        healthBody
      ) : (
        <ScrollView
          style={supplierStyles.desktopQuadScroll}
          contentContainerStyle={supplierStyles.desktopQuadScrollContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {healthBody}
        </ScrollView>
      )}
    </View>
  );

  const payableTrendCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesWidgetTrend : undefined}
      title="Payable trend"
      subtitle="Supplier cost by month · tap to filter trips"
    >
      <View
        style={styles.salesWidgetChartBody}
        onLayout={(e) => {
          const w = Math.floor(e.nativeEvent.layout.width);
          if (w > 0 && w !== trendChartWidth) setTrendChartWidth(w);
        }}
      >
        <NetworkDesktopSalesLineChart
          data={trend}
          width={trendChartWidth}
          height={compact ? 148 : 132}
          activeMonthKey={monthKey}
          onSelectMonth={handleSelectMonth}
          color={METRONIC.link}
        />
      </View>
    </ChartShell>
  );

  const laneMixCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesWidgetDonut : undefined}
      title="Lane mix"
    >
      <View style={styles.salesWidgetDonutBody}>
        <NetworkDesktopSalesDonut
          slices={laneSlices}
          activeLabel={laneFilter ? laneChipLabel(laneFilter) : null}
          onSelectLabel={(label) => {
            const match = lanes.find((l) => laneChipLabel(l.label) === label);
            setLaneFilter(match ? match.label : null);
          }}
          emptyMessage="No lane trips yet."
        />
      </View>
    </ChartShell>
  );

  const loadTypesCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesWidgetDonut : undefined}
      title="Load types"
    >
      <View style={styles.salesWidgetDonutBody}>
        <NetworkDesktopSalesDonut
          slices={loadSlices}
          activeLabel={loadTypeFilter}
          onSelectLabel={setLoadTypeFilter}
          emptyMessage="No load-type data yet."
        />
      </View>
    </ChartShell>
  );

  const agingCard = (
    <ChartShell
      compact={compact}
      contained={!compact}
      shellStyle={!compact ? styles.salesBarOrigin : undefined}
      title="Payable aging"
    >
      <View style={[styles.salesWidgetDonutBody, supplierStyles.desktopQuadChartBody]}>
        <NetworkDesktopSalesDonut
          slices={agingSlices}
          stacked
          activeLabel={agingFilter}
          onSelectLabel={setAgingFilter}
          emptyMessage="No outstanding payable aging."
        />
      </View>
    </ChartShell>
  );

  const settlementsCard = (
    <ChartShell
      compact={compact}
      contained={!compact}
      shellStyle={!compact ? styles.salesBarOrigin : undefined}
      title="Settlements"
    >
      <View
        style={supplierStyles.desktopQuadChartBody}
        onLayout={(e) => {
          const w = Math.floor(e.nativeEvent.layout.width);
          if (w > 0 && w !== collectionsChartWidth) setCollectionsChartWidth(w);
        }}
      >
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={{ width: "100%" }}
        >
          <TrendBarChart
            data={toPayableLinePoints(monthly)}
            width={Math.max(
              180,
              Math.max(collectionsChartWidth, monthly.length * 36),
            )}
            height={compact ? 132 : 168}
            primaryField="revenue"
            secondaryField="expense"
            primaryColor={Theme.chartSeries2}
            secondaryColor={Theme.chartSeries4}
            activeIndex={
              monthKey
                ? monthly.findIndex((m) => m.monthKey === monthKey)
                : null
            }
            onSelectIndex={(index) => {
              if (index == null) {
                handleSelectMonth(null);
                return;
              }
              handleSelectMonth(monthly[index]?.monthKey ?? null);
            }}
          />
        </ScrollView>
      </View>
    </ChartShell>
  );

  const supplierSummaryCard = supplier ? (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPad,
        compact && supplierStyles.sectionCardMobile,
      ]}
    >
      <View style={styles.salesContributorRow}>
        <PartyAvatar
          name={supplier.name ?? "Supplier"}
          initialsColorSeed={supplier.id}
          avatarUrl={supplier.avatar_url}
          avatarSeed={supplier.avatar_seed}
          entityType="supplier"
          size={compact ? 40 : 36}
        />
        <View style={styles.salesContributorTextCol}>
          <Text style={styles.salesContributorName} numberOfLines={2}>
            {supplier.name}
          </Text>
          <Text style={styles.salesContributorMeta}>
            {operations.tripsTotal} trips · {settlementPct}% settled
          </Text>
        </View>
      </View>
      {primaryBadge ? (
        <View style={supplierStyles.healthBadge}>
          <Text style={supplierStyles.healthBadgeText}>{primaryBadge}</Text>
        </View>
      ) : null}
    </View>
  ) : null;

  const insightsBlock =
    insights.length > 0 ? (
      <View
        style={[
          styles.salesCard,
          styles.salesCardPad,
          supplierStyles.insightsCard,
          !compact && supplierStyles.insightsCardDesktop,
          compact && supplierStyles.sectionCardMobile,
        ]}
      >
        <Text style={styles.cardTitle}>Insights</Text>
        {insights.map((item, i) => (
          <ClientAnalyticsInsightRow
            key={`insight-${i}`}
            message={item.message}
            tone={item.tone}
          />
        ))}
      </View>
    ) : null;

  const paidByTrip = useMemo(() => {
    const map = new Map<string, number>();
    const tripIds = new Set(scopedTrips.map((t) => t.id));
    for (const tx of scopedTx) {
      if (!tx.trip_id || !tripIds.has(tx.trip_id)) continue;
      const amt = Number(tx.amount_out ?? 0);
      if (amt <= 0) continue;
      map.set(tx.trip_id, (map.get(tx.trip_id) ?? 0) + amt);
    }
    return map;
  }, [scopedTrips, scopedTx]);

  const tripsBlock = compact ? (
    <View style={supplierStyles.tripsSectionMobile}>
      <View style={supplierStyles.sectionCardMobile}>
        <Text style={styles.salesCardTitle}>Trips</Text>
        <Text style={styles.salesTripTableSub}>
          {filtersActive
            ? "Filtered by period, lane, or month"
            : "All supplier trips in period"}
        </Text>
        <View style={supplierStyles.tripsSearchMobile}>
          <Search size={16} color={METRONIC.muted} />
          <TextInput
            style={supplierStyles.tripsSearchInput}
            placeholder="Search trips, lanes…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={setTableSearch}
          />
        </View>
      </View>

      {tableRows.length === 0 ? (
        <View style={supplierStyles.tripsEmpty}>
          <ClientAnalyticsKpiLottie
            source={SUPPLIER_ANALYTICS_LOTTIE.trips}
            size={72}
          />
          <Text style={supplierStyles.tripsEmptyText}>No trips match filters.</Text>
        </View>
      ) : (
        <View style={supplierStyles.tripsListMobile}>
          {tableRows.map((row) => {
            const paid = paidByTrip.get(row.id) ?? 0;
            const due = Math.max(0, row.cost - paid);
            return (
              <SupplierAnalyticsMobileTripCard
                key={row.id}
                row={row}
                paid={paid}
                due={due}
              />
            );
          })}
        </View>
      )}
    </View>
  ) : (
    <View style={[styles.salesCard, styles.salesTableCard, supplierStyles.partyTableCard]}>
      <View style={supplierStyles.partyTableToolbar}>
        <View style={styles.salesTripTableTitleCol}>
          <Text style={styles.salesCardTitle}>Trips</Text>
          <Text style={styles.salesTripTableSub}>
            {filtersActive
              ? "Filtered by period, lane, or month"
              : "All supplier trips in period"}
          </Text>
        </View>
        <View style={supplierStyles.partyTableSearch}>
          <Search size={14} color={METRONIC.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search trips, lanes…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={setTableSearch}
          />
        </View>
      </View>

      <View style={supplierStyles.partyTableScroll}>
        <View style={supplierStyles.partyTableInner}>
          <View style={[supplierStyles.partyTableHead, supplierStyles.partyTableGrid8]}>
            <View style={supplierStyles.partyTripCol}>
              <Text style={supplierStyles.partyTh}>Trip</Text>
            </View>
            <View style={supplierStyles.partyPartyCol}>
              <Text style={supplierStyles.partyTh}>Client</Text>
            </View>
            <View style={supplierStyles.partyDriverCol}>
              <Text style={supplierStyles.partyTh}>Driver</Text>
            </View>
            <View style={supplierStyles.partyAmtCol}>
              <Text style={[supplierStyles.partyTh, supplierStyles.partyThRight]}>
                Cost
              </Text>
            </View>
            <View style={supplierStyles.partyAmtCol}>
              <Text style={[supplierStyles.partyTh, supplierStyles.partyThRight]}>
                Paid
              </Text>
            </View>
            <View style={supplierStyles.partyAmtCol}>
              <Text style={[supplierStyles.partyTh, supplierStyles.partyThRight]}>
                Due
              </Text>
            </View>
            <View style={supplierStyles.partyTxnCol}>
              <Text style={[supplierStyles.partyTh, supplierStyles.partyThRight]}>
                Txns
              </Text>
            </View>
            <View style={supplierStyles.partyLastCol}>
              <Text style={[supplierStyles.partyTh, supplierStyles.partyThRight]}>
                Last Txn
              </Text>
            </View>
          </View>

          {partyDetailRows.length === 0 ? (
            <View style={supplierStyles.tripsEmpty}>
              <ClientAnalyticsKpiLottie
                source={SUPPLIER_ANALYTICS_LOTTIE.trips}
                size={72}
              />
              <Text style={supplierStyles.tripsEmptyText}>
                No trips match filters.
              </Text>
            </View>
          ) : (
            partyDetailRows.map((row) => {
              const tripDateIso = row.trip.pickup_date ?? row.trip.created_at;
              return (
                <Pressable
                  key={row.trip.id}
                  style={(state: HoverPressState) => [
                    supplierStyles.partyTableRow,
                    supplierStyles.partyTableGrid8,
                    WEB_POINTER,
                    WEB_TRANSITION,
                    isHovered(state) && hoverRowWash,
                  ]}
                  onPress={() =>
                    router.push(
                      `/trip/${row.trip.id}?entryContext=supplier` as const,
                    )
                  }
                >
                  <View style={supplierStyles.partyTripCol}>
                    <View style={supplierStyles.partyTripIdRow}>
                      <Text
                        style={supplierStyles.partyTripId}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {row.missionId}
                      </Text>
                      <Text style={supplierStyles.partyTripSep}>·</Text>
                      <Text style={supplierStyles.partyTripDate} numberOfLines={1}>
                        {formatTripTableDate(tripDateIso)}
                      </Text>
                    </View>
                    <Text style={supplierStyles.partyRoute} numberOfLines={2}>
                      {row.route}
                    </Text>
                  </View>
                  <View style={supplierStyles.partyPartyCol}>
                    <View style={supplierStyles.partyAvatarRow}>
                      <PartyAvatar
                        name={row.clientName}
                        entityType="client"
                        size={28}
                      />
                      <View style={supplierStyles.partyTextStack}>
                        <Text style={supplierStyles.partyName} numberOfLines={1}>
                          {row.clientName}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={supplierStyles.partyDriverCol}>
                    <View style={supplierStyles.partyAvatarRow}>
                      <PartyAvatar
                        name={row.driverName}
                        entityType="driver"
                        size={28}
                      />
                      <View style={supplierStyles.partyTextStack}>
                        <Text style={supplierStyles.partyName} numberOfLines={1}>
                          {row.driverName}
                        </Text>
                        {row.vehicle ? (
                          <Text style={supplierStyles.partyHint} numberOfLines={1}>
                            {row.vehicle}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  <View style={supplierStyles.partyAmtCol}>
                    <Text style={supplierStyles.partyAmt} numberOfLines={1}>
                      {formatINR(row.cost)}
                    </Text>
                  </View>
                  <View style={supplierStyles.partyAmtCol}>
                    <Text
                      style={[supplierStyles.partyAmt, supplierStyles.partyAmtIn]}
                      numberOfLines={1}
                    >
                      {formatINR(row.paid)}
                    </Text>
                  </View>
                  <View style={supplierStyles.partyAmtCol}>
                    <Text
                      style={[
                        supplierStyles.partyAmt,
                        row.due > 0
                          ? supplierStyles.partyAmtOut
                          : supplierStyles.partyAmtMuted,
                      ]}
                      numberOfLines={1}
                    >
                      {formatINR(row.due)}
                    </Text>
                  </View>
                  <View style={supplierStyles.partyTxnCol}>
                    <Text style={supplierStyles.partyTxn} numberOfLines={1}>
                      {row.txnCount}
                    </Text>
                  </View>
                  <View style={supplierStyles.partyLastCol}>
                    <Text style={supplierStyles.partyAmtMuted} numberOfLines={1}>
                      {row.lastTxn ? formatLedgerDate(row.lastTxn) : "—"}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </View>
    </View>
  );

  if (compact) {
    return (
      <View style={[styles.salesBody, layout.salesBody]}>
        {!embedded ? (
          <View style={supplierStyles.pageIntroCompact}>
            <Text style={[supplierStyles.pageTitle, supplierStyles.pageTitleCompact]}>
              Finance analytics
            </Text>
            <Text style={[supplierStyles.pageSub, supplierStyles.pageSubCompact]}>
              {supplier?.name ?? "Payable, settlement, and trip performance"}
            </Text>
          </View>
        ) : null}

        <View style={supplierStyles.mobileToolbar}>
          {periodFilters}
          {laneFilters}
          {filtersActive ? (
            <Pressable onPress={clearFilters} style={supplierStyles.mobileClearBtn}>
              <Text style={supplierStyles.mobileClearBtnText}>Clear all filters</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={supplierStyles.mobileStack}>
          {supplierSummaryCard ? (
            <View style={supplierStyles.mobileSection}>{supplierSummaryCard}</View>
          ) : null}

          <View style={supplierStyles.mobileSection}>{kpiRow}</View>

          <View style={supplierStyles.mobileSection}>
            <View style={supplierStyles.chartStackMobile}>
              {payableTrendCard}
              {laneMixCard}
              {loadTypesCard}
            </View>
          </View>

          <View style={supplierStyles.mobileSection}>{healthCard}</View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={supplierStyles.carousel}
          >
            <View style={[supplierStyles.carouselCard, { width: carouselCardWidth }]}>
              <View style={supplierStyles.carouselCardInner}>{agingCard}</View>
            </View>
            <View style={[supplierStyles.carouselCard, { width: carouselCardWidth }]}>
              <View style={supplierStyles.carouselCardInner}>{settlementsCard}</View>
            </View>
          </ScrollView>

          {tripsBlock}
          {insightsBlock ? (
            <View style={supplierStyles.mobileSection}>{insightsBlock}</View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.salesBody, supplierStyles.bodyDesktop]}>
      <View style={supplierStyles.desktopMainCol}>
        {kpiRow}
        <View style={styles.salesWidgetRow}>
          {payableTrendCard}
          {laneMixCard}
          {loadTypesCard}
        </View>
        <View style={supplierStyles.desktopQuadRow}>
          {healthCard}
          {agingCard}
          {settlementsCard}
        </View>
        {tripsBlock}
      </View>
    </View>
  );
}
