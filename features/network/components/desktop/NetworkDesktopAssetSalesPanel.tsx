/**
 * Sales → Asset view — own-fleet trip analytics with lane revenue contribution,
 * driver & vehicle performance, and paginated fleet tables.
 */
import Theme from "@/constants/Theme";
import { NetworkDesktopSalesBarChart } from "@/features/network/components/desktop/NetworkDesktopSalesBarChart";
import {
  AssetSidebarDriverAvatar,
  AssetSidebarVehicleAvatar,
  AssetTableDriverCell,
  AssetTableEarningsCell,
  AssetTableKmCell,
  AssetTableMarginCell,
  AssetTablePerformanceCell,
  AssetTableRevenueCell,
  AssetTableTripsCell,
  AssetTableUtilCell,
  AssetTableVehicleCell,
  AssetTableVehicleScoreCell,
} from "@/features/network/components/desktop/NetworkDesktopAssetSalesTableCells";
import { NetworkDesktopSalesDonut } from "@/features/network/components/desktop/NetworkDesktopSalesDonut";
import { NetworkDesktopSalesLineChart } from "@/features/network/components/desktop/NetworkDesktopSalesLineChart";
import { NetworkDesktopSidebarFeatureAd } from "@/features/network/components/desktop/NetworkDesktopSidebarFeatureAd";
import { NetworkDesktopSalesTableOverflow } from "@/features/network/components/desktop/NetworkDesktopSalesTableOverflow";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import {
  buildAssetBodyTypeSlices,
  buildAssetDestinationBarItems,
  buildAssetDriverBarItems,
  buildAssetDriverTableRows,
  buildAssetLaneBarItems,
  buildAssetLaneSlices,
  buildAssetMonthlyTrend,
  buildAssetOriginBarItems,
  buildAssetPerformanceBarItems,
  buildAssetVehicleBarItems,
  buildAssetVehicleMetricBarItems,
  buildAssetVehicleTableRows,
  computeAssetFleetIntelligence,
  computeAssetKpis,
  defaultAssetSalesFilters,
  fleetDriversBase,
  fleetVehiclesBase,
  hasActiveAssetFilters,
  paginateRows,
  uniqueAssetLanes,
  type AssetSalesCrossFilters,
  type SalesDateRange,
} from "@/features/network/utils/assetSalesAnalytics.util";
import { NetworkExportMenu } from "@/features/network/components/desktop/NetworkExportMenu";
import {
  exportAssetVehiclesExcel,
  exportAssetVehiclesPdf,
  exportAssetDriversExcel,
  exportAssetDriversPdf,
} from "@/features/network/lib/networkExport.util";
import { formatINRChip } from "@/lib/format";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useCompleteTripsQuery } from "@/lib/queries/useTripsQuery";
import { useVehiclesQuery } from "@/lib/queries/useVehiclesQuery";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gauge,
  LayoutGrid,
  MoreVertical,
  Search,
  Target,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  orgId: string;
};

const DATE_RANGES: { id: SalesDateRange; label: string }[] = [
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "12 months" },
  { id: "all", label: "All time" },
];

const ON_TIME_OPTIONS = [
  { min: 70, label: "70%+ on-time" },
  { min: 85, label: "85%+ on-time" },
  { min: 95, label: "95%+ on-time" },
];

const UTILIZATION_OPTIONS = [
  { min: 40, label: "40%+ util" },
  { min: 60, label: "60%+ util" },
  { min: 80, label: "80%+ util" },
];

const INTEL_DIMENSIONS: {
  key:
    | "profitability"
    | "utilization"
    | "completion"
    | "costEfficiency"
    | "consistency";
  label: string;
}[] = [
  { key: "profitability", label: "Profit" },
  { key: "utilization", label: "Util" },
  { key: "completion", label: "Done" },
  { key: "costEfficiency", label: "Cost eff" },
  { key: "consistency", label: "Steady" },
];

const PAGE_SIZES = [10, 20, 30] as const;

type AssetPerformanceView = "drivers" | "vehicles";

function laneChipLabel(lane: string): string {
  if (lane.length <= 24) return lane;
  return `${lane.slice(0, 22)}…`;
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
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
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
}) {
  const layout = useProfileHubCompactLayout();
  return (
    <View
      style={[
        styles.salesKpiCard,
        layout.salesKpiCard,
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
      ]}
    >
      <View style={[styles.salesKpiIcon, { marginBottom: 0 }]}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.salesKpiValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.salesKpiLabel} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={styles.salesKpiSub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PerformanceViewToggle({
  view,
  onChange,
}: {
  view: AssetPerformanceView;
  onChange: (view: AssetPerformanceView) => void;
}) {
  const layout = useProfileHubCompactLayout();
  return (
    <View style={[styles.salesPerfViewBar, layout.salesPerfViewBar]}>
      <View>
        <Text style={styles.salesPerfViewTitle}>
          {view === "drivers" ? "Driver performance" : "Vehicle performance"}
        </Text>
        {layout.compact ? null : (
          <Text style={styles.salesPerfViewSub}>
            {view === "drivers"
              ? "Earnings, on-time SLA, and margin by driver"
              : "Utilization, yield, and score by fleet asset"}
          </Text>
        )}
      </View>
      <View
        style={[styles.salesPerfViewToggle, layout.salesPerfViewToggle]}
        accessibilityRole="tablist"
        accessibilityLabel="Asset performance view"
      >
        <Pressable
          onPress={() => onChange("drivers")}
          style={[
            styles.salesPerfViewTab,
            layout.salesPerfViewTab,
            view === "drivers" && styles.salesPerfViewTabOn,
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: view === "drivers" }}
        >
          <Users
            size={14}
            color={view === "drivers" ? METRONIC.accent : METRONIC.muted}
          />
          <Text
            style={[
              styles.salesPerfViewTabText,
              view === "drivers" && styles.salesPerfViewTabTextOn,
            ]}
          >
            Drivers
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange("vehicles")}
          style={[
            styles.salesPerfViewTab,
            layout.salesPerfViewTab,
            view === "vehicles" && styles.salesPerfViewTabOn,
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: view === "vehicles" }}
        >
          <Truck
            size={14}
            color={view === "vehicles" ? METRONIC.accent : METRONIC.muted}
          />
          <Text
            style={[
              styles.salesPerfViewTabText,
              view === "vehicles" && styles.salesPerfViewTabTextOn,
            ]}
          >
            Vehicles
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function NetworkDesktopAssetSalesPanel({ orgId }: Props) {
  const layout = useProfileHubCompactLayout();
  const [trendChartWidth, setTrendChartWidth] = useState(320);
  const [originChartWidth, setOriginChartWidth] = useState(200);
  const [destChartWidth, setDestChartWidth] = useState(200);
  const [filters, setFilters] = useState<AssetSalesCrossFilters>(
    defaultAssetSalesFilters,
  );
  const [tablePage, setTablePage] = useState(1);
  const [rowsPerPage, setRowsPerPage] =
    useState<(typeof PAGE_SIZES)[number]>(10);
  const [driverTableSearch, setDriverTableSearch] = useState("");
  const [vehicleTableSearch, setVehicleTableSearch] = useState("");
  const [driverBarFilter, setDriverBarFilter] = useState<string | null>(null);
  const [vehicleBarFilter, setVehicleBarFilter] = useState<string | null>(null);
  const [vehicleTablePage, setVehicleTablePage] = useState(1);
  const [vehicleRowsPerPage, setVehicleRowsPerPage] =
    useState<(typeof PAGE_SIZES)[number]>(10);
  const [performanceView, setPerformanceView] =
    useState<AssetPerformanceView>("drivers");

  const tripsQ = useCompleteTripsQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const vehiclesQ = useVehiclesQuery(orgId);
  const trips = tripsQ.data ?? [];
  const drivers = driversQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];

  const chartFilters = useMemo((): AssetSalesCrossFilters => filters, [filters]);

  const driverFilters = useMemo(
    (): AssetSalesCrossFilters => ({ ...filters, search: driverTableSearch }),
    [filters, driverTableSearch],
  );

  const vehicleFilters = useMemo(
    (): AssetSalesCrossFilters => ({ ...filters, search: vehicleTableSearch }),
    [filters, vehicleTableSearch],
  );

  const fleetDrivers = useMemo(() => fleetDriversBase(drivers), [drivers]);
  const fleetVehicles = useMemo(() => fleetVehiclesBase(vehicles), [vehicles]);

  const lanes = useMemo(
    () => uniqueAssetLanes(trips, chartFilters),
    [trips, chartFilters],
  );
  const trend = useMemo(
    () => buildAssetMonthlyTrend(trips, chartFilters),
    [trips, chartFilters],
  );
  const laneSlices = useMemo(
    () => buildAssetLaneSlices(trips, chartFilters),
    [trips, chartFilters],
  );
  const bodyTypeSlices = useMemo(
    () => buildAssetBodyTypeSlices(vehicles, trips, chartFilters),
    [vehicles, trips, chartFilters],
  );
  const laneBars = useMemo(
    () => buildAssetLaneBarItems(trips, chartFilters, 6),
    [trips, chartFilters],
  );
  const driverBars = useMemo(
    () => buildAssetDriverBarItems(drivers, trips, chartFilters, 6),
    [drivers, trips, chartFilters],
  );
  const vehicleBars = useMemo(
    () => buildAssetVehicleBarItems(vehicles, trips, chartFilters, 6),
    [vehicles, trips, chartFilters],
  );
  const vehicleUtilBars = useMemo(
    () =>
      buildAssetVehicleMetricBarItems(
        vehicles,
        trips,
        chartFilters,
        "utilization",
        5,
      ),
    [vehicles, trips, chartFilters],
  );
  const vehicleRevKmBars = useMemo(
    () =>
      buildAssetVehicleMetricBarItems(
        vehicles,
        trips,
        chartFilters,
        "revPerKm",
        5,
      ),
    [vehicles, trips, chartFilters],
  );
  const onTimeBars = useMemo(
    () =>
      buildAssetPerformanceBarItems(drivers, trips, chartFilters, "onTime", 5),
    [drivers, trips, chartFilters],
  );
  const marginBars = useMemo(
    () =>
      buildAssetPerformanceBarItems(drivers, trips, chartFilters, "margin", 5),
    [drivers, trips, chartFilters],
  );
  const originBars = useMemo(
    () => buildAssetOriginBarItems(trips, chartFilters, 5),
    [trips, chartFilters],
  );
  const destinationBars = useMemo(
    () => buildAssetDestinationBarItems(trips, chartFilters, 5),
    [trips, chartFilters],
  );
  const kpis = useMemo(
    () => computeAssetKpis(drivers, vehicles, trips, chartFilters),
    [drivers, vehicles, trips, chartFilters],
  );
  const tableRows = useMemo(
    () => buildAssetDriverTableRows(drivers, trips, driverFilters),
    [drivers, trips, driverFilters],
  );
  const vehicleTableRows = useMemo(
    () => buildAssetVehicleTableRows(vehicles, drivers, trips, vehicleFilters),
    [vehicles, drivers, trips, vehicleFilters],
  );
  const pagination = useMemo(
    () => paginateRows(tableRows, tablePage, rowsPerPage),
    [tableRows, tablePage, rowsPerPage],
  );
  const vehiclePagination = useMemo(
    () => paginateRows(vehicleTableRows, vehicleTablePage, vehicleRowsPerPage),
    [vehicleTableRows, vehicleTablePage, vehicleRowsPerPage],
  );
  const fleetIntel = useMemo(
    () => computeAssetFleetIntelligence(tableRows, vehicleTableRows),
    [tableRows, vehicleTableRows],
  );

  const activeDriversForFilter = useMemo(
    () =>
      fleetDrivers
        .filter((d) => driverBars.some((bar) => bar.key === d.id))
        .slice(0, 10),
    [fleetDrivers, driverBars],
  );

  const activeVehiclesForFilter = useMemo(
    () =>
      fleetVehicles
        .filter((v) => vehicleBars.some((bar) => bar.key === v.id))
        .slice(0, 10),
    [fleetVehicles, vehicleBars],
  );

  const filtersActive = hasActiveAssetFilters(chartFilters);

  const patchFilters = (patch: Partial<AssetSalesCrossFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setTablePage(1);
  };

  const clearFilters = () => {
    setFilters(defaultAssetSalesFilters());
    setDriverTableSearch("");
    setVehicleTableSearch("");
    setDriverBarFilter(null);
    setVehicleBarFilter(null);
    setTablePage(1);
    setVehicleTablePage(1);
  };

  const handleDriverBarSelect = (key: string | null) => {
    if (!key) {
      setDriverBarFilter(null);
      patchFilters({ driverSlice: null });
      setDriverTableSearch("");
      setTablePage(1);
      return;
    }
    const driver = driverBars.find((item) => item.key === key);
    setDriverBarFilter(key);
    patchFilters({ driverSlice: key, vehicleSlice: null });
    setDriverTableSearch(driver?.label ?? "");
    setVehicleBarFilter(null);
    setVehicleTableSearch("");
    setTablePage(1);
  };

  const handleVehicleBarSelect = (key: string | null) => {
    if (!key) {
      setVehicleBarFilter(null);
      patchFilters({ vehicleSlice: null });
      setVehicleTableSearch("");
      setVehicleTablePage(1);
      return;
    }
    const vehicle = vehicleBars.find((item) => item.key === key);
    setVehicleBarFilter(key);
    patchFilters({ vehicleSlice: key, driverSlice: null });
    setVehicleTableSearch(vehicle?.label ?? "");
    setDriverBarFilter(null);
    setDriverTableSearch("");
    setVehicleTablePage(1);
  };

  return (
    <View style={[styles.salesBody, layout.salesBody]}>
      <View style={[styles.splitRow, layout.salesSplitRow]}>
        <View style={[styles.sidebar, layout.sidebar]}>
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Intelligent filters</Text>
            <Text style={styles.salesFilterHint}>
              {performanceView === "drivers"
                ? "Cross-filter driver charts and fleet table"
                : "Cross-filter vehicle charts and fleet table"}
            </Text>

            <Text style={styles.salesFilterGroup}>Period</Text>
            <View style={styles.tagWrap}>
              {DATE_RANGES.map((range) => (
                <FilterChip
                  key={range.id}
                  label={range.label}
                  active={filters.dateRange === range.id}
                  onPress={() => patchFilters({ dateRange: range.id })}
                />
              ))}
            </View>

            {performanceView === "drivers" ? (
              <>
                <Text style={styles.salesFilterGroup}>Driver on-time</Text>
                <View style={styles.tagWrap}>
                  {ON_TIME_OPTIONS.map((opt) => (
                    <FilterChip
                      key={opt.min}
                      label={opt.label}
                      active={filters.minOnTimePct === opt.min}
                      onPress={() =>
                        patchFilters({
                          minOnTimePct:
                            filters.minOnTimePct === opt.min ? null : opt.min,
                        })
                      }
                    />
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.salesFilterGroup}>Vehicle utilization</Text>
                <View style={styles.tagWrap}>
                  {UTILIZATION_OPTIONS.map((opt) => (
                    <FilterChip
                      key={opt.min}
                      label={opt.label}
                      active={filters.minUtilizationPct === opt.min}
                      onPress={() =>
                        patchFilters({
                          minUtilizationPct:
                            filters.minUtilizationPct === opt.min
                              ? null
                              : opt.min,
                        })
                      }
                    />
                  ))}
                </View>
              </>
            )}

            {lanes.length > 0 ? (
              <>
                <Text style={styles.salesFilterGroup}>Lanes</Text>
                <View style={styles.tagWrap}>
                  {lanes.slice(0, 12).map((lane) => (
                    <FilterChip
                      key={lane}
                      label={laneChipLabel(lane)}
                      active={filters.lanes.has(lane)}
                      onPress={() =>
                        patchFilters({
                          lanes: toggleSet(filters.lanes, lane),
                          laneSlice: null,
                        })
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            {performanceView === "drivers" &&
            activeDriversForFilter.length > 0 ? (
              <>
                <Text style={styles.salesFilterGroup}>Drivers</Text>
                <View style={styles.tagWrap}>
                  {activeDriversForFilter.map((driver) => (
                    <FilterChip
                      key={driver.id}
                      label={
                        driver.name.length > 18
                          ? `${driver.name.slice(0, 17)}…`
                          : driver.name
                      }
                      active={filters.drivers.has(driver.id)}
                      onPress={() =>
                        patchFilters({
                          drivers: toggleSet(filters.drivers, driver.id),
                          driverSlice: null,
                        })
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            {performanceView === "vehicles" &&
            activeVehiclesForFilter.length > 0 ? (
              <>
                <Text style={styles.salesFilterGroup}>Vehicles</Text>
                <View style={styles.tagWrap}>
                  {activeVehiclesForFilter.map((vehicle) => (
                    <FilterChip
                      key={vehicle.id}
                      label={
                        vehicle.vehicle_number.length > 18
                          ? `${vehicle.vehicle_number.slice(0, 17)}…`
                          : vehicle.vehicle_number
                      }
                      active={filters.vehicles.has(vehicle.id)}
                      onPress={() =>
                        patchFilters({
                          vehicles: toggleSet(filters.vehicles, vehicle.id),
                          vehicleSlice: null,
                        })
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.salesSidebarToggleRow}>
              <Text style={styles.salesSidebarToggleLabel}>
                {performanceView === "drivers"
                  ? "Only drivers with trips"
                  : "Only vehicles with trips"}
              </Text>
              <Switch
                value={filters.onlyWithTrips}
                onValueChange={(v) => patchFilters({ onlyWithTrips: v })}
                trackColor={{
                  false: METRONIC.border,
                  true: "rgba(62, 151, 255, 0.35)",
                }}
                thumbColor={
                  filters.onlyWithTrips ? METRONIC.link : Theme.cardWhite
                }
              />
            </View>

            {filtersActive ? (
              <Pressable onPress={clearFilters} style={styles.salesClearBtn}>
                <Text style={styles.salesClearBtnText}>Clear all filters</Text>
              </Pressable>
            ) : null}
          </View>

          {performanceView === "drivers" ? (
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Top drivers</Text>
            {tableRows.slice(0, 4).map((row, idx) => (
              <Pressable
                key={row.id}
                style={[
                  styles.salesContributorRow,
                  idx === Math.min(3, tableRows.length - 1) &&
                    styles.salesContributorRowLast,
                ]}
                onPress={() => handleDriverBarSelect(row.id)}
              >
                <AssetSidebarDriverAvatar row={row} />
                <View style={styles.salesContributorTextCol}>
                  <Text style={styles.salesContributorName} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={styles.salesContributorMeta}>
                    Score {row.performanceScore} · {row.trips} trips ·{" "}
                    {formatINRChip(row.revenue)}
                  </Text>
                </View>
                <Text style={styles.salesAssetPerfScore}>
                  {row.onTimePct}%
                </Text>
              </Pressable>
            ))}
            {tableRows.length === 0 ? (
              <Text style={styles.salesEmptySide}>
                No fleet drivers match filters.
              </Text>
            ) : null}
          </View>
          ) : null}

          {performanceView === "vehicles" ? (
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Top vehicles</Text>
            {vehicleTableRows.slice(0, 4).map((row, idx) => (
              <Pressable
                key={row.id}
                style={[
                  styles.salesContributorRow,
                  idx === Math.min(3, vehicleTableRows.length - 1) &&
                    styles.salesContributorRowLast,
                ]}
                onPress={() => handleVehicleBarSelect(row.id)}
              >
                <AssetSidebarVehicleAvatar row={row} />
                <View style={styles.salesContributorTextCol}>
                  <Text style={styles.salesContributorName} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={styles.salesContributorMeta}>
                    Score {row.performanceScore} · {row.utilizationPct}% util ·{" "}
                    {formatINRChip(row.revenue)}
                  </Text>
                </View>
                <Text style={styles.salesAssetPerfScore}>
                  {row.revenuePerKm > 0 ? `₹${row.revenuePerKm}` : "—"}
                </Text>
              </Pressable>
            ))}
            {vehicleTableRows.length === 0 ? (
              <Text style={styles.salesEmptySide}>
                No fleet vehicles match filters.
              </Text>
            ) : null}
          </View>
          ) : null}

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Fleet snapshot</Text>
            {performanceView === "drivers" ? (
              <>
                <View style={styles.salesContributorRow}>
                  <Text style={styles.salesContributorMeta}>Active drivers</Text>
                  <Text style={styles.salesContributorName}>
                    {kpis.activeDrivers}
                  </Text>
                </View>
                <View style={styles.salesContributorRow}>
                  <Text style={styles.salesContributorMeta}>On-time SLA</Text>
                  <Text style={styles.salesContributorName}>
                    {kpis.fleetOnTimePct}%
                  </Text>
                </View>
                <View style={styles.salesContributorRow}>
                  <Text style={styles.salesContributorMeta}>Driver earnings</Text>
                  <Text style={styles.salesContributorName}>
                    {formatINRChip(kpis.totalEarnings)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.salesContributorRow,
                    styles.salesContributorRowLast,
                  ]}
                >
                  <Text style={styles.salesContributorMeta}>Fleet margin</Text>
                  <Text style={styles.salesContributorName}>
                    {formatINRChip(kpis.totalMargin)}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.salesContributorRow}>
                  <Text style={styles.salesContributorMeta}>Active vehicles</Text>
                  <Text style={styles.salesContributorName}>
                    {kpis.activeVehicles}
                  </Text>
                </View>
                <View style={styles.salesContributorRow}>
                  <Text style={styles.salesContributorMeta}>Avg utilization</Text>
                  <Text style={styles.salesContributorName}>
                    {kpis.avgUtilizationPct}%
                  </Text>
                </View>
                <View style={styles.salesContributorRow}>
                  <Text style={styles.salesContributorMeta}>Fleet revenue</Text>
                  <Text style={styles.salesContributorName}>
                    {formatINRChip(kpis.totalRevenue)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.salesContributorRow,
                    styles.salesContributorRowLast,
                  ]}
                >
                  <Text style={styles.salesContributorMeta}>Distance covered</Text>
                  <Text style={styles.salesContributorName}>
                    {kpis.totalKm >= 1000
                      ? `${(kpis.totalKm / 1000).toFixed(1)}k km`
                      : `${kpis.totalKm} km`}
                  </Text>
                </View>
              </>
            )}
          </View>

          {layout.compact ? null : (
            <NetworkDesktopSidebarFeatureAd layout="square" />
          )}
        </View>

        <View style={[styles.mainCol, layout.mainCol]}>
          <PerformanceViewToggle
            view={performanceView}
            onChange={setPerformanceView}
          />

          <View style={[styles.salesKpiRow, layout.salesKpiRow]}>
            <KpiCard
              label="Asset trips"
              value={String(kpis.totalTrips)}
              sub={
                filters.monthKey
                  ? "Filtered month"
                  : `${kpis.laneCount} lanes`
              }
              icon={<Truck size={16} color={METRONIC.link} />}
            />
            {performanceView === "drivers" ? (
              <>
                <KpiCard
                  label="Driver earnings"
                  value={formatINRChip(kpis.totalEarnings)}
                  sub="Commission & pay"
                  icon={<Wallet size={16} color={Theme.driverGold} />}
                />
                <KpiCard
                  label="On-time"
                  value={`${kpis.fleetOnTimePct}%`}
                  sub="Completed within SLA"
                  icon={<Clock size={16} color={METRONIC.subtle} />}
                />
                <KpiCard
                  label="Fleet margin"
                  value={formatINRChip(kpis.totalMargin)}
                  sub="Client − supplier"
                  icon={<LayoutGrid size={16} color="#7239EA" />}
                />
              </>
            ) : (
              <>
                <KpiCard
                  label="Revenue"
                  value={formatINRChip(kpis.totalRevenue)}
                  sub={
                    kpis.topLane
                      ? `Top: ${kpis.topLane.split(" → ")[0]}`
                      : undefined
                  }
                  icon={<TrendingUp size={16} color="#50CD89" />}
                />
                <KpiCard
                  label="Utilization"
                  value={`${kpis.avgUtilizationPct}%`}
                  sub="Active-day fleet average"
                  icon={<Gauge size={16} color={METRONIC.link} />}
                />
                <KpiCard
                  label="Fleet assets"
                  value={String(kpis.activeVehicles)}
                  sub={`${kpis.activeDrivers} drivers assigned`}
                  icon={<Users size={16} color={METRONIC.subtle} />}
                />
              </>
            )}
          </View>

          <View
            style={[
              performanceView === "drivers"
                ? styles.salesWidgetRowDual
                : styles.salesWidgetRow,
              layout.salesWidgetRow,
            ]}
          >
            <View
              style={[
                styles.salesCard,
                styles.salesCardPadTight,
                styles.salesWidgetTrend,
              ]}
            >
              <View style={styles.salesWidgetHeader}>
                <Text style={styles.salesCardTitle}>Asset sale trends</Text>
                <NetworkExportMenu
                  actions={[
                    {
                      label: "Export Vehicles Excel",
                      sublabel: "Fleet vehicle P&L report",
                      kind: "excel",
                      onExport: () => exportAssetVehiclesExcel(vehicleTableRows, kpis, "Your workspace", filters.dateRange ?? "All time"),
                    },
                    {
                      label: "Export Vehicles PDF",
                      kind: "pdf",
                      onExport: () => exportAssetVehiclesPdf(vehicleTableRows, kpis, "Your workspace", filters.dateRange ?? "All time"),
                    },
                  ]}
                  triggerStyle={styles.salesCardMenu}
                />
              </View>
              <Text style={styles.salesWidgetSub}>
                Tap a point to cross-filter by month
              </Text>
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
                  height={132}
                  activeMonthKey={filters.monthKey}
                  onSelectMonth={(monthKey) => patchFilters({ monthKey })}
                />
              </View>
            </View>

            <View
              style={[
                styles.salesCard,
                styles.salesCardPadTight,
                styles.salesWidgetDonut,
              ]}
            >
              <View style={styles.salesWidgetHeader}>
                <Text style={styles.salesCardTitle}>Lane mix</Text>
              </View>
              <View style={styles.salesWidgetDonutBody}>
                <NetworkDesktopSalesDonut
                  slices={laneSlices}
                  activeLabel={filters.laneSlice}
                  onSelectLabel={(label) => patchFilters({ laneSlice: label })}
                  emptyMessage="No asset lane trips yet."
                />
              </View>
            </View>

            {performanceView === "vehicles" ? (
              <View
                style={[
                  styles.salesCard,
                  styles.salesCardPadTight,
                  styles.salesWidgetDonut,
                ]}
              >
                <View style={styles.salesWidgetHeader}>
                  <Text style={styles.salesCardTitle}>By body type</Text>
                </View>
                <View style={styles.salesWidgetDonutBody}>
                  <NetworkDesktopSalesDonut
                    slices={bodyTypeSlices}
                    emptyMessage="No vehicle mix yet."
                  />
                </View>
              </View>
            ) : null}
          </View>

          {performanceView === "drivers" ? (
            <>
              <View style={[styles.salesBarRow, layout.salesWidgetRow]}>
                <View
                  style={[
                    styles.salesCard,
                    styles.salesCardPadTight,
                    styles.salesBarPartner,
                  ]}
                >
                  <View style={styles.salesWidgetHeader}>
                    <Text style={styles.salesCardTitle}>Driver contribution</Text>
                  </View>
                  <Text style={styles.salesWidgetSub}>
                    Fleet trip share · tap to filter table
                  </Text>
                  <NetworkDesktopSalesBarChart
                    items={driverBars}
                    orientation="horizontal"
                    activeKey={driverBarFilter}
                    onSelectKey={handleDriverBarSelect}
                    emptyMessage="No driver trips in range."
                    footerText="Trip-weighted share · tap a driver to filter"
                  />
                </View>

                <View
                  style={[
                    styles.salesCard,
                    styles.salesCardPadTight,
                    styles.salesBarPartner,
                  ]}
                >
                  <View style={styles.salesWidgetHeader}>
                    <Text style={styles.salesCardTitle}>Lane contribution</Text>
                  </View>
                  <Text style={styles.salesWidgetSub}>
                    Revenue & trip share by lane
                  </Text>
                  <NetworkDesktopSalesBarChart
                    items={laneBars}
                    orientation="horizontal"
                    activeKey={filters.laneSlice}
                    onSelectKey={(key) => patchFilters({ laneSlice: key })}
                    emptyMessage="No lane trips in range."
                    footerText="Tap a lane to cross-filter"
                  />
                </View>
              </View>

              <View style={[styles.salesBarRowDual, layout.salesWidgetRow]}>
                <View
                  style={[
                    styles.salesCard,
                    styles.salesCardPadTight,
                    styles.salesBarPartner,
                  ]}
                >
                  <View style={styles.salesWidgetHeader}>
                    <Text style={styles.salesCardTitle}>On-time leaders</Text>
                  </View>
                  <Text style={styles.salesWidgetSub}>Driver SLA performance %</Text>
                  <NetworkDesktopSalesBarChart
                    items={onTimeBars}
                    orientation="horizontal"
                    activeKey={driverBarFilter ?? filters.driverSlice}
                    onSelectKey={handleDriverBarSelect}
                    emptyMessage="No on-time data."
                    footerText="% trips completed on schedule"
                  />
                </View>

                <View
                  style={[
                    styles.salesCard,
                    styles.salesCardPadTight,
                    styles.salesBarPartner,
                  ]}
                >
                  <View style={styles.salesWidgetHeader}>
                    <Text style={styles.salesCardTitle}>Margin leaders</Text>
                  </View>
                  <Text style={styles.salesWidgetSub}>Revenue margin by driver</Text>
                  <NetworkDesktopSalesBarChart
                    items={marginBars}
                    orientation="horizontal"
                    activeKey={driverBarFilter ?? filters.driverSlice}
                    onSelectKey={handleDriverBarSelect}
                    emptyMessage="No margin data."
                    footerText="Margin % on assigned trips"
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.salesBarRow, layout.salesWidgetRow]}>
                <View
                  style={[
                    styles.salesCard,
                    styles.salesCardPadTight,
                    styles.salesBarPartner,
                  ]}
                >
                  <View style={styles.salesWidgetHeader}>
                    <Text style={styles.salesCardTitle}>Vehicle contribution</Text>
                  </View>
                  <Text style={styles.salesWidgetSub}>
                    Trip share by truck · tap to filter
                  </Text>
                  <NetworkDesktopSalesBarChart
                    items={vehicleBars}
                    orientation="horizontal"
                    activeKey={vehicleBarFilter ?? filters.vehicleSlice}
                    onSelectKey={handleVehicleBarSelect}
                    emptyMessage="No vehicle trips in range."
                    footerText="Trip-weighted share · tap a vehicle to filter"
                  />
                </View>

                <View
                  style={[
                    styles.salesCard,
                    styles.salesCardPadTight,
                    styles.salesBarPartner,
                  ]}
                >
                  <View style={styles.salesWidgetHeader}>
                    <Text style={styles.salesCardTitle}>Utilization leaders</Text>
                  </View>
                  <Text style={styles.salesWidgetSub}>Active-day % by vehicle</Text>
                  <NetworkDesktopSalesBarChart
                    items={vehicleUtilBars}
                    orientation="horizontal"
                    activeKey={vehicleBarFilter ?? filters.vehicleSlice}
                    onSelectKey={handleVehicleBarSelect}
                    emptyMessage="No utilization data."
                    footerText="Days on road vs period length"
                  />
                </View>

                <View
                  style={[
                    styles.salesCard,
                    styles.salesCardPadTight,
                    styles.salesBarPartner,
                  ]}
                >
                  <View style={styles.salesWidgetHeader}>
                    <Text style={styles.salesCardTitle}>Revenue per km</Text>
                  </View>
                  <Text style={styles.salesWidgetSub}>Yield efficiency by truck</Text>
                  <NetworkDesktopSalesBarChart
                    items={vehicleRevKmBars}
                    orientation="horizontal"
                    activeKey={vehicleBarFilter ?? filters.vehicleSlice}
                    onSelectKey={handleVehicleBarSelect}
                    emptyMessage="No distance revenue data."
                    footerText="INR earned per km driven"
                  />
                </View>
              </View>

              <View
                style={[
                  styles.salesCard,
                  styles.salesCardPadTight,
                  styles.salesBarPartner,
                ]}
              >
                <View style={styles.salesWidgetHeader}>
                  <Text style={styles.salesCardTitle}>Lane contribution</Text>
                </View>
                <Text style={styles.salesWidgetSub}>
                  Revenue & trip share by lane · tap to filter
                </Text>
                <NetworkDesktopSalesBarChart
                  items={laneBars}
                  orientation="horizontal"
                  activeKey={filters.laneSlice}
                  onSelectKey={(key) => patchFilters({ laneSlice: key })}
                  emptyMessage="No lane trips in range."
                  footerText="Trip-weighted share · tap a lane to filter"
                />
              </View>
            </>
          )}

          <View
            style={[
              performanceView === "drivers"
                ? styles.salesBarRowDual
                : styles.salesBarRow,
              layout.salesWidgetRow,
            ]}
          >
            <View
              style={[
                styles.salesCard,
                styles.salesCardPadTight,
                styles.salesBarOrigin,
              ]}
            >
              <View style={styles.salesWidgetHeader}>
                <Text style={styles.salesCardTitle}>Origins</Text>
              </View>
              <Text style={styles.salesWidgetSub}>Pickup lanes</Text>
              <View
                style={styles.salesWidgetChartBody}
                onLayout={(e) => {
                  const w = Math.floor(e.nativeEvent.layout.width);
                  if (w > 0 && w !== originChartWidth) setOriginChartWidth(w);
                }}
              >
                <NetworkDesktopSalesBarChart
                  items={originBars}
                  orientation="vertical"
                  width={originChartWidth}
                  height={128}
                  activeKey={filters.originSlice}
                  onSelectKey={(key) => patchFilters({ originSlice: key })}
                  emptyMessage="No origin data."
                />
              </View>
            </View>

            <View
              style={[
                styles.salesCard,
                styles.salesCardPadTight,
                styles.salesBarDest,
              ]}
            >
              <View style={styles.salesWidgetHeader}>
                <Text style={styles.salesCardTitle}>Destinations</Text>
              </View>
              <Text style={styles.salesWidgetSub}>Drop lanes</Text>
              <View
                style={styles.salesWidgetChartBody}
                onLayout={(e) => {
                  const w = Math.floor(e.nativeEvent.layout.width);
                  if (w > 0 && w !== destChartWidth) setDestChartWidth(w);
                }}
              >
                <NetworkDesktopSalesBarChart
                  items={destinationBars}
                  orientation="vertical"
                  width={destChartWidth}
                  height={128}
                  activeKey={filters.destinationSlice}
                  onSelectKey={(key) =>
                    patchFilters({ destinationSlice: key })
                  }
                  emptyMessage="No destination data."
                />
              </View>
            </View>

            {performanceView === "vehicles" ? (
              <View
                style={[
                  styles.salesCard,
                  styles.salesCardPadTight,
                  styles.salesBarPartner,
                ]}
              >
                <View style={styles.salesWidgetHeader}>
                  <Text style={styles.salesCardTitle}>Fleet intelligence</Text>
                </View>
                <Text style={styles.salesWidgetSub}>
                  Composite vehicle score dimensions (fleet avg)
                </Text>
                <View style={styles.salesContributorRow}>
                  <Gauge size={14} color={METRONIC.link} />
                  <Text style={styles.salesContributorMeta}>
                    Driver avg {fleetIntel.avgDriverScore} · Vehicle avg{" "}
                    {fleetIntel.avgVehicleScore}
                  </Text>
                </View>
                <View style={styles.salesIntelDimList}>
                  {INTEL_DIMENSIONS.map((dim) => {
                    const value = fleetIntel.vehicleScoreDimensions[dim.key];
                    return (
                      <View key={dim.key} style={styles.salesIntelDimRow}>
                        <Text style={styles.salesIntelDimLabel}>{dim.label}</Text>
                        <View style={styles.salesIntelDimTrack}>
                          <View
                            style={[
                              styles.salesIntelDimFill,
                              { width: `${Math.min(100, value)}%` },
                            ]}
                          />
                        </View>
                        <Text style={styles.salesIntelDimValue}>{value}</Text>
                      </View>
                    );
                  })}
                </View>
                <View
                  style={[
                    styles.salesContributorRow,
                    styles.salesContributorRowLast,
                  ]}
                >
                  <Target size={14} color="#50CD89" />
                  <Text style={styles.salesContributorMeta}>
                    Top · {fleetIntel.topVehicleName ?? "—"} (
                    {vehicleTableRows[0]?.performanceScore ?? "—"}) vs{" "}
                    {fleetIntel.topDriverName ?? "—"} (
                    {tableRows[0]?.performanceScore ?? "—"})
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {performanceView === "drivers" ? (
          <View style={[styles.salesCard, styles.salesTableCard]}>
            <View style={[styles.salesTableTitleRow, layout.salesTableTitleRow]}>
              <Text style={styles.salesCardTitle}>Fleet drivers</Text>
              <NetworkExportMenu
                actions={[
                  {
                    label: "Export Drivers Excel",
                    sublabel: "Payroll, commission, settlement",
                    kind: "excel",
                    onExport: () => exportAssetDriversExcel(tableRows, "Your workspace", filters.dateRange ?? "All time"),
                  },
                  {
                    label: "Export Drivers PDF",
                    kind: "pdf",
                    onExport: () => exportAssetDriversPdf(tableRows, "Your workspace", filters.dateRange ?? "All time"),
                  },
                ]}
                triggerStyle={styles.salesCardMenu}
              />
            </View>

            <View style={[styles.salesTableToolbar, layout.salesTableToolbar]}>
              <View style={[styles.salesTableSearch, layout.salesTableSearch]}>
                <Search size={14} color={METRONIC.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search drivers…"
                  placeholderTextColor={METRONIC.muted}
                  value={driverTableSearch}
                  onChangeText={(v) => {
                    setDriverTableSearch(v);
                    if (!v.trim()) setDriverBarFilter(null);
                    setTablePage(1);
                  }}
                />
              </View>
              <View style={styles.salesTableToolbarMid}>
                <Text style={styles.salesToolbarLabel}>Only with trips</Text>
                <Switch
                  value={filters.onlyWithTrips}
                  onValueChange={(v) => patchFilters({ onlyWithTrips: v })}
                  trackColor={{
                    false: METRONIC.border,
                    true: "rgba(62, 151, 255, 0.35)",
                  }}
                  thumbColor={
                    filters.onlyWithTrips ? METRONIC.link : Theme.cardWhite
                  }
                />
              </View>
              <NetworkExportMenu
                actions={[
                  {
                    label: "Export Drivers Excel",
                    kind: "excel",
                    onExport: () => exportAssetDriversExcel(tableRows, "Your workspace", filters.dateRange ?? "All time"),
                  },
                  {
                    label: "Export Drivers PDF",
                    kind: "pdf",
                    onExport: () => exportAssetDriversPdf(tableRows, "Your workspace", filters.dateRange ?? "All time"),
                  },
                ]}
                trigger={
                  <View style={styles.salesColumnsBtn}>
                    <LayoutGrid size={13} color={METRONIC.muted} />
                    <Text style={styles.salesColumnsBtnText}>Export ↓</Text>
                  </View>
                }
              />
            </View>

            <NetworkDesktopSalesTableOverflow compact={layout.compact}>
              <View style={styles.salesTableHead}>
                <View style={styles.salesAssetTableGrid}>
                  <View style={styles.salesColCheck} />
                  <Text
                    style={[styles.salesTableHeadCell, styles.salesColPartner]}
                  >
                    Driver
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColPerformance,
                    ]}
                  >
                    Score
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColTrips,
                      styles.salesGridNumHead,
                    ]}
                  >
                    Trips
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColRevenue,
                      styles.salesGridNumHead,
                    ]}
                  >
                    Revenue
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColMargin,
                      styles.salesGridNumHead,
                    ]}
                  >
                    Margin
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColEarnings,
                      styles.salesGridNumHead,
                    ]}
                  >
                    Earnings
                  </Text>
                  <Text
                    style={[styles.salesTableHeadCell, styles.salesColRegion]}
                  >
                    Top lane
                  </Text>
                  <Text style={[styles.salesTableHeadCell, styles.salesColLast]}>
                    Last trip
                  </Text>
                  <Text
                    style={[styles.salesTableHeadCell, styles.salesColStatus]}
                  >
                    Status
                  </Text>
                  <View style={styles.salesColMenu} />
                </View>
              </View>

              {pagination.rows.length === 0 ? (
                <View style={styles.salesTableEmpty}>
                  <Text style={styles.emptyText}>
                    No asset fleet data for current filters.
                  </Text>
                </View>
              ) : (
                pagination.rows.map((row, idx) => (
                  <Pressable
                    key={row.id}
                    style={[
                      styles.salesTableRow,
                      idx === pagination.rows.length - 1 &&
                        styles.salesTableRowLast,
                    ]}
                    onPress={() => handleDriverBarSelect(row.id)}
                  >
                    <View style={styles.salesAssetTableGrid}>
                      <View style={styles.salesColCheck}>
                        <View style={styles.salesCheckBox} />
                      </View>
                      <View style={styles.salesColPartner}>
                        <AssetTableDriverCell row={row} />
                      </View>
                      <View style={styles.salesColPerformance}>
                        <AssetTablePerformanceCell row={row} />
                      </View>
                      <View style={styles.salesColTrips}>
                        <AssetTableTripsCell row={row} />
                      </View>
                      <View style={styles.salesColRevenue}>
                        <AssetTableRevenueCell row={row} />
                      </View>
                      <View style={styles.salesColMargin}>
                        <AssetTableMarginCell row={row} />
                      </View>
                      <View style={styles.salesColEarnings}>
                        <AssetTableEarningsCell row={row} />
                      </View>
                      <View style={styles.salesColRegion}>
                        <Text style={styles.salesLaneText} numberOfLines={1}>
                          {row.topLane}
                        </Text>
                      </View>
                      <View style={styles.salesColLast}>
                        <Text style={styles.salesLastActiveText} numberOfLines={1}>
                          {row.lastTripLabel ?? "—"}
                        </Text>
                      </View>
                      <View style={styles.salesColStatus}>
                        <View
                          style={[
                            styles.statusPill,
                            row.isActive
                              ? styles.salesStatusLive
                              : styles.salesStatusInvite,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              row.isActive
                                ? styles.salesStatusLiveText
                                : styles.salesStatusInviteText,
                            ]}
                          >
                            {row.isActive ? "Active" : "Idle"}
                          </Text>
                        </View>
                      </View>
                      <Pressable style={styles.salesColMenu}>
                        <MoreVertical size={14} color={METRONIC.muted} />
                      </Pressable>
                    </View>
                  </Pressable>
                ))
              )}
            </NetworkDesktopSalesTableOverflow>

            <View style={[styles.salesPagination, layout.salesPagination]}>
              <View style={styles.salesPageSizeRow}>
                <Text style={styles.salesPageSizeLabel}>Rows per page</Text>
                {PAGE_SIZES.map((size) => (
                  <Pressable
                    key={size}
                    onPress={() => {
                      setRowsPerPage(size);
                      setTablePage(1);
                    }}
                    style={[
                      styles.salesPageSizeBtn,
                      rowsPerPage === size && styles.salesPageSizeBtnOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.salesPageSizeBtnText,
                        rowsPerPage === size && styles.salesPageSizeBtnTextOn,
                      ]}
                    >
                      {size}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.salesPageNav}>
                <Text style={styles.salesPageRange}>
                  {pagination.from} – {pagination.to} of {tableRows.length}
                </Text>
                <Pressable
                  disabled={tablePage <= 1}
                  onPress={() => setTablePage((p) => Math.max(1, p - 1))}
                  style={[
                    styles.salesPageBtn,
                    tablePage <= 1 && styles.salesPageBtnDisabled,
                  ]}
                >
                  <ChevronLeft size={16} color={METRONIC.subtle} />
                </Pressable>
                {Array.from({ length: pagination.totalPages }).map((_, i) => {
                  const page = i + 1;
                  if (
                    pagination.totalPages > 5 &&
                    page !== 1 &&
                    page !== pagination.totalPages &&
                    Math.abs(page - tablePage) > 1
                  ) {
                    return null;
                  }
                  return (
                    <Pressable
                      key={page}
                      onPress={() => setTablePage(page)}
                      style={[
                        styles.salesPageNum,
                        tablePage === page && styles.salesPageNumOn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.salesPageNumText,
                          tablePage === page && styles.salesPageNumTextOn,
                        ]}
                      >
                        {page}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  disabled={tablePage >= pagination.totalPages}
                  onPress={() =>
                    setTablePage((p) =>
                      Math.min(pagination.totalPages, p + 1),
                    )
                  }
                  style={[
                    styles.salesPageBtn,
                    tablePage >= pagination.totalPages &&
                      styles.salesPageBtnDisabled,
                  ]}
                >
                  <ChevronRight size={16} color={METRONIC.subtle} />
                </Pressable>
              </View>
            </View>
          </View>
          ) : null}

          {performanceView === "vehicles" ? (
          <View style={[styles.salesCard, styles.salesTableCard]}>
            <View style={[styles.salesTableTitleRow, layout.salesTableTitleRow]}>
              <View>
                <Text style={styles.salesAssetSectionTitle}>Fleet vehicles</Text>
                <Text style={styles.salesAssetSectionSub}>
                  Vehicle score engine · utilization · revenue per km
                </Text>
              </View>
              <NetworkExportMenu
                actions={[
                  {
                    label: "Export Vehicles Excel",
                    sublabel: "P&L, utilization, scores",
                    kind: "excel",
                    onExport: () => exportAssetVehiclesExcel(vehicleTableRows, kpis, "Your workspace", filters.dateRange ?? "All time"),
                  },
                  {
                    label: "Export Vehicles PDF",
                    kind: "pdf",
                    onExport: () => exportAssetVehiclesPdf(vehicleTableRows, kpis, "Your workspace", filters.dateRange ?? "All time"),
                  },
                ]}
                triggerStyle={styles.salesCardMenu}
              />
            </View>

            <View style={[styles.salesTableToolbar, layout.salesTableToolbar]}>
              <View style={[styles.salesTableSearch, layout.salesTableSearch]}>
                <Search size={14} color={METRONIC.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search vehicles…"
                  placeholderTextColor={METRONIC.muted}
                  value={vehicleTableSearch}
                  onChangeText={(v) => {
                    setVehicleTableSearch(v);
                    if (!v.trim()) setVehicleBarFilter(null);
                    setVehicleTablePage(1);
                  }}
                />
              </View>
              <View style={styles.salesTableToolbarMid}>
                <Text style={styles.salesToolbarLabel}>Only with trips</Text>
                <Switch
                  value={filters.onlyWithTrips}
                  onValueChange={(v) => patchFilters({ onlyWithTrips: v })}
                  trackColor={{
                    false: METRONIC.border,
                    true: "rgba(62, 151, 255, 0.35)",
                  }}
                  thumbColor={
                    filters.onlyWithTrips ? METRONIC.link : Theme.cardWhite
                  }
                />
              </View>
              <NetworkExportMenu
                actions={[
                  {
                    label: "Export Excel (.xlsx)",
                    kind: "excel",
                    onExport: () => exportAssetVehiclesExcel(vehicleTableRows, kpis, "Your workspace", filters.dateRange ?? "All time"),
                  },
                  {
                    label: "Export PDF",
                    kind: "pdf",
                    onExport: () => exportAssetVehiclesPdf(vehicleTableRows, kpis, "Your workspace", filters.dateRange ?? "All time"),
                  },
                ]}
                trigger={
                  <View style={styles.salesColumnsBtn}>
                    <Activity size={13} color={METRONIC.muted} />
                    <Text style={styles.salesColumnsBtnText}>Export ↓</Text>
                  </View>
                }
              />
            </View>

            <NetworkDesktopSalesTableOverflow compact={layout.compact}>
              <View style={styles.salesTableHead}>
                <View style={styles.salesAssetVehicleTableGrid}>
                  <View style={styles.salesColCheck} />
                  <Text
                    style={[styles.salesTableHeadCell, styles.salesColPartner]}
                  >
                    Vehicle
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColPerformance,
                    ]}
                  >
                    Score
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColTrips,
                      styles.salesGridNumHead,
                    ]}
                  >
                    Trips
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColRevenue,
                      styles.salesGridNumHead,
                    ]}
                  >
                    Revenue
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColMargin,
                      styles.salesGridNumHead,
                    ]}
                  >
                    Margin
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColUtil,
                      styles.salesGridNumHead,
                    ]}
                  >
                    Util
                  </Text>
                  <Text
                    style={[
                      styles.salesTableHeadCell,
                      styles.salesColKm,
                      styles.salesGridNumHead,
                    ]}
                  >
                    Km
                  </Text>
                  <Text
                    style={[styles.salesTableHeadCell, styles.salesColRegion]}
                  >
                    Top lane
                  </Text>
                  <Text style={[styles.salesTableHeadCell, styles.salesColLast]}>
                    Driver
                  </Text>
                  <Text
                    style={[styles.salesTableHeadCell, styles.salesColStatus]}
                  >
                    Status
                  </Text>
                  <View style={styles.salesColMenu} />
                </View>
              </View>

              {vehiclePagination.rows.length === 0 ? (
                <View style={styles.salesTableEmpty}>
                  <Text style={styles.emptyText}>
                    No fleet vehicle data for current filters.
                  </Text>
                </View>
              ) : (
                vehiclePagination.rows.map((row, idx) => (
                  <Pressable
                    key={row.id}
                    style={[
                      styles.salesTableRow,
                      idx === vehiclePagination.rows.length - 1 &&
                        styles.salesTableRowLast,
                    ]}
                    onPress={() => handleVehicleBarSelect(row.id)}
                  >
                    <View style={styles.salesAssetVehicleTableGrid}>
                      <View style={styles.salesColCheck}>
                        <View style={styles.salesCheckBox} />
                      </View>
                      <View style={styles.salesColPartner}>
                        <AssetTableVehicleCell row={row} />
                      </View>
                      <View style={styles.salesColPerformance}>
                        <AssetTableVehicleScoreCell row={row} />
                      </View>
                      <View style={styles.salesColTrips}>
                        <AssetTableTripsCell row={row} />
                      </View>
                      <View style={styles.salesColRevenue}>
                        <AssetTableRevenueCell row={row} />
                      </View>
                      <View style={styles.salesColMargin}>
                        <AssetTableMarginCell row={row} />
                      </View>
                      <View style={styles.salesColUtil}>
                        <AssetTableUtilCell row={row} />
                      </View>
                      <View style={styles.salesColKm}>
                        <AssetTableKmCell row={row} />
                      </View>
                      <View style={styles.salesColRegion}>
                        <Text style={styles.salesLaneText} numberOfLines={1}>
                          {row.topLane}
                        </Text>
                      </View>
                      <View style={styles.salesColLast}>
                        <Text style={styles.salesLastActiveText} numberOfLines={1}>
                          {row.primaryDriver ?? "—"}
                        </Text>
                      </View>
                      <View style={styles.salesColStatus}>
                        <View
                          style={[
                            styles.statusPill,
                            row.isActive
                              ? styles.salesStatusLive
                              : styles.salesStatusInvite,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              row.isActive
                                ? styles.salesStatusLiveText
                                : styles.salesStatusInviteText,
                            ]}
                          >
                            {row.isActive ? "Active" : "Idle"}
                          </Text>
                        </View>
                      </View>
                      <Pressable style={styles.salesColMenu}>
                        <MoreVertical size={14} color={METRONIC.muted} />
                      </Pressable>
                    </View>
                  </Pressable>
                ))
              )}
            </NetworkDesktopSalesTableOverflow>

            <View style={[styles.salesPagination, layout.salesPagination]}>
              <View style={styles.salesPageSizeRow}>
                <Text style={styles.salesPageSizeLabel}>Rows per page</Text>
                {PAGE_SIZES.map((size) => (
                  <Pressable
                    key={size}
                    onPress={() => {
                      setVehicleRowsPerPage(size);
                      setVehicleTablePage(1);
                    }}
                    style={[
                      styles.salesPageSizeBtn,
                      vehicleRowsPerPage === size && styles.salesPageSizeBtnOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.salesPageSizeBtnText,
                        vehicleRowsPerPage === size &&
                          styles.salesPageSizeBtnTextOn,
                      ]}
                    >
                      {size}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.salesPageNav}>
                <Text style={styles.salesPageRange}>
                  {vehiclePagination.from} – {vehiclePagination.to} of{" "}
                  {vehicleTableRows.length}
                </Text>
                <Pressable
                  disabled={vehicleTablePage <= 1}
                  onPress={() =>
                    setVehicleTablePage((p) => Math.max(1, p - 1))
                  }
                  style={[
                    styles.salesPageBtn,
                    vehicleTablePage <= 1 && styles.salesPageBtnDisabled,
                  ]}
                >
                  <ChevronLeft size={16} color={METRONIC.subtle} />
                </Pressable>
                {Array.from({ length: vehiclePagination.totalPages }).map(
                  (_, i) => {
                    const page = i + 1;
                    if (
                      vehiclePagination.totalPages > 5 &&
                      page !== 1 &&
                      page !== vehiclePagination.totalPages &&
                      Math.abs(page - vehicleTablePage) > 1
                    ) {
                      return null;
                    }
                    return (
                      <Pressable
                        key={page}
                        onPress={() => setVehicleTablePage(page)}
                        style={[
                          styles.salesPageNum,
                          vehicleTablePage === page && styles.salesPageNumOn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.salesPageNumText,
                            vehicleTablePage === page &&
                              styles.salesPageNumTextOn,
                          ]}
                        >
                          {page}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
                <Pressable
                  disabled={vehicleTablePage >= vehiclePagination.totalPages}
                  onPress={() =>
                    setVehicleTablePage((p) =>
                      Math.min(vehiclePagination.totalPages, p + 1),
                    )
                  }
                  style={[
                    styles.salesPageBtn,
                    vehicleTablePage >= vehiclePagination.totalPages &&
                      styles.salesPageBtnDisabled,
                  ]}
                >
                  <ChevronRight size={16} color={METRONIC.subtle} />
                </Pressable>
              </View>
            </View>
          </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
