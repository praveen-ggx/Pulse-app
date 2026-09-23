/**
 * Treasury Financial Summary — Suppliers tab. O(n): due = trips only, paid = ledger only, unsettled = max(0, due - paid).
 * Layout aligned with Customers tab: wrap, header, summary row, table card.
 */
import { FinancePromoCard } from "@/features/finance/components/FinancePromoCard";
import { EntityAvatar } from "@/components/EntityAvatar";
import { LiquidFillPill } from "@/components/LiquidFillPill";
import Theme from "@/constants/Theme";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import type { EntityListFilter } from "@/features/finance/components/TreasurySummaryCard";
import { aggregateSuppliersFromRpc, type FinancialRowData, type TripPartyMap } from "@/features/finance/aggregation";
import { CUSTOMERS_SUPPLIERS } from "@/features/finance/constants/tableColumns";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useTripsQuery } from "@/lib/queries/useTripsQuery";
import { useSupplierLedgerAggregationQuery } from "@/lib/queries/useLedgerAggregationQuery";
import { usePaginatedScroll } from "@/lib/usePaginatedScroll";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SupplierRow } from "../services/suppliers.service";

export type SuppliersViewTab = "list" | "analytics";

/** Compact ₹ for secondary lines when space is tight (mobile list). */
function formatAmountCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString("en-IN");
}

/** Minimal ledger row for aggregation (compatible with LedgerTx). */
export interface LedgerRowForSupplier {
  contact_id?: string | null;
  contact_type?: string | null;
  amount_in?: number;
  amount_out?: number;
}

export interface SuppliersTabProps {
  organizationId: string | null;
  /** When provided (e.g. from Finance parent), use these instead of fetching — same pattern as Ledger tab. */
  suppliers?: SupplierRow[];
  trips?: TripRow[];
  /** Ledger (cash_entries) for due aggregation by contact_type === 'supplier'. */
  transactions?: LedgerRowForSupplier[] | null;
  /** Trips where current org is the client (e.g. from getTripsWhereOrgIsClient); counted toward integrated supplier by trip owner. */
  tripsWhereOrgIsClient?: TripRow[];
  /** When true, parent is still loading entity data; show loading until ready. */
  parentLoading?: boolean;
  onTotals?: (totals: { totalIn: number; totalOut: number }) => void;
  onRowSelect?: (
    data: FinancialRowData,
    entityType: "SUPPLIER",
    subTab: "suppliers",
  ) => void;
  searchQuery?: string;
  entityFilter?: EntityListFilter;
  /** Optional map of trip_id -> party ids for ledger fallback attribution. */
  tripPartyMap?: TripPartyMap | null;
  topContent?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
  /** When set, payables match trip Adjustment Registry (cost adjustments). */
  tripFinanceAdjustmentsByTripId?: Record<string, TripAdjustment[]>;
  /** Desktop finance parity: hide summary strip under hero/cards. */
  hideSummaryRow?: boolean;
  /** View mode for the suppliers tab (list | analytics). */
  viewTab?: SuppliersViewTab;
  onViewTabChange?: (v: SuppliersViewTab) => void;
  embedInParentScroll?: boolean;
  onAddPartyPress?: () => void;
}

export function SuppliersTab({
  organizationId,
  suppliers: suppliersProp,
  trips: tripsProp,
  transactions: _transactionsProp,
  tripsWhereOrgIsClient: _tripsWhereOrgIsClientProp,
  parentLoading = false,
  onTotals,
  onRowSelect,
  searchQuery = "",
  entityFilter = "all",
  tripPartyMap: _tripPartyMap,
  topContent,
  refreshing = false,
  onRefresh,
  bottomInset = 100,
  tripFinanceAdjustmentsByTripId,
  hideSummaryRow = false,
  embedInParentScroll = false,
  onAddPartyPress,
}: SuppliersTabProps) {
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && screenWidth >= 1024;
  const isControlled = suppliersProp !== undefined && tripsProp !== undefined;
  const suppliersQuery = useSuppliersQuery(isControlled ? null : organizationId);
  const tripsQuery = useTripsQuery(isControlled ? null : organizationId);
  const suppliers = isControlled ? (suppliersProp ?? []) : (suppliersQuery.data ?? []);
  const applyAdjustments = tripFinanceAdjustmentsByTripId !== undefined;
  const { data: supplierLedgerRpcRows = [], isPending: supplierLedgerLoading } =
    useSupplierLedgerAggregationQuery(organizationId, applyAdjustments);
  const showLoading =
    parentLoading ||
    (!isControlled && (suppliersQuery.isLoading || tripsQuery.isLoading)) ||
    supplierLedgerLoading;

  const supplierAvatarById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, { avatar_url: s.avatar_url, avatar_seed: s.avatar_seed }])),
    [suppliers],
  );

  const { rows, totals } = useMemo(() => {
    return aggregateSuppliersFromRpc(suppliers, supplierLedgerRpcRows);
  }, [
    suppliers,
    supplierLedgerRpcRows,
    tripFinanceAdjustmentsByTripId,
  ]);

  const q = searchQuery.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    let list = rows;
    if (q) {
      list = list.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.subline || "").toLowerCase().includes(q),
      );
    }
    if (entityFilter === "has_due") list = list.filter((r) => (r.due ?? 0) > 0);
    if (entityFilter === "no_due")
      list = list.filter((r) => (r.due ?? 0) === 0);
    return list;
  }, [rows, q, entityFilter]);

  const supplierTableResetKey = useMemo(
    () => `${filteredRows.length}|${q}|${entityFilter}|${searchQuery}`,
    [filteredRows.length, q, entityFilter, searchQuery],
  );
  const {
    visible: visibleSupplierRows,
    onScroll: onSupplierTablePaginatedScroll,
  } = usePaginatedScroll(filteredRows, { resetKey: supplierTableResetKey });

  const handleSupplierTableScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const p = tabBarScrollProps as {
        onScroll?: (ev?: NativeSyntheticEvent<NativeScrollEvent>) => void;
      };
      p.onScroll?.(e);
      onSupplierTablePaginatedScroll(e);
    },
    [tabBarScrollProps, onSupplierTablePaginatedScroll],
  );

  useEffect(() => {
    if (onTotals) {
      onTotals(totals);
    }
  }, [onTotals, totals.totalIn, totals.totalOut]);

  if (showLoading) {
    return <Text style={styles.loading}>Loading…</Text>;
  }
  const hasSuppliers = filteredRows.length > 0;
  if (!hasSuppliers) {
    return (
      <ScrollView
        contentContainerStyle={[
          styles.emptyState,
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
          variant="suppliers"
          onCtaPress={onAddPartyPress}
          style={styles.emptyBanner}
        />
      </ScrollView>
    );
  }

  const totalDue = totals.totalOut ?? 0;
  const totalPayables = totals.totalIn ?? 0;
  const settledPercent =
    totalPayables > 0
      ? Math.round(((totalPayables - totalDue) / totalPayables) * 100)
      : 0;
  const stickyHeaderIndex = topContent
    ? hideSummaryRow
      ? 1
      : 2
    : hideSummaryRow
      ? 0
      : 1;
  const rowsToRender = embedInParentScroll ? filteredRows : visibleSupplierRows;
  const tableContentStyle = [
    styles.tableScrollContent,
    embedInParentScroll
      ? { paddingBottom: 0 }
      : { paddingBottom: bottomInset + insets.bottom },
  ];

  const tableBody = (
    <>
      {topContent}
      {!hideSummaryRow && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Due</Text>
            <Text style={styles.summaryDue}>
              ₹{totalDue.toLocaleString("en-IN")}
            </Text>
          </View>
          <LiquidFillPill
            percentage={settledPercent}
            label="Settled"
            valueSuffix="%"
          />
        </View>
      )}
      <View style={styles.tableHeader}>
        <View style={isWebDesktop ? styles.headerEntityCol : styles.headerEntityColMobile}>
          <Text style={[styles.tableHeaderCell, styles.ctLeft]} numberOfLines={1}>
            Supplier Entity
          </Text>
        </View>
        <View style={styles.headerTripsCol}>
          <Text style={[styles.tableHeaderCell, styles.ctCenter]} numberOfLines={1}>
            Trips
          </Text>
        </View>
        {isWebDesktop ? (
          <>
            <View style={styles.headerAmtCol}>
              <Text style={[styles.tableHeaderCell, styles.ctRight]} numberOfLines={1}>
                Payables
              </Text>
            </View>
            <View style={styles.headerAmtCol}>
              <Text style={[styles.tableHeaderCell, styles.ctRight]} numberOfLines={1}>
                Paid
              </Text>
            </View>
            <View style={styles.headerAmtCol}>
              <Text style={[styles.tableHeaderCell, styles.ctRight]} numberOfLines={1}>
                Due
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.headerOutstandingCol}>
            <Text style={[styles.tableHeaderCell, styles.ctRight]} numberOfLines={1}>
              Due
            </Text>
          </View>
        )}
      </View>
      <View style={styles.tableCard}>
        {rowsToRender.map((data) => {
          const due = data.due ?? 0;
          const paid = data.paid ?? 0;
          const payables = data.payables ?? 0;
          const tripCount = data.trips ?? 0;
          const avatarData = supplierAvatarById.get(data.id);
          if (isWebDesktop) {
            return (
              <TouchableOpacity
                key={data.id}
                style={styles.tableRow}
                onPress={() =>
                  onRowSelect
                    ? onRowSelect(data, "SUPPLIER", "suppliers")
                    : router.push(`/supplier/${data.id}`)
                }
                activeOpacity={0.7}
              >
                <View style={[styles.tableCell, styles.ctEntity]}>
                  <View style={styles.tableEntityMain}>
                    <EntityAvatar
                      name={data.name ?? ""}
                      avatarUrl={avatarData?.avatar_url}
                      avatarSeed={avatarData?.avatar_seed}
                      initialsColorSeed={data.id}
                      entityType="supplier"
                      isIntegrated={!!data.is_integrated}
                      badgeOverlay
                    />
                    <Text style={styles.tableEntityName} numberOfLines={1} ellipsizeMode="tail">
                      {data.name ?? "—"}
                    </Text>
                  </View>
                </View>
                <View style={[styles.tableCell, styles.ctTrips]}>
                  <View style={styles.tripsPill}>
                    <Text style={styles.tripsPillText}>{tripCount}</Text>
                  </View>
                </View>
                <View style={[styles.tableCell, styles.ctAmt]}>
                  <Text style={styles.tableAmtValue} numberOfLines={1}>
                    ₹{payables.toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={[styles.tableCell, styles.ctAmt]}>
                  <Text style={styles.tableAmtPaid} numberOfLines={1}>
                    ₹{paid.toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={[styles.tableCell, styles.ctAmt]}>
                  <Text
                    style={[
                      styles.tableDueValue,
                      due > 0 ? styles.tableDueUnpaid : styles.tableDueSettled,
                    ]}
                    numberOfLines={1}
                  >
                    ₹{due.toLocaleString("en-IN")}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              key={data.id}
              style={styles.tableRowMobile}
              onPress={() =>
                onRowSelect
                  ? onRowSelect(data, "SUPPLIER", "suppliers")
                  : router.push(`/supplier/${data.id}`)
              }
              activeOpacity={0.7}
            >
              <EntityAvatar
                name={data.name ?? ""}
                avatarUrl={avatarData?.avatar_url}
                avatarSeed={avatarData?.avatar_seed}
                initialsColorSeed={data.id}
                entityType="supplier"
                isIntegrated={!!data.is_integrated}
                badgeOverlay
              />
              <View style={[styles.tableCell, styles.ctEntityMobile]}>
                <Text style={styles.tableEntityName} numberOfLines={1} ellipsizeMode="tail">
                  {data.name ?? "—"}
                </Text>
                <Text style={styles.tableEntitySub} numberOfLines={1} ellipsizeMode="tail">
                  Payables: ₹{formatAmountCompact(payables)}
                </Text>
              </View>
              <View style={[styles.tableCell, styles.ctTrips]}>
                <View style={styles.tripsPill}>
                  <Text style={styles.tripsPillText}>{tripCount}</Text>
                </View>
              </View>
              <View style={[styles.tableCell, styles.ctOutstanding]}>
                <Text
                  style={[
                    styles.tableOutstandingValue,
                    due > 0 ? styles.tableDueUnpaid : styles.tableDueSettled,
                  ]}
                  numberOfLines={1}
                >
                  ₹{due.toLocaleString("en-IN")}
                </Text>
                <Text style={styles.tablePaidLine} numberOfLines={1}>
                  Paid:{" "}
                  <Text style={styles.tableDueSettled}>
                    ₹{formatAmountCompact(paid)}
                  </Text>
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  if (embedInParentScroll) {
    return (
      <View style={[styles.wrap, styles.wrapEmbedded]}>
        <View style={tableContentStyle}>{tableBody}</View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.tableScroll}
        contentContainerStyle={tableContentStyle}
        showsVerticalScrollIndicator={false}
        {...tabBarScrollProps}
        onScroll={handleSupplierTableScroll}
        scrollEventThrottle={tabBarScrollProps.scrollEventThrottle ?? 100}
        stickyHeaderIndices={[stickyHeaderIndex]}
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
        {tableBody}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { padding: 24, textAlign: "center", color: Theme.textSecondary },
  wrap: { flex: 1, backgroundColor: "#FBFBFF" },
  wrapEmbedded: { flex: 0, width: "100%", minWidth: 0 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
    textTransform: "uppercase",
  },
  sectionSubtitle: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 6,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  summaryDue: {
    fontSize: 18,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.teslaRed,
  },
  tableScroll: { flex: 1 },
  tableScrollContent: { paddingHorizontal: 0, paddingTop: 12 },
  tableCard: {
    backgroundColor: "rgba(255,255,255,0.8)",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  tableHeader: {
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
  tableHeaderCell: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  ctLeft: { textAlign: "left" },
  ctCenter: { textAlign: "center" },
  ctRight: { textAlign: "right" },
  headerEntityCol: { flex: CUSTOMERS_SUPPLIERS.node, minWidth: 0, justifyContent: "center" },
  headerEntityColMobile: { flex: 2.2, minWidth: 0, justifyContent: "center" },
  headerTripsCol: { flex: CUSTOMERS_SUPPLIERS.trips, minWidth: 44, justifyContent: "center" },
  headerAmtCol: { flex: CUSTOMERS_SUPPLIERS.mission, minWidth: 0, justifyContent: "center" },
  headerOutstandingCol: { flex: 1.5, minWidth: 0, justifyContent: "center" },
  ctEntity: { flex: CUSTOMERS_SUPPLIERS.node, minWidth: 0 },
  ctEntityMobile: { flex: 2.2, minWidth: 0 },
  ctTrips: { flex: CUSTOMERS_SUPPLIERS.trips, minWidth: 44, justifyContent: "center" },
  ctAmt: {
    flex: CUSTOMERS_SUPPLIERS.mission,
    minWidth: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  ctOutstanding: {
    flex: 1.5,
    minWidth: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableRowMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 62,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableCell: { paddingHorizontal: 5, minWidth: 0 },
  tableEntityMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  tableEntityName: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    flex: 1,
    minWidth: 0,
  },
  tableEntitySub: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  tableDueValue: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    textAlign: "right",
  },
  tableOutstandingValue: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    textAlign: "right",
  },
  tableDueUnpaid: { color: Theme.teslaRed },
  tableDueSettled: { color: Theme.darkGreen },
  tablePaidLine: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "right",
  },
  tableAmtValue: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  tableAmtPaid: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.darkGreen,
    textAlign: "right",
  },
  tripsPill: {
    alignSelf: "center",
    minWidth: 28,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsPillText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  emptyState: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "stretch",
    flexGrow: 1,
  },
  emptyBanner: {
    width: "100%",
    alignSelf: "stretch",
    paddingTop: 4,
    paddingBottom: 8,
  },
  emptyText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
  },
});
