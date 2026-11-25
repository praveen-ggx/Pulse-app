/**
 * Full-page client sales & cash ledger statement with period / month filters.
 */
import Theme from "@/constants/Theme";
import {
  filterLedgerByAgingBucket,
  listOpenReceivableTrips,
  type AgingBucketKey,
  type ClientPaymentAging,
} from "@/features/clients/components/analytics/clientAnalyticsUtils";
import { ClientProfileAgingBucketStrip } from "@/features/clients/components/ClientProfileAgingBucketStrip";
import { ledgerTripRouteCell } from "@/features/clients/components/clientProfileLedgerTrip.util";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { filterLedgerByPeriod } from "@/features/finance/lib/filterLedgerByPeriod";
import type { FinancePeriodFilter } from "@/features/finance/types";
import { getTripOperationalDisplay } from "@/features/operations/display";
import type { TripRow } from "@/features/trips/services/trips.service";
import { endOfMonth, startOfMonth, toIsoDateLocal } from "@/lib/dateRangePresets";
import { printHtmlOnWeb } from "@/lib/webPrint.util";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  onClose: () => void;
  clientName: string;
  organizationId: string;
  clientId: string;
  transactions: readonly LedgerRow[];
  aging: ClientPaymentAging;
  tripById: Map<string, TripRow>;
  clientTrips?: readonly TripRow[];
  initialAgingBucket?: AgingBucketKey | null;
};

type PeriodChip =
  | { id: "MONTH"; label: string; period: FinancePeriodFilter }
  | { id: "LAST_MONTH"; label: string; period: "CUSTOM"; from: string; to: string }
  | { id: "WEEK"; label: string; period: FinancePeriodFilter }
  | { id: "ALL"; label: string; period: "CUSTOM"; from: string; to: string }
  | { id: "CUSTOM"; label: string; period: "CUSTOM" };

function formatInr(n: number): string {
  const abs = Math.abs(Math.round(n));
  const body = `₹${abs.toLocaleString("en-IN")}`;
  return n < 0 ? `-${body}` : body;
}

function txDay(row: LedgerRow): string {
  return (row.transaction_date || row.created_at || "").slice(0, 10);
}

function formatDateUi(day: string): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-");
  if (!y || !m || !d) return day;
  return `${d}/${m}/${y.slice(-2)}`;
}

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function lastMonthRange(): { from: string; to: string } {
  const now = new Date();
  const ref = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  return {
    from: toIsoDateLocal(startOfMonth(ref)),
    to: toIsoDateLocal(endOfMonth(ref)),
  };
}

async function shareGeneratedHtmlAsPdf(html: string, shareTitle: string): Promise<boolean> {
  if (Platform.OS === "web") {
    return printHtmlOnWeb(html, { title: shareTitle });
  }
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Save or share PDF",
      UTI: "com.adobe.pdf",
    });
  } else {
    await Share.share({ url: uri, title: shareTitle, message: "Save or share the PDF." });
  }
  return true;
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

/**
 * Compact ledger: fixed column widths (no flex shrink) + horizontal scroll.
 * Width must be ≥ sum of columns + gaps + padding or the last column clips
 * under `overflow: hidden` even when scrolled to the end.
 */
const LEDGER_COL = {
  date: 88,
  desc: 176,
  trip: 156,
  amt: 112,
  bal: 112,
} as const;
const LEDGER_TABLE_GAP = 8;
const LEDGER_TABLE_PAD_X = 12;
const LEDGER_TABLE_MIN_WIDTH =
  LEDGER_COL.date +
  LEDGER_COL.desc +
  LEDGER_COL.trip +
  LEDGER_COL.amt * 2 +
  LEDGER_COL.bal +
  LEDGER_TABLE_GAP * 5 +
  LEDGER_TABLE_PAD_X * 2 +
  8;

const OPEN_AR_COL = {
  trip: 200,
  date: 88,
  days: 52,
  amt: 112,
} as const;
const OPEN_AR_TABLE_MIN_WIDTH =
  OPEN_AR_COL.trip +
  OPEN_AR_COL.date +
  OPEN_AR_COL.days +
  OPEN_AR_COL.amt +
  LEDGER_TABLE_GAP * 3 +
  LEDGER_TABLE_PAD_X * 2 +
  8;

export function ClientProfileFinanceStatementModal({
  visible,
  onClose,
  clientName,
  organizationId,
  clientId,
  transactions,
  aging,
  tripById,
  clientTrips = [],
  initialAgingBucket = null,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 560;
  const lastMonth = useMemo(() => lastMonthRange(), []);
  const [chipId, setChipId] = useState<PeriodChip["id"]>("MONTH");
  const [customFrom, setCustomFrom] = useState(() =>
    toIsoDateLocal(startOfMonth(new Date())),
  );
  const [customTo, setCustomTo] = useState(() => toIsoDateLocal(new Date()));
  const [downloadInProgress, setDownloadInProgress] = useState(false);
  const [arDownloadInProgress, setArDownloadInProgress] = useState(false);
  const [agingBucket, setAgingBucket] = useState<AgingBucketKey | null>(
    initialAgingBucket,
  );

  useEffect(() => {
    if (visible) setAgingBucket(initialAgingBucket ?? null);
  }, [visible, initialAgingBucket]);

  const chips: PeriodChip[] = useMemo(
    () => [
      { id: "MONTH", label: "This month", period: "MONTH" },
      {
        id: "LAST_MONTH",
        label: "Last month",
        period: "CUSTOM",
        from: lastMonth.from,
        to: lastMonth.to,
      },
      { id: "WEEK", label: "This week", period: "WEEK" },
      { id: "ALL", label: "All", period: "CUSTOM", from: "2000-01-01", to: "2099-12-31" },
      { id: "CUSTOM", label: "Custom", period: "CUSTOM" },
    ],
    [lastMonth.from, lastMonth.to],
  );

  const activeChip = chips.find((c) => c.id === chipId) ?? chips[0]!;

  const periodFiltered = useMemo(() => {
    if (chipId === "ALL") return [...transactions];
    if (chipId === "LAST_MONTH") {
      return filterLedgerByPeriod([...transactions], "CUSTOM", {
        customFrom: lastMonth.from,
        customTo: lastMonth.to,
      });
    }
    if (chipId === "CUSTOM" || activeChip.period === "CUSTOM") {
      return filterLedgerByPeriod([...transactions], "CUSTOM", {
        customFrom: customFrom,
        customTo: customTo,
      });
    }
    return filterLedgerByPeriod(
      [...transactions],
      activeChip.period as FinancePeriodFilter,
    );
  }, [transactions, chipId, activeChip, customFrom, customTo, lastMonth]);

  const openReceivables = useMemo(
    () =>
      listOpenReceivableTrips(clientTrips, transactions, {
        bucket: agingBucket,
      }),
    [clientTrips, transactions, agingBucket],
  );

  const agingTripCounts = useMemo(() => {
    const all = listOpenReceivableTrips(clientTrips, transactions);
    const counts: Partial<Record<AgingBucketKey, number>> = {};
    for (const row of all) {
      counts[row.bucket] = (counts[row.bucket] ?? 0) + 1;
    }
    return counts;
  }, [clientTrips, transactions]);

  const filtered = useMemo(() => {
    if (!agingBucket) return periodFiltered;
    return filterLedgerByAgingBucket(periodFiltered, openReceivables);
  }, [agingBucket, periodFiltered, openReceivables]);

  const rows = useMemo(() => buildRunningBalanceRows(filtered), [filtered]);

  const periodIn = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount_in ?? 0), 0),
    [filtered],
  );
  const periodOut = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount_out ?? 0), 0),
    [filtered],
  );

  const agingBucketLabel = agingBucket ? AGING_LABELS[agingBucket] : null;
  const openArLabel = agingBucket
    ? formatInr(aging[agingBucket])
    : formatInr(aging.outstanding);

  const handleDownloadA4 = async () => {
    if (downloadInProgress) return;
    setDownloadInProgress(true);
    try {
      const generatedOn = new Date().toLocaleString("en-IN");
      const rowsHtml = rows
        .map((row) => {
          const tripCell = ledgerTripRouteCell(row, tripById);
          const tripLabel = tripCell?.tripIdLabel ?? "—";
          const routeLabel = tripCell?.routeLabel ?? "";
          return `<tr>
            <td>${esc(formatDateUi(txDay(row)))}</td>
            <td>${esc(row.description?.trim() || "—")}</td>
            <td><div>${esc(tripLabel)}</div><div style="color:#64748b;font-size:9px;">${esc(routeLabel)}</div></td>
            <td style="text-align:right;">${Number(row.amount_out) > 0 ? esc(formatInr(Number(row.amount_out))) : "—"}</td>
            <td style="text-align:right;">${Number(row.amount_in) > 0 ? esc(formatInr(Number(row.amount_in))) : "—"}</td>
            <td style="text-align:right;font-weight:700;">${esc(formatInr(row.balance))}</td>
          </tr>`;
        })
        .join("");
      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Client Statement</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color:#0f172a; font-size:10px; }
    h1 { font-size:16px; margin:0 0 2px; }
    .sub { color:#64748b; margin:0 0 10px; }
    .meta { margin:0 0 10px; font-size:9px; color:#64748b; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    th, td { border:1px solid #e2e8f0; padding:6px 7px; vertical-align:top; font-size:10px; }
    th { background:#f8fafc; text-transform:uppercase; letter-spacing:.4px; color:#475569; font-size:9px; text-align:left; }
    col.date { width:11%; } col.desc { width:36%; } col.trip { width:23%; }
    col.amt { width:10%; } col.bal { width:10%; }
    .totals { margin:8px 0 10px; font-size:10px; color:#334155; }
  </style>
</head>
<body>
  <h1>${esc(clientName.trim() || "Client")} · Finance Statement</h1>
  <p class="sub">Org: ${esc(organizationId)} · Client: ${esc(clientId)}</p>
  <p class="meta">Generated: ${esc(generatedOn)} · Rows: ${rows.length}</p>
  <p class="totals">In: ${esc(formatInr(periodIn))} · Out: ${esc(formatInr(periodOut))} · Net: ${esc(formatInr(periodIn - periodOut))} · Open AR: ${esc(openArLabel)}${agingBucketLabel ? ` (${esc(agingBucketLabel)})` : ""}</p>
  <table>
    <colgroup>
      <col class="date" /><col class="desc" /><col class="trip" /><col class="amt" /><col class="amt" /><col class="bal" />
    </colgroup>
    <thead>
      <tr><th>Date</th><th>Description</th><th>Trip / Route</th><th>Amount paid</th><th>Amount received</th><th>Balance</th></tr>
    </thead>
    <tbody>${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:#64748b;">No transactions in this range.</td></tr>`}</tbody>
  </table>
</body>
</html>`;
      const ok = await shareGeneratedHtmlAsPdf(html, `${clientName || "Client"}-statement`);
      if (!ok) {
        Alert.alert("Download unavailable", "Could not open print preview.");
      }
    } catch {
      Alert.alert("Download unavailable", "Could not generate A4 statement PDF.");
    } finally {
      setDownloadInProgress(false);
    }
  };

  const handleDownloadOpenReceivables = async () => {
    if (arDownloadInProgress || openReceivables.length === 0) return;
    setArDownloadInProgress(true);
    try {
      const generatedOn = new Date().toLocaleString("en-IN");
      const rowsHtml = openReceivables
        .map((row) => {
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
            pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "—";
          const date =
            (trip.pickup_date || trip.created_at || "").slice(0, 10) || "—";
          return `<tr>
            <td>${esc(tripLabel)}</td>
            <td>${esc(route)}</td>
            <td>${esc(date)}</td>
            <td style="text-align:right;">${row.daysOld}d</td>
            <td style="text-align:right;font-weight:700;">${esc(formatInr(row.outstanding))}</td>
          </tr>`;
        })
        .join("");
      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Open Receivables</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color:#0f172a; font-size:10px; }
    h1 { font-size:16px; margin:0 0 2px; }
    .sub { color:#64748b; margin:0 0 10px; }
    .meta { margin:0 0 10px; font-size:9px; color:#64748b; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    th, td { border:1px solid #e2e8f0; padding:6px 7px; vertical-align:top; font-size:10px; }
    th { background:#f8fafc; text-transform:uppercase; letter-spacing:.4px; color:#475569; font-size:9px; text-align:left; }
    col.trip { width:24%; } col.route { width:36%; } col.date { width:14%; }
    col.days { width:12%; } col.amt { width:14%; }
  </style>
</head>
<body>
  <h1>${esc(clientName.trim() || "Client")} · Open Receivables${agingBucketLabel ? ` · ${esc(agingBucketLabel)}` : ""}</h1>
  <p class="sub">Org: ${esc(organizationId)} · Client: ${esc(clientId)}</p>
  <p class="meta">Generated: ${esc(generatedOn)} · ${openReceivables.length} trip${openReceivables.length === 1 ? "" : "s"} · Outstanding: ${esc(openArLabel)}</p>
  <table>
    <colgroup>
      <col class="trip" /><col class="route" /><col class="date" /><col class="days" /><col class="amt" />
    </colgroup>
    <thead>
      <tr><th>Trip</th><th>Route</th><th>Date</th><th>Days</th><th>Outstanding</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
      const ok = await shareGeneratedHtmlAsPdf(
        html,
        `${clientName || "Client"}-open-receivables`,
      );
      if (!ok) {
        Alert.alert("Download unavailable", "Could not open print preview.");
      }
    } catch {
      Alert.alert("Download unavailable", "Could not generate open receivables report.");
    } finally {
      setArDownloadInProgress(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={[styles.header, isCompact && styles.headerCompact]}>
          <Pressable
            onPress={onClose}
            style={styles.backBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close statement"
          >
            <FontAwesome name="chevron-left" size={16} color={Theme.textPrimaryDark} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow} numberOfLines={1}>
              Finance · Statement
            </Text>
            <Text style={styles.headerTitle} numberOfLines={isCompact ? 2 : 1}>
              {clientName.trim() || "Client"}
            </Text>
          </View>
          <Pressable
            onPress={() => void handleDownloadA4()}
            style={[
              styles.downloadBtn,
              isCompact && styles.downloadBtnCompact,
              downloadInProgress && styles.downloadBtnDisabled,
            ]}
            disabled={downloadInProgress}
            accessibilityRole="button"
            accessibilityLabel="Download statement PDF"
          >
            <FontAwesome name="download" size={11} color={Theme.textOnPrimary} />
            <Text style={styles.downloadBtnText} numberOfLines={1}>
              {downloadInProgress ? "Generating…" : "Download"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {isCompact ? (
            <ClientProfileAgingBucketStrip
              aging={aging}
              selected={agingBucket}
              onChange={setAgingBucket}
              tripCounts={agingTripCounts}
              compact
            />
          ) : (
            <>
              <View style={styles.sectionHeadRow}>
                <Text style={styles.sectionTitleInline}>Receivable aging</Text>
                {agingBucket ? (
                  <Pressable
                    onPress={() => setAgingBucket(null)}
                    style={styles.clearPill}
                    hitSlop={6}
                  >
                    <Text style={styles.clearPillText}>
                      {agingBucketLabel} · Clear
                    </Text>
                    <FontAwesome name="times" size={9} color={Theme.primary} />
                  </Pressable>
                ) : (
                  <Text style={styles.filterHint}>Tap a bucket to filter</Text>
                )}
              </View>
              <View style={styles.agingRow}>
                {(
                  [
                    { key: "bucket0_30" as const, label: "0-30 days", color: Theme.positive },
                    { key: "bucket31_60" as const, label: "31-60 days", color: Theme.warning },
                    { key: "bucket61_90" as const, label: "61-90 days", color: Theme.chartSeries4 },
                    { key: "bucket90Plus" as const, label: "90+ days", color: Theme.destructive },
                  ] as const
                ).map((card) => {
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

          {agingBucket ? (
            <View style={styles.openArBlock}>
              <View style={styles.sectionHeadRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.sectionTitle, { marginTop: 10, marginBottom: 2 }]}>
                    Open receivables · {agingBucketLabel}
                  </Text>
                  <Text style={styles.periodSummaryText}>
                    {openReceivables.length} trip
                    {openReceivables.length === 1 ? "" : "s"} · {openArLabel}
                  </Text>
                </View>
                {openReceivables.length > 0 ? (
                  <Pressable
                    onPress={() => void handleDownloadOpenReceivables()}
                    style={[
                      styles.arDownloadPill,
                      arDownloadInProgress && styles.downloadBtnDisabled,
                    ]}
                    disabled={arDownloadInProgress}
                    accessibilityRole="button"
                    accessibilityLabel="Download open receivables report"
                  >
                    <FontAwesome name="download" size={9} color={Theme.textPrimaryDark} />
                    <Text style={styles.arDownloadPillText}>
                      {arDownloadInProgress ? "Generating…" : "Download"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {openReceivables.length === 0 ? (
                <Text style={styles.empty}>No open receivables in this bucket.</Text>
              ) : (
                (() => {
                  const openArTable = (
                    <View
                      style={[
                        styles.table,
                        isCompact && styles.tableCompact,
                        isCompact && { width: OPEN_AR_TABLE_MIN_WIDTH },
                      ]}
                    >
                      <View style={styles.tableHead}>
                        <Text
                          style={[
                            styles.th,
                            isCompact ? styles.colOpenTripFixed : styles.colTrip,
                          ]}
                          numberOfLines={1}
                        >
                          Trip / Route
                        </Text>
                        <Text
                          style={[
                            styles.th,
                            isCompact ? styles.colDateFixed : styles.colDate,
                          ]}
                          numberOfLines={1}
                        >
                          Date
                        </Text>
                        <Text
                          style={[
                            styles.th,
                            isCompact ? styles.colDaysFixed : styles.colDays,
                          ]}
                          numberOfLines={1}
                        >
                          Days
                        </Text>
                        <Text
                          style={[
                            styles.th,
                            isCompact ? styles.colAmtFixed : styles.colAmt,
                          ]}
                          numberOfLines={1}
                        >
                          Outstanding
                        </Text>
                      </View>
                      {openReceivables.map((row) => {
                        const trip = row.trip;
                        const tripLabel = getTripOperationalDisplay({
                          trip_operational_code: trip.trip_operational_code ?? null,
                          trip_code: trip.trip_code ?? null,
                          display_trip_id: trip.display_trip_id ?? null,
                          trip_number: trip.trip_number ?? null,
                        });
                        const pickup = (trip.pickup_area ?? "").trim();
                        const drop = (
                          trip.drop_location ??
                          trip.drop_area ??
                          ""
                        ).trim();
                        const route =
                          pickup && drop
                            ? `${pickup} → ${drop}`
                            : pickup || drop || "";
                        const date =
                          (trip.pickup_date || trip.created_at || "").slice(0, 10) ||
                          "—";
                        return (
                          <View key={trip.id} style={styles.tr}>
                            <View
                              style={
                                isCompact ? styles.colOpenTripFixed : styles.colTrip
                              }
                            >
                              <Text style={styles.tripId} numberOfLines={1}>
                                {tripLabel}
                              </Text>
                              {route ? (
                                <Text style={styles.tripRoute} numberOfLines={2}>
                                  {route}
                                </Text>
                              ) : null}
                            </View>
                            <Text
                              style={[
                                styles.td,
                                isCompact ? styles.colDateFixed : styles.colDate,
                              ]}
                              numberOfLines={1}
                            >
                              {date}
                            </Text>
                            <Text
                              style={[
                                styles.td,
                                isCompact ? styles.colDaysFixed : styles.colDays,
                              ]}
                              numberOfLines={1}
                            >
                              {row.daysOld}d
                            </Text>
                            <Text
                              style={[
                                styles.td,
                                isCompact ? styles.colAmtFixed : styles.colAmt,
                                styles.tdBal,
                              ]}
                              numberOfLines={1}
                            >
                              {formatInr(row.outstanding)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                  if (!isCompact) return openArTable;
                  return (
                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      showsHorizontalScrollIndicator
                      style={styles.tableScroll}
                      contentContainerStyle={styles.tableScrollContent}
                    >
                      {openArTable}
                    </ScrollView>
                  );
                })()
              )}
            </View>
          ) : null}

          <Text style={[styles.sectionTitle, { marginTop: 14 }]}>
            {agingBucket ? "Related ledger" : "Ledger"}
          </Text>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {chips.map((chip) => {
              const active = chip.id === chipId;
              return (
                <Pressable
                  key={chip.id}
                  onPress={() => setChipId(chip.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {chipId === "CUSTOM" ? (
            <View style={[styles.rangeRow, isCompact && styles.rangeRowCompact]}>
              <View style={styles.rangeField}>
                <Text style={styles.rangeLabel}>From</Text>
                <TextInput
                  style={styles.rangeInput}
                  value={customFrom}
                  onChangeText={setCustomFrom}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.rangeField}>
                <Text style={styles.rangeLabel}>To</Text>
                <TextInput
                  style={styles.rangeInput}
                  value={customTo}
                  onChangeText={setCustomTo}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.periodSummary}>
            <Text
              style={styles.periodSummaryText}
              numberOfLines={isCompact ? 2 : 1}
            >
              {rows.length} txn · In {formatInr(periodIn)} · Out {formatInr(periodOut)} · Net{" "}
              {formatInr(periodIn - periodOut)}
            </Text>
          </View>

          {(() => {
            const ledgerTable = (
              <View
                style={[
                  styles.table,
                  isCompact && styles.tableCompact,
                  isCompact && { width: LEDGER_TABLE_MIN_WIDTH },
                ]}
              >
                <View style={styles.tableHead}>
                  <Text
                    style={[
                      styles.th,
                      isCompact ? styles.colDateFixed : styles.colDate,
                    ]}
                    numberOfLines={1}
                  >
                    Date
                  </Text>
                  <Text
                    style={[
                      styles.th,
                      isCompact ? styles.colDescFixed : styles.colDesc,
                    ]}
                    numberOfLines={1}
                  >
                    Description
                  </Text>
                  <Text
                    style={[
                      styles.th,
                      isCompact ? styles.colTripFixed : styles.colTrip,
                    ]}
                    numberOfLines={1}
                  >
                    Trip / Route
                  </Text>
                  <Text
                    style={[
                      styles.th,
                      isCompact ? styles.colAmtFixed : styles.colAmt,
                    ]}
                    numberOfLines={1}
                  >
                    Amount paid
                  </Text>
                  <Text
                    style={[
                      styles.th,
                      isCompact ? styles.colAmtFixed : styles.colAmt,
                    ]}
                    numberOfLines={1}
                  >
                    Amount received
                  </Text>
                  <Text
                    style={[
                      styles.th,
                      isCompact ? styles.colBalFixed : styles.colBal,
                    ]}
                    numberOfLines={1}
                  >
                    Balance
                  </Text>
                </View>
                {rows.length === 0 ? (
                  <Text style={styles.empty}>
                    {agingBucket
                      ? "No ledger entries linked to this aging bucket in range."
                      : "No transactions in this range."}
                  </Text>
                ) : (
                  rows.map((row) => {
                    const tripCell = ledgerTripRouteCell(row, tripById);
                    return (
                      <View key={row.id} style={styles.tr}>
                        <Text
                          style={[
                            styles.td,
                            isCompact ? styles.colDateFixed : styles.colDate,
                          ]}
                          numberOfLines={1}
                        >
                          {txDay(row) || "—"}
                        </Text>
                        <View
                          style={isCompact ? styles.colDescFixed : styles.colDesc}
                        >
                          <Text style={styles.td} numberOfLines={2}>
                            {row.description?.trim() || "—"}
                          </Text>
                          {row.payment_mode ? (
                            <Text style={styles.tdSub} numberOfLines={1}>
                              Mode: {row.payment_mode}
                              {row.payment_reference
                                ? ` · UTR: ${row.payment_reference}`
                                : ""}
                            </Text>
                          ) : null}
                        </View>
                        <View
                          style={isCompact ? styles.colTripFixed : styles.colTrip}
                        >
                          {tripCell ? (
                            <>
                              <Text style={styles.tripId} numberOfLines={1}>
                                {tripCell.tripIdLabel}
                              </Text>
                              {tripCell.routeLabel ? (
                                <Text style={styles.tripRoute} numberOfLines={2}>
                                  {tripCell.routeLabel}
                                </Text>
                              ) : null}
                            </>
                          ) : (
                            <Text style={styles.tripEmpty}>—</Text>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.td,
                            isCompact ? styles.colAmtFixed : styles.colAmt,
                          ]}
                          numberOfLines={1}
                        >
                          {Number(row.amount_out) > 0
                            ? formatInr(Number(row.amount_out))
                            : "—"}
                        </Text>
                        <Text
                          style={[
                            styles.td,
                            isCompact ? styles.colAmtFixed : styles.colAmt,
                          ]}
                          numberOfLines={1}
                        >
                          {Number(row.amount_in) > 0
                            ? formatInr(Number(row.amount_in))
                            : "—"}
                        </Text>
                        <Text
                          style={[
                            styles.td,
                            isCompact ? styles.colBalFixed : styles.colBal,
                            styles.tdBal,
                          ]}
                          numberOfLines={1}
                        >
                          {formatInr(row.balance)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            );
            if (!isCompact) return ledgerTable;
            return (
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator
                style={styles.tableScroll}
                contentContainerStyle={styles.tableScrollContent}
              >
                {ledgerTable}
              </ScrollView>
            );
          })()}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.screenBackground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderInput,
  },
  headerCompact: {
    flexWrap: "nowrap",
    alignItems: "flex-start",
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerTitle: {
    marginTop: 1,
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: Theme.textPrimaryDark,
    minHeight: 30,
    flexShrink: 0,
  },
  downloadBtnCompact: {
    paddingHorizontal: 8,
    alignSelf: "center",
  },
  downloadBtnDisabled: {
    opacity: 0.65,
  },
  downloadBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 12, maxWidth: "100%" },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  sectionTitleInline: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
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
  agingRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
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
  openArBlock: { marginBottom: 4 },
  arDownloadPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    minHeight: 28,
    marginTop: 10,
  },
  arDownloadPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  chipScroll: { flexGrow: 0, maxWidth: "100%", marginBottom: 2 },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 8,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    minHeight: 30,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  chipText: { fontSize: 10, fontWeight: "700", color: Theme.textRouteCard },
  chipTextActive: { color: Theme.textOnPrimary },
  rangeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  rangeRowCompact: { flexDirection: "column" },
  rangeField: { flex: 1, minWidth: 0, gap: 3 },
  rangeLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rangeInput: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    ...(Platform.select({ web: { outlineStyle: "none" } as object }) ?? {}),
  },
  periodSummary: {
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  periodSummaryText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  tableScroll: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  // Do NOT set flexGrow:1 here — on web it collapses scroll width to the
  // viewport and the last column stays clipped at the right edge.
  tableScrollContent: {
    flexGrow: 0,
    paddingRight: 16,
    alignItems: "flex-start",
  },
  table: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    width: "100%",
    alignSelf: "stretch",
  },
  tableCompact: {
    alignSelf: "flex-start",
    flexGrow: 0,
    flexShrink: 0,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: LEDGER_TABLE_GAP,
    paddingHorizontal: LEDGER_TABLE_PAD_X,
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
    alignItems: "flex-start",
    width: "100%",
    gap: LEDGER_TABLE_GAP,
    paddingHorizontal: LEDGER_TABLE_PAD_X,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
  },
  td: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  tdSub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  tdBal: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  colDate: { width: 92, flexGrow: 0, flexShrink: 0 },
  colDesc: { flex: 1.4, minWidth: 0 },
  colTrip: { flex: 1.15, minWidth: 0 },
  colDays: { width: 48, flexGrow: 0, flexShrink: 0, textAlign: "right" },
  colAmt: {
    width: 104,
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
  colDateFixed: {
    width: LEDGER_COL.date,
    flexGrow: 0,
    flexShrink: 0,
  },
  colDescFixed: {
    width: LEDGER_COL.desc,
    flexGrow: 0,
    flexShrink: 0,
  },
  colTripFixed: {
    width: LEDGER_COL.trip,
    flexGrow: 0,
    flexShrink: 0,
  },
  colOpenTripFixed: {
    width: OPEN_AR_COL.trip,
    flexGrow: 0,
    flexShrink: 0,
  },
  colDaysFixed: {
    width: OPEN_AR_COL.days,
    flexGrow: 0,
    flexShrink: 0,
    textAlign: "right",
  },
  colAmtFixed: {
    width: LEDGER_COL.amt,
    flexGrow: 0,
    flexShrink: 0,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  colBalFixed: {
    width: LEDGER_COL.bal,
    flexGrow: 0,
    flexShrink: 0,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  tripId: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.15,
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
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    padding: 14,
  },
});
