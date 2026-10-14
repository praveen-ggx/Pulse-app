/**
 * Client profile — Finance / Statement tab.
 * Compact receivable aging + recent cash ledger; opens full-page statement.
 * Aging cards toggle-filter open AR trips + related ledger rows.
 */
import Theme from "@/constants/Theme";
import {
  computePaymentAging,
  computePayableAging,
  filterLedgerByAgingBucket,
  listOpenPayableTrips,
  listOpenReceivableTrips,
  type AgingBucketKey,
} from "@/features/clients/components/analytics/clientAnalyticsUtils";
import { ClientProfileAgingBucketStrip } from "@/features/clients/components/ClientProfileAgingBucketStrip";
import {
  buildTripByIdMap,
  ledgerTripRouteCell,
} from "@/features/clients/components/clientProfileLedgerTrip.util";
import { ClientProfileFinanceStatementModal } from "@/features/clients/components/ClientProfileFinanceStatementModal";
import {
  getTransactionsByOrganizationAndContactId,
  type LedgerRow,
} from "@/features/finance/services/finance.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { getTripsForOrg, type TripRow } from "@/features/trips/services/trips.service";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import {
  useRealtimeTransactionsInvalidation,
  useRealtimeTripsInvalidation,
} from "@/lib/queries/useRealtimeInvalidation";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

type Props = {
  organizationId: string;
  /** Client or supplier contact id. */
  clientId: string;
  clientName: string;
  /** Receivable (client) vs payable (supplier) statement. Default client. */
  partyRole?: "client" | "supplier";
};

function formatInr(n: number): string {
  const abs = Math.abs(Math.round(n));
  const body = `₹${abs.toLocaleString("en-IN")}`;
  return n < 0 ? `-${body}` : body;
}

function txDay(row: LedgerRow): string {
  return (row.transaction_date || row.created_at || "").slice(0, 10);
}

function buildRunningBalanceRows(rows: LedgerRow[]): Array<LedgerRow & { balance: number }> {
  const chronological = [...rows].sort((a, b) => {
    const da = txDay(a);
    const db = txDay(b);
    if (da !== db) return da.localeCompare(db);
    return (a.created_at || "").localeCompare(b.created_at || "");
  });
  let bal = 0;
  const withBal = chronological.map((r) => {
    bal += Number(r.amount_in ?? 0) - Number(r.amount_out ?? 0);
    return { ...r, balance: bal };
  });
  return withBal.reverse();
}

const AGING_LABELS: Record<AgingBucketKey, string> = {
  bucket0_30: "0-30 days",
  bucket31_60: "31-60 days",
  bucket61_90: "61-90 days",
  bucket90Plus: "90+ days",
};

const DESKTOP_AGING_CARDS: Array<{
  key: AgingBucketKey;
  label: string;
  color: string;
}> = [
  { key: "bucket0_30", label: "0-30 days", color: Theme.positive },
  { key: "bucket31_60", label: "31-60 days", color: Theme.warning },
  { key: "bucket61_90", label: "61-90 days", color: Theme.chartSeries4 },
  { key: "bucket90Plus", label: "90+ days", color: Theme.destructive },
];

export function ClientProfileFinanceStatementSection({
  organizationId,
  clientId,
  clientName,
  partyRole = "client",
}: Props) {
  const isSupplier = partyRole === "supplier";
  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const isCompact = (containerWidth > 0 ? containerWidth : width) < 560;
  const [fullOpen, setFullOpen] = useState(false);
  const [agingBucket, setAgingBucket] = useState<AgingBucketKey | null>(null);

  // Same realtime as Finance Hub / Compliance Settlement — ledger + trip flags
  // (amount_paid, verify, POD) refresh this statement without a manual reload.
  useRealtimeTripsInvalidation(organizationId || null);
  useRealtimeTransactionsInvalidation(organizationId || null);

  const txQ = useQuery({
    queryKey: queryKeys.transactions.byContact(organizationId, clientId),
    queryFn: async () => {
      const { transactions, error } = await getTransactionsByOrganizationAndContactId(
        organizationId,
        clientId,
      );
      if (error) throw error;
      return transactions;
    },
    staleTime: STALE.realtime,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const tripsQ = useQuery({
    queryKey: queryKeys.trips.finite(organizationId),
    queryFn: async () => {
      const { trips, error } = await getTripsForOrg(organizationId);
      if (error) throw error;
      return trips as TripRow[];
    },
    staleTime: STALE.realtime,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const partyTrips = useMemo(
    () =>
      (tripsQ.data ?? []).filter((t) =>
        isSupplier ? t.supplier_id === clientId : t.client_id === clientId,
      ),
    [tripsQ.data, clientId, isSupplier],
  );
  const clientTrips = partyTrips;

  const txs = txQ.data ?? [];
  const tripById = useMemo(
    () => buildTripByIdMap(tripsQ.data ?? []),
    [tripsQ.data],
  );
  const aging = useMemo(
    () =>
      isSupplier
        ? computePayableAging(partyTrips, txs)
        : computePaymentAging(partyTrips, txs),
    [partyTrips, txs, isSupplier],
  );

  const openReceivables = useMemo(
    () =>
      isSupplier
        ? listOpenPayableTrips(partyTrips, txs, { bucket: agingBucket })
        : listOpenReceivableTrips(partyTrips, txs, { bucket: agingBucket }),
    [partyTrips, txs, agingBucket, isSupplier],
  );

  const agingTripCounts = useMemo(() => {
    const all = isSupplier
      ? listOpenPayableTrips(partyTrips, txs)
      : listOpenReceivableTrips(partyTrips, txs);
    const counts: Partial<Record<AgingBucketKey, number>> = {};
    for (const row of all) {
      counts[row.bucket] = (counts[row.bucket] ?? 0) + 1;
    }
    return counts;
  }, [partyTrips, txs, isSupplier]);

  const scopedTxs = useMemo(() => {
    if (!agingBucket) return txs;
    return filterLedgerByAgingBucket(txs, openReceivables);
  }, [agingBucket, txs, openReceivables]);

  const agingTitle = isSupplier ? "Payable aging" : "Receivable aging";
  const statementHint = isSupplier
    ? "Spend & cash ledger at partner level"
    : "Sales & cash ledger at client level";
  const openBalanceLabel = agingBucket
    ? isSupplier
      ? "Bucket AP"
      : "Bucket AR"
    : isSupplier
      ? "Open AP"
      : "Open AR";
  const openTripsTitle = isSupplier ? "Open payables" : "Open receivables";
  const openTripsEmpty = isSupplier
    ? "No open payables in this bucket."
    : "No open receivables in this bucket.";

  const previewRows = useMemo(
    () => buildRunningBalanceRows(scopedTxs).slice(0, 5),
    [scopedTxs],
  );

  const totalIn = useMemo(
    () => scopedTxs.reduce((s, r) => s + Number(r.amount_in ?? 0), 0),
    [scopedTxs],
  );
  const totalOut = useMemo(
    () => scopedTxs.reduce((s, r) => s + Number(r.amount_out ?? 0), 0),
    [scopedTxs],
  );

  const openArDisplay = agingBucket
    ? aging[agingBucket]
    : aging.outstanding;

  const loading = txQ.isLoading || tripsQ.isLoading;
  const agingBucketLabel = agingBucket ? AGING_LABELS[agingBucket] : null;

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
              Finance · Statement
            </Text>
            <Text style={[styles.hint, isCompact && styles.hintSm]} numberOfLines={1}>
              {statementHint}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => setFullOpen(true)}
          hitSlop={8}
          style={styles.openBtn}
          accessibilityRole="button"
          accessibilityLabel="Open full statement"
        >
          <Text style={[styles.openBtnText, isCompact && styles.openBtnTextSm]}>
            Full statement
          </Text>
          <FontAwesome name="chevron-right" size={9} color={Theme.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Theme.primary} />
          <Text style={styles.loadingText}>Loading statement…</Text>
        </View>
      ) : (
        <>
          {isCompact ? (
            <ClientProfileAgingBucketStrip
              aging={aging}
              selected={agingBucket}
              onChange={setAgingBucket}
              tripCounts={agingTripCounts}
              compact
              title={agingTitle}
            />
          ) : (
            <>
              <View style={styles.subHeadRow}>
                <Text style={styles.subHead}>{agingTitle}</Text>
                {agingBucket ? (
                  <Pressable
                    onPress={() => setAgingBucket(null)}
                    style={styles.clearPill}
                    hitSlop={6}
                  >
                    <Text style={styles.clearPillText}>
                      {AGING_LABELS[agingBucket]} · Clear
                    </Text>
                    <FontAwesome name="times" size={9} color={Theme.primary} />
                  </Pressable>
                ) : (
                  <Text style={styles.filterHint}>Tap a bucket to filter</Text>
                )}
              </View>
              <View style={styles.agingRow}>
                {DESKTOP_AGING_CARDS.map((card) => {
                  const active = agingBucket === card.key;
                  return (
                    <Pressable
                      key={card.key}
                      onPress={() =>
                        setAgingBucket((prev) =>
                          prev === card.key ? null : card.key,
                        )
                      }
                      style={[
                        styles.agingCard,
                        { borderTopColor: card.color },
                        active && {
                          backgroundColor: `${card.color}14`,
                          borderColor: card.color,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[styles.agingValue, { color: card.color }]}
                        numberOfLines={1}
                      >
                        {formatInr(aging[card.key])}
                      </Text>
                      <Text style={styles.agingLabel}>{card.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <View style={[styles.metricRow, isCompact && styles.metricRowCompact]}>
            <View style={[styles.metricChip, isCompact && styles.metricChipCompact]}>
              <Text style={[styles.metricLabel, isCompact && styles.metricLabelSm]}>
                Cash in
              </Text>
              <Text style={[styles.metricValue, isCompact && styles.metricValueSm]}>
                {formatInr(totalIn)}
              </Text>
            </View>
            <View style={[styles.metricChip, isCompact && styles.metricChipCompact]}>
              <Text style={[styles.metricLabel, isCompact && styles.metricLabelSm]}>
                Cash out
              </Text>
              <Text style={[styles.metricValue, isCompact && styles.metricValueSm]}>
                {formatInr(totalOut)}
              </Text>
            </View>
            <View style={[styles.metricChip, isCompact && styles.metricChipCompact]}>
              <Text style={[styles.metricLabel, isCompact && styles.metricLabelSm]}>
                Net
              </Text>
              <Text style={[styles.metricValue, isCompact && styles.metricValueSm]}>
                {formatInr(totalIn - totalOut)}
              </Text>
            </View>
            <View style={[styles.metricChip, isCompact && styles.metricChipCompact]}>
              <Text style={[styles.metricLabel, isCompact && styles.metricLabelSm]}>
                {openBalanceLabel}
              </Text>
              <Text style={[styles.metricValue, isCompact && styles.metricValueSm]}>
                {formatInr(openArDisplay)}
              </Text>
            </View>
          </View>

          {agingBucket ? (
            <View style={styles.ledgerCard}>
              <View style={styles.ledgerHead}>
                <Text style={[styles.subHeadInline, isCompact && styles.subHeadSm]}>
                  {openTripsTitle} · {agingBucketLabel}
                </Text>
                <Text style={[styles.ledgerMeta, isCompact && styles.ledgerMetaSm]}>
                  {openReceivables.length} trip
                  {openReceivables.length === 1 ? "" : "s"}
                </Text>
              </View>
              {openReceivables.length === 0 ? (
                <Text style={styles.empty}>{openTripsEmpty}</Text>
              ) : isCompact ? (
                openReceivables.slice(0, 6).map((row) => {
                  const trip = row.trip;
                  const tripLabel = getTripOperationalDisplay({
                    trip_operational_code: trip.trip_operational_code ?? null,
                    trip_code: trip.trip_code ?? null,
                    display_trip_id: trip.display_trip_id ?? null,
                    trip_number: trip.trip_number ?? null,
                  });
                  const pickup = (trip.pickup_area ?? "").trim();
                  const drop = (trip.drop_location ?? trip.drop_area ?? "").trim();
                  const route =
                    pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "";
                  const date =
                    (trip.pickup_date || trip.created_at || "").slice(0, 10) || "—";
                  return (
                    <Pressable
                      key={trip.id}
                      onPress={() => setFullOpen(true)}
                      style={styles.mobileRow}
                    >
                      <View style={styles.mobileRowTop}>
                        <Text style={styles.mobileTripId} numberOfLines={1}>
                          {tripLabel}
                        </Text>
                        <Text style={styles.mobileAmt}>
                          {formatInr(row.outstanding)}
                        </Text>
                      </View>
                      <Text style={styles.mobileMeta} numberOfLines={1}>
                        {date} · {row.daysOld}d
                        {route ? ` · ${route}` : ""}
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <>
                  <View style={styles.tableHead}>
                    <Text style={[styles.th, styles.colDate]}>Date</Text>
                    <Text style={[styles.th, styles.colDesc]}>Trip / Route</Text>
                    <Text style={[styles.th, styles.colDays]}>Days</Text>
                    <Text style={[styles.th, styles.colBal]}>Outstanding</Text>
                  </View>
                  {openReceivables.slice(0, 6).map((row) => {
                    const trip = row.trip;
                    const tripLabel = getTripOperationalDisplay({
                      trip_operational_code: trip.trip_operational_code ?? null,
                      trip_code: trip.trip_code ?? null,
                      display_trip_id: trip.display_trip_id ?? null,
                      trip_number: trip.trip_number ?? null,
                    });
                    const pickup = (trip.pickup_area ?? "").trim();
                    const drop = (trip.drop_location ?? trip.drop_area ?? "").trim();
                    const route =
                      pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "";
                    const date =
                      (trip.pickup_date || trip.created_at || "").slice(0, 10) || "—";
                    return (
                      <Pressable
                        key={trip.id}
                        onPress={() => setFullOpen(true)}
                        style={styles.tr}
                      >
                        <Text style={[styles.td, styles.colDate]} numberOfLines={1}>
                          {date}
                        </Text>
                        <View style={styles.colDesc}>
                          <Text style={styles.tripId} numberOfLines={1}>
                            {tripLabel}
                          </Text>
                          {route ? (
                            <Text style={styles.tripRoute} numberOfLines={1}>
                              {route}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[styles.td, styles.colDays]} numberOfLines={1}>
                          {row.daysOld}d
                        </Text>
                        <Text
                          style={[styles.td, styles.colBal, styles.tdBal]}
                          numberOfLines={1}
                        >
                          {formatInr(row.outstanding)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              )}
              {openReceivables.length > 6 ? (
                <Pressable onPress={() => setFullOpen(true)} style={styles.moreRow}>
                  <Text style={styles.moreText}>
                    View all {openReceivables.length} open trips
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.ledgerCard}>
            <View style={styles.ledgerHead}>
              <Text style={[styles.subHeadInline, isCompact && styles.subHeadSm]}>
                {agingBucket ? "Related ledger" : "Ledger"}
              </Text>
              <Text style={[styles.ledgerMeta, isCompact && styles.ledgerMetaSm]}>
                {scopedTxs.length} entries
              </Text>
            </View>
            {previewRows.length === 0 ? (
              <Text style={styles.empty}>
                {agingBucket
                  ? "No ledger entries linked to this aging bucket."
                  : "No ledger entries for this client yet."}
              </Text>
            ) : isCompact ? (
              previewRows.map((row) => {
                const tripCell = ledgerTripRouteCell(row, tripById);
                return (
                  <Pressable
                    key={row.id}
                    onPress={() => setFullOpen(true)}
                    style={styles.mobileRow}
                  >
                    <View style={styles.mobileRowTop}>
                      <Text style={styles.mobileDate}>{txDay(row) || "—"}</Text>
                      <Text style={styles.mobileAmt}>{formatInr(row.balance)}</Text>
                    </View>
                    <Text style={styles.mobileDesc} numberOfLines={1}>
                      {row.description?.trim() || "—"}
                    </Text>
                    <Text style={styles.mobileMeta} numberOfLines={1}>
                      {tripCell
                        ? `${tripCell.tripIdLabel}${tripCell.routeLabel ? ` · ${tripCell.routeLabel}` : ""}`
                        : "No trip"}
                      {" · "}
                      In {Number(row.amount_in) > 0 ? formatInr(Number(row.amount_in)) : "—"}
                      {" · "}
                      Out {Number(row.amount_out) > 0 ? formatInr(Number(row.amount_out)) : "—"}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.tableFull}>
                  <View style={styles.tableHead}>
                    <Text style={[styles.th, styles.colDate]}>Date</Text>
                    <Text style={[styles.th, styles.colDesc]}>Description</Text>
                    <Text style={[styles.th, styles.colTrip]}>Trip</Text>
                    <Text style={[styles.th, styles.colAmt]}>In</Text>
                    <Text style={[styles.th, styles.colAmt]}>Out</Text>
                    <Text style={[styles.th, styles.colBal]}>Balance</Text>
                  </View>
                  {previewRows.map((row) => {
                    const tripCell = ledgerTripRouteCell(row, tripById);
                    return (
                      <Pressable
                        key={row.id}
                        onPress={() => setFullOpen(true)}
                        style={styles.tr}
                      >
                        <Text style={[styles.td, styles.colDate]} numberOfLines={1}>
                          {txDay(row) || "—"}
                        </Text>
                        <Text style={[styles.td, styles.colDesc]} numberOfLines={1}>
                          {row.description?.trim() || "—"}
                        </Text>
                        <View style={styles.colTrip}>
                          {tripCell ? (
                            <>
                              <Text style={styles.tripId} numberOfLines={1}>
                                {tripCell.tripIdLabel}
                              </Text>
                              {tripCell.routeLabel ? (
                                <Text style={styles.tripRoute} numberOfLines={1}>
                                  {tripCell.routeLabel}
                                </Text>
                              ) : null}
                            </>
                          ) : (
                            <Text style={styles.tripEmpty}>—</Text>
                          )}
                        </View>
                        <Text style={[styles.td, styles.colAmt]} numberOfLines={1}>
                          {Number(row.amount_in) > 0
                            ? formatInr(Number(row.amount_in))
                            : "—"}
                        </Text>
                        <Text style={[styles.td, styles.colAmt]} numberOfLines={1}>
                          {Number(row.amount_out) > 0
                            ? formatInr(Number(row.amount_out))
                            : "—"}
                        </Text>
                        <Text
                          style={[styles.td, styles.colBal, styles.tdBal]}
                          numberOfLines={1}
                        >
                          {formatInr(row.balance)}
                        </Text>
                      </Pressable>
                    );
                  })}
              </View>
            )}
            {scopedTxs.length > previewRows.length ? (
              <Pressable onPress={() => setFullOpen(true)} style={styles.moreRow}>
                <Text style={styles.moreText}>
                  View all {scopedTxs.length} transactions
                </Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}

      <ClientProfileFinanceStatementModal
        visible={fullOpen}
        onClose={() => setFullOpen(false)}
        clientName={clientName}
        organizationId={organizationId}
        clientId={clientId}
        transactions={txs}
        aging={aging}
        tripById={tripById}
        clientTrips={clientTrips}
        initialAgingBucket={agingBucket}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", gap: 10 },
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
    backgroundColor: Theme.textPrimaryDark,
    marginTop: 2,
  },
  heading: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headingSm: { fontSize: 8, letterSpacing: 0.45 },
  hint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  hintSm: { fontSize: 9 },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 32,
  },
  openBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
  },
  openBtnTextSm: { fontSize: 9 },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 20,
  },
  loadingText: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  subHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  subHead: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  subHeadSm: { fontSize: 11 },
  subHeadInline: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flex: 1,
    minWidth: 0,
  },
  filterHint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  clearPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    minHeight: 26,
  },
  clearPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
  },
  agingRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  agingCard: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 100,
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderTopWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  agingValue: {
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  agingLabel: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metricRowCompact: { gap: 6 },
  metricChip: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 70,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  metricChipCompact: {
    flexBasis: "47%",
    minWidth: 0,
    maxWidth: "48.5%",
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricLabelSm: { fontSize: 7, letterSpacing: 0.3 },
  metricValue: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  metricValueSm: { fontSize: 10, marginTop: 1 },
  ledgerCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  ledgerHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  ledgerMeta: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
  ledgerMetaSm: { fontSize: 9 },
  mobileRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    gap: 2,
  },
  mobileRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  mobileTripId: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  mobileDate: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  mobileAmt: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  mobileDesc: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  mobileMeta: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 11,
  },
  tableFull: {
    width: "100%",
    alignSelf: "stretch",
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    backgroundColor: Theme.surfaceGray,
  },
  th: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    minHeight: 40,
  },
  td: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  tdBal: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  colDate: { width: 92, flexGrow: 0, flexShrink: 0 },
  colDesc: { flex: 1.4, minWidth: 0 },
  colTrip: { flex: 1.15, minWidth: 0 },
  colDays: { width: 48, flexGrow: 0, flexShrink: 0, textAlign: "right" },
  colAmt: {
    width: 96,
    flexGrow: 0,
    flexShrink: 0,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  colBal: {
    width: 104,
    flexGrow: 0,
    flexShrink: 0,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  tripId: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  tripRoute: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 13,
  },
  tripEmpty: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  empty: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    padding: 12,
  },
  moreRow: {
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Theme.surfaceGray,
  },
  moreText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
  },
});
