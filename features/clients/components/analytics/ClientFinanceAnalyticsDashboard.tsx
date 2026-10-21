/**
 * Client finance analytics — responsive Metronic BI (Connection sales style).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { MetricHover, TrendBarChart, type TrendPoint } from "@/components/analytics";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { CLIENT_ANALYTICS_LOTTIE } from "@/features/clients/components/analytics/clientAnalyticsAssets";
import { ClientAnalyticsInsightRow } from "@/features/clients/components/analytics/ClientAnalyticsInsightRow";
import { ClientAnalyticsKpiLottie } from "@/features/clients/components/analytics/ClientAnalyticsKpiLottie";
import { ClientAnalyticsMobileTripCard } from "@/features/clients/components/analytics/ClientAnalyticsMobileTripCard";
import { clientFinanceAnalyticsStyles as clientStyles } from "@/features/clients/components/analytics/clientFinanceAnalytics.styles";
import {
  computeClientKpiHeader,
  computeClientMonthlyTrend,
  computeClientOperationalMetrics,
  computeCustomerContribution,
  computeLaneBreakdown,
  computeLoadTypeBreakdown,
  computePaymentAging,
  applyPartyChartFilters,
  deriveClientInsights,
  type ClientMonthlyTrendPoint,
} from "@/features/clients/components/analytics/clientAnalyticsUtils";
import type { ClientRow } from "@/features/clients/services/clients.service";
import {
  computeCustomerHealthScore,
  deriveCustomerBadges,
  type CustomerHealthScore,
} from "@/features/analytics";
import type { LedgerRow } from "@/features/finance";
import { NetworkDesktopSalesDonut } from "@/features/network/components/desktop/NetworkDesktopSalesDonut";
import { NetworkDesktopSalesLineChart } from "@/features/network/components/desktop/NetworkDesktopSalesLineChart";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
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
import { isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { formatINR, formatINRChip, formatLedgerDate, formatTripTableDate } from "@/lib/format";
import { useRouter } from "expo-router";
import { useCustomerHealthScoreQuery } from "@/lib/queries/useAnalyticsQueries";
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

export type ClientAnalyticsDateRange = "3m" | "6m" | "12m" | "all";

type Props = {
  client: ClientRow | null;
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
  /** Full-screen route — header already shows party name; hide duplicate intro on mobile. */
  embedded?: boolean;
};

const DATE_RANGES: { id: ClientAnalyticsDateRange; label: string }[] = [
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
  range: ClientAnalyticsDateRange,
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
    case "premium":
      return "Premium client";
    case "high_risk":
      return "High risk";
    case "fast_paying":
      return "Fast paying";
    case "high_margin":
      return "High margin";
    case "strategic":
      return "Strategic account";
    case "growing":
      return "Growing";
    case "declining":
      return "Declining";
    default:
      return b.replace(/_/g, " ");
  }
}

function toTrendPoints(months: readonly ClientMonthlyTrendPoint[]): SalesTrendPoint[] {
  return months.map((m) => ({
    monthKey: m.monthKey,
    label: m.label,
    trips: m.trips,
    revenue: m.revenue,
  }));
}

function toRevenueLinePoints(
  months: readonly ClientMonthlyTrendPoint[],
): TrendPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.revenue,
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
          clientStyles.mobileFilterChip,
          active && clientStyles.mobileFilterChipOn,
        ]}
      >
        <Text
          style={[
            clientStyles.mobileFilterChipText,
            active && clientStyles.mobileFilterChipTextOn,
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
          clientStyles.kpiCardElegant,
          compact && clientStyles.kpiCardMobile,
          compact && (solo || wide) && clientStyles.kpiCardMobileWide,
          compact && solo && clientStyles.kpiCardMobileSolo,
        ]}
      >
        <View style={clientStyles.kpiIllustrWell}>{lottie}</View>
        <View style={clientStyles.kpiCopy}>
          <Text style={[styles.salesKpiLabel, compact && clientStyles.kpiLabelMobile]}>
            {label}
          </Text>
          <Text style={[styles.salesKpiValue, valueColor ? { color: valueColor } : null]}>
            {value}
          </Text>
          {sub ? (
            <Text
              style={[styles.salesKpiSub, compact && clientStyles.kpiSubMobile]}
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
  shellStyle?: object | object[];
  contained?: boolean;
}) {
  return (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPadTight,
        compact && clientStyles.chartCardMobile,
        contained && clientStyles.desktopQuadInner,
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
          style={clientStyles.desktopQuadScroll}
          contentContainerStyle={clientStyles.desktopQuadScrollContent}
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

export function ClientFinanceAnalyticsDashboard({
  client,
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

  const [dateRange, setDateRange] = useState<ClientAnalyticsDateRange>("12m");
  const [laneFilter, setLaneFilter] = useState<string | null>(null);
  const [loadTypeFilter, setLoadTypeFilter] = useState<string | null>(null);
  const [agingFilter, setAgingFilter] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [trendChartWidth, setTrendChartWidth] = useState(compact ? width - 48 : 320);
  const [collectionsChartWidth, setCollectionsChartWidth] = useState(
    compact ? carouselCardWidth - 24 : 200,
  );

  const clientId = client?.id ?? null;

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

  const customerContribution = useMemo(
    () => (clientId ? [] : computeCustomerContribution(rangeTrips, { topN: 6 })),
    [clientId, rangeTrips],
  );

  const chartFilters = {
    lane: laneFilter,
    monthKey,
    loadType: loadTypeFilter,
    agingLabel: agingFilter,
    clientLabel: clientFilter,
    otherClientLabels: new Set(
      customerContribution
        .filter((row) => row.id !== "others")
        .map((row) => row.label),
    ),
    agingMode: "receivable" as const,
  };

  const scopedTrips = useMemo(
    () => applyPartyChartFilters(rangeTrips, rangeTx, chartFilters),
    [rangeTrips, rangeTx, laneFilter, monthKey, loadTypeFilter, agingFilter, clientFilter, customerContribution],
  );

  const scopedTx = useMemo(() => {
    if (
      !laneFilter &&
      !monthKey &&
      !loadTypeFilter &&
      !agingFilter &&
      !clientFilter
    ) {
      return rangeTx;
    }
    const ids = new Set(scopedTrips.map((t) => t.id));
    return rangeTx.filter((tx) => {
      const id = String(tx.trip_id ?? "").trim();
      return Boolean(id && ids.has(id));
    });
  }, [
    agingFilter,
    clientFilter,
    laneFilter,
    loadTypeFilter,
    monthKey,
    rangeTx,
    scopedTrips,
  ]);

  const kpis = useMemo(
    () => computeClientKpiHeader(scopedTrips, scopedTx),
    [scopedTrips, scopedTx],
  );
  const monthly = useMemo(
    () =>
      computeClientMonthlyTrend(
        applyPartyChartFilters(rangeTrips, rangeTx, chartFilters, "month"),
        rangeTx,
        { monthsBack: 12 },
      ),
    [rangeTrips, rangeTx, laneFilter, loadTypeFilter, agingFilter, clientFilter, customerContribution],
  );
  const lanes = useMemo(
    () =>
      computeLaneBreakdown(
        applyPartyChartFilters(rangeTrips, rangeTx, chartFilters, "lane"),
        { topN: 6, windowMonths: 24 },
      ),
    [rangeTrips, rangeTx, monthKey, loadTypeFilter, agingFilter, clientFilter, customerContribution],
  );
  const loadTypes = useMemo(
    () =>
      computeLoadTypeBreakdown(
        applyPartyChartFilters(rangeTrips, rangeTx, chartFilters, "load"),
        { topN: 5, windowMonths: 24 },
      ),
    [rangeTrips, rangeTx, laneFilter, monthKey, agingFilter, clientFilter, customerContribution],
  );
  const aging = useMemo(
    () =>
      computePaymentAging(
        applyPartyChartFilters(rangeTrips, rangeTx, chartFilters, "aging"),
        rangeTx,
      ),
    [rangeTrips, rangeTx, laneFilter, monthKey, loadTypeFilter, clientFilter, customerContribution],
  );
  const operations = useMemo(
    () => computeClientOperationalMetrics(scopedTrips, scopedTx),
    [scopedTrips, scopedTx],
  );

  const { data: serverScore } = useCustomerHealthScoreQuery(orgId, clientId);

  const localScore: CustomerHealthScore | null = useMemo(() => {
    if (serverScore || !clientId) return null;
    return computeCustomerHealthScore(
      clientId,
      scopedTrips.map((t) => ({
        id: t.id,
        client_id: t.client_id,
        client_price: Number(t.client_price ?? 0),
        margin: Number(t.margin ?? 0),
        status: t.status,
        pickup_date: t.pickup_date,
        created_at: t.created_at,
      })),
      scopedTx.map((tx) => ({
        trip_id: tx.trip_id,
        amount_in: Number(tx.amount_in ?? 0),
        transaction_date: tx.transaction_date ?? null,
        created_at: tx.created_at ?? null,
      })),
    );
  }, [serverScore, clientId, scopedTrips, scopedTx]);

  const healthScore = serverScore ?? localScore;
  const badges = useMemo(() => deriveCustomerBadges(healthScore), [healthScore]);
  const primaryBadge = badges[0] ? badgeLabel(badges[0]) : undefined;

  const collectionPct = useMemo(() => {
    const billed = kpis.totalRevenue;
    const received = Math.max(0, billed - kpis.outstanding);
    return billed > 0 ? Math.min(100, Math.round((received / billed) * 100)) : 0;
  }, [kpis.outstanding, kpis.totalRevenue]);

  const collectedAmount = Math.max(0, kpis.totalRevenue - kpis.outstanding);
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

  const selectedMonthLabel =
    monthly.find((m) => m.monthKey === monthKey)?.label ?? null;

  const laneSlices: SalesSlice[] = useMemo(
    () =>
      lanes.map((l, i) => ({
        label: laneChipLabel(l.label),
        value: l.revenue,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      })),
    [lanes],
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

  const contributionSlices: SalesSlice[] = useMemo(
    () =>
      customerContribution.map((row, i) => ({
        label: row.label,
        value: row.revenue,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
        valueLabel: formatINRChip(row.revenue),
      })),
    [customerContribution],
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
        const sales = Number(t.client_price ?? 0);
        const pickup = (t.pickup_area ?? "").trim();
        const drop = (t.drop_location ?? "").trim();
        const lane =
          pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "—";
        return {
          id: t.id,
          tripRef: getTripOperationalDisplay({ trip_number: t.trip_number ?? null }),
          lane,
          clientName: client?.name ?? "—",
          supplierName: "—",
          sales,
          cost: 0,
          margin: Number(t.margin ?? 0),
          marginPct: sales > 0 ? Math.round((Number(t.margin ?? 0) / sales) * 100) : 0,
          dateLabel: null,
          statusLabel: (t.status ?? "—").replace(/_/g, " ").toUpperCase(),
          trip: t,
        };
      });
  }, [scopedTrips, tableSearch, client?.name]);

  const partyDetailRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    const txByTrip = new Map<
      string,
      { received: number; expense: number; count: number; lastTxn: string | null }
    >();
    for (const tx of scopedTx) {
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

    return scopedTrips
      .filter((t) => {
        if (!q) return true;
        const ref = getTripOperationalDisplay({
          trip_number: t.trip_number ?? null,
        }).toLowerCase();
        const lane = `${t.pickup_area ?? ""} ${t.drop_location ?? ""}`.toLowerCase();
        const supplier = (t.supplier_name ?? "").toLowerCase();
        const driver = (t.driver_display_name ?? "").toLowerCase();
        return (
          ref.includes(q) ||
          lane.includes(q) ||
          supplier.includes(q) ||
          driver.includes(q)
        );
      })
      .slice(0, 50)
      .map((t) => {
        const pickup = (t.pickup_area ?? "").trim();
        const drop = (t.drop_location ?? "").trim();
        const sales = Number(t.client_price ?? 0);
        const meta = txByTrip.get(String(t.id).trim().toLowerCase()) ?? {
          received: 0,
          expense: 0,
          count: 0,
          lastTxn: null,
        };
        const supplierName = (t.supplier_name ?? "").trim();
        const hasSupplier =
          !!t.supplier_id ||
          (!!supplierName &&
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              supplierName,
            ));
        const isAggregate = hasSupplier || isLoadBasedTrip(t);
        const supplierTitle = isAggregate
          ? supplierName || "Aggregate supplier"
          : "Asset / Own Vehicle";
        const supplierRate = Number(t.supplier_rate ?? 0);
        const cost = supplierRate > 0 ? supplierRate : meta.expense;
        const received = meta.received;
        const due = Math.max(0, sales - received);
        const pnl = sales - cost;
        const rawDriver = (t.driver_display_name ?? "").trim();
        const driverName =
          !rawDriver || /^driver$/i.test(rawDriver) ? "—" : rawDriver;
        return {
          trip: t,
          missionId: getTripOperationalDisplay({
            trip_number: t.trip_number ?? null,
          }),
          route: pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "—",
          sales,
          cost,
          pnl,
          received,
          due,
          txnCount: meta.count,
          lastTxn: meta.lastTxn,
          supplierTitle,
          isAggregate,
          driverName,
        };
      });
  }, [scopedTrips, scopedTx, tableSearch]);

  const insights = useMemo(
    () => deriveClientInsights(monthly, kpis, operations, aging),
    [monthly, kpis, operations, aging],
  );

  const healthBars = healthScore
    ? [
        { label: "Profitability", percent: healthScore.profitabilityScore },
        { label: "Payment", percent: healthScore.paymentScore },
        { label: "Operations", percent: healthScore.operationsScore, color: Theme.positive },
        { label: "Consistency", percent: healthScore.consistencyScore },
        { label: "Growth", percent: healthScore.growthScore },
      ]
    : [];

  const clearFilters = () => {
    setLaneFilter(null);
    setLoadTypeFilter(null);
    setAgingFilter(null);
    setClientFilter(null);
    setMonthKey(null);
    setTableSearch("");
  };

  const filtersActive = Boolean(
    laneFilter ||
      loadTypeFilter ||
      agingFilter ||
      clientFilter ||
      monthKey ||
      tableSearch.trim(),
  );

  const setDateRangeAndResetMonth = (range: ClientAnalyticsDateRange) => {
    setDateRange(range);
    setMonthKey(null);
  };

  const periodFilters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={
        compact ? clientStyles.mobileFilterScroll : styles.tagWrap
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
          compact ? clientStyles.mobileFilterScroll : styles.tagWrap
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
    <View style={compact ? clientStyles.kpiGridMobile : styles.salesKpiRow}>
      <KpiCard
        compact={compact}
        label="Total sales"
        value={formatINRChip(kpis.totalRevenue)}
        sub={`Received ${formatINRChip(collectedAmount)} · Due ${formatINRChip(kpis.outstanding)}`}
        lottie={
          <ClientAnalyticsKpiLottie
            source={CLIENT_ANALYTICS_LOTTIE.sales}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Trip P&L"
        value={formatINRChip(kpis.netMargin)}
        sub={`${kpis.marginPct.toFixed(1)}% on sales`}
        valueColor={kpis.netMargin >= 0 ? Theme.positive : Theme.negative}
        lottie={
          <ClientAnalyticsKpiLottie
            source={CLIENT_ANALYTICS_LOTTIE.revenue}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Collection rate"
        value={`${collectionPct}%`}
        sub="Received vs billed"
        valueColor={
          collectionPct >= 80
            ? Theme.positive
            : collectionPct >= 50
              ? Theme.warning
              : Theme.negative
        }
        lottie={
          <ClientAnalyticsKpiLottie
            source={CLIENT_ANALYTICS_LOTTIE.collection}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Trips completed"
        value={String(operations.tripsCompleted)}
        sub={`${operations.onTimePct}% on-time · ${operations.completionPct.toFixed(0)}% completion`}
        lottie={
          <ClientAnalyticsKpiLottie
            source={CLIENT_ANALYTICS_LOTTIE.trips}
            size={34}
            renderScale={1.35}
          />
        }
      />
    </View>
  );

  const healthBody = healthScore ? (
    <>
      <View style={clientStyles.healthScoreRow}>
        <Text
          style={[
            clientStyles.healthScore,
            compact && clientStyles.healthScoreCompact,
          ]}
        >
          {Math.round(healthScore.score)}
        </Text>
        <Text
          style={[
            clientStyles.healthScoreMax,
            compact && clientStyles.healthScoreMaxCompact,
          ]}
        >
          / 100
        </Text>
      </View>
      <Text style={styles.salesWidgetSub} numberOfLines={1}>
        {healthScore.breakdown.tripsTotal} trips · payment behaviour
      </Text>
      {healthBars.map((bar) => (
        <MetricHover
          key={bar.label}
          title={bar.label}
          rows={[{ label: "Score", value: `${Math.round(bar.percent)} / 100` }]}
        >
          <View style={clientStyles.healthBarRow}>
            <Text
              style={[
                clientStyles.healthBarLabel,
                compact && clientStyles.healthBarLabelCompact,
              ]}
              numberOfLines={1}
            >
              {bar.label}
            </Text>
            <View style={clientStyles.healthBarTrack}>
              <View
                style={[
                  clientStyles.healthBarFill,
                  {
                    width: `${Math.max(0, Math.min(100, bar.percent))}%`,
                    backgroundColor:
                      bar.color ??
                      (bar.percent < 40 ? Theme.warning : METRONIC.link),
                  },
                ]}
              />
            </View>
            <Text style={clientStyles.healthBarValue}>{Math.round(bar.percent)}</Text>
          </View>
        </MetricHover>
      ))}
    </>
  ) : (
    <Text style={styles.salesEmptySide}>
      Not enough trip history for a health score.
    </Text>
  );

  const healthCard = !clientId ? (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? clientStyles.desktopQuadInner : undefined}
      title="Customer contribution"
      subtitle="Share of billed sales by customer"
    >
      <View style={[styles.salesWidgetDonutBody, clientStyles.desktopQuadChartBody]}>
        <NetworkDesktopSalesDonut
          slices={contributionSlices}
          stacked
          activeLabel={clientFilter}
          onSelectLabel={setClientFilter}
          emptyMessage="No customer billing yet."
        />
      </View>
    </ChartShell>
  ) : (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPadTight,
        compact && clientStyles.healthCardMobile,
        !compact && clientStyles.desktopQuadInner,
      ]}
    >
      <View style={clientStyles.healthHeader}>
        <ClientAnalyticsKpiLottie source={CLIENT_ANALYTICS_LOTTIE.health} size={28} />
        <Text style={styles.salesCardTitle} numberOfLines={1}>
          Receivable health
        </Text>
      </View>
      {compact ? (
        healthBody
      ) : (
        <ScrollView
          style={clientStyles.desktopQuadScroll}
          contentContainerStyle={clientStyles.desktopQuadScrollContent}
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
      shellStyle={!compact ? styles.salesWidgetTrend : undefined}
      title="Revenue trend"
      subtitle="Client billing by month · tap to filter trips"
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
      shellStyle={!compact ? [styles.salesBarOrigin, clientStyles.desktopQuadInner] : undefined}
      title="Aging mix"
    >
      <View style={[styles.salesWidgetDonutBody, clientStyles.desktopQuadChartBody]}>
        <NetworkDesktopSalesDonut
          slices={agingSlices}
          stacked
          activeLabel={agingFilter}
          onSelectLabel={setAgingFilter}
          emptyMessage="No outstanding aging."
        />
      </View>
    </ChartShell>
  );

  const collectionsInnerWidth = Math.max(
    collectionsChartWidth,
    monthly.length * 36,
  );

  const collectionsCard = (
    <ChartShell
      compact={compact}
      contained={!compact}
      shellStyle={!compact ? styles.salesBarOrigin : undefined}
      title="Collections"
    >
      <View
        style={clientStyles.desktopQuadChartBody}
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
            data={toRevenueLinePoints(monthly)}
            width={Math.max(180, collectionsInnerWidth)}
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

  const clientSummaryCard = client ? (
    <View style={[styles.salesCard, styles.salesCardPad, compact && clientStyles.sectionCardMobile]}>
      <View style={styles.salesContributorRow}>
        <PartyAvatar
          name={client.name}
          initialsColorSeed={client.id}
          avatarUrl={client.avatar_url}
          avatarSeed={client.avatar_seed}
          entityType="client"
          size={compact ? 40 : 36}
        />
        <View style={styles.salesContributorTextCol}>
          <Text style={styles.salesContributorName} numberOfLines={2}>
            {client.name}
          </Text>
          <Text style={styles.salesContributorMeta}>
            {operations.tripsTotal} trips · {collectionPct}% collected
          </Text>
        </View>
      </View>
      {primaryBadge ? (
        <View style={clientStyles.healthBadge}>
          <Text style={clientStyles.healthBadgeText}>{primaryBadge}</Text>
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
          clientStyles.insightsCard,
          !compact && clientStyles.insightsCardDesktop,
          compact && clientStyles.sectionCardMobile,
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

  const tripsBlock = compact ? (
    <View style={clientStyles.tripsSectionMobile}>
      <View style={clientStyles.sectionCardMobile}>
        <Text style={styles.salesCardTitle}>Trips</Text>
        <Text style={styles.salesTripTableSub}>
          {filtersActive
            ? "Filtered by chart selection"
            : "All client trips in period"}
        </Text>
        {filtersActive ? (
          <Pressable onPress={clearFilters} hitSlop={8}>
            <Text style={styles.salesTripTableSub}>Clear {selectedMonthLabel ?? "filters"}</Text>
          </Pressable>
        ) : null}
        <View style={clientStyles.tripsSearchMobile}>
          <Search size={16} color={METRONIC.muted} />
          <TextInput
            style={clientStyles.tripsSearchInput}
            placeholder="Search trips, lanes…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={setTableSearch}
          />
        </View>
      </View>

      {tableRows.length === 0 ? (
        <View style={clientStyles.tripsEmpty}>
          <ClientAnalyticsKpiLottie
            source={CLIENT_ANALYTICS_LOTTIE.trips}
            size={72}
          />
          <Text style={clientStyles.tripsEmptyText}>No trips match filters.</Text>
        </View>
      ) : (
        <View style={clientStyles.tripsListMobile}>
          {tableRows.map((row) => {
            const received = scopedTx
              .filter((tx) => tx.trip_id === row.id)
              .reduce((s, tx) => s + Number(tx.amount_in ?? 0), 0);
            const due = Math.max(0, row.sales - received);
            return (
              <ClientAnalyticsMobileTripCard
                key={row.id}
                row={row}
                received={received}
                due={due}
              />
            );
          })}
        </View>
      )}
    </View>
  ) : (
    <View style={[styles.salesCard, styles.salesTableCard, clientStyles.partyTableCard]}>
      <View style={clientStyles.partyTableToolbar}>
        <View style={styles.salesTripTableTitleCol}>
          <Text style={styles.salesCardTitle}>Trips</Text>
          <Text style={styles.salesTripTableSub}>
            {filtersActive
              ? "Filtered by chart selection"
              : "All client trips in period"}
          </Text>
          {filtersActive ? (
            <Pressable onPress={clearFilters} hitSlop={8}>
              <Text style={styles.salesFilterChipTextOn}>
                Clear {selectedMonthLabel ?? "filters"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View style={clientStyles.partyTableSearch}>
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

      <View style={clientStyles.partyTableScroll}>
        <View style={clientStyles.partyTableInner}>
          <View style={[clientStyles.partyTableHead, clientStyles.partyTableGrid]}>
            <View style={clientStyles.partyTripCol}>
              <Text style={clientStyles.partyTh}>Trip</Text>
            </View>
            <View style={clientStyles.partyPartyCol}>
              <Text style={clientStyles.partyTh}>Supplier</Text>
            </View>
            <View style={clientStyles.partyDriverCol}>
              <Text style={clientStyles.partyTh}>Driver</Text>
            </View>
            <View style={clientStyles.partyAmtCol}>
              <Text style={[clientStyles.partyTh, clientStyles.partyThRight]}>
                Sales
              </Text>
            </View>
            <View style={clientStyles.partyAmtCol}>
              <Text style={[clientStyles.partyTh, clientStyles.partyThRight]}>
                Cost
              </Text>
            </View>
            <View style={clientStyles.partyAmtCol}>
              <Text style={[clientStyles.partyTh, clientStyles.partyThRight]}>
                P&L
              </Text>
            </View>
            <View style={clientStyles.partyAmtCol}>
              <Text style={[clientStyles.partyTh, clientStyles.partyThRight]}>
                Received
              </Text>
            </View>
            <View style={clientStyles.partyAmtCol}>
              <Text style={[clientStyles.partyTh, clientStyles.partyThRight]}>
                Due
              </Text>
            </View>
            <View style={clientStyles.partyTxnCol}>
              <Text style={[clientStyles.partyTh, clientStyles.partyThRight]}>
                Txns
              </Text>
            </View>
            <View style={clientStyles.partyLastCol}>
              <Text style={[clientStyles.partyTh, clientStyles.partyThRight]}>
                Last Txn
              </Text>
            </View>
          </View>

          {partyDetailRows.length === 0 ? (
            <View style={clientStyles.tripsEmpty}>
              <ClientAnalyticsKpiLottie
                source={CLIENT_ANALYTICS_LOTTIE.trips}
                size={72}
              />
              <Text style={clientStyles.tripsEmptyText}>
                No trips match filters.
              </Text>
            </View>
          ) : (
            partyDetailRows.map((row) => {
              const tripDateIso = row.trip.pickup_date ?? row.trip.created_at;
              const vehicle = (row.trip.vehicle_display_number ?? "").trim();
              return (
                <Pressable
                  key={row.trip.id}
                  style={(state: HoverPressState) => [
                    clientStyles.partyTableRow,
                    clientStyles.partyTableGrid,
                    WEB_POINTER,
                    WEB_TRANSITION,
                    isHovered(state) && hoverRowWash,
                  ]}
                  onPress={() =>
                    router.push(
                      `/trip/${row.trip.id}?entryContext=client` as const,
                    )
                  }
                >
                  <View style={clientStyles.partyTripCol}>
                    <View style={clientStyles.partyTripIdRow}>
                      <Text
                        style={clientStyles.partyTripId}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {row.missionId}
                      </Text>
                      <Text style={clientStyles.partyTripSep}>·</Text>
                      <Text style={clientStyles.partyTripDate} numberOfLines={1}>
                        {formatTripTableDate(tripDateIso)}
                      </Text>
                    </View>
                    <Text style={clientStyles.partyRoute} numberOfLines={2}>
                      {row.route}
                    </Text>
                  </View>
                  <View style={clientStyles.partyPartyCol}>
                    <View style={clientStyles.partyAvatarRow}>
                      <PartyAvatar
                        name={row.supplierTitle}
                        entityType="supplier"
                        size={28}
                      />
                      <View style={clientStyles.partyTextStack}>
                        <Text style={clientStyles.partyName} numberOfLines={1}>
                          {row.supplierTitle}
                        </Text>
                        <Text style={clientStyles.partyHint} numberOfLines={1}>
                          {row.isAggregate ? "Partner" : "Asset"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={clientStyles.partyDriverCol}>
                    <View style={clientStyles.partyAvatarRow}>
                      <PartyAvatar
                        name={row.driverName}
                        entityType="driver"
                        size={28}
                      />
                      <View style={clientStyles.partyTextStack}>
                        <Text style={clientStyles.partyName} numberOfLines={1}>
                          {row.driverName}
                        </Text>
                        {vehicle ? (
                          <Text style={clientStyles.partyHint} numberOfLines={1}>
                            {vehicle}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  <View style={clientStyles.partyAmtCol}>
                    <Text style={clientStyles.partyAmt} numberOfLines={1}>
                      {formatINR(row.sales)}
                    </Text>
                  </View>
                  <View style={clientStyles.partyAmtCol}>
                    <Text style={clientStyles.partyAmt} numberOfLines={1}>
                      {formatINR(row.cost)}
                    </Text>
                  </View>
                  <View style={clientStyles.partyAmtCol}>
                    <Text
                      style={[
                        clientStyles.partyAmt,
                        row.pnl >= 0
                          ? clientStyles.partyAmtIn
                          : clientStyles.partyAmtOut,
                      ]}
                      numberOfLines={1}
                    >
                      {formatINR(row.pnl)}
                    </Text>
                  </View>
                  <View style={clientStyles.partyAmtCol}>
                    <Text
                      style={[clientStyles.partyAmt, clientStyles.partyAmtIn]}
                      numberOfLines={1}
                    >
                      {formatINR(row.received)}
                    </Text>
                  </View>
                  <View style={clientStyles.partyAmtCol}>
                    <Text
                      style={[
                        clientStyles.partyAmt,
                        row.due > 0
                          ? clientStyles.partyAmtOut
                          : clientStyles.partyAmtMuted,
                      ]}
                      numberOfLines={1}
                    >
                      {formatINR(row.due)}
                    </Text>
                  </View>
                  <View style={clientStyles.partyTxnCol}>
                    <Text style={clientStyles.partyTxn} numberOfLines={1}>
                      {row.txnCount}
                    </Text>
                  </View>
                  <View style={clientStyles.partyLastCol}>
                    <Text style={clientStyles.partyAmtMuted} numberOfLines={1}>
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
          <View style={clientStyles.pageIntroCompact}>
            <Text style={[clientStyles.pageTitle, clientStyles.pageTitleCompact]}>
              Finance analytics
            </Text>
            <Text style={[clientStyles.pageSub, clientStyles.pageSubCompact]}>
              {client?.name ?? "Billing, P&L, and receivables"}
            </Text>
          </View>
        ) : null}

        <View style={clientStyles.mobileToolbar}>
          {periodFilters}
          {laneFilters}
          {filtersActive ? (
            <Pressable onPress={clearFilters} style={clientStyles.mobileClearBtn}>
              <Text style={clientStyles.mobileClearBtnText}>Clear all filters</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={clientStyles.mobileStack}>
          {clientSummaryCard ? (
            <View style={clientStyles.mobileSection}>{clientSummaryCard}</View>
          ) : null}

          <View style={clientStyles.mobileSection}>{kpiRow}</View>

          <View style={clientStyles.mobileSection}>
            <View style={clientStyles.chartStackMobile}>
              {revenueTrendCard}
              {laneMixCard}
              {loadTypesCard}
            </View>
          </View>

          <View style={clientStyles.mobileSection}>{healthCard}</View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={clientStyles.carousel}
          >
            <View style={[clientStyles.carouselCard, { width: carouselCardWidth }]}>
              <View style={clientStyles.carouselCardInner}>{agingCard}</View>
            </View>
            <View style={[clientStyles.carouselCard, { width: carouselCardWidth }]}>
              <View style={clientStyles.carouselCardInner}>{collectionsCard}</View>
            </View>
          </ScrollView>

          {tripsBlock}
          {insightsBlock ? (
            <View style={clientStyles.mobileSection}>{insightsBlock}</View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.salesBody, clientStyles.bodyDesktop]}>
      <View style={clientStyles.desktopMainCol}>
        {kpiRow}

        <View style={styles.salesWidgetRow}>
          {revenueTrendCard}
          {laneMixCard}
          {loadTypesCard}
        </View>

        <View style={clientStyles.desktopQuadRow}>
          {healthCard}
          {agingCard}
          {collectionsCard}
        </View>

        {tripsBlock}
      </View>
    </View>
  );
}
