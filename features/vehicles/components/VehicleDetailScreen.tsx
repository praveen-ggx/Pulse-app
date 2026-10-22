import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import { entityCompanionCardStyles as ecc } from "@/components/entityCompanionCard.styles";
import { entityHeroScorecardStyles as ehs } from "@/components/entityHeroScorecard.styles";
import { EntityTripTableEmptyRow } from "@/components/EntityTripTableEmptyRow";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { FinanceFAB } from "@/components/FinanceFAB";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LedgerTransactionListView } from "@/features/finance/components/LedgerTransactionListView";
import {
  createLedgerEntry,
  getTransactionsByOrganization,
  type LedgerRow,
} from "@/features/finance";
import { useOrganization } from "@/contexts/OrganizationContext";
import { canAccessFinance } from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { formatINR, formatLedgerDate, normalizeVehicleNumberForMatch } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { getDriversByOrganization, type DriverRow } from "@/features/drivers";
import {
  getTripsByOrganization,
  getTripsWhereOrgIsSupplier,
  getTripDisplayNumber,
  supplierRowToTripRow,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { buildTripPnL, getExpenseLinesForTripPnL } from "@/features/vehicles/pnl";
import {
  getVehicleById,
  getVehicleForTripViewer,
  type VehicleRow,
} from "../services/vehicles.service";
import {
  clearInitialVehicleForDetail,
  getInitialVehicleForDetail,
} from "../initialVehicleForDetail";
import {
  AddVehicleEntryModal,
  type TripOption,
  type DriverOption,
} from "./AddVehicleEntryModal";
import { VehicleFleetRankingTab } from "./analytics/VehicleFleetRankingTab";
import { backfillVehicleOperationalCashLedger } from "@/features/ledger/vehicle";
import { ROUTES } from "@/lib/routes";
import { VehicleOperationsHub } from "./VehicleOperationsHub";
import { VehicleAvatar } from "./VehicleAvatar";
import { VehicleProfileHub } from "./desktop/VehicleProfileHub";

/**
 * First paint: the list VehicleRow seed stashed by FinanceScreen before
 * navigating here, if any. `getVehicleById` remains the authoritative
 * hydration source — never written into any query cache. Only valid for the
 * "own vehicle" case; the cross-org trip-viewer fallback below always fetches.
 */
function peekVehicleFirstPaint(vehicleId: string | null | undefined): VehicleRow | null {
  if (!vehicleId) return null;
  return getInitialVehicleForDetail(vehicleId);
}

export interface VehicleDetailScreenProps {
  vehicleId: string;
  onBack: () => void;
  openAddEntryOnLoad?: boolean;
  initialLedgerTripId?: string;
}

export default function VehicleDetailScreen({
  vehicleId,
  onBack,
  openAddEntryOnLoad = false,
  initialLedgerTripId,
}: VehicleDetailScreenProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && windowWidth >= 1024;
  const router = useRouter();
  const capabilities = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const canAddTransaction =
    canAccessFinance(capabilities) && canSurface("finance.add_transaction");
  const canViewVehicleAnalytics = canSurface("fleet.vehicles.analytics");
  const canViewVehicleDocuments = canSurface("fleet.vehicles.documents");
  const [vehicle, setVehicle] = useState<VehicleRow | null>(() =>
    peekVehicleFirstPaint(vehicleId),
  );
  /** True when `vehicle` was resolved via the cross-org trip-viewer fallback (vendor's own vehicle). */
  const [isCrossOrgVehicle, setIsCrossOrgVehicle] = useState(false);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driverRowsForLedger, setDriverRowsForLedger] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(() => peekVehicleFirstPaint(vehicleId) == null);
  const [error, setError] = useState<string | null>(null);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [detailSubTab, setDetailSubTab] = useState<
    "operations" | "trips" | "cash" | "ranking"
  >("operations");
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const lastFocusRefreshRef = useRef(0);
  /** Whether we currently have seed data to show while `load()` is in flight — first mount only, reset per `vehicleId`. */
  const hasSeedDataRef = useRef(peekVehicleFirstPaint(vehicleId) != null);
  /** Guards a resolving `load()` from writing state after the user has already switched to a different vehicle. */
  const activeVehicleIdRef = useRef(vehicleId);
  /** vehicleId of an in-flight `load()` call, or null — makes concurrent triggers (mount effect + focus effect) idempotent. */
  const loadInFlightRef = useRef<string | null>(null);
  const heroDecorProgress = useRef(new Animated.Value(0)).current;
  const queryClient = useQueryClient();
  const openAddEntryHandledRef = useRef(false);
  const cashLedgerBackfillAttemptRef = useRef(0);

  const vehicleMountRef = useRef(true);
  useEffect(() => {
    activeVehicleIdRef.current = vehicleId;
    initialLoadDoneRef.current = false;
    setError(null);
    if (vehicleMountRef.current) {
      // Initial mount already seeded `vehicle`/`loading` via useState initializers above.
      vehicleMountRef.current = false;
      return;
    }
    // Switching to a different vehicle on an already-mounted screen instance:
    // reset first so stale Vehicle A data never shows under Vehicle B's id,
    // then seed from the registry if available.
    const seed = peekVehicleFirstPaint(vehicleId);
    hasSeedDataRef.current = seed != null;
    setIsCrossOrgVehicle(false);
    setVehicle(seed);
    setLoading(seed == null);
  }, [vehicleId]);

  useEffect(() => {
    if (!openAddEntryOnLoad || openAddEntryHandledRef.current) return;
    setShowAddTransactionModal(true);
    openAddEntryHandledRef.current = true;
  }, [openAddEntryOnLoad]);

  useEffect(() => {
    if (!isWebDesktop) {
      heroDecorProgress.stopAnimation();
      heroDecorProgress.setValue(0);
      return;
    }
    const decorLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroDecorProgress, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(heroDecorProgress, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    decorLoop.start();
    return () => decorLoop.stop();
  }, [heroDecorProgress, isWebDesktop]);

  const load = useCallback(() => {
    if (!vehicleId || !currentOrganization?.id) {
      setLoading(false);
      return;
    }
    // Idempotency guard: useFocusEffect and the org-readiness retry effect can
    // both invoke load() for the same vehicleId in the same tick.
    if (loadInFlightRef.current === vehicleId) return;
    loadInFlightRef.current = vehicleId;
    const requestVehicleId = vehicleId;
    if (!isRefreshingRef.current && !initialLoadDoneRef.current && !hasSeedDataRef.current) setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;
    // FinanceScreen already warms these under the same query keys for the
    // whole Finance tab (useFinanceEntities) — reuse them instead of
    // re-fetching org-wide data this screen doesn't own.
    //
    // `ensureQueryData` (not a plain getQueryData-then-fallback-fetch) so a
    // cold cache is a single, request-deduplicated fetch shared with any
    // other concurrent consumer of the same queryKey — a plain fallback
    // fetch here would race a concurrently-mounting list/warmup hook and
    // double the RPC (identified as a contributor to the 2026-09-16 DB incident).
    const ownerTripsPromise = queryClient
      .ensureQueryData({
        queryKey: queryKeys.trips.finite(orgId),
        queryFn: async () => {
          const res = await getTripsByOrganization(orgId);
          if (res.error) throw res.error;
          return res.trips ?? [];
        },
      })
      .then((trips) => ({ error: null, trips }))
      .catch((error: unknown) => ({ error: error instanceof Error ? error : new Error(String(error)), trips: [] as TripRow[] }));
    const driversPromise = queryClient
      .ensureQueryData({
        queryKey: queryKeys.drivers.finite(orgId),
        queryFn: async () => {
          const res = await getDriversByOrganization(orgId);
          if (res.error) throw res.error;
          return res.drivers ?? [];
        },
      })
      .then((drivers) => ({ error: null, drivers }))
      .catch((error: unknown) => ({ error: error instanceof Error ? error : new Error(String(error)), drivers: [] as DriverRow[] }));
    const txPromise = queryClient
      .ensureQueryData({
        queryKey: queryKeys.transactions.finite(orgId),
        queryFn: async () => {
          const res = await getTransactionsByOrganization(orgId);
          if (res.error) throw res.error;
          return res.transactions ?? [];
        },
      })
      .then((transactions) => ({ error: null, transactions }))
      .catch((error: unknown) => ({ error: error instanceof Error ? error : new Error(String(error)), transactions: [] as LedgerRow[] }));
    Promise.all([
      getVehicleById(orgId, vehicleId),
      ownerTripsPromise,
      getTripsWhereOrgIsSupplier(orgId),
      driversPromise,
      txPromise,
    ]).then(([res, ownerRes, supplierRes, driversRes, txRes]) => {
      // The user navigated to a different vehicle while this was in flight —
      // a newer load() for the new vehicleId owns state now.
      if (activeVehicleIdRef.current !== requestVehicleId) return;
      if (res.vehicle) {
        setVehicle(res.vehicle);
        setIsCrossOrgVehicle(false);
      } else if (!res.error && initialLedgerTripId) {
        // Not our own vehicle — this is likely a vendor's vehicle on a trip we
        // subcontracted (e.g. an aggregator viewing the supplier's own truck).
        // Fall back to a minimal, read-only cross-org lookup instead of
        // reporting "not found": basic info + documents only, no trip
        // history/ledger/driver list (those stay properly org-scoped to the vendor).
        getVehicleForTripViewer(vehicleId, initialLedgerTripId, orgId).then((res2) => {
          if (activeVehicleIdRef.current !== requestVehicleId) return;
          if (res2.vehicle) {
            setVehicle(res2.vehicle);
            setIsCrossOrgVehicle(true);
          } else {
            setError(res2.error?.message ?? null);
            setVehicle(null);
            setIsCrossOrgVehicle(false);
          }
        });
      } else {
        setError(res.error?.message ?? null);
        setVehicle(null);
        setIsCrossOrgVehicle(false);
      }
      const ownerTrips = ownerRes.error ? [] : ownerRes.trips ?? [];
      const supplierTrips = supplierRes.error ? [] : (supplierRes.trips ?? []).map(supplierRowToTripRow);
      const byId = new Map(ownerTrips.map((t) => [t.id, t]));
      for (const t of supplierTrips) if (!byId.has(t.id)) byId.set(t.id, t);
      setTrips(Array.from(byId.values()));
      const driverList = driversRes?.error ? [] : (driversRes?.drivers ?? []);
      setDriverRowsForLedger(driverList);
      setDrivers(driverList.map((d) => ({ id: d.id, name: d.name ?? d.phone ?? t('driver') })));
      const allTx =
        (txRes.error ? [] : ((txRes.transactions ?? []) as LedgerRow[])) ?? [];
      setTransactions(allTx);
    }).finally(() => {
      if (loadInFlightRef.current === requestVehicleId) loadInFlightRef.current = null;
      if (activeVehicleIdRef.current !== requestVehicleId) return;
      setLoading(false);
      initialLoadDoneRef.current = true;
      hasSeedDataRef.current = false;
      isRefreshingRef.current = false;
      setRefreshing(false);
      clearInitialVehicleForDetail(requestVehicleId);
    });
  }, [vehicleId, currentOrganization?.id, queryClient]);

  // useFocusEffect handles initial load + re-focus refreshes (throttled to 2 min).
  // The separate useEffect is NOT needed — useFocusEffect fires on mount too.
  useFocusEffect(
    useCallback(() => {
      if (initialLoadDoneRef.current && Date.now() - lastFocusRefreshRef.current < 2 * 60_000) return;
      lastFocusRefreshRef.current = Date.now();
      load();
    }, [load]),
  );
  // Fallback: org context may not be ready when focus fires on cold start.
  useEffect(() => {
    if (!currentOrganization?.id || initialLoadDoneRef.current) return;
    load();
  }, [currentOrganization?.id, load]);

  /** Include trips by vehicle_id or by vehicle_display_number matching this vehicle (indent-based/own/supplier). */
  const tripMatchesVehicle = useCallback(
    (t: TripRow) => {
      if (t.vehicle_id === vehicleId) return true;
      if (!vehicle) return false;
      const displayNum = (t.vehicle_display_number ?? "").trim();
      if (!displayNum) return false;
      return (
        normalizeVehicleNumberForMatch(displayNum) ===
        normalizeVehicleNumberForMatch(vehicle.vehicle_number)
      );
    },
    [vehicleId, vehicle],
  );

  const tripOptions: TripOption[] = useMemo(
    () =>
      trips
        .filter(tripMatchesVehicle)
        .map((t) => ({
          id: t.id,
          trip_number: getTripDisplayNumber(t),
          route_label: [t.pickup_area, t.drop_location].filter(Boolean).join(' → ') || null,
          trip_date: formatLedgerDate(t.pickup_date || t.created_at),
          driver_id: t.driver_id ?? null,
        })),
    [trips, tripMatchesVehicle],
  );

  const vehicleTrips = useMemo(
    () => trips.filter(tripMatchesVehicle),
    [trips, tripMatchesVehicle],
  );

  const vehicleTransactions = useMemo(() => {
    const tripIds = new Set(vehicleTrips.map((t) => t.id));
    const targetVehicleNum = vehicle ? normalizeVehicleNumberForMatch(vehicle.vehicle_number) : null;
    return transactions.filter(
      (tx) => {
        if (tx.trip_id != null && tripIds.has(tx.trip_id)) return true;
        if (targetVehicleNum && tx.vehicle_number) {
          return normalizeVehicleNumberForMatch(tx.vehicle_number) === targetVehicleNum;
        }
        return false;
      }
    );
  }, [vehicleTrips, transactions, vehicle]);

  const runOperationalCashLedgerBackfill = useCallback(() => {
    const orgId = currentOrganization?.id;
    if (!orgId || !vehicleId || vehicleTrips.length === 0) return;
    void backfillVehicleOperationalCashLedger({
      organizationId: orgId,
      vehicleId,
      tripIds: vehicleTrips.map((trip) => trip.id),
    }).then((result) => {
      if (result.created > 0 || result.failed > 0) {
        load();
      }
    });
  }, [currentOrganization?.id, load, vehicleId, vehicleTrips]);

  useEffect(() => {
    if (!initialLoadDoneRef.current || vehicleTrips.length === 0) return;
    const hasCashOut = vehicleTransactions.some((tx) => Number(tx.amount_out ?? 0) > 0);
    if (hasCashOut) return;
    if (cashLedgerBackfillAttemptRef.current >= 3) return;
    cashLedgerBackfillAttemptRef.current += 1;
    runOperationalCashLedgerBackfill();
  }, [runOperationalCashLedgerBackfill, vehicleTransactions, vehicleTrips.length]);

  const vehicleTransactionsByTripId = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const trip of vehicleTrips) {
      map.set(
        trip.id,
        getTripLedgerEntries(vehicleTransactions, trip.id, getTripDisplayNumber(trip)),
      );
    }
    return map;
  }, [vehicleTrips, vehicleTransactions]);

  const missionRows = useMemo(() => {
    if (!vehicleTrips.length || !currentOrganization?.id) return [];
    const orgId = currentOrganization.id;
    const rows = vehicleTrips.map((trip) => {
      const tripLedgerEntries = vehicleTransactionsByTripId.get(trip.id) ?? [];
      const pnl = buildTripPnL(trip, tripLedgerEntries, getTripDisplayNumber, true);
      const isSupplierTrip =
        String(trip.organization_id ?? "").trim() !== String(orgId).trim();
      const sales = isSupplierTrip
        ? Number(trip.supplier_rate ?? 0)
        : pnl.sales;
      const expense = isSupplierTrip
        ? pnl.totalExpense - Number(trip.supplier_rate ?? 0)
        : pnl.totalExpense;
      const profit = sales - expense;
      const margin = sales > 0 ? (profit / sales) * 100 : expense > 0 ? -100 : 0;
      return {
        trip: pnl.trip,
        missionId: pnl.missionId,
        route: `${pnl.origin} → ${pnl.dest}`.trim() || "—",
        sales,
        expense,
        profit,
        margin,
        expenseLines: getExpenseLinesForTripPnL(pnl.trip, tripLedgerEntries, true),
      };
    });
    return rows;
  }, [vehicleTrips, vehicleTransactionsByTripId, currentOrganization?.id]);

  const vehicleTripDetailsMap = useMemo(() => {
    const m: Record<
      string,
      {
        trip_number: string;
        drop_location?: string;
        pickup_area?: string;
        client_name?: string;
        pickup_date?: string | null;
      }
    > = {};
    trips.forEach((t) => {
      m[t.id] = {
        trip_number: getTripDisplayNumber(t),
        drop_location: t.drop_location ?? undefined,
        pickup_area: t.pickup_area ?? undefined,
        client_name: t.client_name ?? undefined,
        pickup_date: t.pickup_date ?? undefined,
      };
    });
    return m;
  }, [trips]);

  const linkedDriver = useMemo(() => {
    if (!vehicle) return null;
    return (
      driverRowsForLedger.find((d) => d.assigned_vehicle_id === vehicle.id) ?? null
    );
  }, [driverRowsForLedger, vehicle]);

  const contractValue = useMemo(
    () => missionRows.reduce((s, r) => s + r.sales, 0),
    [missionRows],
  );
  const totalExpense = useMemo(
    () => missionRows.reduce((s, r) => s + r.expense, 0),
    [missionRows],
  );
  const profit = useMemo(
    () => missionRows.reduce((s, r) => s + r.profit, 0),
    [missionRows],
  );
  const tripsHandled = missionRows.length;
  const tripOperationalSpend = useMemo(() => {
    let fuelInr = 0;
    let tollInr = 0;
    for (const row of missionRows) {
      for (const line of row.expenseLines) {
        const label = line.label.toLowerCase();
        if (label.includes("fuel")) fuelInr += line.amount;
        else if (label.includes("toll")) tollInr += line.amount;
      }
    }
    return { fuelInr, tollInr };
  }, [missionRows]);
  const utilizationPct = useMemo(() => {
    const now = Date.now();
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    const recentTrips = vehicleTrips.filter((trip) => {
      const d = new Date(trip.created_at ?? trip.pickup_date ?? "");
      return Number.isFinite(d.getTime()) && now - d.getTime() <= windowMs;
    }).length;
    if (recentTrips <= 0) return 0;
    return Math.min(100, (recentTrips / 30) * 100);
  }, [vehicleTrips]);
  const performanceScore = Number(
    (
      contractValue > 0
        ? Math.min(5, Math.max(2.8, 3 + (profit / contractValue) * 1.4))
        : 3.8
    ).toFixed(1),
  );
  const performanceStars = Math.max(0, Math.min(5, Math.round(performanceScore)));
  const vehicleStatusTitle =
    (vehicle?.status ?? "active").toLowerCase() === "active"
      ? "Active"
      : "Inactive";
  const docsCount = vehicle?.documents ? Object.keys(vehicle.documents).length : 0;

  const handleVehicleEntrySubmit = useCallback(
    (data: Parameters<typeof createLedgerEntry>[1]) => {
      if (!currentOrganization?.id) return;
      createLedgerEntry(currentOrganization.id, data).then(({ error: err }) => {
        if (!err) {
          setShowAddTransactionModal(false);
          load();
        } else Alert.alert(t('transactionFailed'), err.message);
      });
    },
    [currentOrganization?.id, load],
  );

  if (loading) {
    return (
      <CenteredLoadingView
        message={t("loadingVehicle")}
      />
    );
  }

  if (error || !vehicle) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onBack}
            activeOpacity={0.8}
          >
            <FontAwesome
              name="chevron-left"
              size={20}
              color={Theme.textPrimaryDark}
            />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {t("vehicle")}
            </Text>
          </View>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error || t("vehicleNotFound")}</Text>
        </View>
      </View>
    );
  }

  const vehicleTypeDisplay =
    vehicle.vehicle_type?.trim() ||
    vehicle.vehicle_body_type?.trim() ||
    "—";
  const vehicleBrandModelLabel = [vehicle.vehicle_brand, vehicle.vehicle_model]
    .filter(Boolean)
    .join(" ");
  const vehicleTypeLabel =
    vehicleTypeDisplay !== "—"
      ? vehicleTypeDisplay
      : vehicleBrandModelLabel || "—";
  const profileIdentitySubtitle = [linkedDriver?.name?.trim(), vehicleTypeLabel?.trim()]
    .filter((value): value is string => Boolean(value && value !== "—"))
    .join(" • ") || "—";
  const heroDecorAnimatedStyle = isWebDesktop
    ? {
        opacity: heroDecorProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.16, 0.3],
        }),
        transform: [
          {
            translateY: heroDecorProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -6],
            }),
          },
          {
            rotate: heroDecorProgress.interpolate({
              inputRange: [0, 1],
              outputRange: ["10deg", "4deg"],
            }),
          },
        ],
      }
    : undefined;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
        >
          <FontAwesome
            name="chevron-left"
            size={20}
            color={Theme.textPrimaryDark}
          />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {vehicle.vehicle_number}
          </Text>
          <Text style={styles.headerSubtitle}>VEHICLE FINANCIAL VIEW</Text>
        </View>
        <View style={styles.headerRight}>
          {canViewVehicleAnalytics ? (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.push(ROUTES.vehicleAnalytics(vehicleId) as never)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open vehicle analytics"
            >
              <FontAwesome name="line-chart" size={17} color={Theme.textPrimaryDark} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setShowProfileModal(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open vehicle profile"
          >
            <FontAwesome name="truck" size={18} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
        </View>
      </View>

      {isCrossOrgVehicle ? (
        <View style={styles.crossOrgNotice}>
          <FontAwesome name="info-circle" size={13} color={Theme.textMuted} />
          <Text style={styles.crossOrgNoticeText}>
            Limited view — this vehicle belongs to your vendor. Trip history, cash ledger, and driver list stay with their organization.
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: canAddTransaction
              ? Layout.fabBottomOffset + Layout.fabSize + insets.bottom
              : Layout.fabBottomOffset + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              isRefreshingRef.current = true;
              setRefreshing(true);
              cashLedgerBackfillAttemptRef.current = 0;
              runOperationalCashLedgerBackfill();
              load();
            }}
            tintColor={Theme.loaderAccent}
          />
        }
      >
        <View style={isWebDesktop ? styles.heroCardsRow : undefined}>
          <LinearGradient
            colors={[Theme.financeCardSlateFrom, Theme.financeCardSlateTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.scorecard,
              isWebDesktop && styles.scorecardWebDesktop,
              isWebDesktop && styles.scorecardHeroPane,
            ]}
          >
            {isWebDesktop ? (
              <Animated.View style={[styles.scorecardDecorIconWrap, heroDecorAnimatedStyle]}>
                <FontAwesome name="truck" size={120} color={Theme.textOnDark} style={styles.scorecardDecorIcon} />
              </Animated.View>
            ) : null}
            <View
              style={[styles.scorecardTop, isWebDesktop && styles.scorecardTopWebDesktop]}
            >
              <View style={styles.scorecardLeft}>
                <Text style={styles.scorecardLabel}>FINANCIAL OVERVIEW</Text>
                <Text style={styles.scorecardSalesLabel}>VEHICLE SALES</Text>
                <Text
                  style={[
                    styles.scorecardAmount,
                    isWebDesktop && styles.scorecardAmountWebDesktop,
                  ]}
                >
                  {formatINR(contractValue)}
                </Text>
              </View>
            </View>
            <View
              style={[styles.scorecardGrid, isWebDesktop && styles.scorecardGridWebDesktop]}
            >
              <View style={isWebDesktop ? styles.scorecardGridStat : undefined}>
                <Text style={styles.scorecardGridLabelPaid}>EXPENSE</Text>
                <Text
                  style={[
                    styles.scorecardGridPaid,
                    isWebDesktop && styles.scorecardGridPaidWebDesktop,
                  ]}
                >
                  {formatINR(totalExpense)}
                </Text>
              </View>
              <View
                style={[
                  styles.scorecardGridRight,
                  isWebDesktop && styles.scorecardGridStat,
                ]}
              >
                <Text style={styles.scorecardGridLabelDue}>PROFIT</Text>
                <Text
                  style={[
                    styles.scorecardGridDue,
                    isWebDesktop && styles.scorecardGridDueWebDesktop,
                  ]}
                >
                  {formatINR(profit)}
                </Text>
              </View>
            </View>
          </LinearGradient>
          {isWebDesktop ? (
            <View style={styles.profilePreviewCard}>
              <View style={ecc.dossierHeader}>
                <View style={styles.profilePreviewTopMetaRow}>
                  <View style={styles.profilePreviewTopAction}>
                    <Text style={styles.profilePreviewTopActionText} numberOfLines={1}>
                      {tripsHandled}
                    </Text>
                  </View>
                  <View style={styles.profilePreviewRatingRow}>
                    <View style={styles.profilePreviewStars}>
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <FontAwesome
                          key={`vehicle-star-header-${idx}`}
                          name={idx < performanceStars ? "star" : "star-o"}
                          size={13}
                          color={idx < performanceStars ? "#fbbf24" : Theme.borderMedium}
                        />
                      ))}
                    </View>
                    <View style={styles.profilePreviewRatingBadge}>
                      <Text style={styles.profilePreviewRatingBadgeText} numberOfLines={1}>
                        {performanceScore.toFixed(1)}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.profilePreviewTopAction}
                  onPress={() => setShowProfileModal(true)}
                  activeOpacity={0.85}
                  accessibilityLabel="Open vehicle full profile"
                >
                  <Text style={styles.profilePreviewTopActionText}>
                    FULL PROFILE
                  </Text>
                  <FontAwesome
                    name="chevron-right"
                    size={10}
                    color={Theme.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={ecc.dossierIdentity}
                onPress={() => setShowProfileModal(true)}
                activeOpacity={0.85}
                accessibilityLabel="Open vehicle full profile"
              >
                <View style={ecc.dossierAvatarWrap}>
                  <VehicleAvatar
                    vehicleId={vehicle.id}
                    vehicleNumber={vehicle.vehicle_number}
                    avatarUrl={vehicle.avatar_url}
                    avatarSeed={vehicle.avatar_seed}
                    size={56}
                  />
                  <View style={ecc.dossierAvatarBadge}>
                    <FontAwesome name="truck" size={10} color={Theme.textOnPrimary} />
                  </View>
                </View>
                <Text style={ecc.dossierName} numberOfLines={1}>
                  {vehicle.vehicle_number}
                </Text>
                <Text style={ecc.dossierSub} numberOfLines={1}>
                  {profileIdentitySubtitle}
                </Text>
                <View style={ecc.dossierBadgeRow}>
                  <View style={[ecc.dossierBadge, ecc.dossierBadgeBlue]}>
                    <Text style={ecc.dossierBadgeText}>VEHICLE</Text>
                  </View>
                  <View style={[ecc.dossierBadge, ecc.dossierBadgeDark]}>
                    <Text style={[ecc.dossierBadgeText, ecc.dossierBadgeTextDark]}>
                      {vehicleStatusTitle}
                    </Text>
                  </View>
                  <View style={[ecc.dossierBadge, ecc.dossierBadgeMuted]}>
                    <Text style={[ecc.dossierBadgeText, ecc.dossierBadgeTextMuted]}>
                      {docsCount} DOCS
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              <View style={ecc.dossierContactStack}>
                <View style={ecc.dossierContactRow}>
                  <View style={ecc.dossierContactIcon}>
                    <FontAwesome name="truck" size={13} color={Theme.textMuted} />
                  </View>
                  <View style={ecc.dossierContactText}>
                    <Text style={ecc.dossierContactLabel}>Vehicle Type</Text>
                    <Text style={ecc.dossierContactValue} numberOfLines={1}>
                      {vehicleTypeLabel}
                    </Text>
                  </View>
                </View>
                <View style={ecc.dossierContactRow}>
                  <View style={ecc.dossierContactIcon}>
                    <FontAwesome name="id-card-o" size={13} color={Theme.textMuted} />
                  </View>
                  <View style={ecc.dossierContactText}>
                    <Text style={ecc.dossierContactLabel}>Documents</Text>
                    <Text style={ecc.dossierContactValue} numberOfLines={1}>
                      {docsCount} attached
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.profilePreviewActionBtn, ecc.actionBtnPrimary]}
                onPress={() => setShowProfileModal(true)}
                activeOpacity={0.86}
              >
                <FontAwesome name="id-card-o" size={14} color={Theme.textOnPrimary} />
                <Text style={styles.profilePreviewActionText}>View full profile</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[
              styles.tabItem,
              detailSubTab === "operations" && styles.tabItemActive,
            ]}
            onPress={() => setDetailSubTab("operations")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabItemText,
                detailSubTab === "operations" && styles.tabItemTextActive,
              ]}
            >
              Operations
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabItem,
              detailSubTab === "trips" && styles.tabItemActive,
            ]}
            onPress={() => setDetailSubTab("trips")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabItemText,
                detailSubTab === "trips" && styles.tabItemTextActive,
              ]}
            >
              Trips
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabItem,
              detailSubTab === "cash" && styles.tabItemActive,
            ]}
            onPress={() => setDetailSubTab("cash")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabItemText,
                detailSubTab === "cash" && styles.tabItemTextActive,
              ]}
            >
              Cash Flow
            </Text>
          </TouchableOpacity>
          {canViewVehicleAnalytics ? (
            <TouchableOpacity
              style={[
                styles.tabItem,
                detailSubTab === "ranking" && styles.tabItemActive,
              ]}
              onPress={() => setDetailSubTab("ranking")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabItemText,
                  detailSubTab === "ranking" && styles.tabItemTextActive,
                ]}
              >
                Ranking
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {detailSubTab === "operations" && (
          <VehicleOperationsHub
            organizationId={currentOrganization?.id ?? null}
            vehicleId={vehicleId}
            utilizationPct={utilizationPct}
            actorUserId={profile?.uid ?? null}
            tripOperationalSpend={tripOperationalSpend}
            fleetTotals={{
              revenueInr: contractValue,
              expenseInr: totalExpense,
              netInr: profit,
              tripCount: tripsHandled,
            }}
            onOpenAnalytics={() =>
              router.push(ROUTES.vehicleAnalytics(vehicleId) as never)
            }
            onSwitchToCashFlow={() => setDetailSubTab("cash")}
          />
        )}

        {detailSubTab === "trips" && (
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.thMission]}>Trip</Text>
              <Text style={[styles.th, styles.thSales]}>Sales</Text>
              <Text style={[styles.th, styles.thRight]}>Expense</Text>
              <Text style={[styles.th, styles.thRight]}>Profit</Text>
            </View>
            {missionRows.length > 0 ? (
              missionRows.map((row) => (
                <Pressable
                  key={row.trip.id}
                  style={(state: HoverPressState) => [
                    styles.tableRow,
                    WEB_POINTER,
                    WEB_TRANSITION,
                    isHovered(state) && hoverRowWash,
                  ]}
                  onPress={() =>
                    router.push(
                      `/trip/${row.trip.id}?entryContext=vehicle` as const,
                    )
                  }
                >
                  <View style={styles.tdMission}>
                    <Text style={styles.tdMissionId}>{row.missionId}</Text>
                    <Text style={styles.tdRoute} numberOfLines={1}>
                      {row.route}
                    </Text>
                  </View>
                  <Text style={[styles.td, styles.tdSales]}>
                    {formatINR(row.sales)}
                  </Text>
                  <Text
                    style={[
                      styles.td,
                      styles.tdRight,
                      styles.tdRed,
                    ]}
                  >
                    {formatINR(row.expense)}
                  </Text>
                  <Text
                    style={[
                      styles.td,
                      styles.tdRight,
                      row.profit >= 0 ? styles.tdGreen : styles.tdRed,
                    ]}
                  >
                    {formatINR(row.profit)}
                  </Text>
                </Pressable>
              ))
            ) : (
              <EntityTripTableEmptyRow textStyle={styles.emptyRowText} style={styles.emptyRow} />
            )}
          </View>
        )}

        {detailSubTab === "ranking" && vehicleId && canViewVehicleAnalytics && (
          <VehicleFleetRankingTab currentVehicleId={vehicleId} />
        )}

        {detailSubTab === "cash" && (
          <View style={styles.cashSection}>
            <LedgerTransactionListView
              transactions={vehicleTransactions}
              tripDetailsMap={vehicleTripDetailsMap}
              useTimelineLayout={true}
              showFiscalSubTabs={false}
              showTitle={false}
              showHistoryHeader={false}
              showGridFooter={false}
              embedInParentScroll={true}
              driverRows={driverRowsForLedger}
            />
          </View>
        )}
      </ScrollView>

      {canAddTransaction && (
        <View
          style={[
            styles.fabWrap,
            { bottom: Layout.fabBottomOffset + insets.bottom },
          ]}
        >
          <FinanceFAB
            onPress={() => {
              const params = new URLSearchParams();
              params.set("entityType", "VEHICLE");
              params.set("entityId", vehicleId);
              params.set("partyName", vehicle?.vehicle_number ?? "");
              router.push(
                (`/(modals)/ledger-sync?${params.toString()}`) as
                  `/(modals)/ledger-sync`,
              );
            }}
            accessibilityLabel={t("addTransaction")}
            icon="receipt-text"
          />
        </View>
      )}

      <AddVehicleEntryModal
        visible={showAddTransactionModal}
        onClose={() => setShowAddTransactionModal(false)}
        onSubmit={handleVehicleEntrySubmit}
        vehicleNumber={vehicle?.vehicle_number ?? ""}
        entryContextLabel={vehicle?.vehicle_number ?? t("vehicle")}
        trips={tripOptions}
        drivers={drivers}
        initialTripId={initialLedgerTripId}
      />

      <Modal
        visible={showProfileModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View
          style={[
            styles.profileModalWrap,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          {vehicle ? (
            <VehicleProfileHub
              vehicle={vehicle}
              tripCount={vehicleTrips.length}
              onBack={() => setShowProfileModal(false)}
              organizationId={currentOrganization?.id}
              canEditDocuments={canViewVehicleDocuments}
              onDocumentsUpdated={(docs) =>
                setVehicle((v) => (v ? { ...v, documents: docs } : null))
              }
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  errorText: { fontSize: 15, color: Theme.textSecondary },
  errorWrap: { padding: 16 },
  crossOrgNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  crossOrgNoticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  wrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fabWrap: {
    position: "absolute",
    right: Layout.fabRightOffset,
    zIndex: 100,
    elevation: 10,
  },
  downloadBtn: {
    width: 40,
    height: 40,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 24,
  },
  scorecard: ehs.scorecard,
  scorecardWebDesktop: ehs.scorecardWebDesktop,
  heroCardsRow: ehs.heroCardsRow,
  scorecardHeroPane: ehs.scorecardHeroPane,
  scorecardDecorIconWrap: ehs.scorecardDecorIconWrap,
  scorecardDecorIcon: ehs.scorecardDecorIcon,
  scorecardTop: ehs.scorecardTop,
  scorecardTopWebDesktop: ehs.scorecardTopWebDesktop,
  scorecardLeft: ehs.scorecardLeft,
  scorecardLabel: ehs.scorecardLabel,
  scorecardSalesLabel: ehs.scorecardSalesLabel,
  scorecardAmount: ehs.scorecardAmount,
  scorecardAmountWebDesktop: ehs.scorecardAmountWebDesktop,
  healthCircle: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  healthCircleFill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Theme.darkGreen,
  },
  healthCircleText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    zIndex: 1,
  },
  scorecardGrid: ehs.scorecardGrid,
  scorecardGridWebDesktop: ehs.scorecardGridWebDesktop,
  scorecardGridStat: ehs.scorecardGridStat,
  scorecardGridRight: ehs.scorecardGridRight,
  scorecardGridLabelPaid: ehs.scorecardGridLabelPaid,
  scorecardGridLabelDue: ehs.scorecardGridLabelDue,
  scorecardGridPaid: ehs.scorecardGridPaid,
  scorecardGridPaidWebDesktop: ehs.scorecardGridPaidWebDesktop,
  scorecardGridDue: ehs.scorecardGridDue,
  scorecardGridDueWebDesktop: ehs.scorecardGridDueWebDesktop,
  profilePreviewCard: ecc.card,
  profilePreviewTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  profilePreviewEyebrow: ecc.eyebrow,
  profilePreviewTopMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    flexShrink: 1,
  },
  profilePreviewTopAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 24,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 8,
  },
  profilePreviewTopActionText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textSecondary,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  profilePreviewIdentityRow: ecc.identityRow,
  profilePreviewIdentityAvatar: ecc.identityAvatar,
  profilePreviewIdentityAvatarImage: ecc.identityAvatarImage,
  profilePreviewIdentityMeta: ecc.identityMeta,
  profilePreviewIdentityName: ecc.identityName,
  profilePreviewIdentitySub: ecc.identitySub,
  profilePreviewIdentityTrigger: {
    paddingVertical: 2,
  },
  profilePreviewRatingRow: ecc.ratingRow,
  profilePreviewStars: ecc.stars,
  profilePreviewRatingBadge: ecc.ratingBadge,
  profilePreviewRatingBadgeText: ecc.ratingBadgeText,
  profilePreviewExperienceBlock: ecc.experienceBlock,
  profilePreviewExperienceEyebrow: ecc.experienceEyebrow,
  profilePreviewExperienceRow: ecc.experienceRow,
  profilePreviewExperienceIconWrap: ecc.experienceIconWrap,
  profilePreviewTripsNumber: ecc.tripsNumber,
  profilePreviewExperienceLabel: ecc.experienceLabel,
  profilePreviewDetails: ecc.details,
  profilePreviewDetailRow: ecc.detailRow,
  profilePreviewDetailLabel: ecc.detailLabel,
  profilePreviewDetailValue: ecc.detailValue,
  profilePreviewToggle: ecc.toggle,
  profilePreviewToggleDot: ecc.toggleDot,
  profilePreviewToggleDotActive: ecc.toggleDotActive,
  profilePreviewToggleTextWrap: ecc.toggleTextWrap,
  profilePreviewToggleTitle: ecc.toggleTitle,
  profilePreviewToggleSub: ecc.toggleSub,
  profilePreviewActionBtn: ecc.actionBtn,
  profilePreviewActionText: ecc.actionText,
  tabRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  tabItemActive: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabItemText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
  },
  tabItemTextActive: {
    color: Theme.textPrimaryDark,
  },
  tableCard: {
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  th: {
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  thMission: { flex: 2, minWidth: 0 },
  thSales: { flex: 1, textAlign: "right" as const },
  thRight: { flex: 1, textAlign: "right" as const },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  td: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  tdMission: { flex: 2, minWidth: 0 },
  tdMissionId: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tdRoute: {
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 4,
  },
  tdSales: { flex: 1, textAlign: "right" as const },
  tdRight: { flex: 1, textAlign: "right" as const },
  tdGreen: { color: Theme.darkGreen },
  tdRed: { color: Theme.teslaRed },
  emptyRow: { paddingVertical: 24, alignItems: "center", gap: 4 },
  emptyRowText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  cashSection: { marginBottom: 24 },
  profileModalWrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  profileModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  profileModalTitle: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  profileModalCloseBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  profileModalScroll: { flex: 1 },
  profileModalContent: {
    padding: Layout.screenPaddingHorizontal,
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: Theme.screenBackground,
    padding: 20,
    marginBottom: 16,
  },
  profileCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
  },
  profilePhotoPicker: {
    flexShrink: 0,
    marginBottom: 28,
  },
  profileAvatarWrap: {
    width: 64,
    height: 64,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  profileCardTopText: { flex: 1, minWidth: 0, paddingTop: 4 },
  profileEntityName: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  profileBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  profileBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.positiveMuted,
  },
  profileBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
  },
  profileBadgeCore: {
    backgroundColor: Theme.fiscalTabActiveBg ?? "#e8eaf6",
  },
  profileBadgeCoreText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  profileSpecList: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    marginBottom: 12,
  },
  profileSpecRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 4,
  },
  profileSpecRowLast: {
    borderBottomWidth: 0,
  },
  profileSpecLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  profileSpecValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  profileGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  profileGridItem: {
    flex: 1,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  profileGridLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  profileGridValue: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
});
