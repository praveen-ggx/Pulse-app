/**
 * Treasury Financial Summary — Customers tab. O(n) aggregation: received = ledger only, billed = trips only.
 * Supports matrix (table) view and ledger (transaction cards) view with toggle.
 */
import { FinancePromoCard } from "@/features/finance/components/FinancePromoCard";
import { FAB } from "@/components/FAB";
import { EntityAvatar } from "@/components/EntityAvatar";
import { LiquidFillPill } from "@/components/LiquidFillPill";
import Theme from "@/constants/Theme";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import {
    aggregateCustomersFromRpc,
    type TripPartyMap,
} from "@/features/finance/aggregation";
import {
    type FinancialRowData
} from "@/features/finance/components/FinancialRow";
import { CUSTOMERS_SUPPLIERS } from "@/features/finance/constants/tableColumns";
import type { TripDetailMap } from "@/features/finance/components/LedgerTransactionListView";
import type { EntityListFilter } from "@/features/finance/components/TreasurySummaryCard";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import { buildUniqueLinkedOrgIdMap, isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatLedgerDate } from "@/lib/format";
import { useClientsQuery, useTripsQuery } from "@/lib/queries";
import { useCustomerLedgerInputsQuery } from "@/lib/queries/useLedgerAggregationQuery";
import { usePaginatedScroll } from "@/lib/usePaginatedScroll";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ClientRow } from "../services/clients.service";

export type EntityType = "CLIENT" | "SUPPLIER" | "VEHICLE" | "DRIVER";

export type CustomersViewTab = "list" | "analytics";

/** Compact ₹ for secondary lines when space is tight (mobile list). */
function formatCustomerAmountCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString("en-IN");
}

/** Format date as "11 MAR" for receivables-by-trip row. */
function formatTripDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const day = d.getDate();
    const month = d.toLocaleString("en-IN", { month: "short" }).toUpperCase();
    return `${day} ${month}`;
  } catch {
    return "—";
  }
}


/** Receivables row aging: "Due today" | "1 day overdue" | "X days overdue". */
function receivablesAgingLabel(pickupDate: string | null | undefined): string {
  if (!pickupDate) return "";
  try {
    const d = new Date(pickupDate);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return "Due today";
    if (diffDays === 1) return "1 day overdue";
    return `${diffDays} days overdue`;
  } catch {
    return "";
  }
}

/** Ledger rows for this client (contact_id or party_name match). */
function filterLedgerForClient(
  rows: LedgerRow[] | null,
  clientId: string,
  clientName: string,
): LedgerRow[] {
  if (!rows || rows.length === 0) return [];
  const nameKey = (clientName ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (
      r.contact_type === "client" &&
      r.contact_id != null &&
      String(r.contact_id).trim() === String(clientId).trim()
    )
      return true;
    return (
      nameKey !== "" && (r.party_name ?? "").trim().toLowerCase() === nameKey
    );
  });
}

/** Received amount per trip_id from client ledger rows (amount_in only). */
function receivedByTripId(rows: LedgerRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.trip_id) {
      out[r.trip_id] = (out[r.trip_id] ?? 0) + Number(r.amount_in ?? 0);
    }
  }
  return out;
}

function CustomerDetailView({
  customer,
  trips,
  ledgerRows = null,
  onBack,
  insets,
  uniqueLinkedClientIdByOrgId,
}: {
  customer: FinancialRowData;
  trips: TripRow[];
  ledgerRows?: LedgerRow[] | null;
  onBack: () => void;
  insets: { top: number; bottom: number };
  uniqueLinkedClientIdByOrgId: Map<string, string>;
}) {
  const [detailTab, setDetailTab] = useState<
    "receivables" | "by_trip" | "cash"
  >("receivables");
  const [byTripSearch, setByTripSearch] = useState("");

  const customerTrips = useMemo(() => {
    const name = (customer.name ?? "").trim().toLowerCase();
    return trips.filter(
      (t) => {
        const matchesDirect =
          t.client_id === customer.id ||
          (t.client_name ?? "").trim().toLowerCase() === name;

        // Supplier-side integrated client: shipper as customer. Attribute trips where
        // this client's linked_organization_id matches trip.organization_id.
        const matchesLinkedOrg =
          customer.is_integrated === true &&
          customer.linked_organization_id &&
          isLoadBasedTrip(t) &&
          t.organization_id &&
          customer.linked_organization_id === t.organization_id &&
          uniqueLinkedClientIdByOrgId.get(customer.linked_organization_id) === customer.id;

        return matchesDirect || matchesLinkedOrg;
      },
    );
  }, [
    customer.id,
    customer.name,
    customer.linked_organization_id,
    customer.is_integrated,
    trips,
    uniqueLinkedClientIdByOrgId,
  ]);

  const clientLedgerRows = useMemo(
    () =>
      filterLedgerForClient(
        ledgerRows ?? null,
        customer.id,
        customer.name ?? "",
      ),
    [ledgerRows, customer.id, customer.name],
  );

  const receivedByTrip = useMemo(
    () => receivedByTripId(clientLedgerRows),
    [clientLedgerRows],
  );

  const sales = customer.billed ?? 0;
  const due = customer.pending ?? 0;
  const received = customer.received ?? Math.max(0, sales - due);
  const health = sales > 0 ? Math.round((received / sales) * 100) : 0;

  const sortedClientTx = useMemo(
    () =>
      [...clientLedgerRows].sort((a, b) => {
        const da = a.transaction_date ?? a.created_at ?? "";
        const db = b.transaction_date ?? b.created_at ?? "";
        return db.localeCompare(da);
      }),
    [clientLedgerRows],
  );

  const tabLabels = [
    { id: "receivables" as const, label: "Receivables" },
    { id: "by_trip" as const, label: "By Trip" },
    { id: "cash" as const, label: "Cash Flow" },
  ];

  const filteredByTripList = useMemo(() => {
    if (!byTripSearch.trim()) return customerTrips;
    const q = byTripSearch.trim().toLowerCase();
    return customerTrips.filter((t) => {
      const tripId = (t.display_trip_id ?? t.trip_number ?? t.id)
        .toString()
        .toLowerCase();
      const route =
        `${t.pickup_area ?? ""} ${t.drop_location ?? ""}`.toLowerCase();
      const loc = (t.pickup_area ?? t.drop_location ?? "").toLowerCase();
      return tripId.includes(q) || route.includes(q) || loc.includes(q);
    });
  }, [customerTrips, byTripSearch]);

  return (
    <View style={[detailStyles.wrap, { paddingTop: insets.top }]}>
      <View style={detailStyles.header}>
        <TouchableOpacity
          style={detailStyles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
        >
          <FontAwesome name="chevron-left" size={22} color={Theme.textOnDark} />
        </TouchableOpacity>
        <View style={detailStyles.headerCenter}>
          <Text style={detailStyles.title} numberOfLines={1}>
            {customer.name ?? "—"}
          </Text>
          <Text style={detailStyles.subtitle}>CLIENT</Text>
        </View>
        <View style={detailStyles.headerRightIcons}>
          <TouchableOpacity
            style={detailStyles.headerIconBtn}
            activeOpacity={0.8}
          >
            <FontAwesome name="th" size={18} color={Theme.textOnDark} />
          </TouchableOpacity>
          <TouchableOpacity
            style={detailStyles.headerIconBtn}
            activeOpacity={0.8}
          >
            <FontAwesome name="globe" size={18} color={Theme.textOnDark} />
          </TouchableOpacity>
          <TouchableOpacity
            style={detailStyles.headerIconBtn}
            activeOpacity={0.8}
          >
            <View>
              <FontAwesome name="bell" size={18} color={Theme.textOnDark} />
              <View style={detailStyles.bellDot} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={detailStyles.headerIconBtn}
            activeOpacity={0.8}
          >
            <FontAwesome name="user" size={18} color={Theme.textOnDark} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={detailStyles.tabRow}>
        {tabLabels.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              detailStyles.tabItem,
              detailTab === tab.id && detailStyles.tabItemActive,
            ]}
            onPress={() => setDetailTab(tab.id)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                detailStyles.tabItemText,
                detailTab === tab.id && detailStyles.tabItemTextActive,
              ]}
            >
              {tab.label.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={detailStyles.scroll}
        contentContainerStyle={[
          detailStyles.scrollContent,
          { paddingBottom: 80 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Scorecard: only on Receivables tab */}
        {detailTab === "receivables" && (
          <View style={detailStyles.scorecard}>
            <View style={detailStyles.scorecardTop}>
              <View>
                <Text style={detailStyles.scorecardLabel}>Financial Overview</Text>
                <Text style={detailStyles.scorecardAmount}>
                  ₹{sales.toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={detailStyles.healthCircle}>
                <Text style={detailStyles.healthCircleText}>{health}%</Text>
              </View>
            </View>
            <View style={detailStyles.scorecardGrid}>
              <View>
                <Text style={detailStyles.scorecardGridLabel}>Received</Text>
                <Text style={detailStyles.scorecardGridPaid}>
                  ₹{received.toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={detailStyles.scorecardGridRight}>
                <Text style={detailStyles.scorecardGridLabelDue}>Due</Text>
                <Text style={detailStyles.scorecardGridDue}>
                  ₹{due.toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Tab content: Trip-level receivables (Trips) */}
        {detailTab === "receivables" && (
          <View style={detailStyles.section}>
            <View style={detailStyles.tableCard}>
              <View style={detailStyles.tableHeader}>
                <Text
                  style={[detailStyles.tableHeaderCell, detailStyles.thMission]}
                >
                  Mission
                </Text>
                <Text
                  style={[detailStyles.tableHeaderCell, detailStyles.thRight]}
                >
                    Received
                </Text>
                <Text
                  style={[detailStyles.tableHeaderCell, detailStyles.thRight]}
                >
                  Due
                </Text>
              </View>
              {customerTrips.length > 0 ? (
                customerTrips.map((t) => {
                  const tripReceived = receivedByTrip[t.id] ?? 0;
                  const isIntegratedSupplierTrip =
                    customer.is_integrated === true &&
                    customer.linked_organization_id &&
                    isLoadBasedTrip(t) &&
                    t.organization_id &&
                    customer.linked_organization_id === t.organization_id &&
                    uniqueLinkedClientIdByOrgId.get(customer.linked_organization_id) === customer.id;
                  const contract = isIntegratedSupplierTrip
                    ? Number(t.supplier_rate ?? 0)
                    : Number(t.client_price ?? 0);
                  const tripDue = Math.max(0, contract - tripReceived);
                  const tripIdStr = (
                    t.display_trip_id ??
                    t.trip_number ??
                    t.id
                  ).toString();
                  const route =
                    `${t.pickup_area ?? ""} → ${t.drop_location ?? ""}`.trim() ||
                    "—";
                  return (
                    <View key={t.id} style={detailStyles.tableRow}>
                      <View style={detailStyles.tableCellMission}>
                        <Text style={detailStyles.tableCellTripId}>
                          {tripIdStr}
                        </Text>
                        <Text
                          style={detailStyles.tableCellRoute}
                          numberOfLines={1}
                        >
                          {route}
                        </Text>
                      </View>
                      <Text style={detailStyles.tableCellPaid}>
                        ₹{tripReceived.toLocaleString("en-IN")}
                      </Text>
                      <Text style={detailStyles.tableCellDue}>
                        ₹{tripDue.toLocaleString("en-IN")}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <View style={detailStyles.missionEmpty}>
                  <Text style={detailStyles.missionEmptyText}>No trips</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* By Trip: Total Billing / Total Balance, search, RECEIVABLES BY TRIP table */}
        {detailTab === "by_trip" && (
          <View style={detailStyles.section}>
            <View style={detailStyles.byTripSummaryRow}>
              <View style={detailStyles.byTripBillingCard}>
                <View style={detailStyles.byTripCardHeader}>
                  <FontAwesome
                    name="arrow-up"
                    size={10}
                    color={Theme.darkGreen}
                  />
                  <Text style={detailStyles.byTripCardLabel}>
                    TOTAL BILLING
                  </Text>
                </View>
                <Text style={detailStyles.byTripBillingValue}>
                  ₹{sales.toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={detailStyles.byTripBalanceCard}>
                <View style={detailStyles.byTripCardHeader}>
                  <FontAwesome
                    name="arrow-down"
                    size={10}
                    color={Theme.loaderAccent}
                  />
                  <Text style={detailStyles.byTripCardLabel}>
                    TOTAL BALANCE
                  </Text>
                </View>
                <Text style={detailStyles.byTripBalanceValue}>
                  ₹{due.toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
            <View style={detailStyles.searchWrap}>
              <View style={detailStyles.searchIcon}>
                <FontAwesome
                  name="search"
                  size={16}
                  color={Theme.driverPlaceholder}
                />
              </View>
              <TextInput
                style={detailStyles.byTripSearchInput}
                placeholder="Search trip, destination..."
                placeholderTextColor={Theme.driverPlaceholder}
                value={byTripSearch}
                onChangeText={setByTripSearch}
              />
              <TouchableOpacity
                style={detailStyles.searchFileIcon}
                activeOpacity={0.8}
              >
                <FontAwesome
                  name="file-text-o"
                  size={16}
                  color={Theme.driverTextMuted}
                />
              </TouchableOpacity>
            </View>
            <View style={detailStyles.byTripContent}>
              <Text style={detailStyles.byTripSectionTitle}>
                RECEIVABLES BY TRIP
              </Text>
              <Text style={detailStyles.byTripSectionSubtitle}>
                From trip details: sale value (client billing), received,
                pending from client.
              </Text>
              <View style={detailStyles.byTripTable}>
                <View style={detailStyles.byTripTableHeader}>
                  <Text
                    style={[detailStyles.byTripTh, detailStyles.byTripThTripId]}
                  >
                    TRIP ID
                  </Text>
                  <Text
                    style={[detailStyles.byTripTh, detailStyles.byTripThRight]}
                  >
                    SALE VALUE
                  </Text>
                  <Text
                    style={[detailStyles.byTripTh, detailStyles.byTripThRight]}
                  >
                    RECEIVED
                  </Text>
                  <Text
                    style={[
                      detailStyles.byTripTh,
                      detailStyles.byTripThPendingCol,
                    ]}
                  >
                    PENDING
                  </Text>
                </View>
                {filteredByTripList.length > 0 ? (
                  filteredByTripList.map((t) => {
                    const tripReceived = receivedByTrip[t.id] ?? 0;
                    const contract = t.client_price ?? 0;
                    const tripDue = Math.max(0, contract - tripReceived);
                    const tripIdStr = (
                      t.display_trip_id ??
                      t.trip_number ??
                      t.id
                    ).toString();
                    const originCity = t.pickup_area ?? t.drop_location ?? "—";
                    const route =
                      `${t.pickup_area ?? ""} → ${t.drop_location ?? ""}`.trim() ||
                      "—";
                    const dateShort = formatTripDateShort(
                      t.pickup_date ?? t.created_at,
                    );
                    const aging = receivablesAgingLabel(t.pickup_date);
                    const detailLine = [dateShort, aging, route]
                      .filter(Boolean)
                      .join(" • ");
                    return (
                      <View key={t.id} style={detailStyles.byTripRow}>
                        <View style={detailStyles.byTripCellTripId}>
                          <Text style={detailStyles.byTripRowTripId}>
                            {tripIdStr}
                          </Text>
                          <Text
                            style={detailStyles.byTripRowOrigin}
                            numberOfLines={1}
                          >
                            {originCity}
                          </Text>
                          <Text
                            style={detailStyles.byTripRowDetailLine}
                            numberOfLines={1}
                          >
                            {detailLine}
                          </Text>
                        </View>
                        <Text style={detailStyles.byTripCellSale}>
                          ₹{(contract ?? 0).toLocaleString("en-IN")}
                        </Text>
                        <Text style={detailStyles.byTripCellReceivedGreen}>
                          ₹{tripReceived.toLocaleString("en-IN")}
                        </Text>
                        <View style={detailStyles.byTripCellPendingWrap}>
                          <Text style={detailStyles.byTripCellPending}>
                            ₹{tripDue.toLocaleString("en-IN")}
                          </Text>
                          <View style={detailStyles.byTripChevronInline}>
                            <FontAwesome
                              name="chevron-right"
                              size={14}
                              color={Theme.textMuted}
                            />
                          </View>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={detailStyles.missionEmpty}>
                    <Text style={detailStyles.missionEmptyText}>
                      No trips match your search
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Cash Flow: transaction cards (reference: why, date • tripId, amount) */}
        {detailTab === "cash" && (
          <View style={detailStyles.section}>
            {sortedClientTx.length > 0 ? (
              sortedClientTx.slice(0, 30).map((tx) => {
                const isIn = Number(tx.amount_in ?? 0) > 0;
                const amt = isIn ? Number(tx.amount_in) : Number(tx.amount_out);
                const dateStr = formatLedgerDate(
                  tx.transaction_date ?? tx.created_at,
                );
                const tripId = tx.trip_number ?? tx.trip_id ?? "—";
                const why = tx.description || tx.party_name || "—";
                return (
                  <View key={tx.id} style={detailStyles.cashCard}>
                    <View
                      style={[
                        detailStyles.cashCardIcon,
                        isIn
                          ? detailStyles.cashCardIconIn
                          : detailStyles.cashCardIconOut,
                      ]}
                    >
                      <FontAwesome
                        name="check"
                        size={14}
                        color={Theme.textOnPrimary}
                      />
                    </View>
                    <View style={detailStyles.cashCardBody}>
                      <Text style={detailStyles.cashCardWhy} numberOfLines={1}>
                        {why}
                      </Text>
                      <Text style={detailStyles.cashCardMeta}>
                        {dateStr} • {tripId}
                      </Text>
                    </View>
                    <Text style={detailStyles.cashCardAmount}>
                      ₹{amt.toLocaleString("en-IN")}
                    </Text>
                  </View>
                );
              })
            ) : (
              <View style={detailStyles.missionEmpty}>
                <Text style={detailStyles.missionEmptyText}>
                  No cash entries for this client
                </Text>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      <FAB onPress={() => {}} />
    </View>
  );
}

const detailStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Theme.darkSurface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.driverBorder,
    backgroundColor: Theme.darkSurface,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerRightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    right: 2,
    top: 2,
    width: 8,
    height: 8,
    backgroundColor: Theme.teslaRed,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.driverTextMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,
    backgroundColor: Theme.darkSurface,
    gap: 20,
  },
  tabItem: {
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomColor: Theme.tabUnderline,
  },
  tabItemText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.driverTextMuted,
    letterSpacing: 0.4,
  },
  tabItemTextActive: {
    color: Theme.textOnDark,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },
  section: { marginBottom: 20 },
  scorecard: {
    backgroundColor: Theme.darkBackground,
    padding: 28,
    marginBottom: 20,
    overflow: "hidden",
  },
  scorecardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  scorecardLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.aggregatePillText,
    letterSpacing: 0.8,
  },
  scorecardAmount: {
    fontSize: 28,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 4,
  },
  scorecardGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  scorecardGridRight: { alignItems: "flex-end" },
  scorecardGridLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.darkGreen,
    letterSpacing: 0.6,
  },
  scorecardGridLabelDue: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.teslaRed,
    letterSpacing: 0.6,
  },
  scorecardGridPaid: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 4,
  },
  scorecardGridDue: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.teslaRed,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Theme.driverSurfaceElevated,
    padding: 14,
  },
  summaryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  summaryCardLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.driverTextMuted,
    letterSpacing: 0.5,
  },
  summaryCardBillingValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.darkGreen,
  },
  summaryCardBalanceValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.teslaRed,
  },
  searchWrap: {
    height: 44,
    paddingHorizontal: 14,
    paddingLeft: 40,
    paddingRight: 44,
    backgroundColor: Theme.darkInputBg,
    justifyContent: "center",
    marginBottom: 16,
  },
  searchIcon: { position: "absolute", left: 14, top: 14 },
  searchPlaceholder: { fontSize: 13, color: Theme.driverPlaceholder },
  searchFileIcon: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 28,
    height: 28,
    backgroundColor: Theme.driverSurfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  byTripSearchInput: {
    flex: 1,
    fontSize: 13,
    color: Theme.textOnDark,
    paddingVertical: 0,
    paddingLeft: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  byTripSummaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  byTripBillingCard: {
    flex: 1,
    backgroundColor: Theme.darkSurface,
    padding: 14,
  },
  byTripBalanceCard: {
    flex: 1,
    backgroundColor: Theme.darkSurface,
    padding: 14,
  },
  byTripCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  byTripCardLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: 0.5,
  },
  byTripBillingValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.darkGreen,
  },
  byTripBalanceValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.teslaRed,
  },
  byTripContent: {
    backgroundColor: Theme.cardWhite,
    padding: 16,
    marginTop: 8,
  },
  byTripSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  byTripSectionSubtitle: {
    fontSize: 10,
    color: Theme.textMuted,
    marginBottom: 14,
    lineHeight: 14,
  },
  byTripTable: {},
  byTripTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  byTripTh: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
  },
  byTripThTripId: { flex: 1.8, minWidth: 0 },
  byTripThRight: { width: 80, textAlign: "right" },
  byTripThPendingCol: { width: 92, textAlign: "right" },
  byTripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  byTripCellTripId: { flex: 1.8, minWidth: 0, justifyContent: "center" },
  byTripRowTripId: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  byTripRowOrigin: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 4,
  },
  byTripRowDetailLine: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 2,
  },
  byTripCellSale: {
    width: 80,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  byTripCellReceivedGreen: {
    width: 80,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "700",
    color: Theme.darkGreen,
  },
  byTripCellPendingWrap: {
    width: 92,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  byTripCellPending: { fontSize: 11, fontWeight: "700", color: Theme.teslaRed },
  byTripChevronInline: { marginLeft: 6 },
  sectionHeader: { marginBottom: 10 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.driverTextMuted,
    letterSpacing: 0.4,
  },
  sectionSubtitle: {
    fontSize: 10,
    color: Theme.driverTextMuted,
    marginTop: 4,
  },
  fiscalDnaCard: {
    backgroundColor: Theme.darkBackground,
    padding: 28,
    marginBottom: 24,
    overflow: "hidden",
  },
  fiscalDnaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  fiscalDnaLeft: { flex: 1 },
  fiscalDnaLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  fiscalDnaAmount: {
    fontSize: 28,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 4,
  },
  fiscalDnaSub: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.aggregatePillText,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 4,
  },
  fiscalDnaGrid: {
    flexDirection: "row",
    gap: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  fiscalDnaGridCell: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  fiscalDnaGridCellRight: { alignItems: "flex-end" },
  fiscalDnaGridLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.darkGreen,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fiscalDnaGridLabelDue: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.teslaRed,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  fiscalDnaGridPaid: {
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 4,
  },
  fiscalDnaGridDue: {
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.teslaRed,
    marginTop: 4,
  },
  pendingCard: {
    backgroundColor: Theme.darkBackground,
    padding: 32,
    marginBottom: 24,
    overflow: "hidden",
  },
  pendingCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  pendingCardLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  pendingCardAmount: {
    fontSize: 28,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.teslaRed,
    marginTop: 4,
  },
  healthCircle: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  healthCircleText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Theme.darkGreen,
  },
  pendingCardHint: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textAlign: "center",
  },
  sectionPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.darkBackground,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionPillText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textOnPrimary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  ledgerCard: {
    backgroundColor: "#F8FAFC",
    padding: 32,
  },
  ledgerCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  ledgerCardRight: { alignItems: "flex-end" },
  ledgerCardLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  ledgerCardValue: {
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  ledgerCardDue: { fontSize: 18, color: Theme.teslaRed },
  missionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.screenBackground,
    padding: 24,
    marginBottom: 12,
  },
  missionCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flex: 1,
    minWidth: 0,
  },
  missionCardIcon: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(99,102,241,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  missionCardIconText: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.primary,
  },
  missionCardRoute: {
    fontSize: 12,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  missionCardContract: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginTop: 4,
  },
  missionEmpty: { paddingVertical: 32, alignItems: "center" },
  missionEmptyText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.driverTextMuted,
  },
  receivablesSummaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  receivablesSummaryBilling: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.screenBackground,
  },
  receivablesSummaryBalance: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.screenBackground,
  },
  receivablesSummaryBillingValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.darkGreen,
  },
  receivablesSummaryBalanceValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.teslaRed,
  },
  receivablesSummaryLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  receivablesSummaryValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  tableCard: {
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
  },
  thMission: { flex: 1.5, minWidth: 0 },
  thTripId: { flex: 1.8, minWidth: 0 },
  thSale: { width: 80, textAlign: "right" },
  thReceived: { width: 80, textAlign: "right" },
  thPending: { width: 80, textAlign: "right" },
  thRight: { width: 72, textAlign: "right" },
  thChevron: { width: 28, alignItems: "flex-end", justifyContent: "center" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableCellMission: { flex: 1.5, minWidth: 0 },
  missionIdRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  missionIdDot: {
    width: 4,
    height: 4,
    backgroundColor: Theme.aggregatePillText,
  },
  tableCell: { flex: 1.8, minWidth: 0 },
  tableCellTripId: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  tableCellPaid: {
    width: 72,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "700",
    color: Theme.darkGreen,
  },
  tableCellDue: {
    width: 72,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
  },
  tableCellLocation: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginTop: 2,
  },
  tableCellMeta: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  tableCellRoute: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  tableCellDate: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.primary,
    marginTop: 2,
  },
  tableCellAmount: {
    width: 80,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
  },
  tableCellRight: {
    width: 72,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "600",
  },
  tableCellContract: { color: Theme.textPrimaryDark },
  tableCellReceived: { color: Theme.darkGreen },
  tableCellSync: { color: Theme.darkGreen },
  tableCellPendingRed: { color: Theme.teslaRed, fontWeight: "700" },
  tableCellPendingGreen: { color: Theme.darkGreen, fontWeight: "700" },
  tableCellDueRed: { color: Theme.teslaRed, fontWeight: "700" },
  tableCellDueGreen: { color: Theme.darkGreen, fontWeight: "700" },
  cashCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.surface,
    padding: 18,
    marginBottom: 10,
  },
  cashCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  cashCardBody: { flex: 1, minWidth: 0, justifyContent: "center" },
  cashCardIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  cashCardIconIn: {
    backgroundColor: Theme.positiveMuted,
  },
  cashCardIconOut: {
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  cashCardWhy: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  cashCardMeta: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  cashCardAmount: { fontSize: 12, fontWeight: "700", fontStyle: "italic" },
  cashCardAmountIn: { color: Theme.darkGreen },
  cashCardAmountOut: { color: Theme.teslaRed },
  sharedCard: {
    backgroundColor: Theme.driverSurfaceElevated,
    padding: 24,
    marginBottom: 16,
  },
  sharedSyncRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  sharedSyncTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  sharedMismatchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff7ed",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sharedMismatchText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#ea580c",
  },
  sharedPendingBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  sharedPendingDot: {
    width: 8,
    height: 8,
    backgroundColor: "#f97316",
  },
  sharedPendingText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#ea580c",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sharedGrid: {
    flexDirection: "row",
    gap: 1,
    backgroundColor: Theme.borderLight,
    overflow: "hidden",
    marginBottom: 16,
  },
  sharedGridCell: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Theme.screenBackground,
    position: "relative",
  },
  sharedGridLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  sharedGridValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  sharedGridValueMismatch: {
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.teslaRed,
  },
  sharedGridMismatchIcon: {
    position: "absolute",
    right: 12,
    top: "50%",
    marginTop: -7,
  },
  sharedActions: {
    flexDirection: "row",
    gap: 12,
  },
  sharedBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  sharedBtnPrimaryText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sharedBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  sharedBtnSecondaryText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  inviteCard: {
    backgroundColor: Theme.surfaceGray,
    borderStyle: "dashed",
    padding: 32,
    alignItems: "center",
  },
  inviteIconWrap: {
    width: 80,
    height: 80,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  inviteTitle: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    marginBottom: 12,
  },
  inviteDesc: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  inviteCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 16,
    backgroundColor: Theme.darkBackground,
    marginBottom: 16,
  },
  inviteCtaText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  inviteSecure: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    opacity: 0.5,
  },
  inviteSecureText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
  },
  sharedLedgerDesc: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.driverTextMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  sharedLedgerCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: Theme.driverBorder,
    borderRadius: 20,
  },
  sharedLedgerCtaText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: 0.4,
  },
});

/** Minimal transaction shape for aggregation (compatible with LedgerTx). */
export interface LedgerTransactionRow {
  party_name?: string | null;
  amount_in?: number;
  amount_out?: number;
  contact_id?: string | null;
  contact_type?: "client" | "supplier" | "driver" | "dco" | null;
}

/** Minimal shape for a pending client invitation (invite-by-phone sent, awaiting approval). */
export interface PendingClientInviteRow {
  id: string;
  to_org_name: string;
}

export interface CustomersTabProps {
  organizationId: string | null;
  /** When provided (e.g. from Finance parent), use these instead of fetching — same pattern as Ledger tab. */
  clients?: ClientRow[];
  trips?: TripRow[];
  /**
   * Trips from other orgs where this org is the supplier/carrier.
   * Merged with own trips so the shipper (Mukunt) appears in this org's Customers tab
   * with the correct supplier_rate amount via aggregateCustomers Pass 2.
   */
  tripsWhereOrgIsSupplier?: TripRow[];
  /** Ledger transactions: parties that appear here but not in clients are shown as customer rows (received/pending from amounts). */
  transactions?: LedgerTransactionRow[] | null;
  /** When true, parent is still loading entity data; show loading until ready. */
  parentLoading?: boolean;
  onTotals?: (totals: { totalIn: number; totalOut: number }) => void;
  /** When set, row tap opens entity detail overlay instead of navigating to /client/[id]. */
  onRowSelect?: (
    data: FinancialRowData,
    entityType: EntityType,
    subTab: "customers",
  ) => void;
  searchQuery?: string;
  entityFilter?: EntityListFilter;
  /** Pending connection requests sent (invite-by-phone as client); shown as "Pending invitations". */
  pendingClientInvites?: PendingClientInviteRow[];
  /** Optional map of trip_id -> party ids for ledger fallback attribution. */
  tripPartyMap?: TripPartyMap | null;
  /** Full ledger rows for transaction (ledger) view; filter to amount_in > 0 for customer receipts. */
  ledgerRows?: LedgerRow[] | null;
  tripDetailsMap?: TripDetailMap;
  tripOptions?: {
    id: string;
    trip_number: string;
    route?: string | null;
    trip_date?: string | null;
    vehicle_number?: string | null;
  }[];
  onMissionChange?: (entryId: string, tripId: string) => void;
  topContent?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
  /** When set, billed totals match trip Adjustment Registry (revenue adjustments). */
  tripFinanceAdjustmentsByTripId?: Record<string, TripAdjustment[]>;
  /** Desktop finance parity: hide summary strip under hero/cards. */
  hideSummaryRow?: boolean;
  /** View mode for the customers tab (list | analytics). */
  viewTab?: CustomersViewTab;
  onViewTabChange?: (v: CustomersViewTab) => void;
  /** Parent ScrollView owns vertical scroll (finance mobile). */
  embedInParentScroll?: boolean;
  onAddPartyPress?: () => void;
}

export function CustomersTab({
  organizationId,
  clients: clientsProp,
  trips: tripsProp,
  tripsWhereOrgIsSupplier: tripsWhereOrgIsSupplierProp,
  transactions: _transactionsProp,
  parentLoading = false,
  onTotals,
  onRowSelect,
  searchQuery = "",
  entityFilter = "all",
  pendingClientInvites = [],
  tripPartyMap: _tripPartyMap,
  ledgerRows = null,
  topContent,
  refreshing = false,
  onRefresh,
  bottomInset = 100,
  tripFinanceAdjustmentsByTripId,
  hideSummaryRow = false,
  embedInParentScroll = false,
  onAddPartyPress,
}: CustomersTabProps) {
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  /** Wide multi-column matrix is desktop-only; mobile keeps the compact outstanding list. */
  const isWebDesktop = Platform.OS === "web" && screenWidth >= 1024;
  const [selectedCustomer, setSelectedCustomer] =
    useState<FinancialRowData | null>(null);
  const isControlled = clientsProp !== undefined && tripsProp !== undefined;

  const { data: clientsFromQuery = [], isPending: clientsLoading } =
    useClientsQuery(isControlled ? null : organizationId);
  const { data: tripsFromQuery = [], isPending: tripsLoading } = useTripsQuery(
    isControlled ? null : organizationId,
  );

  const clients = isControlled ? (clientsProp ?? []) : clientsFromQuery;
  const ownTrips = isControlled ? (tripsProp ?? []) : tripsFromQuery;
  const applyAdjustments = tripFinanceAdjustmentsByTripId !== undefined;
  const {
    data: customerLedgerInputs,
    isPending: customerLedgerLoading,
  } = useCustomerLedgerInputsQuery(organizationId, applyAdjustments);
  const loading = clientsLoading || tripsLoading;
  const showLoading = parentLoading || (!isControlled && loading) || customerLedgerLoading;

  // Merge own trips with cross-org supplier-view trips so the shipper appears as a customer.
  // Deduplicate by trip id: trips we own (as supplier) appear in both ownTrips and tripsWhereOrgIsSupplier.
  const allTrips = useMemo(() => {
    if (!tripsWhereOrgIsSupplierProp || tripsWhereOrgIsSupplierProp.length === 0) return ownTrips;
    const seen = new Set(ownTrips.map((t) => t.id));
    const extra = tripsWhereOrgIsSupplierProp.filter((t) => !seen.has(t.id));
    if (extra.length === 0) return ownTrips;
    return [...ownTrips, ...extra];
  }, [ownTrips, tripsWhereOrgIsSupplierProp]);

  const uniqueLinkedClientIdByOrgId = useMemo(
    () => buildUniqueLinkedOrgIdMap(clients),
    [clients],
  );

  const clientAvatarById = useMemo(
    () => new Map(clients.map((c) => [c.id, { avatar_url: c.avatar_url, avatar_seed: c.avatar_seed }])),
    [clients],
  );

  const { rows, totals } = useMemo(() => {
    return aggregateCustomersFromRpc(
      clients,
      customerLedgerInputs ?? {
        trip_inputs: [],
        unlinked_payments: [],
        ledger_only_parties: [],
        client_ledger_totals: [],
      },
    );
  }, [clients, customerLedgerInputs]);

  const q = searchQuery.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    let list = rows;
    if (q) {
      list = list.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.subline || "").toLowerCase().includes(q) ||
          (r.contactPerson ?? "").toLowerCase().includes(q),
      );
    }
    if (entityFilter === "has_due")
      list = list.filter((r) => (r.pending ?? 0) > 0);
    if (entityFilter === "no_due")
      list = list.filter((r) => (r.pending ?? 0) === 0);
    return list;
  }, [rows, q, entityFilter]);

  const customerTableResetKey = useMemo(
    () => `${filteredRows.length}|${q}|${entityFilter}|${searchQuery}`,
    [filteredRows.length, q, entityFilter, searchQuery],
  );
  const {
    visible: visibleCustomerRows,
    onScroll: onCustomerTablePaginatedScroll,
  } = usePaginatedScroll(filteredRows, { resetKey: customerTableResetKey });

  const handleCustomerTableScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const p = tabBarScrollProps as {
        onScroll?: (ev?: NativeSyntheticEvent<NativeScrollEvent>) => void;
      };
      p.onScroll?.(e);
      onCustomerTablePaginatedScroll(e);
    },
    [tabBarScrollProps, onCustomerTablePaginatedScroll],
  );

  const filteredPendingInvites = useMemo(() => {
    if (!q) return pendingClientInvites;
    return pendingClientInvites.filter((r) =>
      (r.to_org_name || "").toLowerCase().includes(q),
    );
  }, [pendingClientInvites, q]);

  useEffect(() => {
    if (onTotals) {
      onTotals(totals);
    }
  }, [onTotals, totals.totalIn, totals.totalOut]);

  if (showLoading) {
    return <Text style={styles.loading}>Loading…</Text>;
  }
  const hasCustomers = filteredRows.length > 0;
  const hasPendingInvites = filteredPendingInvites.length > 0;
  const handleRowSelect = (data: FinancialRowData) => {
    if (onRowSelect) {
      onRowSelect(data, "CLIENT", "customers");
    } else {
      setSelectedCustomer(data);
    }
  };

  if (selectedCustomer) {
    return (
      <CustomerDetailView
        customer={selectedCustomer}
        trips={allTrips}
        ledgerRows={ledgerRows}
        onBack={() => setSelectedCustomer(null)}
        insets={insets}
        uniqueLinkedClientIdByOrgId={uniqueLinkedClientIdByOrgId}
      />
    );
  }

  if (!hasCustomers) {
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
          variant="customers"
          title={
            hasPendingInvites
              ? "Waiting on customer records"
              : undefined
          }
          description={
            hasPendingInvites
              ? "Invitations are out — add a customer now or pull to refresh when they accept."
              : undefined
          }
          onCtaPress={onAddPartyPress}
          style={styles.emptyBanner}
        />
      </ScrollView>
    );
  }

  const totalBilling = totals.totalIn ?? 0;
  const pendingBalance = totals.totalOut ?? 0;
  const totalReceived = Math.max(0, totalBilling - pendingBalance);
  const collectionPercent =
    totalBilling > 0 ? Math.round((totalReceived / totalBilling) * 100) : 0;
  const stickyHeaderIndex = topContent
    ? hideSummaryRow
      ? 1
      : 2
    : hideSummaryRow
      ? 0
      : 1;
  const rowsToRender = embedInParentScroll ? filteredRows : visibleCustomerRows;
  const tableContentStyle = [
    styles.customerTableScrollContent,
    embedInParentScroll
      ? { paddingBottom: 0 }
      : { paddingBottom: bottomInset + insets.bottom },
  ];

  const tableBody = (
    <>
      {topContent}
      {!hideSummaryRow && (
        <View style={styles.receivablesSummaryRow}>
          <View style={styles.receivablesSummaryCard}>
            <Text style={styles.receivablesSummaryLabel}>Total Outstanding</Text>
            <Text style={styles.receivablesSummaryOutstanding}>
              ₹{pendingBalance.toLocaleString("en-IN")}
            </Text>
          </View>
          <LiquidFillPill
            percentage={collectionPercent}
            label="Collection"
            valueSuffix="%"
          />
        </View>
      )}
      {isWebDesktop ? (
        <View style={styles.customerTableHeader}>
          <View style={styles.customerTableHeaderEntityCol}>
            <Text
              style={[styles.customerTableHeaderCell, styles.ctHeaderLeft]}
              numberOfLines={1}
            >
              Customer Entity
            </Text>
          </View>
          <View style={styles.customerTableHeaderTripsCol}>
            <Text
              style={[styles.customerTableHeaderCell, styles.ctHeaderCenter]}
              numberOfLines={1}
            >
              Trips
            </Text>
          </View>
          <View style={styles.customerTableHeaderAmtCol}>
            <Text
              style={[styles.customerTableHeaderCell, styles.ctHeaderRight]}
              numberOfLines={1}
            >
              Sales
            </Text>
          </View>
          <View style={styles.customerTableHeaderAmtCol}>
            <Text
              style={[styles.customerTableHeaderCell, styles.ctHeaderRight]}
              numberOfLines={1}
            >
              Received
            </Text>
          </View>
          <View style={styles.customerTableHeaderAmtCol}>
            <Text
              style={[styles.customerTableHeaderCell, styles.ctHeaderRight]}
              numberOfLines={1}
            >
              Due
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.customerTableHeader}>
          <View style={styles.customerTableHeaderEntityColMobile}>
            <Text
              style={[styles.customerTableHeaderCell, styles.ctHeaderLeft]}
              numberOfLines={1}
            >
              Customer Entity
            </Text>
          </View>
          <View style={styles.customerTableHeaderTripsCol}>
            <Text
              style={[styles.customerTableHeaderCell, styles.ctHeaderCenter]}
              numberOfLines={1}
            >
              Trips
            </Text>
          </View>
          <View style={styles.customerTableHeaderOutstandingCol}>
            <Text
              style={[styles.customerTableHeaderCell, styles.ctHeaderRight]}
              numberOfLines={1}
            >
              Outstanding
            </Text>
          </View>
        </View>
      )}
      <View style={styles.customerTableCard}>
        {rowsToRender.map((data) => {
          const due = data.pending ?? 0;
          const sales = data.billed ?? 0;
          const received = data.received ?? Math.max(0, sales - due);
          const tripCount = data.trips ?? 0;
          const avatarData = clientAvatarById.get(data.id);
          if (isWebDesktop) {
            return (
              <TouchableOpacity
                key={data.id}
                style={styles.customerTableRow}
                onPress={() => handleRowSelect(data)}
                activeOpacity={0.7}
              >
                <View style={[styles.customerTableCell, styles.ctEntity]}>
                  <View style={styles.customerTableEntityMain}>
                    <EntityAvatar
                      name={data.name ?? ""}
                      avatarUrl={avatarData?.avatar_url}
                      avatarSeed={avatarData?.avatar_seed}
                      initialsColorSeed={data.id}
                      entityType="client"
                      isIntegrated={!!data.is_integrated}
                      badgeOverlay
                    />
                    <Text
                      style={styles.customerTableEntityName}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {data.name ?? "—"}
                    </Text>
                  </View>
                </View>
                <View style={[styles.customerTableCell, styles.ctTrips]}>
                  <View style={styles.customerTableTripsPill}>
                    <Text style={styles.customerTableTripsPillText}>
                      {tripCount}
                    </Text>
                  </View>
                </View>
                <View style={[styles.customerTableCell, styles.ctAmt]}>
                  <Text style={styles.customerTableAmtValue} numberOfLines={1}>
                    ₹{sales.toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={[styles.customerTableCell, styles.ctAmt]}>
                  <Text style={styles.customerTableAmtReceived} numberOfLines={1}>
                    ₹{received.toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={[styles.customerTableCell, styles.ctAmt]}>
                  <Text
                    style={[
                      styles.customerTableDueValue,
                      due > 0
                        ? styles.customerTableDueUnpaid
                        : styles.customerTableDueSettled,
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
              style={styles.customerTableRowMobile}
              onPress={() => handleRowSelect(data)}
              activeOpacity={0.7}
            >
              <EntityAvatar
                name={data.name ?? ""}
                avatarUrl={avatarData?.avatar_url}
                avatarSeed={avatarData?.avatar_seed}
                initialsColorSeed={data.id}
                entityType="client"
                isIntegrated={!!data.is_integrated}
                badgeOverlay
              />
              <View style={[styles.customerTableCell, styles.ctEntityMobile]}>
                <Text
                  style={styles.customerTableEntityName}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {data.name ?? "—"}
                </Text>
                <Text
                  style={styles.customerTableEntitySub}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  Sales: ₹{formatCustomerAmountCompact(sales)}
                </Text>
              </View>
              <View style={[styles.customerTableCell, styles.ctTrips]}>
                <View style={styles.customerTableTripsPill}>
                  <Text style={styles.customerTableTripsPillText}>
                    {tripCount}
                  </Text>
                </View>
              </View>
              <View style={[styles.customerTableCell, styles.ctOutstanding]}>
                <Text
                  style={[
                    styles.customerTableOutstandingValue,
                    due > 0
                      ? styles.customerTableDueUnpaid
                      : styles.customerTableDueSettled,
                  ]}
                  numberOfLines={1}
                >
                  ₹{due.toLocaleString("en-IN")}
                </Text>
                <Text style={styles.customerTableReceivedLine} numberOfLines={1}>
                  Received:{" "}
                  <Text style={styles.customerTableDueSettled}>
                    ₹{formatCustomerAmountCompact(received)}
                  </Text>
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={styles.customerTableFooter}>
          <Text style={styles.customerTableFooterText}>All Clients Synced</Text>
        </View>
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
        style={styles.customerTableScroll}
        contentContainerStyle={tableContentStyle}
        showsVerticalScrollIndicator={false}
        {...tabBarScrollProps}
        onScroll={handleCustomerTableScroll}
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
  receivablesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  receivablesTitle: {
    fontSize: 22,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
    textTransform: "uppercase",
  },
  receivablesSubtitle: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 6,
  },
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
  receivablesSummaryOutstanding: {
    fontSize: 18,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.teslaRed,
  },
  viewToggleWrap: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
    padding: 5,
    marginHorizontal: 16,
    marginBottom: 12,
    alignSelf: "flex-start",
    gap: 4,
  },
  viewToggleBtn: {
    width: 36,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  viewToggleBtnActive: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  ledgerWrap: { flex: 1, paddingHorizontal: 12, paddingBottom: 100 },
  customerTableScroll: { flex: 1 },
  customerTableScrollContent: { paddingHorizontal: 0, paddingTop: 12 },
  customerTableCard: {
    backgroundColor: "rgba(255,255,255,0.8)",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  customerTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  customerTableHeaderCell: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  ctHeaderLeft: { textAlign: "left" },
  ctHeaderCenter: { textAlign: "center" },
  ctHeaderRight: { textAlign: "right" },
  customerTableHeaderEntityCol: {
    flex: CUSTOMERS_SUPPLIERS.node,
    minWidth: 0,
    justifyContent: "center",
  },
  customerTableHeaderEntityColMobile: {
    flex: 2.2,
    minWidth: 0,
    justifyContent: "center",
  },
  customerTableHeaderTripsCol: {
    flex: CUSTOMERS_SUPPLIERS.trips,
    minWidth: 44,
    justifyContent: "center",
  },
  customerTableHeaderAmtCol: {
    flex: CUSTOMERS_SUPPLIERS.mission,
    minWidth: 0,
    justifyContent: "center",
  },
  customerTableHeaderOutstandingCol: {
    flex: 1.5,
    minWidth: 0,
    justifyContent: "center",
  },
  ctEntity: { flex: CUSTOMERS_SUPPLIERS.node, minWidth: 0 },
  ctEntityMobile: { flex: 2.2, minWidth: 0 },
  ctTrips: {
    flex: CUSTOMERS_SUPPLIERS.trips,
    minWidth: 44,
    justifyContent: "center",
  },
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
  customerTableRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  customerTableRowMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 62,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  customerTableCell: { paddingHorizontal: 5, minWidth: 0 },
  customerTableEntityMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  customerTableEntityName: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    flex: 1,
    minWidth: 0,
  },
  customerTableEntitySub: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  customerTableTripsPill: {
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
  customerTableTripsPillText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  customerTableDueValue: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    textAlign: "right",
  },
  customerTableOutstandingValue: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    textAlign: "right",
  },
  customerTableDueUnpaid: { color: Theme.teslaRed },
  customerTableDueSettled: { color: Theme.darkGreen },
  customerTableReceivedLine: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "right",
  },
  customerTableAmtValue: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  customerTableAmtReceived: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.darkGreen,
    textAlign: "right",
  },
  customerTableFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(248,250,252,0.5)",
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  customerTableFooterText: {
    fontSize: 8,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
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
  pendingSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  pendingSectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  pendingRowName: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  pendingRowBadge: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
  },
});
