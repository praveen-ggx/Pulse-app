import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { DateRangePickerModal } from "@/components/DateRangePickerModal";
import { DatePresetPillBar } from "@/components/DatePresetPillBar";
import { EntityIntelWidgetRow } from "@/components/entityIntel/EntityIntelWidgetRow";
import { pickEntityReport } from "@/components/entityIntel/pickEntityReport";
import { DetailPageLayout, DetailSection } from "@/components/DetailPageLayout";
import { entityCompanionCardStyles as ecc } from "@/components/entityCompanionCard.styles";
import { entityHeroScorecardStyles as ehs } from "@/components/entityHeroScorecard.styles";
import { DriverPartnerProfileDashboard } from "@/features/drivers/components/DriverPartnerProfileDashboard";
import { EditLocalDriverModal } from "@/features/drivers/components/EditLocalDriverModal";
import { FinanceFAB } from "@/components/FinanceFAB";
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import { entityDetailDownloadIconColor } from "@/components/entityDetailPageChrome.styles";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
    computeDriverCommissionForTrip,
    LedgerReportModal,
    type FinancePeriodFilter,
    type LedgerRow,
} from "@/features/finance";
import {
    buildDriverPayableReport,
    formatReportInr,
    formatSettlementPct,
} from "@/features/finance/lib/entityDetailReports.util";
import {
    buildMonthlyDriverStatement,
    type DriverLedgerEntryForStatement,
    type TripForStatement,
} from "@/features/finance/aggregation/driverMonthlyStatement";
import { LedgerTransactionListView } from "@/features/finance/components/LedgerTransactionListView";
import {
    averageScore,
    type RatingRow,
} from "@/features/ratings";
import {
    getTripDisplayNumber,
    getTripsForOrg,
    type TripRow,
} from "@/features/trips/services/trips.service";
import {
  AVATAR_BUCKET,
  extractPathFromStorageUrl,
  getSignedAvatarUrl,
  LEGACY_AVATAR_BUCKET,
} from "@/lib/avatarUpload";
import {
    canAccessFinance } from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
    formatIndianVehicleNumber,
    formatINR,
    formatLedgerAmount,
    formatLedgerDate,
    formatTripTableDate,
} from "@/lib/format";
import type { SalaryRequestRow } from "@/features/drivers/services/salaryRequests.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ROUTES } from "@/lib/routes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    attachDriverByContact,
    getDriverDetailBundle,
    getDriverInviteSentStatus,
    getDriverOffersByOrganization,
    getDriverProfileDisplay,
    getDriverSignupMatchStatus,
    getDriverTenures,
    getLatestDriverInviteTermsByUser,
    inviteDriver,
    resetDriverSignupInvite,
    sendDriverSignupMatchInvite,
    updateDriver,
    type DriverRow,
    type DriverSignupMatchStatus,
    type DriverTenureRow,
    isLocalDriverRow,
    type UpdateDriverData,
} from "../services/drivers.service";
import {
  clearInitialDriverForDetail,
  getInitialDriverForDetail,
} from "../initialDriverForDetail";
import {
  DriverFleetInviteSalaryModal,
  type DriverFleetInviteSalaryModalMode,
} from "./DriverFleetInviteSalaryModal";
import { DriverEarningsAnalyticsTab } from "./analytics/DriverEarningsAnalyticsTab";
import { DriverFleetRankingTab } from "./analytics/DriverFleetRankingTab";
import {
  normalizeDriverInviteCompensation,
  suggestDriverInviteCompensation,
  type DriverInviteCompensation,
} from "../utils/driverInviteCompensation.util";

/** Latest payment date for a trip from ledger. */
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

/** Aging label from date (YYYY-MM-DD). */
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

function formatLedgerDateShort(s: string): string {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  return `${day} ${months[Number(m) - 1] ?? m} ${y}`;
}

function getClientInitials(name: string | null | undefined): string {
  const n = (name ?? "").trim().toUpperCase();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.slice(0, 2);
  return n.slice(0, 2);
}

function formatDayMonUpper(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, day] = iso.slice(0, 10).split("-").map(Number);
  const months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
  if (!y || !m || !day) return "—";
  return `${day} ${months[m - 1] ?? ""}`.trim();
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDistKm(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(typeof v === 'string' ? v.replace(/,/g, '').trim() : v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function getCommissionBasis(
  trip: { client_price?: number | null; distance?: string | number | null; driver_commission?: number | null; supplier_rate?: number | null },
  offer: { commissionPercent: number | null; commissionPerKm: number | null; payableAmount?: number | null } | null,
): string {
  if (offer) {
    const pct = offer.commissionPercent != null && Number(offer.commissionPercent) >= 0 ? Number(offer.commissionPercent) : null;
    const perKm = offer.commissionPerKm != null && Number(offer.commissionPerKm) >= 0 ? Number(offer.commissionPerKm) : null;
    const base = Number(trip.client_price ?? 0);
    if (pct != null && base > 0) return `${pct}% of ₹${base.toLocaleString('en-IN')}`;
    if (perKm != null) {
      const km = parseDistKm(trip.distance);
      if (km != null && km > 0) return `₹${perKm}/km × ${km} km`;
      return `₹${perKm}/km`;
    }
    if (offer.payableAmount != null && Number(offer.payableAmount) > 0)
      return `Monthly ₹${Number(offer.payableAmount).toLocaleString('en-IN')}`;
  }
  if (Number(trip.driver_commission ?? 0) > 0) return 'Fixed trip rate';
  if (Number(trip.supplier_rate ?? 0) > 0) return '10% of supplier rate';
  return '10% of revenue';
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  return startOfLocalDay(x);
}

function startOfMonthLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function parseTripFilterDate(iso: string | undefined): Date | null {
  if (!iso || iso.length < 10) return null;
  const [y, m, day] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}

function tripMatchesDatePreset(
  dateIso: string | undefined,
  preset: FinancePeriodFilter,
  customFrom: string | null,
  customTo: string | null,
  now: Date = new Date(),
): boolean {
  if (preset === "RANGE") return true;
  const tripD = parseTripFilterDate(dateIso);
  if (!tripD) return false;
  const t0 = startOfLocalDay(now);
  if (preset === "TODAY") {
    return tripD >= t0 && tripD <= endOfLocalDay(now);
  }
  if (preset === "YESTERDAY") {
    const y = new Date(t0);
    y.setDate(y.getDate() - 1);
    return tripD >= startOfLocalDay(y) && tripD <= endOfLocalDay(y);
  }
  if (preset === "WEEK") {
    const wStart = startOfWeekMonday(now);
    return tripD >= wStart && tripD <= endOfLocalDay(now);
  }
  if (preset === "MONTH") {
    const mStart = startOfMonthLocal(now);
    return tripD >= mStart && tripD <= endOfLocalDay(now);
  }
  if (preset === "CUSTOM" && customFrom && customTo) {
    const from = parseTripFilterDate(customFrom);
    const to = parseTripFilterDate(customTo);
    if (!from || !to) return true;
    return tripD >= startOfLocalDay(from) && tripD <= endOfLocalDay(to);
  }
  return true;
}

function getDriverFallbackSeed(driverId: string): string {
  const value = (driverId ?? "").trim() || "driver";
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash + value.charCodeAt(i)) % 10;
  }
  return `driver-${hash + 1}`;
}

/**
 * First paint: the list DriverRow seed stashed by FinanceScreen before
 * navigating here, if any. `getDriverDetailBundle` remains the authoritative
 * hydration source — never written into any query cache.
 */
function peekDriverFirstPaint(driverId: string | null | undefined): DriverRow | null {
  if (!driverId) return null;
  return getInitialDriverForDetail(driverId);
}

export interface DriverDetailScreenProps {
  driverId: string;
  onBack: () => void;
  autoOpenProfile?: boolean;
  initialDetailTab?: "trips" | "ledger" | "statement" | "ranking" | "earnings";
}

export default function DriverDetailScreen({
  driverId,
  onBack,
  autoOpenProfile,
  initialDetailTab,
}: DriverDetailScreenProps) {
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const router = useRouter();
  const capabilities = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const canAddTransaction =
    canAccessFinance(capabilities) && canSurface("finance.add_transaction");
  const canInviteDriver = canSurface("fleet.drivers.invite");
  const canEditDriver = canSurface("fleet.drivers.edit");
  const canViewDriverAnalytics = canSurface("fleet.drivers.analytics");
  const [driver, setDriver] = useState<DriverRow | null>(() =>
    peekDriverFirstPaint(driverId),
  );
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(() => peekDriverFirstPaint(driverId) == null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteSalaryModalVisible, setInviteSalaryModalVisible] = useState(false);
  const [inviteSalaryModalMode, setInviteSalaryModalMode] =
    useState<DriverFleetInviteSalaryModalMode>("fleet_reinvite");
  const [dismissingMatch, setDismissingMatch] = useState(false);
  const [signupMatch, setSignupMatch] =
    useState<DriverSignupMatchStatus | null>(null);
  const [matchInviteStatus, setMatchInviteStatus] = useState<string | null>(
    null,
  );
  const [historicalInviteOffer, setHistoricalInviteOffer] = useState<{
    payableAmount: number | null;
    commissionPercent: number | null;
    commissionPerKm: number | null;
  } | null>(null);
  const [driverTenures, setDriverTenures] = useState<DriverTenureRow[]>([]);
  const [driverRatings, setDriverRatings] = useState<RatingRow[]>([]);
  const [driverRequests, setDriverRequests] = useState<SalaryRequestRow[]>([]);
  const [driverOffer, setDriverOffer] = useState<{
    payableAmount: number | null;
    commissionPercent: number | null;
    commissionPerKm: number | null;
  } | null>(null);
  const [driverLedgerEntries, setDriverLedgerEntries] = useState<
    DriverLedgerEntryForStatement[]
  >([]);
  const [driverTransactions, setDriverTransactions] = useState<LedgerRow[]>([]);
  const [driverDetailTab, setDriverDetailTab] = useState<
    "trips" | "ledger" | "statement" | "ranking" | "earnings"
  >(initialDetailTab ?? "trips");
  const [tripsDatePreset, setTripsDatePreset] =
    useState<FinancePeriodFilter>("RANGE");
  const [tripsCustomFrom, setTripsCustomFrom] = useState<string | null>(null);
  const [tripsCustomTo, setTripsCustomTo] = useState<string | null>(null);
  const [tripsDateRangeModalVisible, setTripsDateRangeModalVisible] =
    useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showEditLocalDriverModal, setShowEditLocalDriverModal] =
    useState(false);
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [driverReportKind, setDriverReportKind] = useState<"payable" | "ledger">(
    "payable",
  );
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const lastFocusRefreshRef = useRef<number>(0);
  /** Whether we currently have seed data to show while `load()` is in flight — first mount only, reset per `driverId`. */
  const hasSeedDataRef = useRef(peekDriverFirstPaint(driverId) != null);
  /** Guards a resolving `load()` from writing state after the user has already switched to a different driver. */
  const activeDriverIdRef = useRef(driverId);
  /** driverId of an in-flight `load()` call, or null — makes concurrent triggers (mount effect + focus effect) idempotent. */
  const loadInFlightRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && windowWidth >= 1024;
  const heroDecorProgress = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (autoOpenProfile) setShowProfileModal(true);
  }, [autoOpenProfile]);

  const driverMountRef = useRef(true);
  useEffect(() => {
    activeDriverIdRef.current = driverId;
    initialLoadDoneRef.current = false;
    setError(null);
    if (driverMountRef.current) {
      // Initial mount already seeded `driver`/`loading` via useState initializers above.
      driverMountRef.current = false;
      return;
    }
    // Switching to a different driver on an already-mounted screen instance:
    // reset first so stale Driver A data never shows under Driver B's id,
    // then seed from the registry if available.
    const seed = peekDriverFirstPaint(driverId);
    hasSeedDataRef.current = seed != null;
    setDriver(seed);
    setLoading(seed == null);
  }, [driverId]);

  const load = useCallback(() => {
    if (!driverId || !currentOrganization?.id) {
      setLoading(false);
      return;
    }
    // Idempotency guard: useFocusEffect and the org-readiness retry effect can
    // both invoke load() for the same driverId in the same tick.
    if (loadInFlightRef.current === driverId) return;
    loadInFlightRef.current = driverId;
    const requestDriverId = driverId;
    if (!isRefreshingRef.current && !initialLoadDoneRef.current && !hasSeedDataRef.current)
      setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;
    // Use TanStack Query cache from Trips tab (get_trips_for_org includes cross-org supplier trips).
    // `ensureQueryData` (not a plain getQueryData-then-fallback-fetch) so a
    // cold cache is a single, request-deduplicated fetch shared with any
    // other concurrent consumer of the same queryKey — a plain fallback
    // fetch here would race a concurrently-mounting list/warmup hook and
    // double the RPC (identified as a contributor to the 2026-09-16 DB incident).
    const tripsPromise = queryClient
      .ensureQueryData({
        queryKey: queryKeys.trips.finite(orgId),
        queryFn: async () => {
          const res = await getTripsForOrg(orgId);
          if (res.error) throw res.error;
          return res.trips ?? [];
        },
      })
      .then((trips) => ({ error: null, trips }))
      .catch((error: unknown) => ({ error: error instanceof Error ? error : new Error(String(error)), trips: [] as TripRow[] }));
    // FinanceScreen already warms driver offers under the same query key for
    // the whole Finance tab (useFinanceEntities) — reuse it.
    const offersPromise = queryClient
      .ensureQueryData({
        queryKey: queryKeys.driverOffers(orgId),
        queryFn: async () => {
          const res = await getDriverOffersByOrganization(orgId);
          if (res.error) throw res.error;
          return res.offersByDriverId ?? {};
        },
      })
      .then((offersByDriverId) => ({ error: null, offersByDriverId }))
      .catch((error: unknown) => ({ error: error instanceof Error ? error : new Error(String(error)), offersByDriverId: {} as Record<string, { payableAmount: number | null; commissionPercent: number | null; commissionPerKm: number | null }> }));

    Promise.all([
      // Bundle: driver row + ratings + salary requests + ledger + transactions in 1 RPC
      getDriverDetailBundle(orgId, driverId),
      tripsPromise,
      offersPromise,
      getDriverSignupMatchStatus(driverId),
      // Tenure history: connect/disconnect periods
      getDriverTenures(orgId, driverId),
    ])
      .then(
        ([
          bundleRes,
          tripsRes,
          offersRes,
          signupMatchRes,
          tenuresRes,
        ]) => {
          // The user navigated to a different driver while this was in
          // flight — a newer load() for the new driverId owns state now.
          if (activeDriverIdRef.current !== requestDriverId) return;
          const driverRow = bundleRes.error ? null : (bundleRes.driver ?? null);
          if (bundleRes.error) {
            setError(bundleRes.error.message);
            setDriver(null);
          } else {
            setDriver(driverRow);
          }
          // get_trips_for_org already merges owner + supplier trips
          const allTrips = tripsRes.error ? [] : (tripsRes.trips ?? []);
          const driver = driverRow;
          const txs = (bundleRes.transactions ?? []) as LedgerRow[];
          const tripIdsFromDriverTx = new Set(
            txs
              .filter(
                (tx) =>
                  tx.contact_type === "driver" &&
                  tx.contact_id != null &&
                  String(tx.contact_id).trim() === String(driverId).trim() &&
                  tx.trip_id != null,
              )
              .map((tx) => String(tx.trip_id).trim().toLowerCase()),
          );
          const tripMatchesDriver = (t: TripRow) => {
            if (t.driver_id === driverId) return true;
            if (tripIdsFromDriverTx.has(String(t.id).trim().toLowerCase()))
              return true;
            if (!driver) return false;
            const displayName = (t.driver_display_name ?? "").trim();
            if (!displayName) return false;
            const nameMatch =
              (driver.name ?? "").trim().toLowerCase() ===
              displayName.toLowerCase();
            const phoneNorm = (p: string) =>
              (p ?? "").replace(/\s/g, "").replace(/\D/g, "");
            const phoneMatch =
              (driver.phone ?? "").trim() !== "" &&
              phoneNorm(displayName).length >= 10 &&
              phoneNorm(driver.phone ?? "") === phoneNorm(displayName);
            return nameMatch || phoneMatch;
          };
          setTrips(allTrips.filter(tripMatchesDriver));
          setDriverTenures(tenuresRes.tenures ?? []);
          setDriverRatings(bundleRes.ratings ?? []);
          setDriverRequests(
            (bundleRes.salaryRequests as SalaryRequestRow[]).filter((r) => r.status === "pending"),
          );
          const offers = offersRes.error
            ? {}
            : (offersRes.offersByDriverId ?? {});
          const offer = offers[driverId];
          setDriverOffer(
            offer
              ? {
                  payableAmount: offer.payableAmount ?? null,
                  commissionPercent: offer.commissionPercent ?? null,
                  commissionPerKm: offer.commissionPerKm ?? null,
                }
              : null,
          );
          setDriverLedgerEntries(
            bundleRes.error
              ? []
              : (bundleRes.ledger ?? []).map((e) => ({
                  id: e.id,
                  driver_id: e.driver_id,
                  trip_id: e.trip_id,
                  type: e.type,
                  amount: e.amount,
                  created_at: e.created_at,
                  description: e.description ?? null,
                })),
          );
          setDriverTransactions(bundleRes.transactions ?? []);
          setSignupMatch(
            signupMatchRes.error ? null : (signupMatchRes.match ?? null),
          );
        },
      )
      .catch((err: unknown) => {
        if (activeDriverIdRef.current !== requestDriverId) return;
        setError(err instanceof Error ? err.message : "Failed to load driver data");
      })
      .finally(() => {
        if (loadInFlightRef.current === requestDriverId) loadInFlightRef.current = null;
        if (activeDriverIdRef.current !== requestDriverId) return;
        setLoading(false);
        initialLoadDoneRef.current = true;
        hasSeedDataRef.current = false;
        isRefreshingRef.current = false;
        setRefreshing(false);
        clearInitialDriverForDetail(requestDriverId);
      });
  }, [driverId, currentOrganization?.id, queryClient]);

  useFocusEffect(
    useCallback(() => {
      if (initialLoadDoneRef.current && Date.now() - lastFocusRefreshRef.current < 5 * 60_000) return;
      lastFocusRefreshRef.current = Date.now();
      load();
    }, [load]),
  );

  // On Netlify (cold load), org context may not be ready when useFocusEffect fires.
  // load() returns early without setting initialLoadDoneRef, so retry when org becomes available.
  useEffect(() => {
    if (!currentOrganization?.id || initialLoadDoneRef.current) return;
    load();
  }, [currentOrganization?.id, load]);

  useEffect(() => {
    const linkedUserId =
      signupMatch?.matched_user_id ?? driver?.user_id ?? null;
    if (!linkedUserId || !currentOrganization?.id) {
      setMatchInviteStatus(null);
      setHistoricalInviteOffer(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      getDriverInviteSentStatus(currentOrganization.id, linkedUserId),
      getLatestDriverInviteTermsByUser(
        currentOrganization.id,
        linkedUserId,
      ),
    ]).then(([statusRes, termsRes]) => {
      if (cancelled) return;
      setMatchInviteStatus(statusRes.status);
      setHistoricalInviteOffer(termsRes.offer);
    }).catch(() => {
      if (cancelled) return;
      setMatchInviteStatus(null);
      setHistoricalInviteOffer(null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    signupMatch?.matched_user_id,
    driver?.user_id,
    currentOrganization?.id,
  ]);

  const refreshInviteStatus = useCallback(async () => {
    const linkedUserId =
      signupMatch?.matched_user_id ?? driver?.user_id ?? null;
    if (!linkedUserId || !currentOrganization?.id) return;
    const [statusRes, termsRes] = await Promise.all([
      getDriverInviteSentStatus(currentOrganization.id, linkedUserId),
      getLatestDriverInviteTermsByUser(
        currentOrganization.id,
        linkedUserId,
      ),
    ]);
    setMatchInviteStatus(statusRes.status);
    setHistoricalInviteOffer(termsRes.offer);
  }, [
    signupMatch?.matched_user_id,
    driver?.user_id,
    currentOrganization?.id,
  ]);

  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!driver?.id) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }

      let avatarUrl = (driver.avatar_url ?? "").trim();
      let avatarSeed = (driver.avatar_seed ?? "").trim();

      if (!avatarUrl && !avatarSeed) {
        const { profile } = await getDriverProfileDisplay(driver.id);
        avatarUrl = (profile?.avatarUrl ?? "").trim();
        avatarSeed = (profile?.avatarSeed ?? "").trim();
      }

      if (!mounted) return;

      if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
        const ref = extractPathFromStorageUrl(avatarUrl);
        if (ref && (ref.bucket === AVATAR_BUCKET || ref.bucket === LEGACY_AVATAR_BUCKET)) {
          const signed = await getSignedAvatarUrl(ref.path);
          if (!mounted) return;
          if (signed) {
            setProfileAvatarUri(signed);
            return;
          }
        } else {
          if (mounted) setProfileAvatarUri(avatarUrl);
          return;
        }
      }

      if (avatarUrl) {
        const signed = await getSignedAvatarUrl(avatarUrl);
        if (!mounted) return;
        if (signed) {
          setProfileAvatarUri(signed);
          return;
        }
      }

      if (avatarSeed) {
        setProfileAvatarUri(getAvatarUriForSeed(avatarSeed));
        return;
      }

      // Match network page behavior: stable fallback based on driver id.
      setProfileAvatarUri(
        getAvatarUriForSeed(getDriverFallbackSeed(driver.id)),
      );
    };

    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [driver?.id, driver?.avatar_url, driver?.avatar_seed]);


  const _tripOptions = useMemo(
    () =>
      trips.map((t) => ({
        id: t.id,
        trip_number: getTripDisplayNumber(t),
        client_id: t.client_id ?? null,
        client_name: t.client_name ?? null,
        supplier_id: t.supplier_id ?? null,
        driver_id: t.driver_id ?? null,
        vehicle_id: t.vehicle_id ?? null,
        indent_id: t.indent_id ?? null,
        route_label:
          [t.pickup_area, t.drop_location].filter(Boolean).join(" → ") || null,
        trip_date: formatLedgerDate(t.pickup_date || t.created_at),
      })),
    [trips],
  );

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

  const assignedVehicleLabelForProfile = useMemo(() => {
    if (!trips.length) return null;
    const withVehicle = trips.filter(
      (t) =>
        t.vehicle_id != null ||
        ((t.vehicle_display_number ?? "").trim() !== ""),
    );
    if (withVehicle.length === 0) return null;
    const sorted = [...withVehicle].sort((a, b) => {
      const dateA = (a.pickup_date ?? a.created_at ?? "").toString();
      const dateB = (b.pickup_date ?? b.created_at ?? "").toString();
      return dateB.localeCompare(dateA);
    });
    const latest = sorted[0];
    const num = (latest?.vehicle_display_number ?? "").trim();
    return num ? formatIndianVehicleNumber(num) : null;
  }, [trips]);

  const driverRatingAvg = useMemo(
    () => averageScore(driverRatings),
    [driverRatings],
  );

  const driverTripsOperatedInAppCount = useMemo(() => {
    if (!driverId) return 0;
    const id = String(driverId).trim().toLowerCase();
    return trips.filter(
      (t) => String(t.driver_id ?? "").trim().toLowerCase() === id,
    ).length;
  }, [driverId, trips]);

  const entityPaid = useMemo(
    () =>
      driverTransactions.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0),
    [driverTransactions],
  );
  const entityPending = useMemo(
    () => driverRequests.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [driverRequests],
  );
  const totalDriverEarnings = useMemo(
    () => entityPaid + entityPending,
    [entityPaid, entityPending],
  );
  const settlementHealth = useMemo(
    () =>
      totalDriverEarnings > 0
        ? Math.round((entityPaid / totalDriverEarnings) * 100)
        : 0,
    [entityPaid, totalDriverEarnings],
  );

  const sortedDriverLedger = useMemo(
    () =>
      [...driverTransactions].sort((a, b) => {
        const da = a.transaction_date ?? a.created_at ?? "";
        const db = b.transaction_date ?? b.created_at ?? "";
        return db.localeCompare(da);
      }),
    [driverTransactions],
  );

  // Pending salary requests shown as list items in Cash Flow so header total == list total.
  const cashFlowRows = useMemo<LedgerRow[]>(() => {
    const pendingRows: LedgerRow[] = driverRequests.map((r) => ({
      id: r.id,
      organization_id: r.organization_id,
      trip_id: r.trip_ids?.[0] ?? null,
      party_name: driver?.name ?? "",
      description: `Pending salary request${r.note ? ` — ${r.note}` : ""}`,
      amount_in: 0,
      amount_out: Number(r.amount),
      transaction_date: r.created_at.slice(0, 10),
      created_at: r.created_at,
      contact_id: driverId,
      contact_type: "driver",
      primary_category: "Driver payment",
      payment_mode: null,
      payment_reference: null,
      // No cash has moved — this is a claim awaiting approval. Without this flag the
      // receipt modal reads amount_out > 0 and labels it "Payment sent", which made an
      // unpaid request look settled.
      is_pending_request: true,
    }));
    return [...pendingRows, ...sortedDriverLedger].sort((a, b) => {
      const da = a.transaction_date ?? a.created_at ?? "";
      const db = b.transaction_date ?? b.created_at ?? "";
      return db.localeCompare(da);
    });
  }, [driverRequests, sortedDriverLedger, driver, driverId]);

  const ledgerRows = useMemo(() => {
    const normId = (id: string | null | undefined) =>
      id == null ? "" : String(id).trim();
    const paidByTripId: Record<string, number> = {};
    for (const t of trips) paidByTripId[normId(t.id)] = 0;
    const txnCountByTripId: Record<string, number> = {};
    const lastTxnIsoByTripId: Record<string, string> = {};
    for (const tx of driverTransactions) {
      const txTripKey = normId(tx.trip_id);
      if (
        tx.contact_type === "driver" &&
        tx.contact_id != null &&
        normId(tx.contact_id) === normId(driverId) &&
        txTripKey !== "" &&
        txTripKey in paidByTripId
      ) {
        paidByTripId[txTripKey] =
          (paidByTripId[txTripKey] ?? 0) + Number(tx.amount_out ?? 0);
      }
      if (
        tx.contact_type === "driver" &&
        tx.contact_id != null &&
        normId(tx.contact_id) === normId(driverId) &&
        txTripKey !== ""
      ) {
        txnCountByTripId[txTripKey] = (txnCountByTripId[txTripKey] ?? 0) + 1;
        const d = (tx.transaction_date ?? tx.created_at ?? "").slice(0, 10);
        if (d.length === 10) {
          const prev = lastTxnIsoByTripId[txTripKey];
          if (!prev || d > prev) lastTxnIsoByTripId[txTripKey] = d;
        }
      }
    }
    const offer = driverOffer
      ? {
          payableAmount: driverOffer.payableAmount ?? null,
          commissionPercent: driverOffer.commissionPercent ?? null,
          commissionPerKm: driverOffer.commissionPerKm ?? null,
        }
      : null;
    const tripRows = trips.map((t) => {
      const tid = normId(t.id);
      const commission = computeDriverCommissionForTrip(
        {
          ...t,
          client_price: t.client_price ?? null,
          distance: t.distance ?? null,
        },
        offer ?? undefined,
      );
      const paid = paidByTripId[tid] ?? 0;
      const due = Math.max(0, commission - paid);
      const tripDateIso =
        (
          t.pickup_date ??
          t.created_at ??
          getLatestPaymentDateForTrip(t.id, driverTransactions) ??
          ""
        )
          .toString()
          .slice(0, 10) || null;
      const filterDateIso =
        (t.pickup_date ?? t.created_at ?? "").toString().slice(0, 10) ||
        undefined;
      const route =
        t.pickup_area?.trim() && t.drop_location?.trim()
          ? `${t.pickup_area.trim()} → ${t.drop_location.trim()}`
          : t.drop_location?.trim() || "—";
      const dateTimeIso = (t.pickup_date ?? t.created_at ?? "").toString();
      /** Show assigned vehicle for asset-based (own fleet) or when vehicle is assigned. */
      const isAssetOrAssignedVehicle =
        !t.supplier_id ||
        t.vehicle_id != null ||
        (t.vehicle_display_number ?? "").trim() !== "";
      const vehicleNum = (t.vehicle_display_number ?? "").trim();
      const vehicleDisplay =
        isAssetOrAssignedVehicle && vehicleNum
          ? formatIndianVehicleNumber(vehicleNum)
          : null;
      const ledgerLast = lastTxnIsoByTripId[tid];
      const paymentLast = getLatestPaymentDateForTrip(t.id, driverTransactions);
      const lastIso =
        ledgerLast && paymentLast
          ? ledgerLast > paymentLast
            ? ledgerLast
            : paymentLast
          : (ledgerLast ?? paymentLast ?? null);
      return {
        id: t.id,
        missionId: getTripDisplayNumber(t),
        dest: route,
        vehicleDisplay: vehicleDisplay ?? undefined,
        col1: commission,
        col2: paid,
        col3: due,
        tripDate: tripDateIso ? formatLedgerDateShort(tripDateIso) : "—",
        tripDateIso: dateTimeIso || undefined,
        agingLabel: getAgingLabel(tripDateIso, due),
        filterDateIso,
        clientName: (t.client_name ?? "").trim() || "—",
        clientInitials: getClientInitials(t.client_name),
        clientRev: Number(t.client_price ?? 0),
        margin: Number(t.margin ?? 0),
        txnCount: txnCountByTripId[tid] ?? 0,
        lastTxnShort: formatDayMonUpper(lastIso),
        commissionBasis: getCommissionBasis(t, offer),
      };
    });
    return tripRows;
  }, [trips, driverTransactions, driverId, driverOffer]);

  const filteredLedgerRows = useMemo(
    () =>
      ledgerRows.filter((r) =>
        tripMatchesDatePreset(
          r.filterDateIso,
          tripsDatePreset,
          tripsCustomFrom,
          tripsCustomTo,
        ),
      ),
    [ledgerRows, tripsDatePreset, tripsCustomFrom, tripsCustomTo],
  );

  const tripsScorecard = useMemo(() => {
    const contractValue = filteredLedgerRows.reduce(
      (s, r) => s + Number(r.col1 ?? 0),
      0,
    );
    const paidSum = filteredLedgerRows.reduce(
      (s, r) => s + Number(r.col2 ?? 0),
      0,
    );
    const dueSum = filteredLedgerRows.reduce(
      (s, r) => s + Number(r.col3 ?? 0),
      0,
    );
    const health =
      contractValue > 0
        ? Math.min(100, Math.round((paidSum / contractValue) * 100))
        : 0;
    return { contractValue, paidSum, dueSum, health };
  }, [filteredLedgerRows]);

  const driverPayableReport = useMemo(() => {
    const rows = filteredLedgerRows.map((r) => ({
      trip: r.missionId ?? "—",
      tripDate: r.tripDateIso ? formatTripTableDate(r.tripDateIso) : undefined,
      route: r.dest?.trim() || "—",
      client: (r.clientName ?? "—").toUpperCase(),
      contract: formatReportInr(Number(r.col1 ?? 0)),
      paid: formatReportInr(Number(r.col2 ?? 0)),
      due: formatReportInr(Number(r.col3 ?? 0)),
      settlement: formatSettlementPct(Number(r.col2 ?? 0), Number(r.col1 ?? 0)),
      commissionBasis: r.commissionBasis ?? "—",
      txns: r.txnCount ?? 0,
      lastTxn: r.lastTxnShort ?? "—",
    }));
    return buildDriverPayableReport(rows);
  }, [filteredLedgerRows]);

  const openDriverReport = useCallback(
    (kind: "payable" | "ledger") => {
      if (!canSurface("finance.reports")) return;
      setDriverReportKind(kind);
      setShowReportModal(true);
    },
    [canSurface],
  );

  const handleDriverDownloadPress = useCallback(() => {
    if (driverDetailTab === "trips") {
      pickEntityReport(
        "Driver report",
        [
          { id: "payable", label: "Payable & performance" },
          { id: "ledger", label: "Ledger transactions" },
        ],
        (id) => openDriverReport(id === "ledger" ? "ledger" : "payable"),
      );
      return;
    }
    openDriverReport("ledger");
  }, [driverDetailTab, openDriverReport]);

  /** Trip details map for Cash Flow list. */
  const driverTripDetailsMap = useMemo(() => {
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

  const monthlyStatement = useMemo(() => {
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
      driverId,
      tripsForStatement,
      driverLedgerEntries,
      offer,
      { maxMonths: 12 },
    );
  }, [driverId, trips, driverLedgerEntries, driverOffer]);

  const monthlyRowsReversed = useMemo(
    () =>
      monthlyStatement?.rows != null
        ? [...monthlyStatement.rows].reverse()
        : [],
    [monthlyStatement],
  );
  const [expandedStatementMonthKey, setExpandedStatementMonthKey] = useState<
    string | null
  >(monthlyRowsReversed.length > 0 ? monthlyRowsReversed[0].monthKey : null);
  const primaryStatementRow =
    expandedStatementMonthKey && monthlyStatement
      ? (monthlyStatement.rows.find(
          (r) => r.monthKey === expandedStatementMonthKey,
        ) ?? null)
      : null;
  const primaryStatementDetail =
    primaryStatementRow && monthlyStatement
      ? monthlyStatement.detailsByMonth[primaryStatementRow.monthKey]
      : null;
  const lockedPartyName = (driver?.name || t("driver")).trim() || t("driver");
  const handleInviteToApp = useCallback(() => {
    const message = `Join me on Pulse to sync trips and payouts with ${lockedPartyName}. Download Pulse to get started.`;
    Share.share({ message, title: "Invite to Pulse" }).catch(() => {});
  }, [lockedPartyName]);

  if (loading) {
    return <CenteredLoadingView message={t("loadingDriver")} />;
  }

  if (error || !driver) {
    return (
      <DetailPageLayout title={t("driver")} onBack={onBack}>
        <Text style={styles.errorText}>{error || t("driverNotFound")}</Text>
      </DetailPageLayout>
    );
  }

  const leftAtFormatted =
    driver.left_at != null && driver.left_at !== ""
      ? (() => {
          try {
            const date = new Date(driver.left_at);
            return isNaN(date.getTime())
              ? driver.left_at
              : date.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
          } catch {
            return driver.left_at;
          }
        })()
      : null;

  const canLink =
    !driver.user_id &&
    (driver.phone?.trim() || driver.email?.trim()) &&
    leftAtFormatted == null;
  const normalizedMatchInviteStatus = (matchInviteStatus ?? "").toLowerCase();
  const rejectedInviteForMatch = normalizedMatchInviteStatus === "rejected";
  const pendingFleetInvite = normalizedMatchInviteStatus === "pending";
  const isDisconnected = leftAtFormatted != null;
  const isActivelyLinked = Boolean(driver.user_id) && !isDisconnected;
  const canSendFleetReinvite =
    isDisconnected &&
    Boolean(driver.user_id) &&
    Boolean(driver.phone?.trim()) &&
    !pendingFleetInvite &&
    (normalizedMatchInviteStatus === "" ||
      normalizedMatchInviteStatus === "accepted" ||
      rejectedInviteForMatch ||
      normalizedMatchInviteStatus === "declined");
  const canSendMatchedInvite =
    canLink &&
    (signupMatch?.state === "pending_owner_action" ||
      signupMatch?.state === "declined" ||
      signupMatch?.state === "ignored" ||
      signupMatch?.state === "expired" ||
      (signupMatch?.state === "invite_sent" && rejectedInviteForMatch));
  const inviteAlreadySentForMatch =
    canLink && signupMatch?.state === "invite_sent" && !rejectedInviteForMatch;
  const resetInvitationText =
    t("resetInvitation") === "resetInvitation"
      ? "Reset invitation"
      : t("resetInvitation");

  const handleLinkToAccount = () => {
    if (!driver.phone?.trim() && !driver.email?.trim()) return;
    Alert.alert(t("linkToAppAccount"), t("linkToAppAccountMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("link"),
        onPress: async () => {
          setLinking(true);
          const { error: linkError, driver: updated } =
            await attachDriverByContact(driver.id, {
              phone: driver.phone?.trim() || null,
              email: driver.email?.trim() || null,
            });
          setLinking(false);
          if (linkError) {
            Alert.alert(t("linkFailed"), linkError.message);
            return;
          }
          if (updated) setDriver(updated);
        },
      },
    ]);
  };

  const driverIsLocal = isLocalDriverRow(driver);
  const driverHasLeft = Boolean(driver.left_at);

  const handleEditLocalDriverSave = async (patch: UpdateDriverData) => {
    if (!currentOrganization?.id || !driver) return;
    const { error: updateError, driver: updated } = await updateDriver(
      currentOrganization.id,
      driver.id,
      patch,
    );
    if (updateError) throw updateError;
    if (updated) setDriver(updated);
  };

  const handleProfileEditPress = () => {
    if (!canEditDriver) return;
    if (driverIsLocal) {
      setShowEditLocalDriverModal(true);
      return;
    }
    Alert.alert(
      "Managed by driver app",
      "Name, email, and phone sync from this driver’s app profile and cannot be edited here. You can still manage compensation from fleet invite flows.",
    );
  };

  const handleSendMatchedInvite = () => {
    setInviteSalaryModalMode("signup_match");
    setInviteSalaryModalVisible(true);
  };

  const handleSendFleetReinvite = () => {
    if (!currentOrganization?.id || !driver.phone?.trim()) return;
    setInviteSalaryModalMode("fleet_reinvite");
    setInviteSalaryModalVisible(true);
  };

  const suggestedInviteCompensation = suggestDriverInviteCompensation(
    driver,
    driverOffer,
    historicalInviteOffer,
  );

  const persistDriverCompensation = async (
    compensation: DriverInviteCompensation,
  ) => {
    if (!currentOrganization?.id || !driver) return;
    const normalized = normalizeDriverInviteCompensation(compensation);
    await updateDriver(currentOrganization.id, driver.id, {
      payable_amount: normalized.payableAmount,
      commission_percent: normalized.commissionPercent,
      commission_per_km: normalized.commissionPerKm,
    });
  };

  const handleSubmitInviteWithCompensation = async (
    compensation: DriverInviteCompensation,
  ) => {
    if (!currentOrganization?.id) return;
    // Editing terms only writes to the driver row; a phone is needed to invite.
    if (inviteSalaryModalMode !== "edit_terms" && !driver?.phone?.trim()) return;
    const normalized = normalizeDriverInviteCompensation(compensation);

    setInviting(true);
    try {
      await persistDriverCompensation(normalized);

      // Editing terms on a connected driver — persist only, no invite.
      if (inviteSalaryModalMode === "edit_terms") {
        // Reflect the saved terms immediately; both the row and the offer feed
        // the Compensation Terms block.
        setDriver((prev) =>
          prev
            ? {
                ...prev,
                payable_amount: normalized.payableAmount,
                commission_percent: normalized.commissionPercent,
                commission_per_km: normalized.commissionPerKm,
              }
            : prev,
        );
        setDriverOffer({
          payableAmount: normalized.payableAmount,
          commissionPercent: normalized.commissionPercent,
          commissionPerKm: normalized.commissionPerKm,
        });
        setInviteSalaryModalVisible(false);
        return;
      }

      if (inviteSalaryModalMode === "fleet_reinvite") {
        const { error, inviteSent, inviteAlreadyExists, inviteStatus } =
          await inviteDriver(
            currentOrganization.id,
            {
              name: (driver.name ?? "").trim() || "Driver",
              phone: driver.phone ?? "",
              email: driver.email?.trim() || null,
              payableAmount: normalized.payableAmount,
              commissionPercent: normalized.commissionPercent,
              commissionPerKm: normalized.commissionPerKm,
            },
            currentOrganization.name ?? undefined,
            {
              requireCompensation: true,
              knownToUserId: driver.user_id,
            },
          );
        if (error) {
          Alert.alert(t("linkFailed"), error.message);
          return;
        }
        if (!inviteSent && !inviteAlreadyExists) {
          Alert.alert(
            t("linkFailed"),
            "Invitation could not be delivered to the driver app. Confirm the driver is signed in on Pulse and try again.",
          );
          return;
        }
        const sentOrPending =
          inviteSent ||
          inviteAlreadyExists ||
          (inviteStatus ?? "").toLowerCase() === "pending";
        if (sentOrPending) {
          setMatchInviteStatus("pending");
          setHistoricalInviteOffer({
            payableAmount: normalized.payableAmount,
            commissionPercent: normalized.commissionPercent,
            commissionPerKm: normalized.commissionPerKm,
          });
        }
        if (inviteAlreadyExists && !inviteSent) {
          Alert.alert(
            "Invitation pending",
            `An invitation is already ${(inviteStatus ?? "pending").toUpperCase()} for this driver.`,
          );
        } else if (inviteSent) {
          Alert.alert(
            t("invitationSentTitle"),
            "The driver will see this invite in the Pulse app with the pay terms you entered.",
          );
        }
        setInviteSalaryModalVisible(false);
        await refreshInviteStatus();
        load();
        return;
      }

      let {
        error: inviteError,
        status,
        already_exists,
      } = await sendDriverSignupMatchInvite(driver.id, {
        payableAmount: normalized.payableAmount,
        commissionPercent: normalized.commissionPercent,
        commissionPerKm: normalized.commissionPerKm,
      });
      if (inviteError) {
        Alert.alert(t("linkFailed"), inviteError.message);
        return;
      }
      const normalizedStatus = (status ?? "").toLowerCase();
      if (already_exists && normalizedStatus === "rejected") {
        const { error: resetErr } = await resetDriverSignupInvite(driver.id);
        if (resetErr) {
          Alert.alert(
            t("invitationAlreadySentTitle") === "invitationAlreadySentTitle"
              ? "Invitation update needed"
              : t("invitationAlreadySentTitle"),
            t("invitationRejectedNeedsResetBody") ===
              "invitationRejectedNeedsResetBody"
              ? "Driver rejected the previous invitation. Please try again in a moment."
              : t("invitationRejectedNeedsResetBody"),
          );
          load();
          return;
        }
        ({
          error: inviteError,
          status,
          already_exists,
        } = await sendDriverSignupMatchInvite(driver.id, {
          payableAmount: normalized.payableAmount,
          commissionPercent: normalized.commissionPercent,
          commissionPerKm: normalized.commissionPerKm,
        }));
        if (inviteError) {
          Alert.alert(t("linkFailed"), inviteError.message);
          load();
          return;
        }
      }
      const finalStatus = (status ?? "pending").toLowerCase();
      if (finalStatus === "pending" || finalStatus === "invite_sent") {
        setMatchInviteStatus("pending");
        setHistoricalInviteOffer({
          payableAmount: normalized.payableAmount,
          commissionPercent: normalized.commissionPercent,
          commissionPerKm: normalized.commissionPerKm,
        });
        setSignupMatch((prev) =>
          prev
            ? { ...prev, state: "invite_sent" as const }
            : prev,
        );
      }
      Alert.alert(
        t("invitationSentTitle"),
        "The driver will see this invite in the Pulse app with the pay terms you entered.",
      );
      setInviteSalaryModalVisible(false);
      await refreshInviteStatus();
      load();
    } finally {
      setInviting(false);
    }
  };

  const handleResetInvitation = async () => {
    setDismissingMatch(true);
    const { error: resetErr } = await resetDriverSignupInvite(driver.id);
    setDismissingMatch(false);
    if (resetErr) {
      Alert.alert(t("linkFailed"), resetErr.message);
      return;
    }
    Alert.alert(
      t("invitationResetTitle") === "invitationResetTitle"
        ? "Invitation reset"
        : t("invitationResetTitle"),
      t("invitationResetBody") === "invitationResetBody"
        ? "Invitation has been reset. You can send a new invitation now."
        : t("invitationResetBody"),
    );
    load();
  };

  const tripsHandled = filteredLedgerRows.length;
  const isIntegrated = isActivelyLinked;
  const isInAppNotIntegrated =
    !isIntegrated &&
    (signupMatch != null || canSendMatchedInvite || inviteAlreadySentForMatch);
  const isNotInApp = !isIntegrated && !isInAppNotIntegrated && !isDisconnected;
  const statusTitle = isIntegrated
    ? "Integrated"
    : pendingFleetInvite
      ? "Invite pending"
      : isDisconnected
        ? "Disconnected"
        : isInAppNotIntegrated
          ? "In App - Not Integrated"
          : "Not in app";
  const ratingValue =
    driverRatingAvg && driverRatingAvg > 0 ? driverRatingAvg : 0;
  const ratingFilledStars = Math.max(0, Math.min(5, Math.round(ratingValue)));
  const profileActionLabel = canSendMatchedInvite
    ? "Send invitation"
    : canSendFleetReinvite
      ? "Reconnect driver"
      : pendingFleetInvite
        ? "Invitation pending"
        : inviteAlreadySentForMatch
          ? "Invitation sent"
          : isNotInApp
            ? "Invite to app"
            : isIntegrated
              ? "Integrated"
              : isDisconnected
                ? "Disconnected"
                : "Integrated";
  const profileActionEnabled =
    canInviteDriver &&
    (canSendMatchedInvite || canSendFleetReinvite || isNotInApp);
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
    <DetailPageLayout
      title={driver.name ?? t("driver")}
      titleSubline={
        <View style={styles.headerTitleSubwrap}>
          <Text style={styles.entityHeaderSubtitle}>DEEP ENTITY INTEL</Text>
        </View>
      }
      onBack={onBack}
      rightAction={
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.profileBtnHeader}
            onPress={() => router.push(ROUTES.driverAnalytics(driverId) as never)}
            activeOpacity={0.8}
            accessibilityLabel="Open driver analytics"
            accessibilityRole="button"
          >
            <FontAwesome
              name="line-chart"
              size={17}
              color={Theme.textPrimaryDark}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.downloadHeaderBtn}
            onPress={handleDriverDownloadPress}
            activeOpacity={0.8}
            accessibilityLabel={t("ledgerReport")}
          >
            <FontAwesome
              name="cloud-download"
              size={18}
              color={entityDetailDownloadIconColor}
            />
          </TouchableOpacity>
        </View>
      }
      fab={
        canAddTransaction ? (
          <View
            style={[
              styles.fabWrap,
              { bottom: Layout.fabBottomOffset + insets.bottom },
            ]}
          >
            <FinanceFAB
              onPress={() => {
                const params = new URLSearchParams();
                params.set("entityType", "DRIVER");
                params.set("entityId", driverId);
                params.set("partyName", lockedPartyName);
                if (entityPending > 0) {
                  params.set("dueAmountOut", String(entityPending));
                }
                router.push(
                  `/(modals)/ledger-sync?${params.toString()}` as const,
                );
              }}
              accessibilityLabel={t("addTransaction")}
              icon="receipt-text"
            />
          </View>
        ) : undefined
      }
      onRefresh={() => {
        isRefreshingRef.current = true;
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
    >
      {leftAtFormatted != null && (
        <View
          style={[
            styles.disconnectedBanner,
            pendingFleetInvite && styles.disconnectedBannerPending,
          ]}
        >
          <FontAwesome
            name={pendingFleetInvite ? 'paper-plane' : 'unlink'}
            size={12}
            color={pendingFleetInvite ? Theme.primary : Theme.negative}
            style={styles.disconnectedBannerIcon}
          />
          <Text
            style={[
              styles.disconnectedBannerText,
              pendingFleetInvite && styles.disconnectedBannerTextPending,
            ]}
          >
            {pendingFleetInvite
              ? `Invitation sent · Waiting for ${(driver.name ?? 'driver').trim() || 'driver'} to accept in the Pulse app`
              : `Disconnected from fleet · Left on ${leftAtFormatted}`}
          </Text>
        </View>
      )}

      <View style={isWebDesktop ? styles.heroCardsRow : undefined}>
        <LinearGradient
          colors={[Theme.financeCardGreenFrom, Theme.financeCardGreenTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.scorecard,
            isWebDesktop && styles.scorecardWebDesktop,
            isWebDesktop && styles.scorecardHeroPane,
          ]}
        >
          {isWebDesktop ? (
            <Animated.View
              style={[styles.scorecardDecorIconWrap, heroDecorAnimatedStyle]}
            >
              <FontAwesome
                name="user"
                size={120}
                color={Theme.textOnDark}
                style={styles.scorecardDecorIcon}
              />
            </Animated.View>
          ) : null}
          <View
            style={[
              styles.scorecardTop,
              isWebDesktop && styles.scorecardTopWebDesktop,
            ]}
          >
            <View style={styles.scorecardLeft}>
              <Text style={styles.scorecardLabel}>FINANCIAL OVERVIEW</Text>
              {driverDetailTab === "trips" ? (
                <>
                  <Text style={styles.scorecardSalesLabel}>
                    {t("driverScorecardContractValue")}
                  </Text>
                  <Text
                    style={[
                      styles.scorecardAmount,
                      isWebDesktop && styles.scorecardAmountWebDesktop,
                    ]}
                  >
                    {formatINR(tripsScorecard.contractValue)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.scorecardSalesLabel}>
                    DRIVER PAYMENTS
                  </Text>
                  <Text
                    style={[
                      styles.scorecardAmount,
                      isWebDesktop && styles.scorecardAmountWebDesktop,
                    ]}
                  >
                    {formatINR(totalDriverEarnings)}
                  </Text>
                </>
              )}
            </View>
          </View>
          <View
            style={[
              styles.scorecardGrid,
              isWebDesktop && styles.scorecardGridWebDesktop,
            ]}
          >
            <View style={isWebDesktop ? styles.scorecardGridStat : undefined}>
              <Text style={styles.scorecardGridLabelPaid}>PAID</Text>
              <Text
                style={[
                  styles.scorecardGridPaid,
                  isWebDesktop && styles.scorecardGridPaidWebDesktop,
                ]}
              >
                {formatINR(
                  driverDetailTab === "trips"
                    ? tripsScorecard.paidSum
                    : entityPaid,
                )}
              </Text>
            </View>
            <View
              style={[
                styles.scorecardGridRight,
                isWebDesktop && styles.scorecardGridStat,
              ]}
            >
              <Text style={styles.scorecardGridLabelDue}>
                {driverDetailTab === "trips" ? t("due") : t("toPay")}
              </Text>
              <Text
                style={[
                  styles.scorecardGridDue,
                  isWebDesktop && styles.scorecardGridDueWebDesktop,
                ]}
              >
                {formatINR(
                  driverDetailTab === "trips"
                    ? tripsScorecard.dueSum
                    : entityPending,
                )}
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
                        key={`driver-star-header-${idx}`}
                        name={idx < ratingFilledStars ? "star" : "star-o"}
                        size={13}
                        color={
                          idx < ratingFilledStars ? "#fbbf24" : Theme.borderMedium
                        }
                      />
                    ))}
                  </View>
                  <View style={styles.profilePreviewRatingBadge}>
                    <Text style={styles.profilePreviewRatingBadgeText} numberOfLines={1}>
                      {ratingValue.toFixed(1)}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={styles.profilePreviewTopAction}
                onPress={() => setShowProfileModal(true)}
                activeOpacity={0.85}
                accessibilityLabel="Open driver full profile"
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
              accessibilityLabel="Open driver full profile"
            >
              <View style={ecc.dossierAvatarWrap}>
                {profileAvatarUri ? (
                  <Image
                    source={{ uri: profileAvatarUri }}
                    style={ecc.dossierAvatarImage}
                  />
                ) : (
                  <FontAwesome
                    name="user"
                    size={24}
                    color={Theme.textOnPrimary}
                  />
                )}
                <View style={ecc.dossierAvatarBadge}>
                  <FontAwesome name="road" size={10} color={Theme.textOnPrimary} />
                </View>
              </View>
              <Text style={ecc.dossierName} numberOfLines={1}>
                {(driver.name ?? "Driver").trim() || "Driver"}
              </Text>
              <Text style={ecc.dossierSub} numberOfLines={1}>
                {(driver.phone ?? driver.email ?? "No contact").trim() || "No contact"}
              </Text>
              <View style={ecc.dossierBadgeRow}>
                <View style={[ecc.dossierBadge, ecc.dossierBadgeBlue]}>
                  <Text style={ecc.dossierBadgeText}>DRIVER</Text>
                </View>
                <View style={[ecc.dossierBadge, ecc.dossierBadgeDark]}>
                  <Text style={[ecc.dossierBadgeText, ecc.dossierBadgeTextDark]}>
                    {statusTitle}
                  </Text>
                </View>
                <View style={[ecc.dossierBadge, ecc.dossierBadgeMuted]}>
                  <Text style={[ecc.dossierBadgeText, ecc.dossierBadgeTextMuted]}>
                    {isActivelyLinked ? "LINKED" : isDisconnected ? "LEFT" : "LOCAL"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
            <View style={ecc.dossierContactStack}>
              <View style={ecc.dossierContactRow}>
                <View style={ecc.dossierContactIcon}>
                  <FontAwesome name="envelope-o" size={13} color={Theme.textMuted} />
                </View>
                <View style={ecc.dossierContactText}>
                  <Text style={ecc.dossierContactLabel}>Encrypted Mail</Text>
                  <Text style={ecc.dossierContactValue} numberOfLines={1}>
                    {(driver.email ?? "").trim() || "Not available"}
                  </Text>
                </View>
                <FontAwesome name="lock" size={10} color={Theme.textSection} />
              </View>
              <View style={ecc.dossierContactRow}>
                <View style={ecc.dossierContactIcon}>
                  <FontAwesome name="phone" size={13} color={Theme.textMuted} />
                </View>
                <View style={ecc.dossierContactText}>
                  <Text style={ecc.dossierContactLabel}>Secured Line</Text>
                  <Text style={ecc.dossierContactValue} numberOfLines={1}>
                    {(driver.phone ?? "").trim() || "Not available"}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.profilePreviewActionBtn,
                ecc.actionBtnPrimary,
                !profileActionEnabled && ecc.actionBtnDisabled,
              ]}
              onPress={() => {
                if (canSendMatchedInvite) {
                  void handleSendMatchedInvite();
                } else if (canSendFleetReinvite) {
                  void handleSendFleetReinvite();
                } else if (isNotInApp) {
                  handleInviteToApp();
                }
              }}
              activeOpacity={0.86}
              disabled={
                inviting || !profileActionEnabled
              }
            >
              <FontAwesome
                name={
                  canSendMatchedInvite || canSendFleetReinvite
                    ? "send"
                    : "envelope-o"
                }
                size={14}
                color={Theme.textOnPrimary}
              />
              <Text style={styles.profilePreviewActionText}>
                {inviting && (canSendMatchedInvite || canSendFleetReinvite)
                  ? "Sending..."
                  : profileActionLabel}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <TenureHistorySection tenures={driverTenures} driverName={driver.name ?? ''} />

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[
            styles.tabItem,
            driverDetailTab === "trips" && styles.tabItemActive,
          ]}
          onPress={() => setDriverDetailTab("trips")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabItemText,
              driverDetailTab === "trips" && styles.tabItemTextActive,
            ]}
          >
            {t("driverDetailTabTripsTitle")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabItem,
            driverDetailTab === "ledger" && styles.tabItemActive,
          ]}
          onPress={() => setDriverDetailTab("ledger")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabItemText,
              driverDetailTab === "ledger" && styles.tabItemTextActive,
            ]}
          >
            {t("driverDetailTabCashFlow")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabItem,
            driverDetailTab === "statement" && styles.tabItemActive,
          ]}
          onPress={() => setDriverDetailTab("statement")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabItemText,
              driverDetailTab === "statement" && styles.tabItemTextActive,
            ]}
          >
            {t("statement")}
          </Text>
        </TouchableOpacity>
        {canViewDriverAnalytics ? (
          <>
            <TouchableOpacity
              style={[
                styles.tabItem,
                driverDetailTab === "ranking" && styles.tabItemActive,
              ]}
              onPress={() => setDriverDetailTab("ranking")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabItemText,
                  driverDetailTab === "ranking" && styles.tabItemTextActive,
                ]}
              >
                Fleet Ranking
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabItem,
                driverDetailTab === "earnings" && styles.tabItemActive,
              ]}
              onPress={() => setDriverDetailTab("earnings")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabItemText,
                  driverDetailTab === "earnings" && styles.tabItemTextActive,
                ]}
              >
                Earnings
              </Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      {driverDetailTab === "trips" ? (
        <EntityIntelWidgetRow
          widgets={[
            {
              id: "payable",
              label: "Payable due",
              value: formatINR(tripsScorecard.dueSum),
              tone: tripsScorecard.dueSum > 0 ? "warn" : "good",
              hint: "Export payable report",
              onPress: () => openDriverReport("payable"),
            },
            {
              id: "settlement",
              label: "Trip settlement",
              value: `${tripsScorecard.health}%`,
              tone:
                tripsScorecard.health >= 80
                  ? "good"
                  : tripsScorecard.health >= 50
                    ? "warn"
                    : "bad",
              hint: "Contract vs paid",
            },
            {
              id: "performance",
              label: "Fleet payments",
              value: `${settlementHealth}%`,
              hint: `${tripsHandled} trips in view`,
            },
          ]}
        />
      ) : null}

      <Modal
        visible={showProfileModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <DriverPartnerProfileDashboard
          onClose={() => setShowProfileModal(false)}
          onEditPress={canEditDriver ? handleProfileEditPress : undefined}
          editProfileLabel={
            driverIsLocal
              ? "Edit Profile"
              : driverHasLeft
                ? "Edit Profile"
                : "View identity"
          }
          hideEditProfile={driverHasLeft}
          driver={driver}
          profileAvatarUri={profileAvatarUri}
          businessVolumeLabel={formatINR(totalDriverEarnings)}
          driverRatingAvg={driverRatingAvg}
          tripsOperatedCount={driverTripsOperatedInAppCount}
          settlementHealthPct={settlementHealth}
          driverRatings={driverRatings}
          tripRouteLabelByTripId={tripRouteLabelByTripId}
          assignedVehicleLabel={assignedVehicleLabelForProfile}
          driverOffer={driverOffer}
          /**
           * Always shown. Hiding it when terms are absent is exactly the case
           * that needs surfacing — that driver's trips are being priced by a
           * silent 10% guess.
           */
          showCompensationBlock
          onEditCompensationPress={
            canEditDriver && !driverHasLeft
              ? () => {
                  setInviteSalaryModalMode("edit_terms");
                  setInviteSalaryModalVisible(true);
                }
              : undefined
          }
          leftAtFormatted={leftAtFormatted}
        >
          {driverRequests.length > 0 ? (
            <View style={styles.profileInfoCallout}>
              <FontAwesome
                name="bell"
                size={14}
                color={Theme.textSecondary}
                style={styles.profileInfoCalloutIcon}
              />
              <Text style={styles.profileInfoCalloutText}>
                Pending salary requests are now handled in Notifications.
              </Text>
            </View>
          ) : null}

          {canLink ? (
            <DetailSection title={t("account")}>
              <TouchableOpacity
                style={[styles.linkBtn, linking && styles.linkBtnDisabled]}
                onPress={
                  canSendMatchedInvite
                    ? handleSendMatchedInvite
                    : handleLinkToAccount
                }
                disabled={
                  linking ||
                  inviting ||
                  dismissingMatch ||
                  Boolean(inviteAlreadySentForMatch)
                }
              >
                <Text style={styles.linkBtnText}>
                  {inviteAlreadySentForMatch
                    ? t("invitationSentLabel")
                    : canSendMatchedInvite
                      ? inviting
                        ? t("sending")
                        : t("sendInvitation")
                      : linking
                        ? t("linking")
                        : t("linkToAppAccount")}
                </Text>
              </TouchableOpacity>
              <Text style={styles.linkHint}>
                {inviteAlreadySentForMatch
                  ? t("invitationAlreadySentHint")
                  : canSendMatchedInvite
                    ? t("driverSignupReadyHint")
                    : t("linkHint")}
              </Text>
              {inviteAlreadySentForMatch ? (
                <TouchableOpacity
                  onPress={handleResetInvitation}
                  disabled={dismissingMatch || inviting}
                  style={styles.dismissMatchBtn}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={resetInvitationText}
                >
                  <Text style={styles.dismissMatchBtnText}>
                    {resetInvitationText}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </DetailSection>
          ) : null}
        </DriverPartnerProfileDashboard>
      </Modal>

      <EditLocalDriverModal
        visible={showEditLocalDriverModal}
        driver={driver}
        organizationId={currentOrganization?.id ?? ""}
        onClose={() => setShowEditLocalDriverModal(false)}
        onSave={handleEditLocalDriverSave}
      />

      {driverDetailTab === "trips" && (
        <ScrollView
          style={styles.tabScroll}
          contentContainerStyle={[
            styles.tabScrollContent,
            styles.tabScrollContentTripsFull,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View style={styles.tripsTabInner}>
            <View style={styles.tripDatePillWrap}>
              <DatePresetPillBar
                variant="onLight"
                period={tripsDatePreset}
                onPeriodChange={(p) => {
                  setTripsDatePreset(p);
                  if (p !== "CUSTOM") {
                    setTripsCustomFrom(null);
                    setTripsCustomTo(null);
                  }
                }}
                onCustomRangePress={() => {
                  setTripsDatePreset("CUSTOM");
                  setTripsDateRangeModalVisible(true);
                }}
                customFrom={tripsCustomFrom}
                customTo={tripsCustomTo}
              />
            </View>

            <View style={[styles.tripTableCard, styles.tripTableCardFullWidth]}>
              <View style={styles.driverTripsTableFull}>
                <View style={styles.driverTripsHeaderRow}>
                  <Text style={styles.driverTripsThTrip} numberOfLines={1}>
                    {t("driverTripsColTrip")}
                  </Text>
                  {isWebDesktop ? (
                    <Text style={styles.driverTripsThClient} numberOfLines={1}>
                      {t("tripsHubColClient")}
                    </Text>
                  ) : null}
                  <Text style={styles.driverTripsThNum} numberOfLines={1}>
                    {t("driverTripsColContract")}
                  </Text>
                  {isWebDesktop ? (
                    <Text style={styles.driverTripsThNum} numberOfLines={1}>
                      SETTLED %
                    </Text>
                  ) : null}
                  <Text style={styles.driverTripsThNum} numberOfLines={1}>
                    {t("paid")}
                  </Text>
                  <Text style={styles.driverTripsThNum} numberOfLines={1}>
                    {t("due")}
                  </Text>
                </View>
                {ledgerRows.length === 0 ? (
                  <View
                    style={[
                      styles.driverTripsDataRow,
                      styles.driverTripsDataRowEmpty,
                    ]}
                  >
                    <Text style={styles.driverTripsEmptyWide} numberOfLines={2}>
                      {t("noLedgerEntriesDriver")}
                    </Text>
                  </View>
                ) : filteredLedgerRows.length === 0 ? (
                  <View
                    style={[
                      styles.driverTripsDataRow,
                      styles.driverTripsDataRowEmpty,
                    ]}
                  >
                    <Text style={styles.driverTripsEmptyWide} numberOfLines={2}>
                      {t("driverTripsEmptyFilter")}
                    </Text>
                  </View>
                ) : (
                  filteredLedgerRows.map((r) => {
                    const settledPct = formatSettlementPct(
                      Number(r.col2 ?? 0),
                      Number(r.col1 ?? 0),
                    );
                    const settledTone =
                      settledPct === "—"
                        ? styles.tdMuted
                        : Number.parseInt(settledPct, 10) >= 100
                          ? styles.tdGreen
                          : Number.parseInt(settledPct, 10) > 0
                            ? styles.tdMuted
                            : styles.tdRed;
                    return (
                      <Pressable
                        key={r.id}
                        style={({ pressed }) => [
                          styles.driverTripsDataRow,
                          pressed && styles.ledgerRowPressed,
                        ]}
                        onPress={() => {
                          const tripId = String(r.id ?? "").trim();
                          if (!tripId) return;
                          router.push(`/trip/${tripId}`);
                        }}
                      >
                        <View style={styles.driverTripsCellTrip}>
                          <Text
                            style={styles.driverTripsTripId}
                            numberOfLines={1}
                          >
                            {r.missionId ?? "—"}
                          </Text>
                          <Text
                            style={styles.driverTripsRoute}
                            numberOfLines={2}
                          >
                            {r.dest?.trim() || "—"}
                          </Text>
                          {r.commissionBasis ? (
                            <Text
                              style={styles.driverTripsCommissionBasis}
                              numberOfLines={1}
                            >
                              {r.commissionBasis}
                            </Text>
                          ) : null}
                        </View>
                          {isWebDesktop ? (
                            <View style={styles.driverTripsCellClient}>
                              <View style={styles.driverTripsClientAvatar}>
                                <Text style={styles.driverTripsClientAvatarText}>
                                  {r.clientInitials}
                                </Text>
                              </View>
                              <Text
                                style={styles.driverTripsClientName}
                                numberOfLines={2}
                              >
                                {(r.clientName ?? "—").toUpperCase()}
                              </Text>
                            </View>
                          ) : null}
                        <Text style={styles.driverTripsAmt} numberOfLines={1}>
                          {formatINR(r.col1)}
                        </Text>
                          {isWebDesktop ? (
                            <Text
                              style={[styles.driverTripsAmt, settledTone]}
                              numberOfLines={1}
                            >
                              {settledPct}
                            </Text>
                          ) : null}
                        <Text
                          style={[
                            styles.driverTripsAmt,
                            (r.col2 ?? 0) > 0 ? styles.tdGreen : styles.tdMuted,
                          ]}
                          numberOfLines={1}
                        >
                          {(r.col2 ?? 0) > 0 ? formatLedgerAmount(r.col2) : "—"}
                        </Text>
                        <Text
                          style={[
                            styles.driverTripsAmt,
                            (r.col3 ?? 0) > 0 ? styles.tdRed : styles.tdMuted,
                          ]}
                          numberOfLines={1}
                        >
                          {(r.col3 ?? 0) > 0 ? formatLedgerAmount(r.col3) : "—"}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {driverDetailTab === "ledger" && (
        <ScrollView
          style={styles.tabScroll}
          contentContainerStyle={[
            styles.tabScrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View>
            <LedgerTransactionListView
              transactions={cashFlowRows}
              tripDetailsMap={driverTripDetailsMap}
              useTimelineLayout={true}
              showFiscalSubTabs={false}
              showTitle={false}
              showHistoryHeader={false}
              showGridFooter={false}
              embedInParentScroll={true}
              driverRows={driver ? [driver] : []}
            />
          </View>
        </ScrollView>
      )}

      {driverDetailTab === "statement" && (
        <View
          style={[
            styles.tabScrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
        >
          <View style={styles.tableWrap}>
            <Text style={styles.sectionTitle}>MONTHLY SALARY STATEMENT</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.thMonth]} numberOfLines={1}>
                  MONTH
                </Text>
                <Text style={[styles.th, styles.thCol]} numberOfLines={1}>
                  SALARY
                </Text>
                <Text style={[styles.th, styles.thCol]} numberOfLines={1}>
                  COMM.
                </Text>
                <Text style={[styles.th, styles.thColLast]} numberOfLines={1}>
                  PAID
                </Text>
              </View>
              {monthlyRowsReversed.length === 0 ? (
                <View style={styles.tableRow}>
                  <Text style={[styles.td, styles.tdMission]} numberOfLines={1}>
                    {t("noStatementDataYet")}
                  </Text>
                </View>
              ) : (
                monthlyRowsReversed.map((row) => {
                  const isExpanded = expandedStatementMonthKey === row.monthKey;
                  return (
                    <Pressable
                      key={row.monthKey}
                      style={(state: HoverPressState) => [
                        styles.statementMonthRow,
                        WEB_POINTER,
                        WEB_TRANSITION,
                        isHovered(state) && hoverRowWash,
                      ]}
                      onPress={() =>
                        setExpandedStatementMonthKey((prev) =>
                          prev === row.monthKey ? null : row.monthKey,
                        )
                      }
                    >
                      <View
                        style={[styles.tableRow, styles.statementMonthRowInner]}
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
                        </View>
                        <FontAwesome
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={10}
                          color={Theme.textMutedDemo}
                          style={styles.statementMonthChevron}
                        />
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>

          {primaryStatementRow && primaryStatementDetail && (
            <>
              <View style={styles.statementSummaryCard}>
                <Text style={styles.statementSummaryTitle}>
                  {primaryStatementRow.label.toUpperCase()}
                </Text>
                <View style={styles.statementSummaryContent}>
                  <View style={styles.statementSummaryRow}>
                    <Text style={styles.statementSummaryLabel}>Salary</Text>
                    <Text style={styles.statementSummaryValue}>
                      {formatINR(primaryStatementRow.fixedSalary)}
                    </Text>
                  </View>
                  <View style={styles.statementSummaryRow}>
                    <Text style={styles.statementSummaryLabel}>
                      Trip-based commission
                    </Text>
                    <Text style={styles.statementSummaryValue}>
                      {formatINR(primaryStatementRow.tripCommission)}
                    </Text>
                  </View>
                  <View style={styles.statementSummaryDivider} />
                  <View style={styles.statementSummaryRow}>
                    <Text style={styles.statementSummaryLabelStrong}>
                      Total earnings (due)
                    </Text>
                    <Text style={styles.statementSummaryValueStrong}>
                      {formatINR(primaryStatementRow.totalEarnings)}
                    </Text>
                  </View>
                  <View style={styles.statementSummaryRow}>
                    <Text style={styles.statementSummaryLabelStrong}>Paid</Text>
                    <Text
                      style={[
                        styles.statementSummaryValueStrong,
                        styles.statementSummaryValueGreen,
                      ]}
                    >
                      {formatINR(primaryStatementRow.paidTotal)}
                    </Text>
                  </View>
                  <View style={styles.statementSummaryRow}>
                    <Text style={styles.statementSummaryLabelStrong}>
                      Balance (still to pay)
                    </Text>
                    <Text
                      style={[
                        styles.statementSummaryValueStrong,
                        styles.statementSummaryValueRed,
                      ]}
                    >
                      {formatINR(
                        Math.max(
                          0,
                          primaryStatementRow.totalEarnings -
                            primaryStatementRow.paidTotal,
                        ),
                      )}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.statementCard}>
                <Text style={styles.statementSectionTitle}>TRIPS</Text>
                <View style={styles.statementCardContent}>
                  {primaryStatementDetail.trips.length === 0 ? (
                    <Text style={styles.statementEmptyText}>
                      {t("noLedgerEntriesDriver")}
                    </Text>
                  ) : (
                    <>
                      <View style={styles.statementHeaderRow}>
                        <Text
                          style={[
                            styles.statementHeaderCell,
                            styles.statementHeaderCellLeft,
                          ]}
                        >
                          TRIP ID
                        </Text>
                        <View style={styles.statementTripAmounts}>
                          <Text style={styles.statementHeaderCell}>COMM.</Text>
                          <Text style={styles.statementHeaderCell}>PAID</Text>
                          <Text style={styles.statementHeaderCell}>DUE</Text>
                        </View>
                      </View>
                      {primaryStatementDetail.trips.map((trip) => (
                        <View key={trip.id} style={styles.statementTripRow}>
                          <View style={styles.statementTripLeft}>
                            <Text
                              style={styles.statementTripId}
                              numberOfLines={1}
                            >
                              {trip.missionId}
                            </Text>
                          </View>
                          <View style={styles.statementTripAmounts}>
                            <Text style={styles.statementTripAmount}>
                              {formatINR(trip.commission)}
                            </Text>
                            <Text
                              style={[
                                styles.statementTripAmount,
                                styles.statementTripAmountGreen,
                              ]}
                            >
                              {formatINR(trip.paid)}
                            </Text>
                            <Text
                              style={[
                                styles.statementTripAmount,
                                trip.due > 0
                                  ? styles.statementTripAmountRed
                                  : styles.statementTripAmountMuted,
                              ]}
                            >
                              {formatINR(trip.due)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              </View>

              <View style={styles.statementCard}>
                <Text style={styles.statementSectionTitle}>PAYMENTS</Text>
                <View style={styles.statementCardContent}>
                  {primaryStatementDetail.ledgerEntries.length === 0 ? (
                    <Text style={styles.statementEmptyText}>
                      {t("noLedgerEntriesDriver")}
                    </Text>
                  ) : (
                    <>
                      <View style={styles.statementHeaderRow}>
                        <Text
                          style={[
                            styles.statementHeaderCell,
                            styles.statementHeaderCellLeft,
                          ]}
                        >
                          DATE / TYPE
                        </Text>
                        <Text style={styles.statementHeaderCell}>AMOUNT</Text>
                      </View>
                      {primaryStatementDetail.ledgerEntries.map((e) => (
                        <View key={e.id} style={styles.statementPaymentRow}>
                          <View style={styles.statementPaymentLeft}>
                            <Text
                              style={styles.statementPaymentDate}
                              numberOfLines={1}
                            >
                              {formatLedgerDate(e.date)}
                            </Text>
                            <Text
                              style={styles.statementPaymentType}
                              numberOfLines={1}
                            >
                              {e.type}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.statementPaymentAmount,
                              styles.statementTripAmountGreen,
                            ]}
                            numberOfLines={1}
                          >
                            {formatINR(e.amount)}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      )}

      {driverDetailTab === "ranking" && canViewDriverAnalytics && (
        <View style={styles.tabScroll}>
          <DriverFleetRankingTab currentDriverId={driverId} />
        </View>
      )}

      {driverDetailTab === "earnings" && canViewDriverAnalytics && (
        <View style={styles.tabScroll}>
          <DriverEarningsAnalyticsTab
            trips={trips}
            driverTransactions={driverTransactions}
            driverRequests={driverRequests}
            driver={driver}
            driverOffer={driverOffer}
          />
        </View>
      )}

      <DateRangePickerModal
        visible={tripsDateRangeModalVisible}
        initialFrom={tripsCustomFrom ?? undefined}
        initialTo={tripsCustomTo ?? undefined}
        onDismiss={() => setTripsDateRangeModalVisible(false)}
        onApply={(from, to) => {
          setTripsCustomFrom(from);
          setTripsCustomTo(to);
          setTripsDatePreset("CUSTOM");
          setTripsDateRangeModalVisible(false);
        }}
        onClear={() => {
          setTripsCustomFrom(null);
          setTripsCustomTo(null);
          setTripsDatePreset("RANGE");
          setTripsDateRangeModalVisible(false);
        }}
      />

      <LedgerReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        transactions={sortedDriverLedger}
        title={
          driverReportKind === "payable"
            ? `${lockedPartyName || t("driver")} — Payable & performance`
            : lockedPartyName
              ? `${t("ledgerFor")}${lockedPartyName}`
              : t("ledgerReport")
        }
        customReport={
          driverReportKind === "payable" && driverDetailTab === "trips"
            ? driverPayableReport
            : undefined
        }
        hideCashSummary={driverReportKind === "payable"}
      />

      <DriverFleetInviteSalaryModal
        visible={inviteSalaryModalVisible}
        mode={inviteSalaryModalMode}
        driverName={(driver.name ?? "").trim() || t("driver")}
        driverAvatarUri={profileAvatarUri}
        driverAvatarSeed={(driver.avatar_seed ?? "").trim() || null}
        initialCompensation={suggestedInviteCompensation}
        submitting={inviting}
        onClose={() => {
          if (!inviting) setInviteSalaryModalVisible(false);
        }}
        onSubmit={handleSubmitInviteWithCompensation}
      />
    </DetailPageLayout>
  );
}

const styles = StyleSheet.create({
  errorText: { fontSize: 15, color: Theme.textSecondary },
  headerTitleSubwrap: {
    alignItems: "center",
    gap: 4,
  },
  entityHeaderSubtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.2,
  },
  headerRightActions: {
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
  profileBtnHeader: {
    width: 40,
    height: 40,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadHeaderBtn: {
    width: 40,
    height: 40,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfoCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Theme.surfaceGray,
    marginBottom: 14,
  },
  profileInfoCalloutIcon: {
    marginTop: 1,
  },
  profileInfoCalloutText: {
    flex: 1,
    minWidth: 0,
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "600",
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
  profilePreviewToggleDotPending: {
    backgroundColor: "rgba(5,150,105,0.14)",
  },
  profilePreviewToggleTextWrap: ecc.toggleTextWrap,
  profilePreviewToggleTitle: ecc.toggleTitle,
  profilePreviewToggleSub: ecc.toggleSub,
  profilePreviewActionBtn: ecc.actionBtn,
  profilePreviewActionText: ecc.actionText,
  // Tabs (matching vehicle detail pills)
  tabRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 4,
    marginHorizontal: 0,
    marginBottom: 24,
    gap: 4,
    width: "100%",
    alignSelf: "stretch",
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
  tabScroll: { flex: 1 },
  tabScrollContent: {
    flexGrow: 1,
  },
  tabScrollContentTripsFull: {
    alignSelf: "stretch",
    width: "100%",
  },
  tripDatePillWrap: {
    paddingHorizontal: 4,
    marginBottom: 6,
    marginTop: -4,
  },
  tripsTabInner: {
    alignSelf: "stretch",
    width: "100%",
    marginHorizontal: 0,
    paddingHorizontal: 0,
    paddingTop: 8,
  },
  tripsFilterBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 6,
    width: "100%",
    alignSelf: "stretch",
  },
  tripsFilterScroll: {
    flex: 1,
    minWidth: 0,
  },
  tripsFilterChipsContent: {
    flexGrow: 0,
    alignItems: "center",
    paddingRight: 4,
    gap: 8,
  },
  tripsFilterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: Theme.surfaceGray,
  },
  tripsFilterChipActive: {
    backgroundColor: Theme.darkBackground,
  },
  tripsFilterChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  tripsFilterChipTextActive: {
    color: Theme.textOnPrimary,
  },
  tripsFilterCalendarBtn: {
    width: 38,
    height: 38,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  driverTripsTableFull: {
    width: "100%",
    alignSelf: "stretch",
  },
  tripTableCardFullWidth: {
    width: "100%",
    alignSelf: "stretch",
  },
  ledgerSummaryRowTripsFull: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  ledgerSummaryTripsPaidBlock: {
    flexShrink: 0,
    minWidth: 0,
  },
  ledgerSummaryTripsDueBlock: {
    flexShrink: 0,
    minWidth: 0,
    alignItems: "flex-end",
  },
  driverTripsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    alignSelf: "stretch",
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  driverTripsDataRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    alignSelf: "stretch",
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    minHeight: 56,
  },
  driverTripsDataRowEmpty: {
    justifyContent: "center",
  },
  driverTripsThTrip: {
    flex: 1.8,
    minWidth: 0,
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.35,
  },
  driverTripsThClient: {
    flex: 1.85,
    minWidth: 0,
    fontSize: 7,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.35,
  },
  driverTripsThNum: {
    flex: 1.05,
    minWidth: 0,
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.35,
    textAlign: "right",
  },
  driverTripsThTxn: {
    flex: 0.62,
    minWidth: 0,
    fontSize: 7,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.35,
    textAlign: "right",
  },
  driverTripsThLast: {
    flex: 0.72,
    minWidth: 0,
    fontSize: 7,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.35,
    textAlign: "right",
  },
  driverTripsCellTrip: {
    flex: 1.8,
    minWidth: 0,
    paddingRight: 8,
  },
  driverTripsTripId: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  driverTripsRoute: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: 2,
  },
  driverTripsCommissionBasis: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.primary,
    marginTop: 3,
    letterSpacing: 0.2,
    opacity: 0.75,
  },
  driverTripsCellClient: {
    flex: 1.85,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 4,
  },
  driverTripsClientAvatar: {
    width: 28,
    height: 28,
    backgroundColor: Theme.positiveMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  driverTripsClientAvatarText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.darkGreen,
  },
  driverTripsClientName: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  driverTripsAmt: {
    flex: 1.05,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  driverTripsTxn: {
    flex: 0.62,
    minWidth: 0,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  driverTripsLastTxn: {
    flex: 0.72,
    minWidth: 0,
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "right",
  },
  driverTripsEmptyWide: {
    flex: 1,
    width: "100%",
    paddingVertical: 24,
    paddingHorizontal: 16,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  tableWrap: { paddingHorizontal: 16, paddingTop: 24 },
  tripTableCard: {
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  tripTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tripTh: {
    fontSize: 9,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tripThMission: { flex: 1, minWidth: 0 },
  tripHeaderAmountCol: {
    width: 80,
    minWidth: 72,
    flexShrink: 0,
    alignItems: "flex-end",
  },
  tripThSales: { width: 80, textAlign: "right" as const },
  tripThRight: { width: 72, textAlign: "right" as const },
  tripTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  tripTd: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  tripTdMission: { flex: 1, minWidth: 0 },
  tripTdMissionId: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tripTdRoute: {
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMuted,
    marginTop: 4,
  },
  tripAmountCol: {
    width: 80,
    minWidth: 72,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  tripTdSales: { width: 80, textAlign: "right" as const },
  tripTdRight: { width: 72, textAlign: "right" as const },
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
    backgroundColor: Theme.screenBackground,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
    paddingLeft: 12,
  },
  ledgerSummaryLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  ledgerSummaryAmount: {
    fontSize: 19,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  ledgerSummaryIn: { color: Theme.positive ?? Theme.darkGreen },
  ledgerSummaryOut: { color: Theme.teslaRed },
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
    shadowColor: Theme.shadow,
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
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    paddingVertical: 10,
    textTransform: "uppercase",
  },
  ledgerThNode: {
    flex: 0.25,
    minWidth: 0,
    paddingLeft: 0,
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
  ledgerTdBorderLeft: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 10,
  },
  ledgerThCredit: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right" as const,
  },
  ledgerThDebit: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 8,
    textAlign: "right" as const,
  },
  ledgerThSpacer: { width: 22, minWidth: 22 },
  ledgerTdNode: {
    flex: 0.25,
    minWidth: 0,
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
  ledgerCellSubCategory: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: "uppercase",
  },
  ledgerCellSubDate: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textMuted,
    letterSpacing: 0.03,
    marginTop: 2,
  },
  ledgerCellVehicle: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    letterSpacing: 0.03,
    marginTop: 1,
  },
  ledgerRowActionHint: {
    paddingLeft: 6,
    paddingRight: 4,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    width: 22,
    minWidth: 22,
  },
  /** Driver ledger: TRIP/ROUTE/DATE (combined), PAID, TO PAY. */
  driverLedgerThCol: {
    flex: 0.25,
    minWidth: 0,
    paddingVertical: 10,
    paddingRight: 6,
    justifyContent: "center",
  },
  driverLedgerThColRouteDate: {
    flex: 0.5,
    minWidth: 0,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    justifyContent: "center",
  },
  driverLedgerThColRight: { textAlign: "right" as const },
  driverLedgerTdCol: {
    flex: 0.25,
    minWidth: 0,
    paddingRight: 6,
  },
  driverLedgerTdColRouteDate: {
    flex: 0.5,
    minWidth: 0,
    paddingLeft: 12,
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
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.05,
    textAlign: "center",
  },
  ledgerRouteTextBlock: {
    textAlign: "left",
    marginTop: 2,
  },
  driverLedgerTdColAmount: {
    flex: 0.25,
    minWidth: 0,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  ledgerRowWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  ledgerRowPressed: {
    backgroundColor: Theme.surfaceGray,
  },
  /** Ledger expanded detail — compact, aligned with EntityDetailOverlay / table. */
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
  },
  ledgerExpandedBlockTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.darkBackground,
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
  ledgerExpandedPaymentDark: {
    backgroundColor: Theme.darkBackground,
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
    shadowColor: Theme.shadow,
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
  table: {
    overflow: "hidden",
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
  ledgerTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  statementMonthRow: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceLight,
  },
  statementMonthRowInner: {
    paddingRight: 24,
  },
  statementMonthChevron: {
    marginLeft: 4,
  },
  tdMonth: { flex: 0.28 },
  tdCol: { flex: 0.24, alignItems: "flex-end" as const },
  tdColLast: { flex: 0.24, alignItems: "flex-end" as const },
  td: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  tdMission: { flex: 0.42 },
  tdMissionWrap: { flex: 0.42, minWidth: 0 },
  tdMissionId: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  tdDest: {
    fontSize: 6,
    color: Theme.textMutedDemo,
    marginTop: 2,
  },
  tdDark: { color: Theme.textPrimaryDark },
  tdMuted: { color: Theme.textMuted },
  tdGreen: { color: Theme.darkGreen },
  tdRed: { color: Theme.teslaRed },
  // Statement detail (selected month)
  statementSummaryCard: {
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  statementSummaryTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1.4,
    backgroundColor: Theme.darkBackground,
    paddingVertical: 10,
    paddingHorizontal: 16,
    textTransform: "uppercase",
  },
  statementSummaryContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  statementSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  statementSummaryLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  statementSummaryLabelStrong: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  statementSummaryValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  statementSummaryValueStrong: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  statementSummaryValueGreen: { color: Theme.darkGreen },
  statementSummaryValueRed: { color: Theme.teslaRed },
  statementSummaryDivider: {
    height: 1,
    backgroundColor: Theme.surfaceLight,
    marginVertical: 8,
  },
  statementCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  statementSectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1.2,
    backgroundColor: Theme.darkBackground,
    paddingVertical: 10,
    paddingHorizontal: 12,
    textTransform: "uppercase",
  },
  statementCardContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  statementHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 6,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  statementHeaderCell: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "right",
    minWidth: 44,
  },
  statementHeaderCellLeft: {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
  },
  statementEmptyText: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  statementTripRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  statementTripLeft: {
    flex: 1,
    minWidth: 0,
  },
  statementTripId: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  statementTripAmounts: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
  },
  statementTripAmount: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  statementTripAmountGreen: { color: Theme.darkGreen },
  statementTripAmountRed: { color: Theme.teslaRed },
  statementTripAmountMuted: { color: Theme.textMuted },
  statementPaymentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceLight,
  },
  statementPaymentLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  statementPaymentDate: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  statementPaymentType: {
    fontSize: 9,
    color: Theme.textMuted,
    marginTop: 2,
  },
  statementPaymentAmount: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  headerRatingText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.driverGold ?? Theme.primary,
  },
  disconnectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.negativeMuted ?? Theme.surfaceLight,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: Theme.negative ?? Theme.textMuted,
  },
  disconnectedBannerPending: {
    backgroundColor: Theme.pulseIndigoWash,
    borderLeftColor: Theme.primary,
  },
  disconnectedBannerIcon: {
    marginTop: 1,
  },
  disconnectedBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimary,
    lineHeight: 18,
  },
  disconnectedBannerTextPending: {
    color: Theme.textSecondary,
    fontWeight: '600',
  },
  ratingsList: { marginTop: 8, gap: 12 },
  ratingRow: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Theme.surfaceLight,
  },
  ratingScore: { fontSize: 14, fontWeight: "800", color: Theme.driverGold },
  ratingComment: { fontSize: 12, color: Theme.textSecondary, marginTop: 4 },
  ratingDate: { fontSize: 11, color: Theme.textMuted, marginTop: 4 },
  linkBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.buttonPrimary,
    alignSelf: "flex-start",
  },
  linkBtnDisabled: { opacity: 0.6 },
  linkBtnText: { fontSize: 14, fontWeight: "600", color: Theme.buttonPrimaryText },
  linkHint: {
    fontSize: 12,
    color: Theme.textMuted,
    marginTop: 8,
    maxWidth: 280,
  },
  dismissMatchBtn: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  dismissMatchBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  driverRequestCardsWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    marginBottom: 16,
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
    color: Theme.textPrimary,
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
    color: Theme.textPrimary,
  },
  driverMetricValueActive: { color: Theme.darkGreen },
  driverContactCard: {
    backgroundColor: Theme.screenBackground,
    padding: 16,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 16,
  },
  driverContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  driverContactIconWrap: {
    width: 36,
    height: 36,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  driverContactIconWrapAlt: {
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
    color: Theme.textPrimary,
  },
  driverContactDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 12,
    marginLeft: 48,
  },
  tenureSection: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  tenureHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tenureHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  tenureHeaderTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSection,
    letterSpacing: 0.8,
  },
  tenureCountBadge: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tenureCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  tenureChevron: { opacity: 0.5 },
  tenureDivider: { height: 1, backgroundColor: Theme.borderLight },
  tenureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  tenureTimeline: {
    width: 28,
    alignItems: "center",
  },
  tenureTimelineDot: {
    width: 8,
    height: 8,
    backgroundColor: Theme.textMuted,
  },
  tenureTimelineDotActive: { backgroundColor: Theme.darkGreen },
  tenureTimelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: Theme.borderLight,
    marginTop: 4,
    minHeight: 12,
  },
  tenureRowContent: { flex: 1, minWidth: 0 },
  tenureRowLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  tenureRowSub: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  tenureRowStatus: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
  },
  tenureRowStatusActive: { backgroundColor: "#dcfce7" },
  tenureStatusText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
  },
  tenureStatusTextActive: { color: "#15803d" },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tenure History Section
// ─────────────────────────────────────────────────────────────────────────────

function formatTenureDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function TenureHistorySection({
  tenures,
  driverName,
}: {
  tenures: DriverTenureRow[];
  driverName: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Show section only when there are closed tenures (history to display)
  const closedTenures = tenures.filter((t) => t.left_at != null);
  const currentTenure = tenures.find((t) => t.left_at == null);

  // If there's only one tenure and it's open, nothing to show
  if (closedTenures.length === 0) return null;

  const allTenures = [
    ...(currentTenure ? [currentTenure] : []),
    ...closedTenures,
  ];

  return (
    <View style={styles.tenureSection}>
      <TouchableOpacity
        style={styles.tenureHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
      >
        <View style={styles.tenureHeaderLeft}>
          <FontAwesome name="history" size={12} color={Theme.textSection} />
          <Text style={styles.tenureHeaderTitle}>TENURE HISTORY</Text>
          <View style={styles.tenureCountBadge}>
            <Text style={styles.tenureCountText}>{allTenures.length}</Text>
          </View>
        </View>
        <FontAwesome
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={10}
          color={Theme.textMuted}
          style={styles.tenureChevron}
        />
      </TouchableOpacity>

      {expanded && (
        <>
          <View style={styles.tenureDivider} />
          {allTenures.map((tenure, idx) => {
            const isActive = tenure.left_at == null;
            const joinedLabel = formatTenureDate(tenure.joined_at);
            const leftLabel = isActive ? 'Present' : formatTenureDate(tenure.left_at);
            const durationLabel = `${joinedLabel} – ${leftLabel}`;
            const isLast = idx === allTenures.length - 1;
            return (
              <View key={tenure.id}>
                <View style={styles.tenureRow}>
                  <View style={styles.tenureTimeline}>
                    <View
                      style={[
                        styles.tenureTimelineDot,
                        isActive && styles.tenureTimelineDotActive,
                      ]}
                    />
                    {!isLast && <View style={styles.tenureTimelineLine} />}
                  </View>
                  <View style={styles.tenureRowContent}>
                    <Text style={styles.tenureRowLabel} numberOfLines={1}>
                      {isActive
                        ? `Current tenure · ${(driverName || 'Driver').trim()}`
                        : `Previous tenure`}
                    </Text>
                    <Text style={styles.tenureRowSub}>{durationLabel}</Text>
                  </View>
                  <View
                    style={[
                      styles.tenureRowStatus,
                      isActive && styles.tenureRowStatusActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tenureStatusText,
                        isActive && styles.tenureStatusTextActive,
                      ]}
                    >
                      {isActive ? 'ACTIVE' : 'ENDED'}
                    </Text>
                  </View>
                </View>
                {!isLast && <View style={styles.tenureDivider} />}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}
