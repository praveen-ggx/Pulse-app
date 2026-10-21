/**
 * Vehicle finance analytics — responsive Metronic BI (matches supplier dashboard).
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
  computeVehiclePerformanceScore,
  deriveVehicleBadges,
  type VehiclePerformanceScore,
} from "@/features/analytics";
import { ClientAnalyticsInsightRow } from "@/features/clients/components/analytics/ClientAnalyticsInsightRow";
import { ClientAnalyticsKpiLottie } from "@/features/clients/components/analytics/ClientAnalyticsKpiLottie";
import {
  computePartyContribution,
  tripVehicleLabel,
} from "@/features/clients/components/analytics/clientAnalyticsUtils";
import { clientFinanceAnalyticsStyles as styles } from "@/features/clients/components/analytics/clientFinanceAnalytics.styles";
import type { LedgerRow } from "@/features/finance";
import { NetworkDesktopSalesDonut } from "@/features/network/components/desktop/NetworkDesktopSalesDonut";
import { NetworkDesktopSalesLineChart } from "@/features/network/components/desktop/NetworkDesktopSalesLineChart";
import {
  METRONIC,
  networkDesktopHubStyles as hubStyles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type {
  SalesSlice,
  SalesTripTableRow,
  SalesTrendPoint,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { VEHICLE_ANALYTICS_LOTTIE } from "@/features/vehicles/components/analytics/vehicleAnalyticsAssets";
import { VehicleAnalyticsMobileTripCard } from "@/features/vehicles/components/analytics/VehicleAnalyticsMobileTripCard";
import type { MissionRow } from "@/features/vehicles/components/analytics/analyticsUtils";
import {
  computeVehicleExpenseBuckets,
  computeVehicleFinancialMetrics,
  computeVehicleLaneBreakdown,
  computeVehicleLoadTypeBreakdown,
  computeVehicleMonthlyTrend,
  computeVehicleOperationalMetrics,
  deriveVehicleInsights,
  filterTripsByDateRange,
  filterVehicleRowsByDateRange,
  type VehicleAnalyticsDateRange,
  type VehicleMonthlyTrendPoint,
} from "@/features/vehicles/components/analytics/vehicleFinanceAnalyticsUtils";
import { formatINR, formatINRChip, formatLedgerDate, formatTripTableDate } from "@/lib/format";
import { useVehiclePerformanceScoreQuery } from "@/lib/queries/useAnalyticsQueries";
import { useRouter } from "expo-router";
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

type Props = {
  vehicle: VehicleRow | null;
  missionRows: MissionRow[];
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
  embedded?: boolean;
};

const DATE_RANGES: { id: VehicleAnalyticsDateRange; label: string }[] = [
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

function laneChipLabel(lane: string): string {
  if (lane.length <= 24) return lane;
  return `${lane.slice(0, 22)}…`;
}

function laneFromTrip(t: TripRow): string {
  const pickup = (t.pickup_area ?? "").trim();
  const drop = (t.drop_location ?? "").trim();
  return pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "Unspecified lane";
}

function badgeLabel(b: string): string {
  switch (b) {
    case "top_earner":
      return "Top earner";
    case "high_risk":
      return "High risk";
    case "most_utilized":
      return "Most utilized";
    case "underutilized":
      return "Underutilized";
    case "cost_efficient":
      return "Cost efficient";
    case "expensive":
      return "High cost";
    case "consistent":
      return "Consistent";
    default:
      return b.replace(/_/g, " ");
  }
}

function toTrendPoints(months: readonly VehicleMonthlyTrendPoint[]): SalesTrendPoint[] {
  return months.map((m) => ({
    monthKey: m.monthKey,
    label: m.label,
    trips: m.trips,
    revenue: m.revenue,
  }));
}

function toProfitLinePoints(months: readonly VehicleMonthlyTrendPoint[]): TrendPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.revenue,
    expense: m.expense,
    profit: m.profit,
    margin: m.marginPct,
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
        style={[styles.mobileFilterChip, active && styles.mobileFilterChipOn]}
      >
        <Text
          style={[
            styles.mobileFilterChipText,
            active && styles.mobileFilterChipTextOn,
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
      style={[hubStyles.salesFilterChip, active && hubStyles.salesFilterChipOn]}
    >
      <Text
        style={[
          hubStyles.salesFilterChipText,
          active && hubStyles.salesFilterChipTextOn,
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
          hubStyles.salesKpiCard,
          styles.kpiCardElegant,
          compact && styles.kpiCardMobile,
          compact && (solo || wide) && styles.kpiCardMobileWide,
          compact && solo && styles.kpiCardMobileSolo,
        ]}
      >
        <View style={styles.kpiIllustrWell}>{lottie}</View>
        <View style={styles.kpiCopy}>
          <Text style={[hubStyles.salesKpiLabel, compact && styles.kpiLabelMobile]}>
            {label}
          </Text>
          <Text style={[hubStyles.salesKpiValue, valueColor ? { color: valueColor } : null]}>
            {value}
          </Text>
          {sub ? (
            <Text
              style={[hubStyles.salesKpiSub, compact && styles.kpiSubMobile]}
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
        hubStyles.salesCard,
        hubStyles.salesCardPadTight,
        compact && styles.chartCardMobile,
        contained && styles.desktopQuadInner,
        shellStyle,
      ]}
    >
      <Text style={hubStyles.salesCardTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={hubStyles.salesWidgetSub} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      {contained ? (
        <ScrollView
          style={styles.desktopQuadScroll}
          contentContainerStyle={styles.desktopQuadScrollContent}
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

export function VehicleFinanceAnalyticsDashboard({
  vehicle,
  missionRows,
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

  const [dateRange, setDateRange] = useState<VehicleAnalyticsDateRange>("12m");
  const [laneFilter, setLaneFilter] = useState<string | null>(null);
  const [partyFilter, setPartyFilter] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [trendChartWidth, setTrendChartWidth] = useState(compact ? width - 48 : 320);
  const [collectionsChartWidth, setCollectionsChartWidth] = useState(
    compact ? carouselCardWidth - 24 : 200,
  );

  const vehicleId = vehicle?.id ?? null;
  const vehicleLabel = vehicle?.vehicle_number?.trim() || "Vehicle";

  const periodMissionRows = useMemo(() => {
    let list = filterVehicleRowsByDateRange(missionRows, dateRange);
    if (laneFilter) {
      list = list.filter((r) => laneFromTrip(r.trip) === laneFilter);
    }
    return list;
  }, [missionRows, dateRange, laneFilter]);

  const scopedMissionRows = useMemo(() => {
    let list = periodMissionRows;
    if (monthKey) {
      list = list.filter((r) => {
        const d = tripDate(r.trip);
        if (!d) return false;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === monthKey;
      });
    }
    if (partyFilter) {
      list = list.filter((r) => {
        const label = tripVehicleLabel(r.trip);
        return partyFilter === "Others"
          ? label === "Unassigned" || !label
          : label === partyFilter;
      });
    }
    return list;
  }, [periodMissionRows, monthKey, partyFilter]);

  const periodTrips = useMemo(() => {
    let list = filterTripsByDateRange(trips, dateRange);
    if (laneFilter) list = list.filter((t) => laneFromTrip(t) === laneFilter);
    return list;
  }, [trips, dateRange, laneFilter]);

  const partyContribution = useMemo(
    () =>
      vehicleId
        ? []
        : computePartyContribution(periodTrips, {
            topN: 6,
            labelFor: tripVehicleLabel,
            valueFor: (t) => Math.max(0, Number(t.client_price ?? 0)),
          }),
    [periodTrips, vehicleId],
  );

  const scopedTrips = useMemo(() => {
    let list = periodTrips;
    if (monthKey) {
      list = list.filter((t) => {
        const d = tripDate(t);
        if (!d) return false;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === monthKey;
      });
    }
    if (partyFilter) {
      const top = new Set(
        partyContribution.filter((row) => row.id !== "others").map((row) => row.label),
      );
      list = list.filter((t) => {
        const label = tripVehicleLabel(t);
        if (partyFilter === "Others") return !top.has(label);
        return label === partyFilter;
      });
    }
    return list;
  }, [periodTrips, monthKey, partyFilter, partyContribution]);

  const { data: serverScore } = useVehiclePerformanceScoreQuery(orgId, vehicleId);

  const localScore: VehiclePerformanceScore | null = useMemo(() => {
    if (serverScore || !vehicleId) return null;
    return computeVehiclePerformanceScore(
      vehicleId,
      scopedTrips.map((t) => ({
        id: t.id,
        vehicle_id: t.vehicle_id,
        client_price: Number(t.client_price ?? 0),
        status: t.status,
        distance: Number(t.distance ?? 0),
        pickup_date: t.pickup_date,
        created_at: t.created_at,
      })),
      transactions.map((tx) => ({
        trip_id: tx.trip_id,
        amount_out: Number(tx.amount_out ?? 0),
        contact_type: tx.contact_type ?? null,
        transaction_date: tx.transaction_date ?? null,
        created_at: tx.created_at ?? null,
      })),
    );
  }, [serverScore, vehicleId, scopedTrips, transactions]);

  const score = serverScore ?? localScore;
  const badges = useMemo(() => deriveVehicleBadges(score), [score]);
  const primaryBadge = badges[0] ? badgeLabel(badges[0]) : undefined;

  const financial = useMemo(
    () => computeVehicleFinancialMetrics(scopedMissionRows),
    [scopedMissionRows],
  );
  const operations = useMemo(
    () => computeVehicleOperationalMetrics(scopedTrips),
    [scopedTrips],
  );
  const monthly = useMemo(
    () => computeVehicleMonthlyTrend(periodMissionRows, { monthsBack: 12 }),
    [periodMissionRows],
  );
  const lanes = useMemo(
    () => computeVehicleLaneBreakdown(scopedMissionRows, { topN: 6 }),
    [scopedMissionRows],
  );
  const loadTypes = useMemo(
    () => computeVehicleLoadTypeBreakdown(scopedTrips, { topN: 5 }),
    [scopedTrips],
  );
  const expenseBuckets = useMemo(
    () => computeVehicleExpenseBuckets(scopedMissionRows),
    [scopedMissionRows],
  );

  const trend = useMemo(() => toTrendPoints(monthly), [monthly]);

  const handleSelectMonth = (key: string | null) => {
    if (!key || key === monthKey) {
      setMonthKey(null);
      return;
    }
    const point = monthly.find((m) => m.monthKey === key);
    if (!point || (point.trips === 0 && point.revenue === 0)) {
      setMonthKey(null);
      return;
    }
    setMonthKey(key);
  };

  const laneSlices: SalesSlice[] = useMemo(
    () =>
      lanes.map((l, i) => ({
        label: laneChipLabel(l.label),
        value: l.revenue,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      })),
    [lanes],
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

  const loadSlices: SalesSlice[] = useMemo(
    () =>
      loadTypes.map((l, i) => ({
        label: l.label,
        value: l.revenue,
        color: DONUT_COLORS[(i + 2) % DONUT_COLORS.length],
      })),
    [loadTypes],
  );

  const expenseSlices: SalesSlice[] = useMemo(() => {
    const cats = expenseBuckets.categories;
    if (cats.length > 0) {
      return cats.map((c, i) => ({
        label: c.label,
        value: c.amount,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      }));
    }
    return [
      { label: "Fuel", value: expenseBuckets.bucket0_30, color: "#50CD89" },
      { label: "Toll", value: expenseBuckets.bucket31_60, color: "#FFC700" },
      { label: "Driver", value: expenseBuckets.bucket61_90, color: "#F1416C" },
      { label: "Other", value: expenseBuckets.bucket90Plus, color: "#7239EA" },
    ].filter((s) => s.value > 0);
  }, [expenseBuckets]);

  const missionByTripId = useMemo(() => {
    const map = new Map<string, MissionRow>();
    for (const row of scopedMissionRows) map.set(row.trip.id, row);
    return map;
  }, [scopedMissionRows]);

  const tableRows = useMemo((): SalesTripTableRow[] => {
    const q = tableSearch.trim().toLowerCase();
    return scopedMissionRows
      .filter((row) => {
        if (!q) return true;
        const t = row.trip;
        const ref = getTripOperationalDisplay({
          trip_number: t.trip_number ?? null,
        }).toLowerCase();
        const lane = `${t.pickup_area ?? ""} ${t.drop_location ?? ""}`.toLowerCase();
        return ref.includes(q) || lane.includes(q);
      })
      .slice(0, 50)
      .map((row) => {
        const t = row.trip;
        const lane = laneFromTrip(t);
        return {
          id: t.id,
          tripRef: getTripOperationalDisplay({ trip_number: t.trip_number ?? null }),
          lane,
          clientName: "—",
          supplierName: vehicleLabel,
          sales: row.sales,
          cost: row.expense,
          margin: row.profit,
          marginPct: row.margin,
          dateLabel: null,
          statusLabel: (t.status ?? "—").replace(/_/g, " ").toUpperCase(),
          trip: t,
        };
      });
  }, [scopedMissionRows, tableSearch, vehicleLabel]);

  const partyDetailRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    const txByTrip = new Map<
      string,
      { received: number; expense: number; count: number; lastTxn: string | null }
    >();
    for (const tx of transactions) {
      const key = String(tx.trip_id ?? "").trim().toLowerCase();
      if (!key) continue;
      const cur = txByTrip.get(key) ?? {
        received: 0,
        expense: 0,
        count: 0,
        lastTxn: null,
      };
      cur.received += Number(tx.amount_in ?? 0);
      cur.expense += Number(tx.amount_out ?? 0);
      cur.count += 1;
      const d = tx.transaction_date ?? tx.created_at ?? null;
      if (d && (!cur.lastTxn || String(d) > cur.lastTxn)) cur.lastTxn = String(d);
      txByTrip.set(key, cur);
    }

    return scopedMissionRows
      .filter((row) => {
        if (!q) return true;
        const t = row.trip;
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
      .map((row) => {
        const t = row.trip;
        const pickup = (t.pickup_area ?? "").trim();
        const drop = (t.drop_location ?? "").trim();
        const rawDriver = (t.driver_display_name ?? "").trim();
        const driverName =
          !rawDriver || /^driver$/i.test(rawDriver) ? "—" : rawDriver;
        const clientName = (t.client_name ?? "").trim() || "—";
        const meta = txByTrip.get(String(t.id).trim().toLowerCase()) ?? {
          received: 0,
          expense: 0,
          count: 0,
          lastTxn: null,
        };
        return {
          trip: t,
          missionId: getTripOperationalDisplay({
            trip_number: t.trip_number ?? null,
          }),
          route: pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "—",
          clientName,
          driverName,
          sales: row.sales,
          expense: row.expense,
          profit: row.profit,
          txnCount: meta.count,
          lastTxn: meta.lastTxn,
        };
      });
  }, [scopedMissionRows, transactions, tableSearch]);

  const insightLines = useMemo(
    () => deriveVehicleInsights(financial, operations),
    [financial, operations],
  );

  const healthBars = score
    ? [
        { label: "Profitability", percent: score.profitabilityScore },
        { label: "Utilization", percent: score.utilizationScore, color: Theme.positive },
        { label: "Completion", percent: score.completionScore },
        {
          label: "Cost efficiency",
          percent: score.costEfficiencyScore,
          color: score.costEfficiencyScore < 50 ? Theme.negative : Theme.primary,
        },
        { label: "Consistency", percent: score.consistencyScore },
      ]
    : [];

  const clearFilters = () => {
    setLaneFilter(null);
    setPartyFilter(null);
    setMonthKey(null);
    setTableSearch("");
  };

  const filtersActive = Boolean(laneFilter || partyFilter || monthKey || tableSearch.trim());

  const setDateRangeAndResetMonth = (range: VehicleAnalyticsDateRange) => {
    setDateRange(range);
    setMonthKey(null);
  };

  const periodFilters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={compact ? styles.mobileFilterScroll : hubStyles.tagWrap}
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
        contentContainerStyle={compact ? styles.mobileFilterScroll : hubStyles.tagWrap}
      >
        {lanes.map((l) => (
          <FilterChip
            key={l.id}
            label={laneChipLabel(l.label)}
            active={laneFilter === l.label}
            compact={compact}
            onPress={() => setLaneFilter((prev) => (prev === l.label ? null : l.label))}
          />
        ))}
      </ScrollView>
    ) : null;

  const kpiRow = (
    <View style={compact ? styles.kpiGridMobile : hubStyles.salesKpiRow}>
      <KpiCard
        compact={compact}
        label="Total revenue"
        value={formatINRChip(financial.revenue)}
        sub={`${formatINRChip(financial.revenuePerDay)}/day avg`}
        lottie={
          <ClientAnalyticsKpiLottie
            source={VEHICLE_ANALYTICS_LOTTIE.revenue}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Net profit"
        value={formatINRChip(financial.profit)}
        sub={`Expense ${formatINRChip(financial.expense)}`}
        valueColor={financial.profit >= 0 ? Theme.positive : Theme.negative}
        lottie={
          <ClientAnalyticsKpiLottie
            source={VEHICLE_ANALYTICS_LOTTIE.profit}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Net margin"
        value={`${financial.marginPct.toFixed(1)}%`}
        sub="Profit on revenue"
        valueColor={
          financial.marginPct >= 15
            ? Theme.positive
            : financial.marginPct >= 5
              ? Theme.warning
              : Theme.negative
        }
        lottie={
          <ClientAnalyticsKpiLottie
            source={VEHICLE_ANALYTICS_LOTTIE.profit}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Trips executed"
        value={String(operations.tripsCompleted)}
        sub={`${financial.utilizationPct}% utilization · ${operations.completionPct}% completion`}
        lottie={
          <ClientAnalyticsKpiLottie
            source={VEHICLE_ANALYTICS_LOTTIE.trips}
            size={34}
            renderScale={1.35}
          />
        }
      />
    </View>
  );

  const healthBody = score ? (
    <>
      <View style={styles.healthScoreRow}>
        <Text
          style={[
            styles.healthScore,
            compact && styles.healthScoreCompact,
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
          style={[styles.healthScoreMax, compact && styles.healthScoreMaxCompact]}
        >
          / 100
        </Text>
      </View>
      <Text style={hubStyles.salesWidgetSub} numberOfLines={1}>
        {score.breakdown.tripsTotal} trips · last 6 months
      </Text>
      {healthBars.map((bar) => (
        <MetricHover
          key={bar.label}
          title={bar.label}
          rows={[{ label: "Score", value: `${Math.round(bar.percent)} / 100` }]}
        >
          <View style={styles.healthBarRow}>
            <Text
              style={[styles.healthBarLabel, compact && styles.healthBarLabelCompact]}
              numberOfLines={1}
            >
              {bar.label}
            </Text>
            <View style={styles.healthBarTrack}>
              <View
                style={[
                  styles.healthBarFill,
                  {
                    width: `${Math.max(0, Math.min(100, bar.percent))}%`,
                    backgroundColor:
                      bar.color ??
                      (bar.percent < 40 ? Theme.warning : METRONIC.link),
                  },
                ]}
              />
            </View>
            <Text style={styles.healthBarValue}>{Math.round(bar.percent)}</Text>
          </View>
        </MetricHover>
      ))}
    </>
  ) : (
    <Text style={hubStyles.salesEmptySide}>
      Not enough trip history for a performance score.
    </Text>
  );

  const healthCard = !vehicleId ? (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.desktopQuadInner : undefined}
      title="Vehicle contribution"
      subtitle="Share of billed sales by vehicle"
    >
      <View style={[hubStyles.salesWidgetDonutBody, styles.desktopQuadChartBody]}>
        <NetworkDesktopSalesDonut
          slices={contributionSlices}
          stacked
          activeLabel={partyFilter}
          onSelectLabel={setPartyFilter}
          emptyMessage="No vehicle billing yet."
        />
      </View>
    </ChartShell>
  ) : (
    <View
      style={[
        hubStyles.salesCard,
        hubStyles.salesCardPadTight,
        compact && styles.healthCardMobile,
        !compact && styles.desktopQuadInner,
      ]}
    >
      <View style={styles.healthHeader}>
        <ClientAnalyticsKpiLottie
          source={VEHICLE_ANALYTICS_LOTTIE.performance}
          size={compact ? 32 : 28}
        />
        <Text style={hubStyles.salesCardTitle} numberOfLines={1}>
          Performance score
        </Text>
      </View>
      {compact ? (
        healthBody
      ) : (
        <ScrollView
          style={styles.desktopQuadScroll}
          contentContainerStyle={styles.desktopQuadScrollContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {healthBody}
        </ScrollView>
      )}
    </View>
  );

  const revenueTrendCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? hubStyles.salesWidgetTrend : undefined}
      title="Revenue trend"
      subtitle="Vehicle revenue by month · tap to filter trips"
    >
      <View
        style={hubStyles.salesWidgetChartBody}
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
      shellStyle={!compact ? hubStyles.salesWidgetDonut : undefined}
      title="Lane mix"
    >
      <View style={hubStyles.salesWidgetDonutBody}>
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
      shellStyle={!compact ? hubStyles.salesWidgetDonut : undefined}
      title="Load types"
    >
      <View style={hubStyles.salesWidgetDonutBody}>
        <NetworkDesktopSalesDonut
          slices={loadSlices}
          emptyMessage="No load-type data yet."
        />
      </View>
    </ChartShell>
  );

  const expenseBucketsCard = (
    <ChartShell
      compact={compact}
      contained={!compact}
      shellStyle={!compact ? hubStyles.salesBarOrigin : undefined}
      title="Expense buckets"
    >
      <View style={[hubStyles.salesWidgetDonutBody, styles.desktopQuadChartBody]}>
        <NetworkDesktopSalesDonut
          slices={expenseSlices}
          stacked
          emptyMessage="No expense data yet."
        />
      </View>
    </ChartShell>
  );

  const profitTrendCard = (
    <ChartShell
      compact={compact}
      contained={!compact}
      shellStyle={!compact ? hubStyles.salesBarOrigin : undefined}
      title="Profit trend"
    >
      <View
        style={styles.desktopQuadChartBody}
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
            data={toProfitLinePoints(monthly)}
            width={Math.max(
              180,
              Math.max(collectionsChartWidth, monthly.length * 36),
            )}
            height={compact ? 132 : 168}
            primaryField="revenue"
            secondaryField="expense"
            primaryColor={Theme.chartSeries2}
            secondaryColor={Theme.chartSeries4}
          />
        </ScrollView>
      </View>
    </ChartShell>
  );

  const vehicleSummaryCard = vehicle ? (
    <View
      style={[
        hubStyles.salesCard,
        hubStyles.salesCardPad,
        compact && styles.sectionCardMobile,
      ]}
    >
      <View style={hubStyles.salesContributorRow}>
        <PartyAvatar
          name={vehicleLabel}
          initialsColorSeed={vehicle.id}
          entityType="vehicle"
          size={compact ? 40 : 36}
        />
        <View style={hubStyles.salesContributorTextCol}>
          <Text style={hubStyles.salesContributorName} numberOfLines={2}>
            {vehicleLabel}
          </Text>
          <Text style={hubStyles.salesContributorMeta}>
            {operations.tripsTotal} trips · {financial.utilizationPct}% utilized
          </Text>
        </View>
      </View>
      {primaryBadge ? (
        <View style={styles.healthBadge}>
          <Text style={styles.healthBadgeText}>{primaryBadge}</Text>
        </View>
      ) : null}
    </View>
  ) : null;

  const insightsBlock =
    insightLines.length > 0 ? (
      <View
        style={[
          hubStyles.salesCard,
          hubStyles.salesCardPad,
          styles.insightsCard,
          !compact && styles.insightsCardDesktop,
          compact && styles.sectionCardMobile,
        ]}
      >
        <Text style={hubStyles.cardTitle}>Insights</Text>
        {insightLines.map((message, i) => (
          <ClientAnalyticsInsightRow key={`insight-${i}`} message={message} tone="neutral" />
        ))}
      </View>
    ) : null;

  const tripsBlock = compact ? (
    <View style={styles.tripsSectionMobile}>
      <View style={styles.sectionCardMobile}>
        <Text style={hubStyles.salesCardTitle}>Trips</Text>
        <Text style={hubStyles.salesTripTableSub}>
          {filtersActive
            ? "Filtered by period, lane, or month"
            : "All vehicle trips in period"}
        </Text>
        <View style={styles.tripsSearchMobile}>
          <Search size={16} color={METRONIC.muted} />
          <TextInput
            style={styles.tripsSearchInput}
            placeholder="Search trips, lanes…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={setTableSearch}
          />
        </View>
      </View>

      {tableRows.length === 0 ? (
        <View style={styles.tripsEmpty}>
          <ClientAnalyticsKpiLottie source={VEHICLE_ANALYTICS_LOTTIE.trips} size={72} />
          <Text style={styles.tripsEmptyText}>No trips match filters.</Text>
        </View>
      ) : (
        <View style={styles.tripsListMobile}>
          {tableRows.map((row) => {
            const mission = missionByTripId.get(row.id);
            return (
              <VehicleAnalyticsMobileTripCard
                key={row.id}
                row={row}
                revenue={mission?.sales ?? row.sales}
                expense={mission?.expense ?? row.cost}
                profit={mission?.profit ?? row.margin}
              />
            );
          })}
        </View>
      )}
    </View>
  ) : (
    <View style={[hubStyles.salesCard, hubStyles.salesTableCard, styles.partyTableCard]}>
      <View style={styles.partyTableToolbar}>
        <View style={hubStyles.salesTripTableTitleCol}>
          <Text style={hubStyles.salesCardTitle}>Trips</Text>
          <Text style={hubStyles.salesTripTableSub}>
            {filtersActive
              ? "Filtered by period, lane, or month"
              : "All vehicle trips in period"}
          </Text>
        </View>
        <View style={styles.partyTableSearch}>
          <Search size={14} color={METRONIC.muted} />
          <TextInput
            style={hubStyles.searchInput}
            placeholder="Search trips, lanes…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={setTableSearch}
          />
        </View>
      </View>

      <View style={styles.partyTableScroll}>
        <View style={styles.partyTableInner}>
          <View style={[styles.partyTableHead, styles.partyTableGrid8]}>
            <View style={styles.partyTripCol}>
              <Text style={styles.partyTh}>Trip</Text>
            </View>
            <View style={styles.partyPartyCol}>
              <Text style={styles.partyTh}>Client</Text>
            </View>
            <View style={styles.partyDriverCol}>
              <Text style={styles.partyTh}>Driver</Text>
            </View>
            <View style={styles.partyAmtCol}>
              <Text style={[styles.partyTh, styles.partyThRight]}>Revenue</Text>
            </View>
            <View style={styles.partyAmtCol}>
              <Text style={[styles.partyTh, styles.partyThRight]}>Expense</Text>
            </View>
            <View style={styles.partyAmtCol}>
              <Text style={[styles.partyTh, styles.partyThRight]}>Profit</Text>
            </View>
            <View style={styles.partyTxnCol}>
              <Text style={[styles.partyTh, styles.partyThRight]}>Txns</Text>
            </View>
            <View style={styles.partyLastCol}>
              <Text style={[styles.partyTh, styles.partyThRight]}>Last Txn</Text>
            </View>
          </View>

          {partyDetailRows.length === 0 ? (
            <View style={styles.tripsEmpty}>
              <ClientAnalyticsKpiLottie source={VEHICLE_ANALYTICS_LOTTIE.trips} size={72} />
              <Text style={styles.tripsEmptyText}>No trips match filters.</Text>
            </View>
          ) : (
            partyDetailRows.map((row) => {
              const tripDateIso = row.trip.pickup_date ?? row.trip.created_at;
              return (
                <Pressable
                  key={row.trip.id}
                  style={(state: HoverPressState) => [
                    styles.partyTableRow,
                    styles.partyTableGrid8,
                    WEB_POINTER,
                    WEB_TRANSITION,
                    isHovered(state) && hoverRowWash,
                  ]}
                  onPress={() =>
                    router.push(
                      `/trip/${row.trip.id}?entryContext=vehicle` as const,
                    )
                  }
                >
                  <View style={styles.partyTripCol}>
                    <View style={styles.partyTripIdRow}>
                      <Text
                        style={styles.partyTripId}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {row.missionId}
                      </Text>
                      <Text style={styles.partyTripSep}>·</Text>
                      <Text style={styles.partyTripDate} numberOfLines={1}>
                        {formatTripTableDate(tripDateIso)}
                      </Text>
                    </View>
                    <Text style={styles.partyRoute} numberOfLines={2}>
                      {row.route}
                    </Text>
                  </View>
                  <View style={styles.partyPartyCol}>
                    <View style={styles.partyAvatarRow}>
                      <PartyAvatar
                        name={row.clientName}
                        entityType="client"
                        size={28}
                      />
                      <View style={styles.partyTextStack}>
                        <Text style={styles.partyName} numberOfLines={1}>
                          {row.clientName}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.partyDriverCol}>
                    <View style={styles.partyAvatarRow}>
                      <PartyAvatar
                        name={row.driverName}
                        entityType="driver"
                        size={28}
                      />
                      <View style={styles.partyTextStack}>
                        <Text style={styles.partyName} numberOfLines={1}>
                          {row.driverName}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.partyAmtCol}>
                    <Text style={styles.partyAmt} numberOfLines={1}>
                      {formatINR(row.sales)}
                    </Text>
                  </View>
                  <View style={styles.partyAmtCol}>
                    <Text style={styles.partyAmt} numberOfLines={1}>
                      {formatINR(row.expense)}
                    </Text>
                  </View>
                  <View style={styles.partyAmtCol}>
                    <Text
                      style={[
                        styles.partyAmt,
                        row.profit >= 0 ? styles.partyAmtIn : styles.partyAmtOut,
                      ]}
                      numberOfLines={1}
                    >
                      {formatINR(row.profit)}
                    </Text>
                  </View>
                  <View style={styles.partyTxnCol}>
                    <Text style={styles.partyTxn} numberOfLines={1}>
                      {row.txnCount}
                    </Text>
                  </View>
                  <View style={styles.partyLastCol}>
                    <Text style={styles.partyAmtMuted} numberOfLines={1}>
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
      <View style={[hubStyles.salesBody, layout.salesBody]}>
        {!embedded ? (
          <View style={styles.pageIntroCompact}>
            <Text style={[styles.pageTitle, styles.pageTitleCompact]}>
              Finance analytics
            </Text>
            <Text style={[styles.pageSub, styles.pageSubCompact]}>
              {vehicleLabel} · revenue, cost, and utilization
            </Text>
          </View>
        ) : null}

        <View style={styles.mobileToolbar}>
          {periodFilters}
          {laneFilters}
          {filtersActive ? (
            <Pressable onPress={clearFilters} style={styles.mobileClearBtn}>
              <Text style={styles.mobileClearBtnText}>Clear all filters</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.mobileStack}>
          {vehicleSummaryCard ? (
            <View style={styles.mobileSection}>{vehicleSummaryCard}</View>
          ) : null}

          <View style={styles.mobileSection}>{kpiRow}</View>

          <View style={styles.mobileSection}>
            <View style={styles.chartStackMobile}>
              {revenueTrendCard}
              {laneMixCard}
              {loadTypesCard}
            </View>
          </View>

          <View style={styles.mobileSection}>
            <View style={styles.healthStackMobile}>{healthCard}</View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
          >
            <View style={[styles.carouselCard, { width: carouselCardWidth }]}>
              <View style={styles.carouselCardInner}>{expenseBucketsCard}</View>
            </View>
            <View style={[styles.carouselCard, { width: carouselCardWidth }]}>
              <View style={styles.carouselCardInner}>{profitTrendCard}</View>
            </View>
          </ScrollView>

          {tripsBlock}
          {insightsBlock ? <View style={styles.mobileSection}>{insightsBlock}</View> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[hubStyles.salesBody, styles.bodyDesktop]}>
      <View style={styles.desktopMainCol}>
        {kpiRow}
        <View style={hubStyles.salesWidgetRow}>
          {revenueTrendCard}
          {laneMixCard}
          {loadTypesCard}
        </View>
        <View style={styles.desktopQuadRow}>
          {healthCard}
          {expenseBucketsCard}
          {profitTrendCard}
        </View>
        {tripsBlock}
      </View>
    </View>
  );
}
