/**
 * Garrage tab — P&L view: Vehicles Portfolio with period selector and view tabs.
 * Tabs: VEHICLE | TRIPS | REVENUE | PROFIT. Vehicle/revenue/profit show vehicle list; Trips shows trip-level list.
 */
import { LiquidFillPill } from "@/components/LiquidFillPill";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import Theme from "@/constants/Theme";
import { FinancePromoCard } from "@/features/finance/components/FinancePromoCard";
import { useQuery } from "@tanstack/react-query";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { FinancialRowData } from "@/features/finance/components/FinancialRow";
import type { EntityListFilter } from "@/features/finance/components/TreasurySummaryCard";
import { CUSTOMERS_SUPPLIERS } from "@/features/finance/constants/tableColumns";
import { DriverStatusDot } from "@/features/finance/components/FinancialRow";
import {
  selectFleetProfitabilitySummary,
} from "@/features/fleet";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { formatIndianVehicleNumber } from "@/lib/format";
import { usePaginatedScroll } from "@/lib/usePaginatedScroll";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    buildTripPnLListForPeriod,
    buildVehiclePnLList,
    countVehicleMatchedTripsInPeriod,
    formatPeriodLabel,
    resolveVehicleIdForTrip,
    tripInPeriod,
    type VehicleLedgerExpenseRow,
    type GarragePeriodValue,
    type VehiclePnLRow,
} from "../pnl";
import { VehicleAvatar } from "./VehicleAvatar";
import { FleetAnalyticsTab } from "./analytics/FleetAnalyticsTab";
import type { VehicleRow } from "../services/vehicles.service";
import { chunkIdsForRead, readAllPages } from "@/lib/pagination";
import { supabase } from "@/lib/supabase";

export type GarrageViewTab = "vehicle" | "trips" | "revenue" | "profit" | "analytics";

export interface GarrageTabProps {
  organizationId: string | null;
  vehicles?: VehicleRow[];
  /** Drivers for resolving assigned driver per vehicle (one driver per vehicle). */
  drivers?: DriverRow[];
  trips?: TripRow[];
  transactions?: LedgerRow[] | null;
  onTotals?: (totals: { totalIn: number; totalOut: number }) => void;
  onRowSelect?: (
    data: FinancialRowData,
    entityType: "VEHICLE",
    subTab: "garage",
  ) => void;
  /** Period for P&L filter (e.g. '2026-03' or 'ytd-2026'). Defaults to current month. */
  garagePeriod?: GarragePeriodValue;
  onGaragePeriodChange?: (period: GarragePeriodValue) => void;
  searchQuery?: string;
  entityFilter?: EntityListFilter;
  parentLoading?: boolean;
  /** When user taps a trip row in TRIPS tab (opens trip P&L or detail). */
  onTripSelect?: (tripId: string) => void;
  /** Controlled view tab when tabs are rendered by parent (e.g. Finance header). */
  viewTab?: GarrageViewTab;
  onViewTabChange?: (tab: GarrageViewTab) => void;
  topContent?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
  /** Desktop finance parity: hide summary strip under hero/cards. */
  hideSummaryRow?: boolean;
  embedInParentScroll?: boolean;
  onAddPartyPress?: () => void;
}

function formatCurrency(amount: number): string {
  if (amount === 0) return "₹0";
  const prefix = amount < 0 ? "-₹" : "₹";
  return (
    prefix +
    Math.abs(amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })
  );
}

export function GarrageTab({
  organizationId,
  vehicles: vehiclesProp,
  drivers: driversProp = [],
  trips: tripsProp,
  transactions: transactionsProp,
  onTotals,
  onRowSelect,
  garagePeriod: periodProp,
  searchQuery = "",
  entityFilter = "all",
  parentLoading = false,
  onTripSelect,
  viewTab: viewTabProp,
  topContent,
  refreshing = false,
  onRefresh,
  bottomInset = 100,
  hideSummaryRow = false,
  embedInParentScroll = false,
  onAddPartyPress,
}: GarrageTabProps) {
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const defaultPeriod: GarragePeriodValue = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  })();
  const viewTab = viewTabProp ?? "vehicle";
  const period = periodProp ?? defaultPeriod;

  const vehicles = vehiclesProp ?? [];
  const drivers = driversProp ?? [];
  const trips = tripsProp ?? [];
  const vehicleIds = useMemo(() => vehicles.map((vehicle) => vehicle.id), [vehicles]);
  const vehicleLedgerExpenseQuery = useQuery({
    queryKey: ["q", "garage", "vehicle-ledger-expenses", organizationId, period, vehicleIds.join("|")],
    enabled: !!organizationId && vehicleIds.length > 0,
    queryFn: async () => {
      const rows: VehicleLedgerExpenseRow[] = [];
      for (const chunk of chunkIdsForRead(vehicleIds)) {
        const response = await readAllPages<VehicleLedgerExpenseRow, { message: string }>((afterId, limit) => {
          let q = supabase()
            .from("vehicle_ledger_entries")
            .select("id,vehicle_id,trip_id,source_type,amount,created_at")
            .eq("organization_id", organizationId!)
            .in("vehicle_id", chunk);
          if (afterId) q = q.gt("id", afterId);
          return q.order("id", { ascending: true }).limit(limit);
        });
        if (response.error) throw new Error(response.error.message);
        rows.push(...(response.data ?? []));
      }
      return rows;
    },
    staleTime: 45000,
  });
  const tripVehicleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const trip of trips) {
      if (!tripInPeriod(trip, period)) continue;
      const vehicleId = resolveVehicleIdForTrip(trip, vehicles);
      if (vehicleId) map[trip.id] = vehicleId;
    }
    return map;
  }, [period, trips, vehicles]);
  const periodTripIds = useMemo(() => Object.keys(tripVehicleMap), [tripVehicleMap]);
  const vehiclePayablesQuery = useQuery({
    queryKey: ["q", "garage", "vehicle-open-payables", organizationId, period, periodTripIds.join("|")],
    enabled: !!organizationId && periodTripIds.length > 0,
    queryFn: async () => {
      const [fuelRes, tollRes, otherRes] = await Promise.all([
        supabase()
          .from("trip_fuel_entries")
          .select("trip_id,amount_inr,payment_owner,posting_state,reimbursement_state,status")
          .eq("expense_context", "employer")
          .eq("employer_org_id", organizationId!)
          .in("trip_id", periodTripIds),
        supabase()
          .from("trip_toll_entries")
          .select("trip_id,amount_inr,payment_owner,posting_state,reimbursement_state,status")
          .eq("expense_context", "employer")
          .eq("employer_org_id", organizationId!)
          .in("trip_id", periodTripIds),
        supabase()
          .from("trip_other_expenses")
          .select("trip_id,amount_inr,payment_owner,posting_state,reimbursement_state,status")
          .eq("expense_context", "employer")
          .eq("employer_org_id", organizationId!)
          .in("trip_id", periodTripIds),
      ]);
      if (fuelRes.error) throw new Error(fuelRes.error.message);
      if (tollRes.error) throw new Error(tollRes.error.message);
      if (otherRes.error) throw new Error(otherRes.error.message);
      const map: Record<string, number> = {};
      const rows = [
        ...(fuelRes.data ?? []),
        ...(tollRes.data ?? []),
        ...(otherRes.data ?? []),
      ] as Array<{
        trip_id?: string | null;
        amount_inr?: number | null;
        payment_owner?: string | null;
        posting_state?: string | null;
        reimbursement_state?: string | null;
        status?: string | null;
      }>;
      for (const row of rows) {
        const paymentOwner = String(row.payment_owner ?? "").toLowerCase();
        const postingState = String(row.posting_state ?? "").toLowerCase();
        const reimbursementState = String(row.reimbursement_state ?? "").toLowerCase();
        const status = String(row.status ?? "").toLowerCase();
        if (status === "void" || status === "voided") continue;
        if (paymentOwner !== "driver") continue;
        if (postingState !== "posted") continue;
        if (reimbursementState === "reimbursed") continue;
        const tripId = String(row.trip_id ?? "").trim();
        const vehicleId = tripVehicleMap[tripId];
        if (!vehicleId) continue;
        map[vehicleId] = (map[vehicleId] ?? 0) + Math.max(0, Number(row.amount_inr ?? 0) || 0);
      }
      return map;
    },
    staleTime: 45000,
  });

  /** One driver per vehicle: driver.assigned_vehicle_id === vehicle.id. */
  const driverByVehicleId = useMemo(() => {
    const map: Record<string, DriverRow> = {};
    for (const d of drivers) {
      if (d.assigned_vehicle_id) map[d.assigned_vehicle_id] = d;
    }
    return map;
  }, [drivers]);

  const vehicleById = useMemo(() => {
    const map = new Map<string, VehicleRow>();
    for (const v of vehicles) map.set(v.id, v);
    return map;
  }, [vehicles]);

  const vehiclesList = useMemo(() => {
    return buildVehiclePnLList(
      vehicles,
      trips,
      transactionsProp ?? null,
      vehicleLedgerExpenseQuery.data ?? null,
      vehiclePayablesQuery.data ?? null,
      period,
      getTripDisplayNumber,
      organizationId,
    );
  }, [
    vehicles,
    trips,
    transactionsProp,
    vehicleLedgerExpenseQuery.data,
    vehiclePayablesQuery.data,
    period,
    organizationId,
  ]);

  const tripsList = useMemo(() => {
    return buildTripPnLListForPeriod(
      trips,
      vehicles,
      transactionsProp ?? null,
      period,
      getTripDisplayNumber,
    );
  }, [trips, vehicles, transactionsProp, period]);

  const vehicleNameByTrip = (trip: TripRow) => {
    const resolvedVehicleId = resolveVehicleIdForTrip(trip, vehicles);
    if (!resolvedVehicleId) {
      const displayNumber = trip.vehicle_display_number?.trim();
      return displayNumber ? formatIndianVehicleNumber(displayNumber) : "Unassigned";
    }
    const v = vehicles.find((x) => x.id === resolvedVehicleId);
    return (
      (v?.vehicle_number
        ? formatIndianVehicleNumber(v.vehicle_number)
        : null) ?? resolvedVehicleId
    );
  };

  /** Margin excludes unassigned trips — only assigned vehicles count. */
  const assignedOnly = useMemo(
    () => vehiclesList.filter((r) => !r.isUnassigned),
    [vehiclesList],
  );
  const fleetMatchedTripsInPeriod = useMemo(
    () => countVehicleMatchedTripsInPeriod(trips, vehicles, period),
    [trips, vehicles, period],
  );
  const fleetHasVehicleRows = vehicles.length > 0;
  const showPeriodEmptyHint =
    fleetHasVehicleRows && fleetMatchedTripsInPeriod === 0 && viewTab !== "analytics";
  const totalRevenue = useMemo(
    () => assignedOnly.reduce((s, r) => s + r.sales, 0),
    [assignedOnly],
  );
  const totalProfit = useMemo(
    () => assignedOnly.reduce((s, r) => s + r.pnl, 0),
    [assignedOnly],
  );
  const fleetSummary = useMemo(
    () => selectFleetProfitabilitySummary(assignedOnly),
    [assignedOnly],
  );

  const q = searchQuery.trim().toLowerCase();
  const filteredTripsList = useMemo(() => {
    let list = tripsList;
    if (q) {
      list = list.filter(
        (r) =>
          (r.missionId ?? "").toLowerCase().includes(q) ||
          (r.clientName ?? "").toLowerCase().includes(q) ||
          vehicleNameByTrip(r.trip).toLowerCase().includes(q),
      );
    }
    return list;
  }, [tripsList, q, vehicles]);

  const filteredVehiclesList = useMemo(() => {
    let list = vehiclesList;
    if (viewTab === "revenue")
      list = [...list].sort((a, b) => b.sales - a.sales);
    else if (viewTab === "profit")
      list = [...list].sort((a, b) => b.pnl - a.pnl);
    if (q) {
      list = list.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.type || "").toLowerCase().includes(q),
      );
    }
    if (entityFilter === "has_due") list = list.filter((r) => r.expense > 0);
    if (entityFilter === "no_due") list = list.filter((r) => r.expense === 0);
    return list;
  }, [vehiclesList, viewTab, q, entityFilter]);

  const activeFilteredLength =
    viewTab === "trips" ? filteredTripsList.length : filteredVehiclesList.length;
  const garrageTableResetKey = useMemo(
    () =>
      `${viewTab}|${period}|${q}|${entityFilter}|${activeFilteredLength}|${searchQuery}`,
    [viewTab, period, q, entityFilter, activeFilteredLength, searchQuery],
  );
  const {
    visible: visibleTripRows,
    onScroll: onTripTablePaginatedScroll,
  } = usePaginatedScroll(viewTab === "trips" ? filteredTripsList : [], {
    resetKey: garrageTableResetKey,
    enabled: viewTab === "trips",
  });
  const {
    visible: visibleVehicleRows,
    onScroll: onVehicleTablePaginatedScroll,
  } = usePaginatedScroll(viewTab !== "trips" ? filteredVehiclesList : [], {
    resetKey: garrageTableResetKey,
    enabled: viewTab !== "trips",
  });

  const handleGarrageTableScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const p = tabBarScrollProps as {
        onScroll?: (ev?: NativeSyntheticEvent<NativeScrollEvent>) => void;
      };
      p.onScroll?.(e);
      if (viewTab === "trips") onTripTablePaginatedScroll(e);
      else onVehicleTablePaginatedScroll(e);
    },
    [
      tabBarScrollProps,
      viewTab,
      onTripTablePaginatedScroll,
      onVehicleTablePaginatedScroll,
    ],
  );

  useEffect(() => {
    if (onTotals) onTotals({ totalIn: totalRevenue, totalOut: totalProfit });
  }, [onTotals, totalRevenue, totalProfit]);

  if (parentLoading) {
    return <Text style={styles.loading}>Loading…</Text>;
  }

  if (vehicles.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={[
          styles.emptyFleetState,
          { paddingBottom: bottomInset + insets.bottom, flexGrow: 1 },
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.loaderAccent}
            />
          ) : undefined
        }
      >
        {topContent}
        <FinancePromoCard
          variant="garage"
          onCtaPress={onAddPartyPress}
          style={styles.emptyBanner}
        />
      </ScrollView>
    );
  }

  const handleRowPress = (row: VehiclePnLRow) => {
    if (!onRowSelect) return;
    const vehicleRow = row;
    const data: FinancialRowData = {
      id: row.id,
      name: "name" in vehicleRow ? vehicleRow.name : "",
      model: "type" in vehicleRow ? vehicleRow.type : "",
      status: "",
      sales: row.sales,
      expense: "expense" in vehicleRow ? vehicleRow.expense : 0,
    };
    onRowSelect(data, "VEHICLE", "garage");
  };

  const marginPercent =
    totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
  const stickyHeaderIndex = topContent
    ? hideSummaryRow
      ? 1
      : 2
    : hideSummaryRow
      ? 0
      : 1;

  const tripRowsToRender = embedInParentScroll ? filteredTripsList : visibleTripRows;
  const vehicleRowsToRender = embedInParentScroll
    ? filteredVehiclesList
    : visibleVehicleRows;
  const listContentStyle = [
    styles.listScrollContent,
    embedInParentScroll
      ? { paddingBottom: 0 }
      : { paddingBottom: bottomInset + insets.bottom },
  ];

  const listBody = (
    <>
      {topContent}
        {!hideSummaryRow && (
          <View style={styles.summaryWrap}>
            <View style={styles.receivablesSummaryRow}>
              <View style={styles.receivablesSummaryCard}>
                <Text style={styles.receivablesSummaryLabel}>Vehicle Revenue</Text>
                <Text style={styles.receivablesSummaryRevenue}>
                  ₹{totalRevenue.toLocaleString("en-IN")}
                </Text>
                <Text style={styles.receivablesSummarySubline}>
                  Op: ₹{fleetSummary.totalOperationalCost.toLocaleString("en-IN")} · Own: ₹
                  {fleetSummary.totalOwnershipCost.toLocaleString("en-IN")}
                </Text>
              </View>
              <LiquidFillPill
                percentage={marginPercent > 0 ? Math.min(100, marginPercent) : 0}
                label="Margin"
                valuePrefix={marginPercent > 0 ? "+" : ""}
                valueSuffix="%"
                displayValue={marginPercent}
              />
            </View>
            <View style={styles.telemetryStrip}>
              {(fleetSummary.telemetry.length > 0
                ? fleetSummary.telemetry
                : ["Healthy Margin"]).map((label) => (
                <View key={label} style={styles.telemetryChip}>
                  <Text style={styles.telemetryChipText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {viewTab === "analytics" && (
          <FleetAnalyticsTab
            vehiclesList={vehiclesList}
            vehicles={vehicles}
            trips={trips}
            organizationId={organizationId}
          />
        )}
        {viewTab !== "analytics" ? (
          <View style={styles.listHeader}>
            <View style={styles.headerEntityCol}>
              <Text style={[styles.listHeaderCell, styles.ctHeaderLeft]} numberOfLines={1}>
                {viewTab === "trips" ? "Trip" : "Vehicle Entity"}
              </Text>
            </View>
            <View style={styles.headerTripsCol}>
              <Text style={[styles.listHeaderCell, styles.ctHeaderCenter]} numberOfLines={1}>
                Trips
              </Text>
            </View>
            <View style={styles.headerAmtCol}>
              <Text style={[styles.listHeaderCell, styles.ctHeaderRight]} numberOfLines={1}>
                Sales
              </Text>
            </View>
            <View style={styles.headerAmtCol}>
              <Text style={[styles.listHeaderCell, styles.ctHeaderRight]} numberOfLines={1}>
                Expense
              </Text>
            </View>
            <View style={styles.headerAmtCol}>
              <Text style={[styles.listHeaderCell, styles.ctHeaderRight]} numberOfLines={1}>
                P&L
              </Text>
            </View>
          </View>
        ) : null}
        {showPeriodEmptyHint ? (
          <View style={styles.periodEmptyHint}>
            <Text style={styles.periodEmptyHintText}>
              No fleet-matched trips in {formatPeriodLabel(period)}. Trips need a
              linked vehicle or a registration number that matches your garage.
              Try YTD or an earlier month from the period filter.
            </Text>
          </View>
        ) : null}
        {viewTab !== "analytics" ? (
        <View style={styles.listCard}>
          {viewTab === "trips" ? (
            filteredTripsList.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No trips in this period.</Text>
              </View>
            ) : (
              tripRowsToRender.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  style={styles.listRow}
                  onPress={() => {
                    if (onTripSelect) onTripSelect(row.id);
                    else router.push(`/trip/${row.id}` as const);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.listCell, styles.ctEntity]}>
                    <Text style={styles.listEntityName} numberOfLines={1} ellipsizeMode="tail">
                      {row.missionId}
                    </Text>
                    <Text style={styles.listEntitySub} numberOfLines={1} ellipsizeMode="tail">
                      {vehicleNameByTrip(row.trip)} · {row.clientName ?? "—"}
                    </Text>
                  </View>
                  <View style={[styles.listCell, styles.ctTrips]}>
                    <View style={styles.listTripsPill}>
                      <Text style={styles.listTripsPillText}>1</Text>
                    </View>
                  </View>
                  <View style={[styles.listCell, styles.ctAmt]}>
                    <Text style={styles.listAmtValue} numberOfLines={1}>
                      {formatCurrency(row.sales ?? 0)}
                    </Text>
                  </View>
                  <View style={[styles.listCell, styles.ctAmt]}>
                    <Text style={styles.listAmtExpense} numberOfLines={1}>
                      {formatCurrency(row.totalExpense ?? 0)}
                    </Text>
                  </View>
                  <View style={[styles.listCell, styles.ctAmt]}>
                    <Text
                      style={[
                        styles.listOutstandingValue,
                        (row.net ?? 0) > 0
                          ? styles.listOutstandingPositive
                          : (row.net ?? 0) < 0
                            ? styles.listOutstandingNegative
                            : styles.listOutstandingMuted,
                      ]}
                      numberOfLines={1}
                    >
                      {formatCurrency(row.net ?? 0)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )
          ) : filteredVehiclesList.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No vehicle activity in this period.
              </Text>
            </View>
          ) : (
            vehicleRowsToRender.map((row) => {
              const vehicleRow = vehicleById.get(row.id);
              return (
              <TouchableOpacity
                key={row.id}
                style={styles.listRow}
                onPress={() => handleRowPress(row)}
                activeOpacity={0.7}
              >
                <View style={[styles.listCell, styles.ctEntity]}>
                  <View style={styles.listEntityMainRow}>
                    <VehicleAvatar
                      vehicleId={row.id}
                      vehicleNumber={row.name}
                      avatarUrl={vehicleRow?.avatar_url}
                      avatarSeed={vehicleRow?.avatar_seed}
                      size={28}
                    />
                    <Text style={styles.listEntityName} numberOfLines={1} ellipsizeMode="tail">
                      {formatIndianVehicleNumber(row.name) || row.name}
                    </Text>
                    <DriverStatusDot
                      status={driverByVehicleId[row.id]?.status ?? "available"}
                    />
                  </View>
                </View>
                <View style={[styles.listCell, styles.ctTrips]}>
                  <View style={styles.listTripsPill}>
                    <Text style={styles.listTripsPillText}>{row.trips}</Text>
                  </View>
                </View>
                <View style={[styles.listCell, styles.ctAmt]}>
                  <Text style={styles.listAmtValue} numberOfLines={1}>
                    {formatCurrency(row.sales ?? 0)}
                  </Text>
                </View>
                <View style={[styles.listCell, styles.ctAmt]}>
                  <Text style={styles.listAmtExpense} numberOfLines={1}>
                    {formatCurrency(row.expense ?? 0)}
                  </Text>
                </View>
                <View style={[styles.listCell, styles.ctAmt]}>
                  <Text
                    style={[
                      styles.listOutstandingValue,
                      row.pnl > 0
                        ? styles.listOutstandingPositive
                        : row.pnl < 0
                          ? styles.listOutstandingNegative
                          : styles.listOutstandingMuted,
                    ]}
                    numberOfLines={1}
                  >
                    {formatCurrency(row.pnl)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
            })
          )}
        </View>
        ) : null}
    </>
  );

  if (embedInParentScroll) {
    return (
      <View style={[styles.wrap, styles.wrapEmbedded]}>
        <View style={listContentStyle}>{listBody}</View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        {...tabBarScrollProps}
        onScroll={handleGarrageTableScroll}
        scrollEventThrottle={tabBarScrollProps.scrollEventThrottle ?? 100}
        stickyHeaderIndices={viewTab !== "analytics" ? [stickyHeaderIndex] : []}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.loaderAccent}
            />
          ) : undefined
        }
      >
        {listBody}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#FBFBFF" },
  wrapEmbedded: { flex: 0, width: "100%", minWidth: 0 },
  summaryWrap: {
    gap: 8,
  },
  /** Summary row — match Customers tab (Total Outstanding + Collection). */
  receivablesSummaryRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  receivablesSummaryCard: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    padding: 16,
  },
  receivablesSummaryLabel: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  receivablesSummaryRevenue: {
    fontSize: 18,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.darkGreen,
  },
  receivablesSummarySubline: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.3,
  },
  telemetryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
  },
  telemetryChip: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  telemetryChipText: {
    fontSize: 9,
    color: Theme.textMuted,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  /** List layout — same as Customers (Client Entity | Trips | Outstanding). */
  listScroll: { flex: 1 },
  listScrollContent: { paddingHorizontal: 0, paddingTop: 12 },
  periodEmptyHint: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  periodEmptyHintText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  listCard: {
    backgroundColor: "rgba(255,255,255,0.8)",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#F9FAFB",
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  listHeaderCell: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  ctEntity: { flex: CUSTOMERS_SUPPLIERS.node, minWidth: 0 },
  ctTrips: { flex: CUSTOMERS_SUPPLIERS.trips, minWidth: 44, justifyContent: "center" },
  ctAmt: {
    flex: CUSTOMERS_SUPPLIERS.mission,
    minWidth: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  ctHeaderLeft: { textAlign: "left" as const },
  ctHeaderCenter: { textAlign: "center" as const },
  ctHeaderRight: { textAlign: "right" as const },
  headerEntityCol: { flex: CUSTOMERS_SUPPLIERS.node, minWidth: 0, justifyContent: "center" },
  headerTripsCol: { flex: CUSTOMERS_SUPPLIERS.trips, minWidth: 44, justifyContent: "center" },
  headerAmtCol: { flex: CUSTOMERS_SUPPLIERS.mission, minWidth: 0, justifyContent: "center" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  listCell: { paddingHorizontal: 5, minWidth: 0 },
  listEntityName: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    flex: 1,
    minWidth: 0,
  },
  listEntitySub: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 2,
  },
  listEntityMainRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: 8,
  },
  listTripsPill: {
    alignSelf: "center",
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  listTripsPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  listOutstandingValue: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    textAlign: "right",
  },
  listOutstandingPositive: { color: Theme.darkGreen },
  listOutstandingNegative: { color: Theme.teslaRed },
  listOutstandingMuted: { color: Theme.textMuted },
  listAmtValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  listAmtExpense: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "right",
  },
  loading: { padding: 24, textAlign: "center", color: Theme.textSecondary },
  emptyFleetState: {
    alignItems: "stretch",
    flexGrow: 1,
  },
  emptyBanner: {
    width: "100%",
    alignSelf: "stretch",
    paddingTop: 4,
    paddingBottom: 8,
  },
  emptyState: { paddingVertical: 24, alignItems: "center" },
  emptyText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
  },
});
