/**
 * Driver finance analytics — responsive Metronic BI (matches supplier dashboard).
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
  computeDriverPerformanceScore,
  type DriverPerformanceScore,
} from "@/features/analytics";
import { ClientAnalyticsInsightRow } from "@/features/clients/components/analytics/ClientAnalyticsInsightRow";
import { ClientAnalyticsKpiLottie } from "@/features/clients/components/analytics/ClientAnalyticsKpiLottie";
import {
  computePartyContribution,
  tripDriverLabel,
} from "@/features/clients/components/analytics/clientAnalyticsUtils";
import { clientFinanceAnalyticsStyles as styles } from "@/features/clients/components/analytics/clientFinanceAnalytics.styles";
import type { SalaryRequestRow } from "@/features/drivers/services/salaryRequests.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { DRIVER_ANALYTICS_LOTTIE } from "@/features/drivers/components/analytics/driverAnalyticsAssets";
import type { DriverOffer } from "@/features/drivers/components/analytics/driverAnalyticsUtils";
import type { DriverScoreTripInput } from "@/features/analytics/scores/driverPerformanceScore.util";
import { DriverAnalyticsMobileTripCard } from "@/features/drivers/components/analytics/DriverAnalyticsMobileTripCard";
import {
  computeDriverEarningsAging,
  computeDriverFinancialMetrics,
  computeDriverLaneBreakdown,
  computeDriverLoadTypeBreakdown,
  computeDriverMonthlyTrend,
  computeDriverOperationalMetrics,
  deriveDriverInsights,
  filterTripsByDateRange,
  filterTxnsByDateRange,
  type DriverAnalyticsDateRange,
  type DriverMonthlyTrendPoint,
} from "@/features/drivers/components/analytics/driverFinanceAnalyticsUtils";
import { computeDriverCommissionForTrip } from "@/features/finance";
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
import type { RatingRow } from "@/features/ratings";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatINR, formatINRChip, formatLedgerDate, formatTripTableDate } from "@/lib/format";
import { useDriverPerformanceScoreQuery } from "@/lib/queries/useAnalyticsQueries";
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
  driver: DriverRow | null;
  trips: TripRow[];
  driverTransactions: LedgerRow[];
  driverRequests: SalaryRequestRow[];
  driverOffer: DriverOffer | null;
  driverRatings: RatingRow[];
  orgId: string | null;
  embedded?: boolean;
};

const DATE_RANGES: { id: DriverAnalyticsDateRange; label: string }[] = [
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

function tripToScoreInput(t: TripRow): DriverScoreTripInput {
  return {
    driver_id: t.driver_id ?? null,
    client_price: t.client_price ?? null,
    driver_commission: t.driver_commission ?? null,
    supplier_rate: t.supplier_rate ?? null,
    status: t.status ?? null,
    pickup_date: t.pickup_date ?? null,
    completed_at: t.completed_at ?? null,
    created_at: t.created_at ?? null,
  };
}

function tripEarnings(trip: TripRow, offer: DriverOffer | null): number {
  return computeDriverCommissionForTrip(
    {
      ...trip,
      client_price: trip.client_price ?? null,
      distance: trip.distance ?? null,
    },
    offer
      ? {
          commissionPercent: offer.commissionPercent,
          commissionPerKm: offer.commissionPerKm,
        }
      : null,
  );
}

function toTrendPoints(months: readonly DriverMonthlyTrendPoint[]): SalesTrendPoint[] {
  return months.map((m) => ({
    monthKey: m.monthKey,
    label: m.label,
    trips: m.trips,
    revenue: m.revenue,
  }));
}

function toSettlementLinePoints(
  months: readonly DriverMonthlyTrendPoint[],
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

export function DriverFinanceAnalyticsDashboard({
  driver,
  trips,
  driverTransactions,
  driverRequests,
  driverOffer,
  driverRatings,
  orgId,
  embedded = false,
}: Props) {
  const router = useRouter();
  const layout = useProfileHubCompactLayout();
  const compact = layout.compact;
  const { width } = useWindowDimensions();
  const carouselCardWidth = Math.min(300, width - Layout.screenPaddingHorizontal * 2 - 12);

  const [dateRange, setDateRange] = useState<DriverAnalyticsDateRange>("12m");
  const [laneFilter, setLaneFilter] = useState<string | null>(null);
  const [partyFilter, setPartyFilter] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [trendChartWidth, setTrendChartWidth] = useState(compact ? width - 48 : 320);
  const [collectionsChartWidth, setCollectionsChartWidth] = useState(
    compact ? carouselCardWidth - 24 : 200,
  );

  const driverId = driver?.id ?? null;
  const driverName = (driver?.name ?? "Driver").trim() || "Driver";

  const periodTrips = useMemo(() => {
    let list = filterTripsByDateRange(trips, dateRange);
    if (laneFilter) list = list.filter((t) => laneFromTrip(t) === laneFilter);
    return list;
  }, [trips, dateRange, laneFilter]);

  const partyContribution = useMemo(
    () =>
      driverId
        ? []
        : computePartyContribution(periodTrips, {
            topN: 6,
            labelFor: tripDriverLabel,
            valueFor: (t) => {
              const commission = Number(t.driver_commission ?? 0);
              return commission > 0 ? commission : Math.max(0, Number(t.client_price ?? 0));
            },
          }),
    [driverId, periodTrips],
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
        const label = tripDriverLabel(t);
        if (partyFilter === "Others") return !top.has(label);
        return label === partyFilter;
      });
    }
    return list;
  }, [periodTrips, monthKey, partyFilter, partyContribution]);

  const scopedTx = useMemo(
    () => filterTxnsByDateRange(driverTransactions, dateRange),
    [driverTransactions, dateRange],
  );

  const { data: serverScore } = useDriverPerformanceScoreQuery(orgId, driverId);

  const localScore: DriverPerformanceScore | null = useMemo(() => {
    if (serverScore || !driverId) return null;
    return computeDriverPerformanceScore(
      driverId,
      scopedTrips.map(tripToScoreInput),
      scopedTx.map((tx) => ({
        contact_id: tx.contact_id ?? null,
        contact_type: tx.contact_type ?? null,
        amount_out: Number(tx.amount_out ?? 0),
        transaction_date: tx.transaction_date ?? null,
        created_at: tx.created_at ?? null,
      })),
      driverRatings.map((r) => ({
        rating: r.score ?? null,
      })),
    );
  }, [serverScore, driverId, scopedTrips, scopedTx, driverRatings]);

  const score = serverScore ?? localScore;

  const financial = useMemo(
    () => computeDriverFinancialMetrics(scopedTrips, scopedTx, driverOffer),
    [scopedTrips, scopedTx, driverOffer],
  );
  const operations = useMemo(
    () => computeDriverOperationalMetrics(scopedTrips, driverRatings),
    [scopedTrips, driverRatings],
  );
  const monthly = useMemo(
    () => computeDriverMonthlyTrend(periodTrips, scopedTx, driverOffer, { monthsBack: 12 }),
    [periodTrips, scopedTx, driverOffer],
  );
  const lanes = useMemo(
    () => computeDriverLaneBreakdown(scopedTrips, driverOffer, { topN: 6 }),
    [scopedTrips, driverOffer],
  );
  const loadTypes = useMemo(
    () => computeDriverLoadTypeBreakdown(scopedTrips, { topN: 5 }),
    [scopedTrips],
  );
  const aging = useMemo(
    () => computeDriverEarningsAging(scopedTrips, scopedTx, driverOffer),
    [scopedTrips, scopedTx, driverOffer],
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
        value: l.earnings,
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
        const earnings = tripEarnings(t, driverOffer);
        const lane = laneFromTrip(t);
        return {
          id: t.id,
          tripRef: getTripOperationalDisplay({ trip_number: t.trip_number ?? null }),
          lane,
          clientName: "—",
          supplierName: driverName,
          sales: Number(t.client_price ?? 0),
          cost: earnings,
          margin: earnings,
          marginPct: 0,
          dateLabel: null,
          statusLabel: (t.status ?? "—").replace(/_/g, " ").toUpperCase(),
          trip: t,
        };
      });
  }, [scopedTrips, tableSearch, driverOffer, driverName]);

  const insightLines = useMemo(
    () => deriveDriverInsights(financial, operations, driverRequests, driver),
    [financial, operations, driverRequests, driver],
  );

  const healthBars = score
    ? [
        { label: "Settlement", percent: score.settlementScore },
        { label: "Completion", percent: score.completionScore, color: Theme.positive },
        { label: "On-time", percent: score.onTimeScore, color: Theme.positive },
        { label: "Productivity", percent: score.productivityScore },
        { label: "Ratings", percent: score.ratingsScore },
      ]
    : [];

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

  const earningsByTrip = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of scopedTrips) {
      map.set(t.id, tripEarnings(t, driverOffer));
    }
    return map;
  }, [scopedTrips, driverOffer]);

  const partyDetailRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    const txMetaByTrip = new Map<string, { count: number; lastTxn: string | null }>();
    for (const tx of scopedTx) {
      const key = String(tx.trip_id ?? "").trim();
      if (!key) continue;
      const cur = txMetaByTrip.get(key) ?? { count: 0, lastTxn: null };
      cur.count += 1;
      const d = tx.transaction_date ?? tx.created_at ?? null;
      if (d && (!cur.lastTxn || String(d) > cur.lastTxn)) cur.lastTxn = String(d);
      txMetaByTrip.set(key, cur);
    }

    return scopedTrips
      .filter((t) => {
        if (!q) return true;
        const ref = getTripOperationalDisplay({
          trip_number: t.trip_number ?? null,
        }).toLowerCase();
        const lane = `${t.pickup_area ?? ""} ${t.drop_location ?? ""}`.toLowerCase();
        const client = (t.client_name ?? "").toLowerCase();
        const vehicle = (t.vehicle_display_number ?? "").toLowerCase();
        return (
          ref.includes(q) ||
          lane.includes(q) ||
          client.includes(q) ||
          vehicle.includes(q)
        );
      })
      .slice(0, 50)
      .map((t) => {
        const earnings = earningsByTrip.get(t.id) ?? tripEarnings(t, driverOffer);
        const paid = paidByTrip.get(t.id) ?? 0;
        const due = Math.max(0, earnings - paid);
        const meta = txMetaByTrip.get(t.id) ?? { count: 0, lastTxn: null };
        const clientName = (t.client_name ?? "").trim() || "—";
        const vehicle = (t.vehicle_display_number ?? "").trim();
        return {
          trip: t,
          missionId: getTripOperationalDisplay({
            trip_number: t.trip_number ?? null,
          }),
          route: laneFromTrip(t),
          clientName,
          vehicle,
          earnings,
          paid,
          due,
          txnCount: meta.count,
          lastTxn: meta.lastTxn,
        };
      });
  }, [scopedTrips, scopedTx, tableSearch, earningsByTrip, paidByTrip, driverOffer]);

  const clearFilters = () => {
    setLaneFilter(null);
    setPartyFilter(null);
    setMonthKey(null);
    setTableSearch("");
  };

  const filtersActive = Boolean(laneFilter || partyFilter || monthKey || tableSearch.trim());

  const setDateRangeAndResetMonth = (range: DriverAnalyticsDateRange) => {
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
        label="Revenue handled"
        value={formatINRChip(financial.revenue)}
        sub={`${operations.vehiclesOperated} vehicles operated`}
        lottie={
          <ClientAnalyticsKpiLottie
            source={DRIVER_ANALYTICS_LOTTIE.revenue}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Driver earnings"
        value={formatINRChip(financial.earnings)}
        sub={`Paid ${formatINRChip(financial.paid)} · Due ${formatINRChip(financial.outstanding)}`}
        lottie={
          <ClientAnalyticsKpiLottie
            source={DRIVER_ANALYTICS_LOTTIE.earnings}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Settlement rate"
        value={`${financial.settlementPct}%`}
        sub="Paid vs total earnings"
        valueColor={
          financial.settlementPct >= 80
            ? Theme.positive
            : financial.settlementPct >= 50
              ? Theme.warning
              : Theme.negative
        }
        lottie={
          <ClientAnalyticsKpiLottie
            source={DRIVER_ANALYTICS_LOTTIE.settlement}
            size={34}
            renderScale={1.35}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Trips completed"
        value={String(operations.tripsCompleted)}
        sub={`${operations.completionPct}% completion · ${operations.totalKm.toLocaleString("en-IN")} km`}
        lottie={
          <ClientAnalyticsKpiLottie
            source={DRIVER_ANALYTICS_LOTTIE.trips}
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

  const healthCard = !driverId ? (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.desktopQuadInner : undefined}
      title="Driver contribution"
      subtitle="Share of trip value by driver"
    >
      <View style={[hubStyles.salesWidgetDonutBody, styles.desktopQuadChartBody]}>
        <NetworkDesktopSalesDonut
          slices={contributionSlices}
          stacked
          activeLabel={partyFilter}
          onSelectLabel={setPartyFilter}
          emptyMessage="No driver earnings yet."
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
          source={DRIVER_ANALYTICS_LOTTIE.performance}
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
      subtitle="Revenue handled by month · tap to filter trips"
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

  const earningsAgingCard = (
    <ChartShell
      compact={compact}
      contained={!compact}
      shellStyle={!compact ? hubStyles.salesBarOrigin : undefined}
      title="Earnings aging"
    >
      <View style={[hubStyles.salesWidgetDonutBody, styles.desktopQuadChartBody]}>
        <NetworkDesktopSalesDonut
          slices={agingSlices}
          stacked
          emptyMessage="No outstanding earnings aging."
        />
      </View>
    </ChartShell>
  );

  const settlementsCard = (
    <ChartShell
      compact={compact}
      contained={!compact}
      shellStyle={!compact ? hubStyles.salesBarOrigin : undefined}
      title="Settlements"
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
            data={toSettlementLinePoints(monthly)}
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

  const driverSummaryCard = driver ? (
    <View
      style={[
        hubStyles.salesCard,
        hubStyles.salesCardPad,
        compact && styles.sectionCardMobile,
      ]}
    >
      <View style={hubStyles.salesContributorRow}>
        <PartyAvatar
          name={driverName}
          initialsColorSeed={driver.id}
          avatarUrl={driver.avatar_url}
          avatarSeed={driver.avatar_seed}
          entityType="driver"
          size={compact ? 40 : 36}
        />
        <View style={hubStyles.salesContributorTextCol}>
          <Text style={hubStyles.salesContributorName} numberOfLines={2}>
            {driverName}
          </Text>
          <Text style={hubStyles.salesContributorMeta}>
            {operations.tripsTotal} trips · {financial.settlementPct}% settled
          </Text>
        </View>
      </View>
      {operations.driverRating > 0 ? (
        <View style={styles.healthBadge}>
          <Text style={styles.healthBadgeText}>
            {operations.driverRating.toFixed(1)} ★ rating
          </Text>
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
            : "All driver trips in period"}
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
          <ClientAnalyticsKpiLottie source={DRIVER_ANALYTICS_LOTTIE.trips} size={72} />
          <Text style={styles.tripsEmptyText}>No trips match filters.</Text>
        </View>
      ) : (
        <View style={styles.tripsListMobile}>
          {tableRows.map((row) => {
            const earnings = earningsByTrip.get(row.id) ?? row.cost;
            const paid = paidByTrip.get(row.id) ?? 0;
            const due = Math.max(0, earnings - paid);
            return (
              <DriverAnalyticsMobileTripCard
                key={row.id}
                row={row}
                earnings={earnings}
                paid={paid}
                due={due}
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
              : "All driver trips in period"}
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
              <Text style={styles.partyTh}>Vehicle</Text>
            </View>
            <View style={styles.partyAmtCol}>
              <Text style={[styles.partyTh, styles.partyThRight]}>Earnings</Text>
            </View>
            <View style={styles.partyAmtCol}>
              <Text style={[styles.partyTh, styles.partyThRight]}>Paid</Text>
            </View>
            <View style={styles.partyAmtCol}>
              <Text style={[styles.partyTh, styles.partyThRight]}>Due</Text>
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
              <ClientAnalyticsKpiLottie source={DRIVER_ANALYTICS_LOTTIE.trips} size={72} />
              <Text style={styles.tripsEmptyText}>No trips match filters.</Text>
            </View>
          ) : (
            partyDetailRows.map((row) => {
              const tripDateIso = row.trip.pickup_date ?? row.trip.created_at;
              const vehicleName = row.vehicle || "—";
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
                    router.push(`/trip/${row.trip.id}?entryContext=driver` as const)
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
                        name={vehicleName}
                        entityType="vehicle"
                        size={28}
                      />
                      <View style={styles.partyTextStack}>
                        <Text style={styles.partyName} numberOfLines={1}>
                          {vehicleName}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.partyAmtCol}>
                    <Text style={styles.partyAmt} numberOfLines={1}>
                      {formatINR(row.earnings)}
                    </Text>
                  </View>
                  <View style={styles.partyAmtCol}>
                    <Text style={[styles.partyAmt, styles.partyAmtIn]} numberOfLines={1}>
                      {formatINR(row.paid)}
                    </Text>
                  </View>
                  <View style={styles.partyAmtCol}>
                    <Text
                      style={[
                        styles.partyAmt,
                        row.due > 0 ? styles.partyAmtOut : styles.partyAmtMuted,
                      ]}
                      numberOfLines={1}
                    >
                      {formatINR(row.due)}
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
              {driverName} · earnings, settlement, and trip performance
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
          {driverSummaryCard ? (
            <View style={styles.mobileSection}>{driverSummaryCard}</View>
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
              <View style={styles.carouselCardInner}>{earningsAgingCard}</View>
            </View>
            <View style={[styles.carouselCard, { width: carouselCardWidth }]}>
              <View style={styles.carouselCardInner}>{settlementsCard}</View>
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
          {earningsAgingCard}
          {settlementsCard}
        </View>
        {tripsBlock}
      </View>
    </View>
  );
}
