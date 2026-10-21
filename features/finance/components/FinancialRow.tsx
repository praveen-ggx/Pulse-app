/**
 * Single table row for Treasury Financial Summary — matches demo2 FinancialRow.
 *
 * Column flex is defined in features/finance/constants/tableColumns.ts (single source of truth);
 * headers in FinanceScreen.styles use the same constants so columns align.
 *
 * Ledger:     PARTY/ITEM 35% | TRIP/ROUTE 20% | RECEIVED 22.5% | PAID 22.5% | chevron 22px
 * Customers:  ENTITY 34% | TRIPS 12% | BILLED 18% | COLLECTED 18% | TO COLLECT 18%
 * Suppliers:  ENTITY 34% | TRIPS 12% | SOURCED 18% | PAID 18% | DUE 18%
 * Drivers:    DRIVER 32% | TRIPS 12% | EARNINGS 18.5% | PAID 18.5% | DUE 19%
 */
import Theme from "@/constants/Theme";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import { EntityIdentityAvatar } from "@/components/EntityIdentityAvatar";
import { PartyAvatar } from "@/components/PartyAvatar";
import { resolveFinancialRowPartyIdentity } from "@/lib/entityIdentity";
import { useLanguage } from "@/contexts/LanguageContext";
import { CUSTOMERS_SUPPLIERS, DRIVERS, LEDGER } from "@/features/finance/constants/tableColumns";
import { formatIndianVehicleNumber } from "@/lib/format";
import { partyAvatarInitialsTextColor } from "@/lib/partyAvatarDisplay";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LedgerExpandedCard } from "./LedgerExpandedCard";

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

/** Initials from party/name (max 2 chars, uppercase). */
function initials(name: string): string {
  const t = (name ?? "").trim();
  if (!t) return "—";
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2)
    return (words[0][0] + words[words.length - 1][0]).toUpperCase().slice(0, 2);
  return t.slice(0, 2).toUpperCase();
}

function avatarColor(str: string): string {
  let n = 0;
  for (let i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function formatNum(n: number): string {
  return n.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

/** Format number with minus sign when negative (e.g. -5,000) */
function formatNumSigned(n: number): string {
  const absStr = formatNum(Math.abs(n));
  return n < 0 ? `-${absStr}` : absStr;
}

/** Animated status dot (right-aligned in row): green = online/on_trip/available, red = offline. Exported for use in Garage vehicle column. */
export function DriverStatusDot({ status }: { status: string }) {
  const isOnline =
    status.toLowerCase() === "online" ||
    status.toLowerCase() === "on_trip" ||
    status.toLowerCase() === "available";
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(isOnline ? 1 : 0.6, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
  }, [isOnline, scale, opacity]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <Animated.View
      style={[
        styles.driverStatusDot,
        isOnline ? styles.driverStatusDotOnline : styles.driverStatusDotOffline,
        animatedStyle,
      ]}
      accessibilityLabel={
        status.toLowerCase() === "on_trip"
          ? "On trip"
          : status.toLowerCase() === "available"
            ? "Available"
            : isOnline
              ? "Online"
              : "Offline"
      }
    />
  );
}

/** Format transaction_date for ledger row: "01 Mar 26, 09:00 AM" */
function formatLedgerDateTime(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const day = d.getDate();
    const month = d.toLocaleString("en-IN", { month: "short" });
    const year = String(d.getFullYear()).slice(-2);
    const time = d.toLocaleString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${day} ${month} ${year}, ${time}`;
  } catch {
    return "—";
  }
}

export type FinancialRowType =
  | "ledger"
  | "customers"
  | "suppliers"
  | "garage"
  | "drivers";

/** Trip detail shown in SOURCE cell and expanded card. Extracted for reuse (e.g. LedgerExpandedCard). */
export interface FinancialRowTripDetail {
  trip_number: string;
  drop_location?: string;
  pickup_area?: string;
  client_name?: string;
  pickup_date?: string | null;
  vehicle_number?: string | null;
  client_price?: number | null;
  supplier_rate?: number | null;
  driver_commission?: number | null;
  supplier_id?: string | null;
}

/**
 * Single row data for all tabs. For stricter typing per tab, consider narrowing
 * with the `type` prop (e.g. when type === "ledger", data has ledger-specific fields).
 */
export interface FinancialRowData {
  profileImageUrl?: string | null;
  /** Drivers: preset when no profileImageUrl (PartyAvatar / driver seed). */
  avatarSeed?: string | null;
  /** Supplier-lane subtype. DCO keeps contact_type=dco and must not open supplier detail. */
  counterpartyKind?: "supplier" | "dco";
  /** Ledger client/supplier: linked org logo / seed (before contact avatar). */
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  id: string;
  name?: string;
  /** Ledger: category // desc; garage: model; drivers: status */
  subline?: string;
  /** Ledger: linked trip id for navigation */
  tripId?: string | null;
  /** Ledger: display trip number (e.g. TRP001) */
  msn?: string | null;
  /** Ledger: when trip is selected, optional detail to show in SOURCE cell */
  tripDetail?: FinancialRowTripDetail | null;
  /** Ledger: party type so expanded card shows correct statement */
  ledgerPartyType?: "client" | "supplier" | "driver" | "vehicle" | null;
  /** Ledger: entry transaction date for expand detail */
  transaction_date?: string | null;
  /** Ledger: vehicle number to show in entity when present */
  vehicleNumber?: string | null;
  /** Ledger: driver name for trip/expense */
  driverName?: string | null;
  category?: string;
  desc?: string;
  in?: number;
  out?: number;
  /** Customers */
  received?: number;
  pending?: number;
  billed?: number;
  trips?: number;
  /** Suppliers */
  due?: number;
  sourced?: number;
  payables?: number;
  /** Garage */
  model?: string;
  sales?: number;
  expense?: number;
  status?: string;
  /** Drivers */
  paid?: number;
  rating?: number | null;
  ratingCount?: number;
  /** Customers/Suppliers/Drivers */
  is_integrated?: boolean | null;
  linked_organization_id?: string | null;
  /** Ledger-specific: counterparty (client/supplier) integration status resolved from clientById/supplierById. */
  counterpartyIntegrated?: boolean | null;
  /** Ledger-specific: counterparty entity id (client/supplier) for opening Compare & Verify. */
  counterpartyId?: string | null;
  contactPercent?: number | null;
  contactPerson?: string | null;
  transactionTypeLabel?: string | null;
  paymentMode?: string | null;
  paymentReference?: string | null;
  reconciliationStatus?: "match_found" | "reconciled" | "mismatch" | null;
  reconciliationLabel?: string | null;
  reconciliationActionLabel?: string | null;
  reconciliationHelperText?: string | null;
  left_at?: string | null;
  tripPaymentSummary?: {
    received: number;
    paid: number;
    entryCount: number;
  } | null;
  sameTripTransactions?: Array<{
    id: string;
    date: string;
    typeLabel: string;
    in: number;
    out: number;
    party: string;
  }> | null;
}

/** Shared date/aging helpers for LedgerExpandedCardFromData and FinancialRow. */
function formatDateForExpanded(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const [y, m, day] = iso.slice(0, 10).split("-");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mi = parseInt(m, 10) - 1;
    return mi >= 0 && mi < 12 ? `${day} ${monthNames[mi]} ${y}` : iso.slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

function getAgingLabelForExpanded(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    const entry = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    entry.setHours(0, 0, 0, 0);
    const diffMs = today.getTime() - entry.getTime();
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (days < 0) return `In ${-days} days`;
    if (days === 0) return "Today";
    if (days === 1) return "1 day ago";
    if (days <= 30) return `${days} days ago`;
    if (days <= 365) return `${Math.floor(days / 30)} mo ago`;
    return `${Math.floor(days / 365)} yr ago`;
  } catch {
    return "—";
  }
}

/** Renders LedgerExpandedCard from FinancialRowData. Used by table row expand and transaction list expand. */
export function LedgerExpandedCardFromData({
  data,
  onDownloadPress,
  onOpenCompareVerify: onOpenCompareVerifyProp,
  enableDesktopThreeColumn = false,
}: {
  data: FinancialRowData;
  onDownloadPress?: () => void;
  onOpenCompareVerify?: () => void;
  enableDesktopThreeColumn?: boolean;
}) {
  const router = useRouter();
  const defaultOpenCompareVerify = useCallback(() => {
    const partyType = data.ledgerPartyType ?? null;
    const tripId = data.tripId ?? null;
    const entityId = data.counterpartyId ?? null;
    if (
      !tripId ||
      !entityId ||
      (partyType !== "client" && partyType !== "supplier")
    ) {
      return;
    }
    router.push({
      pathname: `/trip-ledger/${encodeURIComponent(tripId)}`,
      params: {
        entityType: partyType === "client" ? "CLIENT" : "SUPPLIER",
        entityId,
        partyName: data.name ?? "",
      },
    } as never);
  }, [data.ledgerPartyType, data.tripId, data.counterpartyId, data.name, router]);
  const onOpenCompareVerify = onOpenCompareVerifyProp ?? (data.counterpartyIntegrated ? defaultOpenCompareVerify : undefined);
  const hasTripDetail = data.tripDetail != null;
  const tripDateStr = hasTripDetail ? formatDateForExpanded(data.tripDetail!.pickup_date) : "";
  const hasTripDate = tripDateStr !== "" && tripDateStr !== "—";
  const routeStr = hasTripDetail
    ? [data.tripDetail!.pickup_area, data.tripDetail!.drop_location].filter(Boolean).join(" → ")
    : "";
  const hasRoute = routeStr !== "";
  const clientStr = (hasTripDetail && data.tripDetail!.client_name?.trim()) ?? "";
  const hasClient = clientStr !== "";
  const hasEntryDate = (data.transaction_date ?? "").trim().length > 0;
  const paymentIn = data.in ?? 0;
  const paymentOut = data.out ?? 0;
  const hasNote = (data.desc ?? "").trim() !== "";
  const summary = data.tripPaymentSummary;
  const hasTripSummary = summary != null && (summary.received > 0 || summary.paid > 0);
  const hasAnyPayment = paymentIn > 0 || paymentOut > 0 || hasNote || hasTripSummary;
  const hasMergedDetails =
    (data.transactionTypeLabel ?? "").trim() !== "" ||
    hasEntryDate ||
    hasAnyPayment ||
    ((data.vehicleNumber ?? "").trim() !== "" && !hasTripDetail);

  const truckStr =
    (hasTripDetail ? (data.tripDetail!.vehicle_number ?? data.vehicleNumber) : data.vehicleNumber) ?? "";
  const driverStr = (data.driverName ?? "").trim();
  const partyType = data.ledgerPartyType ?? null;
  const tripSaleValue =
    hasTripDetail && data.tripDetail?.client_price != null ? Number(data.tripDetail.client_price) : 0;
  const tripSupplierCost =
    hasTripDetail && data.tripDetail?.supplier_rate != null ? Number(data.tripDetail.supplier_rate) : 0;
  const tripDriverCommission =
    hasTripDetail && data.tripDetail?.driver_commission != null ? Number(data.tripDetail.driver_commission) : 0;
  const hasReceivables = tripSaleValue > 0;
  const hasPayables = tripSupplierCost > 0;
  const hasDriverCommission = tripDriverCommission > 0;
  const receivedSum = summary?.received ?? 0;
  const paidSum = summary?.paid ?? 0;
  const receivablesDueRaw = hasReceivables ? tripSaleValue - receivedSum : 0;
  const payablesDueRaw = hasPayables ? tripSupplierCost - paidSum : 0;
  const driverDueRaw = hasDriverCommission ? tripDriverCommission - paidSum : 0;
  const payablesCostDisplay = hasPayables ? tripSupplierCost - paidSum : 0;
  const vehicleCostDisplay = hasPayables ? tripSupplierCost - paidSum : 0;
  const sameTx = data.sameTripTransactions ?? [];
  const hasSameTx = sameTx.length > 0;
  const showReceivablesRow =
    (partyType === "client" || partyType === null) && (hasReceivables || (hasTripSummary && summary));
  const showPayablesRow =
    (partyType === "supplier" || partyType === null) && (hasPayables || (hasTripSummary && summary));
  const showDriverRow =
    partyType === "driver" && (hasDriverCommission || (hasTripSummary && summary));
  const showVehicleRow =
    partyType === "vehicle" && (hasPayables || (hasTripSummary && summary));

  const expandedTripNumber = hasTripDetail
    ? (data.tripDetail!["trip_number"] ?? data.msn ?? "—")
    : "—";
  const expandedRouteStr = typeof routeStr === "string" ? routeStr : "";
  const expandedClientStr = typeof clientStr === "string" ? clientStr : "";

  return (
    <LedgerExpandedCard
      transactionTypeLabel={data.transactionTypeLabel}
      transactionDate={data.transaction_date}
      formattedDate={formatDateForExpanded(data.transaction_date)}
      agingLabel={getAgingLabelForExpanded(data.transaction_date)}
      paymentIn={paymentIn}
      paymentOut={paymentOut}
      note={data.desc}
      paymentMode={data.paymentMode}
      paymentReference={data.paymentReference}
      reconciliationLabel={data.reconciliationLabel}
      reconciliationActionLabel={data.reconciliationActionLabel}
      reconciliationHelperText={data.reconciliationHelperText}
      hasMergedDetails={hasMergedDetails}
      tripNumber={expandedTripNumber}
      tripDateStr={tripDateStr}
      hasTripDate={hasTripDate}
      routeStr={expandedRouteStr}
      hasRoute={hasRoute}
      clientStr={expandedClientStr}
      hasClient={hasClient}
      truckStr={truckStr}
      driverStr={driverStr}
      partyType={partyType}
      tripSaleValue={tripSaleValue}
      tripSupplierCost={tripSupplierCost}
      isAggregateTrip={
        hasTripDetail &&
        data.tripDetail!.supplier_id != null &&
        String(data.tripDetail!.supplier_id).trim() !== ""
      }
      tripDriverCommission={tripDriverCommission}
      receivedSum={receivedSum}
      paidSum={paidSum}
      receivablesDueRaw={receivablesDueRaw}
      payablesDueRaw={payablesDueRaw}
      payablesCostDisplay={payablesCostDisplay}
      driverDueRaw={driverDueRaw}
      vehicleCostDisplay={vehicleCostDisplay}
      showReceivablesRow={Boolean(showReceivablesRow)}
      showPayablesRow={Boolean(showPayablesRow)}
      showDriverRow={Boolean(showDriverRow)}
      showVehicleRow={Boolean(showVehicleRow)}
      sameTripTransactions={sameTx}
      hasSameTx={hasSameTx}
      summary={summary ?? null}
      hasTripSummary={Boolean(summary && (summary.received > 0 || summary.paid > 0))}
      hasTripDetail={hasTripDetail}
      formatNumFn={formatNum}
      formatNumSignedFn={formatNumSigned}
      highlightTransactionId={data.id}
      onDownloadPress={onDownloadPress}
      counterpartyIntegrated={data.counterpartyIntegrated}
      onOpenCompareVerify={onOpenCompareVerify}
      enableDesktopThreeColumn={enableDesktopThreeColumn}
    />
  );
}

interface FinancialRowProps {
  type: FinancialRowType;
  data: FinancialRowData;
  onSelect?: (data: FinancialRowData) => void;
  /** Ledger only: when provided, tapping the entity (party name) cell calls this instead of onSelect. */
  onEntityPress?: (data: FinancialRowData) => void;
  /** Ledger only: when set, only one row can be expanded at a time (controlled). Id of the expanded row or null. */
  expandedRowId?: string | null;
  /** Ledger only: called when user toggles expansion. Use with expandedRowId for single-expand behavior. */
  onExpandedChange?: (id: string | null) => void;
  /**
   * Ledger only: web desktop three-column expanded detail (Ledger | Trip | History).
   * Use on party-detail overlays only — main Finance ledger rows stay stacked.
   */
  ledgerExpandedDesktopThreeColumn?: boolean;
}

export function FinancialRow({
  type,
  data,
  onSelect,
  onEntityPress,
  expandedRowId,
  onExpandedChange,
}: FinancialRowProps) {
  const { t } = useLanguage();
  const [expandedInternal] = useState(false);
  const isControlled =
    type === "ledger" && expandedRowId !== undefined && onExpandedChange != null;
  const expanded =
    type === "ledger" && isControlled ? data.id === expandedRowId : expandedInternal;

  /** Drivers tab: line 1 = driver name (never empty); line 2 = vehicle number. */
  const driverNameLine =
    type === "drivers"
      ? data.name != null && String(data.name).trim() !== ""
        ? String(data.name).trim()
        : "Driver"
      : null;
  const nodeMain =
    driverNameLine != null ? driverNameLine : (data.name ?? data.id ?? "—");
  /** Customers/suppliers initials pill (same hash palette as PartyAvatar). */
  const custSupInitialsBg = avatarColor(nodeMain ?? "—");
  const nodeSub =
    type === "ledger"
      ? data.subline != null && data.subline !== ""
        ? data.subline
        : data.vehicleNumber
          ? `${formatIndianVehicleNumber(data.vehicleNumber)} · ${data.category || "GENERAL"} // ${data.desc || ""}`
          : `${data.category || "GENERAL"} // ${data.desc || ""}`
      : type === "garage"
        ? data.model
        : type === "drivers"
          ? (data.vehicleNumber ? formatIndianVehicleNumber(data.vehicleNumber) : "—")
          : (type === "customers" || type === "suppliers") && data.is_integrated != null
            ? type === "customers" && data.contactPercent != null
              ? `${data.contactPercent}%`
              : ""
            : "SECURE NODE";

  const hasTrip =
    type === "ledger" && (data.tripId || (data.msn && data.msn !== "General"));
  const showSourceAsNa = type === "ledger" && !hasTrip;

  const tripDetailLine =
    type === "ledger" && data.tripDetail
      ? (() => {
          const d = data.tripDetail;
          if (d.pickup_area && d.drop_location)
            return `${d.pickup_area} → ${d.drop_location}`;
          if (d.drop_location) return d.drop_location;
          if (d.client_name) return d.client_name;
          return null;
        })()
      : null;

  const tripDateLine =
    type === "ledger" && data.tripDetail?.pickup_date
      ? (() => {
          try {
            const d = new Date(data.tripDetail.pickup_date);
            if (isNaN(d.getTime())) return data.tripDetail.pickup_date ?? null;
            return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
          } catch {
            return data.tripDetail.pickup_date ?? null;
          }
        })()
      : null;

  let missionLabel = "";
  if (type === "ledger") {
    const msn = data.msn || "General";
    missionLabel = msn === "General" ? "No trip" : msn;
  } else if (type === "customers") {
    missionLabel = ""; // BILLED shown in second column as amount, not label
  } else if (type === "suppliers") {
    missionLabel = `${data.sourced ?? data.trips ?? 0} SOURCED`;
  } else if (type === "garage") {
    missionLabel = data.status ?? "—";
  } else if (type === "drivers") {
    missionLabel = data.status ?? "OFFLINE";
  } else {
    missionLabel = "ACTIVE";
  }

  let creditStr = "—";
  if (type === "ledger") {
    creditStr = (data.in ?? 0) > 0 ? formatNum(data.in!) : "—";
  } else if (type === "customers") {
    creditStr = (data.received ?? 0) > 0 ? formatNum(data.received!) : "—";
  } else if (type === "suppliers") {
    creditStr = (data.paid ?? 0) > 0 ? formatNum(data.paid!) : "—";
  } else if (type === "garage") {
    creditStr = (data.sales ?? 0) > 0 ? formatNum(data.sales!) : "—";
  } else if (type === "drivers") {
    creditStr = (data.due ?? 0) > 0 ? formatNum(data.due!) : "—"; // Earnings (total commission)
  }

  /** Drivers: middle column = Paid */
  let paidStr = "—";
  if (type === "drivers") {
    paidStr = (data.paid ?? 0) > 0 ? formatNum(data.paid!) : "—";
  }

  let debitStr = "—";
  let showCollectedBadge = false;
  let showPaidBadge = false;
  let showOverCollectedBadge = false;
  let showOverPaidBadge = false;
  if (type === "ledger") {
    debitStr = (data.out ?? 0) > 0 ? formatNum(data.out!) : "—";
  } else if (type === "customers") {
    const pending = data.pending ?? 0;
    const billed = data.billed ?? 0;
    const received = data.received ?? 0;
    if (billed > 0 && received > billed) {
      showOverCollectedBadge = true;
      debitStr = "";
    } else if (billed > 0 && pending === 0) {
      showCollectedBadge = true;
      debitStr = "";
    } else if (pending > 0) {
      debitStr = formatNum(pending);
    }
  } else if (type === "suppliers") {
    const due = data.due ?? 0;
    const payables = data.payables ?? 0;
    const paid = data.paid ?? 0;
    if (payables > 0 && paid > payables) {
      showOverPaidBadge = true;
      debitStr = "";
    } else if (payables > 0 && due === 0) {
      showPaidBadge = true;
      debitStr = "";
    } else if (due > 0) {
      debitStr = formatNum(due);
    }
  } else if (type === "garage") {
    debitStr = (data.expense ?? 0) > 0 ? formatNum(data.expense!) : "—";
  } else if (type === "drivers") {
    debitStr = (data.pending ?? 0) > 0 ? formatNum(data.pending!) : "—"; // Due (balance to pay)
  }

  const showIntegrationIcon =
    (type === "customers" || type === "suppliers" || type === "drivers") &&
    data.is_integrated != null;
  /** Customers/suppliers: always use "contact left, badge right" row; drivers keep icon+label only. */
  const useContactLeftBadgeRight =
    showIntegrationIcon && (type === "customers" || type === "suppliers");
  const contactLabel = useContactLeftBadgeRight
    ? ((data.contactPerson ?? '').trim() || '—')
    : '';
  /** Ledger: show integration icon on name row when present (e.g. from contact_type/contact_id). */
  const showLedgerIntegrationIcon = type === "ledger" && data.is_integrated != null;
  const ledgerReconBadgeStyle =
    data.reconciliationStatus === "reconciled"
      ? styles.ledgerReconBadgeReconciled
      : data.reconciliationStatus === "mismatch"
        ? styles.ledgerReconBadgeMismatch
        : styles.ledgerReconBadgeMatch;
  const ledgerReconTextStyle =
    data.reconciliationStatus === "reconciled"
      ? styles.ledgerReconBadgeTextReconciled
      : data.reconciliationStatus === "mismatch"
        ? styles.ledgerReconBadgeTextMismatch
        : styles.ledgerReconBadgeTextMatch;
  const ledgerPartyIdentity =
    type === "ledger" ? resolveFinancialRowPartyIdentity(data) : null;

  /** Ledger collapsed row: avatar + name / category / date in one aligned column. */
  const ledgerEntityLines =
    type === "ledger" ? (
      <View style={styles.ledgerEntityRow}>
        {ledgerPartyIdentity ? (
          <EntityIdentityAvatar
            identity={ledgerPartyIdentity}
            size="sm"
            showIntegrationBadge
          />
        ) : showLedgerIntegrationIcon ? (
          <View style={styles.ledgerEntityIconSlot}>
            <FontAwesome
              name={data.is_integrated ? 'link' : 'unlink'}
              size={9}
              color={data.is_integrated ? Theme.integratedIcon : Theme.nonIntegratedIcon}
            />
          </View>
        ) : null}
        <View style={styles.ledgerEntityTextCol}>
          <Text style={styles.cellNodeMain} numberOfLines={1} ellipsizeMode="tail">
            {data.name ?? data.id ?? "—"}
          </Text>
          <Text style={styles.cellNodeSubCategory} numberOfLines={1} ellipsizeMode="tail">
            {(data.category ?? "GENERAL").toUpperCase()}
          </Text>
          {data.reconciliationLabel ? (
            <View style={styles.ledgerReconRow}>
              <View style={[styles.ledgerReconBadge, ledgerReconBadgeStyle]}>
                <Text
                  style={[styles.ledgerReconBadgeText, ledgerReconTextStyle]}
                  numberOfLines={1}
                >
                  {data.reconciliationLabel.toUpperCase()}
                </Text>
              </View>
              {data.reconciliationActionLabel ? (
                <Text
                  style={styles.ledgerReconActionText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {data.reconciliationActionLabel}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Text
            style={styles.cellNodeSubDate}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {formatLedgerDateTime(data.transaction_date)}
          </Text>
        </View>
      </View>
    ) : null;

  /** Drivers tab: red = disconnected (left_at set), green = ACTIVE, grey = offline/other */
  const driverStatusDotColor =
    type === "drivers"
      ? data.left_at
        ? Theme.negative
        : data.status === "ACTIVE"
          ? Theme.positive
          : data.status === "DISCONNECTED"
            ? Theme.negative
            : Theme.textMuted
      : Theme.textMuted;

  const entityCellContent = (
    <View style={[styles.cellNode, (type === "customers" || type === "suppliers") && styles.cellNodeCust, type === "drivers" && styles.cellNodeDriver]}>
      {type === "ledger" ? (
        ledgerEntityLines
      ) : type === "drivers" ? (
        <View style={styles.driverCellWithDot}>
          <View style={styles.driverAvatarWithStatus}>
            <PartyAvatar
              name={(nodeMain ?? data.name ?? "—").trim() || "—"}
              avatarUrl={(data.profileImageUrl ?? "").trim() || null}
              avatarSeed={(data.avatarSeed ?? "").trim() || null}
              entityType="driver"
              size={24}
            />
            <View
              style={[
                styles.driverStatusDot,
                { backgroundColor: driverStatusDotColor },
              ]}
              accessibilityLabel={data.left_at ? "Disconnected" : (data.status ?? "OFFLINE")}
            />
          </View>
          <View style={styles.driverCellTextWrap}>
            <View style={styles.driverCellNameWrap}>
              <Text style={styles.cellNodeMainDriver} numberOfLines={1} ellipsizeMode="tail">
                {nodeMain ?? "—"}
              </Text>
              {data.vehicleNumber ? (
                <Text style={[styles.cellNodeSub, styles.cellNodeSubStandalone]} numberOfLines={1} ellipsizeMode="tail">
                  {formatIndianVehicleNumber(data.vehicleNumber)}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.cellNodeMainRow}>
            {data.profileImageUrl ? (
              <Image source={{ uri: data.profileImageUrl }} style={styles.profileImage} />
            ) : (
              showIntegrationIcon ? (
                <View style={styles.cellNodeSubIntegrationIconWrap}>
                  <FontAwesome
                    name={data.is_integrated ? 'link' : 'unlink'}
                    size={9}
                    color={data.is_integrated ? Theme.integratedIcon : Theme.nonIntegratedIcon}
                  />
                </View>
              ) : (
                <View
                  style={[
                    styles.initialsAvatar,
                    { backgroundColor: custSupInitialsBg },
                  ]}
                >
                  <Text
                    style={[
                      styles.initialsText,
                      { color: partyAvatarInitialsTextColor(custSupInitialsBg) },
                    ]}
                  >
                    {initials(nodeMain ?? "—")}
                  </Text>
                </View>
              )
            )}
            <Text style={styles.cellNodeMain} numberOfLines={1} ellipsizeMode="tail">
              {nodeMain ?? "—"}
            </Text>
          </View>
          {showIntegrationIcon ? (
            <View style={styles.cellNodeSubRow}>
              {useContactLeftBadgeRight ? (
                <>
                  <View style={styles.cellNodeSubContactRow}>
                    <View style={styles.cellNodeSubContactIconWrap}>
                      <FontAwesome
                        name="user"
                        size={8}
                        color={Theme.textSecondary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.cellNodeSub,
                        styles.cellNodeSubContact,
                        contactLabel === '—' && styles.cellNodeSubPlaceholder,
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {contactLabel}
                    </Text>
                  </View>
                  {nodeSub ? (
                    <Text style={styles.cellNodeSub} numberOfLines={1} ellipsizeMode="tail">
                      {nodeSub}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.cellNodeSub} numberOfLines={1} ellipsizeMode="tail">
                  {nodeSub}
                </Text>
              )}
            </View>
          ) : (
            <Text style={[styles.cellNodeSub, styles.cellNodeSubStandalone]} numberOfLines={1} ellipsizeMode="tail">
              {nodeSub}
            </Text>
          )}
        </>
      )}
    </View>
  );


  const content = (
    <>
      {type === "ledger" && onEntityPress ? (
        <TouchableOpacity
          style={styles.cellNode}
          onPress={() => onEntityPress(data)}
          activeOpacity={0.7}
          accessibilityLabel={`Filter by ${data.name ?? data.id ?? "—"}`}
          accessibilityRole="button"
        >
          {ledgerEntityLines}
        </TouchableOpacity>
      ) : (
        entityCellContent
      )}
      {(type === "customers" || type === "suppliers" || type === "drivers") && (
        <View
          style={[
            styles.cellTripsCust,
            type === "drivers" && styles.cellTripsDriver,
            styles.cellBorderLeft,
          ]}
        >
          <Text style={styles.cellTripsText} numberOfLines={1}>
            {data.trips ?? 0}
          </Text>
        </View>
      )}
      {type !== "drivers" && (
      <View
        style={[
          styles.cellMission,
          styles.cellBorderLeft,
          type === "ledger" && styles.cellMissionLedger,
          type === "customers" && styles.cellMissionAmount,
          (type === "customers" || type === "suppliers") && styles.cellMissionCust,
        ]}
      >
        {type === "customers" ? (
          <Text style={styles.creditText} numberOfLines={1}>
            {(data.billed ?? 0) > 0 ? formatNum(data.billed!) : "—"}
          </Text>
        ) : type === "suppliers" ? (
          <Text style={styles.creditText} numberOfLines={1}>
            {(data.payables ?? 0) > 0 ? formatNum(data.payables!) : "—"}
          </Text>
        ) : showSourceAsNa ? (
          <Text style={styles.cellSourceNa} numberOfLines={1}>
            NA
          </Text>
        ) : hasTrip ? (
          <View style={styles.cellSourceBlock}>
            {missionLabel !== "Trip" && missionLabel !== "General" && (
              <Text style={styles.cellSourceTextWrap} numberOfLines={2}>
                {missionLabel}
              </Text>
            )}
            {tripDetailLine ? (
              <Text style={styles.cellSourceDetailWrap} numberOfLines={2}>
                {tripDetailLine}
              </Text>
            ) : missionLabel === "Trip" || missionLabel === "General" ? (
              <Text style={styles.cellSourceNa} numberOfLines={1}>
                —
              </Text>
            ) : (
              <Text style={styles.cellSourceTextWrap} numberOfLines={2}>
                {missionLabel}
              </Text>
            )}
            {tripDateLine ? (
              <Text style={styles.cellSourceDateRow} numberOfLines={1}>
                {tripDateLine}
              </Text>
            ) : null}
            {type === "ledger" && data.vehicleNumber ? (
              <View style={styles.cellSourceVehicleBadge}>
                <FontAwesome name="truck" size={10} color={Theme.primary} />
                <Text style={styles.cellSourceVehicleText} numberOfLines={1}>
                  {formatIndianVehicleNumber(data.vehicleNumber)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={styles.cellSourceText} numberOfLines={1}>
            {missionLabel}
          </Text>
        )}
      </View>
      )}
      {(type === "drivers"
        ? (
          <>
            <View style={[styles.cellAmount, styles.cellBorderLeft, styles.cellAmountDriverEarnings]}>
              <Text style={styles.creditText} numberOfLines={1}>
                {creditStr}
              </Text>
            </View>
            <View style={[styles.cellAmount, styles.cellBorderLeft, styles.cellAmountDriverPaid]}>
              <Text style={styles.creditText} numberOfLines={1}>
                {paidStr}
              </Text>
            </View>
            <View style={[styles.cellAmount, styles.cellBorderLeft, styles.cellLastColumn, styles.cellAmountDriverDue]}>
              <Text style={styles.debitText} numberOfLines={1}>
                {debitStr}
              </Text>
            </View>
          </>
        )
        : (
          <>
            <View style={[styles.cellAmount, styles.cellBorderLeft, (type === "customers" || type === "suppliers") && styles.cellAmountCust]}>
              <Text style={styles.creditText} numberOfLines={1}>
                {creditStr}
              </Text>
            </View>
            <View style={[styles.cellAmount, styles.cellBorderLeft, styles.cellLastColumn, (type === "customers" || type === "suppliers") && styles.cellAmountCust]}>
              {showOverCollectedBadge ? (
                <View style={styles.statusBadgeOver}>
                  <Text style={styles.statusBadgeOverText} numberOfLines={1}>{t("overCollected")}</Text>
                </View>
              ) : showOverPaidBadge ? (
                <View style={styles.statusBadgeOver}>
                  <Text style={styles.statusBadgeOverText} numberOfLines={1}>{t("overPaid")}</Text>
                </View>
              ) : showCollectedBadge ? (
                <View style={styles.statusBadgeCollected}>
                  <Text style={styles.statusBadgeText} numberOfLines={1}>{t("collected")}</Text>
                </View>
              ) : showPaidBadge ? (
                <View style={styles.statusBadgePaid}>
                  <Text style={styles.statusBadgeText} numberOfLines={1}>{t("paid")}</Text>
                </View>
              ) : (
                <Text style={styles.debitText} numberOfLines={1}>
                  {debitStr}
                </Text>
              )}
            </View>
          </>
        )
      )}
      {type === "ledger" && (
        <View style={styles.rowActionHint}>
          <FontAwesome
            name={expanded ? "chevron-down" : "chevron-right"}
            size={10}
            color={Theme.textMutedDemo}
          />
        </View>
      )}
    </>
  );

  if (type === "ledger") {
    return (
      <View style={styles.ledgerRowWrapper}>
        <Pressable
          style={(state: HoverPressState) => [
            styles.row,
            styles.rowLedger,
            WEB_POINTER,
            WEB_TRANSITION,
            isHovered(state) && [styles.rowPressed, hoverRowWash],
          ]}
          onPress={() => onSelect?.(data)}
          android_ripple={undefined}
        >
          {content}
        </Pressable>
      </View>
    );
  }

  if (onSelect) {
    return (
      <Pressable
        style={(state: HoverPressState) => [
          styles.row,
          type === "drivers" && styles.rowDrivers,
          WEB_POINTER,
          WEB_TRANSITION,
          isHovered(state) && [styles.rowPressed, hoverRowWash],
        ]}
        onPress={() => onSelect(data)}
        android_ripple={undefined}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.row, type === "drivers" && styles.rowDrivers]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Row height: matches customers table (2 lines: name + sub). */
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 0,
    paddingHorizontal: 0,
    height: 44,
    borderBottomWidth: 0.5,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    minWidth: 0,
  },
  rowPressed: {
    backgroundColor: Theme.surface,
  },
  /** Ledger: taller row so trip/route column can show 2 lines. */
  rowLedger: {
    minHeight: 52,
    height: 52,
  },
  /** Drivers: enough height for driver name (line 1) + vehicle number (line 2). */
  rowDrivers: {
    minHeight: 52,
    height: 52,
  },
  cellNode: {
    flex: LEDGER.node,
    minWidth: 0,
    paddingLeft: 0,
    paddingRight: 8,
    paddingVertical: 8,
    justifyContent: "center",
  },
  /** Column divider — table grid (full-height line) */
  cellBorderLeft: {
    borderLeftWidth: 0.5,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 8,
    justifyContent: "center",
  },
  /** Customers/Suppliers: ENTITY 30 | TRIPS 10 | SALES 20 | COLLECTED/PAID 20 | TO COLLECT/TO PAY 20 */
  cellNodeCust: { flex: CUSTOMERS_SUPPLIERS.node, minWidth: 0 },
  /** Drivers: DRIVER | TRIPS | EARNINGS | PAID | DUE (same as customers/suppliers layout) */
  cellNodeDriver: { flex: DRIVERS.node, minWidth: 0 },
  cellTripsDriver: { flex: DRIVERS.trips, minWidth: 0 },
  cellMissionDriver: { flex: DRIVERS.earnings, minWidth: 0 },
  driverCellWithDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  driverAvatarWithStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  driverStatusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    flexShrink: 0,
  },
  driverCellTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  driverCellNameWrap: {
    minWidth: 0,
  },
  cellNodeMainDriver: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    minWidth: 0,
  },
  cellAmountDriver: { flex: DRIVERS.earnings, minWidth: 0 },
  cellAmountDriverEarnings: { flex: DRIVERS.earnings, minWidth: 0 },
  cellAmountDriverPaid: { flex: DRIVERS.paid, minWidth: 0 },
  cellAmountDriverDue: { flex: DRIVERS.due, minWidth: 0 },
  cellTripsCust: {
    flex: CUSTOMERS_SUPPLIERS.trips,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  cellTripsText: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
  },
  cellMissionCust: { flex: CUSTOMERS_SUPPLIERS.mission, minWidth: 0 },
  cellAmountCust: { flex: CUSTOMERS_SUPPLIERS.credit, minWidth: 0 },
  cellNodeMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  ledgerEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  ledgerEntityIconSlot: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ledgerEntityTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    minHeight: 32,
    paddingTop: 1,
  },
  driverStatusDotOnline: { backgroundColor: Theme.darkGreen },
  driverStatusDotOffline: { backgroundColor: Theme.teslaRed },
  profileImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
  },
  initialsAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    fontSize: 10,
    fontWeight: "600",
  },
  cellNodeMain: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    flex: 1,
    minWidth: 0,
  },
  cellNodeSub: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMutedDemo,
    letterSpacing: 0.08,
    marginTop: 2,
  },
  /** Ledger: category line (e.g. ADVANCE PAYMENT, FUEL) */
  cellNodeSubCategory: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textSecondary,
    letterSpacing: 0.05,
    marginTop: 2,
    textTransform: "uppercase",
  },
  /** Ledger: date/time line (e.g. 01 Mar 26, 09:00 AM) */
  cellNodeSubDate: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    letterSpacing: 0.03,
    marginTop: 2,
  },
  cellNodeSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    minWidth: 0,
  },
  cellNodeSubIntegrationIconWrap: {
    width: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cellNodeSubContactRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: Theme.surface,
    marginRight: 4,
  },
  cellNodeSubContactIconWrap: {
    width: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cellNodeSubContact: {
    flex: 1,
    minWidth: 0,
  },
  cellNodeSubPlaceholder: {
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  cellNodeSubBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  cellNodeSubStandalone: {
    marginTop: 2,
  },
  ledgerReconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    minWidth: 0,
  },
  ledgerReconBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ledgerReconBadgeMatch: {
    backgroundColor: Theme.primary + "1F",
  },
  ledgerReconBadgeReconciled: {
    backgroundColor: Theme.darkGreen + "1F",
  },
  ledgerReconBadgeMismatch: {
    backgroundColor: Theme.teslaRed + "1A",
  },
  ledgerReconBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  ledgerReconBadgeTextMatch: {
    color: Theme.primary,
  },
  ledgerReconBadgeTextReconciled: {
    color: Theme.darkGreen,
  },
  ledgerReconBadgeTextMismatch: {
    color: Theme.teslaRed,
  },
  ledgerReconActionText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  /** Drivers tab: red icon left of driver name. Same width as cellNodeSubIntegrationIconWrap (14) + gap so text aligns with other tabs. */
  cellNodeDriverIconWrap: {
    width: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  /** Drivers tab: second row — truck icon + vehicle number on same line. */
  cellNodeDriverSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    minWidth: 0,
  },
  cellNodeDriverSubText: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMutedDemo,
    letterSpacing: 0.08,
    flex: 1,
    minWidth: 0,
  },
  /** Drivers: stack status and rating on two lines so rating is visible */
  cellNodeSubCol: {
    marginTop: 2,
    gap: 2,
  },
  /** Drivers tab: rating line (e.g. "4.5 ★ (2)") */
  cellNodeSubRating: {
    color: Theme.driverGold ?? Theme.primary,
    fontWeight: "400",
  },
  /** Drivers: STATUS column pill container */
  driverStatusPillWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  driverStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
  },
  driverStatusPillActive: {
    backgroundColor: Theme.positiveMuted ?? "#d1fae5",
  },
  driverStatusPillOffline: {
    backgroundColor: Theme.surfaceGray,
  },
  driverStatusPillDisconnected: {
    backgroundColor: Theme.negativeMuted ?? "rgba(220,38,38,0.15)",
  },
  driverStatusPillText: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.5,
  },
  cellMission: {
    flex: LEDGER.mission,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  /** Ledger trip/route column: wrap content to 2 rows, align start so both lines visible. */
  cellMissionLedger: {
    alignItems: "flex-start",
    justifyContent: "center",
    paddingVertical: 6,
  },
  cellMissionAmount: {
    alignItems: "flex-end",
  },
  cellAmount: {
    flex: LEDGER.credit,
    minWidth: 0,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  /** Rightmost column: extra padding to match container */
  cellLastColumn: { paddingRight: 10 },
  /** Small chevron to indicate row is tappable (ledger). Width matches header thLedgerSpacer for column alignment. */
  rowActionHint: {
    width: LEDGER.chevronWidth,
    minWidth: LEDGER.chevronWidth,
    paddingLeft: 6,
    paddingRight: 4,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
  },
  ledgerRowWrapper: {
    borderBottomWidth: 0.5,
    borderBottomColor: Theme.borderLight,
  },
  expandedSectionIconWrap: {
    width: 24,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  /** SOURCE column: plain text that fits the cell (no box/pill) */
  cellSourceText: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    textAlign: "center",
  },
  /** SOURCE column: wrap to 2 rows, left-aligned for trip/route details */
  cellSourceTextWrap: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    textAlign: "left",
  },
  /** SOURCE column: no trip linked */
  cellSourceNa: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMutedDemo,
    letterSpacing: 0.1,
    textAlign: "center",
  },
  sourceDropdownTrigger: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    alignSelf: "stretch",
    paddingVertical: 4,
    paddingHorizontal: 6,
    paddingRight: 18,
    position: "relative",
  },
  sourceDropdownTriggerContent: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    flex: 1,
    minWidth: 0,
  },
  sourceDropdownChevronWrap: {
    position: "absolute",
    top: 2,
    right: 4,
  },
  /** Second line in SOURCE cell: route, client or date */
  cellSourceDetail: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMutedDemo,
    letterSpacing: 0.05,
    textAlign: "center",
    marginTop: 2,
  },
  /** SOURCE column second line: wrap to 2 rows, left-aligned */
  cellSourceDetailWrap: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMutedDemo,
    letterSpacing: 0.05,
    textAlign: "left",
    marginTop: 2,
  },
  /** SOURCE column third line: trip date in smaller font */
  cellSourceDateRow: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textMuted,
    letterSpacing: 0.03,
    textAlign: "left",
    marginTop: 1,
  },
  cellSourceBlock: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    minWidth: 0,
    width: "100%",
  },
  /** Truck/vehicle badge in LINK cell when vehicleNumber is set (truck expense with trip.vehicle_id) */
  cellSourceVehicleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    backgroundColor: Theme.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.border,
    alignSelf: "center",
  },
  cellSourceVehicleText: {
    fontSize: 9,
    color: Theme.primary,
    fontWeight: "400",
  },
  creditText: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.darkGreen,
    letterSpacing: 0.1,
  },
  debitText: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.teslaRed,
    letterSpacing: 0.1,
  },
  statusBadgeCollected: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.darkGreen,
  },
  statusBadgePaid: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.darkGreen,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statusBadgeOver: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.driverGold,
  },
  statusBadgeOverText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});
