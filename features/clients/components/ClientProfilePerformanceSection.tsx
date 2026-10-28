/**
 * Client profile — Lane Performance tab.
 * Party-level sales analytics with Metronic chrome, cross-filters,
 * future-month targets, and Goals-linked carry-forward / KAM.
 */
import Theme from "@/constants/Theme";
import {
  computeLaneBreakdown,
  computeLoadTypeBreakdown,
  computePayableAging,
  computePaymentAging,
} from "@/features/clients/components/analytics/clientAnalyticsUtils";
import {
  getTransactionsByOrganizationAndContactId,
  type LedgerRow,
} from "@/features/finance/services/finance.service";
import { NetworkDesktopSalesDonut } from "@/features/network/components/desktop/NetworkDesktopSalesDonut";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import {
  DEFAULT_NETWORK_GOALS_STORE,
  EMPTY_ENTITY_TARGET,
  getMonthStore,
  loadNetworkGoalsStore,
  monthLabelFromKey,
  patchEntityTarget,
  patchKamAssignment,
  previousMonthKey,
  saveNetworkGoalsStore,
  type NetworkGoalsStore,
} from "@/features/network/services/networkGoalsStorage.service";
import type { SalesSlice } from "@/features/network/utils/connectionSalesAnalytics.util";
import { getTripsForOrg, type TripRow } from "@/features/trips/services/trips.service";
import { formatCityStateLabel, formatLaneRouteLabel } from "@/lib/placeCityState.util";
import { useOrgMembersData } from "@/lib/queries/useOrgMembersQuery";
import { queryKeys } from "@/lib/queryKeys";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

type Props = {
  organizationId: string;
  clientId: string;
  clientName: string;
  /** Client = receivable/sales; supplier = payable/spend. Default client. */
  partyRole?: "client" | "supplier";
};

type EditMetric = "revenueInr" | "tripCount" | null;

type CrossFilters = {
  lane: string | null;
  origin: string | null;
  destination: string | null;
  loadType: string | null;
};

type PlaceRow = { id: string; label: string; revenue: number; trips: number };

const DONUT_COLORS = ["#3E97FF", "#50CD89", "#7239EA", "#FFC700", "#F1416C"];
const EMPTY_FILTERS: CrossFilters = {
  lane: null,
  origin: null,
  destination: null,
  loadType: null,
};

function formatInr(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 10_00_000) {
    return `₹${(v / 10_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  }
  return `₹${Math.abs(v).toLocaleString("en-IN")}`;
}

function progressPct(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(999, Math.round((actual / target) * 100));
}

function tripMonthKey(t: TripRow): string | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function tripsInMonthKey(trips: readonly TripRow[], monthKey: string): TripRow[] {
  return trips.filter((t) => tripMonthKey(t) === monthKey);
}

function tripLaneLabel(t: TripRow): string {
  return formatLaneRouteLabel(t.pickup_area, t.drop_location) || "Unspecified lane";
}

function tripOrigin(t: TripRow): string {
  return formatCityStateLabel(t.pickup_area) || "Unspecified";
}

function tripDestination(t: TripRow): string {
  return formatCityStateLabel(t.drop_location) || "Unspecified";
}

function tripLoadType(t: TripRow): string {
  return (t.load_type ?? "").trim() || "Unspecified";
}

function tripRevenue(t: TripRow, asSpend = false): number {
  const n = Number(asSpend ? t.supplier_rate : t.client_price);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function tripMargin(t: TripRow, asSpend = false): number {
  if (asSpend) {
    // Supplier view: contribution margin of the trip from org side still uses stored margin when present.
    const stored = Number(t.margin);
    if (Number.isFinite(stored)) return stored;
    return tripRevenue(t, false) - tripRevenue(t, true);
  }
  const stored = Number(t.margin);
  if (Number.isFinite(stored)) return stored;
  return tripRevenue(t, false) - (Number(t.supplier_rate) || 0);
}

/** Past months + current + future months for target planning. */
function buildPerformanceMonthKeys(
  pastCount = 5,
  futureCount = 3,
  now = new Date(),
): string[] {
  const keys: string[] = [];
  for (let i = pastCount; i >= -futureCount; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return keys;
}

function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function applyCrossFilters(
  trips: readonly TripRow[],
  filters: CrossFilters,
): TripRow[] {
  return trips.filter((t) => {
    if (filters.lane && tripLaneLabel(t) !== filters.lane) return false;
    if (filters.origin && tripOrigin(t) !== filters.origin) return false;
    if (filters.destination && tripDestination(t) !== filters.destination) {
      return false;
    }
    if (filters.loadType && tripLoadType(t) !== filters.loadType) return false;
    return true;
  });
}

function hasActiveFilters(f: CrossFilters): boolean {
  return Boolean(f.lane || f.origin || f.destination || f.loadType);
}

function computePlaceBreakdown(
  trips: readonly TripRow[],
  kind: "origin" | "destination",
  topN = 5,
  asSpend = false,
): PlaceRow[] {
  const map = new Map<string, { revenue: number; trips: number }>();
  for (const t of trips) {
    const label = kind === "origin" ? tripOrigin(t) : tripDestination(t);
    const entry = map.get(label) ?? { revenue: 0, trips: 0 };
    entry.revenue += tripRevenue(t, asSpend);
    entry.trips += 1;
    map.set(label, entry);
  }
  return Array.from(map.entries())
    .map(([label, agg]) => ({
      id: label,
      label,
      revenue: agg.revenue,
      trips: agg.trips,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, topN);
}

function chipLabel(label: string, max = 22): string {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function ClientProfilePerformanceSection({
  organizationId,
  clientId,
  clientName,
  partyRole = "client",
}: Props) {
  const isSupplier = partyRole === "supplier";
  const monthOptions = useMemo(() => buildPerformanceMonthKeys(5, 3), []);
  const thisMonthKey = useMemo(() => currentMonthKey(), []);
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const isCompact =
    (containerWidth > 0 ? containerWidth : windowWidth) < 560;
  /** null = all months in window (click selected month again to clear). */
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(
    () => thisMonthKey,
  );
  const [filters, setFilters] = useState<CrossFilters>(EMPTY_FILTERS);
  const [goalsStore, setGoalsStore] = useState<NetworkGoalsStore>(
    DEFAULT_NETWORK_GOALS_STORE,
  );
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [editingMetric, setEditingMetric] = useState<EditMetric>(null);
  const [draftTarget, setDraftTarget] = useState("");
  const [saving, setSaving] = useState(false);

  const tripsQ = useQuery({
    queryKey: queryKeys.trips.finite(organizationId),
    queryFn: async () => {
      const { trips, error } = await getTripsForOrg(organizationId);
      if (error) throw error;
      return trips;
    },
    staleTime: 60_000,
  });

  const txQ = useQuery({
    queryKey: queryKeys.transactions.byContact(organizationId, clientId),
    queryFn: async () => {
      const { transactions, error } = await getTransactionsByOrganizationAndContactId(
        organizationId,
        clientId,
      );
      if (error) throw error;
      return transactions as LedgerRow[];
    },
    staleTime: 30_000,
  });

  const orgMembersQ = useOrgMembersData(organizationId);
  const teamMembers = useMemo(
    () =>
      (orgMembersQ.data?.members ?? []).filter(
        (m) => m.role !== "driver" && m.status === "active",
      ),
    [orgMembersQ.data],
  );

  useEffect(() => {
    let cancelled = false;
    setGoalsLoading(true);
    void loadNetworkGoalsStore(organizationId).then((loaded) => {
      if (!cancelled) {
        setGoalsStore(loaded);
        setGoalsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const persistGoals = useCallback(
    async (next: NetworkGoalsStore) => {
      setSaving(true);
      setGoalsStore(next);
      try {
        await saveNetworkGoalsStore(organizationId, next);
      } finally {
        setSaving(false);
      }
    },
    [organizationId],
  );

  const selectMonth = (key: string) => {
    setSelectedMonthKey((prev) => (prev === key ? null : key));
    setFilters(EMPTY_FILTERS);
    setEditingMetric(null);
  };

  const toggleFilter = <K extends keyof CrossFilters>(key: K, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }));
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const clientTrips = useMemo(
    () =>
      (tripsQ.data ?? []).filter((t) =>
        isSupplier ? t.supplier_id === clientId : t.client_id === clientId,
      ),
    [tripsQ.data, clientId, isSupplier],
  );
  const txs = txQ.data ?? [];

  const filteredClientTrips = useMemo(
    () => applyCrossFilters(clientTrips, filters),
    [clientTrips, filters],
  );

  /** Scope for KPIs / mix: selected month, or full chip window when unselected. */
  const monthTripsAll = useMemo(() => {
    if (selectedMonthKey) {
      return tripsInMonthKey(clientTrips, selectedMonthKey);
    }
    const allow = new Set(monthOptions);
    return clientTrips.filter((t) => {
      const key = tripMonthKey(t);
      return key != null && allow.has(key);
    });
  }, [clientTrips, selectedMonthKey, monthOptions]);
  const monthTrips = useMemo(
    () => applyCrossFilters(monthTripsAll, filters),
    [monthTripsAll, filters],
  );

  const prevMonth = selectedMonthKey
    ? previousMonthKey(selectedMonthKey)
    : null;
  const prevMonthTrips = useMemo(
    () =>
      prevMonth
        ? applyCrossFilters(tripsInMonthKey(clientTrips, prevMonth), filters)
        : [],
    [clientTrips, prevMonth, filters],
  );

  const monthActuals = useMemo(() => {
    let revenue = 0;
    let margin = 0;
    for (const t of monthTrips) {
      revenue += tripRevenue(t, isSupplier);
      margin += tripMargin(t, isSupplier);
    }
    return { revenueInr: revenue, tripCount: monthTrips.length, margin };
  }, [monthTrips, isSupplier]);

  const prevRevenue = useMemo(() => {
    let revenue = 0;
    for (const t of prevMonthTrips) revenue += tripRevenue(t, isSupplier);
    return revenue;
  }, [prevMonthTrips, isSupplier]);

  const growthPct = useMemo(() => {
    if (!selectedMonthKey) return null;
    if (prevRevenue <= 0) return monthActuals.revenueInr > 0 ? 100 : 0;
    return Math.round(
      ((monthActuals.revenueInr - prevRevenue) / prevRevenue) * 100,
    );
  }, [selectedMonthKey, monthActuals.revenueInr, prevRevenue]);

  const activeRoutes = useMemo(() => {
    const set = new Set(monthTrips.map(tripLaneLabel));
    return set.size;
  }, [monthTrips]);

  const aging = useMemo(
    () =>
      isSupplier
        ? computePayableAging(filteredClientTrips, txs)
        : computePaymentAging(filteredClientTrips, txs),
    [filteredClientTrips, txs, isSupplier],
  );

  const monthly = useMemo(() => {
    return monthOptions.map((key) => {
      const trips = applyCrossFilters(tripsInMonthKey(clientTrips, key), filters);
      let revenue = 0;
      for (const t of trips) revenue += tripRevenue(t, isSupplier);
      return {
        monthKey: key,
        label: monthLabelFromKey(key),
        revenue,
        trips: trips.length,
      };
    });
  }, [monthOptions, clientTrips, filters, isSupplier]);

  const lanes = useMemo(
    () =>
      computeLaneBreakdown(monthTrips, {
        topN: 8,
        windowMonths: 24,
        valueMode: isSupplier ? "spend" : "revenue",
      }),
    [monthTrips, isSupplier],
  );

  const loadTypes = useMemo(
    () =>
      computeLoadTypeBreakdown(monthTrips, {
        topN: 6,
        windowMonths: 24,
        valueMode: isSupplier ? "spend" : "revenue",
      }),
    [monthTrips, isSupplier],
  );

  const origins = useMemo(
    () => computePlaceBreakdown(monthTrips, "origin", 5, isSupplier),
    [monthTrips, isSupplier],
  );
  const destinations = useMemo(
    () => computePlaceBreakdown(monthTrips, "destination", 5, isSupplier),
    [monthTrips, isSupplier],
  );

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ key: keyof CrossFilters; kind: string; value: string }> =
      [];
    if (filters.lane) {
      pills.push({ key: "lane", kind: "Lane", value: filters.lane });
    }
    if (filters.origin) {
      pills.push({ key: "origin", kind: "Origin", value: filters.origin });
    }
    if (filters.destination) {
      pills.push({
        key: "destination",
        kind: "Dest",
        value: filters.destination,
      });
    }
    if (filters.loadType) {
      pills.push({ key: "loadType", kind: "Load", value: filters.loadType });
    }
    return pills;
  }, [filters]);

  const laneSlices: SalesSlice[] = useMemo(
    () =>
      lanes.map((l, i) => ({
        label: chipLabel(l.label, 28),
        value: l.revenue,
        color: DONUT_COLORS[i % DONUT_COLORS.length]!,
      })),
    [lanes],
  );

  const loadSlices: SalesSlice[] = useMemo(
    () =>
      loadTypes.map((l, i) => ({
        label: l.label,
        value: l.revenue,
        color: DONUT_COLORS[(i + 2) % DONUT_COLORS.length]!,
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

  const monthTarget = useMemo(() => {
    if (!selectedMonthKey) return EMPTY_ENTITY_TARGET;
    const month = getMonthStore(goalsStore, selectedMonthKey);
    return month.clients[clientId] ?? EMPTY_ENTITY_TARGET;
  }, [goalsStore, selectedMonthKey, clientId]);

  const prevMonthTarget = useMemo(() => {
    if (!prevMonth) return EMPTY_ENTITY_TARGET;
    const month = getMonthStore(goalsStore, prevMonth);
    return month.clients[clientId] ?? EMPTY_ENTITY_TARGET;
  }, [goalsStore, prevMonth, clientId]);

  const canCarryForward =
    Boolean(selectedMonthKey) &&
    Boolean(prevMonth) &&
    (prevMonthTarget.revenueInr > 0 || prevMonthTarget.tripCount > 0) &&
    monthTarget.revenueInr === 0 &&
    monthTarget.tripCount === 0;

  const isFutureMonth =
    selectedMonthKey != null && selectedMonthKey > thisMonthKey;

  const periodLabel = selectedMonthKey
    ? monthLabelFromKey(selectedMonthKey)
    : "All months";

  const kamUserId = goalsStore.kamAssignments[clientId] ?? null;
  const kamMember = teamMembers.find((m) => m.user_id === kamUserId) ?? null;

  const maxTrend = useMemo(
    () => Math.max(1, ...monthly.map((p) => p.revenue)),
    [monthly],
  );
  const maxLane = useMemo(
    () => Math.max(1, ...lanes.map((l) => l.revenue)),
    [lanes],
  );
  const maxOrigin = useMemo(
    () => Math.max(1, ...origins.map((o) => o.revenue)),
    [origins],
  );
  const maxDest = useMemo(
    () => Math.max(1, ...destinations.map((d) => d.revenue)),
    [destinations],
  );

  const startEdit = (metric: Exclude<EditMetric, null>) => {
    setEditingMetric(metric);
    setDraftTarget(
      String(
        metric === "revenueInr" ? monthTarget.revenueInr : monthTarget.tripCount || "",
      ),
    );
  };

  const commitEdit = async () => {
    if (!editingMetric || !selectedMonthKey) return;
    const raw = draftTarget.replace(/,/g, "").trim();
    const n = Number(raw);
    const value = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    const next = patchEntityTarget(
      goalsStore,
      selectedMonthKey,
      "client",
      clientId,
      editingMetric === "revenueInr" ? { revenueInr: value } : { tripCount: value },
    );
    setEditingMetric(null);
    await persistGoals(next);
  };

  const handleCarryForward = async () => {
    if (!selectedMonthKey || !prevMonth || !canCarryForward) return;
    const next = patchEntityTarget(
      goalsStore,
      selectedMonthKey,
      "client",
      clientId,
      {
        revenueInr: prevMonthTarget.revenueInr,
        tripCount: prevMonthTarget.tripCount,
      },
    );
    await persistGoals(next);
  };

  const assignKam = async (userId: string | null) => {
    const next = patchKamAssignment(goalsStore, clientId, userId);
    await persistGoals(next);
  };

  const toggleKam = (userId: string) => {
    void assignKam(kamUserId === userId ? null : userId);
  };

  const loading = tripsQ.isLoading || txQ.isLoading || goalsLoading;

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={METRONIC.link} />
        <Text style={styles.loadingText}>Loading lane performance…</Text>
      </View>
    );
  }

  const revProgress = progressPct(monthActuals.revenueInr, monthTarget.revenueInr);
  const tripProgress = progressPct(monthActuals.tripCount, monthTarget.tripCount);
  const filtersOn = hasActiveFilters(filters);

  return (
    <View
      style={styles.root}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.headingRow}>
        <View style={styles.headingLeft}>
          <View style={styles.accent} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.heading, isCompact && styles.headingSm]}>
              Lane Performance
            </Text>
            <Text style={[styles.hint, isCompact && styles.hintSm]} numberOfLines={1}>
              {clientName.trim() || (isSupplier ? "Partner" : "Client")} ·{" "}
              {isSupplier
                ? "Lane spend & payable health"
                : "Connection sales + Goals targets"}
            </Text>
          </View>
        </View>
        {saving ? <Text style={styles.saving}>Saving…</Text> : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {monthOptions.map((key) => {
          const active = key === selectedMonthKey;
          const future = key > thisMonthKey;
          return (
            <Pressable
              key={key}
              onPress={() => selectMonth(key)}
              style={[
                styles.chip,
                isCompact && styles.chipSm,
                active && styles.chipActive,
                future && !active && styles.chipFuture,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  isCompact && styles.chipTextSm,
                  active && styles.chipTextActive,
                  future && !active && styles.chipTextFuture,
                ]}
              >
                {monthLabelFromKey(key)}
                {future ? " · plan" : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {(canCarryForward || selectedMonthKey == null) && (
        <View style={styles.actionRow}>
          {selectedMonthKey == null ? (
            <Text style={styles.scopeHint}>
              All months · tap a month to focus
            </Text>
          ) : null}
          {canCarryForward && prevMonth ? (
            <Pressable
              onPress={() => void handleCarryForward()}
              style={styles.carryBtn}
            >
              <FontAwesome name="copy" size={10} color={METRONIC.link} />
              <Text style={styles.carryBtnText}>
                Carry forward {monthLabelFromKey(prevMonth)}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        <View style={[styles.kpiCard, isCompact && styles.kpiCardCompact]}>
          <Text style={[styles.kpiLabel, isCompact && styles.kpiLabelSm]}>Trips</Text>
          <Text style={[styles.kpiValue, isCompact && styles.kpiValueSm]}>
            {monthActuals.tripCount}
          </Text>
          <Text style={[styles.kpiSub, isCompact && styles.kpiSubSm]}>
            {activeRoutes} lanes
          </Text>
        </View>
        <View style={[styles.kpiCard, isCompact && styles.kpiCardCompact]}>
          <Text style={[styles.kpiLabel, isCompact && styles.kpiLabelSm]}>
            {isSupplier ? "Cost" : "Sales"}
          </Text>
          <Text style={[styles.kpiValue, isCompact && styles.kpiValueSm]}>
            {formatInr(monthActuals.revenueInr)}
          </Text>
          <Text style={[styles.kpiSub, isCompact && styles.kpiSubSm]}>
            Margin {formatInr(monthActuals.margin)}
          </Text>
        </View>
        <View style={[styles.kpiCard, isCompact && styles.kpiCardCompact]}>
          <Text style={[styles.kpiLabel, isCompact && styles.kpiLabelSm]}>
            {isSupplier ? "Open AP" : "Open AR"}
          </Text>
          <Text style={[styles.kpiValue, isCompact && styles.kpiValueSm]}>
            {formatInr(aging.outstanding)}
          </Text>
          <Text style={[styles.kpiSub, isCompact && styles.kpiSubSm]}>
            Aging {formatInr(aging.bucket61_90 + aging.bucket90Plus)}
          </Text>
        </View>
        <View style={[styles.kpiCard, isCompact && styles.kpiCardCompact]}>
          <Text style={[styles.kpiLabel, isCompact && styles.kpiLabelSm]}>Growth</Text>
          <Text
            style={[
              styles.kpiValue,
              isCompact && styles.kpiValueSm,
              growthPct != null
                ? {
                    color:
                      growthPct >= 0
                        ? "#50CD89"
                        : growthPct < 0
                          ? "#F1416C"
                          : METRONIC.text,
                  }
                : null,
            ]}
          >
            {growthPct == null
              ? "—"
              : `${growthPct > 0 ? "+" : ""}${growthPct}%`}
          </Text>
          <Text style={[styles.kpiSub, isCompact && styles.kpiSubSm]}>
            {selectedMonthKey && prevMonth
              ? `vs ${monthLabelFromKey(prevMonth)}`
              : selectedMonthKey
                ? "vs prior"
                : "full window"}
          </Text>
        </View>
      </View>

      {isFutureMonth ? (
        <Text style={styles.futureNote}>
          Planning month — set targets now; actuals appear when trips are booked.
        </Text>
      ) : null}

      <View style={[styles.chartsStack, isCompact && styles.chartsStackSm]}>
        <View style={[styles.card, isCompact && styles.cardSm]}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadCopy}>
              <Text style={[styles.cardTitle, isCompact && styles.cardTitleSm]}>
                {isSupplier ? "Spend trends" : "Sale trends"}
              </Text>
              <Text style={[styles.cardSub, isCompact && styles.cardSubSm]}>
                Monthly billed revenue
                {filtersOn ? " · filtered" : ""}
              </Text>
            </View>
            {filtersOn ? (
              <Pressable onPress={clearFilters} hitSlop={8} style={styles.clearTiny}>
                <Text style={styles.clearTinyText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          {filtersOn ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activeFilterRow}
            >
              {activeFilterPills.map((pill) => (
                <Pressable
                  key={pill.key}
                  onPress={() => toggleFilter(pill.key, pill.value)}
                  style={styles.activeFilterPill}
                  accessibilityLabel={`Clear ${pill.kind} filter`}
                >
                  <Text style={styles.activeFilterKind}>{pill.kind}</Text>
                  <Text style={styles.activeFilterValue} numberOfLines={1}>
                    {chipLabel(pill.value, isCompact ? 14 : 22)}
                  </Text>
                  <FontAwesome name="times" size={9} color={METRONIC.link} />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={[styles.filterHint, isCompact && styles.filterHintSm]}>
              {isCompact
                ? "Tap lane / origin / dest / load to filter"
                : "Tap a lane, origin, dest, or load slice to cross-filter"}
            </Text>
          )}

          <View style={styles.trendRow}>
            {monthly.map((pt) => {
              const h = Math.max(4, Math.round((pt.revenue / maxTrend) * (isCompact ? 40 : 56)));
              const selected = pt.monthKey === selectedMonthKey;
              const future = pt.monthKey > thisMonthKey;
              return (
                <Pressable
                  key={pt.monthKey}
                  onPress={() => selectMonth(pt.monthKey)}
                  style={styles.trendCol}
                >
                  <View style={[styles.trendBarTrack, isCompact && styles.trendBarTrackSm]}>
                    <View
                      style={[
                        styles.trendBarFill,
                        {
                          height: h,
                          backgroundColor: selected
                            ? METRONIC.text
                            : future
                              ? METRONIC.muted
                              : METRONIC.link,
                          opacity: selected ? 1 : future ? 0.35 : 0.85,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.trendLabel,
                      isCompact && styles.trendLabelSm,
                      selected && styles.trendLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {pt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.gridRow, isCompact && styles.gridRowStack]}>
          <View
            style={[
              styles.card,
              isCompact ? styles.gridCardFull : styles.gridCard,
              isCompact && styles.cardSm,
            ]}
          >
            <Text style={[styles.cardTitle, isCompact && styles.cardTitleSm]}>Lane mix</Text>
            <Text style={[styles.cardSub, isCompact && styles.cardSubSm]}>
              Top lanes · {periodLabel}
            </Text>
            <NetworkDesktopSalesDonut
              slices={laneSlices}
              compact={isCompact}
              activeLabel={filters.lane ? chipLabel(filters.lane, 28) : null}
              onSelectLabel={(label) => {
                if (!label) {
                  setFilters((f) => ({ ...f, lane: null }));
                  return;
                }
                const match = lanes.find(
                  (l) => chipLabel(l.label, 28) === label,
                );
                if (match) toggleFilter("lane", match.label);
              }}
              emptyMessage="No lane volume this month."
            />
            {lanes.slice(0, isCompact ? 3 : 4).map((lane) => (
              <Pressable
                key={lane.id}
                onPress={() => toggleFilter("lane", lane.label)}
                style={[
                  styles.laneRow,
                  filters.lane === lane.label && styles.laneRowActive,
                ]}
              >
                <View style={styles.laneCopy}>
                  <Text
                    style={[styles.laneLabel, isCompact && styles.laneLabelSm]}
                    numberOfLines={1}
                  >
                    {isCompact ? chipLabel(lane.label, 36) : lane.label}
                  </Text>
                  <Text style={[styles.laneMeta, isCompact && styles.laneMetaSm]}>
                    {lane.trips} trips · {formatInr(lane.revenue)}
                    {lane.margin !== 0 || lane.revenue > 0
                      ? ` · Margin ${formatInr(lane.margin)} (${lane.marginPct}%)`
                      : ""}
                  </Text>
                </View>
                <View style={styles.laneBarTrack}>
                  <View
                    style={[
                      styles.laneBarFill,
                      {
                        width: `${Math.round((lane.revenue / maxLane) * 100)}%`,
                        backgroundColor:
                          filters.lane === lane.label
                            ? METRONIC.text
                            : METRONIC.link,
                      },
                    ]}
                  />
                </View>
              </Pressable>
            ))}
          </View>

          <View
            style={[
              styles.card,
              isCompact ? styles.gridCardFull : styles.gridCard,
              isCompact && styles.cardSm,
            ]}
          >
            <Text style={[styles.cardTitle, isCompact && styles.cardTitleSm]}>Load type</Text>
            <Text style={[styles.cardSub, isCompact && styles.cardSubSm]}>Revenue by load</Text>
            <NetworkDesktopSalesDonut
              slices={loadSlices}
              compact={isCompact}
              activeLabel={filters.loadType}
              onSelectLabel={(label) =>
                setFilters((f) => ({
                  ...f,
                  loadType: label === f.loadType ? null : label,
                }))
              }
              emptyMessage="No load-type mix yet."
            />
          </View>
        </View>

        <View style={[styles.gridRow, isCompact && styles.gridRowStack]}>
          <View
            style={[
              styles.card,
              isCompact ? styles.gridCardFull : styles.gridCard,
              isCompact && styles.cardSm,
            ]}
          >
            <Text style={[styles.cardTitle, isCompact && styles.cardTitleSm]}>Origins</Text>
            <Text style={[styles.cardSub, isCompact && styles.cardSubSm]}>
              Pickup hubs by revenue
            </Text>
            {origins.length === 0 ? (
              <Text style={styles.empty}>No origin volume.</Text>
            ) : (
              origins.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => toggleFilter("origin", o.label)}
                  style={[
                    styles.laneRow,
                    filters.origin === o.label && styles.laneRowActive,
                  ]}
                >
                  <View style={styles.laneCopy}>
                    <Text
                      style={[styles.laneLabel, isCompact && styles.laneLabelSm]}
                      numberOfLines={1}
                    >
                      {isCompact ? chipLabel(o.label, 28) : o.label}
                    </Text>
                    <Text style={[styles.laneMeta, isCompact && styles.laneMetaSm]}>
                      {o.trips} trips · {formatInr(o.revenue)}
                    </Text>
                  </View>
                  <View style={styles.laneBarTrack}>
                    <View
                      style={[
                        styles.laneBarFill,
                        {
                          width: `${Math.round((o.revenue / maxOrigin) * 100)}%`,
                          backgroundColor:
                            filters.origin === o.label
                              ? METRONIC.text
                              : "#50CD89",
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              ))
            )}
          </View>

          <View
            style={[
              styles.card,
              isCompact ? styles.gridCardFull : styles.gridCard,
              isCompact && styles.cardSm,
            ]}
          >
            <Text style={[styles.cardTitle, isCompact && styles.cardTitleSm]}>
              Destinations
            </Text>
            <Text style={[styles.cardSub, isCompact && styles.cardSubSm]}>
              Drop hubs by revenue
            </Text>
            {destinations.length === 0 ? (
              <Text style={styles.empty}>No destination volume.</Text>
            ) : (
              destinations.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => toggleFilter("destination", d.label)}
                  style={[
                    styles.laneRow,
                    filters.destination === d.label && styles.laneRowActive,
                  ]}
                >
                  <View style={styles.laneCopy}>
                    <Text
                      style={[styles.laneLabel, isCompact && styles.laneLabelSm]}
                      numberOfLines={1}
                    >
                      {isCompact ? chipLabel(d.label, 28) : d.label}
                    </Text>
                    <Text style={[styles.laneMeta, isCompact && styles.laneMetaSm]}>
                      {d.trips} trips · {formatInr(d.revenue)}
                    </Text>
                  </View>
                  <View style={styles.laneBarTrack}>
                    <View
                      style={[
                        styles.laneBarFill,
                        {
                          width: `${Math.round((d.revenue / maxDest) * 100)}%`,
                          backgroundColor:
                            filters.destination === d.label
                              ? METRONIC.text
                              : "#7239EA",
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </View>

        <View style={[styles.gridRow, isCompact && styles.gridRowStack]}>
          <View
            style={[
              styles.card,
              isCompact ? styles.gridCardFull : styles.gridCard,
              isCompact && styles.cardSm,
            ]}
          >
            <Text style={[styles.cardTitle, isCompact && styles.cardTitleSm]}>
              Targets · {periodLabel}
            </Text>
            <Text style={[styles.cardSub, isCompact && styles.cardSubSm]}>
              Synced with Network → Goals
              {isFutureMonth ? " · future plan" : ""}
            </Text>

            {!selectedMonthKey ? (
              <Text style={styles.empty}>
                Select a month to set or carry forward targets.
              </Text>
            ) : (
              <>
                <View style={styles.targetCard}>
                  <View style={styles.targetHead}>
                    <Text style={styles.targetLabel}>Sales revenue</Text>
                    <Pressable onPress={() => startEdit("revenueInr")} hitSlop={8}>
                      <FontAwesome name="pencil" size={11} color={METRONIC.muted} />
                    </Pressable>
                  </View>
                  {editingMetric === "revenueInr" ? (
                    <View style={styles.editRow}>
                      <TextInput
                        style={styles.editInput}
                        value={draftTarget}
                        onChangeText={setDraftTarget}
                        keyboardType="numeric"
                        placeholder="Target ₹"
                        placeholderTextColor={METRONIC.muted}
                        autoFocus
                      />
                      <Pressable
                        onPress={() => void commitEdit()}
                        style={styles.editSave}
                      >
                        <Text style={styles.editSaveText}>Save</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.targetActual}>
                        {formatInr(monthActuals.revenueInr)}
                      </Text>
                      <Text style={styles.targetMeta}>
                        Target{" "}
                        {monthTarget.revenueInr > 0
                          ? formatInr(monthTarget.revenueInr)
                          : "not set"}
                        {monthTarget.revenueInr > 0 ? ` · ${revProgress}%` : ""}
                      </Text>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.min(100, revProgress)}%`,
                              backgroundColor:
                                revProgress >= 100 ? "#50CD89" : METRONIC.link,
                            },
                          ]}
                        />
                      </View>
                    </>
                  )}
                </View>

                <View style={styles.targetCard}>
                  <View style={styles.targetHead}>
                    <Text style={styles.targetLabel}>Trip count</Text>
                    <Pressable onPress={() => startEdit("tripCount")} hitSlop={8}>
                      <FontAwesome name="pencil" size={11} color={METRONIC.muted} />
                    </Pressable>
                  </View>
                  {editingMetric === "tripCount" ? (
                    <View style={styles.editRow}>
                      <TextInput
                        style={styles.editInput}
                        value={draftTarget}
                        onChangeText={setDraftTarget}
                        keyboardType="numeric"
                        placeholder="Trips"
                        placeholderTextColor={METRONIC.muted}
                        autoFocus
                      />
                      <Pressable
                        onPress={() => void commitEdit()}
                        style={styles.editSave}
                      >
                        <Text style={styles.editSaveText}>Save</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.targetActual}>
                        {monthActuals.tripCount}
                      </Text>
                      <Text style={styles.targetMeta}>
                        Target{" "}
                        {monthTarget.tripCount > 0
                          ? monthTarget.tripCount
                          : "not set"}
                        {monthTarget.tripCount > 0 ? ` · ${tripProgress}%` : ""}
                      </Text>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.min(100, tripProgress)}%`,
                              backgroundColor:
                                tripProgress >= 100 ? "#50CD89" : METRONIC.link,
                            },
                          ]}
                        />
                      </View>
                    </>
                  )}
                </View>
              </>
            )}
          </View>

          <View
            style={[
              styles.card,
              isCompact ? styles.gridCardFull : styles.gridCard,
              isCompact && styles.cardSm,
            ]}
          >
            <Text style={[styles.cardTitle, isCompact && styles.cardTitleSm]}>
              {isSupplier ? "AP aging" : "AR aging"}
            </Text>
            <Text style={[styles.cardSub, isCompact && styles.cardSubSm]}>
              Outstanding by bucket
            </Text>
            <NetworkDesktopSalesDonut
              slices={agingSlices}
              compact={isCompact}
              emptyMessage={isSupplier ? "No open payables." : "No open receivables."}
            />
            <View style={styles.agingMeta}>
              <Text style={[styles.laneMeta, isCompact && styles.laneMetaSm]}>
                Outstanding {formatInr(aging.outstanding)}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, isCompact && styles.cardSm]}>
          <Text style={[styles.cardTitle, isCompact && styles.cardTitleSm]}>KAM</Text>
          <Text style={[styles.cardSub, isCompact && styles.cardSubSm]}>
            {kamMember
              ? `Assigned · ${(kamMember.full_name ?? kamMember.email ?? "Member").trim()}`
              : "Assign a key account manager (Goals-linked)"}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              onPress={() => void assignKam(null)}
              style={[
                styles.chip,
                isCompact && styles.chipSm,
                kamUserId == null && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  isCompact && styles.chipTextSm,
                  kamUserId == null && styles.chipTextActive,
                ]}
              >
                Unassigned
              </Text>
            </Pressable>
            {teamMembers.map((m) => {
              const active = m.user_id === kamUserId;
              const label = (m.full_name ?? m.email ?? "Member").trim();
              return (
                <Pressable
                  key={m.user_id}
                  onPress={() => toggleKam(m.user_id)}
                  style={[
                    styles.chip,
                    isCompact && styles.chipSm,
                    active && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isCompact && styles.chipTextSm,
                      active && styles.chipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", gap: 10 },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 28,
  },
  loadingText: { fontSize: 11, fontWeight: "500", color: METRONIC.muted },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headingLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  accent: {
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: METRONIC.link,
    marginTop: 2,
  },
  heading: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.subtle,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headingSm: { fontSize: 8, letterSpacing: 0.5 },
  hint: { marginTop: 2, fontSize: 10, fontWeight: "500", color: METRONIC.muted },
  hintSm: { fontSize: 9 },
  saving: { fontSize: 10, fontWeight: "600", color: METRONIC.link },
  chipRow: { gap: 6, paddingBottom: 2, alignItems: "center" },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    minHeight: 30,
    justifyContent: "center",
    maxWidth: 168,
  },
  chipSm: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 26,
    maxWidth: 140,
  },
  chipActive: {
    backgroundColor: METRONIC.text,
    borderColor: METRONIC.text,
  },
  chipFuture: {
    borderColor: METRONIC.link,
    backgroundColor: "rgba(62, 151, 255, 0.08)",
  },
  chipText: { fontSize: 10, fontWeight: "700", color: METRONIC.text },
  chipTextSm: { fontSize: 9 },
  chipTextActive: { color: Theme.textOnPrimary },
  chipTextFuture: { color: METRONIC.link },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  carryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    minHeight: 32,
  },
  carryBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.link,
  },
  scopeHint: {
    fontSize: 10,
    fontWeight: "600",
    color: METRONIC.link,
    flexShrink: 1,
  },
  futureNote: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.link,
    backgroundColor: "rgba(62, 151, 255, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
  },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kpiRowCompact: { gap: 6 },
  kpiCard: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  kpiCardCompact: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 0,
    maxWidth: "48.5%",
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  kpiLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  kpiLabelSm: { fontSize: 7, letterSpacing: 0.3 },
  kpiValue: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: "800",
    color: METRONIC.text,
    fontVariant: ["tabular-nums"],
  },
  kpiValueSm: { fontSize: 12, marginTop: 2 },
  kpiSub: { marginTop: 2, fontSize: 9, fontWeight: "500", color: METRONIC.muted },
  kpiSubSm: { fontSize: 8, marginTop: 1 },
  chartsStack: { width: "100%", gap: 10 },
  chartsStackSm: { gap: 8 },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 6,
    width: "100%",
    overflow: "hidden",
  },
  cardSm: {
    padding: 9,
    gap: 5,
    borderRadius: 8,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  cardHeadCopy: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: METRONIC.text,
  },
  cardTitleSm: { fontSize: 11 },
  cardSub: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.muted,
  },
  cardSubSm: { fontSize: 9 },
  clearTiny: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: METRONIC.bodyBg,
    borderWidth: 1,
    borderColor: METRONIC.border,
    minHeight: 28,
    justifyContent: "center",
  },
  clearTinyText: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.subtle,
  },
  activeFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 2,
  },
  activeFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(62, 151, 255, 0.35)",
    backgroundColor: "rgba(62, 151, 255, 0.08)",
    minHeight: 26,
  },
  activeFilterKind: {
    fontSize: 8,
    fontWeight: "800",
    color: METRONIC.link,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  activeFilterValue: {
    fontSize: 10,
    fontWeight: "600",
    color: METRONIC.text,
    maxWidth: 110,
  },
  filterHint: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.muted,
    marginBottom: 2,
  },
  filterHintSm: { fontSize: 9 },
  gridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  gridRowStack: {
    flexDirection: "column",
    gap: 8,
  },
  gridCard: {
    flex: 1,
    minWidth: 280,
    maxWidth: "100%",
  },
  gridCardFull: {
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    minHeight: 64,
    paddingTop: 2,
  },
  trendCol: { flex: 1, alignItems: "center", gap: 3, minWidth: 0 },
  trendBarTrack: {
    width: "100%",
    height: 56,
    justifyContent: "flex-end",
    backgroundColor: METRONIC.bodyBg,
    borderRadius: 4,
    overflow: "hidden",
  },
  trendBarTrackSm: { height: 40 },
  trendBarFill: {
    width: "100%",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  trendLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: METRONIC.muted,
    textAlign: "center",
  },
  trendLabelSm: { fontSize: 7 },
  trendLabelActive: { color: METRONIC.text, fontWeight: "800" },
  laneRow: {
    gap: 3,
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 4,
    marginHorizontal: -4,
    borderRadius: 6,
  },
  laneRowActive: {
    backgroundColor: "rgba(62, 151, 255, 0.06)",
  },
  laneCopy: { gap: 1, minWidth: 0 },
  laneLabel: { fontSize: 11, fontWeight: "600", color: METRONIC.text },
  laneLabelSm: { fontSize: 10 },
  laneMeta: { fontSize: 9, fontWeight: "500", color: METRONIC.muted },
  laneMetaSm: { fontSize: 8 },
  laneBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: METRONIC.bodyBg,
    overflow: "hidden",
  },
  laneBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  targetCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: METRONIC.bodyBg,
    padding: 8,
    gap: 4,
    marginTop: 4,
  },
  targetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  targetLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.subtle,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  targetActual: {
    fontSize: 16,
    fontWeight: "800",
    color: METRONIC.text,
    fontVariant: ["tabular-nums"],
  },
  targetMeta: { fontSize: 9, fontWeight: "500", color: METRONIC.muted },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: METRONIC.border,
    overflow: "hidden",
    marginTop: 2,
  },
  progressFill: { height: "100%", borderRadius: 2 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  editInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.text,
  },
  editSave: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: METRONIC.link,
    minHeight: 32,
    justifyContent: "center",
  },
  editSaveText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  agingMeta: { marginTop: 4 },
  empty: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
    paddingVertical: 6,
  },
});
