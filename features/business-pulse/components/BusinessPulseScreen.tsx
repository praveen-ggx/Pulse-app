import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  IndianRupee,
  ListChecks,
  ShieldAlert,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react-native";
import Theme from "@/constants/Theme";
import {
  PULSE_PAGE_BG,
  pulseEnterpriseStyles as ent,
} from "@/features/business-pulse/components/pulseEnterpriseStyles";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useCompleteTripsQuery } from "@/lib/queries/useTripsQuery";
import { useVehiclesQuery } from "@/lib/queries/useVehiclesQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { supabase } from "@/lib/supabase";
import {
  applyPulseFilters,
  selectBusinessPulseOverview,
  selectCashExposure,
  selectClientProfitability,
  selectComplianceExpiryRisk,
  selectDocumentVerificationExposure,
  selectDriverComplianceExposure,
  selectDriverSettlementRisk,
  selectOperationalHealth,
  selectRevenueTrend,
  selectSupplierProfitability,
  selectSupplierReliability,
  selectSupplierSettlementExposure,
  selectPayableAging,
  selectReceivableAging,
  selectBranchCitySlices,
  selectBranchCitySlicesFromTrips,
  selectAssetFleetSummary,
  selectAssetFleetVehicles,
  selectAssetDriverPayroll,
} from "@/features/business-pulse/selectors";
import { restrictToAssetExecution } from "@/features/business-pulse/lib/pulseDomainScope.util";
import {
  executionModelsForScope,
  executionScopeFromFilters,
  type ExecutionScope,
} from "@/features/business-pulse/lib/pulseExecutionScope.util";
import { PulseIntelligenceChart } from "@/features/business-pulse/components/PulseIntelligenceChart";
import { PulseDashboardCard } from "@/features/business-pulse/components/PulseDashboardCard";
import { PulseSegmentDonut } from "@/features/business-pulse/components/PulseSegmentDonut";
import { PulseTopContributorsList } from "@/features/business-pulse/components/PulseTopContributorsList";
import { PulseScopeTabRow } from "@/features/business-pulse/components/PulseScopeTabRow";
import { PulseScopeRibbon } from "@/features/business-pulse/components/PulseScopeRibbon";
import { PulseBranchCityWidget } from "@/features/business-pulse/components/PulseBranchCityWidget";
import { PulseScopeIntelCard } from "@/features/business-pulse/components/PulseScopeIntelCard";
import {
  PulseDomainTabLayout,
  PulseDomainKpiStrip,
} from "@/features/business-pulse/components/PulseDomainTabLayout";
import { PulseEntityFilterPanel } from "@/features/business-pulse/components/PulseEntityFilterPanel";
import {
  PulseWidgetCol,
  PulseOverviewDesktopLayout,
  PulseWidgetRow,
  usePulseDesktopLayout,
} from "@/features/business-pulse/components/PulseWidgetBoard";
import type { FinanceAgingKind } from "@/features/business-pulse/selectors/pulseAgingSelectors";
import { PulseAgingReport } from "@/features/business-pulse/components/PulseAgingReport";
import { PulseContributionFilters } from "@/features/business-pulse/components/PulseContributionFilters";
import { PulseDateRangeTabBar } from "@/features/business-pulse/components/PulseDateRangeTabBar";
import { PulseDrilldownTable } from "@/features/business-pulse/components/PulseDrilldownTable";
import {
  PulseRankingTable,
  type PulseTableRow,
} from "@/features/business-pulse/components/PulseRankingTable";
import {
  PULSE_CLIENT_COLUMNS,
  PULSE_CLIENT_MINI_COLUMNS,
  PULSE_COMPLIANCE_COLUMNS,
  PULSE_COMPLIANCE_MINI_COLUMNS,
  PULSE_DRIVER_MINI_COLUMNS,
  PULSE_DRIVER_PAYROLL_COLUMNS,
  PULSE_FLEET_VEHICLE_COLUMNS,
  PULSE_FLEET_VEHICLE_MINI_COLUMNS,
  PULSE_ROUTE_COLUMNS,
  PULSE_ROUTE_MINI_COLUMNS,
  PULSE_SUPPLIER_COLUMNS,
  PULSE_SUPPLIER_MINI_COLUMNS,
} from "@/features/business-pulse/lib/pulseTableColumns";
import {
  buildPulsePartyMaps,
  pulsePartyForRoute,
  resolvePulseParty,
} from "@/features/business-pulse/lib/pulsePartyAvatars.util";
import { buildPulseDrilldownView } from "@/features/business-pulse/lib/pulseDrilldownContext.util";
import {
  buildVehicleLabelMap,
  vehicleDisplayLabel,
} from "@/features/business-pulse/lib/vehicleDisplay.util";
import { usePulseFilters } from "@/features/business-pulse/state/pulseFilterStore";
import type { PulseDataset } from "@/features/business-pulse/types";
import { formatIndianVehicleNumber } from "@/lib/format";
import {
  computePeriodDeltaPct,
  formatCompareCaption,
  getCompareDateRange,
  getEffectiveDateRange,
  getPresetDateRange,
  type ComparePreset,
  type TimePreset,
} from "@/features/business-pulse/lib/pulseCompare.util";

type DomainTab =
  | "overview"
  | "sales"
  | "supply"
  | "fleet"
  | "drivers"
  | "finance"
  | "compliance"
  | "operations";
type WidgetDensity = "tiny" | "compact" | "standard";

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function MetricCard({
  title,
  value,
  deltaPct,
  insight,
  state,
  compareActive,
  desktopQuarter,
  icon,
  barPct,
}: {
  title: string;
  value: string;
  deltaPct: number;
  insight: string;
  state: "healthy" | "warning" | "critical";
  density: WidgetDensity;
  compareActive: boolean;
  desktopQuarter?: boolean;
  icon?: ReactNode;
  barPct?: number;
}) {
  const up = deltaPct >= 0;
  const accentStyle =
    state === "healthy"
      ? ent.kpiAccentHealthy
      : state === "warning"
        ? ent.kpiAccentWarning
        : ent.kpiAccentCritical;
  const barColor =
    state === "healthy" ? Theme.primary : state === "warning" ? "#f59e0b" : "#ef4444";
  const barFill = typeof barPct === "number" ? Math.min(100, Math.max(0, barPct)) : null;

  return (
    <View
      style={[
        ent.kpiCard,
        styles.metricCard,
        desktopQuarter && styles.metricCardQuarter,
        accentStyle,
      ]}
    >
      <View style={styles.kpiTopRow}>
        {icon ? <View style={styles.kpiIconChip}>{icon}</View> : null}
        <Text style={[ent.kpiTitle, icon ? styles.kpiTitleWithIcon : null]} numberOfLines={1}>{title}</Text>
        {compareActive ? (
          <View style={[styles.deltaBadge, up ? styles.deltaBadgeUp : styles.deltaBadgeDown]}>
            <Text style={[styles.deltaBadgeText, up ? styles.positive : styles.negative]}>
              {up ? "+" : "−"}{Math.abs(deltaPct).toFixed(1)}%
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={ent.kpiValue} numberOfLines={1}>{value}</Text>
      <Text style={ent.kpiInsight} numberOfLines={1}>{insight}</Text>
      {barFill !== null ? (
        <View style={styles.kpiBarTrack}>
          <View style={[styles.kpiBarFill, { width: `${barFill}%` as unknown as number, backgroundColor: barColor }]} />
        </View>
      ) : null}
    </View>
  );
}

function DomainTabBar({ active, onChange }: { active: DomainTab; onChange: (tab: DomainTab) => void }) {
  const tabs: Array<{ key: DomainTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "sales", label: "Sales" },
    { key: "supply", label: "Supply" },
    { key: "fleet", label: "Fleet" },
    { key: "drivers", label: "Drivers" },
    { key: "finance", label: "Finance" },
    { key: "compliance", label: "Compliance" },
    { key: "operations", label: "Operations" },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={ent.filterTabRow}
      keyboardShouldPersistTaps="handled"
    >
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={ent.filterTab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[ent.filterTabText, selected && ent.filterTabTextActive]}>
              {tab.label}
            </Text>
            {selected ? <View style={ent.filterTabIndicator} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type BusinessPulseScreenProps = {
  /** When true, route shell already provides top bar — hide duplicate chrome */
  embedded?: boolean;
  /** Extra top inset when not embedded (standalone route adds its own) */
  topInset?: number;
};

export function BusinessPulseScreen({ embedded = false, topInset }: BusinessPulseScreenProps) {
  const insets = useSafeAreaInsets();
  const resolvedTopInset = topInset ?? (embedded ? 0 : insets.top + 8);
  const { width } = useWindowDimensions();
  const { isDesktop } = usePulseDesktopLayout();
  const wide = width >= 720;
  const kpiQuarter = isDesktop;
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const { filters, toggleFilterValue, setDateRange, setFilters, resetFilters } = usePulseFilters();

  const [activeDomain, setActiveDomain] = useState<DomainTab>("overview");
  const density: WidgetDensity = "compact";
  const [timePreset, setTimePreset] = useState<TimePreset>("all");
  const [comparePreset, _setComparePreset] = useState<ComparePreset>("none");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [financeLedger, setFinanceLedger] = useState<FinanceAgingKind>("receivable");
  const scrollRef = useRef<ScrollView>(null);

  const clientsQuery = useClientsQuery(orgId);
  const suppliersQuery = useSuppliersQuery(orgId);
  const tripsQuery = useCompleteTripsQuery(orgId);
  const vehiclesQuery = useVehiclesQuery(orgId);
  const driversQuery = useDriversQuery(orgId);

  const pulseAuxQuery = useQuery({
    queryKey: ["q", "business-pulse", "aux", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [vehicleLedger, fuelRows, tollRows, maintenanceRows] = await Promise.all([
        supabase()
          .from("vehicle_ledger_entries")
          .select("id,trip_id,vehicle_id,source_type,amount,created_at")
          .eq("organization_id", orgId!)
          .order("created_at", { ascending: false })
          .limit(4000),
        supabase()
          .from("trip_fuel_entries")
          .select("id,trip_id,amount_inr,approval_state,reimbursement_state,payment_owner,posting_state,status")
          .eq("expense_context", "employer")
          .eq("employer_org_id", orgId!)
          .order("created_at", { ascending: false })
          .limit(4000),
        supabase()
          .from("trip_toll_entries")
          .select("id,trip_id,amount_inr,approval_state,reimbursement_state,payment_owner,posting_state,status")
          .eq("expense_context", "employer")
          .eq("employer_org_id", orgId!)
          .order("created_at", { ascending: false })
          .limit(4000),
        supabase()
          .from("vehicle_maintenance_entries")
          .select("id,vehicle_id,amount_inr,status,created_at")
          .eq("organization_id", orgId!)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);
      if (vehicleLedger.error) throw new Error(vehicleLedger.error.message);
      if (fuelRows.error) throw new Error(fuelRows.error.message);
      if (tollRows.error) throw new Error(tollRows.error.message);
      if (maintenanceRows.error) throw new Error(maintenanceRows.error.message);
      return {
        vehicleLedger: vehicleLedger.data ?? [],
        fuelRows: fuelRows.data ?? [],
        tollRows: tollRows.data ?? [],
        maintenanceRows: maintenanceRows.data ?? [],
      };
    },
    staleTime: 60_000,
  });

  const loading =
    clientsQuery.isLoading ||
    suppliersQuery.isLoading ||
    tripsQuery.isLoading ||
    vehiclesQuery.isLoading ||
    driversQuery.isLoading ||
    pulseAuxQuery.isLoading;

  const dataset: PulseDataset = useMemo(
    () => ({
      trips: tripsQuery.data ?? [],
      clients: clientsQuery.data ?? [],
      suppliers: suppliersQuery.data ?? [],
      vehicles: vehiclesQuery.data ?? [],
      drivers: driversQuery.data ?? [],
      vehicleLedger: pulseAuxQuery.data?.vehicleLedger ?? [],
      fuelRows: pulseAuxQuery.data?.fuelRows ?? [],
      tollRows: pulseAuxQuery.data?.tollRows ?? [],
      maintenanceRows: pulseAuxQuery.data?.maintenanceRows ?? [],
    }),
    [
      tripsQuery.data,
      clientsQuery.data,
      suppliersQuery.data,
      vehiclesQuery.data,
      driversQuery.data,
      pulseAuxQuery.data?.vehicleLedger,
      pulseAuxQuery.data?.fuelRows,
      pulseAuxQuery.data?.tollRows,
      pulseAuxQuery.data?.maintenanceRows,
    ],
  );

  const partyMaps = useMemo(() => buildPulsePartyMaps(dataset), [dataset]);

  const effectiveRange = useMemo(
    () => getEffectiveDateRange(timePreset, filters.dateRange, comparePreset),
    [comparePreset, filters.dateRange, timePreset],
  );

  const activeFilters = useMemo(() => {
    if (comparePreset === "none" || !effectiveRange?.start || !effectiveRange?.end) {
      return filters;
    }
    return { ...filters, dateRange: effectiveRange };
  }, [comparePreset, effectiveRange, filters]);

  const executionScope = useMemo(
    () => executionScopeFromFilters(activeFilters),
    [activeFilters],
  );

  const setExecutionScope = useCallback(
    (scope: ExecutionScope) => {
      setFilters({ executionModels: executionModelsForScope(scope) });
    },
    [setFilters],
  );

  const compareRange = useMemo(
    () => getCompareDateRange(effectiveRange, comparePreset),
    [comparePreset, effectiveRange],
  );

  const compareFilters = useMemo(
    () =>
      compareRange?.start && compareRange?.end
        ? { ...filters, dateRange: compareRange }
        : null,
    [compareRange, filters],
  );

  const compareCaption = useMemo(
    () => formatCompareCaption(comparePreset, effectiveRange, compareRange),
    [comparePreset, compareRange, effectiveRange],
  );

  const compareActive = comparePreset !== "none" && compareFilters != null;

  const scoped = useMemo(() => applyPulseFilters(dataset, activeFilters), [activeFilters, dataset]);
  const assetScoped = useMemo(() => restrictToAssetExecution(scoped), [scoped]);

  const branchCitySlices = useMemo(
    () => selectBranchCitySlices(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const overview = useMemo(
    () => selectBusinessPulseOverview(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const revenueTrend = useMemo(() => selectRevenueTrend(dataset, activeFilters), [activeFilters, dataset]);
  const clientProfitability = useMemo(
    () => selectClientProfitability(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const contributorRows = useMemo(
    () =>
      clientProfitability.slice(0, 6).map((client) => ({
        id: client.id,
        name: client.name,
        meta: `${client.tripCount} trips · ${inr(client.revenue)} revenue`,
        selected: filters.clientIds.includes(client.id),
        party: resolvePulseParty(partyMaps.clients, client.id, client.name, "client"),
      })),
    [clientProfitability, filters.clientIds, partyMaps.clients],
  );

  const revenueSegmentSlices = useMemo(() => {
    const palette = ["#4D3636", "#3B82F6", "#4D3636", "#71717A", "#A1A1AA"];
    const top = clientProfitability.slice(0, 4);
    const otherRevenue = clientProfitability
      .slice(4)
      .reduce((sum, client) => sum + client.revenue, 0);
    const slices = top.map((client, index) => ({
      label: client.name,
      value: client.revenue,
      color: palette[index] ?? palette[4]!,
    }));
    if (otherRevenue > 0) {
      slices.push({ label: "Other clients", value: otherRevenue, color: palette[4]! });
    }
    return slices.filter((slice) => slice.value > 0);
  }, [clientProfitability]);

  const supplierProfitability = useMemo(
    () => selectSupplierProfitability(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const supplierReliability = useMemo(
    () => selectSupplierReliability(dataset, activeFilters),
    [activeFilters, dataset],
  );

  const supplierContributorRows = useMemo(
    () =>
      supplierProfitability.slice(0, 5).map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        meta: `${inr(supplier.contributionMargin)} margin · ${supplierReliability.find((r) => r.id === supplier.id)?.reliabilityScore.toFixed(0) ?? "0"}% reliability`,
        selected: filters.supplierIds.includes(supplier.id),
        party: resolvePulseParty(partyMaps.suppliers, supplier.id, supplier.name, "supplier"),
      })),
    [supplierProfitability, supplierReliability, filters.supplierIds, partyMaps.suppliers],
  );

  const clientRankingRows = useMemo(
    () =>
      clientProfitability.map((client) => ({
        id: client.id,
        selected: filters.clientIds.includes(client.id),
        party: resolvePulseParty(partyMaps.clients, client.id, client.name, "client"),
        cells: {
          name: client.name,
          trips: String(client.tripCount),
          revenue: inr(client.revenue),
          margin: inr(client.margin),
          marginTone: client.margin >= 0 ? "positive" : "negative",
        },
      })),
    [clientProfitability, filters.clientIds, partyMaps.clients],
  );

  const supplierSettlement = useMemo(
    () => selectSupplierSettlementExposure(dataset, activeFilters),
    [activeFilters, dataset],
  );

  const supplierRankingRows = useMemo(
    () =>
      supplierProfitability.map((supplier) => {
        const rel = supplierReliability.find((r) => r.id === supplier.id);
        const settle = supplierSettlement.find((s) => s.id === supplier.id);
        const tone: PulseTableRow["tone"] =
          rel?.risk === "critical"
            ? "critical"
            : rel?.risk === "warning"
              ? "warning"
              : "healthy";
        return {
          id: supplier.id,
          selected: filters.supplierIds.includes(supplier.id),
          tone,
          party: resolvePulseParty(partyMaps.suppliers, supplier.id, supplier.name, "supplier"),
          cells: {
            name: supplier.name,
            reliability: rel?.reliabilityScore.toFixed(0) ?? "0",
            margin: inr(supplier.contributionMargin),
            settlement: inr(settle?.settlementExposure ?? 0),
          },
        };
      }),
    [
      supplierProfitability,
      supplierReliability,
      supplierSettlement,
      filters.supplierIds,
      partyMaps.suppliers,
    ],
  );

  const supplierSettlementSlices = useMemo(() => {
    const palette = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];
    return supplierProfitability
      .slice(0, 5)
      .map((supplier, index) => ({
        label: supplier.name,
        value: supplierSettlement.find((x) => x.id === supplier.id)?.settlementExposure ?? 0,
        color: palette[index % palette.length]!,
      }))
      .filter((slice) => slice.value > 0);
  }, [supplierProfitability, supplierSettlement]);
  const driverSettlement = useMemo(
    () => selectDriverSettlementRisk(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const driverCompliance = useMemo(
    () => selectDriverComplianceExposure(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const complianceRisk = useMemo(
    () => selectComplianceExpiryRisk(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const docExposure = useMemo(
    () => selectDocumentVerificationExposure(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const cash = useMemo(() => selectCashExposure(dataset, activeFilters), [activeFilters, dataset]);
  const operations = useMemo(
    () => selectOperationalHealth(dataset, activeFilters),
    [activeFilters, dataset],
  );

  const compareOverview = useMemo(
    () => (compareFilters ? selectBusinessPulseOverview(dataset, compareFilters) : null),
    [compareFilters, dataset],
  );

  const deltas = useMemo(() => {
    if (!compareOverview) {
      return { revenue: 0, margin: 0, cashExposure: 0, utilization: 0 };
    }
    return {
      revenue: computePeriodDeltaPct(overview.revenue, compareOverview.revenue),
      margin: computePeriodDeltaPct(overview.margin, compareOverview.margin),
      cashExposure: computePeriodDeltaPct(overview.cashExposure, compareOverview.cashExposure),
      utilization: computePeriodDeltaPct(overview.fleetUtilization, compareOverview.fleetUtilization),
    };
  }, [compareOverview, overview]);

  const routePerf = useMemo(() => {
    const byRoute = new Map<string, { revenue: number; margin: number; trips: number }>();
    for (const trip of scoped.trips) {
      const route = `${trip.pickup_area ?? "—"} -> ${trip.drop_location ?? "—"}`;
      const row = byRoute.get(route) ?? { revenue: 0, margin: 0, trips: 0 };
      const rev = Number(trip.client_price ?? 0);
      const spend = Number(trip.supplier_rate ?? 0);
      row.revenue += rev;
      row.margin += rev - spend;
      row.trips += 1;
      byRoute.set(route, row);
    }
    return Array.from(byRoute.entries())
      .map(([route, row]) => ({ route, ...row }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [scoped.trips]);

  const routeRankingRows = useMemo(
    () =>
      routePerf.map((row) => ({
        id: row.route,
        selected: filters.routes.includes(row.route),
        party: pulsePartyForRoute(row.route),
        cells: {
          name: row.route,
          trips: String(row.trips),
          revenue: inr(row.revenue),
          margin: inr(row.margin),
          marginTone: row.margin >= 0 ? "positive" : "negative",
        },
      })),
    [routePerf, filters.routes],
  );

  const vehicleLabels = useMemo(
    () => buildVehicleLabelMap(dataset.vehicles),
    [dataset.vehicles],
  );

  const tripSettlementByTripId = useMemo(() => {
    const rank = { healthy: 0, attention: 1, critical: 2 };
    const labels = { healthy: "Settled", attention: "Attention", critical: "Critical" };
    const worst = new Map<string, keyof typeof rank>();
    const consider = (tripId: string, state: keyof typeof rank) => {
      const current = worst.get(tripId) ?? "healthy";
      if (rank[state] > rank[current]) worst.set(tripId, state);
    };
    for (const row of scoped.fuelRows) {
      const paymentOwner = String(row.payment_owner ?? "").toLowerCase();
      if (paymentOwner !== "driver") continue;
      const posting = String(row.posting_state ?? "").toLowerCase();
      const reimbursement = String(row.reimbursement_state ?? "").toLowerCase();
      if (posting !== "posted") consider(row.trip_id, "attention");
      else if (!reimbursement || reimbursement !== "reimbursed") consider(row.trip_id, "critical");
    }
    for (const row of scoped.tollRows) {
      const paymentOwner = String(row.payment_owner ?? "").toLowerCase();
      if (paymentOwner !== "driver") continue;
      const posting = String(row.posting_state ?? "").toLowerCase();
      const reimbursement = String(row.reimbursement_state ?? "").toLowerCase();
      if (posting !== "posted") consider(row.trip_id, "attention");
      else if (!reimbursement || reimbursement !== "reimbursed") consider(row.trip_id, "critical");
    }
    const out = new Map<string, string>();
    for (const trip of scoped.trips) {
      const state = worst.get(trip.id) ?? "healthy";
      out.set(trip.id, labels[state]);
    }
    return out;
  }, [scoped.fuelRows, scoped.tollRows, scoped.trips]);

  const tripPayableAmountByTripId = useMemo(() => {
    const amounts = new Map<string, number>();
    const add = (tripId: string, amount: number) => {
      if (amount <= 0) return;
      amounts.set(tripId, (amounts.get(tripId) ?? 0) + amount);
    };
    for (const trip of scoped.trips) {
      const supplierDue = Math.max(0, Number(trip.supplier_rate ?? 0));
      if (supplierDue > 0 && trip.supplier_id) add(trip.id, supplierDue);
    }
    const unsettled = (row: { trip_id: string; amount_inr: number | null; payment_owner?: string | null; posting_state?: string | null; reimbursement_state?: string | null }) => {
      const paymentOwner = String(row.payment_owner ?? "").toLowerCase();
      if (paymentOwner !== "driver") return false;
      const posting = String(row.posting_state ?? "").toLowerCase();
      const reimbursement = String(row.reimbursement_state ?? "").toLowerCase();
      if (posting !== "posted") return true;
      return !reimbursement || reimbursement !== "reimbursed";
    };
    for (const row of scoped.fuelRows) {
      if (!unsettled(row)) continue;
      add(row.trip_id, Math.max(0, Number(row.amount_inr ?? 0)));
    }
    for (const row of scoped.tollRows) {
      if (!unsettled(row)) continue;
      add(row.trip_id, Math.max(0, Number(row.amount_inr ?? 0)));
    }
    return amounts;
  }, [scoped.fuelRows, scoped.tollRows, scoped.trips]);

  const nameLabels = useMemo(
    () => ({
      clientNames: new Map(dataset.clients.map((x) => [x.id, x.name])),
      supplierNames: new Map(
        dataset.suppliers.map((x) => [x.id, x.company_name ?? x.name ?? "Supplier"]),
      ),
      vehicleLabels,
      driverNames: new Map(dataset.drivers.map((x) => [x.id, x.name])),
    }),
    [dataset.clients, dataset.drivers, dataset.suppliers, vehicleLabels],
  );

  const assetBranchCitySlices = useMemo(
    () => selectBranchCitySlicesFromTrips(assetScoped.trips),
    [assetScoped.trips],
  );

  const assetFleetSummary = useMemo(
    () => selectAssetFleetSummary(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const assetFleetVehicles = useMemo(
    () => selectAssetFleetVehicles(dataset, activeFilters, nameLabels.driverNames),
    [activeFilters, dataset, nameLabels.driverNames],
  );
  const assetDriverPayroll = useMemo(
    () => selectAssetDriverPayroll(dataset, activeFilters, nameLabels.vehicleLabels),
    [activeFilters, dataset, nameLabels.vehicleLabels],
  );

  const drilldownDateLabel = useMemo(() => {
    const start = effectiveRange?.start ?? filters.dateRange.start;
    const end = effectiveRange?.end ?? filters.dateRange.end;
    if (start && end) return `${start} – ${end}`;
    if (start) return `From ${start}`;
    if (end) return `Until ${end}`;
    return "All time";
  }, [effectiveRange?.end, effectiveRange?.start, filters.dateRange.end, filters.dateRange.start]);

  const scopeIntelRows = useMemo(
    () => [
      { label: "Workspace", value: currentOrganization?.name ?? "Workspace" },
      { label: "Period", value: drilldownDateLabel },
      {
        label: "Execution",
        value:
          executionScope === "all"
            ? "All models"
            : executionScope === "asset"
              ? "Asset fleet"
              : "Aggregate supply",
      },
      { label: "Trips", value: String(scoped.trips.length) },
      { label: "Revenue", value: inr(overview.revenue) },
      { label: "Net margin", value: inr(overview.margin) },
      { label: "Cash exposure", value: inr(overview.cashExposure) },
      { label: "Fleet utilization", value: `${overview.fleetUtilization.toFixed(0)}%` },
    ],
    [
      currentOrganization?.name,
      drilldownDateLabel,
      executionScope,
      scoped.trips.length,
      overview.revenue,
      overview.margin,
      overview.cashExposure,
      overview.fleetUtilization,
    ],
  );

  const executionFilterLabel =
    executionScope === "all"
      ? undefined
      : executionScope === "asset"
        ? "Asset fleet"
        : "Aggregate supply";

  const salesScopeIntelRows = useMemo(
    () => [
      { label: "Clients", value: String(clientProfitability.length) },
      { label: "Client revenue", value: inr(overview.revenue) },
      {
        label: "Top client",
        value: clientProfitability[0]?.name ?? "—",
      },
      { label: "Lanes tracked", value: String(routePerf.length) },
    ],
    [clientProfitability, overview.revenue, routePerf.length],
  );

  const supplyScopeIntelRows = useMemo(
    () => [
      { label: "Suppliers", value: String(supplierProfitability.length) },
      {
        label: "Settlement due",
        value: inr(
          supplierSettlement.reduce((sum, row) => sum + row.settlementExposure, 0),
        ),
      },
      {
        label: "Avg reliability",
        value:
          supplierReliability.length > 0
            ? `${(
                supplierReliability.reduce((s, r) => s + r.reliabilityScore, 0) /
                supplierReliability.length
              ).toFixed(0)}%`
            : "—",
      },
      { label: "Margin pool", value: inr(supplierProfitability.reduce((s, r) => s + r.contributionMargin, 0)) },
    ],
    [supplierProfitability, supplierReliability, supplierSettlement],
  );

  const fleetScopeIntelRows = useMemo(
    () => [
      { label: "Asset trips", value: String(assetFleetSummary.assetTripCount) },
      { label: "Active vehicles", value: String(assetFleetSummary.activeVehicles) },
      { label: "Fleet P&L", value: inr(assetFleetSummary.netFleetPnL) },
      { label: "Settlement", value: inr(assetFleetSummary.totalSettlementExposure) },
    ],
    [assetFleetSummary],
  );

  const driversScopeIntelRows = useMemo(
    () => [
      { label: "Asset drivers", value: String(assetDriverPayroll.length) },
      {
        label: "Payable queue",
        value: inr(assetDriverPayroll.reduce((sum, row) => sum + row.payableTotal, 0)),
      },
      {
        label: "License gaps",
        value: String(driverCompliance.filter((d) => !d.hasLicense).length),
      },
      {
        label: "Settlement risk",
        value: String(driverSettlement.filter((d) => d.settlementExposure > 0).length),
      },
    ],
    [assetDriverPayroll, driverCompliance, driverSettlement],
  );

  const complianceScopeIntelRows = useMemo(
    () => [
      { label: "Vehicles at risk", value: String(docExposure.vehiclesAtRisk) },
      { label: "Drivers at risk", value: String(docExposure.driversAtRisk) },
      {
        label: "Critical items",
        value: String(complianceRisk.filter((r) => r.state === "critical" || r.state === "missing").length),
      },
      { label: "Expiring soon", value: String(complianceRisk.filter((r) => r.state === "expiring_soon").length) },
    ],
    [complianceRisk, docExposure.driversAtRisk, docExposure.vehiclesAtRisk],
  );

  const operationsScopeIntelRows = useMemo(
    () => [
      { label: "Delayed trips", value: String(operations.delayedTrips) },
      { label: "Pending approvals", value: String(operations.pendingApprovals) },
      { label: "Ops state", value: String(operations.state) },
      { label: "Branches active", value: String(branchCitySlices.length) },
    ],
    [branchCitySlices.length, operations.delayedTrips, operations.pendingApprovals, operations.state],
  );

  const driverContributorRows = useMemo(
    () =>
      assetDriverPayroll.slice(0, 6).map((driver) => ({
        id: driver.driverId,
        name: driver.driverName,
        meta: `${driver.tripCount} trips · ${inr(driver.payableTotal)} payable`,
        selected: filters.driverIds.includes(driver.driverId),
        party: resolvePulseParty(partyMaps.drivers, driver.driverId, driver.driverName, "driver"),
      })),
    [assetDriverPayroll, filters.driverIds, partyMaps.drivers],
  );

  const fleetContributorRows = useMemo(
    () =>
      assetFleetVehicles.slice(0, 6).map((vehicle) => ({
        id: vehicle.vehicleId,
        name: vehicleDisplayLabel(vehicleLabels, vehicle.vehicleId),
        meta: `${vehicle.tripCount} trips · P&L ${inr(vehicle.netProfitability)}`,
        selected: filters.vehicleIds.includes(vehicle.vehicleId),
        party: resolvePulseParty(
          partyMaps.vehicles,
          vehicle.vehicleId,
          vehicleDisplayLabel(vehicleLabels, vehicle.vehicleId),
          "vehicle",
        ),
      })),
    [assetFleetVehicles, filters.vehicleIds, partyMaps.vehicles, vehicleLabels],
  );

  const complianceContributorRows = useMemo(
    () =>
      complianceRisk.slice(0, 6).map((row) => ({
        id: row.vehicleId,
        name: formatIndianVehicleNumber(row.vehicleNumber) || row.vehicleNumber || "Vehicle",
        meta: `${row.state.replaceAll("_", " ")} · ${row.riskCount} docs`,
        selected: filters.vehicleIds.includes(row.vehicleId),
        party: resolvePulseParty(
          partyMaps.vehicles,
          row.vehicleId,
          formatIndianVehicleNumber(row.vehicleNumber) || row.vehicleNumber || "Vehicle",
          "vehicle",
        ),
      })),
    [complianceRisk, filters.vehicleIds, partyMaps.vehicles],
  );

  const financePayableContributorRows = useMemo(
    () => [...supplierContributorRows.slice(0, 3), ...driverContributorRows.slice(0, 3)],
    [driverContributorRows, supplierContributorRows],
  );

  const fleetVehicleRows = useMemo(
    () =>
      assetFleetVehicles.map((vehicle) => ({
        id: vehicle.vehicleId,
        selected: filters.vehicleIds.includes(vehicle.vehicleId),
        party: resolvePulseParty(
          partyMaps.vehicles,
          vehicle.vehicleId,
          vehicleDisplayLabel(vehicleLabels, vehicle.vehicleId),
          "vehicle",
        ),
        cells: {
          name: vehicleDisplayLabel(vehicleLabels, vehicle.vehicleId),
          trips: String(vehicle.tripCount),
          operators:
            vehicle.operatorNames.length > 0 ? vehicle.operatorNames.join(", ") : "—",
          expenses: inr(
            vehicle.operationalCost + vehicle.ownershipCost + vehicle.maintenanceCost,
          ),
          pnl: inr(vehicle.netProfitability),
          pnlTone: vehicle.netProfitability >= 0 ? "positive" : "negative",
        },
      })),
    [assetFleetVehicles, filters.vehicleIds, partyMaps.vehicles, vehicleLabels],
  );

  const driverPayrollRows = useMemo(
    () =>
      assetDriverPayroll.map((driver) => {
        const compliance = driverCompliance.find((d) => d.driverId === driver.driverId);
        const tone: PulseTableRow["tone"] =
          !compliance?.hasLicense || driver.settlementExposure > 0 ? "warning" : null;
        return {
          id: driver.driverId,
          selected: filters.driverIds.includes(driver.driverId),
          tone,
          party: resolvePulseParty(partyMaps.drivers, driver.driverId, driver.driverName, "driver"),
          cells: {
            name: driver.driverName,
            trips: String(driver.tripCount),
            vehicles: driver.vehicleLabels.join(", ") || "—",
            commission: inr(driver.commissionDue),
            salary: driver.monthlySalary != null ? inr(driver.monthlySalary) : "Comm",
            payable: inr(driver.payableTotal),
            payableTone: driver.payableTotal > 0 ? "negative" : "positive",
          },
        };
      }),
    [assetDriverPayroll, driverCompliance, filters.driverIds, partyMaps.drivers],
  );

  const complianceRankingRows = useMemo(
    () =>
      complianceRisk.map((row) => ({
        id: row.vehicleId,
        selected: filters.vehicleIds.includes(row.vehicleId),
        tone:
          row.state === "critical" || row.state === "missing"
            ? ("critical" as const)
            : row.state === "expiring_soon"
              ? ("warning" as const)
              : ("healthy" as const),
        party: resolvePulseParty(
          partyMaps.vehicles,
          row.vehicleId,
          formatIndianVehicleNumber(row.vehicleNumber) || row.vehicleNumber || "Vehicle",
          "vehicle",
        ),
        cells: {
          name: formatIndianVehicleNumber(row.vehicleNumber) || row.vehicleNumber || "—",
          state: row.state.replaceAll("_", " ").toUpperCase(),
          docs: String(row.riskCount),
        },
      })),
    [complianceRisk, filters.vehicleIds, partyMaps.vehicles],
  );

  const drilldownView = useMemo(
    () =>
      buildPulseDrilldownView({
        trips:
          activeDomain === "fleet" || activeDomain === "drivers"
            ? assetScoped.trips
            : scoped.trips,
        filters: activeFilters,
        activeDomain,
        financeLedger,
        nameLabels,
        tripSettlementByTripId,
        tripPayableAmountByTripId,
        dateRangeLabel: drilldownDateLabel,
        compareCaption: compareActive ? compareCaption : undefined,
      }),
    [
      activeDomain,
      activeFilters,
      compareActive,
      compareCaption,
      drilldownDateLabel,
      financeLedger,
      nameLabels,
      assetScoped.trips,
      scoped.trips,
      tripSettlementByTripId,
      tripPayableAmountByTripId,
    ],
  );

  const drilldownDisplayView = drilldownView;

  useEffect(() => {
    if (activeDomain !== "finance") return;
    if (filters.clientIds.length > 0 && filters.supplierIds.length === 0) {
      setFinanceLedger("receivable");
    } else if (filters.supplierIds.length > 0 && filters.clientIds.length === 0) {
      setFinanceLedger("payable");
    }
  }, [activeDomain, filters.clientIds.length, filters.supplierIds.length]);

  const receivableAgingReport = useMemo(
    () => selectReceivableAging(dataset, activeFilters, nameLabels),
    [activeFilters, dataset, nameLabels],
  );

  const payableAgingReport = useMemo(
    () => selectPayableAging(dataset, activeFilters, nameLabels),
    [activeFilters, dataset, nameLabels],
  );

  const financeScopeIntelRows = useMemo(
    () => [
      { label: "Receivable", value: inr(receivableAgingReport.totalOutstanding) },
      { label: "Payable", value: inr(payableAgingReport.totalOutstanding) },
      { label: "Open receivables", value: String(receivableAgingReport.lines.length) },
      { label: "Open payables", value: String(payableAgingReport.lines.length) },
    ],
    [payableAgingReport, receivableAgingReport],
  );

  const handleTimePresetChange = useCallback(
    (preset: TimePreset) => {
      setTimePreset(preset);
      setSelectedMonth(null);
      const range = getPresetDateRange(preset);
      setDateRange(range.start, range.end);
    },
    [setDateRange],
  );

  const scrollToDrilldown = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const renderEntityFilterPanel = () => (
    <PulseEntityFilterPanel
      filters={filters}
      partyMaps={partyMaps}
      clientNames={nameLabels.clientNames}
      supplierNames={nameLabels.supplierNames}
      driverNames={nameLabels.driverNames}
      vehicleLabels={nameLabels.vehicleLabels}
      executionLabel={executionFilterLabel}
      onToggle={toggleFilterValue}
      onClearAll={resetFilters}
    />
  );

  const renderScopeLeftRail = (
    domainTitle: string,
    domainRows: typeof scopeIntelRows,
    extra?: ReactNode,
  ) => (
    <>
      <PulseDashboardCard title={domainTitle} subtitle="Workspace scope · tap tables to filter">
        <PulseScopeIntelCard rows={[...scopeIntelRows.slice(0, 2), ...domainRows]} />
      </PulseDashboardCard>
      <PulseDashboardCard title="Cross-filters" subtitle="Pinned entities · tap to remove">
        {renderEntityFilterPanel()}
      </PulseDashboardCard>
      {extra}
    </>
  );

  const cityWidgetCard = (title: string, subtitle: string, slices: typeof branchCitySlices) => (
    <PulseDashboardCard title={title} subtitle={subtitle} noPadding>
      <View style={styles.cityWidgetInset}>
        <PulseBranchCityWidget
          slices={slices}
          layout={isDesktop ? "grid" : "scroll"}
          hideHeader
        />
      </View>
    </PulseDashboardCard>
  );

  if (!orgId) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.emptyText}>Business Pulse is available for an active workspace.</Text>
      </View>
    );
  }

  const renderOverview = () => {
    // ── Compare banner ─────────────────────────────────────────────────────────
    const compareBanner =
      compareActive && compareOverview ? (
        <View style={styles.compareBanner}>
          <Text style={styles.compareBannerText}>{compareCaption}</Text>
          <Text style={styles.compareBannerMeta}>
            Prior period · Revenue {inr(compareOverview.revenue)} · Margin{" "}
            {inr(compareOverview.margin)}
          </Text>
        </View>
      ) : null;

    // ── 4-card KPI strip ────────────────────────────────────────────────────────
    const marginPct = overview.revenue > 0 ? (overview.margin / overview.revenue) * 100 : 0;
    const kpiStrip = (
      <View style={[styles.kpiRow]}>
        <MetricCard
          title="Revenue"
          value={inr(overview.revenue)}
          deltaPct={deltas.revenue}
          insight={`${scoped.trips.length} trips in scope`}
          state={deltas.revenue < -5 ? "warning" : "healthy"}
          density={density}
          compareActive={compareActive}
          desktopQuarter={kpiQuarter}
          barPct={Math.min(100, (overview.revenue / Math.max(overview.revenue, 1)) * 100)}
          icon={<IndianRupee size={12} color={Theme.primary} strokeWidth={2.2} />}
        />
        <MetricCard
          title="Net Margin"
          value={inr(overview.margin)}
          deltaPct={deltas.margin}
          insight={overview.margin >= 0 ? `${Math.max(0, marginPct).toFixed(0)}% margin rate` : "Cost pressure"}
          state={overview.margin < 0 ? "critical" : deltas.margin < -3 ? "warning" : "healthy"}
          density={density}
          compareActive={compareActive}
          desktopQuarter={kpiQuarter}
          barPct={Math.max(0, marginPct)}
          icon={<TrendingUp size={12} color={Theme.primary} strokeWidth={2.2} />}
        />
        <MetricCard
          title="Cash Exposure"
          value={inr(overview.cashExposure)}
          deltaPct={deltas.cashExposure}
          insight={overview.cashExposure > 0 ? "Settlement queue active" : "Healthy cash movement"}
          state={overview.cashExposure > 0 ? "warning" : "healthy"}
          density={density}
          compareActive={compareActive}
          desktopQuarter={kpiQuarter}
          icon={<Activity size={12} color={Theme.primary} strokeWidth={2.2} />}
        />
        <MetricCard
          title="Fleet Utilization"
          value={`${overview.fleetUtilization.toFixed(0)}%`}
          deltaPct={deltas.utilization}
          insight={`${docExposure.vehiclesAtRisk + docExposure.driversAtRisk} docs need review`}
          state={overview.fleetUtilization < 50 ? "warning" : "healthy"}
          density={density}
          compareActive={compareActive}
          desktopQuarter={kpiQuarter}
          barPct={overview.fleetUtilization}
          icon={<Truck size={12} color={Theme.textPrimaryDark} strokeWidth={2.2} />}
        />
      </View>
    );

    // ── Ops alert banner (only renders when there are real issues) ─────────────
    const totalAlerts =
      operations.delayedTrips +
      operations.pendingApprovals +
      docExposure.vehiclesAtRisk +
      docExposure.driversAtRisk;

    const opsAlertBanner =
      totalAlerts > 0 ? (
        <View style={styles.opsAlertBanner}>
          <AlertTriangle size={13} color="#92400e" strokeWidth={2.2} />
          <Text style={styles.opsAlertLabel}>Live alerts</Text>
          <View style={styles.opsAlertPills}>
            {operations.delayedTrips > 0 ? (
              <View style={[styles.opsAlertPill, styles.opsAlertWarn]}>
                <Text style={styles.opsAlertPillText}>{operations.delayedTrips} delayed</Text>
              </View>
            ) : null}
            {operations.pendingApprovals > 0 ? (
              <View style={[styles.opsAlertPill, styles.opsAlertInfo]}>
                <Text style={styles.opsAlertPillText}>{operations.pendingApprovals} pending</Text>
              </View>
            ) : null}
            {docExposure.vehiclesAtRisk + docExposure.driversAtRisk > 0 ? (
              <View style={[styles.opsAlertPill, styles.opsAlertCrit]}>
                <Text style={styles.opsAlertPillText}>
                  {docExposure.vehiclesAtRisk + docExposure.driversAtRisk} docs at risk
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => setActiveDomain("compliance")}
            style={({ pressed }) => [styles.opsAlertCta, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.opsAlertCtaText}>Review →</Text>
          </Pressable>
        </View>
      ) : null;

    // ── Revenue intelligence chart ─────────────────────────────────────────────
    const revenueChart = (
      <PulseDashboardCard
        title="Revenue intelligence"
        subtitle="Monthly trend · tap a month to filter"
        footerLabel="View trip drilldown"
        onFooterPress={scrollToDrilldown}
      >
        <PulseIntelligenceChart
          points={revenueTrend.map((item) => ({ month: item.month, value: item.revenue }))}
          selectedMonth={selectedMonth}
          onSelectMonth={(month) => {
            setSelectedMonth(month);
            if (!month) {
              const range = getPresetDateRange(timePreset);
              setDateRange(range.start, range.end);
              return;
            }
            setDateRange(`${month}-01`, `${month}-31`);
          }}
        />
      </PulseDashboardCard>
    );

    // ── Top contributors + Revenue mix side-by-side ────────────────────────────
    const contributorsAndMix = (
      <PulseWidgetRow>
        <PulseWidgetCol flex={3}>
          <PulseDashboardCard
            title="Top clients"
            subtitle="Revenue contributors"
            footerLabel="All clients →"
            onFooterPress={() => setActiveDomain("sales")}
          >
            <PulseTopContributorsList
              rows={contributorRows}
              onRowPress={(id) => toggleFilterValue("clientIds", id)}
              emptyMessage="No clients in current scope."
            />
          </PulseDashboardCard>
        </PulseWidgetCol>
        <PulseWidgetCol flex={2}>
          <PulseDashboardCard title="Revenue mix" subtitle="Client share">
            <PulseSegmentDonut slices={revenueSegmentSlices} emptyMessage="No revenue data." />
          </PulseDashboardCard>
        </PulseWidgetCol>
      </PulseWidgetRow>
    );

    // ── Client performance table (5 rows, paginated) ──────────────────────────
    const clientTable = (
      <PulseDashboardCard
        title="Client performance"
        subtitle={`${clientRankingRows.length} clients in scope`}
        noPadding
      >
        <PulseRankingTable
          columns={PULSE_CLIENT_COLUMNS}
          rows={clientRankingRows}
          onRowPress={(id) => toggleFilterValue("clientIds", id)}
          pageSize={5}
          showPagination={clientRankingRows.length > 5}
          emptyMessage="No clients in current scope."
        />
      </PulseDashboardCard>
    );

    // ── Scope intelligence (left rail) ────────────────────────────────────────
    const scopeIntelCard = (
      <PulseDashboardCard title="Scope intelligence" subtitle="Active context">
        <PulseScopeIntelCard rows={scopeIntelRows} />
      </PulseDashboardCard>
    );

    // ── City / branch concentration (left rail) ───────────────────────────────
    const branchCityCard = (
      <PulseDashboardCard
        title="City concentration"
        subtitle="Pickup revenue by city"
        noPadding
      >
        <View style={styles.cityWidgetInset}>
          <PulseBranchCityWidget
            slices={branchCitySlices}
            layout={isDesktop ? "grid" : "scroll"}
            hideHeader
          />
        </View>
      </PulseDashboardCard>
    );

    // ── Top suppliers (left rail on desktop) ──────────────────────────────────
    const suppliersCompact = (
      <PulseDashboardCard
        title="Top suppliers"
        subtitle="Settlement exposure"
        footerLabel="Supply tab →"
        onFooterPress={() => setActiveDomain("supply")}
      >
        <PulseTopContributorsList
          rows={supplierContributorRows.slice(0, 4)}
          onRowPress={(id) => toggleFilterValue("supplierIds", id)}
          emptyMessage="No suppliers in scope."
        />
      </PulseDashboardCard>
    );

    return (
      <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
        {compareBanner}
        {kpiStrip}
        {isDesktop ? (
          <PulseOverviewDesktopLayout
            left={
              <>
                {scopeIntelCard}
                {branchCityCard}
                {suppliersCompact}
              </>
            }
            main={
              <>
                {opsAlertBanner}
                {revenueChart}
                {contributorsAndMix}
                {clientTable}
              </>
            }
          />
        ) : (
          <>
            {opsAlertBanner}
            {revenueChart}
            {contributorsAndMix}
            {scopeIntelCard}
            {branchCityCard}
            {clientTable}
          </>
        )}
      </View>
    );
  };

  const renderSales = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <PulseDomainTabLayout
        isDesktop={isDesktop}
        kpis={
          <PulseDomainKpiStrip>
            <View
              style={[
                styles.executiveGrid,
                styles.widgetGroup,
                kpiQuarter && styles.executiveGridQuarter,
              ]}
            >
              <MetricCard
                title="Client revenue"
                value={inr(overview.revenue)}
                deltaPct={deltas.revenue}
                insight={`${clientProfitability.length} clients in scope`}
                state="healthy"
                density={density}
                compareActive={compareActive}
                desktopQuarter={kpiQuarter}
                icon={<IndianRupee size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
              <MetricCard
                title="Net margin"
                value={inr(overview.margin)}
                deltaPct={deltas.margin}
                insight={clientProfitability[0]?.name ?? "No clients"}
                state={overview.margin >= 0 ? "healthy" : "warning"}
                density={density}
                compareActive={compareActive}
                desktopQuarter={kpiQuarter}
                icon={<TrendingUp size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
              <MetricCard
                title="Lanes"
                value={String(routePerf.length)}
                deltaPct={0}
                insight="Profitable corridors tracked"
                state="healthy"
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<Activity size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
            </View>
          </PulseDomainKpiStrip>
        }
        left={renderScopeLeftRail(
          "Sales intelligence",
          salesScopeIntelRows,
          cityWidgetCard("Branch concentration", "Pickup cities by revenue", branchCitySlices),
        )}
        main={
          <>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard
                  title="Top clients"
                  subtitle="Revenue contributors · tap to filter"
                  footerLabel="All clients"
                >
                  <PulseTopContributorsList
                    rows={contributorRows}
                    onRowPress={(id) => toggleFilterValue("clientIds", id)}
                    emptyMessage="No clients in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Revenue mix" subtitle="Client share breakdown">
                  <PulseSegmentDonut
                    slices={revenueSegmentSlices}
                    emptyMessage="No revenue data in scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Client snapshot" subtitle="Top 5 by revenue" noPadding>
                  <PulseRankingTable
                    columns={PULSE_CLIENT_MINI_COLUMNS}
                    rows={clientRankingRows}
                    onRowPress={(id) => toggleFilterValue("clientIds", id)}
                    pageSize={5}
                    showPagination={clientRankingRows.length > 5}
                    emptyMessage="No clients in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Lane snapshot" subtitle="Top 5 corridors" noPadding>
                  <PulseRankingTable
                    columns={PULSE_ROUTE_MINI_COLUMNS}
                    rows={routeRankingRows}
                    onRowPress={(id) => toggleFilterValue("routes", id)}
                    pageSize={5}
                    showPagination={routeRankingRows.length > 5}
                    emptyMessage="No lanes in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
            <PulseDashboardCard title="Client performance" subtitle="Full comparison matrix" noPadding>
              <PulseRankingTable
                columns={PULSE_CLIENT_COLUMNS}
                rows={clientRankingRows}
                onRowPress={(id) => toggleFilterValue("clientIds", id)}
                emptyMessage="No clients in current scope."
              />
            </PulseDashboardCard>
            <PulseDashboardCard title="Lane profitability" subtitle="Route-level P&L" noPadding>
              <PulseRankingTable
                columns={PULSE_ROUTE_COLUMNS}
                rows={routeRankingRows}
                onRowPress={(id) => toggleFilterValue("routes", id)}
                emptyMessage="No lanes in current scope."
              />
            </PulseDashboardCard>
          </>
        }
      />
    </View>
  );

  const renderSupply = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <PulseDomainTabLayout
        isDesktop={isDesktop}
        kpis={
          <PulseDomainKpiStrip>
            <View
              style={[
                styles.executiveGrid,
                styles.widgetGroup,
                kpiQuarter && styles.executiveGridQuarter,
              ]}
            >
              <MetricCard
                title="Suppliers"
                value={String(supplierProfitability.length)}
                deltaPct={0}
                insight="Active supply parties"
                state="healthy"
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<Users size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
              <MetricCard
                title="Settlement due"
                value={inr(supplierSettlement.reduce((s, r) => s + r.settlementExposure, 0))}
                deltaPct={deltas.cashExposure}
                insight="Supplier payable concentration"
                state={
                  supplierSettlement.some((r) => r.settlementExposure > 0) ? "warning" : "healthy"
                }
                density={density}
                compareActive={compareActive}
                desktopQuarter={kpiQuarter}
                icon={<ListChecks size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
              <MetricCard
                title="Margin pool"
                value={inr(supplierProfitability.reduce((s, r) => s + r.contributionMargin, 0))}
                deltaPct={0}
                insight="Contribution across suppliers"
                state="healthy"
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<IndianRupee size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
            </View>
          </PulseDomainKpiStrip>
        }
        left={renderScopeLeftRail("Supply intelligence", supplyScopeIntelRows)}
        main={
          <>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard
                  title="Top suppliers"
                  subtitle="Reliability & margin · tap to filter"
                >
                  <PulseTopContributorsList
                    rows={supplierContributorRows}
                    onRowPress={(id) => toggleFilterValue("supplierIds", id)}
                    emptyMessage="No suppliers in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Settlement mix" subtitle="Payable concentration">
                  <PulseSegmentDonut
                    slices={supplierSettlementSlices}
                    emptyMessage="No settlement exposure in scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
            <PulseDashboardCard title="Supplier snapshot" subtitle="Top 5 by settlement exposure" noPadding>
              <PulseRankingTable
                columns={PULSE_SUPPLIER_MINI_COLUMNS}
                rows={supplierRankingRows}
                onRowPress={(id) => toggleFilterValue("supplierIds", id)}
                pageSize={5}
                showPagination={supplierRankingRows.length > 5}
                emptyMessage="No suppliers in current scope."
              />
            </PulseDashboardCard>
            <PulseDashboardCard
              title="Supplier performance"
              subtitle="Reliability, margin & settlement"
              noPadding
            >
              <PulseRankingTable
                columns={PULSE_SUPPLIER_COLUMNS}
                rows={supplierRankingRows}
                onRowPress={(id) => toggleFilterValue("supplierIds", id)}
                emptyMessage="No suppliers in current scope."
              />
            </PulseDashboardCard>
          </>
        }
      />
    </View>
  );

  const renderFleet = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <PulseDomainTabLayout
        isDesktop={isDesktop}
        kpis={
          <PulseDomainKpiStrip>
            <View
              style={[
                styles.executiveGrid,
                styles.widgetGroup,
                kpiQuarter && styles.executiveGridQuarter,
              ]}
            >
              <MetricCard
                title="Asset trips"
                value={String(assetFleetSummary.assetTripCount)}
                deltaPct={0}
                insight={`${assetFleetSummary.activeVehicles} vehicles · ${assetFleetSummary.activeDrivers} drivers`}
                state="healthy"
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<Truck size={14} color={Theme.primary} strokeWidth={2.2} />}
              />
              <MetricCard
                title="Fleet P&L"
                value={inr(assetFleetSummary.netFleetPnL)}
                deltaPct={0}
                insight={`Revenue ${inr(assetFleetSummary.totalRevenue)}`}
                state={assetFleetSummary.netFleetPnL >= 0 ? "healthy" : "warning"}
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<IndianRupee size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
            </View>
          </PulseDomainKpiStrip>
        }
        left={renderScopeLeftRail(
          "Fleet intelligence",
          fleetScopeIntelRows,
          <>
            <PulseDashboardCard title="Expense breakdown" subtitle="Own-fleet cost stack">
              <View style={styles.opsRow}>
                <View style={styles.opsBadge}>
                  <Text style={styles.opsBadgeText}>Ops {inr(assetFleetSummary.totalOperationalCost)}</Text>
                </View>
                <View style={styles.opsBadge}>
                  <Text style={styles.opsBadgeText}>
                    Ownership {inr(assetFleetSummary.totalOwnershipCost)}
                  </Text>
                </View>
                <View style={styles.opsBadge}>
                  <Text style={styles.opsBadgeText}>
                    Maint {inr(assetFleetSummary.totalMaintenanceCost)}
                  </Text>
                </View>
              </View>
            </PulseDashboardCard>
            {cityWidgetCard("Asset cities", "Pickup concentration · own fleet", assetBranchCitySlices)}
          </>,
        )}
        main={
          <>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Top vehicles" subtitle="P&L leaders · tap to filter">
                  <PulseTopContributorsList
                    rows={fleetContributorRows}
                    onRowPress={(id) => toggleFilterValue("vehicleIds", id)}
                    emptyMessage="No asset vehicles in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Fleet economics" subtitle="Cost vs revenue">
                  <PulseSegmentDonut
                    slices={[
                      { label: "Operational", value: assetFleetSummary.totalOperationalCost, color: "#3b82f6" },
                      { label: "Ownership", value: assetFleetSummary.totalOwnershipCost, color: "#8b5cf6" },
                      { label: "Maintenance", value: assetFleetSummary.totalMaintenanceCost, color: "#f59e0b" },
                    ].filter((s) => s.value > 0)}
                    emptyMessage="No fleet costs in scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
            <PulseDashboardCard title="Vehicle snapshot" subtitle="Top 5 by trip volume" noPadding>
              <PulseRankingTable
                columns={PULSE_FLEET_VEHICLE_MINI_COLUMNS}
                rows={fleetVehicleRows}
                onRowPress={(id) => toggleFilterValue("vehicleIds", id)}
                pageSize={5}
                showPagination={fleetVehicleRows.length > 5}
                emptyMessage="No asset vehicles in current scope."
              />
            </PulseDashboardCard>
            <PulseDashboardCard
              title="Asset vehicles & operators"
              subtitle="Trip count, expenses & P&L by vehicle"
              noPadding
            >
              <PulseRankingTable
                columns={PULSE_FLEET_VEHICLE_COLUMNS}
                rows={fleetVehicleRows}
                onRowPress={(id) => toggleFilterValue("vehicleIds", id)}
                emptyMessage="No asset vehicles in current scope."
              />
            </PulseDashboardCard>
          </>
        }
      />
    </View>
  );

  const renderDrivers = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <PulseDomainTabLayout
        isDesktop={isDesktop}
        kpis={
          <PulseDomainKpiStrip>
            <View
              style={[
                styles.executiveGrid,
                styles.widgetGroup,
                kpiQuarter && styles.executiveGridQuarter,
              ]}
            >
              <MetricCard
                title="Asset drivers"
                value={String(assetDriverPayroll.length)}
                deltaPct={0}
                insight="Fleet payroll parties"
                state="healthy"
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<Users size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
              <MetricCard
                title="Payable queue"
                value={inr(assetDriverPayroll.reduce((sum, row) => sum + row.payableTotal, 0))}
                deltaPct={0}
                insight="Commission + reimbursement due"
                state={assetDriverPayroll.some((row) => row.payableTotal > 0) ? "warning" : "healthy"}
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<ListChecks size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
            </View>
          </PulseDomainKpiStrip>
        }
        left={renderScopeLeftRail(
          "Driver intelligence",
          driversScopeIntelRows,
          <PulseDashboardCard title="Compliance signals" subtitle="License & settlement">
            <View style={styles.opsRow}>
              <View style={styles.opsBadge}>
                <ShieldAlert size={12} color={Theme.textPrimaryDark} />
                <Text style={styles.opsBadgeText}>
                  License gaps: {driverCompliance.filter((d) => !d.hasLicense).length}
                </Text>
              </View>
              <View style={styles.opsBadge}>
                <AlertTriangle size={12} color={Theme.textMuted} />
                <Text style={styles.opsBadgeText}>
                  Settlement: {driverSettlement.filter((d) => d.settlementExposure > 0).length}
                </Text>
              </View>
            </View>
          </PulseDashboardCard>,
        )}
        main={
          <>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Top drivers" subtitle="Payroll parties · tap to filter">
                  <PulseTopContributorsList
                    rows={driverContributorRows}
                    onRowPress={(id) => toggleFilterValue("driverIds", id)}
                    emptyMessage="No asset drivers in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Payable mix" subtitle="Commission vs salary">
                  <PulseSegmentDonut
                    slices={[
                      {
                        label: "Commission",
                        value: assetDriverPayroll.reduce((s, r) => s + r.commissionDue, 0),
                        color: "#3b82f6",
                      },
                      {
                        label: "Salary",
                        value: assetDriverPayroll.reduce(
                          (s, r) => s + (r.monthlySalary ?? 0),
                          0,
                        ),
                        color: "#10b981",
                      },
                    ].filter((s) => s.value > 0)}
                    emptyMessage="No driver payables in scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
            <PulseDashboardCard title="Driver snapshot" subtitle="Top 5 by payable queue" noPadding>
              <PulseRankingTable
                columns={PULSE_DRIVER_MINI_COLUMNS}
                rows={driverPayrollRows}
                onRowPress={(id) => toggleFilterValue("driverIds", id)}
                pageSize={5}
                showPagination={driverPayrollRows.length > 5}
                emptyMessage="No asset drivers in current scope."
              />
            </PulseDashboardCard>
            <PulseDashboardCard
              title="Asset driver payroll"
              subtitle="Commission, salary terms & settlement exposure"
              noPadding
            >
              <PulseRankingTable
                columns={PULSE_DRIVER_PAYROLL_COLUMNS}
                rows={driverPayrollRows}
                onRowPress={(id) => toggleFilterValue("driverIds", id)}
                emptyMessage="No asset drivers in current scope."
              />
            </PulseDashboardCard>
          </>
        }
      />
    </View>
  );

  const renderFinance = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <PulseDomainTabLayout
        isDesktop={isDesktop}
        kpis={
          <PulseDomainKpiStrip>
            <View
              style={[
                styles.executiveGrid,
                styles.widgetGroup,
                kpiQuarter && styles.executiveGridQuarter,
              ]}
            >
              <MetricCard
                title="Receivable"
                value={inr(receivableAgingReport.totalOutstanding)}
                deltaPct={0}
                insight={`${receivableAgingReport.lines.length} open client items`}
                state={receivableAgingReport.totalOutstanding > 0 ? "warning" : "healthy"}
                density={density}
                compareActive={compareActive}
                desktopQuarter={kpiQuarter}
                icon={<IndianRupee size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
              <MetricCard
                title="Payable"
                value={inr(payableAgingReport.totalOutstanding)}
                deltaPct={deltas.cashExposure}
                insight="Supplier + driver settlement queue"
                state={payableAgingReport.totalOutstanding > 0 ? "warning" : "healthy"}
                density={density}
                compareActive={compareActive}
                desktopQuarter={kpiQuarter}
                icon={<ListChecks size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
            </View>
          </PulseDomainKpiStrip>
        }
        left={renderScopeLeftRail(
          "Finance intelligence",
          financeScopeIntelRows,
          <PulseDashboardCard title="Ledger scope" subtitle="Drilldown filter">
            <PulseContributionFilters
              financeLedger={financeLedger}
              onFinanceLedger={setFinanceLedger}
            />
          </PulseDashboardCard>,
        )}
        main={
          <>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard
                  title="Top receivable parties"
                  subtitle="Clients with open billing"
                >
                  <PulseTopContributorsList
                    rows={contributorRows.filter((r) =>
                      receivableAgingReport.lines.some((line) => line.partyEntityId === r.id),
                    ).slice(0, 5)}
                    onRowPress={(id) => toggleFilterValue("clientIds", id)}
                    emptyMessage="No receivable clients in scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Top payable parties" subtitle="Suppliers & drivers">
                  <PulseTopContributorsList
                    rows={financePayableContributorRows}
                    onRowPress={(id) => {
                      if (partyMaps.suppliers.has(id)) toggleFilterValue("supplierIds", id);
                      else toggleFilterValue("driverIds", id);
                    }}
                    emptyMessage="No payable parties in scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard
                  title="Receivable aging"
                  subtitle="Client billing · open invoices"
                  noPadding
                >
                  <PulseAgingReport
                    report={receivableAgingReport}
                    reportTitle={`Business Pulse Receivable — ${currentOrganization?.name ?? "Workspace"}`}
                    companyName={currentOrganization?.name ?? "Workspace"}
                    partyMaps={partyMaps}
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard
                  title="Payable aging"
                  subtitle={`Fleet payables ${inr(overview.outstandingPayables)} · Driver ${inr(cash.payableExposure)}`}
                  noPadding
                >
                  <PulseAgingReport
                    report={payableAgingReport}
                    reportTitle={`Business Pulse Payable — ${currentOrganization?.name ?? "Workspace"}`}
                    companyName={currentOrganization?.name ?? "Workspace"}
                    partyMaps={partyMaps}
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
          </>
        }
      />
    </View>
  );

  const renderCompliance = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <PulseDomainTabLayout
        isDesktop={isDesktop}
        kpis={
          <PulseDomainKpiStrip>
            <View
              style={[
                styles.executiveGrid,
                styles.widgetGroup,
                kpiQuarter && styles.executiveGridQuarter,
              ]}
            >
              <MetricCard
                title="Vehicles at risk"
                value={String(docExposure.vehiclesAtRisk)}
                deltaPct={0}
                insight="Document verification exposure"
                state={docExposure.vehiclesAtRisk > 0 ? "warning" : "healthy"}
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<ShieldAlert size={12} color={Theme.textPrimaryDark} strokeWidth={2.2} />}
              />
              <MetricCard
                title="Drivers at risk"
                value={String(docExposure.driversAtRisk)}
                deltaPct={0}
                insight="License & compliance gaps"
                state={docExposure.driversAtRisk > 0 ? "warning" : "healthy"}
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<Users size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
            </View>
          </PulseDomainKpiStrip>
        }
        left={renderScopeLeftRail(
          "Compliance intelligence",
          complianceScopeIntelRows,
          <PulseDashboardCard title="Document exposure" subtitle="Verification queue">
            <View style={styles.opsRow}>
              <View style={styles.opsBadge}>
                <Text style={styles.opsBadgeText}>Vehicles {docExposure.vehiclesAtRisk}</Text>
              </View>
              <View style={styles.opsBadge}>
                <Text style={styles.opsBadgeText}>Drivers {docExposure.driversAtRisk}</Text>
              </View>
            </View>
          </PulseDashboardCard>,
        )}
        main={
          <>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="At-risk vehicles" subtitle="Tap to filter fleet">
                  <PulseTopContributorsList
                    rows={complianceContributorRows}
                    onRowPress={(id) => toggleFilterValue("vehicleIds", id)}
                    emptyMessage="No compliance risks in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Risk mix" subtitle="Severity breakdown">
                  <PulseSegmentDonut
                    slices={[
                      {
                        label: "Critical",
                        value: complianceRisk.filter((r) => r.state === "critical" || r.state === "missing").length,
                        color: "#ef4444",
                      },
                      {
                        label: "Expiring",
                        value: complianceRisk.filter((r) => r.state === "expiring_soon").length,
                        color: "#f59e0b",
                      },
                      {
                        label: "Healthy",
                        value: complianceRisk.filter((r) => r.state === "healthy").length,
                        color: "#10b981",
                      },
                    ].filter((s) => s.value > 0)}
                    emptyMessage="No compliance data in scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Risk snapshot" subtitle="Top 5 vehicles by severity" noPadding>
                  <PulseRankingTable
                    columns={PULSE_COMPLIANCE_MINI_COLUMNS}
                    rows={complianceRankingRows}
                    onRowPress={(id) => toggleFilterValue("vehicleIds", id)}
                    pageSize={5}
                    showPagination={complianceRankingRows.length > 5}
                    emptyMessage="No compliance risks in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Risk severity matrix" subtitle="Full compliance register" noPadding>
                  <PulseRankingTable
                    columns={PULSE_COMPLIANCE_COLUMNS}
                    rows={complianceRankingRows}
                    onRowPress={(id) => toggleFilterValue("vehicleIds", id)}
                    emptyMessage="No compliance risks in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
          </>
        }
      />
    </View>
  );

  const renderOperations = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <PulseDomainTabLayout
        isDesktop={isDesktop}
        kpis={
          <PulseDomainKpiStrip>
            <View
              style={[
                styles.executiveGrid,
                styles.widgetGroup,
                kpiQuarter && styles.executiveGridQuarter,
              ]}
            >
              <MetricCard
                title="Delayed"
                value={String(operations.delayedTrips)}
                deltaPct={0}
                insight="Trips behind schedule"
                state={operations.delayedTrips > 0 ? "warning" : "healthy"}
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<AlertTriangle size={12} color={Theme.textMuted} strokeWidth={2.2} />}
              />
              <MetricCard
                title="Pending"
                value={String(operations.pendingApprovals)}
                deltaPct={0}
                insight="Awaiting approval"
                state={operations.pendingApprovals > 0 ? "warning" : "healthy"}
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<ListChecks size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
              <MetricCard
                title="Health"
                value={String(operations.state)}
                deltaPct={0}
                insight={`Docs at risk ${docExposure.vehiclesAtRisk + docExposure.driversAtRisk}`}
                state={operations.state === "healthy" ? "healthy" : "warning"}
                density={density}
                compareActive={false}
                desktopQuarter={kpiQuarter}
                icon={<CheckCircle2 size={12} color={Theme.primary} strokeWidth={2.2} />}
              />
            </View>
          </PulseDomainKpiStrip>
        }
        left={renderScopeLeftRail(
          "Operations intelligence",
          operationsScopeIntelRows,
          <>
            <PulseDashboardCard title="Live telemetry" subtitle="Active trip signals">
              <View style={styles.opsRow}>
                <View style={styles.opsBadge}>
                  <AlertTriangle size={12} color={Theme.textMuted} />
                  <Text style={styles.opsBadgeText}>Delayed: {operations.delayedTrips}</Text>
                </View>
                <View style={styles.opsBadge}>
                  <ListChecks size={12} color={Theme.primary} />
                  <Text style={styles.opsBadgeText}>Pending: {operations.pendingApprovals}</Text>
                </View>
                <View style={styles.opsBadge}>
                  <CheckCircle2 size={12} color={Theme.primary} />
                  <Text style={styles.opsBadgeText}>State: {String(operations.state)}</Text>
                </View>
              </View>
            </PulseDashboardCard>
            {cityWidgetCard("Branch spread", "Pickup cities in scope", branchCitySlices)}
          </>,
        )}
        main={
          <>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Active clients" subtitle="Ops volume leaders">
                  <PulseTopContributorsList
                    rows={contributorRows.slice(0, 5)}
                    onRowPress={(id) => toggleFilterValue("clientIds", id)}
                    emptyMessage="No clients in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Lane activity" subtitle="Corridor distribution">
                  <PulseSegmentDonut
                    slices={routePerf.slice(0, 5).map((row, index) => ({
                      label: row.route.length > 24 ? `${row.route.slice(0, 22)}…` : row.route,
                      value: row.trips,
                      color: ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#4D3636"][index % 5]!,
                    }))}
                    emptyMessage="No lane activity in scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
            <PulseWidgetRow>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Lane snapshot" subtitle="Top 5 corridors" noPadding>
                  <PulseRankingTable
                    columns={PULSE_ROUTE_MINI_COLUMNS}
                    rows={routeRankingRows}
                    onRowPress={(id) => toggleFilterValue("routes", id)}
                    pageSize={5}
                    showPagination={routeRankingRows.length > 5}
                    emptyMessage="No lanes in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
              <PulseWidgetCol flex={1}>
                <PulseDashboardCard title="Supplier snapshot" subtitle="Active supply parties" noPadding>
                  <PulseRankingTable
                    columns={PULSE_SUPPLIER_MINI_COLUMNS}
                    rows={supplierRankingRows}
                    onRowPress={(id) => toggleFilterValue("supplierIds", id)}
                    pageSize={5}
                    showPagination={supplierRankingRows.length > 5}
                    emptyMessage="No suppliers in current scope."
                  />
                </PulseDashboardCard>
              </PulseWidgetCol>
            </PulseWidgetRow>
            <PulseDashboardCard title="Lane profitability" subtitle="Full operations register" noPadding>
              <PulseRankingTable
                columns={PULSE_ROUTE_COLUMNS}
                rows={routeRankingRows}
                onRowPress={(id) => toggleFilterValue("routes", id)}
                emptyMessage="No lanes in current scope."
              />
            </PulseDashboardCard>
          </>
        }
      />
    </View>
  );

  const renderActiveDomain = () => {
    if (activeDomain === "overview") return renderOverview();
    if (activeDomain === "sales") return renderSales();
    if (activeDomain === "supply") return renderSupply();
    if (activeDomain === "fleet") return renderFleet();
    if (activeDomain === "drivers") return renderDrivers();
    if (activeDomain === "finance") return renderFinance();
    if (activeDomain === "compliance") return renderCompliance();
    return renderOperations();
  };

  const activeFilterCount =
    filters.clientIds.length +
    filters.supplierIds.length +
    filters.driverIds.length +
    filters.vehicleIds.length +
    filters.routes.length +
    (timePreset !== "all" ? 1 : 0) +
    (executionScope !== "all" ? 1 : 0);


  return (
    <View style={[styles.container, { paddingTop: resolvedTopInset }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          ent.contentColumn,
          isDesktop && ent.contentColumnDesktop,
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24, paddingTop: embedded ? 10 : 6 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!embedded ? (
          <PulseScopeRibbon
            orgName={currentOrganization?.name ?? "Workspace"}
            orgId={orgId}
            orgLogoUrl={currentOrganization?.logo_url}
            tripCount={scoped.trips.length}
            filterCount={activeFilterCount}
            domainLabel={activeDomain}
            wide={wide}
          />
        ) : null}

        {!embedded ? (
          <View style={ent.pageToolbar}>
            <View>
              <Text style={ent.pageTitle}>Business Pulse</Text>
              <Text style={ent.pageBreadcrumb}>
                Workspace · Intelligence · {scoped.trips.length} trips in scope
              </Text>
            </View>
            <View style={ent.datePill}>
              <Calendar size={12} color={Theme.textMuted} strokeWidth={2} />
              <Text style={ent.datePillText}>{drilldownDateLabel}</Text>
            </View>
          </View>
        ) : null}

        <View style={[ent.filterCard, styles.stickyFilterHeader]}>
          {embedded ? (
            <View style={styles.filterPanelHead}>
              <View style={styles.filterPanelHeadLeft}>
                <Text style={ent.dashboardCardTitle}>Intelligence scope</Text>
                <Text style={ent.dashboardCardSubtitle}>
                  {scoped.trips.length} trips · {activeDomain} domain
                </Text>
              </View>
              <View style={ent.datePill}>
                <Calendar size={12} color={Theme.textMuted} strokeWidth={2} />
                <Text style={ent.datePillText}>{drilldownDateLabel}</Text>
              </View>
            </View>
          ) : null}
          <DomainTabBar active={activeDomain} onChange={setActiveDomain} />
          <PulseDateRangeTabBar active={timePreset} onChange={handleTimePresetChange} />
          <PulseScopeTabRow
            executionScope={executionScope}
            onExecutionScope={setExecutionScope}
          />
          {activeDomain === "finance" ? (
            <PulseContributionFilters
              financeLedger={financeLedger}
              onFinanceLedger={setFinanceLedger}
            />
          ) : null}
        </View>

        {loading ? <Text style={styles.mutedText}>Loading intelligence workspace...</Text> : null}

        <View style={styles.widgetZone}>{renderActiveDomain()}</View>

        <PulseDashboardCard
          title="Trip drilldown"
          subtitle={`${drilldownView.lensLabel} · ${drilldownDateLabel}`}
          noPadding
        >
          <PulseDrilldownTable
            view={drilldownDisplayView}
            exportView={drilldownView}
            reportTitle={`Business Pulse — ${currentOrganization?.name ?? "Workspace"}`}
            companyName={currentOrganization?.name ?? "Workspace"}
            partyMaps={partyMaps}
          />
        </PulseDashboardCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PULSE_PAGE_BG,
  },
  scroll: { flex: 1 },
  scrollContent: {
    gap: 12,
  },
  filterPanelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  filterPanelHeadLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  filterPanelTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  filterPanelMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "capitalize",
  },
  cardHint: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "right",
    lineHeight: 13,
  },
  kpiTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  kpiIconChip: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#f4f6fb",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiTitleWithIcon: {
    flex: 1,
  },
  header: {
    padding: 16,
    gap: 12,
    marginBottom: 0,
  },
  headerEmbedded: {
    padding: 14,
    gap: 10,
  },
  stickyFilterHeader: {
    zIndex: 20,
  },
  cityWidgetInset: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  executionScopeWrap: {
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  executionScopeLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 2,
  },
  labeledTabShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  labeledTabScroll: {
    flex: 1,
    minWidth: 0,
  },
  globalFilterStrip: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 4,
  },
  compareBanner: {
    borderWidth: 1,
    borderColor: Theme.primary,
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
    marginBottom: 10,
  },
  compareBannerText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  compareBannerMeta: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  widgetZone: {
    marginTop: 2,
    marginBottom: 10,
    gap: 12,
  },
  stripTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 10,
    alignItems: "center",
  },
  filterChip: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: Theme.surface,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  filterChipActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.primary,
  },
  filterChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.text,
  },
  filterChipTextActive: {
    color: Theme.buttonPrimaryText,
  },
  sectionBlock: {
    gap: 10,
    marginBottom: 12,
    paddingBottom: 2,
  },
  sectionBlockDesktop: {
    gap: 12,
  },
  widgetGroup: {
    marginBottom: 4,
  },
  widgetCardFill: {
    flex: 1,
    height: "100%",
  },
  widgetCard: {
    marginBottom: 0,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  drilldownCard: {
    marginTop: 4,
  },
  sectionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 8,
  },
  executiveGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "stretch",
    width: "100%",
  },
  executiveGridQuarter: {
    flexWrap: "nowrap",
    gap: 10,
  },
  metricCardShell: {
    marginBottom: 0,
    gap: 6,
  },
  cardSubTitleBlock: {
    fontSize: 9,
    color: Theme.textMuted,
    fontWeight: "600",
    marginTop: -2,
    marginBottom: 4,
    lineHeight: 13,
  },
  heroLeft: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "#eef2ff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  heroBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.4,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  heroSubtitle: {
    fontSize: 10,
    color: Theme.textSecondary,
    lineHeight: 15,
    maxWidth: 520,
  },
  heroStats: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
    flexWrap: "wrap",
  },
  heroStatValueAccent: {
    color: Theme.primary,
    fontSize: 13,
    letterSpacing: 0.6,
  },
  // ── KPI row ────────────────────────────────────────────────────────────────
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "stretch",
    width: "100%",
  },
  metricCard: {
    width: "22%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 136,
  },
  metricCardQuarter: {
    flex: 1,
    width: undefined,
    minWidth: 0,
    maxWidth: undefined,
  },
  metricTiny: {},
  metricCompact: {},
  metricStandard: {},
  metricTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 2,
  },
  metricDeltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  metricDeltaText: {
    fontSize: 9,
    fontWeight: "800",
  },
  metricInsight: {
    fontSize: 9,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  // Delta badge in KPI top row
  deltaBadge: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginLeft: "auto",
  },
  deltaBadgeUp: {
    backgroundColor: "#dcfce7",
  },
  deltaBadgeDown: {
    backgroundColor: "#fef2f2",
  },
  deltaBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  // KPI progress bar
  kpiBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#f1f5f9",
    marginTop: 8,
    overflow: "hidden",
  },
  kpiBarFill: {
    height: 3,
    borderRadius: 2,
  },
  // ── Ops alert banner ──────────────────────────────────────────────────────
  opsAlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexWrap: "wrap",
  },
  opsAlertLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400e",
    flexShrink: 0,
  },
  opsAlertPills: {
    flexDirection: "row",
    gap: 6,
    flex: 1,
    flexWrap: "wrap",
  },
  opsAlertPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  opsAlertWarn: { backgroundColor: "#fef3c7" },
  opsAlertInfo: { backgroundColor: "#eff6ff" },
  opsAlertCrit: { backgroundColor: "#fef2f2" },
  opsAlertPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#374151",
  },
  opsAlertCta: {
    marginLeft: "auto" as unknown as number,
    flexShrink: 0,
  },
  opsAlertCtaText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    padding: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  halfCardWide: {
    flex: 1,
    minWidth: "48%",
  },
  halfCardNarrow: {
    flex: 1,
    width: "100%",
  },
  fullCard: {
    width: "100%",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
    gap: 8,
    flexWrap: "wrap",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  cardSubTitle: {
    fontSize: 9,
    color: Theme.textMuted,
  },
  chartWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  axisRow: {
    flexDirection: "row",
    gap: 4,
    paddingRight: 8,
    marginTop: 3,
  },
  axisChip: {
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  axisChipActive: {
    borderColor: Theme.primary,
    backgroundColor: "#eef2ff",
  },
  axisChipText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  axisChipTextActive: {
    color: Theme.primary,
  },
  row: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 7,
    paddingVertical: 6,
    marginBottom: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowSelected: {
    borderColor: Theme.primary,
    backgroundColor: "#eef2ff",
  },
  heatHealthy: {
    backgroundColor: "#f0fdf4",
  },
  heatWarning: {
    backgroundColor: "#fffbeb",
  },
  heatCritical: {
    backgroundColor: "#fff1f2",
  },
  tableHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  thCell: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  colWide: {
    flex: 1,
    minWidth: 72,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.text,
  },
  colName: {
    flex: 1,
    minWidth: 90,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.text,
  },
  colSmall: {
    width: 64,
    textAlign: "right",
    fontSize: 8,
    color: Theme.textMuted,
    fontWeight: "700",
  },
  colMoney: {
    width: 76,
    textAlign: "right",
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  opsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  opsBadge: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: Theme.whiteMuted,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  opsBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.text,
  },
  tableHeader: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 6,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tableCell: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.text,
  },
  colTrip: {
    width: 92,
  },
  colEntity: {
    flex: 1,
    minWidth: 75,
  },
  positive: {
    color: Theme.primary,
  },
  negative: {
    color: Theme.textMuted,
  },
  mutedText: {
    fontSize: 12,
    color: "#A1A5B7",
    paddingVertical: 6,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
});
