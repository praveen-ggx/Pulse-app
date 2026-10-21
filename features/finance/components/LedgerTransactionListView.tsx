/**
 * Ledger entries in a compact transaction list: grouped by day/month,
 * with cumulative Paid/Received per section.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import {
    getLedgerFlowForRow,
    LedgerFlowChip,
} from "@/features/finance/components/LedgerFlowChip";
import type { LedgerEntryReceiptPartyAvatar } from "@/components/ledger/LedgerEntryReceiptCard";
import { LedgerTransactionPreviewModal } from "@/features/finance/components/LedgerTransactionPreviewModal";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { LedgerDayDivider } from "@/features/finance/components/LedgerDayDivider";
import {
  CASH_LEDGER_MAX_WIDTH,
  CASH_LEDGER_ENTITY_DESKTOP_MAX_WIDTH,
  LEDGER_DESKTOP_BREAKPOINT,
  LEDGER_DESKTOP_PADDING,
  LEDGER_RIGHT_COLUMN_WIDTH,
} from "@/features/finance/components/ledger/ledgerTransactionLayout";
import { type LedgerRow } from "@/features/finance/services/finance.service";
import { formatIndianVehicleNumber, formatINRChip, formatLedgerAmount } from "@/lib/format";
import { EMPTY_STATE_LOTTIE } from "@/lib/emptyStateLottieAssets";
import { partyAvatarHasRenderableOutput, partyAvatarInitialsTextColor } from "@/lib/partyAvatarDisplay";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
    type ViewStyle,
} from "react-native";
import {
    FinanceAnalyticsView,
    type AnalyticsTripDetailMap,
} from "./FinanceAnalyticsView";

/** Shared layout: timeline left anchor width and separator alignment. */
const TIMELINE_ANCHOR_WIDTH = 80;

/** Minimum font size for readable labels (accessibility). */
const FONT_SIZE_CAPTION = 8;
const FONT_SIZE_BODY = 10;
const FONT_SIZE_BODY_STRONG = 11;

const MONTHS_SHORT = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(
  " ",
);
const MONTHS_FULL =
  "January February March April May June July August September October November December".split(
    " ",
  );

/** When no `renderPartyAvatar`, show driver photo / seed / initials from optional fleet rows + URL map. */
function defaultDriverPartyAvatar(
  row: LedgerRow,
  driverById: Map<string, { avatar_url?: string | null; avatar_seed?: string | null }>,
  driverProfileImageUrls: Record<string, string> | undefined,
): ReactNode | null {
  const isDriver = row.contact_type === "driver";
  if (!isDriver) return null;

  const contactId = (row.contact_id ?? "").trim();
  const d = contactId ? driverById.get(contactId) : undefined;
  const name =
    (row.party_name ?? "").trim() ||
    (row.driver_name ?? "").trim() ||
    "—";
  const avatarUrl =
    (row.profileImageUrl ?? "").trim() ||
    (d?.avatar_url ?? "").trim() ||
    (contactId ? (driverProfileImageUrls?.[contactId] ?? "").trim() : "") ||
    null;
  const avatarSeed = (d?.avatar_seed ?? "").trim() || null;

  if (
    !partyAvatarHasRenderableOutput({
      name,
      avatarUrl,
      avatarSeed,
      entityType: "driver",
    })
  ) {
    return null;
  }

  return (
    <PartyAvatar
      name={name}
      initialsColorSeed={contactId || name}
      avatarUrl={avatarUrl}
      avatarSeed={avatarSeed}
      entityType="driver"
      size={32}
    />
  );
}

function formatTxDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (iso ?? "").slice(0, 10);
  if (!s) return "—";
  const [y, m, day] = s.split("-");
  return `${day} ${MONTHS_SHORT[Number(m) - 1] ?? m} ${y}`;
}

/** Date key YYYY-MM-DD for grouping; null if no date. */
function dateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const s = (iso ?? "").slice(0, 10);
  return s || null;
}

/** Section title: Today, Yesterday, or "15 August 2024" (reference style). */
function sectionTitleForKey(key: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${d} ${MONTHS_FULL[m - 1]} ${y}`;
}

function ledgerDividerDateIso(key: string): string | undefined {
  if (key === "—" || key === "_all") return undefined;
  return `${key}T12:00:00`;
}

/** Initials from party/name (max 2 chars, uppercase). */
function initials(name: string): string {
  const t = (name ?? "").trim();
  if (!t) return "—";
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2)
    return (words[0][0] + words[words.length - 1][0]).toUpperCase().slice(0, 2);
  return t.slice(0, 2).toUpperCase();
}

/** Avatar background colors aligned with Theme (primary blue, slate, semantic accents). */
const AVATAR_COLORS = [
  Theme.primary,
  Theme.primaryLight,
  Theme.aggregatePillText,
  Theme.darkGreen,
  Theme.teslaRed,
  Theme.textPrimary,
  Theme.buttonSecondary,
  Theme.integratedIcon,
  Theme.iconSlate,
  Theme.primaryText,
];
function avatarColor(str: string): string {
  let n = 0;
  for (let i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function formatTxDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (iso ?? "").slice(0, 10);
  if (!s) return "—";
  const [y, m, day] = s.split("-");
  return `${day} ${MONTHS_SHORT[Number(m) - 1] ?? m} ${y}`;
}

export type TripDetailMap = Record<
  string,
  {
    trip_number: string;
    drop_location?: string;
    pickup_area?: string;
    client_name?: string;
    pickup_date?: string | null;
    vehicle_number?: string | null;
    vehicle_type?: string | null;
    vehicle_body_type?: string | null;
  }
>;

/** Route only (e.g. "Pondy → Madurai") for display below date. */
function tripRouteOnly(
  row: LedgerRow,
  tripDetailsMap: TripDetailMap | undefined,
): string | null {
  if (!row.trip_id || !tripDetailsMap?.[row.trip_id]) return null;
  const d = tripDetailsMap[row.trip_id];
  const route = [d.pickup_area, d.drop_location].filter(Boolean).join(" → ");
  return route || null;
}

/** Trip ID/number only for pill display (e.g. "TRP034"). */
function tripNumberForPill(
  row: LedgerRow,
  tripDetailsMap: TripDetailMap | undefined,
): string | null {
  if (!row.trip_id) return null;
  const d = tripDetailsMap?.[row.trip_id];
  const num = getTripOperationalDisplay({
    trip_number: d?.["trip_number"] ?? row["trip_number"] ?? null,
  });
  return num === "—" ? null : num;
}

export interface LedgerTransactionListViewProps {
  transactions: LedgerRow[];
  /** Optional hook when a row is tapped (preview modal still opens). */
  onRowPress?: (id: string) => void;
  /** Optional row id to highlight. */
  highlightId?: string | null;
  /** Navigate to all transactions on the linked trip (receipt primary action). */
  onViewAllOnTrip?: (tripId: string) => void;
  /** Show section title above the list. Default true. */
  showTitle?: boolean;
  /** Map trip_id -> detail; used to show trip number/route on row and in expand. */
  tripDetailsMap?: TripDetailMap;
  /** Resolve vehicle registration when row/trip map omit vehicle_number. */
  getVehicleNumberForTripId?: (tripId: string | null) => string | null;
  /** Optional: show "History" header with Search/Scan buttons (Tesla minimal style). */
  showHistoryHeader?: boolean;
  onSearchPress?: () => void;
  onScanPress?: () => void;
  /** Optional: show "Grid Protocol Secured" footer. */
  showGridFooter?: boolean;
  /** Optional: when set, header shows Plus button that calls this (Fiscal / Timeline layout). */
  onAddTransactionPress?: () => void;
  /** When false, hide TRANSACTION | TABLE | ANALYTICS sub-tabs (e.g. Cash page shows transaction list only). */
  showFiscalSubTabs?: boolean;
  /** Use FISCAL + Timeline Neural Gauge layout (date gauge with Paid/Received cards, card-style rows). */
  useTimelineLayout?: boolean;
  /** When useTimelineLayout: 'card' (default) or 'table' view. */
  fiscalViewMode?: "card" | "table";
  onFiscalViewModeChange?: (mode: "card" | "table") => void;
  /** When true, show a single flat list (one group, no date gauge). Used e.g. for Customers ledger view. */
  useFlatList?: boolean;
  /** When true, render content in a View instead of ScrollView so a parent ScrollView can scroll (e.g. client detail Cash Flow). */
  embedInParentScroll?: boolean;
  /** When true, content stretches to screen edges (e.g. Cash tab aligned with other finance tabs). */
  fullWidth?: boolean;
  /** Called when user taps Export/Download on a row (Table expanded card or Timeline expanded). Pass rowId for table export. */
  onExportPress?: (rowId?: string) => void;
  /** Optional: custom avatar renderer for party; when provided, used instead of initials circle (e.g. contact profile picture). */
  renderPartyAvatar?: (row: LedgerRow) => ReactNode;
  /** Same identity resolver as list avatars, for receipt preview modal. */
  resolveReceiptPartyAvatar?: (row: LedgerRow) => LedgerEntryReceiptPartyAvatar | undefined;
  /** Fleet drivers (avatar_url / avatar_seed) for default driver avatars when `renderPartyAvatar` is unset or returns null. */
  driverRows?: DriverRow[];
  /** Optional signed/public image URLs by driver id (e.g. FinanceScreen `getProfileImage`). */
  driverProfileImageUrls?: Record<string, string>;
  /** Called when user taps "Load more" — signals the parent to fetch the next page. */
  onLoadMore?: () => void;
  /** When true, shows a loading spinner instead of the "Load more" button. */
  loadingMore?: boolean;
}

export function LedgerTransactionListView({
  transactions,
  onRowPress,
  highlightId,
  onViewAllOnTrip,
  showTitle = true,
  tripDetailsMap,
  getVehicleNumberForTripId,
  showHistoryHeader = false,
  onSearchPress,
  onScanPress,
  showGridFooter = false,
  onAddTransactionPress,
  showFiscalSubTabs = true,
  useTimelineLayout = false,
  fiscalViewMode: fiscalViewModeProp,
  useFlatList = false,
  embedInParentScroll = false,
  fullWidth = false,
  renderPartyAvatar,
  resolveReceiptPartyAvatar,
  driverRows = [],
  driverProfileImageUrls,
  onLoadMore,
  loadingMore = false,
}: LedgerTransactionListViewProps) {
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktopLedger =
    Platform.OS === "web" && windowWidth >= LEDGER_DESKTOP_BREAKPOINT;
  const useEntityDesktopTable =
    isDesktopLedger && embedInParentScroll && useTimelineLayout;
  const ledgerContentMaxWidth = useEntityDesktopTable
    ? CASH_LEDGER_ENTITY_DESKTOP_MAX_WIDTH
    : isDesktopLedger || !fullWidth
      ? CASH_LEDGER_MAX_WIDTH
      : undefined;
  const ledgerContentWidthStyle =
    ledgerContentMaxWidth != null
      ? ({
          width: ledgerContentMaxWidth,
          maxWidth: "100%" as const,
          alignSelf: "center" as const,
        } satisfies ViewStyle)
      : ({ width: "100%" as const, alignSelf: "stretch" as const } satisfies ViewStyle);
  const ledgerContentPadding = isDesktopLedger
    ? LEDGER_DESKTOP_PADDING
    : fullWidth
      ? LEDGER_DESKTOP_PADDING
      : Layout.screenPaddingHorizontal;
  const ledgerColumnAligned = isDesktopLedger;
  const { t } = useLanguage();
  const [previewTransaction, setPreviewTransaction] = useState<LedgerRow | null>(
    null,
  );
  const handleRowPress = useCallback(
    (id: string) => {
      const row = transactions.find((r) => r.id === id) ?? null;
      if (row) setPreviewTransaction(row);
      onRowPress?.(id);
    },
    [transactions, onRowPress],
  );
  const [fiscalViewModeInternal] = useState<
    "card" | "table"
  >("card");
  const fiscalViewMode = fiscalViewModeProp ?? fiscalViewModeInternal;

  const driverByIdForAvatar = useMemo(() => {
    const m = new Map<
      string,
      { avatar_url?: string | null; avatar_seed?: string | null }
    >();
    for (const d of driverRows) {
      m.set(d.id, {
        avatar_url: d.avatar_url ?? null,
        avatar_seed: d.avatar_seed ?? null,
      });
    }
    return m;
  }, [driverRows]);

  const resolvePartyAvatarForRow = useCallback(
    (row: LedgerRow) =>
      renderPartyAvatar?.(row) ??
      defaultDriverPartyAvatar(row, driverByIdForAvatar, driverProfileImageUrls),
    [renderPartyAvatar, driverByIdForAvatar, driverProfileImageUrls],
  );

  const { groups, cumulativeByKey } = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => {
      const da = a.transaction_date ?? a.created_at ?? "";
      const db = b.transaction_date ?? b.created_at ?? "";
      return db.localeCompare(da);
    });
    if (useFlatList) {
      let paid = 0;
      let received = 0;
      for (const r of sorted) {
        received += Number(r.amount_in ?? 0);
        paid += Number(r.amount_out ?? 0);
      }
      return {
        groups: [{ key: "_all", rows: sorted }],
        cumulativeByKey: { _all: { paid, received } } as Record<
          string,
          { paid: number; received: number }
        >,
      };
    }
    const keyToRows = new Map<string, LedgerRow[]>();
    for (const row of sorted) {
      const key = dateKey(row.transaction_date ?? row.created_at) ?? "—";
      if (!keyToRows.has(key)) keyToRows.set(key, []);
      keyToRows.get(key)!.push(row);
    }
    const keys = Array.from(keyToRows.keys()).filter((k) => k !== "—");
    if (keyToRows.has("—")) keys.push("—");
    let runPaid = 0;
    let runReceived = 0;
    const cumulativeByKey: Record<string, { paid: number; received: number }> =
      {};
    for (const key of keys) {
      const rows = keyToRows.get(key) ?? [];
      for (const r of rows) {
        runReceived += Number(r.amount_in ?? 0);
        // Pending requests are claims, not disbursements — keep them out of "to date Paid".
        if (!r.is_pending_request) runPaid += Number(r.amount_out ?? 0);
      }
      cumulativeByKey[key] = { paid: runPaid, received: runReceived };
    }
    return {
      groups: keys.map((key) => ({ key, rows: keyToRows.get(key) ?? [] })),
      cumulativeByKey,
    };
  }, [transactions, useFlatList]);

  // These three useState calls must run before the empty-state return below.
  // They used to sit after it, so the hook count changed the moment the list
  // went from empty to populated (or back) — React error #310.
  const [fiscalSubTab, setFiscalSubTab] = useState<
    "transaction" | "table" | "analytics"
  >("transaction");
  /** Timeline: which date sections are expanded. When undefined, all sections are expanded (opened) by default. */
  const [expandedSectionsByKey, setExpandedSectionsByKey] = useState<
    Record<string, boolean>
  >({});
  /** Timeline: per-section flow filter for daily data. */
  const [sectionFlowFilterByKey, setSectionFlowFilterByKey] = useState<
    Record<string, "all" | "out" | "in">
  >({});

  const getVehicleForRow = useCallback(
    (row: LedgerRow): string => {
      const fromRow = (row.vehicle_number ?? "").trim();
      if (fromRow) return formatIndianVehicleNumber(fromRow);
      if (row.trip_id && tripDetailsMap?.[row.trip_id]) {
        const fromTrip = (tripDetailsMap[row.trip_id].vehicle_number ?? "").trim();
        if (fromTrip) return formatIndianVehicleNumber(fromTrip);
      }
      const fromLookup = getVehicleNumberForTripId?.(row.trip_id ?? null);
      if (fromLookup) return formatIndianVehicleNumber(fromLookup);
      return "";
    },
    [getVehicleNumberForTripId, tripDetailsMap],
  );

  if (transactions.length === 0) {
    return (
      <View style={styles.wrap}>
        <View
          style={[styles.emptyState, fullWidth && { paddingHorizontal: 0 }]}
        >
          <TinyEmptyLottie source={EMPTY_STATE_LOTTIE.transactions} size={64} />
          <Text style={styles.emptyStateTitle}>No transactions yet</Text>
          <Text style={styles.emptyStateSubtext}>
            Transactions will appear here when added.
          </Text>
        </View>
      </View>
    );
  }

  const effectiveFiscalSubTab = showFiscalSubTabs
    ? fiscalSubTab
    : useEntityDesktopTable
      ? "table"
      : "transaction";

  /** Render "Secured" inside scroll so it does not sit fixed over the list on mobile */
  const showSecuredFooterInScroll =
    showGridFooter &&
    !(
      showHistoryHeader &&
      useTimelineLayout &&
      (effectiveFiscalSubTab === "analytics" ||
        effectiveFiscalSubTab === "table")
    );

  /** All date-section dropdowns are open by default (undefined => expanded). User can collapse via toggle. */
  const isSectionExpanded = (key: string) =>
    expandedSectionsByKey[key] !== false;
  const toggleSectionExpanded = (key: string) => {
    setExpandedSectionsByKey((prev) => ({
      ...prev,
      [key]: !(prev[key] !== false),
    }));
  };
  const getSectionFlowFilter = (key: string): "all" | "out" | "in" =>
    sectionFlowFilterByKey[key] ?? "all";
  const setSectionFlowFilter = (key: string, filter: "all" | "out" | "in") => {
    setSectionFlowFilterByKey((prev) => ({ ...prev, [key]: filter }));
  };

  return (
    <View style={[styles.wrap, embedInParentScroll && styles.wrapEmbedded]}>
      {showHistoryHeader && useTimelineLayout && showFiscalSubTabs ? (
        <View
          style={styles.streamHeader}
        >
          <View style={styles.streamHeaderTop}>
            <View style={styles.streamHeaderTopLeft}>
              <Text style={styles.streamHeaderHistoryTitle}>History</Text>
              <View style={styles.streamHeaderDivider} />
              <Text style={styles.streamHeaderSubtitle}>Grid Stream</Text>
            </View>
            <View style={styles.streamHeaderActions}>
              {onSearchPress != null && (
                <TouchableOpacity
                  onPress={onSearchPress}
                  style={styles.headerIconBtn}
                  hitSlop={12}
                >
                  <FontAwesome
                    name="search"
                    size={16}
                    color={Theme.textMuted}
                  />
                </TouchableOpacity>
              )}
              {onScanPress != null && (
                <TouchableOpacity
                  onPress={onScanPress}
                  style={styles.headerIconBtn}
                  hitSlop={12}
                >
                  <FontAwesome
                    name="qrcode"
                    size={16}
                    color={Theme.textMuted}
                  />
                </TouchableOpacity>
              )}
              {onAddTransactionPress != null && (
                <TouchableOpacity
                  onPress={onAddTransactionPress}
                  style={styles.streamHeaderAddBtn}
                  activeOpacity={0.8}
                >
                  <FontAwesome
                    name="plus"
                    size={18}
                    color={Theme.buttonPrimaryText}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.streamTabs}>
            <Pressable
              style={(state: HoverPressState) => [
                styles.streamTab,
                fiscalSubTab === "transaction" && styles.streamTabActive,
                WEB_POINTER,
                WEB_TRANSITION,
                fiscalSubTab !== "transaction" && isHovered(state) && hoverRowWash,
              ]}
              onPress={() => setFiscalSubTab("transaction")}
            >
              <Text
                style={[
                  styles.streamTabText,
                  fiscalSubTab === "transaction" && styles.streamTabTextActive,
                ]}
              >
                Transaction
              </Text>
              {fiscalSubTab === "transaction" && (
                <View style={styles.streamTabUnderline} />
              )}
            </Pressable>
            <Pressable
              style={(state: HoverPressState) => [
                styles.streamTab,
                fiscalSubTab === "table" && styles.streamTabActive,
                WEB_POINTER,
                WEB_TRANSITION,
                fiscalSubTab !== "table" && isHovered(state) && hoverRowWash,
              ]}
              onPress={() => setFiscalSubTab("table")}
            >
              <Text
                style={[
                  styles.streamTabText,
                  fiscalSubTab === "table" && styles.streamTabTextActive,
                ]}
              >
                Table
              </Text>
              {fiscalSubTab === "table" && (
                <View style={styles.streamTabUnderline} />
              )}
            </Pressable>
            <Pressable
              style={(state: HoverPressState) => [
                styles.streamTab,
                fiscalSubTab === "analytics" && styles.streamTabActive,
                WEB_POINTER,
                WEB_TRANSITION,
                fiscalSubTab !== "analytics" && isHovered(state) && hoverRowWash,
              ]}
              onPress={() => setFiscalSubTab("analytics")}
            >
              <Text
                style={[
                  styles.streamTabText,
                  fiscalSubTab === "analytics" && styles.streamTabTextActive,
                ]}
              >
                Analytics
              </Text>
              {fiscalSubTab === "analytics" && (
                <View style={styles.streamTabUnderline} />
              )}
            </Pressable>
          </View>
        </View>
      ) : showHistoryHeader && !useTimelineLayout ? (
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>History</Text>
          <View style={styles.historyActions}>
            {onSearchPress != null && (
              <TouchableOpacity
                onPress={onSearchPress}
                style={styles.headerIconBtn}
                hitSlop={12}
              >
                <FontAwesome name="search" size={18} color={Theme.textMuted} />
              </TouchableOpacity>
            )}
            {onScanPress != null && (
              <TouchableOpacity
                onPress={onScanPress}
                style={styles.headerIconBtn}
                hitSlop={12}
              >
                <FontAwesome name="qrcode" size={18} color={Theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : null}
      {showTitle && !showHistoryHeader && (
        <Text style={styles.title}>
          {t("transactionHistory") || "Transaction history"}
        </Text>
      )}
      <View style={styles.list}>
        {showHistoryHeader &&
        useTimelineLayout &&
        effectiveFiscalSubTab === "analytics" ? (
          <FinanceAnalyticsView
            transactions={transactions}
            tripDetailsMap={
              (tripDetailsMap ?? undefined) as
                | AnalyticsTripDetailMap
                | undefined
            }
          />
        ) : useTimelineLayout &&
          effectiveFiscalSubTab === "table" ? (
          (() => {
            const TableWrapper = embedInParentScroll ? View : ScrollView;
            const tableWrapperProps = embedInParentScroll
              ? { style: styles.entityDesktopTableWrap }
              : {
                  style: styles.tableViewScroll,
                  contentContainerStyle: styles.tableViewScrollContent,
                  showsVerticalScrollIndicator: false as const,
                  ...tabBarScrollProps,
                };
            return (
              <TableWrapper {...tableWrapperProps}>
            {groups.map(({ key, rows: sectionRows }) => {
              const dayIn = sectionRows.reduce(
                (s, r) => s + Number(r.amount_in ?? 0),
                0,
              );
              // Pending requests are surfaced as synthetic amount_out rows but no cash
              // has left yet, so they must not inflate the day's PAID total.
              const dayOut = sectionRows.reduce(
                (s, r) => (r.is_pending_request ? s : s + Number(r.amount_out ?? 0)),
                0,
              );
              const flowFilter = getSectionFlowFilter(key);
              const filteredRows =
                flowFilter === "out"
                  ? sectionRows.filter((r) => Number(r.amount_out ?? 0) > 0)
                  : flowFilter === "in"
                    ? sectionRows.filter((r) => Number(r.amount_in ?? 0) > 0)
                    : sectionRows;
              return (
                <View key={key} style={styles.tableViewSection}>
                  <LedgerDayDivider
                    dateStr={ledgerDividerDateIso(key)}
                    label={key === "—" ? "Other" : undefined}
                    paidLabel={formatINRChip(dayOut)}
                    receivedLabel={formatINRChip(dayIn)}
                    flowFilter={flowFilter}
                    onToggleExpand={() => toggleSectionExpanded(key)}
                    onFlowFilter={(filter) => setSectionFlowFilter(key, filter)}
                    maxWidth={ledgerContentMaxWidth}
                    contentPaddingHorizontal={ledgerContentPadding}
                    columnAligned={ledgerColumnAligned}
                  />
                  {isSectionExpanded(key) ? (
                    <View
                      style={[
                        styles.tableViewMetaRow,
                        { paddingHorizontal: ledgerContentPadding },
                        ledgerContentWidthStyle,
                      ]}
                    >
                      <Text style={styles.tableViewDateBarCount}>
                        {sectionRows.length} transactions
                      </Text>
                    </View>
                  ) : null}
                  {isSectionExpanded(key) && (
                    <View style={ledgerContentWidthStyle}>
                    <View
                      style={[
                        styles.tableViewTable,
                        useEntityDesktopTable && styles.tableViewTableEntityDesktop,
                      ]}
                    >
                      <View style={styles.tableViewHeader}>
                        <View
                          style={[
                            styles.tableViewHeaderCell,
                            styles.tableViewCol1,
                          ]}
                        >
                          <Text style={styles.tableViewTh} numberOfLines={1}>
                            Party / Date · Type
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.tableViewHeaderCell,
                            styles.tableViewCol2,
                          ]}
                        >
                          <Text style={styles.tableViewTh} numberOfLines={1}>
                            Date / Route
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.tableViewHeaderCell,
                            styles.tableViewCol3,
                          ]}
                        >
                          <Text
                            style={[styles.tableViewTh, styles.tableViewThIn]}
                            numberOfLines={1}
                          >
                            In
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.tableViewHeaderCell,
                            styles.tableViewCol4,
                          ]}
                        >
                          <Text
                            style={[styles.tableViewTh, styles.tableViewThOut]}
                            numberOfLines={1}
                          >
                            Out
                          </Text>
                        </View>
                      </View>
                      {filteredRows.map((row) => {
                        const dateStr = formatTxDate(
                          row.transaction_date ?? row.created_at,
                        );
                        const typeLabel =
                          getDoubleEntryDisplayLabel(row) ??
                          row.description ??
                          row.party_name ??
                          "—";
                        const partyName =
                          (row.party_name ?? "").trim() || typeLabel || "—";
                        const inAmt = Number(row.amount_in ?? 0);
                        const outAmt = Number(row.amount_out ?? 0);
                        const isIn = inAmt > 0;
                        const routeStr = tripRouteOnly(row, tripDetailsMap);
                        const tripDateStr =
                          row.trip_id && tripDetailsMap?.[row.trip_id]
                            ? formatTxDate(
                                tripDetailsMap[row.trip_id].pickup_date ??
                                  undefined,
                              )
                            : dateStr;
                        return (
                          <View key={row.id}>
                            <Pressable
                              style={(state: HoverPressState) => [
                                styles.tableViewRow,
                                WEB_POINTER,
                                WEB_TRANSITION,
                                isHovered(state) && hoverRowWash,
                              ]}
                              onPress={() => handleRowPress(row.id)}
                            >
                              <View
                                style={[
                                  styles.tableViewCell,
                                  styles.tableViewCol1,
                                ]}
                              >
                                <Text
                                  style={styles.tableViewCellParty}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  {partyName}
                                </Text>
                                <Text
                                  style={[
                                    styles.tableViewCellMetaText,
                                    styles.tableViewCellMetaRow,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {dateStr}
                                </Text>
                                <Text
                                  style={[
                                    styles.tableViewCellMetaText,
                                    styles.tableViewCellMetaRow,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {typeLabel}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.tableViewCell,
                                  styles.tableViewCol2,
                                ]}
                              >
                                <Text
                                  style={styles.tableViewCellRoute}
                                  numberOfLines={2}
                                >
                                  {routeStr ?? "—"}
                                </Text>
                                <Text
                                  style={[
                                    styles.tableViewCellMetaText,
                                    styles.tableViewCellMetaRow,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {tripDateStr}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.tableViewCell,
                                  styles.tableViewCol3,
                                ]}
                              >
                                {isIn ? (
                                  <View style={styles.tableViewCellAmountWrap}>
                                    <Text
                                      style={[
                                        styles.tableViewCellAmount,
                                        styles.tableViewCellAmountIn,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      ₹{formatLedgerAmount(inAmt)}
                                    </Text>
                                    <Text
                                      style={styles.tableViewCellAmountLabel}
                                      numberOfLines={1}
                                    >
                                      Received
                                    </Text>
                                  </View>
                                ) : (
                                  <View style={styles.tableViewCellDashWrap}>
                                    <Text style={styles.tableViewCellDash}>
                                      —
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View
                                style={[
                                  styles.tableViewCell,
                                  styles.tableViewCol4,
                                ]}
                              >
                                {!isIn ? (
                                  <View style={styles.tableViewCellAmountWrap}>
                                    <Text
                                      style={[
                                        styles.tableViewCellAmount,
                                        styles.tableViewCellAmountOut,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      ₹{formatLedgerAmount(outAmt)}
                                    </Text>
                                    <Text
                                      style={styles.tableViewCellAmountLabelOut}
                                      numberOfLines={1}
                                    >
                                      {row.is_pending_request ? "Pending" : "Paid"}
                                    </Text>
                                  </View>
                                ) : (
                                  <View style={styles.tableViewCellDashWrap}>
                                    <Text style={styles.tableViewCellDash}>
                                      —
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </Pressable>
                            </View>
                        );
                      })}
                    </View>
                    </View>
                  )}
                </View>
              );
            })}
            {!embedInParentScroll && showSecuredFooterInScroll ? (
              <View style={styles.gridFooter}>
                <FontAwesome name="shield" size={28} color={Theme.textMuted} />
                <Text style={styles.gridFooterText}>Secured</Text>
              </View>
            ) : null}
            {!embedInParentScroll ? (
              <View style={styles.scrollBottomSpacer} />
            ) : null}
              </TableWrapper>
            );
          })()
        ) : (
          (() => {
            const ScrollWrapper = embedInParentScroll ? View : ScrollView;
            const scrollWrapperProps = embedInParentScroll
              ? {}
              : {
                  showsVerticalScrollIndicator: false,
                  style: styles.ledgerMainScroll,
                  contentContainerStyle: styles.ledgerMainScrollContent,
                  ...tabBarScrollProps,
                };
            return (
              <ScrollWrapper {...scrollWrapperProps}>
                {groups.map(({ key, rows: sectionRows }) => {
                  const cum = cumulativeByKey[key];
                  const sectionLabel =
                    key === "—" ? "Other" : sectionTitleForKey(key);
                  // See the sibling total above: pending requests are not cash out.
                  const dayOut = sectionRows.reduce(
                    (s, r) => (r.is_pending_request ? s : s + Number(r.amount_out ?? 0)),
                    0,
                  );
                  const dayIn = sectionRows.reduce(
                    (s, r) => s + Number(r.amount_in ?? 0),
                    0,
                  );
                  return (
                    <View
                      key={key}
                      style={[
                        styles.section,
                        useTimelineLayout && styles.sectionTimeline,
                      ]}
                    >
                      {!useFlatList &&
                        (useTimelineLayout ? (
                          <LedgerDayDivider
                            dateStr={ledgerDividerDateIso(key)}
                            label={key === "—" ? "Other" : undefined}
                            paidLabel={formatINRChip(dayOut)}
                            receivedLabel={formatINRChip(dayIn)}
                            flowFilter={getSectionFlowFilter(key)}
                            onToggleExpand={() => toggleSectionExpanded(key)}
                            onFlowFilter={(filter) =>
                              setSectionFlowFilter(key, filter)
                            }
                            maxWidth={ledgerContentMaxWidth}
                            contentPaddingHorizontal={ledgerContentPadding}
                            columnAligned={ledgerColumnAligned}
                          />
                        ) : (
                          <View style={styles.sectionBar}>
                            <Text
                              style={styles.sectionDateLabel}
                              numberOfLines={1}
                            >
                              {sectionLabel.toUpperCase()}
                            </Text>
                            {cum != null && (
                              <View style={styles.cumulativeBlock}>
                                <Text style={styles.cumulativeHint}>
                                  To date
                                </Text>
                                <View style={styles.cumulativeRow}>
                                  <Text style={styles.cumulativePaid}>
                                    Paid ₹{formatLedgerAmount(cum.paid)}
                                  </Text>
                                  <Text style={styles.cumulativeDot}> </Text>
                                  <Text style={styles.cumulativeReceived}>
                                    Received ₹{formatLedgerAmount(cum.received)}
                                  </Text>
                                </View>
                              </View>
                            )}
                          </View>
                        ))}
                      {useTimelineLayout ? (
                        isSectionExpanded(key) &&
                        effectiveFiscalSubTab === "transaction" ? (
                          <View
                            style={[
                              styles.fiscalTransactionRows,
                              ledgerContentMaxWidth != null &&
                                ledgerContentWidthStyle,
                              (fullWidth || isDesktopLedger) &&
                                styles.fiscalTransactionRowsFullWidth,
                            ]}
                          >
                            {(() => {
                              const flowFilter = getSectionFlowFilter(key);
                              const filteredRows =
                                flowFilter === "all"
                                  ? sectionRows
                                  : flowFilter === "out"
                                    ? sectionRows.filter(
                                        (r) => Number(r.amount_out ?? 0) > 0,
                                      )
                                    : sectionRows.filter(
                                        (r) => Number(r.amount_in ?? 0) > 0,
                                      );
                              const txRows = filteredRows;
                              return (
                                <View>
                                  {txRows.map((row, rowIndex) => {
                                const typeLabel =
                                  getDoubleEntryDisplayLabel(row) ??
                                  row.description ??
                                  row.party_name ??
                                  "—";
                                const tripIdOnly = tripNumberForPill(
                                  row,
                                  tripDetailsMap,
                                );
                                const inAmt = Number(row.amount_in ?? 0);
                                const outAmt = Number(row.amount_out ?? 0);
                                const isIn = inAmt > 0;
                                const amount = isIn ? inAmt : outAmt;
                                const partyName =
                                  (row.party_name ?? "").trim() ||
                                  typeLabel ||
                                  "—";
                                const routeStr = tripRouteOnly(
                                  row,
                                  tripDetailsMap,
                                );
                                const routeWhyLine =
                                  [routeStr, typeLabel]
                                    .filter(Boolean)
                                    .join(" • ") || "—";
                                const dateDisplay = formatTxDateLong(
                                  row.transaction_date ?? row.created_at,
                                );
                                const avatarBg = avatarColor(partyName);
                                const customAvatar = resolvePartyAvatarForRow(row);
                                const isLastRow = rowIndex === txRows.length - 1;
                                return (
                                  <View
                                    key={row.id}
                                    style={[
                                      styles.fiscalCardWrap,
                                      !isLastRow && styles.fiscalCardWrapSeparator,
                                    ]}
                                  >
                                    <Pressable
                                      style={(state: HoverPressState) => [
                                        styles.fiscalCard,
                                        WEB_POINTER,
                                        WEB_TRANSITION,
                                        isHovered(state) && hoverRowWash,
                                      ]}
                                      onPress={() => handleRowPress(row.id)}
                                    >
                                      <View
                                        style={[
                                          styles.fiscalCardInner,
                                          (fullWidth || isDesktopLedger) &&
                                            styles.fiscalCardInnerFullWidth,
                                        ]}
                                      >
                                        {customAvatar ? (
                                          <View
                                            style={
                                              styles.fiscalCardAvatarImageWrap
                                            }
                                          >
                                            {customAvatar}
                                          </View>
                                        ) : (
                                          <View
                                            style={[
                                              styles.fiscalCardAvatar,
                                              { backgroundColor: avatarBg },
                                              isIn
                                                ? styles.fiscalCardAvatarIn
                                                : styles.fiscalCardAvatarOut,
                                            ]}
                                          >
                                            <Text
                                              style={[
                                                styles.fiscalCardAvatarText,
                                                {
                                                  color:
                                                    partyAvatarInitialsTextColor(
                                                      avatarBg,
                                                    ),
                                                },
                                              ]}
                                              numberOfLines={1}
                                            >
                                              {initials(partyName)}
                                            </Text>
                                          </View>
                                        )}
                                        <View style={styles.fiscalCardBody}>
                                          <Text
                                            style={styles.fiscalCardParty}
                                            numberOfLines={1}
                                          >
                                            {partyName}
                                          </Text>
                                          <Text
                                            style={styles.fiscalCardDate}
                                            numberOfLines={1}
                                          >
                                            {dateDisplay}
                                          </Text>
                                          <Text
                                            style={styles.fiscalCardRouteWhy}
                                            numberOfLines={1}
                                          >
                                            {routeWhyLine}
                                          </Text>
                                        </View>
                                        <View style={styles.fiscalCardRight}>
                                          {tripIdOnly ? (
                                            <View style={styles.fiscalCardPill}>
                                              <FontAwesome
                                                name="check-circle"
                                                size={8}
                                                color={Theme.darkGreen}
                                                style={
                                                  styles.fiscalCardPillIcon
                                                }
                                              />
                                              <Text
                                                style={
                                                  styles.fiscalCardPillText
                                                }
                                                numberOfLines={1}
                                              >
                                                {tripIdOnly}
                                              </Text>
                                            </View>
                                          ) : null}
                                          <Text
                                            style={[
                                              styles.fiscalCardAmount,
                                              isIn
                                                ? styles.fiscalCardAmountIn
                                                : styles.fiscalCardAmountOut,
                                            ]}
                                            numberOfLines={1}
                                          >
                                            {isIn ? "+" : "−"} ₹
                                            {formatLedgerAmount(amount)}
                                          </Text>
                                        </View>
                                      </View>
                                    </Pressable>
                                    </View>
                                );
                              })}
                                </View>
                              );
                            })()}
                          </View>
                        ) : null
                      ) : fiscalViewMode === "table" ? (
                        <View style={styles.tableWrap}>
                          <View style={styles.tableHeader}>
                            <Text
                              style={[styles.tableHeaderCell, styles.tableCol1]}
                              numberOfLines={1}
                            >
                              Party / Date · Type
                            </Text>
                            <Text
                              style={[styles.tableHeaderCell, styles.tableCol2]}
                              numberOfLines={1}
                            >
                              Mission
                            </Text>
                            <Text
                              style={[styles.tableHeaderCell, styles.tableCol3]}
                              numberOfLines={1}
                            >
                              Paid
                            </Text>
                            <Text
                              style={[styles.tableHeaderCell, styles.tableCol4]}
                              numberOfLines={1}
                            >
                              Received
                            </Text>
                          </View>
                          {sectionRows.map((row) => {
                            const dateStr = formatTxDate(
                              row.transaction_date ?? row.created_at,
                            );
                            const typeLabel =
                              getDoubleEntryDisplayLabel(row) ??
                              row.description ??
                              row.party_name ??
                              "—";
                            const tripIdOnly = tripNumberForPill(
                              row,
                              tripDetailsMap,
                            );
                            const inAmt = Number(row.amount_in ?? 0);
                            const outAmt = Number(row.amount_out ?? 0);
                            const isIn = inAmt > 0;
                            const partyName =
                              (row.party_name ?? "").trim() || typeLabel || "—";
                            const vehicleStr = getVehicleForRow(row);
                            const hasTrip =
                              tripIdOnly != null && tripIdOnly !== "";
                            const tableTripPill = hasTrip ? (
                              <View style={styles.tableMissionPill}>
                                <Text
                                  style={styles.tableMissionPillText}
                                  numberOfLines={1}
                                >
                                  {tripIdOnly ?? ""}
                                </Text>
                              </View>
                            ) : null;
                            return (
                              <View key={row.id}>
                                <Pressable
                                  style={(state: HoverPressState) => [
                                    styles.tableRow,
                                    WEB_POINTER,
                                    WEB_TRANSITION,
                                    isHovered(state) && hoverRowWash,
                                  ]}
                                  onPress={() => handleRowPress(row.id)}
                                >
                                  <View
                                    style={[
                                      styles.tableRowRibbon,
                                      isIn
                                        ? styles.tableRowRibbonIn
                                        : styles.tableRowRibbonOut,
                                    ]}
                                  />
                                  <View
                                    style={[styles.tableCell, styles.tableCol1]}
                                  >
                                    <Text
                                      style={styles.tableCellParty}
                                      numberOfLines={1}
                                    >
                                      {partyName}
                                    </Text>
                                    <Text
                                      style={styles.tableCellMeta}
                                      numberOfLines={1}
                                    >
                                      {(vehicleStr ? `${vehicleStr} · ` : "") +
                                        typeLabel}{" "}
                                      · {dateStr}
                                    </Text>
                                  </View>
                                  <View
                                    style={[styles.tableCell, styles.tableCol2]}
                                  >
                                    {tableTripPill}
                                  </View>
                                  <View
                                    style={[styles.tableCell, styles.tableCol3]}
                                  >
                                    <Text
                                      style={[
                                        styles.tableCellAmount,
                                        !isIn && styles.tableCellAmountOut,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {!isIn
                                        ? `₹${formatLedgerAmount(outAmt)}`
                                        : "—"}
                                    </Text>
                                  </View>
                                  <View
                                    style={[styles.tableCell, styles.tableCol4]}
                                  >
                                    <Text
                                      style={[
                                        styles.tableCellAmount,
                                        isIn && styles.tableCellAmountIn,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {isIn
                                        ? `₹${formatLedgerAmount(inAmt)}`
                                        : "—"}
                                    </Text>
                                  </View>
                                </Pressable>
                                </View>
                            );
                          })}
                        </View>
                      ) : (
                        sectionRows.map((row) => {
                          const dateStr = formatTxDate(
                            row.transaction_date ?? row.created_at,
                          );
                          const typeLabel =
                            getDoubleEntryDisplayLabel(row) ??
                            row.description ??
                            row.party_name ??
                            "—";
                          const tripIdOnly = tripNumberForPill(
                            row,
                            tripDetailsMap,
                          );
                          const inAmt = Number(row.amount_in ?? 0);
                          const outAmt = Number(row.amount_out ?? 0);
                          const isIn = inAmt > 0;
                          const amount = isIn ? inAmt : outAmt;
                          const isRowActive =
                            (highlightId != null && row.id === highlightId) ||
                            previewTransaction?.id === row.id;
                          const partyName =
                            (row.party_name ?? "").trim() || typeLabel || "—";
                          const routeStr = tripRouteOnly(row, tripDetailsMap);
                          const belowDate =
                            [routeStr, typeLabel].filter(Boolean).join(" · ") ||
                            null;
                          const vehicleStr = getVehicleForRow(row);
                          const avatarBg = avatarColor(partyName);
                          const initialText = initials(partyName);
                          const customAvatar = resolvePartyAvatarForRow(row);

                          const routeWhyLine =
                            [routeStr, typeLabel].filter(Boolean).join(" • ") ||
                            null;
                          const hasTrip =
                            tripIdOnly != null && tripIdOnly !== "";
                          const tripPillContent = (
                            <View style={styles.rightMetaStack}>
                              {vehicleStr ? (
                                <View style={styles.vehiclePill}>
                                  <FontAwesome
                                    name="truck"
                                    size={9}
                                    color={Theme.primary}
                                    style={styles.vehiclePillIcon}
                                  />
                                  <Text
                                    style={styles.vehiclePillText}
                                    numberOfLines={1}
                                  >
                                    {vehicleStr}
                                  </Text>
                                </View>
                              ) : null}
                              {hasTrip ? (
                                <View style={styles.tripPillWithCheck}>
                                  <FontAwesome
                                    name="check-circle"
                                    size={8}
                                    color={Theme.darkGreen}
                                    style={styles.tripPillCheckIcon}
                                  />
                                  <Text
                                    style={styles.tripPillTextOnlyLabel}
                                    numberOfLines={1}
                                  >
                                    {tripIdOnly}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          );

                          const amountEl = (
                            <Text
                              style={[
                                styles.amount,
                                styles.amountItalic,
                                isIn ? styles.amountIn : styles.amountOut,
                              ]}
                              numberOfLines={1}
                            >
                              {isIn ? "+" : "−"} ₹{formatLedgerAmount(amount)}
                            </Text>
                          );

                          const leftContent = useTimelineLayout ? (
                            <>
                              {customAvatar ? (
                                <View style={styles.timelineCardAvatarImageWrap}>
                                  {customAvatar}
                                </View>
                              ) : (
                                <View
                                  style={[
                                    styles.timelineCardAvatar,
                                    { backgroundColor: avatarBg },
                                    isIn
                                      ? styles.avatarWrapIn
                                      : styles.avatarWrapOut,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.avatarText,
                                      {
                                        color:
                                          partyAvatarInitialsTextColor(
                                            avatarBg,
                                          ),
                                      },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {initialText}
                                  </Text>
                                </View>
                              )}
                              <View style={styles.timelineCardBody}>
                                <Text
                                  style={styles.timelineCardParty}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  {partyName}
                                </Text>
                                <Text
                                  style={styles.timelineCardDateVehicle}
                                  numberOfLines={1}
                                >
                                  {vehicleStr
                                    ? `${dateStr} · ${vehicleStr}`
                                    : dateStr}
                                </Text>
                                {routeWhyLine != null ? (
                                  <Text
                                    style={styles.timelineCardRouteWhy}
                                    numberOfLines={1}
                                  >
                                    {routeWhyLine}
                                  </Text>
                                ) : null}
                              </View>
                            </>
                          ) : (
                            <>
                              {customAvatar ? (
                                <View
                                  style={[
                                    styles.avatarWrap,
                                    isIn
                                      ? styles.avatarWrapIn
                                      : styles.avatarWrapOut,
                                  ]}
                                >
                                  {customAvatar}
                                </View>
                              ) : (
                                <View
                                  style={[
                                    styles.avatarWrap,
                                    { backgroundColor: avatarBg },
                                    isIn
                                      ? styles.avatarWrapIn
                                      : styles.avatarWrapOut,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.avatarText,
                                      {
                                        color:
                                          partyAvatarInitialsTextColor(
                                            avatarBg,
                                          ),
                                      },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {initialText}
                                  </Text>
                                </View>
                              )}
                              <View style={styles.body}>
                                <Text
                                  style={styles.rowTitle}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  {partyName}
                                </Text>
                                <Text style={styles.rowDate} numberOfLines={1}>
                                  {dateStr}
                                </Text>
                                {belowDate != null && (
                                  <Text
                                    style={styles.rowMeta}
                                    numberOfLines={1}
                                  >
                                    {belowDate}
                                  </Text>
                                )}
                              </View>
                            </>
                          );

                          const rightBlock = (
                            <View style={styles.rightCol}>
                              {getLedgerFlowForRow(row) ? (
                                <LedgerFlowChip row={row} />
                              ) : null}
                              {tripPillContent}
                              <TouchableOpacity
                                style={styles.amountTouchArea}
                                onPress={() => handleRowPress(row.id)}
                                activeOpacity={0.72}
                              >
                                {amountEl}
                              </TouchableOpacity>
                            </View>
                          );

                          const cardContent = useTimelineLayout ? (
                            <>
                              <TouchableOpacity
                                style={styles.rowTouchable}
                                onPress={() => handleRowPress(row.id)}
                                activeOpacity={0.72}
                              >
                                {leftContent}
                              </TouchableOpacity>
                              <View style={styles.rightCol}>
                                {getLedgerFlowForRow(row) ? (
                                  <LedgerFlowChip row={row} />
                                ) : null}
                                {tripPillContent}
                                {onRowPress ? (
                                  <TouchableOpacity
                                    style={styles.amountTouchArea}
                                    onPress={() => handleRowPress(row.id)}
                                    activeOpacity={0.72}
                                  >
                                    {amountEl}
                                  </TouchableOpacity>
                                ) : (
                                  amountEl
                                )}
                              </View>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.rowTouchable}
                                onPress={() => handleRowPress(row.id)}
                                activeOpacity={0.72}
                              >
                                {leftContent}
                              </TouchableOpacity>
                              {rightBlock}
                            </>
                          );

                          return (
                            <View
                              key={row.id}
                              style={[
                                styles.rowWrapper,
                                useTimelineLayout && styles.rowWrapperTimeline,
                              ]}
                            >
                              <View
                                style={[
                                  useTimelineLayout
                                    ? styles.rowCardTimeline
                                    : styles.rowCard,
                                  isRowActive &&
                                    (useTimelineLayout
                                      ? styles.rowCardTimelineHighlighted
                                      : styles.rowCardHighlighted),
                                ]}
                              >
                                {cardContent}
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  );
                })}
                {showSecuredFooterInScroll && (
                  <View style={styles.gridFooter}>
                    <FontAwesome name="shield" size={28} color={Theme.textMuted} />
                    <Text style={styles.gridFooterText}>Secured</Text>
                  </View>
                )}
                {onLoadMore ? (
                  <TouchableOpacity
                    style={styles.loadMoreBtn}
                    onPress={onLoadMore}
                    disabled={loadingMore}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.loadMoreText}>
                      {loadingMore ? "Loading…" : "Load more"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.scrollBottomSpacer} />
              </ScrollWrapper>
            );
          })()
        )}
      </View>
      <LedgerTransactionPreviewModal
        visible={previewTransaction != null}
        transaction={previewTransaction}
        onClose={() => setPreviewTransaction(null)}
        onViewAllOnTrip={onViewAllOnTrip}
        resolveReceiptPartyAvatar={resolveReceiptPartyAvatar}
        tripDetailsMap={tripDetailsMap}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /** Fill parent so ScrollView gets a bounded height (required for Cash tab scroll on web). */
  wrap: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    marginBottom: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  wrapEmbedded: {
    flex: 0,
    minHeight: undefined,
  },
  /** Web: ScrollView content must stretch to viewport width (avoids centered narrow column). */
  ledgerMainScroll: {
    width: '100%',
    flex: 1,
    minHeight: 0,
  },
  /** Do not use flexGrow here — it breaks vertical scrolling on web (content fills viewport). */
  ledgerMainScrollContent: {
    width: "100%",
    alignItems: "stretch",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Layout.sectionSpacing * 2,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 12,
  },
  emptyStateIcon: {
    opacity: 0.5,
  },
  emptyStateTitle: {
    fontSize: FONT_SIZE_BODY_STRONG + 3,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  emptyStateSubtext: {
    fontSize: FONT_SIZE_BODY,
    color: Theme.textMuted,
    textAlign: "center",
  },
  fiscalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  fiscalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fiscalHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.buttonPrimary,
  },
  fiscalTitle: {
    fontSize: 18,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  fiscalViewToggle: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 4,
    gap: 0,
  },
  fiscalViewToggleBtn: {
    width: 36,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  fiscalViewToggleBtnActive: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  fiscalDivider: {
    width: 1,
    height: 12,
    backgroundColor: Theme.borderMedium,
    marginHorizontal: 2,
  },
  fiscalSubtitle: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  fiscalHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fiscalAddBtn: {
    width: 36,
    height: 36,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  streamHeader: {
    width: "100%",
    maxWidth: CASH_LEDGER_MAX_WIDTH,
    alignSelf: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Layout.sectionSpacing,
    paddingBottom: Layout.headerPaddingBelowInset,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  streamHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  streamHeaderTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  streamHeaderHistoryTitle: {
    fontSize: 20,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  streamHeaderDivider: {
    width: 1,
    height: 14,
    backgroundColor: Theme.borderMedium,
  },
  streamHeaderSubtitle: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  streamHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  streamHeaderAddBtn: {
    width: 40,
    height: 40,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  streamTabs: {
    flexDirection: "row",
    marginTop: 0,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  streamTab: {
    paddingBottom: 14,
    position: "relative",
  },
  streamTabActive: {},
  streamTabText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  streamTabTextActive: {
    color: Theme.primary,
  },
  streamTabUnderline: {
    position: "absolute",
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 1,
  },
  tableViewScroll: { flex: 1, width: '100%', minHeight: 0 },
  tableViewScrollContent: {
    paddingBottom: 24,
    width: "100%",
    alignSelf: "stretch",
  },
  entityDesktopTableWrap: {
    width: "100%",
    alignSelf: "stretch",
    paddingBottom: 8,
  },
  scrollBottomSpacer: { height: Layout.sectionSpacing },
  loadMoreBtn: {
    alignSelf: "center",
    marginVertical: 12,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    backgroundColor: "rgba(79,70,229,0.06)",
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
    letterSpacing: 0.3,
  },
  tableViewSection: { marginBottom: 16 },
  tableViewMetaRow: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 6,
  },
  tableViewDateBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
  },
  tableViewDateBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tableViewDateBarChevron: { marginLeft: 2 },
  tableViewDateBarDate: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimary,
    textTransform: "uppercase",
  },
  tableViewDateBarDivider: {
    width: 1,
    height: 14,
    backgroundColor: Theme.borderMedium,
  },
  tableViewDateBarCount: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  tableViewDateBarRight: { flexDirection: "row", gap: 16 },
  tableViewDateBarFlow: {
    alignItems: "flex-end",
    minWidth: 68,
    width: 68,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tableViewDateBarFlowActiveOut: { backgroundColor: "rgba(239,68,68,0.12)" },
  tableViewDateBarFlowActiveIn: { backgroundColor: "rgba(16,185,129,0.12)" },
  tableViewDateBarFlowLabel: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  tableViewDateBarFlowOut: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    textAlign: "right",
  },
  tableViewDateBarFlowIn: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.darkGreen,
    textAlign: "right",
  },
  tableViewTable: { backgroundColor: Theme.screenBackground },
  tableViewTableEntityDesktop: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  tableViewHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  tableViewHeaderCell: {
    minWidth: 0,
    justifyContent: "center",
  },
  tableViewTh: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  tableViewCol1: { flex: 2, minWidth: 0 },
  tableViewCol2: { flex: 1.15, minWidth: 0 },
  tableViewCol3: { width: 96, alignItems: "flex-end", flexShrink: 0 },
  tableViewCol4: { width: 96, alignItems: "flex-end", flexShrink: 0 },
  tableViewThIn: { color: Theme.darkGreen, textAlign: "right" },
  tableViewThOut: { color: Theme.teslaRed, textAlign: "right" },
  tableViewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableViewRowExpanded: { backgroundColor: Theme.surfaceGray },
  tableViewCell: { minWidth: 0, justifyContent: "center" },
  tableViewCellParty: {
    fontSize: 12,
    fontWeight: "300",
    fontStyle: "italic",
    letterSpacing: -0.5,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tableViewCellMetaText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  tableViewCellMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    minWidth: 0,
  },
  tableViewCellMetaDivider: {
    width: 1,
    height: 8,
    backgroundColor: Theme.textMuted,
    opacity: 0.5,
  },
  tableViewCellMetaRow: {
    marginTop: 2,
  },
  tableViewCellTrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
    flex: 1,
  },
  tableViewCellTripId: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimary,
    fontStyle: "italic",
  },
  tableViewCellRoute: {
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "italic",
    flex: 1,
    minWidth: 0,
  },
  tableViewCellTripArrow: {
    marginHorizontal: 4,
  },
  tableViewCellAmountWrap: {
    alignItems: "flex-end",
    minWidth: 0,
    alignSelf: "stretch",
    width: "100%",
  },
  tableViewCellAmount: {
    fontSize: 12,
    fontWeight: "300",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  tableViewCellAmountIn: { color: Theme.darkGreen },
  tableViewCellAmountOut: { color: Theme.teslaRed },
  tableViewCellAmountLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
    marginTop: 1,
    textAlign: "right",
    alignSelf: "stretch",
  },
  tableViewCellAmountLabelOut: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
    marginTop: 1,
    textAlign: "right",
    alignSelf: "stretch",
  },
  tableViewCellDashWrap: {
    alignItems: "flex-end",
    alignSelf: "stretch",
    justifyContent: "center",
    flex: 1,
  },
  tableViewCellDash: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "right",
    width: "100%",
  },
  tableViewExpanded: { paddingHorizontal: 16, paddingBottom: 12 },
  tableViewExpandedCard: {
    backgroundColor: Theme.darkSurface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  tableViewExpandedTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  tableViewExpandedNarrative: { flex: 1, minWidth: 0 },
  tableViewExpandedNarrativeLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  tableViewExpandedNarrativeText: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textOnPrimary,
    opacity: 0.9,
  },
  tableViewExpandedExportBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.driverWhiteMutedStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  tableViewExpandedDivider: {
    height: 1,
    backgroundColor: Theme.separatorDark,
    marginBottom: 12,
  },
  tableViewExpandedGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  tableViewExpandedGridLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  tableViewExpandedGridValue: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textOnPrimary,
  },
  dateSyncBar: {
    paddingBottom: 4,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
  },
  dateSyncBarSingleRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
  },
  dateSyncBarMetricCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 0,
    borderRadius: 8,
  },
  dateSyncBarMetricCellActiveOut: {
    backgroundColor: "rgba(248,113,113,0.1)",
  },
  dateSyncBarMetricCellActiveIn: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  dateSyncBarMetricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginVertical: 8,
  },
  dateSyncBarMetricCopy: {
    flexShrink: 1,
    minWidth: 0,
    gap: 1,
    alignItems: "flex-start",
  },
  dateSyncBarDateCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingRight: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
    flexShrink: 0,
    width: 68,
    justifyContent: "center",
  },
  dateSyncBarChevron: {
    marginLeft: 2,
  },
  dateSyncBarDate: {
    flex: 1,
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
    lineHeight: 12,
    textTransform: "none",
  },
  dateSyncBarHandshake: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    opacity: 0.7,
  },
  dateSyncBarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.buttonPrimary,
  },
  dateSyncBarHandshakeText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dateSyncBarCardsWrap: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingVertical: 4,
    paddingHorizontal: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  dateSyncBarCardsRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  dateSyncBarCards: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateSyncBarCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: "transparent",
    minWidth: 0,
  },
  dateSyncBarCardOut: {
    paddingRight: 4,
  },
  dateSyncBarCardIn: {
    paddingLeft: 6,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderLight,
  },
  dateSyncBarCardActiveOut: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderRadius: 8,
  },
  dateSyncBarCardActiveIn: {
    backgroundColor: "rgba(34,197,94,0.1)",
    borderRadius: 8,
  },
  dateSyncBarCardText: {
    flex: 1,
    minWidth: 0,
  },
  dateSyncBarMetricStack: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 1,
    paddingRight: 2,
  },
  dateSyncBarCardLabel: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  dateSyncBarCardAmount: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  dateSyncBarCardAmountOut: {
    color: Theme.teslaRed,
  },
  dateSyncBarCardAmountIn: {
    color: Theme.darkGreen,
  },
  dateSyncBarCardIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dateSyncBarCardIconOut: { backgroundColor: "rgba(239,68,68,0.25)" },
  dateSyncBarCardIconIn: { backgroundColor: "rgba(16,185,129,0.25)" },
  fiscalTransactionRows: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 6,
    paddingBottom: Layout.sectionSpacing / 2,
  },
  fiscalTransactionRowsFullWidth: {
    paddingHorizontal: LEDGER_DESKTOP_PADDING,
    paddingTop: 4,
    paddingBottom: 10,
  },
  fiscalTransactionRowsConstrained: {
    width: CASH_LEDGER_MAX_WIDTH,
    maxWidth: "100%",
    alignSelf: "center",
  },
  fiscalCardWrap: {},
  fiscalCardWrapSeparator: {
    paddingBottom: 4,
  },
  fiscalCard: {
    backgroundColor: "transparent",
    paddingVertical: 2,
  },
  fiscalCardExpanded: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
  },
  fiscalCardExpandedDesktop: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
  },
  fiscalCardInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 0,
    gap: 10,
    minWidth: 0,
  },
  fiscalCardInnerFullWidth: {
    paddingVertical: 10,
  },
  fiscalCardAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1.5,
  },
  fiscalCardAvatarIn: {
    borderColor: Theme.positiveMuted,
  },
  fiscalCardAvatarOut: {
    borderColor: Theme.negativeMuted,
  },
  fiscalCardAvatarImageWrap: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  fiscalCardAvatarText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  fiscalCardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
    paddingTop: 4,
  },
  fiscalCardParty: {
    fontSize: 11,
    fontWeight: "500",
    fontStyle: "italic",
    letterSpacing: 0,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  fiscalCardDate: {
    fontSize: 7,
    fontWeight: "500",
    fontStyle: "normal",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  fiscalCardRouteWhy: {
    fontSize: 7,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 1,
    lineHeight: 10,
    opacity: 0.95,
  },
  fiscalCardRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    flexShrink: 0,
    width: LEDGER_RIGHT_COLUMN_WIDTH,
    minWidth: LEDGER_RIGHT_COLUMN_WIDTH,
    paddingTop: 4,
  },
  fiscalCardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 0,
    paddingHorizontal: 0,
    maxWidth: LEDGER_RIGHT_COLUMN_WIDTH,
  },
  fiscalCardPillIcon: { marginRight: 0 },
  fiscalCardPillText: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.primary,
    fontStyle: "italic",
    letterSpacing: 0.15,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  fiscalCardAmount: {
    fontSize: 11,
    fontWeight: "500",
    fontStyle: "normal",
    letterSpacing: 0,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  fiscalCardAmountIn: { color: Theme.darkGreen },
  fiscalCardAmountOut: { color: Theme.teslaRed },
  fiscalExpanded: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    paddingTop: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: METRONIC.border,
    backgroundColor: METRONIC.bodyBg,
  },
  fiscalExpandedDesktop: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  fiscalExpandedLedger: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    overflow: "hidden",
  },
  fiscalExpandedLedgerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: Theme.financeHeroBg,
  },
  fiscalExpandedLedgerBarText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  fiscalExpandedLedgerGrid: {
    padding: 20,
  },
  fiscalExpandedLedgerGridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  fiscalExpandedLedgerRow: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  fiscalExpandedLedgerRowRight: {
    alignItems: "flex-end",
  },
  fiscalExpandedLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  fiscalExpandedValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  fiscalExpandedValueItalic: { fontStyle: "italic" },
  fiscalExpandedValueIn: { color: Theme.darkGreen },
  fiscalExpandedValueOut: { color: Theme.teslaRed },
  fiscalExpandedMission: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    marginTop: 12,
    padding: 20,
    gap: 16,
  },
  fiscalExpandedMissionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  fiscalExpandedMissionHeaderRight: { alignItems: "flex-end" },
  fiscalExpandedMissionLabel: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  fiscalExpandedMissionValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
    fontStyle: "italic",
    letterSpacing: -0.3,
    textTransform: "uppercase",
  },
  fiscalExpandedMissionValueItalic: {
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  fiscalExpandedMissionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fiscalExpandedMissionRowRight: { alignItems: "flex-end" },
  fiscalExpandedMissionMargin: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.darkGreen,
  },
  fiscalExpandedExportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 10,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  fiscalExpandedExportText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
  },
  streamRows: {
    flexDirection: "column",
  },
  streamRow: {
    flexDirection: "row",
    backgroundColor: Theme.screenBackground,
    minHeight: 84,
  },
  streamRowAnchor: {
    width: TIMELINE_ANCHOR_WIDTH,
    borderRightWidth: 1,
    borderRightColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 4,
  },
  streamAnchorTripId: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  streamAnchorTripIdIn: {
    color: Theme.darkGreen,
    opacity: 0.7,
  },
  streamAnchorTripIdOut: {
    color: Theme.teslaRed,
    opacity: 0.7,
  },
  streamAnchorVehicle: {
    fontSize: 6,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textAlign: "center",
  },
  streamAnchorVehicleType: {
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: "500",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
    textAlign: "center",
    fontStyle: "italic",
  },
  streamRowMain: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingLeft: 14,
  },
  streamRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  streamRowHeaderLeft: { flex: 1, minWidth: 0 },
  streamRowPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  streamPartyName: {
    fontSize: 12,
    fontWeight: "300",
    fontStyle: "italic",
    letterSpacing: -0.5,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    flex: 1,
    minWidth: 0,
  },
  streamRowWhyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  streamWhy: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontStyle: "italic",
    flex: 1,
    minWidth: 0,
  },
  streamWhyDivider: {
    width: 1.5,
    height: 8,
    backgroundColor: Theme.borderLight,
  },
  streamVehicle: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  streamRowHeaderRight: { alignItems: "flex-end" },
  streamAmount: {
    fontSize: 16,
    fontWeight: "300",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  streamAmountIn: { color: Theme.darkGreen },
  streamAmountOut: { color: Theme.teslaRed },
  streamAging: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 3,
  },
  streamCorridor: {
    flexDirection: "column",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(249,250,251,0.6)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
    gap: 8,
  },
  streamCorridorTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  streamCorridorOrigin: { flex: 1, minWidth: 0 },
  streamCorridorPlace: {
    fontSize: 6,
    fontWeight: "500",
    fontStyle: "italic",
    letterSpacing: -0.3,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  streamCorridorPlaceRight: { textAlign: "right" },
  streamCorridorLabel: {
    fontSize: 4,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 0,
  },
  streamCorridorLine: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  streamCorridorLineBar: {
    width: "100%",
    height: 1,
    backgroundColor: "rgba(99,102,241,0.3)",
  },
  streamCorridorIcons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  streamCorridorIconMuted: {
    opacity: 0.6,
  },
  streamCorridorDest: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  streamLinkTripCta: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(249,250,251,0.9)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderStyle: "dashed",
    gap: 12,
  },
  streamLinkTripCtaIcon: {
    opacity: 0.9,
  },
  streamLinkTripCtaTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  streamLinkTripCtaText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
  streamLinkTripCtaSubtext: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 2,
  },
  streamCorridorVehicleDate: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(99,102,241,0.15)",
    gap: 8,
  },
  streamCorridorVehicleDateItem: {
    flex: 1,
    minWidth: 0,
  },
  streamCorridorVehicleDateItemLeft: { alignItems: "flex-start" },
  streamCorridorVehicleDateItemRight: { alignItems: "flex-end" },
  streamCorridorVehicleDateLabel: {
    fontSize: 4,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 0,
  },
  streamCorridorVehicleDateValue: {
    fontSize: 6,
    fontWeight: "600",
    color: Theme.textPrimary,
    fontStyle: "italic",
  },
  streamCorridorVehicleDateDivider: {
    width: 1,
    height: 14,
    backgroundColor: Theme.borderLight,
  },
  streamExpanded: {
    marginTop: 20,
  },
  streamExpandedCard: {
    backgroundColor: Theme.darkSurface,
    borderRadius: 24,
    padding: 20,
    overflow: "hidden",
  },
  streamExpandedCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  streamExpandedCardLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  streamExpandedCardRoute: {
    fontSize: 13,
    fontWeight: "500",
    fontStyle: "italic",
    letterSpacing: -0.3,
    color: "rgba(255,255,255,0.95)",
    textTransform: "uppercase",
  },
  streamExpandedDownloadBtn: {
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
  },
  streamExpandedDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 12,
  },
  streamExpandedNote: {
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: "rgba(255,255,255,0.65)",
    lineHeight: 16,
  },
  streamSeparator: {
    height: 1,
    marginLeft: TIMELINE_ANCHOR_WIDTH,
    position: "relative",
  },
  streamSeparatorLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: Theme.borderLight,
  },
  streamSeparatorDot: {
    position: "absolute",
    left: 0,
    top: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.screenBackground,
  },
  timelineGauge: {
    marginHorizontal: 12,
    marginBottom: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 40,
    gap: 14,
  },
  timelineGaugeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timelineGaugeDate: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  timelineGaugeSync: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timelineGaugeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.buttonPrimary,
  },
  timelineGaugeSyncText: {
    fontSize: 7,
    fontWeight: "300",
    color: Theme.primary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  timelineGaugeCards: {
    flexDirection: "row",
    gap: 14,
  },
  neuralGaugeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  neuralGaugeCardOut: {
    backgroundColor: "rgba(232,33,39,0.06)",
    borderColor: "rgba(232,33,39,0.15)",
  },
  neuralGaugeCardIn: {
    backgroundColor: "rgba(21,128,61,0.06)",
    borderColor: "rgba(21,128,61,0.15)",
  },
  neuralGaugeRingWrap: {
    width: 40,
    height: 40,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  neuralGaugeSvg: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  neuralGaugeIconWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  neuralGaugeArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  neuralGaugeArrowUp: {
    borderBottomWidth: 8,
    borderBottomColor: Theme.teslaRed,
  },
  neuralGaugeArrowDown: {
    borderTopWidth: 8,
    borderTopColor: Theme.darkGreen,
  },
  neuralGaugeLabelWrap: {
    flex: 1,
    gap: 2,
  },
  neuralGaugeLabel: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  neuralGaugeAmountOut: {
    fontSize: 15,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.teslaRed,
  },
  neuralGaugeAmountIn: {
    fontSize: 15,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.darkGreen,
  },
  timelineCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.screenBackground,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  timelineCardIn: {
    borderColor: Theme.borderLight,
  },
  timelineCardAccentOut: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  timelineCardAccentIn: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(16,185,129,0.15)",
  },
  timelineCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timelineCardLabel: {
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timelineCardAmountOut: {
    fontSize: 12,
    fontWeight: "300",
    color: Theme.teslaRed,
    fontStyle: "italic",
    marginTop: 2,
  },
  timelineCardAmountIn: {
    fontSize: 12,
    fontWeight: "300",
    color: Theme.darkGreen,
    fontStyle: "italic",
    marginTop: 2,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal + 8,
    paddingVertical: Layout.headerPaddingBelowInset,
    backgroundColor: Theme.surface,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  historyActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  headerIconBtn: {
    minWidth: Layout.minTouchTargetSize,
    minHeight: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    padding: (Layout.minTouchTargetSize - 18) / 2,
  },
  title: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textMutedDemo,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  list: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    gap: 0,
  },
  section: {
    marginBottom: 0,
  },
  sectionTimeline: {
    marginTop: 4,
    marginBottom: 2,
    width: "100%",
    alignSelf: "stretch",
    /** Center the constrained day-divider + transaction column reliably on web
     *  (don't rely only on each child's alignSelf inside an embedded parent scroll). */
    alignItems: "center",
  },
  sectionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal + 8,
    backgroundColor: Theme.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
  },
  sectionDateLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 2,
    flexWrap: "wrap",
    gap: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primaryText,
    letterSpacing: 0.2,
  },
  cumulativeBlock: {
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 1,
    maxWidth: "70%",
  },
  cumulativeHint: {
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cumulativeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    columnGap: 4,
    rowGap: 2,
  },
  cumulativePaid: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.negative,
  },
  cumulativeDot: {
    fontSize: 8,
    color: Theme.textMutedDemo,
  },
  cumulativeReceived: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.positive,
  },
  rowWrapper: {
    gap: 4,
    marginBottom: 0,
  },
  rowWrapperTimeline: {
    marginHorizontal: 12,
    marginBottom: 8,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surface,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  rowCardTimeline: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 0,
    gap: 12,
  },
  rowCardTimelineHighlighted: {
    backgroundColor: "transparent",
  },
  timelineCardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineCardAvatarImageWrap: {
    width: 44,
    height: 44,
    borderRadius: 18,
    overflow: "visible",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineCardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  timelineCardParty: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  timelineCardDateVehicle: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  timelineCardRouteWhy: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    marginTop: 3,
    lineHeight: 14,
  },
  rightMetaStack: {
    alignItems: "flex-end",
    gap: 4,
    maxWidth: 118,
  },
  vehiclePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    maxWidth: "100%",
  },
  vehiclePillIcon: {
    opacity: 0.9,
  },
  vehiclePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  tripPillWithCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
  },
  tripPillCheckIcon: {
    opacity: 0.8,
  },
  ribbonWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
  },
  ribbon: {
    flex: 1,
    width: 6,
  },
  ribbonDot: {
    position: "absolute",
    top: 8,
    left: 2.5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  bodyTimeline: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 4,
  },
  timelineLine1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timelinePartyTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    flex: 1,
    minWidth: 0,
  },
  timelineLine2: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
  },
  timelineLine2Date: {
    flex: 1,
    minWidth: 0,
  },
  rowMetaTimeline: {
    fontSize: 9,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    flex: 1,
    minWidth: 0,
    opacity: 0.85,
  },
  tripPillTextOnly: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  tripPillTextOnlyLabel: {
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: "500",
    color: Theme.primary,
    fontStyle: "italic",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  rowCardHighlighted: {
    backgroundColor: Theme.surfaceLight,
    borderColor: Theme.primary,
    shadowOpacity: 0.06,
  },
  rowTouchable: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  avatarWrapTimeline: {
    width: 40,
    height: 40,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  avatarWrapIn: {
    borderColor: Theme.positiveMuted,
  },
  avatarWrapOut: {
    borderColor: Theme.negativeMuted,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  avatarTextTimeline: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  body: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    marginBottom: 1,
  },
  rowDate: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  rowDateTimeline: {
    fontSize: 8,
    fontStyle: "italic",
    letterSpacing: 0.3,
    marginTop: 1,
    color: Theme.textMuted,
  },
  rowMeta: {
    fontSize: 9,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 2,
  },
  rowParty: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textPrimary,
  },
  rowTrip: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
  rightCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    minWidth: 0,
  },
  amountCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 0,
  },
  amountTouchArea: {
    alignSelf: "stretch",
    justifyContent: "center",
    paddingLeft: 2,
  },
  amount: {
    fontSize: 13,
    fontWeight: "500",
  },
  amountItalic: {
    fontStyle: "italic",
  },
  amountIn: {
    color: Theme.darkGreen,
  },
  amountOut: {
    color: Theme.teslaRed,
  },
  tripAssocBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tripAssocBtnLinked: {
    flexDirection: "row",
    width: "auto",
    minWidth: 30,
    maxWidth: 88,
    paddingHorizontal: 6,
    gap: 3,
    borderRadius: 15,
    borderColor: Theme.integratedIcon,
    backgroundColor: Theme.positiveMuted,
  },
  tripAssocLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.integratedIcon,
    maxWidth: 48,
  },
  tripAssocLabelOnly: {
    marginLeft: 4,
  },
  tripAssocLabelMuted: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMutedDemo,
  },
  tripPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tripPillText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.primary,
    fontStyle: "italic",
    letterSpacing: 0.2,
    textTransform: "uppercase",
    maxWidth: 72,
  },
  tripPillLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tripPillLinkText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.primary,
    maxWidth: 56,
  },
  gridFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingTop: 32,
    gap: 10,
    opacity: 0.45,
  },
  gridFooterText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  gridFooterSubtext: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tableCol1: { flex: 5, minWidth: 0 },
  tableCol2: { flex: 1.5, minWidth: 0 },
  tableCol3: { flex: 1.5, minWidth: 0, alignItems: "flex-end" },
  tableCol4: { flex: 1.5, minWidth: 0, alignItems: "flex-end" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingLeft: 20,
    paddingRight: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    position: "relative",
  },
  tableRowRibbon: {
    position: "absolute",
    left: 0,
    top: "50%",
    marginTop: -12,
    width: 3,
    height: 24,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  tableRowRibbonIn: { backgroundColor: Theme.darkGreen },
  tableRowRibbonOut: { backgroundColor: Theme.teslaRed },
  tableCell: {
    paddingHorizontal: 4,
    justifyContent: "center",
    minWidth: 0,
  },
  tableCellParty: {
    fontSize: 11,
    color: Theme.textPrimaryDark,
    marginBottom: 2,
  },
  tableCellMeta: {
    fontSize: 8,
    color: Theme.textMuted,
    marginTop: 2,
    textTransform: "uppercase",
  },
  tableCellAmount: {
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textMuted,
  },
  tableCellAmountOut: { color: Theme.teslaRed },
  tableCellAmountIn: { color: Theme.darkGreen },
  tableMissionPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  tableMissionPillText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.primary,
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  tableExpandedWrap: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "rgba(249,250,254,0.5)",
  },
  tableWrap: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 32,
    overflow: "hidden",
    marginHorizontal: 12,
  },
  linkTripWrap: {
    marginTop: 3,
    marginLeft: 0,
  },
  linkTripBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Theme.surfaceLight ?? "rgba(0,0,0,0.03)",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Theme.borderLight ?? "rgba(0,0,0,0.08)",
  },
  linkTripText: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.primary ?? Theme.teslaRed,
  },
  detailCard: {
    backgroundColor: Theme.surfaceLight ?? "rgba(0,0,0,0.03)",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Theme.borderLight ?? Theme.border,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginLeft: 0,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 1,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    gap: 6,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    minWidth: 60,
  },
  detailValue: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textBody,
    flex: 1,
    textAlign: "right",
  },
  detailValueGreen: {
    color: Theme.positive,
    fontWeight: "500",
  },
  detailValueRed: {
    color: Theme.negative,
    fontWeight: "500",
  },
  detailReconValueWrap: {
    flex: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  detailReconBadge: {
    color: Theme.primary,
    backgroundColor: Theme.primary + "14",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: "700",
  },
  detailReconAction: {
    fontSize: 9,
    color: Theme.textSecondary,
    fontWeight: "600",
    textAlign: "right",
  },
  timelineExpandedWrap: {
    paddingHorizontal: 10,
    paddingTop: 0,
    paddingBottom: 8,
  },
  timelineExpandedOuter: {
    backgroundColor: "#F8FAFC",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  timelineExpandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: Theme.darkSurface,
  },
  timelineExpandedHeaderText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timelineExpandedInner: {
    padding: 20,
    gap: 16,
  },
  timelineExpandedRow2: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    paddingBottom: 14,
  },
  timelineExpandedHalf: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  timelineExpandedHalfRight: {
    alignItems: "flex-end",
  },
  timelineExpandedLabel: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timelineExpandedValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  timelineExpandedValueItalic: {
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  timelineExpandedValueGreen: {
    color: Theme.darkGreen,
    fontWeight: "500",
  },
  timelineExpandedValueRed: {
    color: Theme.teslaRed,
    fontWeight: "500",
  },
  timelineExpandedGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  timelineExpandedNoteBlock: {
    gap: 4,
  },
  timelineExpandedMissionBlock: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginTop: 4,
    padding: 0,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineExpandedMissionInner: {
    gap: 0,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
  },
  timelineExpandedTxDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 10,
    marginHorizontal: 0,
  },
  timelineExpandedTxTitle: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  timelineExpandedTxList: {
    gap: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  timelineExpandedTxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    gap: 10,
  },
  timelineExpandedTxRowLast: {
    borderBottomWidth: 0,
  },
  timelineExpandedTxRowHighlighted: {
    backgroundColor: Theme.surfaceGray,
  },
  timelineExpandedTxIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineExpandedTxIconIn: {
    backgroundColor: Theme.positiveMuted,
  },
  timelineExpandedTxIconOut: {
    backgroundColor: "rgba(232, 33, 39, 0.15)",
  },
  timelineExpandedTxBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  timelineExpandedTxLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  timelineExpandedTxSub: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  timelineExpandedTxAmount: {
    fontSize: 12,
    fontWeight: "700",
  },
  timelineExpandedTxAmountIn: {
    color: Theme.darkGreen,
  },
  timelineExpandedTxAmountOut: {
    color: Theme.teslaRed,
  },
  timelineExpandedMissionHeader: {
    backgroundColor: Theme.darkSurface,
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  timelineExpandedMissionHeaderText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timelineExpandedMissionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingVertical: 10,
    marginBottom: 0,
    gap: 12,
  },
  timelineExpandedMissionLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  timelineExpandedMissionValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  timelineExpandedExportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    marginTop: 12,
    backgroundColor: Theme.darkSurface,
    borderRadius: 10,
    borderWidth: 0,
  },
  timelineExpandedExportText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
