import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { CounterpartyProfileSystemCard } from "@/components/CounterpartyProfileSystemCard";
import { DatePresetPillBar } from "@/components/DatePresetPillBar";
import { DateRangePickerModal } from "@/components/DateRangePickerModal";
import { EntityIntelWidgetRow } from "@/components/entityIntel/EntityIntelWidgetRow";
import { pickEntityReport } from "@/components/entityIntel/pickEntityReport";
import { entityCompanionCardStyles as ecc } from "@/components/entityCompanionCard.styles";
import { EntityTripTableEmptyRow } from "@/components/EntityTripTableEmptyRow";
import { HubListPaginationBar } from "@/components/hub/HubListPaginationBar";
import {
  entityDetailDownloadIconColor,
  entityDetailPageChromeStyles as edc,
} from "@/components/entityDetailPageChrome.styles";
import { entityHeroScorecardStyles as ehs } from "@/components/entityHeroScorecard.styles";
import { FinanceFAB } from "@/components/FinanceFAB";
import { EntityIdentityAvatar } from "@/components/EntityIdentityAvatar";
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers";
import {
    LedgerReportModal,
    type LedgerRow,
} from "@/features/finance";
import { LedgerTransactionListView } from "@/features/finance/components/LedgerTransactionListView";
import {
  PARTY_TRIP_PAGE_SIZES,
  partyTripPageSlice,
  type PartyTripPageSize,
} from "@/features/finance/utils/partyTripPage.util";
import {
  buildSupplierPayableReport,
  formatReportInr,
  formatSettlementPct,
} from "@/features/finance/lib/entityDetailReports.util";
import {
  resolveLedgerPartyName,
  type LedgerTripDetailsMap,
  type LedgerTripPartyMap,
} from "@/features/finance/components/ledger/buildFinancialRowDataForLedgerRow";
import { ledgerDayMatchesPeriod } from "@/features/finance/lib/filterLedgerByPeriod";
import { getProfileImageBatch } from "@/features/finance/services/finance.service";
import type { FinancePeriodFilter } from "@/features/finance/types";
import { allocateAmountsToLargestDueTrips } from "@/features/finance/utils/allocateToLargestDue";
import { EditSupplierModal } from "@/features/suppliers/components/EditSupplierModal";
import { getSupplierKycDocuments } from "@/features/suppliers/services/supplierKycDocuments.service";
import { mapSupplierVerificationVaultDocs } from "@/features/suppliers/utils/supplierVerificationVault.util";
import { SupplierVendorOnboardingVault } from "@/features/suppliers/components/vendor-onboarding/SupplierVendorOnboardingVault";
import {
    getTripDisplayNumber,
    type TripRow,
} from "@/features/trips/services/trips.service";
import { adjustedCost } from "@/features/trips/services/tripAdjustments";
import { isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import {
    canAccessFinance } from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { tripDayIso } from "@/lib/dateRangePresets";
import { formatINR, formatLedgerDate, formatTripTableDate } from "@/lib/format";
import {
  type LedgerIdentityContext,
  resolveLedgerReceiptPartyAvatar,
  resolveLedgerRowPartyIdentity,
} from "@/lib/entityIdentity";
import { useTripFinanceAdjustmentsMap } from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
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
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { querySupplierPageBootstrap } from "@/features/suppliers/hooks/useSupplierPageBootstrapQuery";
import { useFinanceAlignedSupplierLedger } from "@/features/finance/hooks/useFinanceAlignedPartyTrips";
import {
    getLinkedOrgProfileForSupplier,
    getSupplierDetails,
    readSupplierPrimaryRegion,
    updateSupplier,
    type SupplierRow,
    type UpdateSupplierData,
} from "../services/suppliers.service";
import {
  clearInitialSupplierForDetail,
  getInitialSupplierForDetail,
} from "../initialSupplierForDetail";

/** Treat DB placeholders or internal ids as empty for display. */
function normalizeContactDisplay(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!s || s === "nameLabel" || s === "contactPerson" || s === "contact")
    return "";
  return s;
}

/** Treat linked-org placeholder or UUID in phone as empty for display. */
function normalizePhoneDisplay(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!s || /^linked-/i.test(s) || s.toLowerCase().includes("linked-"))
    return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
    return "";
  if (/^[0-9a-f-]{36,}$/i.test(s)) return "";
  return s;
}

const TRIP_TABLE_AVATAR = 24;

/** UUID-shaped strings are not valid human names (avoid showing raw ids). */
function isUuidLikeString(value: string | null | undefined): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

/**
 * First paint: the list SupplierRow seed stashed by FinanceScreen before
 * navigating here, if any. `getSupplierDetails` remains the authoritative
 * hydration source — never written into any query cache.
 */
function peekSupplierFirstPaint(supplierId: string | null | undefined): SupplierRow | null {
  if (!supplierId) return null;
  return getInitialSupplierForDetail(supplierId);
}

export interface SupplierDetailScreenProps {
  supplierId: string;
  onBack: () => void;
  autoOpenProfile?: boolean;
  initialDetailSubTab?: "trips" | "cash";
}

export default function SupplierDetailScreen({
  supplierId,
  onBack,
  autoOpenProfile,
  initialDetailSubTab,
}: SupplierDetailScreenProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const capabilities = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const canAddTransaction =
    canAccessFinance(capabilities) && canSurface("finance.add_transaction");
  const [supplier, setSupplier] = useState<SupplierRow | null>(() =>
    peekSupplierFirstPaint(supplierId),
  );
  const supplierName =
    supplier?.name ||
    supplier?.company_name ||
    supplier?.contact_person ||
    t("supplier");
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(() => peekSupplierFirstPaint(supplierId) == null);
  const financeAligned = useFinanceAlignedSupplierLedger(
    currentOrganization?.id ?? null,
    supplierId,
    trips,
    trips.length > 0 || !loading,
  );
  const tripIdsForFinanceAdj = useMemo(
    () => trips.map((t) => String(t.id)).filter(Boolean),
    [trips],
  );
  const { record: tripFinanceAdjRecord } = useTripFinanceAdjustmentsMap(
    currentOrganization?.id ?? null,
    tripIdsForFinanceAdj,
  );
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [allOrgTransactions, setAllOrgTransactions] = useState<LedgerRow[]>(
    [],
  );
  const [orgSuppliers, setOrgSuppliers] = useState<SupplierRow[]>([]);
  const [cashFlowDriverProfileUrls, setCashFlowDriverProfileUrls] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [supplierReportKind, setSupplierReportKind] = useState<
    "payable" | "ledger"
  >("payable");
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [vaultKycDocs, setVaultKycDocs] = useState(() =>
    mapSupplierVerificationVaultDocs([]),
  );
  const [detailSubTab, setDetailSubTab] = useState<"trips" | "cash">(
    initialDetailSubTab ?? "trips",
  );
  const [tripDatePeriod, setTripDatePeriod] =
    useState<FinancePeriodFilter>("RANGE");
  const [tripCustomFrom, setTripCustomFrom] = useState<string | null>(null);
  const [tripCustomTo, setTripCustomTo] = useState<string | null>(null);
  const [tripDateModalVisible, setTripDateModalVisible] = useState(false);
  const [tripPageSize, setTripPageSize] = useState<PartyTripPageSize>(25);
  const [tripPage, setTripPage] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTitle, setSuccessTitle] = useState("NODE_SYNCED");
  const [isLinked, setIsLinked] = useState(false);
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [isInApp, setIsInApp] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [orgDrivers, setOrgDrivers] = useState<DriverRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [shipperNameByTripId, setShipperNameByTripId] = useState<
    Record<string, string>
  >({});
  const [aggregateTripSalesById, setAggregateTripSalesById] = useState<
    Record<string, number>
  >({});
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && windowWidth >= 640;
  const webContentGutter =
    Platform.OS === "web"
      ? windowWidth >= 1600
        ? 10
        : windowWidth >= 1280
          ? 12
          : 16
      : Layout.screenPaddingHorizontal;
  const initialLoadDoneRef = useRef(false);
  const lastFocusRefreshRef = useRef(0);
  /** Whether we currently have seed data to show while `load()` is in flight — first mount only, reset per `supplierId`. */
  const hasSeedDataRef = useRef(peekSupplierFirstPaint(supplierId) != null);
  /** Guards a resolving `load()` from writing state after the user has already switched to a different supplier. */
  const activeSupplierIdRef = useRef(supplierId);
  /** supplierId of an in-flight `load()` call, or null — makes concurrent triggers (mount effect + focus effect) idempotent. */
  const loadInFlightRef = useRef<string | null>(null);
  const heroDecorProgress = useRef(new Animated.Value(0)).current;

  const supplierMountRef = useRef(true);
  useEffect(() => {
    activeSupplierIdRef.current = supplierId;
    initialLoadDoneRef.current = false;
    setError(null);
    if (supplierMountRef.current) {
      // Initial mount already seeded `supplier`/`loading` via useState initializers above.
      supplierMountRef.current = false;
      return;
    }
    // Switching to a different supplier on an already-mounted screen instance:
    // reset first so stale Supplier A data never shows under Supplier B's id,
    // then seed from the registry if available.
    const seed = peekSupplierFirstPaint(supplierId);
    hasSeedDataRef.current = seed != null;
    setSupplier(seed);
    setLoading(seed == null);
  }, [supplierId]);

  const clientById = useMemo(() => {
    const m = new Map<string, ClientRow>();
    for (const c of clients) {
      m.set(String(c.id).trim().toLowerCase(), c);
    }
    return m;
  }, [clients]);

  const linkedOrgDisplayMap = useLinkedOrgProfileMap(clients, orgSuppliers);

  const loadVaultKyc = useCallback(async () => {
    const orgId = currentOrganization?.id;
    if (!orgId || !supplierId) {
      setVaultKycDocs(mapSupplierVerificationVaultDocs([]));
      return;
    }
    const { documents } = await getSupplierKycDocuments(orgId, supplierId);
    setVaultKycDocs(mapSupplierVerificationVaultDocs(documents));
  }, [currentOrganization?.id, supplierId]);

  const refreshSupplierProfile = useCallback(async () => {
    const orgId = currentOrganization?.id;
    if (!orgId || !supplierId) return;
    void loadVaultKyc();
    await queryClient.invalidateQueries({
      queryKey: queryKeys.suppliers.pageBootstrap(orgId, supplierId),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.suppliers.managementBundle(orgId, supplierId),
    });
    const bundle = await queryClient.fetchQuery({
      queryKey: queryKeys.suppliers.pageBootstrap(orgId, supplierId),
      queryFn: () => querySupplierPageBootstrap(orgId, supplierId),
    });
    if (bundle?.supplier && activeSupplierIdRef.current === supplierId) {
      setSupplier(bundle.supplier);
    }
  }, [currentOrganization?.id, supplierId, queryClient, loadVaultKyc]);

  useEffect(() => {
    if (!showProfileModal) return;
    void loadVaultKyc();
  }, [showProfileModal, loadVaultKyc]);

  useEffect(() => {
    const collectDriverIds = (rows: LedgerRow[]) => {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        if (row.contact_type !== "driver" || !row.contact_id) continue;
        const id = String(row.contact_id).trim();
        if (!id || seen.has(id)) continue;
        if (cashFlowDriverProfileUrls[id]) continue;
        seen.add(id);
        out.push(id);
      }
      return out;
    };
    const driverIds = [
      ...new Set([
        ...collectDriverIds(allOrgTransactions),
        ...collectDriverIds(transactions),
      ]),
    ];
    if (driverIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      const fetched = await getProfileImageBatch(driverIds);
      if (cancelled || Object.keys(fetched).length === 0) return;
      setCashFlowDriverProfileUrls((prev) => ({ ...prev, ...fetched }));
    })();
    return () => {
      cancelled = true;
    };
  }, [transactions, allOrgTransactions, cashFlowDriverProfileUrls]);

  const hasInAppProfile =
    Boolean(supplier?.linked_organization_id) || isInApp || isLinked;

  useEffect(() => {
    if (autoOpenProfile) setShowProfileModal(true);
  }, [autoOpenProfile]);

  useEffect(() => {
    const phone = supplier?.phone?.trim();
    if (!phone) {
      setIsInApp(false);
      return;
    }
    import("@/features/connections/services/connectionRequests.service")
      .then(({ getConnectionInviteeByPhone }) =>
        getConnectionInviteeByPhone(phone, currentOrganization?.id ?? ""),
      )
      .then(({ invitee }) => {
        setIsInApp(Boolean(invitee));
      })
      .catch(() => {
        // Avoid unhandled promise rejections on transient lookup timeouts.
        setIsInApp(false);
      });
  }, [supplier?.phone, currentOrganization?.id]);

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

  const handleSendInvitation = useCallback(async () => {
    if (!currentOrganization?.id || !supplier?.phone) return;
    setSendingInvitation(true);
    try {
      const { createConnectionRequest, getConnectionInviteeByPhone } =
        await import("@/features/connections/services/connectionRequests.service");
      const { invitee, error: lookupError } = await getConnectionInviteeByPhone(
        supplier.phone,
        currentOrganization.id,
      );
      if (lookupError) {
        Alert.alert("Unable to send invitation", lookupError.message);
        return;
      }
      if (!invitee?.organization_id) {
        Alert.alert(
          "Unable to send invitation",
          "This supplier is not available in the application yet.",
        );
        return;
      }
      const { error, alreadyInvited } = await createConnectionRequest(
        currentOrganization.id,
        invitee.organization_id,
        {
          requestShipperClient: false,
          requestCarrierSupplier: true,
        },
      );
      if (error) {
        Alert.alert("Unable to send invitation", error.message);
        return;
      }
      setIsLinked(true);
      setSuccessTitle(
        alreadyInvited ? "INVITATION_ALREADY_SENT" : "CONNECTION_REQUESTED",
      );
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again.";
      Alert.alert("Unable to send invitation", message);
    } finally {
      setSendingInvitation(false);
    }
  }, [currentOrganization?.id, supplier?.phone]);

  const load = useCallback(() => {
    if (!supplierId || !currentOrganization?.id) {
      setLoading(false);
      return;
    }
    // Idempotency guard: useFocusEffect and the org-readiness retry effect can
    // both invoke load() for the same supplierId in the same tick.
    if (loadInFlightRef.current === supplierId) return;
    loadInFlightRef.current = supplierId;
    const requestSupplierId = supplierId;
    if (!isRefreshingRef.current && !initialLoadDoneRef.current && !hasSeedDataRef.current)
      setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;
    const finishLoad = () => {
      if (loadInFlightRef.current === requestSupplierId) loadInFlightRef.current = null;
      if (activeSupplierIdRef.current !== requestSupplierId) return;
      setLoading(false);
      initialLoadDoneRef.current = true;
      hasSeedDataRef.current = false;
      isRefreshingRef.current = false;
      setRefreshing(false);
      clearInitialSupplierForDetail(requestSupplierId);
    };

    const cached = queryClient.getQueryData<{
      supplier: SupplierRow;
      trips: TripRow[];
      transactions: LedgerRow[];
      suppliers: SupplierRow[];
      drivers: DriverRow[];
      clients: ClientRow[];
      aggregateTripSalesById: Record<string, number>;
    }>(queryKeys.suppliers.pageBootstrap(orgId, requestSupplierId));
    if (cached?.supplier) {
      setSupplier(cached.supplier);
      if (!financeAligned.ready) setTrips(cached.trips);
      setAggregateTripSalesById(cached.aggregateTripSalesById ?? {});
      setAllOrgTransactions(cached.transactions);
      setOrgSuppliers(cached.suppliers);
      setTransactions(cached.transactions);
      setOrgDrivers(cached.drivers);
      setClients(cached.clients);
      setLoading(false);
    }


    queryClient
      .fetchQuery({
        queryKey: queryKeys.suppliers.pageBootstrap(orgId, requestSupplierId),
        queryFn: () => querySupplierPageBootstrap(orgId, requestSupplierId),
        staleTime: 60_000,
      })
      .then((bundle) => {
        if (activeSupplierIdRef.current !== requestSupplierId) return;
        if (bundle?.supplier) {
          setSupplier(bundle.supplier);
          if (!financeAligned.ready) setTrips(bundle.trips);
          setAggregateTripSalesById(bundle.aggregateTripSalesById);
          setAllOrgTransactions(bundle.transactions);
          setOrgSuppliers(bundle.suppliers);
          setTransactions(bundle.transactions);
          setOrgDrivers(bundle.drivers);
          setClients(bundle.clients);
          setShipperNameByTripId({});
          finishLoad();
          return;
        }
        if (!cached?.supplier) setError("Supplier not found");
        finishLoad();
      })
      .catch((err: unknown) => {
        if (activeSupplierIdRef.current !== requestSupplierId) return;
        if (!cached?.supplier) {
          setError(err instanceof Error ? err.message : "Failed to load supplier data");
        }
        finishLoad();
      });
  }, [supplierId, currentOrganization?.id, queryClient]);

  useEffect(() => {
    if (!financeAligned.ready) return;
    setTrips(financeAligned.trips);
  }, [financeAligned.ready, financeAligned.trips]);

  const resolveClientDisplayName = useCallback(
    (trip: TripRow): string => {
      const shipperName = (shipperNameByTripId[trip.id] ?? "").trim();
      if (shipperName) return shipperName;
      const cidKey = (trip.client_id ?? "").trim().toLowerCase();
      const clientRow = cidKey ? clientById.get(cidKey) : undefined;
      const rawTripClientName = (trip.client_name ?? "").trim();
      return (
        (clientRow?.name ?? "").trim() ||
        (rawTripClientName && !isUuidLikeString(trip.client_name)
          ? rawTripClientName
          : "") ||
        "—"
      );
    },
    [shipperNameByTripId, clientById],
  );

  useFocusEffect(
    useCallback(() => {
      if (initialLoadDoneRef.current && Date.now() - lastFocusRefreshRef.current < 2 * 60_000) return;
      lastFocusRefreshRef.current = Date.now();
      load();
    }, [load]),
  );
  useEffect(() => {
    if (!currentOrganization?.id || initialLoadDoneRef.current) return;
    load();
  }, [currentOrganization?.id, load]);

  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!supplier?.linked_organization_id) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      const { profile } = await getLinkedOrgProfileForSupplier(
        supplier.linked_organization_id,
      );
      if (!profile) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      if (profile.avatarUrl?.startsWith("http")) {
        if (mounted) setProfileAvatarUri(profile.avatarUrl);
        return;
      }
      if (profile.avatarUrl?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatarUrl.trim());
        if (mounted) setProfileAvatarUri(signed);
        return;
      }
      if (profile.avatarSeed?.trim()) {
        if (mounted)
          setProfileAvatarUri(
            getUser2DAvatarUriForSeed(profile.avatarSeed.trim()),
          );
        return;
      }
      if (mounted) setProfileAvatarUri(null);
    };
    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [supplier?.linked_organization_id]);

  const linkedOrgId = supplier?.linked_organization_id ?? null;

  const {
    rows: _ledgerProtocolRows,
    totalBilledConsolidated,
    totalPendingConsolidated,
    tripIdToDue,
    paidByTripId,
  } = useMemo(() => {
    const norm = (id: string | null | undefined) =>
      id == null ? "" : String(id).trim().toLowerCase();
    const linkedTripIds = new Set(trips.map((t) => norm(t.id)));
    const paidByTripId: Record<string, number> = {};
    const outByTripId: Record<string, number> = {};
    const isSupplierLinked = (tx: LedgerRow) =>
      tx.contact_type === "supplier" &&
      tx.contact_id != null &&
      norm(tx.contact_id) === norm(supplierId);

    for (const t of trips) {
      const key = norm(t.id);
      paidByTripId[key] = 0;
      outByTripId[key] = 0;
    }
    const linkedTxIds = new Set<string>();
    const unlinkedSupplierTx: LedgerRow[] = [];
    for (const tx of transactions) {
      const txTripKey =
        norm(tx.trip_id) && linkedTripIds.has(norm(tx.trip_id))
          ? norm(tx.trip_id)
          : undefined;
      if (txTripKey !== undefined) {
        paidByTripId[txTripKey] =
          (paidByTripId[txTripKey] ?? 0) + Number(tx.amount_in ?? 0);
        outByTripId[txTripKey] =
          (outByTripId[txTripKey] ?? 0) + Number(tx.amount_out ?? 0);
        linkedTxIds.add(tx.id);
      } else if (isSupplierLinked(tx)) {
        unlinkedSupplierTx.push(tx);
      }
    }
    const allocatedOutByTripId = allocateAmountsToLargestDueTrips(
      trips.map((t) => {
        const key = norm(t.id);
        const base =
          Number(t.supplier_rate ?? 0) || Number(t.client_price ?? 0);
        const adj = tripFinanceAdjRecord[key] ?? [];
        const sales = adjustedCost(base, adj);
        return {
          tripId: key,
          sales,
          paid: outByTripId[key] ?? 0,
        };
      }),
      unlinkedSupplierTx.map((tx) => Number(tx.amount_out ?? 0)),
    );
    if (trips.length > 0) {
      for (const tx of unlinkedSupplierTx) {
        linkedTxIds.add(tx.id);
      }
    }

    const byMissionKey: Record<
      string,
      {
        missionId: string;
        dest: string;
        sales: number;
        paid: number;
        due: number;
      }
    > = {};
    for (const t of trips) {
      const key = norm(t.id);
      const base = Number(t.supplier_rate ?? 0) || Number(t.client_price ?? 0);
      const adj = tripFinanceAdjRecord[key] ?? [];
      const sales = adjustedCost(base, adj);
      const paid = allocatedOutByTripId[key] ?? 0;
      const due = Math.max(0, sales - paid);
      const rawId = getTripDisplayNumber(t) || "—";
      const missionKey =
        String(rawId)
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase() || "EMPTY";
      if (byMissionKey[missionKey]) {
        byMissionKey[missionKey].sales += sales;
        byMissionKey[missionKey].paid += paid;
        byMissionKey[missionKey].due = Math.max(
          0,
          byMissionKey[missionKey].sales - byMissionKey[missionKey].paid,
        );
      } else {
        byMissionKey[missionKey] = {
          missionId: String(rawId).trim() || "—",
          dest: t.drop_location || "—",
          sales,
          paid,
          due,
        };
      }
    }
    const finalRows = Object.entries(byMissionKey).map(
      ([key, data], index) => ({
        ...data,
        id: `mission-${key}-${index}`,
      }),
    );
    const unlinkedTx = transactions.filter((tx) => !linkedTxIds.has(tx.id));
    for (const tx of unlinkedTx) {
      const amountIn = Number(tx.amount_in ?? 0);
      const amountOut = Number(tx.amount_out ?? 0);
      finalRows.push({
        id: `adj-${tx.id}`,
        missionId: "ADJ",
        dest:
          tx.description && tx.description !== "ENTRY"
            ? tx.description
            : "GENERAL",
        sales: amountIn,
        paid: amountIn,
        due: amountOut,
      });
    }
    if (finalRows.length === 0) {
      finalRows.push({
        id: "none",
        missionId: "—",
        dest: "—",
        sales: 0,
        paid: 0,
        due: 0,
      });
    }
    const tripIdToDue: Record<string, number> = {};
    for (const t of trips) {
      const key = norm(t.id);
      const base = Number(t.supplier_rate ?? 0) || Number(t.client_price ?? 0);
      const adj = tripFinanceAdjRecord[key] ?? [];
      const sales = adjustedCost(base, adj);
      const paid = allocatedOutByTripId[key] ?? 0;
      tripIdToDue[t.id] = Math.max(0, sales - paid);
    }

    const totalBilledConsolidated = finalRows.reduce(
      (s, r) => s + (r.missionId !== "ADJ" ? r.sales : 0),
      0,
    );
    const totalPendingConsolidated = finalRows.reduce((s, r) => s + r.due, 0);
    return {
      rows: finalRows,
      totalBilledConsolidated,
      totalPendingConsolidated,
      tripIdToDue,
      paidByTripId: allocatedOutByTripId,
    };
  }, [trips, transactions, supplierId, linkedOrgId, tripFinanceAdjRecord]);

  const tripDateOpts = useMemo(
    () => ({ customFrom: tripCustomFrom, customTo: tripCustomTo }),
    [tripCustomFrom, tripCustomTo],
  );
  const tripsForMissionTable = useMemo(
    () =>
      (financeAligned.ready ? financeAligned.trips : trips).filter((t) =>
        ledgerDayMatchesPeriod(tripDayIso(t), tripDatePeriod, tripDateOpts),
      ),
    [financeAligned.ready, financeAligned.trips, trips, tripDatePeriod, tripDateOpts],
  );

  const missionRows = useMemo(() => {
    const norm = (id: string | null | undefined) =>
      id == null ? "" : String(id).trim().toLowerCase();
    return tripsForMissionTable.map((t) => {
      const key = norm(t.id);
      const base = Number(t.supplier_rate ?? 0) || Number(t.client_price ?? 0);
      const adj = tripFinanceAdjRecord[key] ?? [];
      const sales = adjustedCost(base, adj);
      const paid = paidByTripId[key] ?? 0;
      const due = tripIdToDue[t.id] ?? 0;
      return {
        trip: t,
        missionId: getTripDisplayNumber(t),
        route:
          `${t.pickup_area ?? ""} → ${t.drop_location ?? ""}`.trim() || "—",
        sales,
        paid,
        due,
      };
    });
  }, [tripsForMissionTable, paidByTripId, tripIdToDue, tripFinanceAdjRecord]);

  const tripSelectionMetrics = useMemo(() => {
    let billed = 0;
    let paidSum = 0;
    let dueSum = 0;
    for (const row of missionRows) {
      billed += row.sales;
      paidSum += row.paid;
      dueSum += row.due;
    }
    const health =
      billed > 0 ? Math.min(100, Math.round((paidSum / billed) * 100)) : 0;
    return { dueSum, health, count: missionRows.length };
  }, [missionRows]);

  const tripPageView = useMemo(
    () => partyTripPageSlice(missionRows, tripPage, tripPageSize),
    [missionRows, tripPage, tripPageSize],
  );

  useEffect(() => {
    setTripPage(0);
  }, [supplierId, tripDatePeriod, tripCustomFrom, tripCustomTo, tripPageSize]);
  const _getTripSalesForSupplierView = useCallback(
    (trip: TripRow): number => {
      const mappedAggregateSales = aggregateTripSalesById[trip.id];
      if (mappedAggregateSales != null && mappedAggregateSales > 0) {
        return mappedAggregateSales;
      }
      const isIntegratedAggregateTrip =
        currentOrganization?.id != null &&
        isLoadBasedTrip(trip) &&
        trip.organization_id != null &&
        trip.organization_id !== currentOrganization.id;
      if (isIntegratedAggregateTrip) {
        // For integrated aggregate trips, supplier_rate is the awarded/winning bid.
        return (
          Number(trip.supplier_rate ?? 0) || Number(trip.client_price ?? 0)
        );
      }
      return Number(trip.client_price ?? 0);
    },
    [aggregateTripSalesById, currentOrganization?.id],
  );
  const tripTransactionMetaById = useMemo(() => {
    const byTrip: Record<
      string,
      { count: number; lastTxnDate: string | null }
    > = {};
    for (const tx of transactions) {
      if (!tx.trip_id) continue;
      const key = String(tx.trip_id).trim().toLowerCase();
      if (!key) continue;
      const candidateDate = tx.transaction_date ?? tx.created_at ?? null;
      const current = byTrip[key];
      if (!current) {
        byTrip[key] = { count: 1, lastTxnDate: candidateDate };
        continue;
      }
      current.count += 1;
      if (
        candidateDate &&
        (!current.lastTxnDate || candidateDate > current.lastTxnDate)
      ) {
        current.lastTxnDate = candidateDate;
      }
    }
    return byTrip;
  }, [transactions]);

  const supplierTripDetailsMap = useMemo(() => {
    const m: LedgerTripDetailsMap = {};
    trips.forEach((t) => {
      const supId = String(t.supplier_id ?? "").trim();
      const supRow = supId
        ? orgSuppliers.find((s) => String(s.id).trim() === supId)
        : undefined;
      m[t.id] = {
        trip_number: getTripDisplayNumber(t),
        drop_location: t.drop_location ?? undefined,
        pickup_area: t.pickup_area ?? undefined,
        client_name: t.client_name ?? undefined,
        pickup_date: t.pickup_date ?? undefined,
        vehicle_number:
          (t as { vehicle_display_number?: string | null }).vehicle_display_number ??
          undefined,
        client_price: t.client_price != null ? Number(t.client_price) : null,
        supplier_rate: t.supplier_rate != null ? Number(t.supplier_rate) : null,
        driver_commission:
          t.driver_commission != null ? Number(t.driver_commission) : null,
        supplier_id: t.supplier_id ?? null,
        supplier_display_name:
          (supRow?.name ?? supRow?.company_name ?? "").trim() || undefined,
      };
    });
    return m;
  }, [trips, orgSuppliers]);

  const tripPartyMapForCash = useMemo((): LedgerTripPartyMap => {
    const m: LedgerTripPartyMap = {};
    for (const t of trips) {
      m[t.id] = {
        client_id: t.client_id ?? null,
        supplier_id: t.supplier_id ?? null,
        driver_id: t.driver_id ?? null,
      };
    }
    return m;
  }, [trips]);

  const _getVehicleNumberForTripId = useCallback(
    (tripId: string | null) => {
      if (!tripId) return null;
      const t = trips.find((x) => String(x.id) === String(tripId));
      const v = (t as { vehicle_display_number?: string | null } | undefined)
        ?.vehicle_display_number;
      return (v ?? "").trim() || null;
    },
    [trips],
  );

  const clientByIdForLedger = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );

  const supplierByIdForLedger = useMemo(
    () => new Map(orgSuppliers.map((s) => [s.id, s])),
    [orgSuppliers],
  );

  const driverByIdForCashExpand = useMemo(
    () => new Map(orgDrivers.map((d) => [d.id, d])),
    [orgDrivers],
  );

  const cashFlowTransactionRows = useMemo(() => {
    const partyParams = {
      clientById: clientByIdForLedger,
      supplierById: supplierByIdForLedger,
      tripPartyMap: tripPartyMapForCash,
      tripDetailsMap: supplierTripDetailsMap,
    };
    return transactions.map((r) => ({
      ...r,
      party_name: resolveLedgerPartyName(r, partyParams),
    }));
  }, [
    transactions,
    clientByIdForLedger,
    supplierByIdForLedger,
    tripPartyMapForCash,
    supplierTripDetailsMap,
  ]);

  const _tripOptions = useMemo(
    () =>
      trips.map((t) => ({
        id: t.id,
        trip_number: getTripDisplayNumber(t),
        client_id: t.client_id ?? null,
        client_name: t.client_name ?? null,
        supplier_id: t.supplier_id ?? supplierId ?? null,
        driver_id: t.driver_id ?? null,
        vehicle_id: t.vehicle_id ?? null,
        indent_id: t.indent_id ?? null,
        route_label:
          [t.pickup_area, t.drop_location].filter(Boolean).join(" → ") || null,
        trip_date: formatLedgerDate(t.pickup_date || t.created_at),
      })),
    [trips, supplierId],
  );

  const triggerSuccess = useCallback((title = "NODE_SYNCED") => {
    setSuccessTitle(title);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1500);
  }, []);

  const handleEditSave = async (patch: UpdateSupplierData) => {
    if (!currentOrganization?.id || !supplier) return;
    const { error: err } = await updateSupplier(
      currentOrganization.id,
      supplier.id,
      patch,
    );
    if (!err) {
      load();
    }
  };

  const handleSyncLatestFromPlatform = async () => {
    if (!currentOrganization?.id || !supplier) return;
    const linkedId = supplier.linked_organization_id ?? undefined;
    if (linkedId) {
      const { error: profileErr, profile } =
        await getLinkedOrgProfileForSupplier(linkedId);
      if (!profileErr && profile) {
        const { organizationName, contactPerson, phone, email, gstin, address } = profile;
        const patch: UpdateSupplierData = {
          company_name: organizationName || undefined,
          contact_person: contactPerson || undefined,
          phone: phone || undefined,
          email: email || undefined,
        };
        if (gstin && !supplier.gstin) patch.gstin = gstin;
        if (address && !supplier.address) patch.address = address;
        const { error: updateErr, supplier: updated } = await updateSupplier(
          currentOrganization.id,
          supplier.id,
          patch,
        );
        if (!updateErr && updated) {
          setSupplier(updated);
          return {
            companyName: updated.company_name ?? updated.name ?? "",
            contactPerson: updated.contact_person ?? updated.contact ?? "",
            phone: updated.phone ?? "",
            email: updated.email ?? "",
            gstin: updated.gstin ?? undefined,
            address: updated.address ?? undefined,
          };
        }
      }
    }
    const { error: err, supplier: latest } = await getSupplierDetails(
      supplier.id,
    );
    if (err || !latest) return;
    setSupplier(latest);
    return {
      companyName: latest.company_name ?? latest.name ?? "",
      contactPerson: latest.contact_person ?? latest.contact ?? "",
      phone: latest.phone ?? "",
      email: latest.email ?? "",
      gstin: latest.gstin ?? undefined,
      address: latest.address ?? undefined,
    };
  };

  const handleInviteToApp = useCallback(() => {
    const message = `Join me on Pulse to sync our ledger and compare books with ${supplierName}. Download Pulse to get started.`;
    Share.share({ message, title: "Invite to Pulse" })
      .then(() => {
        triggerSuccess("INVITE_SENT");
      })
      .catch(() => {});
  }, [supplierName, triggerSuccess]);

  const sortedTx = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const da = a.transaction_date ?? a.created_at ?? "";
        const db = b.transaction_date ?? b.created_at ?? "";
        return db.localeCompare(da);
      }),
    [transactions],
  );

  const tripReportTransactions = useMemo(
    () =>
      [...missionRows]
        .sort((a, b) => {
          const da = a.trip.pickup_date ?? a.trip.created_at ?? "";
          const db = b.trip.pickup_date ?? b.trip.created_at ?? "";
          return db.localeCompare(da);
        })
        .map((row) => ({
          id: `report-${row.trip.id}`,
          organization_id: currentOrganization?.id ?? "",
          trip_id: row.trip.id,
          trip_number: row.missionId,
          party_name: supplierName,
          description:
            `${row.route} • Cost ${formatINR(row.sales)}`.trim() || "—",
          amount_in: row.paid,
          amount_out: row.due,
          transaction_date: row.trip.pickup_date ?? row.trip.created_at ?? "",
          created_at: row.trip.created_at ?? "",
          contact_id: supplierId,
          contact_type: "supplier" as const,
        })),
    [currentOrganization?.id, missionRows, supplierId, supplierName],
  );

  const reportTransactions = useMemo(
    () => (detailSubTab === "trips" ? tripReportTransactions : sortedTx),
    [detailSubTab, sortedTx, tripReportTransactions],
  );
  const supplierPayableReport = useMemo(() => {
    if (detailSubTab !== "trips") return undefined;
    const rows = missionRows.map((row) => {
      const key = String(row.trip.id).trim().toLowerCase();
      const meta = tripTransactionMetaById[key] ?? {
        count: 0,
        lastTxnDate: null,
      };
      return {
        trip: row.missionId,
        tripDate: formatTripTableDate(
          row.trip.pickup_date ?? row.trip.created_at,
        ),
        route: row.route,
        client: resolveClientDisplayName(row.trip),
        cost: formatReportInr(row.sales),
        paid: formatReportInr(row.paid),
        due: formatReportInr(row.due),
        settlement: formatSettlementPct(row.paid, row.sales),
        txns: meta.count,
        lastTxn: meta.lastTxnDate ? formatLedgerDate(meta.lastTxnDate) : "—",
      };
    });
    return buildSupplierPayableReport(rows);
  }, [
    detailSubTab,
    missionRows,
    tripTransactionMetaById,
    resolveClientDisplayName,
  ]);

  const openSupplierReport = useCallback((kind: "payable" | "ledger") => {
    if (!canSurface("finance.reports")) return;
    setSupplierReportKind(kind);
    setShowReportModal(true);
  }, [canSurface]);

  const handleSupplierDownloadPress = useCallback(() => {
    if (detailSubTab === "trips") {
      pickEntityReport(
        "Supplier report",
        [
          { id: "payable", label: "Payable & performance" },
          { id: "ledger", label: "Ledger transactions" },
        ],
        (id) => openSupplierReport(id === "ledger" ? "ledger" : "payable"),
      );
      return;
    }
    openSupplierReport("ledger");
  }, [detailSubTab, openSupplierReport]);

  if (loading && !supplier) {
    return (
      <CenteredLoadingView
        message={t("loadingSupplier")}
        color={Theme.loaderAccent}
      />
    );
  }

  if (error || !supplier) {
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
              {t("supplier")}
            </Text>
          </View>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error || t("supplierNotFound")}</Text>
        </View>
      </View>
    );
  }

  const contractValue = financeAligned.ready
    ? financeAligned.due
    : totalBilledConsolidated;
  const paid = financeAligned.ready
    ? financeAligned.paid
    : contractValue - totalPendingConsolidated;
  const due = financeAligned.ready
    ? financeAligned.unsettled
    : totalPendingConsolidated;
  const tripsHandled = financeAligned.ready
    ? financeAligned.tripCount
    : missionRows.length;
  const isIntegrated =
    supplier.supplier_type === "integrated" ||
    Boolean(supplier.linked_organization_id);
  const isInAppNotIntegrated = !isIntegrated && isInApp;
  const isNotInApp = !isIntegrated && !isInApp;
  const rating = Number(
    (supplier.is_verified
      ? hasInAppProfile
        ? 4.6
        : 4.2
      : hasInAppProfile
        ? 4.1
        : 3.8
    ).toFixed(1),
  );
  const ratingFilledStars = Math.max(0, Math.min(5, Math.round(rating)));
  const statusTitle = isIntegrated
    ? "Integrated"
    : isInAppNotIntegrated
      ? "In App - Not Integrated"
      : "Offline";
  const canSendRequest = isInAppNotIntegrated && !isLinked;
  const canInviteToApp = isNotInApp;
  const profileActionLabel = canSendRequest
    ? "Send Request"
    : canInviteToApp
      ? "Invite to App"
      : isLinked
        ? "Invitation Sent"
        : "Integrated";
  const tabConfig = [
    { id: "trips" as const, label: "Trips" },
    { id: "cash" as const, label: "Cash Flow" },
  ];
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
            size={18}
            color={Theme.textPrimaryDark}
          />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {supplierName}
          </Text>
          <Text style={styles.headerSubtitle}>DEEP ENTITY INTEL</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => router.push(ROUTES.supplierAnalytics(supplierId) as never)}
            activeOpacity={0.8}
            accessibilityLabel="Open supplier analytics"
            accessibilityRole="button"
          >
            <FontAwesome
              name="line-chart"
              size={16}
              color={Theme.textPrimaryDark}
            />
          </TouchableOpacity>
          {!isWebDesktop ? (
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => router.push(`/public-profile/supplier/${supplierId}`)}
              activeOpacity={0.8}
              accessibilityLabel="Open supplier profile"
              accessibilityRole="button"
            >
              <FontAwesome
                name="user-circle-o"
                size={16}
                color={Theme.textPrimaryDark}
              />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={handleSupplierDownloadPress}
            activeOpacity={0.8}
            accessibilityLabel="Download report"
          >
              <FontAwesome
                name="cloud-download"
                size={16}
                color={entityDetailDownloadIconColor}
              />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: webContentGutter,
          },
          {
            paddingBottom:
              canAddTransaction
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
              load();
            }}
            tintColor={Theme.loaderAccent}
          />
        }
      >
        <View style={isWebDesktop ? styles.heroCardsRow : undefined}>
          <LinearGradient
            colors={[Theme.financeCardOrangeFrom, Theme.financeCardOrangeTo]}
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
                  name="book"
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
                <Text style={styles.scorecardSalesLabel}>TOTAL COST</Text>
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
                  {formatINR(paid)}
                </Text>
              </View>
              <View
                style={[
                  styles.scorecardGridRight,
                  isWebDesktop && styles.scorecardGridStat,
                ]}
              >
                <Text style={styles.scorecardGridLabelDue}>DUE</Text>
                <Text
                  style={[
                    styles.scorecardGridDue,
                    isWebDesktop && styles.scorecardGridDueWebDesktop,
                  ]}
                >
                  {formatINR(due)}
                </Text>
              </View>
            </View>
          </LinearGradient>
          {isWebDesktop ? (
            <View style={styles.profilePreviewCard}>
              <View style={ecc.dossierHeader}>
                <View style={styles.profilePreviewTopMetaRow}>
                  <View style={styles.profilePreviewTopAction}>
                    <Text
                      style={styles.profilePreviewTopActionText}
                      numberOfLines={1}
                    >
                      {tripsHandled}
                    </Text>
                  </View>
                  <View style={styles.profilePreviewRatingRow}>
                    <View style={styles.profilePreviewStars}>
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <FontAwesome
                          key={`supplier-star-header-${idx}`}
                          name={idx < ratingFilledStars ? "star" : "star-o"}
                          size={13}
                          color={
                            idx < ratingFilledStars
                              ? "#fbbf24"
                              : Theme.borderMedium
                          }
                        />
                      ))}
                    </View>
                    <View style={styles.profilePreviewRatingBadge}>
                      <Text
                        style={styles.profilePreviewRatingBadgeText}
                        numberOfLines={1}
                      >
                        {rating.toFixed(1)}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.profilePreviewTopAction}
                  onPress={() => setShowProfileModal(true)}
                  activeOpacity={0.85}
                  accessibilityLabel="Open supplier full profile"
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
                accessibilityLabel="Open supplier full profile"
              >
                <View style={ecc.dossierAvatarWrap}>
                  {profileAvatarUri ? (
                    <Image
                      source={{ uri: profileAvatarUri }}
                      style={ecc.dossierAvatarImage}
                    />
                  ) : (
                    <FontAwesome
                      name="building"
                      size={24}
                      color={Theme.textOnPrimary}
                    />
                  )}
                  <View style={ecc.dossierAvatarBadge}>
                    <FontAwesome
                      name="bolt"
                      size={10}
                      color={Theme.textOnPrimary}
                    />
                  </View>
                </View>
                <Text style={ecc.dossierName} numberOfLines={1}>
                  {supplierName}
                </Text>
                <Text style={ecc.dossierSub} numberOfLines={1}>
                  {(
                    supplier.contact_person ??
                    supplier.phone ??
                    "No contact"
                  ).trim() || "No contact"}
                </Text>
                <View style={ecc.dossierBadgeRow}>
                  <View style={[ecc.dossierBadge, ecc.dossierBadgeBlue]}>
                    <Text style={ecc.dossierBadgeText}>SUPPLIER</Text>
                  </View>
                  <View style={[ecc.dossierBadge, ecc.dossierBadgeDark]}>
                    <Text
                      style={[ecc.dossierBadgeText, ecc.dossierBadgeTextDark]}
                    >
                      {statusTitle}
                    </Text>
                  </View>
                  <View style={[ecc.dossierBadge, ecc.dossierBadgeMuted]}>
                    <Text
                      style={[ecc.dossierBadgeText, ecc.dossierBadgeTextMuted]}
                    >
                      {isIntegrated ? "SECURED" : "LOCAL"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              <View style={ecc.dossierContactStack}>
                <View style={ecc.dossierContactRow}>
                  <View style={ecc.dossierContactIcon}>
                    <FontAwesome
                      name="envelope-o"
                      size={13}
                      color={Theme.textMuted}
                    />
                  </View>
                  <View style={ecc.dossierContactText}>
                    <Text style={ecc.dossierContactLabel}>Encrypted Mail</Text>
                    <Text style={ecc.dossierContactValue} numberOfLines={1}>
                      {(supplier.email ?? "").trim() || "Not available"}
                    </Text>
                  </View>
                  <FontAwesome
                    name="lock"
                    size={10}
                    color={Theme.textSection}
                  />
                </View>
                <View style={ecc.dossierContactRow}>
                  <View style={ecc.dossierContactIcon}>
                    <FontAwesome
                      name="phone"
                      size={13}
                      color={Theme.textMuted}
                    />
                  </View>
                  <View style={ecc.dossierContactText}>
                    <Text style={ecc.dossierContactLabel}>Secured Line</Text>
                    <Text style={ecc.dossierContactValue} numberOfLines={1}>
                      {(supplier.phone ?? "").trim() || "Not available"}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.profilePreviewActionBtn,
                  ecc.actionBtnPrimary,
                  !canSendRequest && !canInviteToApp && ecc.actionBtnDisabled,
                ]}
                onPress={() => {
                  if (canSendRequest) {
                    void handleSendInvitation();
                  } else if (canInviteToApp) {
                    handleInviteToApp();
                  }
                }}
                activeOpacity={0.86}
                disabled={
                  sendingInvitation || (!canSendRequest && !canInviteToApp)
                }
              >
                <FontAwesome
                  name={canSendRequest ? "send" : "envelope-o"}
                  size={14}
                  color={Theme.textOnPrimary}
                />
                <Text style={styles.profilePreviewActionText}>
                  {sendingInvitation && canSendRequest
                    ? "Sending..."
                    : profileActionLabel}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.tabRow}>
          {tabConfig.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tabItem,
                detailSubTab === tab.id && styles.tabItemActive,
              ]}
              onPress={() => setDetailSubTab(tab.id)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabItemText,
                  detailSubTab === tab.id && styles.tabItemTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {detailSubTab === "trips" ? (
          <EntityIntelWidgetRow
            widgets={[
              {
                id: "payable",
                label: "Payable due",
                value: formatINR(tripSelectionMetrics.dueSum),
                tone: tripSelectionMetrics.dueSum > 0 ? "warn" : "good",
                hint: "Export payable report",
                onPress: () => openSupplierReport("payable"),
              },
              {
                id: "performance",
                label: "Trips handled",
                value: String(tripSelectionMetrics.count),
                hint: "Supplier performance",
              },
              {
                id: "health",
                label: "Payment health",
                value: `${tripSelectionMetrics.health}%`,
                tone:
                  tripSelectionMetrics.health >= 80
                    ? "good"
                    : tripSelectionMetrics.health >= 50
                      ? "warn"
                      : "bad",
                hint: "Paid vs contract",
              },
            ]}
          />
        ) : null}

        {detailSubTab === "trips" && (
          <View style={styles.tripDatePillWrap}>
            <DatePresetPillBar
              variant="onLight"
              period={tripDatePeriod}
              onPeriodChange={(p) => {
                setTripDatePeriod(p);
                if (p !== "CUSTOM") {
                  setTripCustomFrom(null);
                  setTripCustomTo(null);
                }
              }}
              onCustomRangePress={() => setTripDateModalVisible(true)}
              customFrom={tripCustomFrom}
              customTo={tripCustomTo}
            />
          </View>
        )}

        {detailSubTab === "trips" && (
          <View
            style={[
              styles.tableCard,
              isWebDesktop && styles.tableCardWebDesktop,
            ]}
          >
            <ScrollView
              horizontal={isWebDesktop}
              showsHorizontalScrollIndicator={isWebDesktop}
              bounces={false}
              style={isWebDesktop ? styles.tableScrollWebDesktop : undefined}
              contentContainerStyle={
                isWebDesktop ? styles.tableGridWebDesktop : undefined
              }
            >
              <View style={isWebDesktop ? styles.tableGridInnerWebDesktop : undefined}>
            <View
              style={[
                styles.tableHeader,
                isWebDesktop && styles.tableHeaderWebDesktop,
              ]}
            >
              <View
                style={isWebDesktop ? styles.tripColWebDesktop : undefined}
              >
                <Text
                  style={[
                    styles.th,
                    !isWebDesktop && styles.thMission,
                    isWebDesktop && styles.thWebDesktop,
                  ]}
                  numberOfLines={1}
                >
                  Trip
                </Text>
              </View>
              {isWebDesktop ? (
                <View style={styles.partyColWebDesktop}>
                  <Text style={[styles.th, styles.thWebDesktop]} numberOfLines={1}>
                    Client
                  </Text>
                </View>
              ) : null}
              <View
                style={
                  isWebDesktop ? styles.amountColWebDesktop : styles.headerAmountCol
                }
              >
                <Text
                  style={[
                    styles.th,
                    styles.thSales,
                    isWebDesktop && styles.thWebDesktop,
                    isWebDesktop && styles.thAmountDesktop,
                  ]}
                  numberOfLines={1}
                >
                  Payable
                </Text>
              </View>
              {isWebDesktop ? (
                <View style={styles.amountColWebDesktop}>
                  <Text
                    style={[
                      styles.th,
                      styles.thRight,
                      styles.thWebDesktop,
                      styles.thAmountDesktop,
                    ]}
                    numberOfLines={1}
                  >
                    Settled %
                  </Text>
                </View>
              ) : null}
              <View
                style={
                  isWebDesktop ? styles.amountColWebDesktop : styles.headerAmountCol
                }
              >
                <Text
                  style={[
                    styles.th,
                    styles.thRight,
                    isWebDesktop && styles.thWebDesktop,
                    isWebDesktop && styles.thAmountDesktop,
                  ]}
                  numberOfLines={1}
                >
                  Paid
                </Text>
              </View>
              <View
                style={
                  isWebDesktop ? styles.amountColWebDesktop : styles.headerAmountCol
                }
              >
                <Text
                  style={[
                    styles.th,
                    styles.thRight,
                    isWebDesktop && styles.thWebDesktop,
                    isWebDesktop && styles.thAmountDesktop,
                  ]}
                  numberOfLines={1}
                >
                  Due
                </Text>
              </View>
              {isWebDesktop ? (
                <View style={styles.txnsColWebDesktop}>
                  <Text
                    style={[
                      styles.th,
                      styles.thWebDesktop,
                      styles.thTxnsDesktop,
                    ]}
                    numberOfLines={1}
                  >
                    Txns
                  </Text>
                </View>
              ) : null}
              {isWebDesktop ? (
                <View style={styles.lastTxnColWebDesktop}>
                  <Text
                    style={[
                      styles.th,
                      styles.thRight,
                      styles.thWebDesktop,
                      styles.thAmountDesktop,
                    ]}
                    numberOfLines={1}
                  >
                    Last Txn
                  </Text>
                </View>
              ) : null}
            </View>
            {tripPageView.rows.length > 0 ? (
              tripPageView.rows.map((row) => (
                <Pressable
                  key={row.trip.id}
                  style={(state: HoverPressState) => [
                    styles.tableRow,
                    isWebDesktop && styles.tableRowWebDesktop,
                    WEB_POINTER,
                    WEB_TRANSITION,
                    isHovered(state) && hoverRowWash,
                  ]}
                  onPress={() =>
                    router.push(`/trip/${row.trip.id}?entryContext=supplier`)
                  }
                >
                  {(() => {
                    const meta = tripTransactionMetaById[
                      String(row.trip.id).trim().toLowerCase()
                    ] ?? {
                      count: 0,
                      lastTxnDate: null,
                    };
                    const cidKey = (row.trip.client_id ?? "")
                      .trim()
                      .toLowerCase();
                    const clientRow = cidKey
                      ? clientById.get(cidKey)
                      : undefined;
                    const clientNameForUi = resolveClientDisplayName(row.trip);
                    const settledPct = formatSettlementPct(row.paid, row.sales);
                    const tripDateIso =
                      row.trip.pickup_date ?? row.trip.created_at;
                    return (
                      <>
                        <View
                          style={[
                            styles.tdMission,
                            isWebDesktop && styles.tdMissionWebDesktop,
                          ]}
                        >
                          <View style={styles.tdMissionIdRow}>
                            <Text
                              style={[styles.tdMissionId, styles.tdMissionIdFlex]}
                              numberOfLines={1}
                              ellipsizeMode="middle"
                            >
                              {row.missionId}
                            </Text>
                            <Text style={styles.tdMissionDateSep}>·</Text>
                            <Text style={styles.tdMissionDate} numberOfLines={1}>
                              {formatTripTableDate(tripDateIso)}
                            </Text>
                          </View>
                          <Text
                            style={styles.tdRoute}
                            numberOfLines={isWebDesktop ? 3 : 1}
                          >
                            {row.route}
                          </Text>
                        </View>
                        {isWebDesktop ? (
                          <View style={styles.partyColWebDesktop}>
                            <View style={styles.tdPartyAvatarRow}>
                              <PartyAvatar
                                name={clientNameForUi}
                                organizationImageUrl={
                                  clientRow?.linked_organization_id
                                    ? linkedOrgDisplayMap[
                                        clientRow.linked_organization_id
                                      ]?.avatarUrl
                                    : undefined
                                }
                                organizationAvatarSeed={
                                  clientRow?.linked_organization_id
                                    ? linkedOrgDisplayMap[
                                        clientRow.linked_organization_id
                                      ]?.avatarSeed
                                    : undefined
                                }
                                avatarUrl={clientRow?.avatar_url ?? null}
                                avatarSeed={clientRow?.avatar_seed ?? null}
                                entityType="client"
                                size={TRIP_TABLE_AVATAR}
                              />
                              <View style={styles.tdPartyTextStack}>
                                <Text
                                  style={styles.tdPartyWebDesktop}
                                  numberOfLines={1}
                                >
                                  {clientNameForUi}
                                </Text>
                                <Text
                                  style={styles.tdPartyHintWebDesktop}
                                  numberOfLines={1}
                                >
                                  {(clientRow?.contact_person ?? "").trim() ||
                                    "—"}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ) : null}
                        <View
                          style={
                            isWebDesktop
                              ? styles.amountColWebDesktop
                              : styles.amountCol
                          }
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.td,
                              styles.tdSales,
                              isWebDesktop && styles.tdAmountWebDesktop,
                            ]}
                          >
                            {formatINR(row.sales)}
                          </Text>
                        </View>
                        {isWebDesktop ? (
                          <View style={styles.amountColWebDesktop}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.td,
                                styles.tdRight,
                                styles.tdAmountWebDesktop,
                                { textAlign: "right" as const },
                              ]}
                            >
                              {settledPct}
                            </Text>
                          </View>
                        ) : null}
                        <View
                          style={
                            isWebDesktop
                              ? styles.amountColWebDesktop
                              : styles.amountCol
                          }
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.td,
                              styles.tdRight,
                              styles.tdGreen,
                              isWebDesktop && styles.tdAmountWebDesktop,
                            ]}
                          >
                            {formatINR(row.paid)}
                          </Text>
                        </View>
                        <View
                          style={
                            isWebDesktop
                              ? styles.amountColWebDesktop
                              : styles.amountCol
                          }
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.td,
                              styles.tdRight,
                              styles.tdRed,
                              isWebDesktop && styles.tdAmountWebDesktop,
                            ]}
                          >
                            {formatINR(row.due)}
                          </Text>
                        </View>
                        {isWebDesktop ? (
                          <View style={styles.txnsColWebDesktop}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.td,
                                styles.tdTxnsWebDesktop,
                              ]}
                            >
                              {meta.count}
                            </Text>
                          </View>
                        ) : null}
                        {isWebDesktop ? (
                          <View style={styles.lastTxnColWebDesktop}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.td,
                                styles.tdRight,
                                styles.tdAmountWebDesktop,
                              ]}
                            >
                              {meta.lastTxnDate
                                ? formatLedgerDate(meta.lastTxnDate)
                                : "—"}
                            </Text>
                          </View>
                        ) : null}
                      </>
                    );
                  })()}
                </Pressable>
              ))
            ) : (
              <EntityTripTableEmptyRow />
            )}
              </View>
            </ScrollView>
            {missionRows.length > 0 ? (
              <HubListPaginationBar
                page={tripPageView.page}
                totalPages={tripPageView.totalPages}
                totalItems={missionRows.length}
                pageSize={tripPageSize}
                pageSizeOptions={PARTY_TRIP_PAGE_SIZES}
                onPageSizeChange={(size) => {
                  if (
                    (PARTY_TRIP_PAGE_SIZES as readonly number[]).includes(size)
                  ) {
                    setTripPageSize(size as PartyTripPageSize);
                  }
                }}
                onPrev={() => setTripPage((current) => Math.max(0, current - 1))}
                onNext={() =>
                  setTripPage((current) =>
                    Math.min(tripPageView.totalPages - 1, current + 1),
                  )
                }
                itemLabel="trips"
              />
            ) : null}
          </View>
        )}

        {detailSubTab === "cash" && (
          <View
            style={[
              styles.cashSection,
              isWebDesktop && styles.cashSectionWebDesktop,
            ]}
          >
            <LedgerTransactionListView
              transactions={cashFlowTransactionRows}
              fullWidth
              tripDetailsMap={supplierTripDetailsMap}
              useTimelineLayout={true}
              showFiscalSubTabs={false}
              showTitle={false}
              showHistoryHeader={false}
              showGridFooter={false}
              embedInParentScroll={true}
              driverRows={orgDrivers}
              driverProfileImageUrls={cashFlowDriverProfileUrls}
              renderPartyAvatar={(row) => {
                const name = resolveLedgerPartyName(row, {
                  clientById: clientByIdForLedger,
                  supplierById: supplierByIdForLedger,
                  tripPartyMap: tripPartyMapForCash,
                  tripDetailsMap: supplierTripDetailsMap,
                });
                const ctx: LedgerIdentityContext = {
                  clientById: clientByIdForLedger,
                  supplierById: supplierByIdForLedger,
                  driverById: driverByIdForCashExpand,
                  linkedOrgDisplayMap,
                  profileImages: cashFlowDriverProfileUrls,
                  driverProfileImageUrls: cashFlowDriverProfileUrls,
                  tripPartyMap: tripPartyMapForCash,
                  partyDisplayName: name,
                };
                const identity = resolveLedgerRowPartyIdentity(row, ctx);
                if (!identity) return null;
                return (
                  <EntityIdentityAvatar
                    identity={identity}
                    sizePx={32}
                    showIntegrationBadge
                    badgeOverlay
                  />
                );
              }}
              resolveReceiptPartyAvatar={(row) => {
                const name = resolveLedgerPartyName(row, {
                  clientById: clientByIdForLedger,
                  supplierById: supplierByIdForLedger,
                  tripPartyMap: tripPartyMapForCash,
                  tripDetailsMap: supplierTripDetailsMap,
                });
                return resolveLedgerReceiptPartyAvatar(row, {
                  clientById: clientByIdForLedger,
                  supplierById: supplierByIdForLedger,
                  driverById: driverByIdForCashExpand,
                  linkedOrgDisplayMap,
                  profileImages: cashFlowDriverProfileUrls,
                  driverProfileImageUrls: cashFlowDriverProfileUrls,
                  tripPartyMap: tripPartyMapForCash,
                  partyDisplayName: name,
                });
              }}
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
              const q = new URLSearchParams({
                entityType: "SUPPLIER",
                entityId: supplierId,
                partyName: supplierName.trim() || t("supplier"),
                partyContext: "suppliers",
                partyId: supplierId,
                defaultType: "out",
              });
              if (due > 0) q.set("dueAmountOut", String(due));
              router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
            }}
            accessibilityLabel={t("addTransaction")}
            icon="receipt-text"
          />
        </View>
      )}

      {showSuccess && (
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <FontAwesome name="check" size={24} color={Theme.textOnPrimary} />
            </View>
            <Text style={styles.successTitle}>{successTitle}</Text>
          </View>
        </View>
      )}

      <DateRangePickerModal
        visible={tripDateModalVisible}
        initialFrom={tripCustomFrom ?? undefined}
        initialTo={tripCustomTo ?? undefined}
        onDismiss={() => setTripDateModalVisible(false)}
        onApply={(from, to) => {
          setTripCustomFrom(from);
          setTripCustomTo(to);
          setTripDatePeriod("CUSTOM");
          setTripDateModalVisible(false);
        }}
      />

      <LedgerReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        transactions={reportTransactions}
        title={
          supplierReportKind === "payable"
            ? `${supplierName || t("supplier")} — Payable & performance`
            : supplierName
              ? `${t("ledgerFor")}${supplierName}`
              : t("ledgerReport")
        }
        customReport={
          supplierReportKind === "payable" ? supplierPayableReport : undefined
        }
        hideCashSummary={supplierReportKind === "payable"}
      />
      <Modal
        visible={showProfileModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View
          style={[styles.profileModalWrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        >
          <CounterpartyProfileSystemCard
            visible={showProfileModal}
            presentation="page"
            profileTitle="Partner Profile"
            type="supplier"
            organizationName={
              (supplier?.name ??
                supplier?.company_name ??
                supplier?.contact_person ??
                "—") as string
            }
            adminName={normalizeContactDisplay(supplier?.contact_person)}
            email={normalizeContactDisplay(supplier?.email)}
            phone={normalizePhoneDisplay(supplier?.phone)}
            gstNumber={normalizeContactDisplay(supplier?.gstin)}
            panNumber={normalizeContactDisplay(supplier?.pan_number)}
            billingAddress={normalizeContactDisplay(supplier?.address)}
            primaryRegion={readSupplierPrimaryRegion(supplier)}
            gridVolumeLabel={formatINR(contractValue)}
            networkTrustLabel="94.2%"
            isIntegrated={Boolean(
              supplier?.supplier_type === "integrated" ||
              supplier?.linked_organization_id ||
              isInApp,
            )}
            entityDisplayId={supplier?.id?.slice(0, 8) ?? null}
            organizationId={currentOrganization?.id}
            supplierId={supplierId}
            kycDocs={vaultKycDocs}
            supplierVaultSlot={
              currentOrganization?.id && supplierId ? (
                <SupplierVendorOnboardingVault
                  organizationId={currentOrganization.id}
                  supplierId={supplierId}
                  canEdit={canSurface("sales.suppliers.edit")}
                />
              ) : undefined
            }
            onClose={() => setShowProfileModal(false)}
            canEdit={canSurface("sales.suppliers.edit")}
            onProfileEntitiesChange={() => refreshSupplierProfile()}
            onEditPress={() => {
              setShowProfileModal(false);
              setShowEditModal(true);
            }}
          />
          <View style={styles.profileModalFooter}>
            {!supplier?.linked_organization_id && isInApp && !isLinked && (
              <TouchableOpacity
                style={styles.profileSecondaryBtn}
                onPress={() => void handleSendInvitation()}
                activeOpacity={0.8}
                disabled={sendingInvitation}
              >
                <FontAwesome
                  name="paper-plane"
                  size={14}
                  color={Theme.primary}
                />
                <Text style={styles.profileSecondaryBtnText}>
                  {sendingInvitation ? "Sending..." : "Send request"}
                </Text>
              </TouchableOpacity>
            )}
            {!supplier?.linked_organization_id && isInApp && isLinked && (
              <View style={[styles.profileSecondaryBtn, { opacity: 0.7 }]}>
                <FontAwesome name="check" size={14} color={Theme.primary} />
                <Text style={styles.profileSecondaryBtnText}>
                  Invitation sent
                </Text>
              </View>
            )}
            {!supplier?.linked_organization_id && !isInApp && (
              <TouchableOpacity
                style={styles.profileSecondaryBtn}
                onPress={() => {
                  const message = `Join me on Pulse to sync our ledger and compare books with ${supplierName}. Download Pulse to get started.`;
                  Share.share({ message, title: "Invite to Pulse" });
                }}
                activeOpacity={0.8}
              >
                <FontAwesome name="link" size={14} color={Theme.primary} />
                <Text style={styles.profileSecondaryBtnText}>
                  {t("linkToAppAccount")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <EditSupplierModal
        visible={showEditModal && canSurface("sales.suppliers.edit")}
        supplier={supplier}
        onClose={() => setShowEditModal(false)}
        onSave={handleEditSave}
        onSyncLatest={
          supplier.supplier_type === "integrated"
            ? handleSyncLatestFromPlatform
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  errorText: { fontSize: 15, color: Theme.textSecondary },
  errorWrap: { padding: 16 },
  wrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: edc.header,
  backBtn: edc.backBtn,
  headerCenter: edc.headerCenter,
  headerTitle: edc.headerTitle,
  headerSubtitle: edc.headerSubtitle,
  headerRight: edc.headerRight,
  downloadBtn: edc.downloadBtn,
  profileBtn: edc.profileBtn,
  fabWrap: {
    position: "absolute",
    right: Layout.fabRightOffset,
    zIndex: 100,
    elevation: 10,
  },
  profileModalWrap: {
    flex: 1,
    backgroundColor: Theme.surface,
  },
  profileModalFooter: {
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: Theme.surface,
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
    backgroundColor: Theme.surface,
    padding: 18,
    marginBottom: 16,
  },
  profileCardTop: {
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  profileAvatarWrap: {
    width: 74,
    height: 74,
    backgroundColor: Theme.avatarIndigo,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarImage: {
    width: "100%",
    height: "100%",
  },
  profileCardTopText: { flex: 0, minWidth: 0, alignItems: "center" },
  profileEntityName: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
    textAlign: "center",
  },
  profileBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
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
  profileGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 14,
  },
  profileGridItem: {
    flex: 1,
    backgroundColor: Theme.surfaceGray,
    padding: 12,
    alignItems: "center",
  },
  profileGridLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    marginBottom: 4,
    textAlign: "center",
  },
  profileGridValue: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  profileHealthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 6,
  },
  profileHealthLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  profileHealthPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.screenBackground,
  },
  profileHealthValue: {
    fontSize: 16,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.primary,
  },
  profileSectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  profileContactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  profileContactIcon: {
    width: 32,
    height: 32,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  profileContactText: { flex: 1, minWidth: 0 },
  profileContactLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  profileContactValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  profileFiscalRow: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: Theme.screenBackground,
  },
  profileFiscalLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  profileFiscalValue: {
    fontSize: 10,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  profileEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 14,
    backgroundColor: Theme.buttonPrimary,
  },
  profileEditBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  profileSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 14,
    backgroundColor: Theme.surface,
  },
  profileSecondaryBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    ...edc.scrollContent,
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
  profilePreviewHeaderEnd: {
    justifyContent: "flex-end",
    minHeight: 24,
  },
  profilePreviewEyebrow: ecc.eyebrow,
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
  profilePreviewTopMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
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
  profilePreviewExperienceLabel: ecc.experienceLabel,
  profilePreviewToggle: ecc.toggle,
  profilePreviewToggleDot: ecc.toggleDot,
  profilePreviewToggleDotActive: ecc.toggleDotActive,
  profilePreviewToggleDotPending: {
    backgroundColor: "rgba(234,88,12,0.12)",
  },
  profilePreviewToggleTextWrap: ecc.toggleTextWrap,
  profilePreviewToggleTitle: ecc.toggleTitle,
  profilePreviewToggleSub: ecc.toggleSub,
  profilePreviewActionBtn: ecc.actionBtn,
  profilePreviewActionText: ecc.actionText,
  tabRow: edc.tabRow,
  tripDatePillWrap: edc.tripDatePillWrap,
  tabItem: edc.tabItem,
  tabItemActive: edc.tabItemActive,
  tabItemText: edc.tabItemText,
  tabItemTextActive: edc.tabItemTextActive,
  tableCard: edc.tableCard,
  tableCardWebDesktop: {
    width: "100%",
    backgroundColor: Theme.surface,
    marginHorizontal: 0,
    overflow: "hidden",
  },
  tableScrollWebDesktop: {
    width: "100%",
  },
  tableGridWebDesktop: {
    flexGrow: 1,
    minWidth: "100%",
    width: "100%",
  },
  tableGridInnerWebDesktop: {
    minWidth: 1080,
    width: "100%",
    alignSelf: "stretch",
  },
  tableHeader: edc.tableHeader,
  tableHeaderWebDesktop: {
    ...edc.tableHeaderDesktop,
    width: "100%",
    backgroundColor: Theme.surface,
    borderBottomColor: Theme.borderMedium,
  },
  th: edc.th,
  thWebDesktop: {
    fontSize: 10,
    letterSpacing: 0.2,
    color: Theme.textSecondary,
    fontWeight: "700",
    fontStyle: "normal",
    textTransform: "uppercase",
  },
  thMissionWebDesktop: edc.tripColDesktop,
  tripColWebDesktop: edc.tripColDesktop,
  partyColWebDesktop: edc.tripPartyColDesktop,
  amountColWebDesktop: edc.tripAmountColDesktop,
  txnsColWebDesktop: edc.tripCountColDesktop,
  lastTxnColWebDesktop: edc.tripLastTxnColDesktop,
  thAmountDesktop: edc.thCellRight,
  thTxnsDesktop: edc.thCellCenter,
  tdPartyAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    width: "100%",
  },
  tdPartyTextStack: {
    flex: 1,
    minWidth: 0,
  },
  headerAmountCol: edc.headerAmountCol,
  amountCol: edc.amountCol,
  thMission: edc.thMission,
  thSales: { textAlign: "right" as const },
  thRight: { textAlign: "right" as const },
  tableRow: edc.tableRow,
  tableRowWebDesktop: {
    ...edc.tableRowDesktop,
    width: "100%",
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  td: edc.td,
  tdMission: edc.thMission,
  tdMissionId: edc.tdMissionId,
  tdMissionIdRow: edc.tdMissionIdRow,
  tdMissionIdFlex: edc.tdMissionIdFlex,
  tdMissionDateSep: edc.tdMissionDateSep,
  tdMissionDate: edc.tdMissionDate,
  tdRoute: edc.tdRoute,
  tdMissionWebDesktop: edc.tripColDesktop,
  tdPartyWebDesktop: {
    fontSize: 9,
    color: Theme.textPrimaryDark,
    fontWeight: "500",
    fontStyle: "italic",
  },
  tdPartyHintWebDesktop: {
    fontSize: 7,
    color: Theme.textMuted,
    marginTop: 1,
    fontWeight: "500",
    fontStyle: "italic",
  },
  tdAmountWebDesktop: {
    ...edc.tdAmountRight,
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "normal",
  },
  tdTxnsWebDesktop: {
    ...edc.thCellCenter,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  tdSales: { textAlign: "right" as const },
  tdRight: { textAlign: "right" as const },
  tdGreen: { color: Theme.darkGreen },
  tdRed: { color: Theme.teslaRed },
  emptyRow: edc.emptyRow,
  emptyRowText: edc.emptyRowText,
  cashSection: { marginBottom: 24 },
  cashSectionWebDesktop: {
    width: "100%",
    alignSelf: "stretch",
  },
  sharedSection: { marginBottom: 24 },
  analyticsSection: {
    marginBottom: 24,
    marginHorizontal: -Layout.screenPaddingHorizontal,
  },
  sharedSectionWeb: { width: "100%", alignSelf: "stretch" },
  sharedCard: {
    backgroundColor: Theme.surface,
    padding: 24,
    marginBottom: 16,
  },
  sharedSyncRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sharedSyncTitle: {
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "italic",
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
  },
  sharedGridLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  sharedGridValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  sharedGridValueMismatch: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.teslaRed,
  },
  sharedActions: { flexDirection: "row", gap: 12 },
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
  },
  inviteCard: {
    backgroundColor: Theme.surfaceGray,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: Theme.borderMedium,
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
    fontSize: 11,
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
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    paddingHorizontal: 40,
  },
  successCard: {
    backgroundColor: Theme.darkBackground,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: "center",
    minWidth: 160,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  successIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.darkGreen,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
