/**
 * Client profile — Margin Analysis tab.
 * Lane-level margin contribution + asset vs supplier operated mix.
 */
import Theme from "@/constants/Theme";
import {
  computeLaneMarginContribution,
  computeOpModelMarginContribution,
  tripOpModelKind,
  type ClientLaneMarginContribution,
  type ClientOpModelKind,
  type ClientOpModelMargin,
} from "@/features/clients/components/analytics/clientAnalyticsUtils";
import { NetworkDesktopSalesDonut } from "@/features/network/components/desktop/NetworkDesktopSalesDonut";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import {
  monthLabelFromKey,
  previousMonthKey,
} from "@/features/network/services/networkGoalsStorage.service";
import type { SalesSlice } from "@/features/network/utils/connectionSalesAnalytics.util";
import { type TripRow } from "@/features/trips/services/trips.service";
import { useCompleteTripsQuery } from "@/lib/queries/useTripsQuery";
import { formatLaneRouteLabel } from "@/lib/placeCityState.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

type Props = {
  organizationId: string;
  clientId: string;
  clientName: string;
  partyRole?: "client" | "supplier";
};

type MarginFilters = {
  lane: string | null;
  opModel: ClientOpModelKind | null;
};

const EMPTY_FILTERS: MarginFilters = { lane: null, opModel: null };

const OP_COLORS = {
  asset: "#3E97FF",
  supplier: "#7239EA",
} as const;

const LANE_COLORS = ["#3E97FF", "#50CD89", "#7239EA", "#FFC700", "#F1416C"];

function formatInr(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 10_00_000) {
    return `₹${(v / 10_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  }
  return `₹${Math.abs(v).toLocaleString("en-IN")}`;
}

function signedInr(n: number): string {
  const abs = formatInr(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
}

function tripMonthKey(t: TripRow): string | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function tripLaneLabel(t: TripRow): string {
  return formatLaneRouteLabel(t.pickup_area, t.drop_location) || "Unspecified lane";
}

function buildMonthKeys(pastCount = 5, futureCount = 0, now = new Date()): string[] {
  const keys: string[] = [];
  for (let i = pastCount; i >= -futureCount; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function chipLabel(label: string, max = 40): string {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

function applyMarginFilters(trips: TripRow[], filters: MarginFilters): TripRow[] {
  return trips.filter((t) => {
    if (filters.lane && tripLaneLabel(t) !== filters.lane) return false;
    if (filters.opModel && tripOpModelKind(t) !== filters.opModel) return false;
    return true;
  });
}

export function ClientProfileMarginAnalysisSection({
  organizationId,
  clientId,
  clientName,
  partyRole = "client",
}: Props) {
  const isSupplier = partyRole === "supplier";
  const monthOptions = useMemo(() => buildMonthKeys(5, 0), []);
  const thisMonthKey = useMemo(() => currentMonthKey(), []);
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const isCompact = (containerWidth > 0 ? containerWidth : windowWidth) < 560;
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(
    () => thisMonthKey,
  );
  const [filters, setFilters] = useState<MarginFilters>(EMPTY_FILTERS);

  const tripsQ = useCompleteTripsQuery(organizationId);

  const clientTrips = useMemo(
    () =>
      (tripsQ.data ?? []).filter((t) =>
        isSupplier ? t.supplier_id === clientId : t.client_id === clientId,
      ),
    [tripsQ.data, clientId, isSupplier],
  );

  const monthTripsAll = useMemo(() => {
    if (selectedMonthKey) {
      return clientTrips.filter((t) => tripMonthKey(t) === selectedMonthKey);
    }
    const allow = new Set(monthOptions);
    return clientTrips.filter((t) => {
      const key = tripMonthKey(t);
      return key != null && allow.has(key);
    });
  }, [clientTrips, selectedMonthKey, monthOptions]);

  const monthTrips = useMemo(
    () => applyMarginFilters(monthTripsAll, filters),
    [monthTripsAll, filters],
  );

  const filtersOn = filters.lane != null || filters.opModel != null;

  const selectMonth = (key: string) => {
    setSelectedMonthKey((prev) => (prev === key ? null : key));
    setFilters(EMPTY_FILTERS);
  };

  const toggleLaneFilter = (lane: string) => {
    setFilters((prev) => ({
      ...prev,
      lane: prev.lane === lane ? null : lane,
    }));
  };

  const toggleOpFilter = (op: ClientOpModelKind) => {
    setFilters((prev) => ({
      ...prev,
      opModel: prev.opModel === op ? null : op,
    }));
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const prevMonth = selectedMonthKey ? previousMonthKey(selectedMonthKey) : null;
  const prevMonthTrips = useMemo(
    () =>
      prevMonth
        ? applyMarginFilters(
            clientTrips.filter((t) => tripMonthKey(t) === prevMonth),
            filters,
          )
        : [],
    [clientTrips, prevMonth, filters],
  );

  const totals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let margin = 0;
    for (const t of monthTrips) {
      revenue += Math.max(0, Number(t.client_price) || 0);
      cost += Math.max(0, Number(t.supplier_rate) || 0);
      const stored = Number(t.margin);
      margin += Number.isFinite(stored)
        ? stored
        : Math.max(0, Number(t.client_price) || 0) -
          Math.max(0, Number(t.supplier_rate) || 0);
    }
    return {
      revenue,
      cost,
      margin,
      marginPct: revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : 0,
      trips: monthTrips.length,
    };
  }, [monthTrips]);

  const prevMargin = useMemo(() => {
    let margin = 0;
    for (const t of prevMonthTrips) {
      const stored = Number(t.margin);
      margin += Number.isFinite(stored)
        ? stored
        : Math.max(0, Number(t.client_price) || 0) -
          Math.max(0, Number(t.supplier_rate) || 0);
    }
    return margin;
  }, [prevMonthTrips]);

  const marginGrowthPct = useMemo(() => {
    if (!selectedMonthKey) return null;
    if (prevMargin === 0) return totals.margin !== 0 ? 100 : 0;
    return Math.round(((totals.margin - prevMargin) / Math.abs(prevMargin)) * 100);
  }, [selectedMonthKey, totals.margin, prevMargin]);

  const opModelsAll = useMemo(
    () => computeOpModelMarginContribution(monthTripsAll),
    [monthTripsAll],
  );
  const lanesAll = useMemo(
    () => computeLaneMarginContribution(monthTripsAll, { topN: isCompact ? 6 : 8 }),
    [monthTripsAll, isCompact],
  );

  const opModels = useMemo(
    () => computeOpModelMarginContribution(monthTrips),
    [monthTrips],
  );
  const assetOp =
    opModels.find((o) => o.id === "asset") ??
    opModelsAll.find((o) => o.id === "asset") ?? {
      id: "asset" as const,
      label: "Asset operated",
      trips: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
      marginPct: 0,
      contributionPct: 0,
    };
  const supplierOp =
    opModels.find((o) => o.id === "supplier") ??
    opModelsAll.find((o) => o.id === "supplier") ?? {
      id: "supplier" as const,
      label: "Supplier operated",
      trips: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
      marginPct: 0,
      contributionPct: 0,
    };

  const lanes = useMemo(
    () => computeLaneMarginContribution(monthTrips, { topN: isCompact ? 8 : 12 }),
    [monthTrips, isCompact],
  );

  const opSlices: SalesSlice[] = useMemo(
    () =>
      opModelsAll
        .filter((o) => o.trips > 0)
        .map((o) => ({
          label: o.label,
          value: Math.max(0, Math.abs(o.margin)),
          color: OP_COLORS[o.id],
          valueLabel: signedInr(o.margin),
        })),
    [opModelsAll],
  );

  const laneSlices: SalesSlice[] = useMemo(
    () =>
      lanesAll.slice(0, 5).map((l, i) => ({
        label: l.label,
        value: Math.max(0, Math.abs(l.margin)),
        color: LANE_COLORS[i % LANE_COLORS.length]!,
        valueLabel: signedInr(l.margin),
      })),
    [lanesAll],
  );

  const periodLabel = selectedMonthKey
    ? monthLabelFromKey(selectedMonthKey)
    : "All months";

  const maxLaneMargin = useMemo(
    () => Math.max(1, ...lanes.map((l) => Math.abs(l.margin))),
    [lanes],
  );

  const activeOpLabel =
    filters.opModel === "asset"
      ? "Asset operated"
      : filters.opModel === "supplier"
        ? "Supplier operated"
        : null;

  if (tripsQ.isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={METRONIC.link} />
        <Text style={styles.loadingText}>Loading margin analysis…</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.root}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.headingRow}>
        <View style={styles.accent} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.heading, isCompact && styles.headingSm]}>
            Margin Analysis
          </Text>
          <Text style={[styles.hint, isCompact && styles.hintSm]} numberOfLines={1}>
            {clientName.trim() || "Client"} · Lane contribution · Asset vs supplier
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {monthOptions.map((key) => {
          const active = key === selectedMonthKey;
          return (
            <Pressable
              key={key}
              onPress={() => selectMonth(key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {monthLabelFromKey(key)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtersOn ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillRow}
        >
          {filters.lane ? (
            <Pressable
              onPress={() => toggleLaneFilter(filters.lane!)}
              style={styles.filterPill}
            >
              <Text style={styles.filterPillKind}>Lane</Text>
              <Text style={styles.filterPillValue} numberOfLines={1}>
                {filters.lane}
              </Text>
              <FontAwesome name="times" size={9} color={METRONIC.link} />
            </Pressable>
          ) : null}
          {filters.opModel ? (
            <Pressable
              onPress={() => toggleOpFilter(filters.opModel!)}
              style={styles.filterPill}
            >
              <Text style={styles.filterPillKind}>Model</Text>
              <Text style={styles.filterPillValue} numberOfLines={1}>
                {activeOpLabel}
              </Text>
              <FontAwesome name="times" size={9} color={METRONIC.link} />
            </Pressable>
          ) : null}
          <Pressable onPress={clearFilters} style={styles.clearFiltersBtn} hitSlop={8}>
            <Text style={styles.clearFiltersText}>Clear</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <Text style={styles.filterHint}>
          Tap a lane or operation slice to cross-filter KPIs and the table
        </Text>
      )}

      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        <Kpi
          label="Net margin"
          value={signedInr(totals.margin)}
          sub={`${totals.marginPct}% of sales`}
          valueColor={totals.margin >= 0 ? Theme.positive : Theme.negative}
          compact={isCompact}
        />
        <Kpi
          label="Sales"
          value={formatInr(totals.revenue)}
          sub={`Cost ${formatInr(totals.cost)}`}
          compact={isCompact}
        />
        <Kpi
          label="Asset margin"
          value={signedInr(assetOp.margin)}
          sub={`${assetOp.trips} trips · ${assetOp.contributionPct}%`}
          valueColor={OP_COLORS.asset}
          compact={isCompact}
        />
        <Kpi
          label="Supplier margin"
          value={signedInr(supplierOp.margin)}
          sub={`${supplierOp.trips} trips · ${supplierOp.contributionPct}%`}
          valueColor={OP_COLORS.supplier}
          compact={isCompact}
        />
      </View>

      {marginGrowthPct != null && selectedMonthKey && prevMonth ? (
        <Text style={styles.growthNote}>
          Margin {marginGrowthPct > 0 ? "+" : ""}
          {marginGrowthPct}% vs {monthLabelFromKey(prevMonth)} · {periodLabel}
          {filtersOn ? " · filtered" : ""}
        </Text>
      ) : (
        <Text style={styles.growthNote}>
          {periodLabel} · contribution by lane & model
          {filtersOn ? " · filtered" : ""}
        </Text>
      )}

      <View style={[styles.gridRow, isCompact && styles.gridRowStack]}>
        <View style={[styles.card, isCompact ? styles.gridCardFull : styles.gridCard]}>
          <Text style={styles.cardTitle}>Operation mix</Text>
          <Text style={styles.cardSub}>
            Margin from asset vs supplier operated trips
          </Text>
          <NetworkDesktopSalesDonut
            slices={opSlices}
            compact={isCompact}
            activeLabel={activeOpLabel}
            onSelectLabel={(label) => {
              if (!label) {
                setFilters((f) => ({ ...f, opModel: null }));
                return;
              }
              if (label.startsWith("Asset")) toggleOpFilter("asset");
              else if (label.startsWith("Supplier")) toggleOpFilter("supplier");
            }}
            emptyMessage="No operated trips this period."
          />
          {opModelsAll.map((op) => (
            <Pressable
              key={op.id}
              onPress={() => toggleOpFilter(op.id)}
              style={filters.opModel === op.id ? styles.rowActive : undefined}
            >
              <OpModelRow op={op} compact={isCompact} />
            </Pressable>
          ))}
        </View>

        <View style={[styles.card, isCompact ? styles.gridCardFull : styles.gridCard]}>
          <Text style={styles.cardTitle}>Lane margin mix</Text>
          <Text style={styles.cardSub}>Top lanes by |margin| · {periodLabel}</Text>
          <NetworkDesktopSalesDonut
            slices={laneSlices}
            compact={isCompact}
            activeLabel={filters.lane}
            onSelectLabel={(label) => {
              if (!label) {
                setFilters((f) => ({ ...f, lane: null }));
                return;
              }
              toggleLaneFilter(label);
            }}
            emptyMessage="No lane margin yet."
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Lane margin contribution</Text>
        <Text style={styles.cardSub}>
          Revenue, cost, margin %, and asset / supplier split per lane
          {filtersOn ? " · filtered" : ""}
        </Text>

        {lanes.length === 0 ? (
          <Text style={styles.empty}>No trips in this period.</Text>
        ) : (
          <>
            {!isCompact ? (
              <View style={styles.tableHead}>
                <Text style={[styles.th, styles.colLane]}>Lane</Text>
                <Text style={[styles.th, styles.colTrips]}>Trips</Text>
                <Text style={[styles.th, styles.colNum]}>Sales</Text>
                <Text style={[styles.th, styles.colNum]}>Margin</Text>
                <Text style={[styles.th, styles.colPct]}>%</Text>
                <Text style={[styles.th, styles.colSplit]}>Asset / Supplier</Text>
                <Text style={[styles.th, styles.colContrib]}>Contrib</Text>
              </View>
            ) : null}
            {lanes.map((lane) => (
              <Pressable
                key={lane.id}
                onPress={() => toggleLaneFilter(lane.label)}
                style={filters.lane === lane.label ? styles.rowActive : undefined}
              >
                <LaneMarginRow
                  lane={lane}
                  compact={isCompact}
                  maxMargin={maxLaneMargin}
                />
              </Pressable>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

function Kpi({
  label,
  value,
  sub,
  valueColor,
  compact,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
  compact: boolean;
}) {
  return (
    <View style={[styles.kpiCard, compact && styles.kpiCardCompact]}>
      <Text style={[styles.kpiLabel, compact && styles.kpiLabelSm]}>{label}</Text>
      <Text
        style={[
          styles.kpiValue,
          compact && styles.kpiValueSm,
          valueColor ? { color: valueColor } : null,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={[styles.kpiSub, compact && styles.kpiSubSm]} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

function OpModelRow({
  op,
  compact,
}: {
  op: ClientOpModelMargin;
  compact: boolean;
}) {
  const color = OP_COLORS[op.id];
  return (
    <View style={styles.opRow}>
      <View style={[styles.opDot, { backgroundColor: color }]} />
      <View style={styles.laneCopy}>
        <Text style={[styles.laneLabel, compact && styles.laneLabelSm]} numberOfLines={1}>
          {op.label}
        </Text>
        <Text style={[styles.laneMeta, compact && styles.laneMetaSm]}>
          {op.trips} trips · Sales {formatInr(op.revenue)} · Cost {formatInr(op.cost)}
        </Text>
      </View>
      <View style={styles.opRight}>
        <Text
          style={[
            styles.marginValue,
            { color: op.margin >= 0 ? Theme.positive : Theme.negative },
          ]}
        >
          {signedInr(op.margin)}
        </Text>
        <Text style={styles.marginPct}>{op.marginPct}% · {op.contributionPct}%</Text>
      </View>
    </View>
  );
}

function LaneMarginRow({
  lane,
  compact,
  maxMargin,
}: {
  lane: ClientLaneMarginContribution;
  compact: boolean;
  maxMargin: number;
}) {
  const barPct = Math.round((Math.abs(lane.margin) / maxMargin) * 100);
  if (compact) {
    return (
      <View style={styles.laneRow}>
        <View style={styles.laneCopy}>
          <Text style={styles.laneLabelSm} numberOfLines={1}>
            {chipLabel(lane.label, 36)}
          </Text>
          <Text style={styles.laneMetaSm}>
            {lane.trips} trips · {formatInr(lane.revenue)} · {lane.marginPct}%
          </Text>
          <Text style={styles.splitMeta}>
            Asset {signedInr(lane.assetMargin)} ({lane.assetTrips}) · Supplier{" "}
            {signedInr(lane.supplierMargin)} ({lane.supplierTrips})
          </Text>
        </View>
        <View style={styles.opRight}>
          <Text
            style={[
              styles.marginValue,
              { color: lane.margin >= 0 ? Theme.positive : Theme.negative },
            ]}
          >
            {signedInr(lane.margin)}
          </Text>
          <Text style={styles.marginPct}>{lane.contributionPct}%</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tr}>
      <View style={styles.colLane}>
        <Text style={styles.laneLabel} numberOfLines={1}>
          {lane.label}
        </Text>
        <View style={styles.laneBarTrack}>
          <View
            style={[
              styles.laneBarFill,
              {
                width: `${barPct}%`,
                backgroundColor:
                  lane.margin >= 0 ? Theme.positive : Theme.negative,
              },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.td, styles.colTrips]}>{lane.trips}</Text>
      <Text style={[styles.td, styles.colNum]}>{formatInr(lane.revenue)}</Text>
      <Text
        style={[
          styles.td,
          styles.colNum,
          styles.tdStrong,
          { color: lane.margin >= 0 ? Theme.positive : Theme.negative },
        ]}
      >
        {signedInr(lane.margin)}
      </Text>
      <Text style={[styles.td, styles.colPct]}>{lane.marginPct}%</Text>
      <Text style={[styles.td, styles.colSplit]} numberOfLines={2}>
        {signedInr(lane.assetMargin)} / {signedInr(lane.supplierMargin)}
      </Text>
      <Text style={[styles.td, styles.colContrib]}>{lane.contributionPct}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", gap: 12 },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 10,
  },
  loadingText: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  accent: {
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: Theme.textPrimaryDark,
  },
  heading: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  headingSm: { fontSize: 13 },
  hint: { fontSize: 11, fontWeight: "500", color: Theme.textMuted, marginTop: 2 },
  hintSm: { fontSize: 10 },
  chipRow: { flexDirection: "row", gap: 6, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  chipActive: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textRouteCard,
  },
  chipTextActive: { color: Theme.textOnPrimary },
  kpiRow: { flexDirection: "row", gap: 8 },
  kpiRowCompact: { flexWrap: "wrap" },
  kpiCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  kpiCardCompact: { minWidth: "47%", flexGrow: 1 },
  kpiLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  kpiLabelSm: { fontSize: 8 },
  kpiValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  kpiValueSm: { fontSize: 14 },
  kpiSub: { marginTop: 3, fontSize: 10, fontWeight: "600", color: Theme.textMuted },
  kpiSubSm: { fontSize: 9 },
  growthNote: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  gridRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  gridRowStack: { flexDirection: "column" },
  gridCard: { flex: 1, minWidth: 0 },
  gridCardFull: { width: "100%" },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  cardSub: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: -4,
  },
  empty: { fontSize: 12, fontWeight: "600", color: Theme.textMuted, paddingVertical: 8 },
  opRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderInput,
  },
  opDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  laneCopy: { flex: 1, minWidth: 0, gap: 2 },
  laneLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  laneLabelSm: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark },
  laneMeta: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
  laneMetaSm: { fontSize: 9, fontWeight: "600", color: Theme.textMuted },
  splitMeta: { fontSize: 9, fontWeight: "600", color: METRONIC.subtle, marginTop: 1 },
  opRight: { alignItems: "flex-end", flexShrink: 0 },
  marginValue: {
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  marginPct: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 1,
  },
  laneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderInput,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 6,
  },
  th: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
  },
  td: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  tdStrong: { fontWeight: "800" },
  colLane: { flex: 1.6, minWidth: 0 },
  colTrips: { width: 48, textAlign: "right", flexGrow: 0, flexShrink: 0 },
  colNum: { width: 88, textAlign: "right", flexGrow: 0, flexShrink: 0 },
  colPct: { width: 48, textAlign: "right", flexGrow: 0, flexShrink: 0 },
  colSplit: { flex: 1, minWidth: 96, textAlign: "right" },
  colContrib: { width: 56, textAlign: "right", flexGrow: 0, flexShrink: 0 },
  laneBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Theme.surfaceGray,
    marginTop: 4,
    overflow: "hidden",
  },
  laneBarFill: { height: "100%", borderRadius: 2 },
  filterHint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  filterPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 280,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#B5D4F4",
    backgroundColor: "#F0F7FF",
  },
  filterPillKind: {
    fontSize: 8,
    fontWeight: "800",
    color: METRONIC.link,
    textTransform: "uppercase",
  },
  filterPillValue: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    flexShrink: 1,
  },
  clearFiltersBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  clearFiltersText: { fontSize: 10, fontWeight: "700", color: METRONIC.link },
  rowActive: {
    backgroundColor: "rgba(62, 151, 255, 0.08)",
    borderRadius: 6,
  },
});
