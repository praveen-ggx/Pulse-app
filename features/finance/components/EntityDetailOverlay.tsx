/**
 * Entity detail overlay — TeslaHeader, summary bar, toolbar (search + report + filter), "Transaction Ledger" table.
 * Report fetches ledger at client/entity level and offers download.
 */
import { ALL_LEDGER_CATEGORY_VALUES } from "@/components/AddTransactionModal";
import { FinanceFAB } from "@/components/FinanceFAB";
import { PartyAvatar } from "@/components/PartyAvatar";
import { TeslaHeader } from "@/components/TeslaHeader";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowSelected,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import { useLanguage } from "@/contexts/LanguageContext";
import { ClientRiskBadge } from "@/features/ai";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { isEmployeeDriverLedgerPayment } from "@/features/finance/domain/financeCounterpartyLane";
import { computeLedgerDerivedPaidSeed } from "@/features/finance/utils/ledgerDerivedPaidSeed.util";
import {
  averageScore,
  getRatingsForDriver,
  type RatingRow,
} from "@/features/ratings/services/ratings.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import {
    adjustedCost,
    adjustedRevenue,
} from "@/features/trips/services/tripAdjustments";
import { isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";


import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { isAggregateTrip } from "@/features/drivers/utils/driverUtils.util";
import {
    formatINR,
    formatIndianVehicleNumber,
    formatLedgerAmount,
    formatLedgerDate,
    formatLedgerDateTime,
    formatRelative,
} from "@/lib/format";
import {
    adjustmentsForTripId,
    useTripFinanceAdjustmentsMap,
} from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getDoubleEntryDisplayLabel } from "../accounting/accountingModel";
import type { DriverOfferForAggregation } from "../aggregation";
import {
    buildMonthlyDriverStatement,
    computeDriverCommissionForTrip,
    type DriverLedgerEntryForStatement,
    type TripForStatement,
} from "../aggregation";
import type { LedgerRow } from "../services/finance.service";
import {
    FinancialRow,
    type FinancialRowData,
    type FinancialRowType,
} from "./FinancialRow";
import { LedgerReportModal } from "./LedgerReportModal";
import { LedgerTransactionListView } from "./LedgerTransactionListView";
import { TreasurySummaryCard } from "./TreasurySummaryCard";
import { useMemberAccess } from "@/lib/useMemberAccess";

/** Pulsing icon for summary row to match home TreasurySummaryCard. */
function SummaryPulseIcon({
  name,
  size,
  color,
  style,
}: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  size: number;
  color: string;
  style?: object;
}) {
  const pulseScale = useSharedValue(1);
  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulseScale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));
  return (
    <Animated.View style={[animatedStyle, style]}>
      <FontAwesome name={name} size={size} color={color} />
    </Animated.View>
  );
}

const TRIP_TABLE_AVATAR = 24;

type PartnerOrgBranding = { avatarUrl?: string; avatarSeed?: string };

function isUuidLikeString(value: string | null | undefined): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function financeAggregateSupplierLabel(
  trip: TripRow,
  supplierById: Map<string, SupplierRow>,
): string {
  const raw = (trip.supplier_name ?? "").trim();
  if (raw && !isUuidLikeString(raw)) return raw;
  const sid = (trip.supplier_id ?? "").trim().toLowerCase();
  if (sid) {
    const s = supplierById.get(sid);
    const label = (
      s?.name ||
      s?.company_name ||
      s?.contact_person ||
      ""
    ).trim();
    if (label) return label;
  }
  return "Aggregate Supplier";
}

/** Bill-to vs carrier: never show the same display string in Client and Supplier columns for the same row. */
function financeDisambiguateSupplierColumnLabel(
  trip: TripRow,
  supplierResolvedLabel: string,
  clientResolvedLabel: string,
): { title: string; sameAsClient: boolean } {
  const c = (clientResolvedLabel ?? "").trim().toLowerCase();
  const s = (supplierResolvedLabel ?? "").trim().toLowerCase();
  const cid = (trip.client_id ?? "").trim().toLowerCase();
  const sid = (trip.supplier_id ?? "").trim().toLowerCase();
  const sameIds = Boolean(cid && sid && cid === sid);
  const sameNames = Boolean(c && s && c === s);
  if (sameIds || sameNames) {
    return { title: "Own operations", sameAsClient: true };
  }
  return { title: supplierResolvedLabel, sameAsClient: false };
}

function supplierPartyAvatarPropsFinance(
  trip: TripRow,
  displayName: string,
  supplierById: Map<string, SupplierRow>,
  linkedOrgBySupplierOrgId: Record<string, { avatarUrl?: string; avatarSeed?: string }>,
  partnerOrgBrandingByTripOwnerOrgId: Record<string, PartnerOrgBranding>,
): {
  name: string;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
} {
  const sid = (trip.supplier_id ?? "").trim().toLowerCase();
  if (sid) {
    const s = supplierById.get(sid);
    if (s) {
      const oid = (s.linked_organization_id ?? "").trim();
      const org = oid ? linkedOrgBySupplierOrgId[oid] : undefined;
      return {
        name: displayName,
        organizationImageUrl: org?.avatarUrl ?? null,
        organizationAvatarSeed: org?.avatarSeed ?? null,
        avatarUrl: (s.avatar_url ?? "").trim() || null,
        avatarSeed: (s.avatar_seed ?? "").trim() || null,
      };
    }
  }
  const oid = (trip.organization_id ?? "").trim();
  if (oid && partnerOrgBrandingByTripOwnerOrgId[oid]) {
    const b = partnerOrgBrandingByTripOwnerOrgId[oid];
    return {
      name: displayName,
      organizationImageUrl: b.avatarUrl ?? null,
      organizationAvatarSeed: b.avatarSeed ?? null,
    };
  }
  return { name: displayName };
}

/** Trip column date line — e.g. "6 APR 2026" (aligned with Client detail trips). */
function formatTripTableDateFinance(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const day = d.getDate();
    const month = d.toLocaleString("en-IN", { month: "short" }).toUpperCase();
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return "—";
  }
}

/** Last txn chip — e.g. "13 APR". */
function formatLastTxnDayMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const day = d.getDate();
    const month = d.toLocaleString("en-IN", { month: "short" }).toUpperCase();
    return `${day} ${month}`;
  } catch {
    return "—";
  }
}

export type EntityType = "CLIENT" | "SUPPLIER" | "VEHICLE" | "DRIVER";

/** Context when opening add-transaction from the trip P&L statement (inline). */
export type TripEntryIntent =
  | "client_receivable"
  | "supplier_payable"
  | "driver_payable"
  | "trip_expense";

export interface TripEntryContext {
  tripId: string;
  intent: TripEntryIntent;
}

/** Build LedgerRow[] from entity protocol rows so report preview shows same data as TRANSACTION LEDGER. */
function protocolRowsToLedger(
  entity: FinancialRowData,
  entityType: EntityType,
  protocolRows: Array<{
    id: string;
    missionId: string;
    dest: string;
    col1: number;
    col2: number;
    col3: number;
  }>,
  trips: TripRow[],
): LedgerRow[] {
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const partyName = entity.name ?? entity.id ?? "—";
  return protocolRows.map((r) => {
    const trip = tripMap.get(r.id);
    const date =
      (trip?.pickup_date ?? trip?.created_at ?? "").slice(0, 10) || "—";
    const isVehicle = entityType === "VEHICLE";
    const isDriver = entityType === "DRIVER";
    return {
      id: r.id,
      organization_id: "",
      trip_id: r.id,
      trip_number: r.missionId,
      party_name: partyName,
      description: r.dest,
      amount_in: isVehicle ? r.col2 : isDriver ? r.col2 : r.col1,
      amount_out: isVehicle ? r.col1 : isDriver ? r.col3 : r.col2,
      transaction_date: date,
      created_at: trip?.created_at ?? "",
    };
  });
}


export interface EntityDetailOverlayProps {
  entity: FinancialRowData;
  entityType: EntityType;
  subTab: FinancialRowType;
  trips: TripRow[];
  /** When provided for CLIENT/SUPPLIER, aggregated into trip rows (PAID/DUE) so trip rows stay visible and due updates. */
  transactions?: LedgerRow[] | null;
  /** When provided, trip P&L panel uses this (filtered by trip) so expense entries and full ledger show; omit to use only transactions. */
  allLedgerTransactions?: LedgerRow[] | null;
  /** When entityType is DRIVER, offer terms to compute commission from trip client_price / distance. */
  driverOffer?: DriverOfferForAggregation | null;
  /** When entityType is DRIVER, ledger entries for monthly statement (paid from driver_ledger). */
  driverLedgerEntries?: DriverLedgerEntryForStatement[] | null;
  onBack: () => void;
  /** When provided, shows an ADD TRANSACTION button that calls this. Can be called with optional context when opening from trip statement (Record cash in / Record payment / Add expense). */
  onAddTransaction?: (context?: TripEntryContext) => void;
  /** Required for ledger report (client-level fetch). */
  organizationId?: string | null;
  /** Currently unused within this component (its only caller was the removed Compare & Verify tab). Kept for caller compatibility. */
  onRefresh?: () => void;
  /** When entityType is VEHICLE, optional full vehicle row for type label and age (from created_at). */
  vehicle?: VehicleRow | null;
  /** When entityType is DRIVER, full driver row for PROFILE (phone, email, status, created_at). */
  driverProfile?: DriverRow | null;
  /** When entityType is DRIVER, list of vehicles for assign-vehicle picker. */
  vehicles?: VehicleRow[];
  /** When entityType is DRIVER, called when user assigns or clears vehicle; caller updates driver and refreshes. */
  onAssignVehicle?: (driverId: string, vehicleId: string | null) => void | Promise<void>;
  /** When entityType is VEHICLE, list of drivers for assign-driver picker. */
  drivers?: DriverRow[];
  /** When entityType is VEHICLE, called when user assigns or clears driver; caller updates driver's assigned_vehicle_id and refreshes. */
  onAssignDriver?: (vehicleId: string, driverId: string | null) => void | Promise<void>;
  /** Org clients — SUPPLIER finance trip grid (web): client avatar column. */
  financeClientRows?: ClientRow[];
  /** Org suppliers — supplier column resolution on trips. */
  financeSupplierRows?: SupplierRow[];
  /** Org drivers — driver column on trips. */
  financePartyDrivers?: DriverRow[];
  /** When set, CLIENT/SUPPLIER overlay opens on this tab (e.g. ledger from Finance list). */
  initialDetailTab?: "main" | "ledger";
}

/** Latest payment captured date for a trip from ledger (transaction_date or created_at). Used when trip has no pickup_date. */
function getLatestPaymentDateForTrip(
  tripId: string,
  txs: LedgerRow[] | null | undefined,
): string | null {
  if (!txs || !tripId) return null;
  const normId = (id: string | null | undefined) =>
    id == null ? "" : String(id).trim().toLowerCase();
  const key = normId(tripId);
  const dates = txs
    .filter((tx) => normId(tx.trip_id) === key)
    .map((tx) => (tx.transaction_date ?? tx.created_at ?? "").slice(0, 10))
    .filter((s) => s.length === 10);
  if (dates.length === 0) return null;
  dates.sort();
  return dates[dates.length - 1];
}

/** Aging label from a date string (YYYY-MM-DD): "5 days ago", "Overdue 3 days", etc. */
function getAgingLabel(
  iso: string | null | undefined,
  dueAmount?: number,
): string {
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
    if (days === 0)
      return dueAmount != null && dueAmount > 0 ? "Due today" : "Today";
    if (days === 1)
      return dueAmount != null && dueAmount > 0 ? "1 day overdue" : "1 day ago";
    if (dueAmount != null && dueAmount > 0 && days <= 90)
      return `${days} days overdue`;
    if (dueAmount != null && dueAmount > 0 && days > 90)
      return `${Math.floor(days / 30)} mo overdue`;
    if (days <= 30) return `${days} days ago`;
    if (days <= 365) return `${Math.floor(days / 30)} mo ago`;
    return `${Math.floor(days / 365)} yr ago`;
  } catch {
    return "—";
  }
}

const DRIVER_STATEMENT_MONTHS = 12;

export function EntityDetailOverlay({
  entity,
  entityType,
  subTab,
  trips,
  transactions,
  driverOffer,
  driverLedgerEntries,
  onBack,
  onAddTransaction,
  organizationId,
  vehicle,
  driverProfile,
  vehicles = [],
  onAssignVehicle,
  drivers = [],
  onAssignDriver,
  financeClientRows = [],
  financeSupplierRows = [],
  financePartyDrivers = [],
  initialDetailTab = "main",
}: EntityDetailOverlayProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [detailTab, setDetailTab] = useState<"main" | "ledger">(
    initialDetailTab,
  );
  /** Driver-only: PROFILE | LEDGER | STATEMENT. */
  const [driverDetailTab, setDriverDetailTab] = useState<
    "profile" | "ledger" | "statement"
  >("profile");
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const [expandedDriverLedgerRowId, setExpandedDriverLedgerRowId] = useState<
    string | null
  >(null);
  /** Client/Supplier: expanded row in RECEIVABLES BY TRIP / PAYABLES BY TRIP table. */
  const [expandedEntityLedgerRowId, setExpandedEntityLedgerRowId] = useState<
    string | null
  >(null);
  const [entityLedgerViewMode, setEntityLedgerViewMode] = useState<
    "table" | "transaction"
  >("transaction");
  const [driverRatings, setDriverRatings] = useState<RatingRow[]>([]);
  /** Width of ratings grid content (excludes section horizontal padding); fixes column math in narrow overlays. */
  const [driverRatingsBandInnerWidth, setDriverRatingsBandInnerWidth] =
    useState(0);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [fabHovered, setFabHovered] = useState(false);
  const [isActionHubOpen, setIsActionHubOpen] = useState(false);

  const isDriver = entityType === "DRIVER";
  const assignedVehicle =
    isDriver && driverProfile?.assigned_vehicle_id && vehicles.length > 0
      ? vehicles.find((v) => v.id === driverProfile.assigned_vehicle_id)
      : null;

  /** When driver has no assigned_vehicle_id, show vehicle from most recent trip (asset-based or assigned vehicle). */
  const assignedVehicleDisplayFromTrips = useMemo(() => {
    if (!isDriver || !trips.length) return null;
    const withVehicle = trips.filter(
      (t) =>
        t.vehicle_id != null || ((t.vehicle_display_number ?? "").trim() !== ""),
    );
    if (withVehicle.length === 0) return null;
    const sorted = [...withVehicle].sort((a, b) => {
      const dateA = (a.pickup_date ?? a.created_at ?? "").toString();
      const dateB = (b.pickup_date ?? b.created_at ?? "").toString();
      return dateB.localeCompare(dateA);
    });
    const latest = sorted[0];
    if (!latest) return null;
    if (latest.vehicle_id && vehicles.length > 0) {
      const v = vehicles.find((ve) => ve.id === latest.vehicle_id);
      if (v?.vehicle_number)
        return formatIndianVehicleNumber(v.vehicle_number);
    }
    const num = (latest.vehicle_display_number ?? "").trim();
    return num ? formatIndianVehicleNumber(num) : null;
  }, [isDriver, trips, vehicles]);

  useEffect(() => {
    if (!isDriver || !entity.id) return;
    getRatingsForDriver(entity.id).then((res) => {
      setDriverRatings(res.error ? [] : (res.ratings ?? []));
    });
  }, [isDriver, entity.id]);

  useEffect(() => {
    setDetailTab(initialDetailTab);
    setDriverDetailTab("profile");
    setExpandedMonthKey(null);
    setExpandedDriverLedgerRowId(null);
    setExpandedEntityLedgerRowId(null);
  }, [entity.id, entityType, initialDetailTab]);

  const { width: screenWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && screenWidth >= 1024;

  useEffect(() => {
    setEntityLedgerViewMode(isWebDesktop ? "table" : "transaction");
  }, [entity.id, isWebDesktop]);

  const tripRouteLabelByTripId = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trips) {
      const pickup = (t.pickup_area ?? "").trim();
      const drop = (t.drop_location ?? "").trim();
      m.set(
        String(t.id),
        pickup || drop ? `${pickup || "—"} → ${drop || "—"}` : "—",
      );
    }
    return m;
  }, [trips]);

  const driverTripsOperatedInAppCount = useMemo(() => {
    if (!isDriver || !entity.id) return 0;
    const id = String(entity.id).trim().toLowerCase();
    return trips.filter(
      (trip) =>
        String(trip.driver_id ?? "").trim().toLowerCase() === id,
    ).length;
  }, [isDriver, entity.id, trips]);

  const driverProfileGlobalAvgRating = useMemo(() => {
    if (!isDriver) return null;
    const hub = entity.rating;
    if (hub != null && Number(hub) > 0) return Number(hub);
    return averageScore(driverRatings);
  }, [isDriver, entity.rating, driverRatings]);
  const isVehicle = entityType === "VEHICLE";
  /** When entityType is VEHICLE, driver currently assigned to this vehicle (drivers.assigned_vehicle_id === entity.id). */
  const assignedDriverForVehicle =
    isVehicle && entity.id && drivers.length > 0
      ? drivers.find((d) => d.assigned_vehicle_id === entity.id) ?? null
      : null;
  const isCustomerOrSupplier =
    entityType === "CLIENT" || entityType === "SUPPLIER";
  const labels = useMemo(() => {
    const map: Record<FinancialRowType, { in: string; out: string }> = {
      ledger: { in: t("totalCashIn"), out: t("totalCashOut") },
      customers: { in: t("totalBilling"), out: t("totalBalance") },
      suppliers: { in: t("contractValue"), out: t("dueToPay") },
      garage: { in: t("sales"), out: t("profit") },
      drivers: { in: t("toPay"), out: t("due") },
    };
    return map[subTab] ?? { in: t("totalLabel"), out: t("due") };
  }, [subTab, t]);
  /** From trip details: sale value / supplier cost; received or paid; pending to receive or due to pay */
  const colLabels = isVehicle
    ? ["SALES", "EXPENSES", "PROFIT"]
    : isDriver
      ? ["TO PAY", "PAID", "DUE"]
      : entityType === "CLIENT"
        ? ["SALE VALUE", "RECEIVED", "PENDING"]
        : ["SUPPLIER COST", "PAID", "DUE"];

  const amountIn = isDriver
    ? (entity.paid ?? 0)
    : isVehicle
      ? (entity.sales ?? 0)
      : subTab === "suppliers"
        ? (entity.payables ?? entity.due ?? 0)
        : (entity.billed ?? entity.received ?? 0);
  const amountOut = isVehicle
    ? Math.max(0, (entity.sales ?? 0) - (entity.expense ?? 0))
    : subTab === "suppliers"
      ? (entity.due ?? 0)
      : (entity.pending ?? entity.due ?? 0);

  const tripIdsForFinanceAdj = useMemo(
    () => (trips ?? []).map((t) => String(t.id)).filter(Boolean),
    [trips],
  );
  const { record: tripFinanceAdjRecord } = useTripFinanceAdjustmentsMap(
    organizationId ?? null,
    tripIdsForFinanceAdj,
  );

  // CLIENT/SUPPLIER: always one row per trip; aggregate transactions into PAID/DUE so trip rows stay visible and due updates
  const rowsFromCustomerSupplier =
    isCustomerOrSupplier && trips.length > 0
      ? (() => {
          const norm = (id: string | null | undefined) =>
            id == null ? "" : String(id).trim().toLowerCase();
          const linkedTripIds = new Set(trips.map((t) => norm(t.id)));
          const paidByTripId: Record<string, number> = {};
          const outByTripId: Record<string, number> = {};
          const firstTripKey = norm(trips[0].id);
          const isDcoParty = entity.counterpartyKind === "dco";
          const contactType =
            entityType === "CLIENT"
              ? "client"
              : isDcoParty
                ? "dco"
                : "supplier";
          const isEntityLinked = (tx: LedgerRow) =>
            tx.contact_type === contactType &&
            tx.contact_id != null &&
            tx.contact_id === entity.id;

          const txs = transactions ?? [];

          // amount_paid is ledger-synced (trg_sync_trip_payment_status) and already reflects
          // any linked transaction below — seeding from it unconditionally AND adding amount_in
          // on top double-counts (see docs/FINANCE_ACCEPTANCE_GATE_v1.md). Pre-scan which trips
          // have a linked transaction so the seed can be reset to 0 for those.
          const tripKeysWithLinkedTx = new Set<string>();
          for (const tx of txs) {
            const linkedKey =
              norm(tx.trip_id) && linkedTripIds.has(norm(tx.trip_id))
                ? norm(tx.trip_id)
                : isEntityLinked(tx) && firstTripKey
                  ? firstTripKey
                  : undefined;
            if (linkedKey !== undefined) tripKeysWithLinkedTx.add(linkedKey);
          }

          for (const t of trips) {
            const key = norm(t.id);
            paidByTripId[key] = computeLedgerDerivedPaidSeed({
              amountPaid: t.amount_paid,
              hasLinkedTransaction: tripKeysWithLinkedTx.has(key),
            });
            outByTripId[key] = 0;
          }
          const linkedTxIds = new Set<string>();
          for (const tx of txs) {
            let key: string | undefined =
              norm(tx.trip_id) && linkedTripIds.has(norm(tx.trip_id))
                ? norm(tx.trip_id)
                : undefined;
            if (key === undefined && isEntityLinked(tx) && firstTripKey) {
              key = firstTripKey;
            }
            if (key !== undefined) {
              paidByTripId[key] =
                (paidByTripId[key] ?? 0) + Number(tx.amount_in ?? 0);
              outByTripId[key] =
                (outByTripId[key] ?? 0) + Number(tx.amount_out ?? 0);
              linkedTxIds.add(tx.id);
            }
          }

          const linkedOrgId =
            (entity as { linked_organization_id?: string | null })
              .linked_organization_id ?? null;
          const tripRows = trips.map((t) => {
            const key = norm(t.id);
            // SUPPLIER: use client_price only when we are the client (trip from tripsWhereOrgIsClient); else supplier_rate (align with aggregateSuppliers)
            const isTripWhereWeAreClient =
              linkedOrgId != null &&
              isLoadBasedTrip(t) &&
              t.organization_id != null &&
              t.organization_id === linkedOrgId;
            const adj = adjustmentsForTripId(tripFinanceAdjRecord, t.id);
            let sales: number;
            if (entityType === "CLIENT") {
              // TODO(temp-fix): `paid`/`inByTrip` below is ledger cash tied to `client_price`
              // regardless of entity type, so `sales` must match client_price here too — using
              // supplier_rate for integrated shipper clients made received > sales and clamped
              // `due` to 0, hiding real mismatches (see AJIO TRP003: sales 45k vs received 66.7k).
              // Real fix is a shared finance-presentation helper (see tech-debt note below) —
              // this file independently reimplements sales/due logic already centralized in
              // features/finance/utils/tripSettlement.util.ts (tripHubRevenue/tripHubCost).
              const base = Number(t.client_price ?? 0);
              sales = adjustedRevenue(base, adj);
            } else if (entityType === "SUPPLIER") {
              if (isTripWhereWeAreClient) {
                const base =
                  Number(t.client_price ?? 0) ||
                  Number(t.supplier_rate ?? 0);
                sales = adjustedRevenue(base, adj);
              } else {
                sales = adjustedCost(Number(t.supplier_rate ?? 0), adj);
              }
            } else {
              sales = Number(t.client_price ?? t.supplier_rate ?? 0);
            }
            const outByTrip = outByTripId[key] ?? 0;
            const inByTrip = paidByTripId[key] ?? 0;
            // CLIENT: received = only cash from client (inByTrip); pending = sale - received. Expenses (outByTrip) do not reduce received. SUPPLIER: paid = amount paid to supplier (out); due = sales - paid.
            const paid = entityType === "SUPPLIER" ? outByTrip : inByTrip;
            const due =
              entityType === "SUPPLIER"
                ? Math.max(0, sales - outByTrip)
                : Math.max(0, sales - inByTrip);
            const tripDateIso =
              (t.pickup_date ?? t.created_at ?? "").slice(0, 10) || null;
            const tripDate = tripDateIso ? formatLedgerDate(tripDateIso) : "—";
            const agingLabel = getAgingLabel(tripDateIso, due);
            const route =
              [t.pickup_area, t.drop_location].filter(Boolean).join(" → ") ||
              null;
            return {
              id: t.id,
              missionId: getTripDisplayNumber(t),
              dest: t.drop_location || "—",
              col1: sales,
              col2: paid,
              col3: due,
              tripDate,
              agingLabel,
              route: route ?? undefined,
              clientName: t.client_name ?? undefined,
            };
          });

          const unlinkedTx = txs.filter((tx) => !linkedTxIds.has(tx.id));
          for (const tx of unlinkedTx) {
            const amountIn = Number(tx.amount_in ?? 0);
            const amountOut = Number(tx.amount_out ?? 0);
            const txDate = (tx.transaction_date ?? "").slice(0, 10) || null;
            tripRows.push({
              id: `adj-${tx.id}`,
              missionId: tx["trip_number"] ?? "ADJ",
              dest:
                tx.description && tx.description !== "ENTRY"
                  ? tx.description
                  : "—",
              col1: amountIn,
              col2: amountIn,
              col3: amountOut,
              tripDate: txDate ? formatLedgerDate(txDate) : "—",
              agingLabel: getAgingLabel(txDate, amountOut),
              route: undefined,
              clientName: "",
            });
          }
          return tripRows;
        })()
      : null;

  const rowsFromTrips =
    rowsFromCustomerSupplier == null && trips.length > 0
      ? (() => {
          if (isVehicle) {
            const outByTripId: Record<string, number> = {};
            for (const t of trips)
              outByTripId[t.id] = Number(t.supplier_rate ?? 0);
            for (const tx of transactions ?? []) {
              if (tx.trip_id && outByTripId.hasOwnProperty(tx.trip_id)) {
                outByTripId[tx.trip_id] =
                  (outByTripId[tx.trip_id] ?? 0) + Number(tx.amount_out ?? 0);
              }
            }
            return trips.map((t) => {
              const sales = Number(t.client_price ?? 0);
              const exp = outByTripId[t.id] ?? 0;
              const profit = sales - exp;
              const margin =
                sales > 0 ? (profit / sales) * 100 : exp > 0 ? -100 : 0;
              const tripDateIso =
                (t.pickup_date ?? t.created_at ?? "").slice(0, 10) || null;
              return {
                id: t.id,
                missionId: getTripDisplayNumber(t),
                dest: t.drop_location || "—",
                clientName: t.client_name ?? "—",
                col1: exp,
                col2: profit,
                col3: 0,
                sales,
                expense: exp,
                net: profit,
                margin,
                tripDate: tripDateIso ? formatLedgerDate(tripDateIso) : "—",
                agingLabel: getAgingLabel(tripDateIso),
              };
            });
          }
          if (isDriver) {
            const entityPaid = entity.paid ?? 0;
            const entityPending = entity.pending ?? 0;
            const normId = (id: string | null | undefined) =>
              id == null ? "" : String(id).trim();
            const paidByTripId: Record<string, number> = {};
            for (const t of trips) paidByTripId[normId(t.id)] = 0;
            for (const tx of transactions ?? []) {
              const txTripKey = normId(tx.trip_id);
              if (
                tx.contact_type === "driver" &&
                tx.contact_id != null &&
                normId(tx.contact_id) === normId(entity.id) &&
                txTripKey !== "" &&
                txTripKey in paidByTripId
              ) {
                paidByTripId[txTripKey] =
                  (paidByTripId[txTripKey] ?? 0) + Number(tx.amount_out ?? 0);
              }
            }
            const totalPaidLinked = trips.reduce(
              (sum, t) => sum + (paidByTripId[normId(t.id)] ?? 0),
              0,
            );
            const tripRows = trips.map((t) => {
              const commission = computeDriverCommissionForTrip(
                {
                  ...t,
                  client_price: t.client_price ?? null,
                  distance: t.distance ?? null,
                },
                driverOffer ?? undefined,
              );
              const paid = paidByTripId[normId(t.id)] ?? 0;
              const due = Math.max(0, commission - paid);
              const tripDateIso =
                (
                  t.pickup_date ??
                  t.created_at ??
                  getLatestPaymentDateForTrip(t.id, transactions ?? null) ??
                  ""
                )
                  .toString()
                  .slice(0, 10) || null;
              const route =
                t.pickup_area?.trim() && t.drop_location?.trim()
                  ? `${t.pickup_area.trim()} → ${t.drop_location.trim()}`
                  : t.drop_location?.trim() || "—";
              const dateTimeIso = (
                t.pickup_date ??
                t.created_at ??
                ""
              ).toString();
              return {
                id: t.id,
                missionId: getTripDisplayNumber(t),
                dest: route,
                col1: commission,
                col2: paid,
                col3: due,
                tripDate: tripDateIso ? formatLedgerDate(tripDateIso) : "—",
                tripDateIso: dateTimeIso || undefined,
                agingLabel: getAgingLabel(tripDateIso, due),
              };
            });
            tripRows.push({
              id: "ledger-adjustment",
              missionId: "—",
              dest: "Other / Ledger",
              col1: 0,
              col2: entityPaid - totalPaidLinked,
              col3: entityPending,
              tripDate: "—",
              tripDateIso: undefined,
              agingLabel: "",
            });
            return tripRows;
          }
          return [];
        })()
      : null;

  const fallbackCol2 = isVehicle
    ? (entity.expense ?? 0)
    : isDriver
      ? (entity.paid ?? 0)
      : (entity.received ?? entity.paid ?? amountIn);

  const fallbackRow = isVehicle
    ? {
        id: "none",
        missionId: "—",
        dest: "—",
        col1: entity.expense ?? 0,
        col2: amountOut,
        col3: 0,
        tripDate: "—",
        agingLabel: "",
      }
    : {
        id: "none",
        missionId: "—",
        dest: "—",
        col1: amountIn,
        col2: fallbackCol2,
        col3: amountOut,
        tripDate: "—",
        agingLabel: "",
      };

  const allRows = rowsFromCustomerSupplier ?? rowsFromTrips ?? [fallbackRow];

  const q = searchQuery.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return allRows;
    return allRows.filter(
      (r) =>
        (r.missionId ?? "").toLowerCase().includes(q) ||
        (r.dest ?? "").toLowerCase().includes(q),
    );
  }, [allRows, q]);

  const protocolLedgerRows = useMemo(
    () => protocolRowsToLedger(entity, entityType, rows, trips),
    [entity, entityType, rows, trips],
  );

  /** Ledger entries for this entity (party or vehicle's trips) for the Ledger tab. */
  const selectedEntityTransactions = useMemo((): LedgerRow[] | null => {
    const allTx = transactions ?? [];
    if (!entity?.id) return null;
    if (entityType === "VEHICLE") {
      const tripIds = new Set(trips.map((t) => t.id));
      return allTx.filter(
        (tx) => tx.trip_id != null && tripIds.has(tx.trip_id),
      );
    }
    if (entityType === "DRIVER") {
      return allTx.filter(
        (tx) =>
          tx.contact_type === "driver" &&
          tx.contact_id != null &&
          String(tx.contact_id).trim() === String(entity.id).trim(),
      );
    }
    if (entityType === "CLIENT") {
      const tripIds = new Set(trips.map((t) => t.id));
      const partyNameKey = (entity.name ?? "").trim().toLowerCase();
      return allTx.filter(
        (tx) =>
          (tx.contact_type === "client" && tx.contact_id === entity.id) ||
          (tx.trip_id != null && tripIds.has(tx.trip_id)) ||
          (partyNameKey &&
            (tx.party_name ?? "").trim().toLowerCase() === partyNameKey),
      );
    }
    if (entityType === "SUPPLIER") {
      const tripIds = new Set(trips.map((t) => t.id));
      const partyNameKey = (entity.name ?? "").trim().toLowerCase();
      const isDcoParty = entity.counterpartyKind === "dco";
      return allTx.filter(
        (tx) =>
          (tx.contact_type === (isDcoParty ? "dco" : "supplier") &&
            tx.contact_id === entity.id) ||
          (tx.trip_id != null && tripIds.has(tx.trip_id)) ||
          (!isDcoParty &&
            partyNameKey &&
            (tx.party_name ?? "").trim().toLowerCase() === partyNameKey),
      );
    }
    return null;
  }, [entity, entityType, trips, transactions]);

  /** Merge vehicle picker drivers + current driver profile for cash-list PartyAvatar lookups. */
  const ledgerDriverRowsForAvatars = useMemo(() => {
    const m = new Map<string, DriverRow>();
    for (const d of drivers) {
      m.set(d.id, d);
    }
    if (driverProfile) {
      m.set(driverProfile.id, driverProfile);
    }
    return Array.from(m.values());
  }, [drivers, driverProfile]);

  /** Trip-linked expenses excluding supplier payouts (cost fallback when supplier_rate is 0). Mirrors Client detail trips. */
  const financeTripExpenseByTripId = useMemo(() => {
    const byTrip: Record<string, number> = {};
    for (const tx of transactions ?? []) {
      if (!tx.trip_id) continue;
      const key = String(tx.trip_id).trim().toLowerCase();
      const out = Number(tx.amount_out ?? 0);
      if (out <= 0) continue;
      if (tx.contact_type === "supplier" || tx.contact_type === "dco") continue;
      byTrip[key] = (byTrip[key] ?? 0) + out;
    }
    return byTrip;
  }, [transactions]);

  const financeTripTxnMetaByTripId = useMemo(() => {
    const byTrip: Record<
      string,
      { count: number; lastTxnDate: string | null }
    > = {};
    for (const tx of transactions ?? []) {
      if (!tx.trip_id) continue;
      const key = String(tx.trip_id).trim().toLowerCase();
      const candidateDate = tx.transaction_date ?? tx.created_at ?? null;
      const cur = byTrip[key];
      if (!cur) {
        byTrip[key] = { count: 1, lastTxnDate: candidateDate };
        continue;
      }
      cur.count += 1;
      if (
        candidateDate &&
        (!cur.lastTxnDate || candidateDate > cur.lastTxnDate)
      ) {
        cur.lastTxnDate = candidateDate;
      }
    }
    return byTrip;
  }, [transactions]);

  const financeClientById = useMemo(() => {
    const m = new Map<string, ClientRow>();
    for (const c of financeClientRows) {
      m.set(String(c.id).trim().toLowerCase(), c);
    }
    return m;
  }, [financeClientRows]);

  const financeSupplierById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of financeSupplierRows) {
      m.set(String(s.id).trim().toLowerCase(), s);
    }
    return m;
  }, [financeSupplierRows]);

  const financeDriverById = useMemo(() => {
    const m = new Map<string, DriverRow>();
    for (const d of financePartyDrivers) {
      m.set(String(d.id).trim().toLowerCase(), d);
    }
    return m;
  }, [financePartyDrivers]);

  const financeLinkedOrgDisplayMap = useLinkedOrgProfileMap(
    financeClientRows,
    financeSupplierRows,
  );

  /** Header summary (black block): totals and labels for main vs ledger tab. */
  const headerSummary = useMemo(() => {
    if (detailTab === "ledger" && selectedEntityTransactions != null) {
      const cashIn = selectedEntityTransactions.reduce(
        (s, tx) => s + Number(tx.amount_in ?? 0),
        0,
      );
      const cashOut = selectedEntityTransactions.reduce(
        (s, tx) => s + Number(tx.amount_out ?? 0),
        0,
      );
      return {
        labelIn: t("totalCashIn") ?? "TOTAL RECEIVED",
        labelOut: t("totalCashOut") ?? "TOTAL PAID",
        valueIn: cashIn,
        valueOut: cashOut,
      };
    }
    return {
      labelIn: labels.in,
      labelOut: labels.out,
      valueIn: amountIn,
      valueOut: amountOut,
    };
  }, [
    detailTab,
    labels.in,
    labels.out,
    amountIn,
    amountOut,
    selectedEntityTransactions,
    t,
  ]);

  /** Map trip_id -> detail for Ledger tab SOURCE column and expanded card (same shape as main finance Ledger). */
  const ledgerTripDetailsMap = useMemo(() => {
    const map: Record<
      string,
      {
        trip_number: string;
        drop_location?: string;
        pickup_area?: string;
        client_name?: string;
        pickup_date?: string | null;
        vehicle_number?: string | null;
        client_price?: number | null;
        supplier_rate?: number | null;
        driver_commission?: number | null;
      }
    > = {};
    for (const t of trips) {
      map[t.id] = {
        trip_number: getTripDisplayNumber(t),
        drop_location: t.drop_location || undefined,
        pickup_area: t.pickup_area || undefined,
        client_name: t.client_name || undefined,
        pickup_date: t.pickup_date ?? undefined,
        client_price: t.client_price ?? null,
        supplier_rate: t.supplier_rate ?? null,
        driver_commission: t.driver_commission ?? null,
      };
    }
    return map;
  }, [trips]);

  const monthlyStatement = useMemo(() => {
    if (entityType !== "DRIVER" || !entity.id) return null;
    const ledger = driverLedgerEntries ?? [];
    const tripsForStatement: TripForStatement[] = trips.map((t) => ({
      ...t,
      missionId: getTripDisplayNumber(t),
    }));
    const offer = driverOffer
      ? {
          payableAmount: driverOffer.payableAmount ?? null,
          commissionPercent: driverOffer.commissionPercent ?? null,
          commissionPerKm: driverOffer.commissionPerKm ?? null,
        }
      : null;
    return buildMonthlyDriverStatement(
      entity.id,
      tripsForStatement,
      ledger as DriverLedgerEntryForStatement[],
      offer,
      { maxMonths: DRIVER_STATEMENT_MONTHS },
    );
  }, [entityType, entity.id, trips, driverLedgerEntries, driverOffer]);

  const monthlyRowsReversed =
    monthlyStatement?.rows != null ? [...monthlyStatement.rows].reverse() : [];

  const { can: canSurface } = useMemberAccess();
  const canViewFinanceReports = canSurface("finance.reports");

  const handleReportPress = useCallback(() => {
    if (!canViewFinanceReports) return;
    setShowReportModal(true);
  }, [canViewFinanceReports]);

  const handleLoadBoard = useCallback(() => {
    onBack();
    router.push("/load-board");
  }, [onBack, router]);

  const handleNetwork = useCallback(() => {
    onBack();
    router.push("/(tabs)/network");
  }, [onBack, router]);

  const handleProfile = useCallback(() => {
    onBack();
    router.push("/(tabs)/profile");
  }, [onBack, router]);

  const handleNotification = useCallback(() => {
    onBack();
    router.push("/notifications");
  }, [onBack, router]);

  const vehicleSubtitle =
    isVehicle && vehicle
      ? [
          vehicle.vehicle_type,
          vehicle.vehicle_brand,
          vehicle.vehicle_model,
          vehicle.vehicle_body_type,
        ]
          .filter(Boolean)
          .join(" ") ||
        entity.model ||
        entityType
      : isDriver && entity.rating != null && entity.rating > 0
        ? `${entityType} · ${entity.rating.toFixed(1)} ★${entity.ratingCount != null && entity.ratingCount > 0 ? ` (${entity.ratingCount})` : ""}`
        : entityType;

  const driverRatingGridGap = 8;
  const driverRatingsLayoutWidth = useMemo(() => {
    const pad = Layout.screenPaddingHorizontal * 2;
    const fallback = Math.max(280, screenWidth - pad);
    return driverRatingsBandInnerWidth > 0
      ? driverRatingsBandInnerWidth
      : fallback;
  }, [driverRatingsBandInnerWidth, screenWidth]);
  /** 3-up from ~480px band width; 2-up from ~360px. Uses measured section width when available. */
  const driverRatingGridCols =
    driverRatingsLayoutWidth >= 480
      ? 3
      : driverRatingsLayoutWidth >= 360
        ? 2
        : 1;
  const driverRatingCardWidth = Math.max(
    88,
    Math.floor(
      (driverRatingsLayoutWidth -
        driverRatingGridGap * (driverRatingGridCols - 1)) /
        driverRatingGridCols,
    ),
  );
  const detailTabsContent = isCustomerOrSupplier ? (
    <View style={styles.entityTabRow}>
      <TouchableOpacity
        style={[
          styles.entityTab,
          detailTab === "main" && styles.entityTabActive,
        ]}
        onPress={() => setDetailTab("main")}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.entityTabText,
            detailTab === "main" && styles.entityTabTextActive,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {entityType === "CLIENT" ? "RECEIVABLES" : "PAYABLE"}
        </Text>
        {detailTab === "main" && <View style={styles.entityTabUnderline} />}
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.entityTab,
          detailTab === "ledger" && styles.entityTabActive,
        ]}
        onPress={() => setDetailTab("ledger")}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.entityTabText,
            detailTab === "ledger" && styles.entityTabTextActive,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          CASH
        </Text>
        {detailTab === "ledger" && <View style={styles.entityTabUnderline} />}
      </TouchableOpacity>
    </View>
  ) : isVehicle ? (
    <View style={styles.entityTabRow}>
      <TouchableOpacity
        style={[
          styles.entityTab,
          detailTab === "main" && styles.entityTabActive,
        ]}
        onPress={() => setDetailTab("main")}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.entityTabText,
            detailTab === "main" && styles.entityTabTextActive,
          ]}
        >
          P&L SUMMARY
        </Text>
        {detailTab === "main" && <View style={styles.entityTabUnderline} />}
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.entityTab,
          detailTab === "ledger" && styles.entityTabActive,
        ]}
        onPress={() => setDetailTab("ledger")}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.entityTabText,
            detailTab === "ledger" && styles.entityTabTextActive,
          ]}
        >
          CASH
        </Text>
        {detailTab === "ledger" && <View style={styles.entityTabUnderline} />}
      </TouchableOpacity>
    </View>
  ) : isDriver ? (
    <View style={styles.entityTabRow}>
      <TouchableOpacity
        style={[
          styles.entityTab,
          driverDetailTab === "profile" && styles.entityTabActive,
        ]}
        onPress={() => setDriverDetailTab("profile")}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.entityTabText,
            driverDetailTab === "profile" && styles.entityTabTextActive,
          ]}
        >
          PROFILE
        </Text>
        {driverDetailTab === "profile" && (
          <View style={styles.entityTabUnderline} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.entityTab,
          driverDetailTab === "ledger" && styles.entityTabActive,
        ]}
        onPress={() => setDriverDetailTab("ledger")}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.entityTabText,
            driverDetailTab === "ledger" && styles.entityTabTextActive,
          ]}
        >
          LEDGER
        </Text>
        {driverDetailTab === "ledger" && (
          <View style={styles.entityTabUnderline} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.entityTab,
          driverDetailTab === "statement" && styles.entityTabActive,
        ]}
        onPress={() => setDriverDetailTab("statement")}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.entityTabText,
            driverDetailTab === "statement" && styles.entityTabTextActive,
          ]}
        >
          STATEMENT
        </Text>
        {driverDetailTab === "statement" && (
          <View style={styles.entityTabUnderline} />
        )}
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.darkBlock}>
        <TeslaHeader
          title={entity.name ?? entity.id}
          subtitle={isVehicle ? vehicleSubtitle : entityType}
          showBack
          onBack={onBack}
          onLoadClick={handleLoadBoard}
          onNetworkClick={handleNetwork}
          onNotificationClick={handleNotification}
          onProfileClick={handleProfile}
        />
        {(isCustomerOrSupplier || isVehicle || isDriver) && (
          <View style={styles.darkBlockTabRow}>{detailTabsContent}</View>
        )}
        {/* In / out summary — same strip for ledger and shared ledger (aligned with Trips/Cash scorecard). */}
        {(isCustomerOrSupplier || isVehicle) ? (
          <View style={styles.darkBlockSummaryRow}>
            <View style={styles.darkBlockSummaryCell}>
              <View style={styles.darkBlockSummaryLabelRow}>
                <SummaryPulseIcon
                  name="arrow-circle-up"
                  size={14}
                  color={Theme.darkGreen}
                  style={styles.darkBlockSummaryIcon}
                />
                <Text style={styles.darkBlockSummaryLabel}>
                  {headerSummary.labelIn}
                </Text>
              </View>
              <Text
                style={[
                  styles.darkBlockSummaryAmount,
                  styles.darkBlockSummaryAmountIn,
                ]}
              >
                {formatINR(headerSummary.valueIn)}
              </Text>
            </View>
            <View
              style={[
                styles.darkBlockSummaryCell,
                styles.darkBlockSummaryCellRight,
                styles.darkBlockSummaryCellBorder,
              ]}
            >
              <View style={styles.darkBlockSummaryLabelRowRight}>
                <Text style={styles.darkBlockSummaryLabel}>
                  {headerSummary.labelOut}
                </Text>
                <SummaryPulseIcon
                  name="arrow-circle-down"
                  size={14}
                  color={Theme.teslaRed}
                  style={styles.darkBlockSummaryIcon}
                />
              </View>
              <Text
                style={[
                  styles.darkBlockSummaryAmount,
                  styles.darkBlockSummaryAmountOut,
                ]}
              >
                {formatINR(headerSummary.valueOut)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {(isCustomerOrSupplier || isVehicle) && detailTab === "ledger" ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {isWebDesktop ? (
          <View style={styles.ledgerViewModeRow}>
            <TouchableOpacity
              style={[
                styles.ledgerViewModePill,
                entityLedgerViewMode === "table" && styles.ledgerViewModePillActive,
              ]}
              onPress={() => setEntityLedgerViewMode("table")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.ledgerViewModePillText,
                  entityLedgerViewMode === "table" && styles.ledgerViewModePillTextActive,
                ]}
              >
                {t("tableView")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.ledgerViewModePill,
                entityLedgerViewMode === "transaction" && styles.ledgerViewModePillActive,
              ]}
              onPress={() => setEntityLedgerViewMode("transaction")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.ledgerViewModePillText,
                  entityLedgerViewMode === "transaction" && styles.ledgerViewModePillTextActive,
                ]}
              >
                {t("transactionView")}
              </Text>
            </TouchableOpacity>
          </View>
          ) : null}

          {(!isWebDesktop || entityLedgerViewMode === "transaction") ? (
            selectedEntityTransactions && selectedEntityTransactions.length > 0 ? (
              <LedgerTransactionListView
                transactions={selectedEntityTransactions}
                showTitle={false}
                driverRows={ledgerDriverRowsForAvatars}
              />
            ) : (
              <View style={styles.ledgerEmptyRow}>
                <Text style={styles.ledgerEmptyText} numberOfLines={3}>
                  {t("noLedgerEntriesForEntity")}
                </Text>
              </View>
            )
          ) : (
          <View style={styles.tableWrap}>
            <View style={styles.ledgerTableHeaderWrap}>
              <View style={styles.ledgerTableHeader}>
                <Text
                  style={[styles.ledgerTh, styles.ledgerThNode]}
                  numberOfLines={1}
                >
                  PARTY
                </Text>
                <Text
                  style={[
                    styles.ledgerTh,
                    styles.ledgerThMission,
                    styles.ledgerThBorderLeft,
                  ]}
                  numberOfLines={1}
                >
                  TRIP
                </Text>
                <Text
                  style={[
                    styles.ledgerTh,
                    styles.ledgerThCredit,
                    styles.ledgerThBorderLeft,
                  ]}
                  numberOfLines={1}
                >
                  RECEIVED
                </Text>
                <Text
                  style={[
                    styles.ledgerTh,
                    styles.ledgerThDebit,
                    styles.ledgerThBorderLeft,
                  ]}
                  numberOfLines={1}
                >
                  PAID
                </Text>
                <View style={styles.ledgerThSpacer} />
              </View>
            </View>
            <View style={styles.ledgerTableBodyWrap}>
              {!selectedEntityTransactions ||
              selectedEntityTransactions.length === 0 ? (
                <View style={styles.ledgerEmptyRow}>
                  <Text style={styles.ledgerEmptyText} numberOfLines={3}>
                    {t("noLedgerEntriesForEntity")}
                  </Text>
                </View>
              ) : (
                selectedEntityTransactions.map((tx) => {
                  const desc = tx.description ?? "";
                  const categoryLabel = ALL_LEDGER_CATEGORY_VALUES.includes(
                    desc,
                  )
                    ? desc
                    : "GENERAL";
                  const isDriverPayment = isEmployeeDriverLedgerPayment(tx);
                  const isClientOrSupplier =
                    tx.contact_type === "client" ||
                    tx.contact_type === "supplier" ||
                    tx.contact_type === "dco";
                  const vehicleNum = tx.vehicle_number ?? null;
                  // Party column: show person name for client/supplier/driver; show vehicle only for vehicle expense (no contact).
                  const entityName = isDriverPayment
                    ? tx.driver_name || tx.party_name || "—"
                    : isClientOrSupplier
                      ? tx.party_name || "—"
                      : vehicleNum
                        ? vehicleNum
                        : (tx.party_name ?? "—");
                  const tripDisplayResolved = getTripOperationalDisplay({
                    trip_number: tx["trip_number"] ?? null,
                  });
                  const tripDisplay =
                    tripDisplayResolved !== "—" ? tripDisplayResolved : null;
                  const entryDateStr = formatLedgerDate(
                    tx.transaction_date ?? tx.created_at ?? "",
                  );
                  const restSublineDriver =
                    isDriverPayment && tripDisplay
                      ? `${tripDisplay} · ${categoryLabel}`
                      : (tx.description ?? "");
                  const restSublineTrip =
                    tripDisplay != null
                      ? `${tripDisplay} · ${tx.description || categoryLabel}`
                      : (tx.description ?? "");
                  const sublineForDriver =
                    entryDateStr === "—"
                      ? restSublineDriver
                      : restSublineDriver
                        ? `${entryDateStr} · ${restSublineDriver}`
                        : entryDateStr;
                  const sublineWithTrip =
                    entryDateStr === "—"
                      ? restSublineTrip
                      : restSublineTrip
                        ? `${entryDateStr} · ${restSublineTrip}`
                        : entryDateStr;
                  const tripDetail =
                    tx.trip_id != null && ledgerTripDetailsMap[tx.trip_id]
                      ? ledgerTripDetailsMap[tx.trip_id]
                      : null;
                  const sameTrip =
                    tx.trip_id != null
                      ? selectedEntityTransactions.filter(
                          (r) => r.trip_id != null && r.trip_id === tx.trip_id,
                        )
                      : [];
                  const tripPaymentSummary =
                    sameTrip.length > 0
                      ? {
                          received: sameTrip.reduce(
                            (s, r) => s + (r.amount_in ?? 0),
                            0,
                          ),
                          paid: sameTrip.reduce(
                            (s, r) => s + (r.amount_out ?? 0),
                            0,
                          ),
                          entryCount: sameTrip.length,
                        }
                      : undefined;
                  const sameTripTransactions =
                    sameTrip.length > 0
                      ? sameTrip.map((r) => {
                          const isDr = isEmployeeDriverLedgerPayment(r);
                          const isCS =
                            r.contact_type === "client" ||
                            r.contact_type === "supplier" ||
                            r.contact_type === "dco";
                          const party = isDr
                            ? r.driver_name || r.party_name || "—"
                            : isCS
                              ? r.party_name || "—"
                              : r.vehicle_number
                                ? r.vehicle_number
                                : (r.party_name ?? "—");
                          return {
                            id: r.id,
                            date: formatLedgerDate(
                              r.transaction_date ?? r.created_at ?? "",
                            ),
                            typeLabel: getDoubleEntryDisplayLabel(r) ?? "—",
                            in: r.amount_in ?? 0,
                            out: r.amount_out ?? 0,
                            party,
                          };
                        })
                      : undefined;
                  const ledgerPartyType =
                    tx.contact_type === "client"
                      ? "client"
                      : tx.contact_type === "supplier" || tx.contact_type === "dco"
                        ? "supplier"
                        : tx.contact_type === "driver"
                          ? "driver"
                          : "vehicle";
                  const data: FinancialRowData = {
                    id: tx.id,
                    name: entityName,
                    subline: isDriverPayment
                      ? sublineForDriver
                      : sublineWithTrip,
                    category: categoryLabel,
                    desc: tx.description,
                    tripId: tx.trip_id ?? null,
                    msn:
                      (tx["trip_number"] ?? "").trim() ||
                      (tx.trip_id ? "Trip" : "General"),
                    tripDetail: tripDetail ?? undefined,
                    vehicleNumber: isDriverPayment ? null : vehicleNum,
                    driverName: tx.driver_name ?? undefined,
                    ledgerPartyType,
                    in: tx.amount_in ?? 0,
                    out: tx.amount_out ?? 0,
                    transaction_date: tx.transaction_date,
                    transactionTypeLabel:
                      getDoubleEntryDisplayLabel(tx) ?? undefined,
                    tripPaymentSummary: tripPaymentSummary ?? undefined,
                    sameTripTransactions: sameTripTransactions ?? undefined,
                  };
                  return (
                    <FinancialRow
                      key={tx.id}
                      type="ledger"
                      data={data}
                      ledgerExpandedDesktopThreeColumn
                    />
                  );
                })
              )}
            </View>
          </View>
          )}
        </ScrollView>
      ) : isDriver && driverDetailTab === "profile" ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {driverProfile ? (
            <>
              <View style={styles.driverMetricsGrid}>
                <View style={styles.driverMetricCard}>
                  <FontAwesome
                    name="shield"
                    size={16}
                    color={
                      driverProfile.status === "online" ||
                      driverProfile.status === "on_trip"
                        ? Theme.darkGreen
                        : Theme.textMuted
                    }
                    style={styles.driverMetricIcon}
                  />
                  <Text style={styles.driverMetricLabel}>STATUS</Text>
                  <Text
                    style={[
                      styles.driverMetricValue,
                      (driverProfile.status === "online" ||
                        driverProfile.status === "on_trip") &&
                        styles.driverMetricValueActive,
                    ]}
                    numberOfLines={1}
                  >
                    {driverProfile.status === "on_trip"
                      ? "On trip"
                      : driverProfile.status === "online"
                        ? "Online"
                        : driverProfile.left_at
                          ? "Disconnected"
                          : "Offline"}
                  </Text>
                </View>
                <View style={styles.driverMetricCard}>
                  <FontAwesome
                    name="clock-o"
                    size={16}
                    color={Theme.primary}
                    style={styles.driverMetricIcon}
                  />
                  <Text style={styles.driverMetricLabel}>JOINED</Text>
                  <Text style={styles.driverMetricValue} numberOfLines={1}>
                    {driverProfile.created_at
                      ? formatRelative(driverProfile.created_at)
                      : "—"}
                  </Text>
                </View>
              </View>
              <View style={styles.driverContactCard}>
                <View style={styles.driverContactTwoCol}>
                  <View
                    style={[
                      styles.driverContactRow,
                      styles.driverContactRowHalf,
                    ]}
                  >
                    <View style={styles.driverContactIconWrap}>
                      <FontAwesome
                        name="phone"
                        size={14}
                        color={Theme.primary}
                      />
                    </View>
                    <View style={styles.driverContactTextWrap}>
                      <Text style={styles.driverContactLabel}>PHONE NUMBER</Text>
                      <Text
                        style={styles.driverContactValue}
                        numberOfLines={2}
                      >
                        {driverProfile.phone ?? "—"}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.driverContactRow,
                      styles.driverContactRowHalf,
                    ]}
                  >
                    <View
                      style={[
                        styles.driverContactIconWrap,
                        styles.driverContactIconWrapPurple,
                      ]}
                    >
                      <FontAwesome
                        name="envelope"
                        size={14}
                        color={Theme.primary}
                      />
                    </View>
                    <View style={styles.driverContactTextWrap}>
                      <Text style={styles.driverContactLabel}>EMAIL ADDRESS</Text>
                      <Text
                        style={styles.driverContactValue}
                        numberOfLines={2}
                      >
                        {driverProfile.email ?? "—"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
              {vehicles.length > 0 && onAssignVehicle && (
                <View style={styles.driverContactCard}>
                  <View style={styles.driverContactRow}>
                    <View
                      style={[
                        styles.driverContactIconWrap,
                        styles.driverContactIconWrapPurple,
                      ]}
                    >
                      <FontAwesome
                        name="truck"
                        size={14}
                        color={Theme.primary}
                      />
                    </View>
                    <View style={styles.driverContactTextWrap}>
                      <Text style={styles.driverContactLabel}>
                        ASSIGNED VEHICLE
                      </Text>
                      <Text style={styles.driverContactValue}>
                        {assignedVehicle
                          ? formatIndianVehicleNumber(assignedVehicle.vehicle_number)
                          : assignedVehicleDisplayFromTrips ?? "—"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.driverAssignVehicleBtn}
                      onPress={() => setShowVehiclePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.driverAssignVehicleBtnText}>
                        {assignedVehicle || assignedVehicleDisplayFromTrips
                          ? "Reassign"
                          : "Assign"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <View style={styles.driverCompensationCard}>
                <View style={styles.driverCompensationHeader}>
                  <FontAwesome
                    name="money"
                    size={14}
                    color={Theme.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.driverCompensationHeaderText}>
                    COMPENSATION TERMS
                  </Text>
                </View>
                <View style={styles.driverCompensationBody}>
                  <View style={styles.driverCompensationCell}>
                    <Text style={styles.driverCompensationCellLabel}>
                      Base Salary (Payable)
                    </Text>
                    <Text
                      style={styles.driverCompensationCellValue}
                      numberOfLines={2}
                    >
                      {driverOffer?.payableAmount != null &&
                      Number(driverOffer.payableAmount) > 0
                        ? `${formatINR(Number(driverOffer.payableAmount))} / mo`
                        : "—"}
                    </Text>
                  </View>
                  <View style={styles.driverCompensationColumnDivider} />
                  <View style={styles.driverCompensationCell}>
                    <Text style={styles.driverCompensationCellLabel}>
                      Trip Commission
                    </Text>
                    <Text
                      style={styles.driverCompensationCellValue}
                      numberOfLines={2}
                    >
                      {driverOffer?.commissionPercent != null &&
                      Number(driverOffer.commissionPercent) > 0
                        ? `${driverOffer.commissionPercent}%`
                        : "—"}
                    </Text>
                  </View>
                  <View style={styles.driverCompensationColumnDivider} />
                  <View style={styles.driverCompensationCell}>
                    <Text style={styles.driverCompensationCellLabel}>
                      Per-KM Rate
                    </Text>
                    <Text
                      style={styles.driverCompensationCellValue}
                      numberOfLines={2}
                    >
                      {driverOffer?.commissionPerKm != null &&
                      Number(driverOffer.commissionPerKm) > 0
                        ? `₹${driverOffer.commissionPerKm} / km`
                        : "—"}
                    </Text>
                  </View>
                </View>
              </View>
              <View
                style={styles.driverProfileInsightsCard}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0) setDriverRatingsBandInnerWidth(w);
                }}
              >
                <View style={styles.driverProfileInsightsHalf}>
                  <Text style={styles.driverProfileInsightsLabel}>
                    GLOBAL AVG RATING
                  </Text>
                  <Text style={styles.driverProfileInsightsValue}>
                    {driverProfileGlobalAvgRating != null
                      ? `${driverProfileGlobalAvgRating.toFixed(1)} ★`
                      : "—"}
                  </Text>
                  {entity.ratingCount != null && entity.ratingCount > 0 ? (
                    <Text style={styles.driverProfileInsightsHint}>
                      {entity.ratingCount} reviews
                    </Text>
                  ) : null}
                </View>
                <View style={styles.driverProfileInsightsDivider} />
                <View style={styles.driverProfileInsightsHalf}>
                  <Text style={styles.driverProfileInsightsLabel}>
                    TRIPS OPERATED IN APP
                  </Text>
                  <Text style={styles.driverProfileInsightsValue}>
                    {driverTripsOperatedInAppCount}
                  </Text>
                </View>
              </View>
              {driverRatings.length > 0 && (
                <View style={styles.driverRatingsSection}>
                  <Text style={styles.driverRatingsSectionTitle}>
                    RECENT RATINGS
                  </Text>
                  <View
                    style={[
                      styles.driverRatingsGrid,
                      { gap: driverRatingGridGap },
                    ]}
                  >
                    {driverRatings.map((r) => {
                      const routeLabel =
                        tripRouteLabelByTripId.get(String(r.trip_id)) ??
                        "Route unavailable";
                      return (
                        <View
                          key={r.id}
                          style={[
                            styles.driverRatingCard,
                            { width: driverRatingCardWidth },
                          ]}
                        >
                          <View style={styles.driverRatingCardHeader}>
                            <View style={styles.driverRatingIconWrap}>
                              <FontAwesome
                                name="star"
                                size={13}
                                color={Theme.driverGold}
                              />
                            </View>
                            <View style={styles.driverRatingScoreCol}>
                              <Text style={styles.driverRatingScore}>
                                {r.score.toFixed(1)}
                                <Text style={styles.driverRatingScoreMax}>
                                  {" "}
                                  / 5.0
                                </Text>
                              </Text>
                              <Text
                                style={styles.driverRatingDate}
                                numberOfLines={1}
                              >
                                {r.created_at ? formatRelative(r.created_at) : ""}
                              </Text>
                            </View>
                          </View>
                          <Text
                            style={styles.driverRatingRoute}
                            numberOfLines={2}
                          >
                            {routeLabel}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </>
          ) : isDriver ? (
            <View style={styles.driverContactCard}>
              <View style={styles.driverMetricsGrid}>
                <View style={styles.driverMetricCard}>
                  <FontAwesome
                    name="shield"
                    size={16}
                    color={Theme.textMuted}
                    style={styles.driverMetricIcon}
                  />
                  <Text style={styles.driverMetricLabel}>STATUS</Text>
                  <Text style={styles.driverMetricValue} numberOfLines={1}>
                    {entity.status === "ACTIVE"
                      ? "Online"
                      : entity.status === "DISCONNECTED" || entity.left_at
                        ? "Disconnected"
                        : entity.status ?? "Offline"}
                  </Text>
                </View>
              </View>
              <Text style={styles.driverContactLabel}>
                {entity.name ?? entity.id ?? "—"}
              </Text>
              <Text style={[styles.driverContactValue, { marginTop: 4 }]}>
                Phone and email are shown when the driver profile is loaded. Use Ledger and Statement tabs for payments and trips.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : isDriver && driverDetailTab === "ledger" ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.tableWrap}>
            {rows.length > 0 ? (
              <View style={styles.ledgerSummaryRow}>
                <View style={styles.ledgerSummaryCell}>
                  <Text style={styles.ledgerSummaryLabel}>TOTAL EARNED</Text>
                  <Text style={styles.ledgerSummaryAmount}>
                    {formatINR(
                      rows.reduce((s, r) => s + Number(r.col1 ?? 0), 0),
                    )}
                  </Text>
                </View>
                <View
                  style={[
                    styles.ledgerSummaryCell,
                    styles.ledgerSummaryCellBorder,
                  ]}
                >
                  <Text style={styles.ledgerSummaryLabel}>
                    {t("totalPaid")}
                  </Text>
                  <Text
                    style={[styles.ledgerSummaryAmount, styles.ledgerSummaryIn]}
                  >
                    {formatINR(
                      rows.reduce((s, r) => s + Number(r.col2 ?? 0), 0),
                    )}
                  </Text>
                </View>
                <View
                  style={[
                    styles.ledgerSummaryCell,
                    styles.ledgerSummaryCellBorder,
                  ]}
                >
                  <Text style={styles.ledgerSummaryLabel}>{t("toPay")}</Text>
                  <Text
                    style={[
                      styles.ledgerSummaryAmount,
                      styles.ledgerSummaryOut,
                    ]}
                  >
                    {formatINR(
                      rows.reduce((s, r) => s + Number(r.col3 ?? 0), 0),
                    )}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.ledgerTableHeaderWrap}>
              <View style={styles.ledgerTableHeader}>
                <Text
                  style={[styles.ledgerTh, styles.driverLedgerThColRouteDate]}
                  numberOfLines={1}
                >
                  TRIP
                </Text>
                <Text
                  style={[
                    styles.ledgerTh,
                    styles.driverLedgerThCol,
                    styles.driverLedgerThColRight,
                    styles.ledgerThBorderLeft,
                  ]}
                  numberOfLines={1}
                >
                  EARNED
                </Text>
                <Text
                  style={[
                    styles.ledgerTh,
                    styles.driverLedgerThCol,
                    styles.driverLedgerThColRight,
                    styles.ledgerThBorderLeft,
                  ]}
                  numberOfLines={1}
                >
                  {t("paid")}
                </Text>
                <Text
                  style={[
                    styles.ledgerTh,
                    styles.driverLedgerThCol,
                    styles.driverLedgerThColRight,
                    styles.ledgerThBorderLeft,
                  ]}
                  numberOfLines={1}
                >
                  {t("toPay")}
                </Text>
                <View style={styles.ledgerThSpacer} />
              </View>
            </View>
            <View style={styles.ledgerTableBodyWrap}>
              {rows.length === 0 ? (
                <View style={styles.ledgerEmptyRow}>
                  <Text style={styles.ledgerEmptyText} numberOfLines={3}>
                    {t("noLedgerEntriesDriver")}
                  </Text>
                </View>
              ) : (
                rows.map((r) => {
                  const rowWithDate = r as {
                    tripDate?: string;
                    tripDateIso?: string;
                    agingLabel?: string;
                  };
                  const category =
                    r.id === "ledger-adjustment" || (r.missionId ?? "") === "—"
                      ? "GENERAL"
                      : "TRIP";
                  const expanded = expandedDriverLedgerRowId === r.id;
                  return (
                    <View key={r.id} style={styles.ledgerRowWrapper}>
                      <Pressable
                        style={(state: HoverPressState) => [
                          styles.tableRow,
                          WEB_POINTER,
                          WEB_TRANSITION,
                          expanded && hoverRowSelected,
                          isHovered(state) && [styles.ledgerRowPressed, hoverRowWash],
                        ]}
                        onPress={() =>
                          setExpandedDriverLedgerRowId((id) =>
                            id === r.id ? null : r.id,
                          )
                        }
                        android_ripple={undefined}
                      >
                        <View
                          style={[
                            styles.driverLedgerTdColRouteDate,
                            styles.driverLedgerTdColRouteDateContent,
                          ]}
                        >
                          <Text style={styles.tdMissionId} numberOfLines={1}>
                            {r.missionId ?? "—"}
                          </Text>
                          <Text
                            style={styles.ledgerCellSubCategory}
                            numberOfLines={1}
                          >
                            {category}
                          </Text>
                          <Text
                            style={[
                              styles.ledgerRouteText,
                              styles.ledgerRouteTextBlock,
                            ]}
                            numberOfLines={2}
                          >
                            {r.dest?.trim() || "—"}
                          </Text>
                          <Text
                            style={styles.ledgerCellSubDate}
                            numberOfLines={1}
                          >
                            {formatLedgerDateTime(rowWithDate.tripDateIso) ||
                              "—"}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.driverLedgerTdColAmount,
                            styles.ledgerTdBorderLeft,
                          ]}
                        >
                          <Text
                            style={[
                              styles.td,
                              (r.col1 ?? 0) > 0
                                ? styles.tdDark
                                : styles.tdMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {(r.col1 ?? 0) > 0
                              ? formatLedgerAmount(r.col1)
                              : "—"}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.driverLedgerTdColAmount,
                            styles.ledgerTdBorderLeft,
                          ]}
                        >
                          <Text
                            style={[
                              styles.td,
                              (r.col2 ?? 0) > 0
                                ? styles.tdGreen
                                : styles.tdMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {(r.col2 ?? 0) > 0
                              ? formatLedgerAmount(r.col2)
                              : "—"}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.driverLedgerTdColAmount,
                            styles.ledgerTdBorderLeft,
                          ]}
                        >
                          <Text
                            style={[
                              styles.td,
                              (r.col3 ?? 0) > 0 ? styles.tdRed : styles.tdMuted,
                            ]}
                            numberOfLines={1}
                          >
                            {(r.col3 ?? 0) > 0
                              ? formatLedgerAmount(r.col3)
                              : "—"}
                          </Text>
                        </View>
                        <View style={styles.ledgerRowActionHint}>
                          <FontAwesome
                            name={expanded ? "chevron-down" : "chevron-right"}
                            size={10}
                            color={Theme.textMutedDemo}
                          />
                        </View>
                      </Pressable>
                      {expanded ? (
                        <View style={styles.ledgerExpandedDetail}>
                          <View style={styles.ledgerExpandedBlock}>
                            <Text style={styles.ledgerExpandedBlockTitle}>
                              TRIP
                            </Text>
                            <View style={styles.ledgerExpandedBlockContent}>
                              <View style={[styles.ledgerExpandedRowDouble, rowWithDate.agingLabel ? undefined : styles.ledgerExpandedRowLast]}>
                                <View style={styles.ledgerExpandedHalf}>
                                  <Text style={styles.ledgerExpandedLabelSmall}>
                                    Mission
                                  </Text>
                                  <Text
                                    style={styles.ledgerExpandedValue}
                                    numberOfLines={1}
                                  >
                                    {r.missionId ?? "—"}
                                  </Text>
                                </View>
                                <View style={[styles.ledgerExpandedHalf, !rowWithDate.agingLabel && styles.ledgerExpandedHalfLast]}>
                                  <Text style={styles.ledgerExpandedLabelSmall}>
                                    Date
                                  </Text>
                                  <Text style={styles.ledgerExpandedValue}>
                                    {formatLedgerDateTime(
                                      rowWithDate.tripDateIso,
                                    ) || "—"}
                                  </Text>
                                </View>
                              </View>
                              <View style={[styles.ledgerExpandedRow, !rowWithDate.agingLabel && styles.ledgerExpandedRowLast]}>
                                <Text style={styles.ledgerExpandedLabelSmall}>
                                  Route
                                </Text>
                                <Text
                                  style={styles.ledgerExpandedValue}
                                  numberOfLines={2}
                                >
                                  {r.dest?.trim() || "—"}
                                </Text>
                              </View>
                              {rowWithDate.agingLabel ? (
                                <View style={[styles.ledgerExpandedRow, styles.ledgerExpandedRowLast]}>
                                  <Text style={styles.ledgerExpandedLabelSmall}>
                                    Aging
                                  </Text>
                                  <Text style={styles.ledgerExpandedValue}>
                                    {rowWithDate.agingLabel}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                          <View style={styles.ledgerExpandedBlock}>
                            <Text style={styles.ledgerExpandedBlockTitle}>
                              PAYMENT
                            </Text>
                            <View style={styles.ledgerExpandedBlockContent}>
                              <View style={styles.ledgerExpandedPaymentDark}>
                                <View style={styles.ledgerExpandedRowTriple}>
                                  <View style={styles.ledgerExpandedTripleCell}>
                                    <Text style={styles.ledgerExpandedLabelOnDark}>
                                      Earned
                                    </Text>
                                    <Text
                                      style={styles.ledgerExpandedValueOnDark}
                                      numberOfLines={1}
                                    >
                                      {(r.col1 ?? 0) > 0 ? formatINR(r.col1) : "—"}
                                    </Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.ledgerExpandedTripleCell,
                                      styles.ledgerExpandedTripleCellAmount,
                                    ]}
                                  >
                                    <Text style={styles.ledgerExpandedLabelOnDark}>
                                      Paid
                                    </Text>
                                    <Text
                                      style={[
                                        styles.ledgerExpandedValueOnDark,
                                        (r.col2 ?? 0) > 0 &&
                                          styles.ledgerExpandedValueOnDarkGreen,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {(r.col2 ?? 0) > 0 ? formatINR(r.col2) : "—"}
                                    </Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.ledgerExpandedTripleCell,
                                      styles.ledgerExpandedTripleCellAmount,
                                    ]}
                                  >
                                    <Text style={styles.ledgerExpandedLabelOnDark}>
                                      To pay
                                    </Text>
                                    <Text
                                      style={[
                                        styles.ledgerExpandedValueOnDark,
                                        (r.col3 ?? 0) > 0 &&
                                          styles.ledgerExpandedValueOnDarkRed,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {(r.col3 ?? 0) > 0 ? formatINR(r.col3) : "—"}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            </View>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      ) : isDriver && driverDetailTab === "statement" ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardWrap}>
            <TreasurySummaryCard
              fullWidth
              totalIn={amountIn}
              totalOut={amountOut}
              labelIn={labels.in}
              labelOut={labels.out}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search month…"
              onReportPress={canViewFinanceReports ? handleReportPress : undefined}
            />
          </View>
          <View style={styles.tableWrap}>
            <Text style={styles.sectionTitle}>
              {t("monthlySalaryStatement")}
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.thMonth]} numberOfLines={1}>
                  {t("month").toUpperCase()}
                </Text>
                <Text style={[styles.th, styles.thCol]} numberOfLines={1}>
                  {t("salaryShort")}
                </Text>
                <Text style={[styles.th, styles.thCol]} numberOfLines={1}>
                  {t("commShort")}
                </Text>
                <Text style={[styles.th, styles.thColLast]} numberOfLines={1}>
                  {t("paid")}
                </Text>
              </View>
              {monthlyRowsReversed.length === 0 ? (
                <View style={styles.tableRow}>
                  <Text style={[styles.td, styles.tdMission]} numberOfLines={1}>
                    {t("noStatementDataYet")}
                  </Text>
                </View>
              ) : (
                <>
                  {monthlyRowsReversed.map((row) => {
                    const isExpanded = expandedMonthKey === row.monthKey;
                    const detail =
                      monthlyStatement?.detailsByMonth[row.monthKey];
                    return (
                      <View key={row.monthKey}>
                        <Pressable
                          style={(state: HoverPressState) => [
                            styles.tableRow,
                            isExpanded && styles.tableRowExpanded,
                            WEB_POINTER,
                            WEB_TRANSITION,
                            isHovered(state) && hoverRowWash,
                          ]}
                          onPress={() =>
                            setExpandedMonthKey((k) =>
                              k === row.monthKey ? null : row.monthKey,
                            )
                          }
                        >
                          <View style={styles.tdMonth}>
                            <Text style={styles.tdMissionId} numberOfLines={1}>
                              {row.label}
                            </Text>
                            <Text style={styles.tdDest} numberOfLines={1}>
                              {row.tripCount} trips, {row.ledgerEntryCount}{" "}
                              payments
                            </Text>
                          </View>
                          <View style={styles.tdCol}>
                            <Text
                              style={[
                                styles.td,
                                row.fixedSalary > 0
                                  ? styles.tdDark
                                  : styles.tdMuted,
                              ]}
                              numberOfLines={1}
                            >
                              {row.fixedSalary > 0
                                ? formatINR(row.fixedSalary)
                                : "₹0"}
                            </Text>
                          </View>
                          <View style={styles.tdCol}>
                            <Text
                              style={[
                                styles.td,
                                row.tripCommission > 0
                                  ? styles.tdDark
                                  : styles.tdMuted,
                              ]}
                              numberOfLines={1}
                            >
                              {row.tripCommission > 0
                                ? formatINR(row.tripCommission)
                                : "₹0"}
                            </Text>
                          </View>
                          <View style={styles.tdColLast}>
                            <Text
                              style={[
                                styles.td,
                                row.paidTotal > 0
                                  ? styles.tdGreen
                                  : styles.tdMuted,
                              ]}
                              numberOfLines={1}
                            >
                              {row.paidTotal > 0
                                ? formatINR(row.paidTotal)
                                : "₹0"}
                            </Text>
                            <Text
                              style={[
                                styles.tdBalance,
                                row.balanceAfter === 0
                                  ? styles.tdGreen
                                  : styles.tdRed,
                              ]}
                              numberOfLines={1}
                            >
                              {formatINR(row.balanceAfter)}
                            </Text>
                          </View>
                        </Pressable>
                        {isExpanded && detail && (
                          <View style={styles.monthDetailWrap}>
                            <View style={styles.monthDetailSectionCard}>
                            <Text style={styles.monthDetailDarkBarTitle}>
                              Earnings & balance
                            </Text>
                            <View style={styles.monthDetailSectionContent}>
                              <View style={styles.earningsSummaryRow}>
                                <Text
                                  style={styles.earningsSummaryLabel}
                                  numberOfLines={1}
                                >
                                  Salary
                                </Text>
                                <Text
                                  style={styles.earningsSummaryValue}
                                  numberOfLines={1}
                                >
                                  {formatINR(row.fixedSalary)}
                                </Text>
                              </View>
                              <View style={styles.earningsSummaryRow}>
                                <Text
                                  style={styles.earningsSummaryLabel}
                                  numberOfLines={1}
                                >
                                  Trip-based commission
                                </Text>
                                <Text
                                  style={styles.earningsSummaryValue}
                                  numberOfLines={1}
                                >
                                  {formatINR(row.tripCommission)}
                                </Text>
                              </View>
                              {row.otherEarnings > 0 && (
                                <View style={styles.earningsSummaryRow}>
                                  <Text
                                    style={styles.earningsSummaryLabel}
                                    numberOfLines={1}
                                  >
                                    Other earnings
                                  </Text>
                                  <Text
                                    style={styles.earningsSummaryValue}
                                    numberOfLines={1}
                                  >
                                    {formatINR(row.otherEarnings)}
                                  </Text>
                                </View>
                              )}
                              <View
                                style={[
                                  styles.earningsSummaryRow,
                                  styles.earningsSummaryRowTotal,
                                ]}
                              >
                                <Text
                                  style={styles.earningsSummaryLabelBold}
                                  numberOfLines={1}
                                >
                                  Total earnings (due)
                                </Text>
                                <Text
                                  style={styles.earningsSummaryValueBold}
                                  numberOfLines={1}
                                >
                                  {formatINR(row.totalEarnings)}
                                </Text>
                              </View>
                              <View style={styles.earningsSummaryRow}>
                                <Text
                                  style={styles.earningsSummaryLabel}
                                  numberOfLines={1}
                                >
                                  Paid
                                </Text>
                                <Text
                                  style={[
                                    styles.earningsSummaryValue,
                                    styles.tdGreen,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {formatINR(row.paidTotal)}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.earningsSummaryRow,
                                  styles.earningsSummaryRowBalance,
                                ]}
                              >
                                <Text
                                  style={styles.earningsSummaryLabelBold}
                                  numberOfLines={1}
                                >
                                  Balance (still to pay)
                                </Text>
                                <Text
                                  style={[
                                    styles.earningsSummaryValueBold,
                                    row.balanceAfter < 0 && styles.tdRed,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {formatINR(row.balanceAfter)}
                                  {row.balanceAfter < 0
                                    ? ` ${t("overpaymentAdvance")}`
                                    : ""}
                                </Text>
                              </View>
                            </View>
                            </View>
                            <View style={styles.monthDetailTripsBlock}>
                              <Text style={styles.monthDetailDarkBarTitle}>
                                {t("tripsCount")} ({detail.trips.length})
                              </Text>
                              <View style={styles.monthDetailSectionContent}>
                              <View style={styles.monthDetailHeaderRow}>
                                <Text
                                  style={styles.monthDetailHeaderCell}
                                  numberOfLines={1}
                                >
                                  TRIP ID
                                </Text>
                                <Text
                                  style={[
                                    styles.monthDetailHeaderCell,
                                    styles.tdRight,
                                  ]}
                                  numberOfLines={1}
                                >
                                  COMMISSION
                                </Text>
                                <Text
                                  style={[
                                    styles.monthDetailHeaderCell,
                                    styles.tdRight,
                                  ]}
                                  numberOfLines={1}
                                >
                                  PAID
                                </Text>
                                <Text
                                  style={[
                                    styles.monthDetailHeaderCell,
                                    styles.tdRightLast,
                                  ]}
                                  numberOfLines={1}
                                >
                                  DUE
                                </Text>
                              </View>
                              {detail.trips.length === 0
                                ? null
                                : detail.trips.map((t) => (
                                    <View
                                      key={t.id}
                                      style={styles.monthDetailRow}
                                    >
                                      <Text
                                        style={styles.monthDetailCell}
                                        numberOfLines={1}
                                      >
                                        {t.missionId}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.monthDetailCell,
                                          styles.tdRight,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {formatINR(t.commission)}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.monthDetailCell,
                                          styles.tdRight,
                                          styles.tdGreen,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {formatINR(t.paid)}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.monthDetailCell,
                                          styles.tdRightLast,
                                          styles.tdRed,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {formatINR(t.due)}
                                      </Text>
                                    </View>
                                  ))}
                              </View>
                            </View>
                            <View style={styles.monthDetailPaymentsBlock}>
                              <Text style={styles.monthDetailDarkBarTitle}>
                                Payments ({detail.ledgerEntries.length})
                              </Text>
                              <View style={styles.monthDetailSectionContent}>
                              <View style={styles.monthDetailHeaderRow}>
                                <Text
                                  style={styles.monthDetailHeaderCellWide}
                                  numberOfLines={1}
                                >
                                  DATE / TYPE
                                </Text>
                                <Text
                                  style={[
                                    styles.monthDetailHeaderCell,
                                    styles.tdRightLast,
                                  ]}
                                  numberOfLines={1}
                                >
                                  AMOUNT
                                </Text>
                              </View>
                              {detail.ledgerEntries.length === 0 ? (
                                <Text style={styles.monthDetailEmptyPayments}>
                                  No general payments recorded
                                </Text>
                              ) : (
                                detail.ledgerEntries.map((e) => (
                                  <View
                                    key={e.id}
                                    style={styles.monthDetailRow}
                                  >
                                    <Text
                                      style={styles.monthDetailCellWide}
                                      numberOfLines={1}
                                    >
                                      {e.date} {e.type}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.monthDetailCell,
                                        styles.tdRightLast,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {formatINR(e.amount)}
                                    </Text>
                                  </View>
                                ))
                              )}
                              </View>
                            </View>
                            {detail.trips.length === 0 &&
                              detail.ledgerEntries.length === 0 && (
                                <View style={styles.monthDetailSectionCard}>
                                  <Text style={styles.monthDetailDarkBarTitle}>
                                    No entries this month
                                  </Text>
                                </View>
                              )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {isVehicle && drivers.length > 0 && onAssignDriver && (
            <View style={styles.driverContactCard}>
              <View style={styles.driverContactRow}>
                <View
                  style={[
                    styles.driverContactIconWrap,
                    styles.driverContactIconWrapPurple,
                  ]}
                >
                  <FontAwesome
                    name="user"
                    size={14}
                    color={Theme.primary}
                  />
                </View>
                <View style={styles.driverContactTextWrap}>
                  <Text style={styles.driverContactLabel}>
                    ASSIGNED DRIVER
                  </Text>
                  <Text style={styles.driverContactValue}>
                    {assignedDriverForVehicle?.name ?? "—"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.driverAssignVehicleBtn}
                  onPress={() => setShowDriverPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.driverAssignVehicleBtnText}>
                    {assignedDriverForVehicle ? "Change" : "Assign"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {/* Search + report only; summary is in the black header above. */}
          <View style={styles.cardWrap}>
            <TreasurySummaryCard
              fullWidth
              labelIn={undefined}
              labelOut={undefined}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search trip, destination…"
              onReportPress={canViewFinanceReports ? handleReportPress : undefined}
            />
          </View>
          <>
            {entityType === "CLIENT" && organizationId && (
              <View style={styles.riskBadgeWrap}>
                <ClientRiskBadge
                  organizationId={organizationId}
                  clientId={entity.id}
                />
              </View>
            )}
            {/* Entity table: Client = receivables, Supplier = payables, Vehicle = P&L, Driver = commission/salary */}
            <View style={styles.tableWrap}>
              <Text style={styles.sectionTitle}>
                {isVehicle
                  ? "TRIP P&L"
                  : entityType === "CLIENT"
                    ? "RECEIVABLES BY TRIP"
                    : entityType === "SUPPLIER"
                      ? "PAYABLES BY TRIP"
                      : isDriver
                        ? "COMMISSION BY TRIP"
                        : "TRANSACTION LEDGER"}
              </Text>
              {(entityType === "CLIENT" || entityType === "SUPPLIER") && (
                <Text style={styles.sectionSubtitle} numberOfLines={2}>
                  {entityType === "CLIENT"
                    ? "From trip details: sale value (client billing), received, pending from client."
                    : "From trip details: supplier cost, paid, amount due to pay."}
                </Text>
              )}
              <View
                style={[
                  styles.table,
                  entityType === "SUPPLIER" &&
                    isWebDesktop &&
                    !isVehicle &&
                    styles.spWebTable,
                ]}
              >
                {entityType === "SUPPLIER" && isWebDesktop && !isVehicle ? (
                  <View style={styles.spWebTableHeaderRow}>
                    <View style={styles.spWebThClient}>
                      <Text style={styles.spWebTh} numberOfLines={1}>
                        Client
                      </Text>
                    </View>
                    <View style={styles.spWebThTrip}>
                      <Text style={styles.spWebTh} numberOfLines={1}>
                        Trip
                      </Text>
                    </View>
                    <View style={styles.spWebThParty}>
                      <Text style={styles.spWebTh} numberOfLines={1}>
                        Supplier
                      </Text>
                    </View>
                    <View style={styles.spWebThDriver}>
                      <Text style={styles.spWebTh} numberOfLines={1}>
                        Driver
                      </Text>
                    </View>
                    <View style={styles.spWebThAmt}>
                      <Text style={styles.spWebTh} numberOfLines={1}>
                        Sales
                      </Text>
                    </View>
                    <View style={styles.spWebThAmt}>
                      <Text style={styles.spWebTh} numberOfLines={1}>
                        Cost
                      </Text>
                    </View>
                    <View style={styles.spWebThAmt}>
                      <Text style={styles.spWebTh} numberOfLines={1}>
                        P&L
                      </Text>
                    </View>
                    <View style={styles.spWebThAmt}>
                      <Text style={[styles.spWebTh, styles.spWebThRight]} numberOfLines={1}>
                        Paid
                      </Text>
                    </View>
                    <View style={styles.spWebThAmt}>
                      <Text style={[styles.spWebTh, styles.spWebThRight]} numberOfLines={1}>
                        Due
                      </Text>
                    </View>
                    <View style={styles.spWebThTxn}>
                      <Text style={[styles.spWebTh, styles.spWebThRight]} numberOfLines={1}>
                        Txns
                      </Text>
                    </View>
                    <View style={styles.spWebThLastTxn}>
                      <Text style={[styles.spWebTh, styles.spWebThRight]} numberOfLines={1}>
                        Last Txn
                      </Text>
                    </View>
                    <View style={styles.entityLedgerChevronTh} />
                  </View>
                ) : (
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, styles.thMission]} numberOfLines={1}>
                      TRIP ID
                    </Text>
                    <Text style={[styles.th, styles.thRight]} numberOfLines={1}>
                      {isVehicle ? "SALES" : colLabels[0]}
                    </Text>
                    <Text style={[styles.th, styles.thRight]} numberOfLines={1}>
                      {isVehicle ? "EXPENSES" : colLabels[1]}
                    </Text>
                    <Text
                      style={[styles.th, styles.thRightLast]}
                      numberOfLines={1}
                    >
                      {isVehicle ? "PROFIT" : colLabels[2]}
                    </Text>
                    {(entityType === "CLIENT" || entityType === "SUPPLIER") && (
                      <View style={styles.entityLedgerChevronTh} />
                    )}
                  </View>
                )}
                {rows.map((r) => {
                  const rv = r as typeof r & {
                    sales?: number;
                    expense?: number;
                    net?: number;
                    margin?: number;
                    clientName?: string;
                    tripDate?: string;
                    agingLabel?: string;
                    route?: string;
                  };
                  const isVehicleRow =
                    isVehicle &&
                    rv.sales != null &&
                    r.id !== "none" &&
                    r.id !== "ledger-adjustment";
                  const isExpandableTrip =
                    r.id !== "none" && r.id !== "ledger-adjustment";
                  const hasTripDetail =
                    (rv.tripDate && rv.tripDate !== "—") ||
                    (rv.agingLabel && rv.agingLabel !== "—");
                  const isPartyLedger =
                    entityType === "CLIENT" || entityType === "SUPPLIER";
                  const isTripRow =
                    isExpandableTrip &&
                    typeof r.id === "string" &&
                    !r.id.startsWith("adj-");
                  const expanded =
                    isPartyLedger && expandedEntityLedgerRowId === r.id;
                  const tripForRow =
                    isTripRow && trips.length > 0
                      ? trips.find((t) => t.id === r.id)
                      : null;
                  const detailForRow =
                    isTripRow && ledgerTripDetailsMap[r.id]
                      ? ledgerTripDetailsMap[r.id]
                      : null;
                  const sameTripTx =
                    isTripRow && selectedEntityTransactions
                      ? selectedEntityTransactions.filter(
                          (tx) => tx.trip_id === r.id,
                        )
                      : [];
                  const showSupplierWebGrid =
                    entityType === "SUPPLIER" && isWebDesktop && !isVehicleRow;
                  const supplierWebRowOpensTrip =
                    showSupplierWebGrid && isTripRow && tripForRow != null;
                  const rowPressProps = supplierWebRowOpensTrip
                    ? {
                        onPress: () => router.push(`/trip/${r.id}` as const),
                      }
                    : isPartyLedger && isExpandableTrip
                      ? {
                          onPress: () =>
                            setExpandedEntityLedgerRowId((id) =>
                              id === r.id ? null : r.id,
                            ),
                        }
                      : {
                          onPress: () => {
                            if (isExpandableTrip) {
                              router.push(`/trip/${r.id}` as const);
                            }
                          },
                          disabled: r.id === "none",
                        };
                  return (
                    <View key={r.id}>
                      <Pressable
                        style={(state: HoverPressState) => [
                          styles.tableRow,
                          showSupplierWebGrid && styles.spWebTableRow,
                          isPartyLedger && expanded && styles.ledgerRowPressed,
                          WEB_POINTER,
                          WEB_TRANSITION,
                          isHovered(state) && hoverRowWash,
                        ]}
                        {...rowPressProps}
                      >
                        {showSupplierWebGrid && tripForRow
                          ? (() => {
                              const t = tripForRow;
                              const tid = String(r.id).trim().toLowerCase();
                              const cidKey = (t.client_id ?? "")
                                .trim()
                                .toLowerCase();
                              const clientRow = cidKey
                                ? financeClientById.get(cidKey)
                                : undefined;
                              const rawTripClientName = (
                                t.client_name ?? ""
                              ).trim();
                              const clientDisplayName =
                                (clientRow?.name ?? "").trim() ||
                                (rawTripClientName &&
                                !isUuidLikeString(t.client_name)
                                  ? rawTripClientName
                                  : "");
                              const clientNameForUi =
                                clientDisplayName || "—";
                              const supplierNameRaw =
                                t.supplier_name?.trim() ?? "";
                              const hasSupplierRef =
                                !!t.supplier_id ||
                                (!!supplierNameRaw &&
                                  !isUuidLikeString(supplierNameRaw));
                              const isAggregateTrip =
                                hasSupplierRef || isLoadBasedTrip(t);
                              const supplierNameLabel = isAggregateTrip
                                ? financeAggregateSupplierLabel(
                                    t,
                                    financeSupplierById,
                                  )
                                : "Asset / Own Vehicle";
                              const {
                                title: supplierColumnTitle,
                                sameAsClient: supplierColumnSameAsClient,
                              } = financeDisambiguateSupplierColumnLabel(
                                t,
                                supplierNameLabel,
                                clientNameForUi,
                              );
                              const supplierAv =
                                supplierPartyAvatarPropsFinance(
                                  t,
                                  supplierColumnTitle,
                                  financeSupplierById,
                                  financeLinkedOrgDisplayMap,
                                  {},
                                );
                              const expenseCaptured =
                                financeTripExpenseByTripId[tid] ?? 0;
                              const supplierRate = Number(
                                t.supplier_rate ?? 0,
                              );
                              const tripCost =
                                supplierRate > 0
                                  ? supplierRate
                                  : expenseCaptured;
                              const sales = Number(t.client_price ?? 0);
                              const tripPnl = sales - tripCost;
                              const marginPct =
                                sales > 0 ? (tripPnl / sales) * 100 : 0;
                              const driverIdKey = (t.driver_id ?? "")
                                .trim()
                                .toLowerCase();
                              const driverRow = driverIdKey
                                ? financeDriverById.get(driverIdKey)
                                : undefined;
                              const driverName =
                                (t.driver_display_name ?? "").trim() ||
                                (driverRow?.name ?? "").trim() ||
                                "—";
                              const meta =
                                financeTripTxnMetaByTripId[tid] ?? {
                                  count: 0,
                                  lastTxnDate: null,
                                };
                              const paidOut = Number(r.col2 ?? 0);
                              const dueAmt = Number(r.col3 ?? 0);
                              const routeLine =
                                [
                                  t.pickup_area,
                                  t.drop_location,
                                ]
                                  .filter(Boolean)
                                  .join(" → ") || "—";
                              const tripDateIso =
                                t.pickup_date ?? t.created_at ?? null;
                              return (
                                <>
                                  <View style={styles.spWebTdClient}>
                                    <View style={styles.spWebTdPartyAvatarRow}>
                                      <PartyAvatar
                                        name={clientNameForUi}
                                        organizationImageUrl={
                                          clientRow?.linked_organization_id
                                            ? financeLinkedOrgDisplayMap[
                                                clientRow.linked_organization_id
                                              ]?.avatarUrl
                                            : undefined
                                        }
                                        organizationAvatarSeed={
                                          clientRow?.linked_organization_id
                                            ? financeLinkedOrgDisplayMap[
                                                clientRow.linked_organization_id
                                              ]?.avatarSeed
                                            : undefined
                                        }
                                        avatarUrl={
                                          clientRow?.avatar_url ?? null
                                        }
                                        avatarSeed={
                                          clientRow?.avatar_seed ?? null
                                        }
                                        entityType="client"
                                        size={TRIP_TABLE_AVATAR}
                                      />
                                      <View
                                        style={styles.spWebTdPartyTextStack}
                                      >
                                        <Text
                                          style={styles.spWebTdPartyTitle}
                                          numberOfLines={1}
                                        >
                                          {clientNameForUi}
                                        </Text>
                                        <Text
                                          style={styles.spWebTdPartyHint}
                                          numberOfLines={1}
                                        >
                                          {(clientRow?.contact_person ?? "")
                                            .trim() || "—"}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                                  <View style={styles.spWebTdTrip}>
                                    <Text
                                      style={styles.spWebTdMissionId}
                                      numberOfLines={1}
                                    >
                                      {r.missionId}
                                    </Text>
                                    <Text
                                      style={styles.spWebTdRoute}
                                      numberOfLines={3}
                                    >
                                      {routeLine}
                                    </Text>
                                    <Text
                                      style={styles.spWebTdTripDate}
                                      numberOfLines={1}
                                    >
                                      {formatTripTableDateFinance(tripDateIso)}
                                    </Text>
                                  </View>
                                  <View style={styles.spWebTdParty}>
                                    <View style={styles.spWebTdPartyAvatarRow}>
                                      <PartyAvatar
                                        name={supplierColumnTitle || "—"}
                                        organizationImageUrl={
                                          supplierAv.organizationImageUrl ??
                                          undefined
                                        }
                                        organizationAvatarSeed={
                                          supplierAv.organizationAvatarSeed ??
                                          undefined
                                        }
                                        avatarUrl={
                                          supplierAv.avatarUrl ?? null
                                        }
                                        avatarSeed={
                                          supplierAv.avatarSeed ?? null
                                        }
                                        entityType="supplier"
                                        size={TRIP_TABLE_AVATAR}
                                      />
                                      <View
                                        style={styles.spWebTdPartyTextStack}
                                      >
                                        <Text
                                          style={styles.spWebTdPartyTitle}
                                          numberOfLines={1}
                                        >
                                          {supplierColumnTitle}
                                        </Text>
                                        {isAggregateTrip ? (
                                          <Text
                                            style={styles.spWebTdPartyHint}
                                            numberOfLines={1}
                                          >
                                            {supplierColumnSameAsClient
                                              ? "Same org as client · Margin"
                                              : "Partner · Margin"}{" "}
                                            {marginPct.toFixed(1)}%
                                          </Text>
                                        ) : supplierRate <= 0 &&
                                          expenseCaptured > 0 ? (
                                          <Text
                                            style={styles.spWebTdPartyHint}
                                            numberOfLines={1}
                                          >
                                            Asset · Expense captured:{" "}
                                            {formatINR(expenseCaptured)}
                                          </Text>
                                        ) : (
                                          <Text
                                            style={styles.spWebTdPartyHint}
                                            numberOfLines={1}
                                          >
                                            Asset
                                          </Text>
                                        )}
                                      </View>
                                    </View>
                                  </View>
                                  <View style={styles.spWebTdDriverCol}>
                                    <View style={styles.spWebTdPartyAvatarRow}>
                                      <PartyAvatar
                                        name={driverName || "—"}
                                        avatarUrl={
                                          (driverRow?.avatar_url ?? "").trim() ||
                                          null
                                        }
                                        avatarSeed={
                                          (driverRow?.avatar_seed ?? "").trim() ||
                                          null
                                        }
                                        entityType="driver"
                                        size={TRIP_TABLE_AVATAR}
                                      />
                                      <View
                                        style={styles.spWebTdPartyTextStack}
                                      >
                                        <Text
                                          style={styles.spWebTdPartyTitle}
                                          numberOfLines={2}
                                        >
                                          {driverName}
                                        </Text>
                                        {(t.vehicle_display_number ?? "").trim() ? (
                                          <Text
                                            style={styles.spWebTdPartyHint}
                                            numberOfLines={1}
                                          >
                                            {formatIndianVehicleNumber(
                                              (
                                                t.vehicle_display_number ?? ""
                                              ).trim(),
                                            )}
                                          </Text>
                                        ) : null}
                                      </View>
                                    </View>
                                  </View>
                                  <View style={styles.spWebTdAmt}>
                                    <Text
                                      style={styles.spWebTdAmtText}
                                      numberOfLines={1}
                                    >
                                      {formatINR(sales)}
                                    </Text>
                                  </View>
                                  <View style={styles.spWebTdAmt}>
                                    <Text
                                      style={styles.spWebTdAmtText}
                                      numberOfLines={1}
                                    >
                                      {formatINR(tripCost)}
                                    </Text>
                                  </View>
                                  <View style={styles.spWebTdAmt}>
                                    <Text
                                      style={[
                                        styles.spWebTdAmtText,
                                        tripPnl >= 0
                                          ? styles.tdGreen
                                          : styles.tdRed,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {formatINR(tripPnl)}
                                    </Text>
                                  </View>
                                  <View style={styles.spWebTdAmt}>
                                    <Text
                                      style={[
                                        styles.spWebTdAmtText,
                                        styles.spWebTdAmtRight,
                                        styles.tdGreen,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {formatINR(paidOut)}
                                    </Text>
                                  </View>
                                  <View style={styles.spWebTdAmt}>
                                    <Text
                                      style={[
                                        styles.spWebTdAmtText,
                                        styles.spWebTdAmtRight,
                                        dueAmt > 0
                                          ? styles.tdRed
                                          : styles.spWebTdDueZero,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {formatINR(dueAmt)}
                                    </Text>
                                  </View>
                                  <View style={styles.spWebTdTxn}>
                                    <Text
                                      style={[
                                        styles.spWebTdAmtText,
                                        styles.spWebTdAmtRight,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {meta.count}
                                    </Text>
                                  </View>
                                  <View style={styles.spWebTdLastTxn}>
                                    <Text
                                      style={[
                                        styles.spWebTdLastTxnText,
                                        styles.spWebTdAmtRight,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {meta.lastTxnDate
                                        ? formatLastTxnDayMonth(
                                            meta.lastTxnDate,
                                          )
                                        : "—"}
                                    </Text>
                                  </View>
                                </>
                              );
                            })()
                          : showSupplierWebGrid && !tripForRow ? (
                              <>
                                <View style={styles.spWebTdClient}>
                                  <Text
                                    style={styles.spWebTdPartyHint}
                                    numberOfLines={1}
                                  >
                                    —
                                  </Text>
                                </View>
                                <View style={styles.spWebTdTrip}>
                                  <Text
                                    style={styles.spWebTdMissionId}
                                    numberOfLines={1}
                                  >
                                    {r.missionId}
                                  </Text>
                                  <Text
                                    style={styles.spWebTdRoute}
                                    numberOfLines={2}
                                  >
                                    {r.dest}
                                  </Text>
                                </View>
                                <View style={styles.spWebTdParty}>
                                  <Text
                                    style={styles.spWebTdPartyHint}
                                    numberOfLines={1}
                                  >
                                    —
                                  </Text>
                                </View>
                                <View style={styles.spWebTdDriverCol}>
                                  <Text
                                    style={styles.spWebTdPartyHint}
                                    numberOfLines={1}
                                  >
                                    —
                                  </Text>
                                </View>
                                <View style={styles.spWebTdAmt}>
                                  <Text
                                    style={styles.spWebTdAmtText}
                                    numberOfLines={1}
                                  >
                                    {formatINR(r.col1)}
                                  </Text>
                                </View>
                                <View style={styles.spWebTdAmt}>
                                  <Text
                                    style={styles.spWebTdAmtText}
                                    numberOfLines={1}
                                  >
                                    —
                                  </Text>
                                </View>
                                <View style={styles.spWebTdAmt}>
                                  <Text
                                    style={styles.spWebTdAmtText}
                                    numberOfLines={1}
                                  >
                                    —
                                  </Text>
                                </View>
                                <View style={styles.spWebTdAmt}>
                                  <Text
                                    style={[
                                      styles.spWebTdAmtText,
                                      styles.spWebTdAmtRight,
                                      styles.tdGreen,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {formatINR(r.col2)}
                                  </Text>
                                </View>
                                <View style={styles.spWebTdAmt}>
                                  <Text
                                    style={[
                                      styles.spWebTdAmtText,
                                      styles.spWebTdAmtRight,
                                      styles.tdRed,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {formatINR(r.col3)}
                                  </Text>
                                </View>
                                <View style={styles.spWebTdTxn}>
                                  <Text
                                    style={[
                                      styles.spWebTdAmtText,
                                      styles.spWebTdAmtRight,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    0
                                  </Text>
                                </View>
                                <View style={styles.spWebTdLastTxn}>
                                  <Text
                                    style={[
                                      styles.spWebTdLastTxnText,
                                      styles.spWebTdAmtRight,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    —
                                  </Text>
                                </View>
                              </>
                            ) : (
                              <>
                                <View style={styles.tdMission}>
                                  <Text
                                    style={styles.tdMissionId}
                                    numberOfLines={1}
                                  >
                                    {r.missionId}
                                  </Text>
                                  <Text style={styles.tdDest} numberOfLines={1}>
                                    {isVehicleRow
                                      ? (rv.clientName ?? r.dest)
                                      : r.dest}
                                  </Text>
                                  {hasTripDetail && (
                                    <Text
                                      style={styles.tdTripMeta}
                                      numberOfLines={2}
                                    >
                                      {[rv.tripDate, rv.agingLabel]
                                        .filter(Boolean)
                                        .join(" · ")}
                                      {rv.route ? ` · ${rv.route}` : ""}
                                    </Text>
                                  )}
                                </View>
                                <Text
                                  style={[styles.td, styles.tdRight]}
                                  numberOfLines={1}
                                >
                                  {isVehicleRow
                                    ? formatINR(rv.sales ?? 0)
                                    : formatINR(r.col1)}
                                </Text>
                                <Text
                                  style={[
                                    styles.td,
                                    styles.tdRight,
                                    isVehicleRow ? undefined : styles.tdGreen,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {isVehicleRow
                                    ? formatINR(rv.expense ?? 0)
                                    : formatINR(r.col2)}
                                </Text>
                                {isVehicleRow ? (
                                  <View
                                    style={[styles.tdRightLast, styles.tdNetWrap]}
                                  >
                                    <Text
                                      style={[
                                        styles.td,
                                        (rv.net ?? 0) > 0
                                          ? styles.tdGreen
                                          : (rv.net ?? 0) < 0
                                            ? styles.tdRed
                                            : undefined,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {formatINR(rv.net ?? 0)}
                                    </Text>
                                    {rv.margin != null &&
                                      (rv.margin !== 0 ||
                                        (rv.net ?? 0) !== 0) && (
                                        <Text
                                          style={[
                                            styles.tdMargin,
                                            rv.margin > 0
                                              ? styles.tdGreen
                                              : rv.margin < 0
                                                ? styles.tdRed
                                                : undefined,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {rv.margin > 0 ? "+" : ""}
                                          {rv.margin.toFixed(0)}%
                                        </Text>
                                      )}
                                  </View>
                                ) : (
                                  <Text
                                    style={[
                                      styles.td,
                                      styles.tdRightLast,
                                      styles.tdRed,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {formatINR(r.col3)}
                                  </Text>
                                )}
                              </>
                            )}
                        {isPartyLedger &&
                          (supplierWebRowOpensTrip ? (
                            <Pressable
                              style={styles.entityLedgerChevronTd}
                              hitSlop={12}
                              onPress={() =>
                                setExpandedEntityLedgerRowId((id) =>
                                  id === r.id ? null : r.id,
                                )
                              }
                            >
                              <FontAwesome
                                name={
                                  expanded ? "chevron-down" : "chevron-right"
                                }
                                size={10}
                                color={Theme.textMutedDemo}
                              />
                            </Pressable>
                          ) : (
                            <View style={styles.entityLedgerChevronTd}>
                              <FontAwesome
                                name={
                                  expanded ? "chevron-down" : "chevron-right"
                                }
                                size={10}
                                color={Theme.textMutedDemo}
                              />
                            </View>
                          ))}
                      </Pressable>
                      {isPartyLedger && expanded && isTripRow && tripForRow && (
                        <View style={styles.ledgerExpandedDetail}>
                          <View style={styles.ledgerExpandedBlock}>
                            <Text style={styles.ledgerExpandedBlockTitle}>
                              {t("associatedTrip")}
                            </Text>
                            <View style={styles.ledgerExpandedBlockContent}>
                              <View
                                style={[
                                  styles.ledgerExpandedRowDouble,
                                ]}
                              >
                                <View style={styles.ledgerExpandedHalf}>
                                  <Text
                                    style={styles.ledgerExpandedLabelSmall}
                                  >
                                    TRIP
                                  </Text>
                                  <Text
                                    style={styles.ledgerExpandedValue}
                                    numberOfLines={1}
                                  >
                                    {getTripOperationalDisplay({
                                      trip_number: detailForRow?.["trip_number"] ?? r.missionId ?? null,
                                    })}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.ledgerExpandedHalf,
                                    styles.ledgerExpandedHalfLast,
                                  ]}
                                >
                                  <Text
                                    style={styles.ledgerExpandedLabelSmall}
                                  >
                                    {t("tripDate")}
                                  </Text>
                                  <Text
                                    style={styles.ledgerExpandedValue}
                                    numberOfLines={1}
                                  >
                                    {rv.tripDate ?? "—"}
                                  </Text>
                                </View>
                              </View>
                              <View
                                style={[
                                  styles.ledgerExpandedRowDouble,
                                ]}
                              >
                                <View style={styles.ledgerExpandedHalf}>
                                  <Text
                                    style={styles.ledgerExpandedLabelSmall}
                                  >
                                    {t("route")}
                                  </Text>
                                  <Text
                                    style={styles.ledgerExpandedValue}
                                    numberOfLines={2}
                                  >
                                    {detailForRow?.pickup_area && detailForRow?.drop_location
                                      ? `${detailForRow.pickup_area} → ${detailForRow.drop_location}`
                                      : rv.route ?? "—"}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.ledgerExpandedHalf,
                                    styles.ledgerExpandedHalfLast,
                                  ]}
                                >
                                  <Text
                                    style={styles.ledgerExpandedLabelSmall}
                                  >
                                    {t("client")}
                                  </Text>
                                  <Text
                                    style={styles.ledgerExpandedValue}
                                    numberOfLines={1}
                                  >
                                    {detailForRow?.client_name ?? rv.clientName ?? "—"}
                                  </Text>
                                </View>
                              </View>
                              {(() => {
                                const clientPrice = Number(
                                  tripForRow?.client_price ??
                                    detailForRow?.client_price ??
                                    0,
                                );
                                const costValue = Number(
                                  tripForRow?.supplier_rate ??
                                    detailForRow?.supplier_rate ??
                                    0,
                                );
                                const isAggregate = isAggregateTrip(tripForRow);
                                const marginValue = clientPrice - costValue;
                                const marginPct =
                                  clientPrice > 0
                                    ? (marginValue / clientPrice) * 100
                                    : 0;
                                return (
                                  <>
                                    <View
                                      style={[
                                        styles.ledgerExpandedRowDouble,
                                      ]}
                                    >
                                      <View style={styles.ledgerExpandedHalf}>
                                        <Text
                                          style={
                                            styles.ledgerExpandedLabelSmall
                                          }
                                        >
                                          {(t("saleValue") || t("totalBilling") || "Client price")}
                                        </Text>
                                        <Text
                                          style={styles.ledgerExpandedValue}
                                          numberOfLines={1}
                                        >
                                          {formatINR(clientPrice)}
                                        </Text>
                                      </View>
                                      <View
                                        style={[
                                          styles.ledgerExpandedHalf,
                                          styles.ledgerExpandedHalfLast,
                                        ]}
                                      >
                                        <Text
                                          style={
                                            styles.ledgerExpandedLabelSmall
                                          }
                                        >
                                          {isAggregate
                                            ? t("supplierCost")
                                            : (t("totalExpense") || "Total expense")}
                                        </Text>
                                        <Text
                                          style={styles.ledgerExpandedValue}
                                          numberOfLines={1}
                                        >
                                          {formatINR(costValue)}
                                        </Text>
                                      </View>
                                    </View>
                                    <View
                                      style={[
                                        styles.ledgerExpandedRowDouble,
                                      ]}
                                    >
                                      <View style={styles.ledgerExpandedHalf}>
                                        <Text
                                          style={
                                            styles.ledgerExpandedLabelSmall
                                          }
                                        >
                                          {t("margin") ?? "Margin"}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.ledgerExpandedValue,
                                            marginValue > 0 && styles.ledgerExpandedValueGreen,
                                            marginValue < 0 && styles.ledgerExpandedValueRed,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {formatINR(marginValue)}
                                        </Text>
                                      </View>
                                      <View
                                        style={[
                                          styles.ledgerExpandedHalf,
                                          styles.ledgerExpandedHalfLast,
                                        ]}
                                      >
                                        <Text
                                          style={
                                            styles.ledgerExpandedLabelSmall
                                          }
                                        >
                                          {t("margin") ?? "Margin"} %
                                        </Text>
                                        <Text
                                          style={[
                                            styles.ledgerExpandedValue,
                                            marginPct > 0 && styles.ledgerExpandedValueGreen,
                                            marginPct < 0 && styles.ledgerExpandedValueRed,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {marginPct > 0 ? "+" : ""}
                                          {marginPct.toFixed(1)}%
                                        </Text>
                                      </View>
                                    </View>
                                  </>
                                );
                              })()}
                              <View
                                style={[
                                  styles.ledgerExpandedRowDouble,
                                  styles.ledgerExpandedRowDoubleLast,
                                ]}
                              >
                                <View style={styles.ledgerExpandedHalf}>
                                  <Text
                                    style={styles.ledgerExpandedLabelSmall}
                                  >
                                    {t("truck")}
                                  </Text>
                                  <Text
                                    style={styles.ledgerExpandedValue}
                                    numberOfLines={1}
                                  >
                                    {tripForRow?.vehicle_display_number?.trim()
                                      ? formatIndianVehicleNumber(
                                          tripForRow.vehicle_display_number.trim(),
                                        )
                                      : "—"}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.ledgerExpandedHalf,
                                    styles.ledgerExpandedHalfLast,
                                  ]}
                                >
                                  <Text
                                    style={styles.ledgerExpandedLabelSmall}
                                  >
                                    {t("driver")}
                                  </Text>
                                  <Text
                                    style={styles.ledgerExpandedValue}
                                    numberOfLines={1}
                                  >
                                    —
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                          <View style={styles.ledgerExpandedBlock}>
                            <View style={styles.ledgerExpandedPaymentDark}>
                              <View style={styles.ledgerExpandedRowTriple}>
                                <View style={styles.ledgerExpandedTripleCell}>
                                  <Text
                                    style={styles.ledgerExpandedLabelOnDark}
                                    numberOfLines={1}
                                  >
                                    {entityType === "CLIENT"
                                      ? (t("saleValue") || "Sale")
                                      : t("supplierCost")}
                                  </Text>
                                  <Text
                                    style={styles.ledgerExpandedValueOnDark}
                                    numberOfLines={1}
                                  >
                                    {formatINR(r.col1 ?? 0)}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.ledgerExpandedTripleCell,
                                    styles.ledgerExpandedTripleCellAmount,
                                  ]}
                                >
                                  <Text
                                    style={styles.ledgerExpandedLabelOnDark}
                                    numberOfLines={1}
                                  >
                                    {entityType === "CLIENT"
                                      ? t("received") || "Received"
                                      : t("paid")}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.ledgerExpandedValueOnDark,
                                      entityType === "CLIENT"
                                        ? styles.ledgerExpandedValueOnDarkGreen
                                        : styles.ledgerExpandedValueOnDarkRed,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {formatINR(r.col2 ?? 0)}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.ledgerExpandedTripleCell,
                                    styles.ledgerExpandedTripleCellAmount,
                                  ]}
                                >
                                  <Text
                                    style={styles.ledgerExpandedLabelOnDark}
                                    numberOfLines={1}
                                  >
                                    {t("due")}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.ledgerExpandedValueOnDark,
                                      (r.col3 ?? 0) > 0 &&
                                        styles.ledgerExpandedValueOnDarkRed,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {formatINR(r.col3 ?? 0)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                          <Text
                            style={styles.ledgerExpandedAssociatedLabel}
                            numberOfLines={1}
                          >
                            {t("associatedTransactions")}
                          </Text>
                          {sameTripTx.length === 0 ? (
                            <Text
                              style={styles.ledgerExpandedAssociatedEmpty}
                              numberOfLines={2}
                            >
                              {t("noAssociatedTransactions")}
                            </Text>
                          ) : (
                            <View style={styles.ledgerExpandedTxHistoryWrap}>
                              <Text style={styles.ledgerExpandedTxHistoryTitle}>
                                {t("transactionHistory") || "Transaction history"}
                              </Text>
                              <View style={styles.ledgerExpandedTxHistoryList}>
                                {sameTripTx.map((tx, idx) => {
                                  const txDate = (tx.transaction_date ?? tx.created_at ?? "").slice(0, 10);
                                  const dateStr = txDate ? formatLedgerDate(txDate) : "—";
                                  const typeLabel = getDoubleEntryDisplayLabel(tx) ?? tx.description ?? tx.party_name ?? "—";
                                  const party = (tx.party_name ?? entity.name ?? "—").trim() || "—";
                                  const amtIn = Number(tx.amount_in ?? 0);
                                  const amtOut = Number(tx.amount_out ?? 0);
                                  const isIn = amtIn > 0;
                                  const amount = isIn ? amtIn : amtOut;
                                  const isLast = idx === sameTripTx.length - 1;
                                  return (
                                    <View
                                      key={tx.id}
                                      style={[
                                        styles.ledgerExpandedTxHistoryRow,
                                        isLast && styles.ledgerExpandedTxHistoryRowLast,
                                      ]}
                                    >
                                      <View
                                        style={[
                                          styles.ledgerExpandedTxHistoryIconWrap,
                                          isIn ? styles.ledgerExpandedTxHistoryIconIn : styles.ledgerExpandedTxHistoryIconOut,
                                        ]}
                                      >
                                        <FontAwesome
                                          name={isIn ? "chevron-down" : "chevron-up"}
                                          size={8}
                                          color={isIn ? Theme.darkGreen : Theme.teslaRed}
                                        />
                                      </View>
                                      <View style={styles.ledgerExpandedTxHistoryBody}>
                                        <Text style={styles.ledgerExpandedTxHistoryRowTitle} numberOfLines={1}>
                                          {typeLabel}
                                        </Text>
                                        <Text style={styles.ledgerExpandedTxHistoryRowSubtitle} numberOfLines={1}>
                                          {dateStr} · {party}
                                        </Text>
                                      </View>
                                      <Text
                                        style={[
                                          styles.ledgerExpandedTxHistoryAmount,
                                          isIn ? styles.ledgerExpandedTxHistoryAmountIn : styles.ledgerExpandedTxHistoryAmountOut,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {isIn ? "+" : "−"} ₹{formatLedgerAmount(amount)}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        </ScrollView>
      )}

      {onAddTransaction != null && (
          <View
            style={[
              styles.entityFabWrap,
              { bottom: Layout.fabBottomOffset + insets.bottom },
            ]}
          >
            {isActionHubOpen ? (
              <View style={styles.entityActionHubMenu}>
                <TouchableOpacity
                  style={styles.entityActionHubItem}
                  onPress={() => {
                    setIsActionHubOpen(false);
                    onAddTransaction();
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.entityActionHubItemIconWrap}>
                    <FontAwesome name="exchange" size={16} color={Theme.textOnDark} />
                  </View>
                  <Text style={styles.entityActionHubItemText}>Sync ledger</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.entityActionHubItem}
                  onPress={() => {
                    setIsActionHubOpen(false);
                    handleReportPress();
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.entityActionHubItemIconWrap}>
                    <FontAwesome name="file-text-o" size={16} color={Theme.textOnDark} />
                  </View>
                  <Text style={styles.entityActionHubItemText}>Ledger report</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View
              style={[
                styles.entityFabActionRow,
                styles.entityFabIslandRail,
                !(fabHovered || isActionHubOpen) && styles.entityFabIslandRailCollapsed,
              ]}
            >
              <View
                style={[
                  styles.entityFabLabelWrap,
                  !(fabHovered || isActionHubOpen) && styles.entityFabLabelWrapCollapsed,
                ]}
              >
                <Text style={styles.entityFabLabelTitle}>Action Hub</Text>
                <Text style={styles.entityFabLabelSub}>Trip + ledger controls</Text>
              </View>
              <Pressable
                onHoverIn={() => setFabHovered(true)}
                onHoverOut={() => setFabHovered(false)}
                onPressIn={() => setFabHovered(true)}
                onPressOut={() => setFabHovered(false)}
                style={styles.entityFabPressArea}
              >
                <FinanceFAB
                  onPress={() => setIsActionHubOpen((v) => !v)}
                  accessibilityLabel={isActionHubOpen ? "Close action hub" : "Open action hub"}
                  icon={isActionHubOpen ? "plus" : "credit-card"}
                  size={80}
                />
              </Pressable>
            </View>
          </View>
        )}

      <LedgerReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        transactions={protocolLedgerRows}
        title={
          entity.name ? `${t("ledgerFor")}${entity.name}` : t("ledgerReport")
        }
      />

      {isDriver && (
        <Modal
          visible={showVehiclePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowVehiclePicker(false)}
        >
          <TouchableOpacity
            style={styles.vehiclePickerBackdrop}
            activeOpacity={1}
            onPress={() => setShowVehiclePicker(false)}
          >
            <View style={styles.vehiclePickerSheet}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <Text style={styles.vehiclePickerTitle}>Assign vehicle</Text>
                <FlatList
                  data={[{ id: "__none__", vehicle_number: "— None —" }, ...vehicles]}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const isNone = item.id === "__none__";
                    const alreadyAssigned =
                      !isNone &&
                      drivers.some(
                        (d) => d.id !== entity.id && d.assigned_vehicle_id === item.id,
                      );
                    return (
                      <TouchableOpacity
                        style={[
                          styles.vehiclePickerItem,
                          alreadyAssigned && styles.vehiclePickerItemDisabled,
                        ]}
                        onPress={() => {
                          if (alreadyAssigned) return;
                          const driverName = entity.name ?? "this driver";
                          if (isNone) {
                            Alert.alert(
                              "Unassign vehicle",
                              `Remove vehicle assignment from ${driverName}?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Unassign",
                                  onPress: () => {
                                    onAssignVehicle?.(entity.id, null);
                                    setShowVehiclePicker(false);
                                  },
                                },
                              ],
                            );
                          } else {
                            const vehicleLabel = formatIndianVehicleNumber(item.vehicle_number) || item.vehicle_number;
                            Alert.alert(
                              "Assign vehicle",
                              `Assign vehicle ${vehicleLabel} to ${driverName}?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Assign",
                                  onPress: () => {
                                    onAssignVehicle?.(entity.id, item.id);
                                    setShowVehiclePicker(false);
                                  },
                                },
                              ],
                            );
                          }
                        }}
                        activeOpacity={alreadyAssigned ? 1 : 0.7}
                        disabled={alreadyAssigned}
                      >
                        <Text
                          style={[
                            styles.vehiclePickerItemText,
                            alreadyAssigned && styles.vehiclePickerItemTextAssigned,
                          ]}
                          numberOfLines={1}
                        >
                          {isNone ? "— None —" : formatIndianVehicleNumber(item.vehicle_number)}
                        </Text>
                        {alreadyAssigned && (
                          <Text style={styles.vehiclePickerItemSubtext} numberOfLines={1}>
                            Already assigned
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {isVehicle && (
        <Modal
          visible={showDriverPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDriverPicker(false)}
        >
          <TouchableOpacity
            style={styles.vehiclePickerBackdrop}
            activeOpacity={1}
            onPress={() => setShowDriverPicker(false)}
          >
            <View style={styles.vehiclePickerSheet}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <Text style={styles.vehiclePickerTitle}>Assign driver</Text>
                <FlatList
                  data={[{ id: "__none__", name: "— None —" }, ...drivers]}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const isNone = item.id === "__none__";
                    const driver = item as DriverRow;
                    const alreadyAssigned =
                      !isNone &&
                      driver.assigned_vehicle_id != null &&
                      driver.assigned_vehicle_id !== entity.id;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.vehiclePickerItem,
                          alreadyAssigned && styles.vehiclePickerItemDisabled,
                        ]}
                        onPress={() => {
                          if (alreadyAssigned) return;
                          const vehicleLabel =
                            vehicle?.vehicle_number != null
                              ? formatIndianVehicleNumber(vehicle.vehicle_number)
                              : entity.name ?? entity.id ?? "this vehicle";
                          if (isNone) {
                            Alert.alert(
                              "Unassign driver",
                              `Remove driver assignment from vehicle ${vehicleLabel}?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Unassign",
                                  onPress: () => {
                                    onAssignDriver?.(entity.id, null);
                                    setShowDriverPicker(false);
                                  },
                                },
                              ],
                            );
                          } else {
                            const driverName = driver.name ?? "this driver";
                            Alert.alert(
                              "Assign driver",
                              `Assign driver ${driverName} to vehicle ${vehicleLabel}?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Assign",
                                  onPress: () => {
                                    onAssignDriver?.(entity.id, item.id);
                                    setShowDriverPicker(false);
                                  },
                                },
                              ],
                            );
                          }
                        }}
                        activeOpacity={alreadyAssigned ? 1 : 0.7}
                        disabled={alreadyAssigned}
                      >
                        <Text
                          style={[
                            styles.vehiclePickerItemText,
                            alreadyAssigned && styles.vehiclePickerItemTextAssigned,
                          ]}
                          numberOfLines={1}
                        >
                          {isNone ? "— None —" : driver.name ?? "—"}
                        </Text>
                        {alreadyAssigned && (
                          <Text style={styles.vehiclePickerItemSubtext} numberOfLines={1}>
                            Already assigned
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  darkBlockTabRow: {
    paddingHorizontal: 18,
    marginTop: 2,
  },
  darkBlockSummaryRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
    gap: 0,
  },
  darkBlockSummaryCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 2,
    paddingRight: 12,
  },
  darkBlockSummaryCellRight: {
    alignItems: "flex-end",
    paddingRight: 0,
    paddingLeft: 12,
  },
  darkBlockSummaryCellBorder: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.separatorDark,
  },
  darkBlockSummaryLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  darkBlockSummaryLabelRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  darkBlockSummaryLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  darkBlockSummaryIcon: {
    marginRight: 0,
  },
  darkBlockSummaryAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: -0.3,
  },
  darkBlockSummaryAmountIn: {
    color: Theme.darkGreen,
  },
  darkBlockSummaryAmountOut: {
    color: Theme.teslaRed,
  },
  entityCardShell: {
    backgroundColor: Theme.financeHeroBg,
    marginHorizontal: 0,
    marginBottom: 8,
    overflow: "hidden",
    padding: 12,
    paddingBottom: 10,
  },
  entityTabRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "stretch",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  entityTab: {
    flex: 1,
    minWidth: 0,
    position: "relative" as const,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tdNetWrap: {
    flex: 0.21,
    alignItems: "flex-end",
  },
  tdMargin: {
    fontSize: 7,
    fontWeight: "700",
    marginTop: 2,
  },
  riskBadgeWrap: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  darkBlock: {
    backgroundColor: Theme.financeHeroBg,
    width: "100%",
    paddingBottom: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  entityTabActive: {},
  entityTabText: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: Theme.textSecondary,
  },
  entityTabTextActive: {
    color: Theme.textOnDark,
  },
  entityTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: Theme.teslaRed,
  },
  wrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Theme.screenBackground,
    zIndex: 200,
  },
  entityFabWrap: {
    position: "absolute",
    right: Layout.fabRightOffset,
    zIndex: 210,
    elevation: 10,
  },
  entityFabActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  entityFabIslandRail: {
    backgroundColor: "rgba(15,23,42,0.92)",
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    ...Platform.select({
      web: {
        transitionProperty: "transform, opacity",
        transitionDuration: "280ms",
      } as object,
    }),
  },
  entityFabIslandRailCollapsed: {
    transform: [{ translateX: 44 }],
  },
  entityFabPressArea: {
  },
  entityActionHubMenu: {
    alignSelf: "flex-end",
    backgroundColor: "#0B1220",
    padding: 10,
    marginBottom: 10,
    minWidth: 210,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 14,
  },
  entityActionHubItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginBottom: 6,
  },
  entityActionHubItemIconWrap: {
    width: 28,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  entityActionHubItemText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  entityFabLabelWrap: {
    backgroundColor: "transparent",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    ...Platform.select({
      web: {
        transitionProperty: "opacity, transform",
        transitionDuration: "220ms",
      } as object,
    }),
  },
  entityFabLabelWrapCollapsed: {
    opacity: 0,
    transform: [{ translateX: 20 }, { scale: 0.92 }],
  },
  entityFabLabelTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  entityFabLabelSub: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "700",
    color: "rgba(199,210,254,0.9)",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  scroll: { flex: 1 },
  scrollContent: {},
  summaryBar: {
    flexDirection: "row",
    backgroundColor: Theme.buttonPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  summaryCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  summaryCellBorder: {
    borderRightWidth: 1,
    borderRightColor: Theme.separatorDark,
  },
  summaryRight: { alignItems: "flex-end" },
  summaryLabel: {
    fontSize: 6,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 2,
  },
  summaryAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  tableWrap: { paddingHorizontal: 16, paddingTop: 6 },
  /** Ledger tab: title + short subtitle in one row; summary: 2 metrics in one row. */
  ledgerSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  ledgerSummaryRow: {
    flexDirection: "row",
    backgroundColor: Theme.surface,
    paddingVertical: 12,
    paddingHorizontal: 0,
    marginBottom: 14,
    gap: 0,
  },
  ledgerSummaryCell: {
    flex: 1,
    minWidth: 0,
  },
  ledgerSummaryCellBorder: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 10,
  },
  ledgerSummaryLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  ledgerSummaryAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  ledgerSummaryIn: { color: Theme.positive ?? Theme.darkGreen },
  ledgerSummaryOut: { color: Theme.teslaRed },
  /** Ledger tab: same layout as main finance Ledger (ENTITY/DESC | LINK | RECEIVED | PAID). Aligns with tab row. */
  ledgerViewModeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  ledgerViewModePill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: Theme.surfaceLight ?? "rgba(0,0,0,0.06)",
  },
  ledgerViewModePillActive: {
    backgroundColor: Theme.teslaRed,
  },
  ledgerViewModePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  ledgerViewModePillTextActive: {
    color: "#fff",
  },
  ledgerTableHeaderWrap: {
    width: "100%",
    backgroundColor: Theme.surface,
    paddingHorizontal: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  ledgerTableHeader: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 0,
  },
  ledgerTh: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    paddingVertical: 10,
  },
  /** Ledger tab: 25, 25, 25, 25 — first column (PARTY) with left padding so content doesn’t touch the border. */
  ledgerThNode: {
    flex: 0.25,
    minWidth: 0,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 10,
    justifyContent: "center",
  },
  ledgerThMission: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerThBorderLeft: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 10,
    justifyContent: "center",
  },
  ledgerThCredit: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right",
  },
  ledgerThDebit: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right",
  },
  ledgerThSpacer: { width: 22, minWidth: 22 },
  /** Driver LEDGER tab body: same 4-column layout as client ledger (0.25 each). */
  ledgerTdNode: {
    flex: 0.25,
    minWidth: 0,
    paddingLeft: 12,
    paddingRight: 8,
  },
  ledgerTdMission: {
    flex: 0.25,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerTdCredit: {
    flex: 0.25,
    minWidth: 0,
    alignItems: "flex-end",
    paddingRight: 8,
  },
  ledgerTdDebit: {
    flex: 0.25,
    minWidth: 0,
    alignItems: "flex-end",
    paddingRight: 8,
  },
  /** Driver ledger PARTY/ITEM: category line (e.g. TRIP, GENERAL) — match client ledger. */
  ledgerCellSubCategory: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    letterSpacing: 0.05,
    marginTop: 2,
    textTransform: "uppercase",
  },
  /** Driver ledger PARTY/ITEM: date line — match client ledger. */
  ledgerCellSubDate: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    letterSpacing: 0.03,
    marginTop: 2,
  },
  /** Chevron at end of driver ledger row (match client FinancialRow). */
  ledgerRowActionHint: {
    paddingLeft: 6,
    paddingRight: 4,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    width: 22,
    minWidth: 22,
  },
  ledgerRowWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  ledgerRowPressed: { backgroundColor: Theme.surface },
  /** Ledger expanded detail — compact, aligned with table row density. */
  ledgerExpandedDetail: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    overflow: "hidden",
  },
  ledgerExpandedBlock: {
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
    marginBottom: 6,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  ledgerExpandedBlockTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.financeHeroBg,
    textTransform: "uppercase",
  },
  ledgerExpandedBlockContent: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ledgerExpandedRowDouble: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    minWidth: 0,
    marginBottom: 8,
  },
  ledgerExpandedRowDoubleLast: {
    marginBottom: 0,
  },
  ledgerExpandedHalf: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    paddingRight: 6,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    borderRightWidth: 1,
    borderRightColor: Theme.surfaceBorder,
  },
  ledgerExpandedHalfLast: {
    borderRightWidth: 0,
    paddingRight: 0,
  },
  ledgerExpandedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  ledgerExpandedRowLast: {
    borderBottomWidth: 0,
  },
  ledgerExpandedLabelSmall: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  ledgerExpandedValue: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minWidth: 0,
  },
  ledgerExpandedValueGreen: {
    color: Theme.darkGreen,
  },
  ledgerExpandedValueRed: {
    color: Theme.teslaRed,
  },
  ledgerExpandedPaymentDark: {
    backgroundColor: Theme.financeHeroBg,
    marginHorizontal: 0,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ledgerExpandedRowTriple: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  ledgerExpandedTripleCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingVertical: 2,
  },
  ledgerExpandedTripleCellAmount: {
    alignItems: "flex-end",
  },
  ledgerExpandedLabelOnDark: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.6,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  ledgerExpandedValueOnDark: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
  ledgerExpandedValueOnDarkGreen: {
    color: Theme.darkGreen,
    fontWeight: "700",
  },
  ledgerExpandedValueOnDarkRed: {
    color: Theme.teslaRed,
    fontWeight: "700",
  },
  ledgerExpandedAmountPillGreen: {
    backgroundColor: Theme.positiveMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ledgerExpandedAmountPillRed: {
    backgroundColor: Theme.negativeMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ledgerExpandedValueOnGreen: {
    color: Theme.darkGreen,
    fontWeight: "600",
  },
  ledgerExpandedValueOnRed: {
    color: Theme.teslaRed,
    fontWeight: "600",
  },
  ledgerExpandedAssociatedLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  ledgerExpandedAssociatedEmpty: {
    fontSize: 11,
    color: Theme.textMuted,
    marginBottom: 6,
    fontStyle: "italic",
  },
  ledgerExpandedTxCard: {
    backgroundColor: Theme.screenBackground,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  ledgerExpandedTxCardLine1: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginBottom: 2,
  },
  ledgerExpandedTxCardLine2: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  ledgerExpandedTxCardLine2Red: {
    color: Theme.teslaRed,
  },
  /** Google Pay–style transaction history (same trip) */
  ledgerExpandedTxHistoryWrap: { marginTop: 4 },
  ledgerExpandedTxHistoryTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  ledgerExpandedTxHistoryList: {
    backgroundColor: Theme.darkSurface,
    overflow: "hidden",
  },
  ledgerExpandedTxHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderOnDark,
    gap: 8,
  },
  ledgerExpandedTxHistoryRowLast: {
    borderBottomWidth: 0,
  },
  ledgerExpandedTxHistoryIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  ledgerExpandedTxHistoryIconIn: { borderColor: Theme.darkGreen },
  ledgerExpandedTxHistoryIconOut: { borderColor: Theme.teslaRed },
  ledgerExpandedTxHistoryBody: { flex: 1, minWidth: 0 },
  ledgerExpandedTxHistoryRowTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  ledgerExpandedTxHistoryRowSubtitle: {
    fontSize: 9,
    color: Theme.textOnDarkMuted,
    marginTop: 1,
  },
  ledgerExpandedTxHistoryAmount: { fontSize: 11, fontWeight: "700" },
  ledgerExpandedTxHistoryAmountIn: { color: Theme.darkGreen },
  ledgerExpandedTxHistoryAmountOut: { color: Theme.teslaRed },
  entityLedgerChevronTh: {
    width: 22,
    minWidth: 22,
  },
  entityLedgerChevronTd: {
    width: 22,
    minWidth: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  /** Driver ledger: TRIP/ROUTE/DATE (combined), EARNED, PAID, TO PAY. */
  driverLedgerThCol: {
    flex: 0.2,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 6,
    justifyContent: "center",
  },
  driverLedgerThColRouteDate: {
    flex: 0.45,
    minWidth: 0,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 8,
    justifyContent: "center",
  },
  driverLedgerThColRight: { textAlign: "right" },
  driverLedgerTdCol: {
    flex: 0.2,
    minWidth: 0,
    paddingRight: 6,
  },
  driverLedgerTdColRouteDate: {
    flex: 0.45,
    minWidth: 0,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 10,
  },
  driverLedgerTdColRouteDateContent: {
    justifyContent: "center",
  },
  driverLedgerTdRoute: {
    alignItems: "center",
    justifyContent: "center",
  },
  /** TRIP/ROUTE column: muted text to match client ledger (other tabs). */
  ledgerRouteText: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMutedDemo,
    letterSpacing: 0.05,
    textAlign: "center",
  },
  ledgerRouteTextBlock: {
    textAlign: "left",
    marginTop: 2,
  },
  ledgerTdBorderLeft: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 8,
  },
  driverLedgerTdColAmount: {
    flex: 0.2,
    minWidth: 0,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  driverProtocolThFirst: {
    flex: 0.42,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
  },
  driverProtocolThCol: {
    flex: 0.24,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right" as const,
  },
  driverProtocolThColLast: {
    flex: 0.24,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right" as const,
  },
  ledgerTableBodyWrap: {
    paddingHorizontal: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftColor: Theme.borderLight,
    borderRightColor: Theme.borderLight,
    borderBottomColor: Theme.borderLight,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: Theme.screenBackground,
    marginTop: -1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  ledgerEmptyRow: {
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  ledgerEmptyText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 2,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sectionSubtitle: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  table: {
    overflow: "hidden",
  },
  spWebTable: {
    backgroundColor: Theme.surface,
  },
  spWebTableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 10,
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderMedium,
  },
  spWebThClient: {
    flexGrow: 0,
    flexShrink: 0,
    width: "11%",
    minWidth: 108,
    justifyContent: "center",
    paddingRight: 6,
  },
  spWebThTrip: {
    flexGrow: 0,
    flexShrink: 0,
    flex: 0,
    width: "28%",
    minWidth: 248,
    maxWidth: 520,
  },
  spWebThParty: {
    flexGrow: 0,
    flexShrink: 0,
    width: "12%",
    minWidth: 100,
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 10,
  },
  spWebThDriver: {
    flexGrow: 0,
    flexShrink: 0,
    width: "9%",
    minWidth: 92,
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 8,
  },
  spWebThAmt: {
    flexGrow: 0,
    flexShrink: 0,
    width: "5.65%",
    minWidth: 58,
    maxWidth: 108,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 6,
    justifyContent: "center",
  },
  spWebThTxn: {
    flexGrow: 0,
    flexShrink: 0,
    width: "5%",
    minWidth: 52,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 6,
    justifyContent: "center",
  },
  spWebThLastTxn: {
    flexGrow: 0,
    flexShrink: 0,
    width: "6%",
    minWidth: 72,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 6,
    justifyContent: "center",
  },
  spWebTh: {
    fontSize: 11,
    letterSpacing: 0.08,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textSecondary,
    textTransform: "uppercase" as const,
  },
  spWebThRight: {
    width: "100%",
    textAlign: "right" as const,
  },
  spWebTableRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomColor: Theme.borderLight,
    minHeight: 58,
    backgroundColor: Theme.surface,
    alignItems: "center",
  },
  spWebTdClient: {
    flexGrow: 0,
    flexShrink: 0,
    width: "11%",
    minWidth: 108,
    justifyContent: "center",
    paddingRight: 6,
  },
  spWebTdTrip: {
    flexGrow: 0,
    flexShrink: 0,
    flex: 0,
    width: "28%",
    minWidth: 248,
    maxWidth: 520,
    paddingRight: 8,
  },
  spWebTdParty: {
    flexGrow: 0,
    flexShrink: 0,
    width: "12%",
    minWidth: 100,
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 10,
  },
  spWebTdDriverCol: {
    flexGrow: 0,
    flexShrink: 0,
    width: "9%",
    minWidth: 92,
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 8,
  },
  spWebTdPartyAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    width: "100%",
  },
  spWebTdPartyTextStack: {
    flex: 1,
    minWidth: 0,
  },
  spWebTdPartyTitle: {
    fontSize: 11,
    color: Theme.textPrimaryDark,
    fontWeight: "500",
    fontStyle: "italic",
  },
  spWebTdPartyHint: {
    fontSize: 9,
    color: Theme.textMuted,
    marginTop: 2,
    fontWeight: "500",
    fontStyle: "italic",
  },
  spWebTdMissionId: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  spWebTdRoute: {
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 4,
  },
  spWebTdTripDate: {
    fontSize: 9,
    color: Theme.textSecondary,
    marginTop: 4,
    fontWeight: "500",
  },
  spWebTdAmt: {
    flexGrow: 0,
    flexShrink: 0,
    width: "5.65%",
    minWidth: 58,
    maxWidth: 108,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 6,
    justifyContent: "center",
  },
  spWebTdAmtText: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  spWebTdAmtRight: {
    width: "100%",
    textAlign: "right" as const,
  },
  spWebTdDueZero: {
    color: Theme.textMuted,
  },
  spWebTdTxn: {
    flexGrow: 0,
    flexShrink: 0,
    width: "5%",
    minWidth: 52,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 6,
    justifyContent: "center",
  },
  spWebTdLastTxn: {
    flexGrow: 0,
    flexShrink: 0,
    width: "6%",
    minWidth: 72,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 6,
    justifyContent: "center",
  },
  spWebTdLastTxnText: {
    fontSize: 11,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  th: {
    fontSize: 6,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  thMission: { flex: 0.42 },
  thRight: { flex: 0.2, textAlign: "right" as const },
  thRightLast: { flex: 0.18, textAlign: "right" as const },
  thMonth: { flex: 0.28 },
  thCol: { flex: 0.24, textAlign: "right" as const },
  thColLast: { flex: 0.24, textAlign: "right" as const },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceLight,
  },
  tableRowExpanded: {
    backgroundColor: Theme.screenBackground,
  },
  tdMonth: { flex: 0.28 },
  tdCol: { flex: 0.24, alignItems: "flex-end" as const },
  tdColLast: { flex: 0.24, alignItems: "flex-end" as const },
  tdBalance: {
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },
  tdDark: { color: Theme.textPrimaryDark },
  tdMuted: { color: Theme.textMuted },
  td: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  tdMission: { flex: 0.42 },
  tdMissionWrap: { flex: 0.42, minWidth: 0 },
  tdMissionId: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tdDest: {
    fontSize: 6,
    color: Theme.textMutedDemo,
    marginTop: 2,
  },
  tdTripMeta: {
    fontSize: 9,
    color: Theme.textSecondary,
    marginTop: 3,
    fontWeight: "500",
  },
  tdRight: { flex: 0.2, textAlign: "right" as const },
  tdRightLast: { flex: 0.18, textAlign: "right" as const },
  tdGreen: { color: Theme.darkGreen },
  tdRed: { color: Theme.teslaRed },
  monthDetailWrap: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  monthDetailTitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 4,
  },
  earningsSummaryBlock: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: Theme.screenBackground,
  },
  earningsSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  earningsSummaryRowTotal: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    marginTop: 4,
    paddingTop: 8,
  },
  earningsSummaryRowBalance: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    marginTop: 2,
    paddingTop: 6,
  },
  earningsSummaryLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  earningsSummaryValue: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  earningsSummaryLabelBold: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  earningsSummaryValueBold: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  monthDetailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  monthDetailHeaderCell: {
    flex: 0.25,
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  monthDetailHeaderCellWide: {
    flex: 1,
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  monthDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  monthDetailCell: {
    flex: 0.25,
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  monthDetailCellWide: {
    flex: 1,
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  monthDetailSectionCard: {
    marginTop: 16,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  monthDetailDarkBarTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1,
    backgroundColor: Theme.financeHeroBg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    textTransform: "uppercase",
  },
  monthDetailSectionContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  monthDetailTripsBlock: {
    marginTop: 16,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  monthDetailPaymentsBlock: {
    marginTop: 16,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  monthDetailEmptyPayments: {
    paddingVertical: 16,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  tripStatementActionsWrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  tripStatementActionsLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  tripStatementActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tripStatementActionBtn: {
    flex: 1,
    minWidth: 100,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tripStatementActionBtnPrimary: {
    backgroundColor: Theme.buttonPrimary,
  },
  tripStatementActionBtnPrimaryText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  tripStatementActionBtnSecondary: {
    backgroundColor: Theme.surface,
  },
  tripStatementActionBtnSecondaryText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
  },
  driverRequestCardsWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    gap: 12,
  },
  driverRequestCard: {
    backgroundColor: Theme.surface,
    padding: 16,
  },
  driverRequestCardInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  driverRequestIconWrap: {
    width: 40,
    height: 40,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  driverRequestCardBody: { flex: 1, minWidth: 0 },
  driverRequestCardLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  driverRequestCardAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  driverRequestCardReason: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  driverRequestCardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  driverRequestBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  driverRequestBtnPay: {
    backgroundColor: Theme.buttonPrimary,
  },
  driverRequestBtnPayText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    letterSpacing: 1,
  },
  driverRequestBtnReject: {
    backgroundColor: Theme.screenBackground,
  },
  driverRequestBtnRejectText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1,
  },
  driverMetricsGrid: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    marginBottom: 16,
  },
  driverMetricCard: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    padding: 16,
    alignItems: "center",
  },
  driverMetricIcon: { marginBottom: 8 },
  driverMetricLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  driverMetricValue: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  driverMetricValueActive: { color: Theme.darkGreen },
  driverContactCard: {
    backgroundColor: Theme.screenBackground,
    padding: 16,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 16,
  },
  driverContactTwoCol: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  driverContactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  driverContactRowHalf: {
    flex: 1,
    minWidth: 0,
  },
  driverContactIconWrap: {
    width: 36,
    height: 36,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  driverContactIconWrapPurple: {
    backgroundColor: Theme.surfaceForm,
  },
  driverContactTextWrap: { flex: 1, minWidth: 0 },
  driverContactLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  driverContactValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  driverCompensationCard: {
    backgroundColor: Theme.screenBackground,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 16,
    overflow: "hidden",
  },
  driverCompensationHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  driverCompensationHeaderText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 1,
  },
  driverCompensationBody: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  driverCompensationCell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  driverCompensationCellLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 8,
    lineHeight: 12,
  },
  driverCompensationCellValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },
  driverCompensationColumnDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    alignSelf: "stretch",
  },
  driverAssignVehicleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Theme.buttonPrimary,
  },
  driverAssignVehicleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.5,
  },
  vehiclePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  vehiclePickerSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "50%",
    paddingBottom: 24,
  },
  vehiclePickerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  vehiclePickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  vehiclePickerItemDisabled: {
    opacity: 0.9,
    backgroundColor: Theme.surfaceGray,
  },
  vehiclePickerItemText: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  vehiclePickerItemTextAssigned: {
    color: Theme.teslaRed,
  },
  vehiclePickerItemSubtext: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.teslaRed,
    marginTop: 2,
  },
  driverProfileInsightsCard: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 16,
  },
  driverProfileInsightsHalf: {
    flex: 1,
    minWidth: 0,
  },
  driverProfileInsightsDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 12,
  },
  driverProfileInsightsLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  driverProfileInsightsValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  driverProfileInsightsHint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
  },
  driverRatingsSection: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 24,
  },
  driverRatingsSectionTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  driverRatingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    justifyContent: "flex-start",
    width: "100%",
  },
  driverRatingCard: {
    flexDirection: "column",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 0,
    flexGrow: 0,
  },
  driverRatingCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    minHeight: 32,
  },
  driverRatingIconWrap: {
    width: 28,
    height: 28,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  driverRatingScoreCol: {
    flex: 1,
    minWidth: 0,
  },
  driverRatingScore: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  driverRatingScoreMax: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  driverRatingDate: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  driverRatingRoute: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 14,
    letterSpacing: -0.2,
    minHeight: 28,
  },
});
