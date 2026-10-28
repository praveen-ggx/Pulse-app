import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import type {
  ProfileContract,
  ProfileWarehouse,
} from "@/components/CounterpartyProfileSystemCard";
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
import type { DriverRow } from "@/features/drivers";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import {
  resolveLedgerPartyName,
  type LedgerTripDetailsMap,
  type LedgerTripPartyMap,
} from "@/features/finance/components/ledger/buildFinancialRowDataForLedgerRow";
import { TreasuryDetailLayout } from "@/features/finance/components/TreasuryDetailLayout";
import { ledgerDayMatchesPeriod } from "@/features/finance/lib/filterLedgerByPeriod";
import {
  PARTY_TRIP_PAGE_SIZES,
  partyTripPageSlice,
  type PartyTripPageSize,
} from "@/features/finance/utils/partyTripPage.util";
import {
  buildClientPnLReport,
  buildClientReceivableReport,
  formatReportInr,
} from "@/features/finance/lib/entityDetailReports.util";
import {
    getTripSubcontracts,
    type TripSubcontractRow,
} from "@/features/finance/services/tripSubcontracts.service";
import { getProfileImageBatch } from "@/features/finance/services/finance.service";
import type { FinancePeriodFilter } from "@/features/finance/types";
import { allocateAmountsToLargestDueTrips } from "@/features/finance/utils/allocateToLargestDue";
import { averageScore } from "@/features/ratings";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { adjustedRevenue } from "@/features/trips/services/tripAdjustments";
import {
    getTripDisplayNumber,
    type TripRow,
} from "@/features/trips/services/trips.service";
import { isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import { queryClientPageBootstrap } from "@/features/clients/services/clientPageBootstrap.service";
import { useClientPageBootstrapQuery } from "@/features/clients/hooks/useClientPageBootstrapQuery";
import { useFinanceAlignedClientLedger } from "@/features/finance/hooks/useFinanceAlignedPartyTrips";
import { computeClientPaidSeed } from "@/features/clients/utils/clientPaidSeed.util";
import {
  ledgerClientTripRows,
  viewerOwnedClientTrips,
} from "@/features/clients/utils/viewerClientTrips.util";
import {
  emptyClientPagePartyState,
  shouldAcceptClientPageWrite,
} from "@/features/clients/utils/clientDetailIsolation.util";
import { formatCustomerLedgerFigure } from "@/features/finance/utils/customerLedgerContract.util";
import {
  clearInitialClientForDetail,
  getInitialClientForDetail,
} from "@/features/clients/initialClientForDetail";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { canAccessFinance } from "@/lib/capabilities";
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
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";

const LedgerReportModal = lazy(() =>
  import("@/features/finance/components/LedgerReportModal").then((m) => ({
    default: m.LedgerReportModal,
  })),
);
const LedgerTransactionListView = lazy(() =>
  import("@/features/finance/components/LedgerTransactionListView").then((m) => ({
    default: m.LedgerTransactionListView,
  })),
);
const CounterpartyProfileSystemCard = lazy(() =>
  import("@/components/CounterpartyProfileSystemCard").then((m) => ({
    default: m.CounterpartyProfileSystemCard,
  })),
);
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
import type { ClientContract } from "../services/clientContracts.service";
import {
    getLinkedOrgProfile,
    getLinkedOrgProfilesBatch,
    type ClientRow,
} from "../services/clients.service";
import type { ClientWarehouse } from "../services/clientWarehouses.service";

/** UUID-shaped strings are not valid human supplier names (avoid showing raw ids). */
function isUuidLikeString(value: string | null | undefined): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function normPartyKey(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase();
}

/** Bill-to vs carrier: avoid duplicating the client name in the Supplier column. */
function clientDetailSupplierColumnTitle(
  trip: TripRow,
  aggregateSupplier: string,
  billToClientName: string,
): { title: string; sameAsClient: boolean } {
  const cid = (trip.client_id ?? "").trim().toLowerCase();
  const sid = (trip.supplier_id ?? "").trim().toLowerCase();
  const sameIds = Boolean(cid && sid && cid === sid);
  const sameNames =
    normPartyKey(aggregateSupplier) === normPartyKey(billToClientName);
  if (sameIds || sameNames) {
    return { title: "Own operations", sameAsClient: true };
  }
  return { title: aggregateSupplier, sameAsClient: false };
}

const TRIP_TABLE_AVATAR = 24;

type PartnerOrgBranding = { avatarUrl?: string; avatarSeed?: string };

function supplierPartyAvatarProps(
  trip: TripRow,
  displayName: string,
  supplierById: Map<string, SupplierRow>,
  linkedOrgBySupplierOrgId: Record<
    string,
    { avatarUrl?: string; avatarSeed?: string }
  >,
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

/**
 * First paint: the list ClientRow seed stashed by FinanceScreen before
 * navigating here, if any. `get_client_detail_bundle` remains the
 * authoritative hydration source — never written into any query cache.
 */
function peekClientFirstPaint(clientId: string | null | undefined): ClientRow | null {
  if (!clientId) return null;
  return getInitialClientForDetail(clientId);
}

export interface ClientDetailScreenProps {
  clientId: string;
  onBack: () => void;
  autoOpenProfile?: boolean;
  initialDetailSubTab?: "trips" | "cash";
}

export default function ClientDetailScreen({
  clientId,
  onBack,
  autoOpenProfile,
  initialDetailSubTab,
}: ClientDetailScreenProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { currentOrganization, isLoading: orgLoading } = useOrganization();
  const queryClient = useQueryClient();
  const capabilities = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const canAddTransaction =
    canAccessFinance(capabilities) && canSurface("finance.add_transaction");
  const [client, setClient] = useState<ClientRow | null>(() =>
    peekClientFirstPaint(clientId),
  );
  const clientName = client?.name || client?.contact_person || t("client");
  const [trips, setTrips] = useState<TripRow[]>(() => {
    const seed = peekClientFirstPaint(clientId);
    const orgId = currentOrganization?.id;
    if (!seed || !orgId) return [];
    const catalog =
      queryClient.getQueryData<TripRow[]>(queryKeys.trips.finite(orgId)) ?? [];
    return viewerOwnedClientTrips(catalog, orgId, seed);
  });
  const [loading, setLoading] = useState(() => peekClientFirstPaint(clientId) == null);
  const bootstrapQuery = useClientPageBootstrapQuery(
    orgLoading ? null : currentOrganization?.id ?? null,
    clientId,
  );
  const cachedOrgTripCatalog = useMemo(() => {
    const orgId = currentOrganization?.id;
    if (!orgId) return [] as TripRow[];
    return queryClient.getQueryData<TripRow[]>(queryKeys.trips.finite(orgId)) ?? [];
  }, [currentOrganization?.id, queryClient, clientId, bootstrapQuery.dataUpdatedAt]);
  const financeAlignedCatalog =
    trips.length > 0 ? trips : cachedOrgTripCatalog;
  const financeAligned = useFinanceAlignedClientLedger(
    currentOrganization?.id ?? null,
    clientId,
    financeAlignedCatalog,
  );
  const financeAlignedReadyRef = useRef(false);
  financeAlignedReadyRef.current = financeAligned.ready;
  const tripIdsForFinanceAdj = useMemo(
    () => trips.map((t) => String(t.id)).filter(Boolean),
    [trips],
  );
  const { record: tripFinanceAdjRecord } = useTripFinanceAdjustmentsMap(
    currentOrganization?.id ?? null,
    tripIdsForFinanceAdj,
  );
  /** Supplier rows for resolving aggregate `supplier_id` → display name in trip table. */
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [tripSubcontractByTripId, setTripSubcontractByTripId] = useState<
    Record<string, TripSubcontractRow>
  >({});
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  /** Load-based partner org (trip.organization_id) → name from `get_connection_partner_display`. */
  const [partnerOrgNamesByOrgId, setPartnerOrgNamesByOrgId] = useState<
    Record<string, string>
  >({});
  /** Partner trip-owner org → avatar fields for aggregate / cross-org supplier column. */
  const [partnerOrgBrandingByOrgId, setPartnerOrgBrandingByOrgId] = useState<
    Record<string, PartnerOrgBranding>
  >({});
  const fetchedPartnerOrgIdsRef = useRef<Set<string>>(new Set());
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  /** Full org ledger for same-trip payment summary in Cash Flow expand (matches Finance Cash). */
  const [allOrgTransactions, setAllOrgTransactions] = useState<LedgerRow[]>([]);
  const [organizationClients, setOrganizationClients] = useState<ClientRow[]>(
    [],
  );
  /** Storage-resolved driver avatar URLs for Cash Flow (Finance Cash / LedgerTab parity). */
  const [cashFlowDriverProfileUrls, setCashFlowDriverProfileUrls] = useState<
    Record<string, string>
  >({});
  const [, setOrgTrips] = useState<TripRow[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [clientReportKind, setClientReportKind] = useState<"receivable" | "pnl" | "ledger">(
    "receivable",
  );
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const lastFocusRefreshRef = useRef<number>(0);
  const [showProfileModal, setShowProfileModal] = useState(false);
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
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  /** Full trip grid only on wide web; narrow web uses the compact column set (matches finance shared ledger). */
  const isWebDesktop = Platform.OS === "web" && windowWidth >= 1024;
  const openClientFullProfile = useCallback(() => {
    if (isWebDesktop) {
      router.push(ROUTES.clientProfile(clientId) as Parameters<typeof router.push>[0]);
      return;
    }
    setShowProfileModal(true);
  }, [clientId, isWebDesktop, router]);
  const webContentGutter =
    Platform.OS === "web"
      ? windowWidth >= 1600
        ? 10
        : windowWidth >= 1280
          ? 12
          : 16
      : Layout.screenPaddingHorizontal;
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [isInApp, setIsInApp] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [clientRatingAvg, setClientRatingAvg] = useState<number | null>(null);
  const [profileWarehouses, setProfileWarehouses] = useState<ClientWarehouse[]>(
    [],
  );
  const [profileContracts, setProfileContracts] = useState<ClientContract[]>(
    [],
  );
  const initialLoadDoneRef = useRef(false);
  /** Whether we currently have seed data to show while `load()` is in flight — first mount only, reset per `clientId`. */
  const hasSeedDataRef = useRef(peekClientFirstPaint(clientId) != null);
  /** Guards a resolving `load()` from writing state after the user has already switched to a different client. */
  const activeClientIdRef = useRef(clientId);
  const activeOrgIdRef = useRef(currentOrganization?.id ?? null);
  /** clientId of an in-flight `load()` call, or null — makes concurrent triggers (mount effect + focus effect) idempotent. */
  const loadInFlightRef = useRef<string | null>(null);
  const heroDecorProgress = useRef(new Animated.Value(0)).current;

  const mountRef = useRef(true);
  useEffect(() => {
    activeOrgIdRef.current = currentOrganization?.id ?? null;
  }, [currentOrganization?.id]);
  useEffect(() => {
    activeClientIdRef.current = clientId;
    activeOrgIdRef.current = currentOrganization?.id ?? null;
    if (mountRef.current) {
      mountRef.current = false;
      return;
    }
    setIsLinked(false);
    setClientRatingAvg(null);
    initialLoadDoneRef.current = false;
    setError(null);
    const cleared = emptyClientPagePartyState();
    setTrips(cleared.trips);
    setTransactions(cleared.transactions);
    setAllOrgTransactions(cleared.allOrgTransactions);
    setSuppliers(cleared.suppliers);
    setDrivers(cleared.drivers);
    setOrganizationClients(cleared.organizationClients);
    setTripSubcontractByTripId({});
    setPartnerOrgNamesByOrgId({});
    setPartnerOrgBrandingByOrgId({});
    const seed = peekClientFirstPaint(clientId);
    hasSeedDataRef.current = seed != null;
    setClient(seed);
    setLoading(seed == null);
  }, [clientId]);


  useEffect(() => {
    if (autoOpenProfile) openClientFullProfile();
  }, [autoOpenProfile, openClientFullProfile]);

  useEffect(() => {
    const phone = client?.phone?.trim();
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
  }, [client?.phone, currentOrganization?.id]);

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

    return () => {
      decorLoop.stop();
    };
  }, [heroDecorProgress, isWebDesktop]);

  const load = useCallback(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    if (orgLoading) {
      if (!hasSeedDataRef.current) setLoading(true);
      return;
    }
    if (!currentOrganization?.id) {
      setLoading(false);
      return;
    }
    // Idempotency guard: `useFocusEffect` and the org-readiness retry effect
    // below can both attempt to invoke `load()` for the same clientId in the
    // same tick (e.g. on mount, once org context is already available) —
    // without this, that's a literal duplicate Promise.all of every request.
    if (loadInFlightRef.current === clientId) return;
    loadInFlightRef.current = clientId;
    if (!isRefreshingRef.current && !initialLoadDoneRef.current && !hasSeedDataRef.current)
      setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;
    const requestClientId = clientId;

    const applyClientPage = (bundle: {
      client: ClientRow | null;
      ratings: { score?: number }[];
      warehouses: ClientWarehouse[];
      contracts: ProfileContract[];
      trips: TripRow[];
      transactions: LedgerRow[];
      suppliers: SupplierRow[];
      drivers: DriverRow[];
      clients: ClientRow[];
    }) => {
      if (
        !shouldAcceptClientPageWrite(
          { orgId: activeOrgIdRef.current, clientId: activeClientIdRef.current },
          { orgId, clientId: requestClientId },
        )
      ) {
        return;
      }
      setClient(bundle.client);
      setProfileWarehouses(bundle.warehouses ?? []);
      setProfileContracts(bundle.contracts ?? []);
      setOrgTrips(bundle.trips);
      setOrganizationClients(bundle.clients);
      setAllOrgTransactions(bundle.transactions);
      if (!financeAlignedReadyRef.current) {
        setTrips(viewerOwnedClientTrips(bundle.trips, orgId, bundle.client));
      }
      setSuppliers(bundle.suppliers);
      setDrivers(bundle.drivers);
      setClientRatingAvg(averageScore(bundle.ratings ?? []));
      setTransactions(bundle.transactions);
    };

    const finishLoad = () => {
      if (loadInFlightRef.current === requestClientId) loadInFlightRef.current = null;
      if (activeClientIdRef.current !== requestClientId) return;
      setLoading(false);
      initialLoadDoneRef.current = true;
      hasSeedDataRef.current = false;
      isRefreshingRef.current = false;
      setRefreshing(false);
      clearInitialClientForDetail(requestClientId);
    };

    const cached = queryClient.getQueryData<{
      client: ClientRow | null;
      ratings: { score?: number }[];
      warehouses: ClientWarehouse[];
      contracts: ProfileContract[];
      trips: TripRow[];
      transactions: LedgerRow[];
      suppliers: SupplierRow[];
      drivers: DriverRow[];
      clients: ClientRow[];
    }>(queryKeys.clients.pageBootstrap(orgId, requestClientId));
    if (cached?.client) {
      applyClientPage(cached);
      setLoading(false);
    }

    queryClient
      .fetchQuery({
        queryKey: queryKeys.clients.pageBootstrap(orgId, requestClientId),
        queryFn: () => queryClientPageBootstrap(orgId, requestClientId),
        staleTime: 60_000,
      })
      .then((bundle) => {
        if (
          !shouldAcceptClientPageWrite(
            { orgId: activeOrgIdRef.current, clientId: activeClientIdRef.current },
            { orgId, clientId: requestClientId },
          )
        ) {
          return;
        }
        if (bundle?.client) {
          applyClientPage(bundle);
          finishLoad();
          return;
        }
        setError("Client not found");
        finishLoad();
      })
      .catch((err: unknown) => {
        if (
          !shouldAcceptClientPageWrite(
            { orgId: activeOrgIdRef.current, clientId: activeClientIdRef.current },
            { orgId, clientId: requestClientId },
          )
        ) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load client data");
        finishLoad();
      });
  }, [clientId, currentOrganization?.id, orgLoading, queryClient]);

  useEffect(() => {
    const bundle = bootstrapQuery.data;
    const orgId = currentOrganization?.id;
    if (!bundle?.client || !orgId) return;
    if (
      !shouldAcceptClientPageWrite(
        { orgId: activeOrgIdRef.current, clientId: activeClientIdRef.current },
        { orgId, clientId },
      )
    ) {
      return;
    }
    setClient(bundle.client);
    setProfileWarehouses(bundle.warehouses ?? []);
    setProfileContracts(bundle.contracts ?? []);
    setOrgTrips(bundle.trips);
    setOrganizationClients(bundle.clients);
    setAllOrgTransactions(bundle.transactions);
    if (!financeAlignedReadyRef.current) {
      setTrips(viewerOwnedClientTrips(bundle.trips, orgId, bundle.client));
    }
    setSuppliers(bundle.suppliers);
    setDrivers(bundle.drivers);
    setClientRatingAvg(averageScore(bundle.ratings ?? []));
    setTransactions(bundle.transactions);
    setLoading(false);
    initialLoadDoneRef.current = true;
  }, [bootstrapQuery.data, clientId, currentOrganization?.id]);

  useEffect(() => {
    if (!financeAligned.ready || financeAligned.trips.length === 0) return;
    setTrips((prev) => {
      if (
        prev.length === financeAligned.trips.length &&
        prev.every((trip, index) => trip.id === financeAligned.trips[index]?.id)
      ) {
        return prev;
      }
      return financeAligned.trips;
    });
  }, [financeAligned.ready, financeAligned.trips]);

  useEffect(() => {
    fetchedPartnerOrgIdsRef.current = new Set();
    setPartnerOrgNamesByOrgId({});
    setPartnerOrgBrandingByOrgId({});
  }, [clientId]);

  const supplierDisplayById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) {
      const label = (s.name || s.company_name || s.contact_person || "").trim();
      if (!label) continue;
      m.set(String(s.id).trim().toLowerCase(), label);
    }
    return m;
  }, [suppliers]);

  const supplierById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of suppliers) {
      m.set(String(s.id).trim().toLowerCase(), s);
    }
    return m;
  }, [suppliers]);

  const driverById = useMemo(() => {
    const m = new Map<string, DriverRow>();
    for (const d of drivers) {
      m.set(String(d.id).trim().toLowerCase(), d);
    }
    return m;
  }, [drivers]);

  const linkedOrgDisplayMap = useLinkedOrgProfileMap(
    client ? [client] : [],
    suppliers,
  );

  /** Fetch signed driver avatar URLs for ledger rows (same as LedgerTab / Finance cash). */
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

  /** Supplier-typed ledger rows often carry the human supplier name when the trip row omits it. */
  const supplierPartyNameByTripId = useMemo(() => {
    const m = new Map<string, string>();
    for (const tx of transactions) {
      if (tx.contact_type !== "supplier") continue;
      const tid = (tx.trip_id ?? "").trim().toLowerCase();
      if (!tid) continue;
      const pn = (tx.party_name ?? "").trim();
      if (!pn || isUuidLikeString(pn)) continue;
      if (!m.has(tid)) m.set(tid, pn);
    }
    return m;
  }, [transactions]);

  useEffect(() => {
    if (!currentOrganization?.id) return;
    const myOrgId = currentOrganization.id;
    const toResolve = new Set<string>();
    for (const t of trips) {
      if (!t.organization_id || t.organization_id === myOrgId) continue;
      if (!isLoadBasedTrip(t)) continue;
      const raw = (t.supplier_name ?? "").trim();
      if (raw && !isUuidLikeString(raw)) continue;
      const sid = (t.supplier_id ?? "").trim().toLowerCase();
      if (sid && supplierDisplayById.has(sid)) continue;
      if (!fetchedPartnerOrgIdsRef.current.has(t.organization_id)) {
        toResolve.add(t.organization_id);
      }
    }
    if (toResolve.size === 0) return;
    let cancelled = false;
    void (async () => {
      const updates: Record<string, string> = {};
      const branding: Record<string, PartnerOrgBranding> = {};
      const orgIds = Array.from(toResolve);
      orgIds.forEach((oid) => fetchedPartnerOrgIdsRef.current.add(oid));
      // Batch: one RPC for all linked orgs instead of one per org (was an N+1).
      const profiles = await getLinkedOrgProfilesBatch(orgIds);
      if (cancelled) return;
      for (const oid of orgIds) {
        const profile = profiles[oid];
        const name = profile?.organizationName?.trim();
        if (name) updates[oid] = name;
        if (profile) {
          branding[oid] = {
            avatarUrl: (profile.avatarUrl ?? "").trim() || undefined,
            avatarSeed: (profile.avatarSeed ?? "").trim() || undefined,
          };
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setPartnerOrgNamesByOrgId((prev) => ({ ...prev, ...updates }));
      }
      if (!cancelled && Object.keys(branding).length > 0) {
        setPartnerOrgBrandingByOrgId((prev) => ({ ...prev, ...branding }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trips, supplierDisplayById, currentOrganization?.id]);

  const aggregateSupplierLabel = useCallback(
    (trip: TripRow): string => {
      const raw = (trip.supplier_name ?? "").trim();
      if (raw && !isUuidLikeString(raw)) return raw;
      const sid = (trip.supplier_id ?? "").trim().toLowerCase();
      if (sid) {
        const fromRow = supplierDisplayById.get(sid);
        if (fromRow) return fromRow;
      }
      const tid = String(trip.id).trim().toLowerCase();
      const fromLedger = supplierPartyNameByTripId.get(tid);
      if (fromLedger) return fromLedger;
      const oid = trip.organization_id;
      if (
        oid &&
        currentOrganization?.id &&
        oid !== currentOrganization.id &&
        isLoadBasedTrip(trip) &&
        partnerOrgNamesByOrgId[oid]
      ) {
        return partnerOrgNamesByOrgId[oid];
      }
      if (
        client?.linked_organization_id &&
        isLoadBasedTrip(trip) &&
        trip.organization_id === client.linked_organization_id
      ) {
        return (
          partnerOrgNamesByOrgId[client.linked_organization_id] ||
          (client.name ?? "").trim() ||
          (client.contact_person ?? "").trim() ||
          "Aggregate Supplier"
        );
      }
      return "Aggregate Supplier";
    },
    [
      client?.contact_person,
      client?.is_integrated,
      client?.linked_organization_id,
      client?.name,
      supplierDisplayById,
      supplierPartyNameByTripId,
      partnerOrgNamesByOrgId,
      currentOrganization?.id,
    ],
  );

  useEffect(() => {
    if (!currentOrganization?.id) {
      setTripSubcontractByTripId({});
      return;
    }
    const tripIds = trips.map((t) => t.id).filter(Boolean);
    if (tripIds.length === 0) {
      setTripSubcontractByTripId({});
      return;
    }
    let cancelled = false;
    void getTripSubcontracts({
      viewerOrgId: currentOrganization.id,
      tripIds,
    }).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setTripSubcontractByTripId({});
        return;
      }
      const next: Record<string, TripSubcontractRow> = {};
      for (const row of res.rows ?? []) {
        if (!row?.trip_id) continue;
        next[String(row.trip_id)] = row;
      }
      setTripSubcontractByTripId(next);
    });
    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id, trips]);

  /**
   * Freight cost for client mission table / exports. When the Supplier column resolves to
   * "Own operations" (bill-to equals carrier / self-carriage), do not use `supplier_rate`
   * as cost — it often mirrors sale on integrated rows; asset-style cost is subcontract,
   * captured non-supplier outflows, or 0.
   */
  const getTripCostForClientView = useCallback(
    (
      trip: TripRow,
      expenseCaptured: number,
      billToClientName: string,
    ): number => {
      const subcontract = tripSubcontractByTripId[trip.id];
      if (subcontract && Number(subcontract.rate ?? 0) > 0) {
        return Number(subcontract.rate ?? 0);
      }
      const hasSupplierRef =
        !!trip.supplier_id ||
        (!!trip.supplier_name && !isUuidLikeString(trip.supplier_name));
      const isAggregateTrip = hasSupplierRef || isLoadBasedTrip(trip);
      const supplierColumnBase = isAggregateTrip
        ? aggregateSupplierLabel(trip)
        : "Asset / Own Vehicle";
      if (
        clientDetailSupplierColumnTitle(
          trip,
          supplierColumnBase,
          billToClientName,
        ).sameAsClient
      ) {
        return expenseCaptured > 0 ? expenseCaptured : 0;
      }
      const supplierRate = Number(trip.supplier_rate ?? 0);
      return supplierRate > 0 ? supplierRate : expenseCaptured;
    },
    [tripSubcontractByTripId, aggregateSupplierLabel],
  );

  const resolveSupplierDisplayForClientTrip = useCallback(
    (
      trip: TripRow,
      billToClientName: string,
    ): { title: string; sameAsClient: boolean } => {
      const subcontract = tripSubcontractByTripId[trip.id];
      if (subcontract?.supplier_id) {
        const sid = String(subcontract.supplier_id).trim().toLowerCase();
        const subcontractSupplierName =
          (supplierDisplayById.get(sid) ?? "").trim() ||
          (
            supplierById.get(sid)?.name ??
            supplierById.get(sid)?.company_name ??
            supplierById.get(sid)?.contact_person ??
            ""
          ).trim();
        if (subcontractSupplierName) {
          // For integrated aggregate trips, prefer explicit sub-supplier identity.
          return { title: subcontractSupplierName, sameAsClient: false };
        }
      }
      const hasSupplierRef =
        !!trip.supplier_id ||
        (!!trip.supplier_name && !isUuidLikeString(trip.supplier_name));
      const isAggregateTrip = hasSupplierRef || isLoadBasedTrip(trip);
      const supplierName = isAggregateTrip
        ? aggregateSupplierLabel(trip)
        : "Asset / Own Vehicle";
      return clientDetailSupplierColumnTitle(
        trip,
        supplierName,
        billToClientName,
      );
    },
    [
      aggregateSupplierLabel,
      supplierById,
      supplierDisplayById,
      tripSubcontractByTripId,
    ],
  );

  // Both effects below can independently invoke load() for the same mount
  // (e.g. org context already ready at mount fires both; SupplierDetailScreen/
  // DriverDetailScreen/VehicleDetailScreen share this exact shape, the latter
  // two with a matching "org context may not be ready on cold Netlify load"
  // comment — that race is real, so neither trigger is removed here. Instead
  // `load()` itself is idempotent per clientId via `loadInFlightRef`, so a
  // simultaneous double-trigger costs nothing extra on the network.
  useFocusEffect(
    useCallback(() => {
      if (initialLoadDoneRef.current && Date.now() - lastFocusRefreshRef.current < 5 * 60_000) return;
      lastFocusRefreshRef.current = Date.now();
      load();
    }, [load]),
  );
  useEffect(() => {
    if (!currentOrganization?.id || initialLoadDoneRef.current) return;
    load();
  }, [currentOrganization?.id, load]);

  const profileWarehousesForCard = useMemo<ProfileWarehouse[]>(
    () =>
      profileWarehouses.map((w) => ({
        id: w.id,
        name: w.name,
        address: [w.address, w.city, w.state].filter(Boolean).join(", ") || "—",
        gstNumber: w.local_gstin,
        contactPerson: w.contact_name,
        phone: w.contact_phone,
      })),
    [profileWarehouses],
  );

  const profileContractsForCard = useMemo<ProfileContract[]>(
    () =>
      profileContracts.map((c) => {
        const whId = c.warehouse_id ?? null;
        const whName =
          whId
            ? profileWarehouses.find((w) => w.id === whId)?.name ?? null
            : null;
        return {
          id: c.id,
          pickup: c.pickup_area,
          destination: c.drop_location,
          price: Number(c.rate ?? 0),
          pricingType: c.rate_type === "per_ton" ? "per_ton" : "per_trip",
          warehouseId: whId,
          warehouseName: whName,
          notes: c.notes,
        };
      }),
    [profileContracts, profileWarehouses],
  );

  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!client?.linked_organization_id) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      const { profile } = await getLinkedOrgProfile(
        client.linked_organization_id,
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
  }, [client?.linked_organization_id]);

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

  /** Trip details map for Cash Flow list (same shape as Finance Cash page — includes vehicle + rates for expanded card). */
  const clientTripDetailsMap = useMemo(() => {
    const m: LedgerTripDetailsMap = {};
    trips.forEach((t) => {
      const supId = String(t.supplier_id ?? "").trim();
      const supRow = supId
        ? suppliers.find((s) => String(s.id).trim() === supId)
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
  }, [trips, suppliers]);

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
    () => new Map(organizationClients.map((c) => [c.id, c])),
    [organizationClients],
  );

  const supplierByIdForLedger = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );

  const driverByIdForCashExpand = useMemo(
    () => new Map(drivers.map((d) => [d.id, d])),
    [drivers],
  );

  const cashFlowTransactionRows = useMemo(() => {
    const partyParams = {
      clientById: clientByIdForLedger,
      supplierById: supplierByIdForLedger,
      tripPartyMap: tripPartyMapForCash,
      tripDetailsMap: clientTripDetailsMap,
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
    clientTripDetailsMap,
  ]);

  const triggerSuccess = useCallback((title = "NODE_SYNCED") => {
    setSuccessTitle(title);
    setShowSuccess(true);
    const t = setTimeout(() => setShowSuccess(false), 1500);
    return () => clearTimeout(t);
  }, []);

  const handleSendInvitation = useCallback(async () => {
    if (!currentOrganization?.id || !client?.phone) return;
    setSendingInvitation(true);
    try {
      const { createConnectionRequest, getConnectionInviteeByPhone } =
        await import("@/features/connections/services/connectionRequests.service");
      const { invitee, error: lookupError } = await getConnectionInviteeByPhone(
        client.phone,
        currentOrganization.id,
      );
      if (lookupError) {
        Alert.alert("Unable to send invitation", lookupError.message);
        return;
      }
      if (!invitee?.organization_id) {
        Alert.alert(
          "Unable to send invitation",
          "This client is not available in the application yet.",
        );
        return;
      }
      const { error, alreadyInvited } = await createConnectionRequest(
        currentOrganization.id,
        invitee.organization_id,
        {
          requestShipperClient: true,
          requestCarrierSupplier: false,
        },
      );
      if (error) {
        Alert.alert("Unable to send invitation", error.message);
        return;
      }
      setIsLinked(true);
      triggerSuccess(
        alreadyInvited ? "INVITATION_ALREADY_SENT" : "CONNECTION_REQUESTED",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again.";
      Alert.alert("Unable to send invitation", message);
    } finally {
      setSendingInvitation(false);
    }
  }, [currentOrganization?.id, client?.phone, triggerSuccess]);

  const handleInviteToApp = useCallback(() => {
    const message = `Join me on Pulse to sync our ledger and compare books with ${clientName}. Download Pulse to get started.`;
    Share.share({ message, title: "Invite to Pulse" });
  }, [clientName]);

  // TRANSACTION LEDGER — Aggressive consolidation & tally, O(n). Must run before any early return (Rules of Hooks).
  const {
    totalBilledConsolidated: _totalBilledConsolidated,
    totalPendingConsolidated: _totalPendingConsolidated,
    tripIdToDue,
    paidByTripId,
  } = useMemo(() => {
    const norm = (id: string | null | undefined) =>
      id == null ? "" : String(id).trim().toLowerCase();
    const linkedTripIds = new Set(trips.map((t) => norm(t.id)));
    const paidByTripId: Record<string, number> = {};
    const outByTripId: Record<string, number> = {};
    const isClientLinked = (tx: LedgerRow) =>
      tx.contact_type === "client" &&
      tx.contact_id != null &&
      tx.contact_id === clientId;

    const tripByNormId: Record<string, TripRow> = {};
    // Pass 1a: Init paid/out from trip.amount_paid; attribute tx with trip_id to that trip.
    for (const t of trips) {
      const key = norm(t.id);
      tripByNormId[key] = t;
      paidByTripId[key] = computeClientPaidSeed({
        trip: t,
        hasLinkedClientTx: false,
      });
      outByTripId[key] = 0;
    }
    const linkedTxIds = new Set<string>();
    const manualTripSeedCleared = new Set<string>();
    const unlinkedClientTx: typeof transactions = [];
    for (const tx of transactions) {
      const txTripKey =
        norm(tx.trip_id) && linkedTripIds.has(norm(tx.trip_id))
          ? norm(tx.trip_id)
          : undefined;
      if (txTripKey !== undefined && isClientLinked(tx)) {
        // amount_paid is ledger-synced for every trip source (trg_sync_trip_payment_status).
        // If a linked client tx is present, reset the seeded amount_paid once to avoid double counting.
        const trip = tripByNormId[txTripKey];
        if (trip && !manualTripSeedCleared.has(txTripKey)) {
          const nextSeed = computeClientPaidSeed({
            trip,
            hasLinkedClientTx: true,
          });
          paidByTripId[txTripKey] = nextSeed;
          manualTripSeedCleared.add(txTripKey);
        }
        paidByTripId[txTripKey] =
          (paidByTripId[txTripKey] ?? 0) + Number(tx.amount_in ?? 0);
        outByTripId[txTripKey] =
          (outByTripId[txTripKey] ?? 0) + Number(tx.amount_out ?? 0);
        linkedTxIds.add(tx.id);
      } else if (txTripKey !== undefined) {
        linkedTxIds.add(tx.id);
      } else if (isClientLinked(tx)) {
        unlinkedClientTx.push(tx);
      }
    }
    // Pass 1b: Attribute unlinked client payments to the trip with the largest due (so payment applies to the trip that needs it most).
    // For client receivables, only amount_in (receipts) counts as paid; we do not add amount_out here.
    const linkedOrgIdForAdj = client?.linked_organization_id ?? null;
    const allocatedPaidByTripId = allocateAmountsToLargestDueTrips(
      trips.map((t) => {
        const key = norm(t.id);
        const isIntegratedShipperClient =
          linkedOrgIdForAdj != null &&
          isLoadBasedTrip(t) &&
          t.organization_id != null &&
          t.organization_id === linkedOrgIdForAdj;
        const base = isIntegratedShipperClient
          ? Number(t.supplier_rate ?? 0)
          : Number(t.client_price ?? 0);
        const adj = tripFinanceAdjRecord[key] ?? [];
        const sales = adjustedRevenue(base, adj);
        return {
          tripId: key,
          sales,
          paid: paidByTripId[key] ?? 0,
        };
      }),
      unlinkedClientTx.map((tx) => Number(tx.amount_in ?? 0)),
    );
    if (trips.length > 0) {
      for (const tx of unlinkedClientTx) {
        linkedTxIds.add(tx.id);
      }
    }

    const tripIdToDue: Record<string, number> = {};
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

    // Pass 2: For client, paid = only amount_in (receipts from client). Do NOT subtract trip expenses (amount_out);
    // expenses are our costs, not the customer's payments — so they must not inflate "due".
    const linkedOrgId = client?.linked_organization_id ?? null;
    for (const t of trips) {
      const key = norm(t.id);
      const isIntegratedShipperClient =
        linkedOrgId != null &&
        isLoadBasedTrip(t) &&
        t.organization_id != null &&
        t.organization_id === linkedOrgId;
      const base = isIntegratedShipperClient
        ? Number(t.supplier_rate ?? 0)
        : Number(t.client_price ?? 0);
      const adj = tripFinanceAdjRecord[key] ?? [];
      const sales = adjustedRevenue(base, adj);
      const paid = allocatedPaidByTripId[key] ?? 0;
      const due = Math.max(0, sales - paid);
      tripIdToDue[t.id] = due;

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

    // Pass 3: Unlinked = transactions not attributed to any trip. For client, only show receipts (amount_in) as ADJ;
    // do not show expense-only entries (amount_out) as "due" — those are our costs, not customer balance.
    const unlinkedTx = transactions.filter((tx) => !linkedTxIds.has(tx.id));
    for (const tx of unlinkedTx) {
      const amountIn = Number(tx.amount_in ?? 0);
      if (amountIn > 0) {
        finalRows.push({
          id: `adj-${tx.id}`,
          missionId: "ADJ",
          dest:
            tx.description && tx.description !== "ENTRY"
              ? tx.description
              : "GENERAL",
          sales: amountIn,
          paid: amountIn,
          due: 0,
        });
      }
    }

    // Pass 4: Final Totals from consolidated data
    const totalSales = finalRows.reduce(
      (s, r) => s + (r.missionId !== "ADJ" ? r.sales : 0),
      0,
    );
    const totalPending = finalRows.reduce((s, r) => s + r.due, 0);

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

    return {
      rows: finalRows,
      totalBilledConsolidated: totalSales,
      totalPendingConsolidated: totalPending,
      tripIdToDue,
      paidByTripId: allocatedPaidByTripId,
    };
  }, [trips, transactions, clientId, client, tripFinanceAdjRecord]);

  const tripDateOpts = useMemo(
    () => ({ customFrom: tripCustomFrom, customTo: tripCustomTo }),
    [tripCustomFrom, tripCustomTo],
  );
  const tripsForMissionTable = useMemo(() => {
    const orgId = currentOrganization?.id ?? "";
    const owned =
      client && orgId ? viewerOwnedClientTrips(trips, orgId, client) : trips;
    const source = financeAligned.ready
      ? ledgerClientTripRows(owned, financeAligned.trips, financeAligned.tripIds)
      : owned;
    return source.filter((t) =>
      ledgerDayMatchesPeriod(tripDayIso(t), tripDatePeriod, tripDateOpts),
    );
  }, [
    client,
    currentOrganization?.id,
    financeAligned.ready,
    financeAligned.trips,
    financeAligned.tripIds,
    trips,
    tripDatePeriod,
    tripDateOpts,
  ]);

  const missionRows = useMemo(() => {
    const norm = (id: string | null | undefined) =>
      id == null ? "" : String(id).trim().toLowerCase();
    const linkedOrgId = client?.linked_organization_id ?? null;
    return tripsForMissionTable.map((t) => {
      const key = norm(t.id);
      const isIntegratedShipperClient =
        linkedOrgId != null &&
        isLoadBasedTrip(t) &&
        t.organization_id != null &&
        t.organization_id === linkedOrgId;
      const base = isIntegratedShipperClient
        ? Number(t.supplier_rate ?? 0)
        : Number(t.client_price ?? 0);
      const adj = tripFinanceAdjRecord[key] ?? [];
      const sales = financeAligned.ready
        ? (financeAligned.salesByTripId[t.id] ?? adjustedRevenue(base, adj))
        : adjustedRevenue(base, adj);
      const paid = financeAligned.ready
        ? (financeAligned.paidByTripId[t.id] ?? 0)
        : (paidByTripId[key] ?? 0);
      const due = financeAligned.ready
        ? Math.max(0, sales - paid)
        : (tripIdToDue[t.id] ?? 0);
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
  }, [
    tripsForMissionTable,
    paidByTripId,
    tripIdToDue,
    client?.linked_organization_id,
    client?.is_integrated,
    tripFinanceAdjRecord,
    financeAligned.ready,
    financeAligned.salesByTripId,
    financeAligned.paidByTripId,
  ]);

  const tripSelectionDue = useMemo(
    () => missionRows.reduce((sum, row) => sum + row.due, 0),
    [missionRows],
  );
  const tripPageView = useMemo(
    () => partyTripPageSlice(missionRows, tripPage, tripPageSize),
    [missionRows, tripPage, tripPageSize],
  );

  useEffect(() => {
    setTripPage(0);
  }, [clientId, tripDatePeriod, tripCustomFrom, tripCustomTo, tripPageSize]);

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
  const tripExpenseById = useMemo(() => {
    const byTrip: Record<string, number> = {};
    for (const tx of transactions) {
      if (!tx.trip_id) continue;
      const key = String(tx.trip_id).trim().toLowerCase();
      if (!key) continue;
      const out = Number(tx.amount_out ?? 0);
      if (out <= 0) continue;
      // For client table cost context, keep non-supplier outflows as captured trip expenses.
      if (tx.contact_type === "supplier") continue;
      byTrip[key] = (byTrip[key] ?? 0) + out;
    }
    return byTrip;
  }, [transactions]);

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
          party_name: client?.name || client?.contact_person || t("client"),
          description:
            `${row.route} • Sales ${formatINR(row.sales)}`.trim() || "—",
          amount_in: row.paid,
          amount_out: row.due,
          transaction_date: row.trip.pickup_date ?? row.trip.created_at ?? "",
          created_at: row.trip.created_at ?? "",
          contact_id: clientId,
          contact_type: "client" as const,
        })),
    [
      client?.contact_person,
      client?.name,
      clientId,
      currentOrganization?.id,
      missionRows,
      t,
    ],
  );

  const reportTransactions = useMemo(
    () => (detailSubTab === "trips" ? tripReportTransactions : sortedTx),
    [detailSubTab, sortedTx, tripReportTransactions],
  );
  const clientTripReportRows = useMemo(() => {
    if (detailSubTab !== "trips") return [];
    const billTo = client?.name || client?.contact_person || t("client");
    return missionRows.map((row) => {
      const key = String(row.trip.id).trim().toLowerCase();
      const meta = tripTransactionMetaById[key] ?? {
        count: 0,
        lastTxnDate: null,
      };
      const expenseCaptured = tripExpenseById[key] ?? 0;
      const hasSupplierRef =
        !!row.trip.supplier_id ||
        (!!row.trip.supplier_name && !isUuidLikeString(row.trip.supplier_name));
      const isAggregateTrip = hasSupplierRef || isLoadBasedTrip(row.trip);
      const { title: supplierForReport } = resolveSupplierDisplayForClientTrip(
        row.trip,
        billTo,
      );
      const cost = getTripCostForClientView(row.trip, expenseCaptured, billTo);
      const pnl = row.sales - cost;
      const margin =
        row.sales > 0 ? `${((pnl / row.sales) * 100).toFixed(1)}%` : "0.0%";
      return {
        trip: row.missionId,
        tripDate: formatTripTableDate(
          row.trip.pickup_date ?? row.trip.created_at,
        ),
        route: row.route,
        model: isAggregateTrip ? "Aggregate" : "Asset",
        supplier: supplierForReport,
        sales: formatReportInr(row.sales),
        cost: formatReportInr(cost),
        pnl: formatReportInr(pnl),
        margin,
        received: formatReportInr(row.paid),
        due: formatReportInr(row.due),
        txns: meta.count,
        lastTxn: meta.lastTxnDate ? formatLedgerDate(meta.lastTxnDate) : "—",
      };
    });
  }, [
    client?.contact_person,
    client?.name,
    detailSubTab,
    missionRows,
    resolveSupplierDisplayForClientTrip,
    t,
    tripTransactionMetaById,
    tripExpenseById,
    getTripCostForClientView,
  ]);

  const clientReceivableReport = useMemo(
    () =>
      detailSubTab === "trips"
        ? buildClientReceivableReport(
            clientTripReportRows.map((row) => ({
              trip: row.trip,
              tripDate: row.tripDate,
              route: row.route,
              sales: row.sales,
              received: row.received,
              due: row.due,
              txns: row.txns,
              lastTxn: row.lastTxn,
            })),
          )
        : undefined,
    [clientTripReportRows, detailSubTab],
  );

  const clientPnLReport = useMemo(
    () =>
      detailSubTab === "trips" ? buildClientPnLReport(clientTripReportRows) : undefined,
    [clientTripReportRows, detailSubTab],
  );

  const clientPnLTotalInr = useMemo(() => {
    if (detailSubTab !== "trips") return 0;
    const billTo = client?.name || client?.contact_person || t("client");
    return missionRows.reduce((sum, row) => {
      const key = String(row.trip.id).trim().toLowerCase();
      const expenseCaptured = tripExpenseById[key] ?? 0;
      const cost = getTripCostForClientView(row.trip, expenseCaptured, billTo);
      return sum + (row.sales - cost);
    }, 0);
  }, [
    client?.contact_person,
    client?.name,
    detailSubTab,
    getTripCostForClientView,
    missionRows,
    t,
    tripExpenseById,
  ]);

  const clientCollectionPct = useMemo(() => {
    const billed = missionRows.reduce((s, r) => s + r.sales, 0);
    const received = missionRows.reduce((s, r) => s + r.paid, 0);
    return billed > 0 ? Math.min(100, Math.round((received / billed) * 100)) : 0;
  }, [missionRows]);

  const openClientReport = useCallback((kind: "receivable" | "pnl" | "ledger") => {
    if (!canSurface("finance.reports")) return;
    setClientReportKind(kind);
    setShowReportModal(true);
  }, [canSurface]);

  const handleClientDownloadPress = useCallback(() => {
    if (detailSubTab === "trips") {
      pickEntityReport(
        "Client report",
        [
          { id: "receivable", label: "Receivable statement" },
          { id: "pnl", label: "P&L performance" },
          { id: "ledger", label: "Ledger transactions" },
        ],
        (id) =>
          openClientReport(
            id === "pnl" ? "pnl" : id === "ledger" ? "ledger" : "receivable",
          ),
      );
      return;
    }
    openClientReport("ledger");
  }, [detailSubTab, openClientReport]);

  const activeClientCustomReport = useMemo(() => {
    if (detailSubTab !== "trips") return undefined;
    if (clientReportKind === "pnl") return clientPnLReport;
    if (clientReportKind === "receivable") return clientReceivableReport;
    return undefined;
  }, [
    clientPnLReport,
    clientReceivableReport,
    clientReportKind,
    detailSubTab,
  ]);

  if (loading && !client) {
    return (
      <CenteredLoadingView
        message={t("loadingClient")}
        color={Theme.loaderAccent}
      />
    );
  }

  if (error || !client) {
    return (
      <TreasuryDetailLayout title={t("client")} onBack={onBack}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error || t("clientNotFound")}</Text>
        </View>
      </TreasuryDetailLayout>
    );
  }

  const sales = financeAligned.ready ? financeAligned.billed : undefined;
  const paid = financeAligned.ready ? financeAligned.received : undefined;
  const due = financeAligned.ready ? financeAligned.pending : undefined;
  const tripsHandled = financeAligned.ready
    ? financeAligned.tripCount
    : undefined;
  const detailLedgerState = financeAligned.loadState;
  const isIntegrated = Boolean(
    client.is_integrated || client.linked_organization_id,
  );
  const isInAppNotIntegrated = !isIntegrated && isInApp;
  const isNotInApp = !isIntegrated && !isInApp;
  const clientRating = clientRatingAvg ?? null;
  const ratingFilledStars =
    clientRating != null
      ? Math.max(0, Math.min(5, Math.round(clientRating)))
      : 0;
  const statusTitle = isIntegrated
    ? "Integrated"
    : isInAppNotIntegrated
      ? "In App - Not Integrated"
      : "Not in app";
  const canSendRequest = isInAppNotIntegrated && !isLinked;
  const canInviteToApp = isNotInApp;
  const profileActionLabel = canSendRequest
    ? "Send invitation"
    : canInviteToApp
      ? "Invite to app"
      : isLinked
        ? "Invitation sent"
        : "Integrated";
  const tabConfig = [
    { id: "trips" as const, label: "Trips" },
    { id: "cash" as const, label: "Cash Flow" },
  ];
  const heroDecorAnimatedStyle = isWebDesktop
    ? {
        opacity: heroDecorProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.1, 0.2],
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
          {
            scale: heroDecorProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.04],
            }),
          },
        ],
      }
    : undefined;
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      {/* Header */}
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
            {clientName}
          </Text>
          <Text style={styles.headerSubtitle}>DEEP ENTITY INTEL</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => router.push(ROUTES.clientAnalytics(clientId) as never)}
            activeOpacity={0.8}
            accessibilityLabel="Open client analytics"
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
              onPress={() => router.push(`/public-profile/client/${clientId}`)}
              activeOpacity={0.8}
              accessibilityLabel="Open client profile"
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
            onPress={handleClientDownloadPress}
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
        {detailLedgerState === "error" ? (
          <View style={styles.ledgerErrorRow}>
            <Text style={styles.ledgerErrorText}>
              Customer ledger is unavailable. Amounts are not confirmed.
            </Text>
            <Pressable
              onPress={() => {
                void financeAligned.refetch();
              }}
              style={styles.ledgerRetryBtn}
            >
              <Text style={styles.ledgerRetryText}>Retry ledger</Text>
            </Pressable>
          </View>
        ) : null}
        {/* Scorecard — same metrics row as Trips / Cash Flow (above tab content). */}
        <View style={isWebDesktop ? styles.heroCardsRow : undefined}>
          <LinearGradient
            colors={[Theme.financeCardBlueFrom, Theme.financeCardBlueTo]}
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
                  name="building"
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
                <Text style={styles.scorecardSalesLabel}>TOTAL SALES</Text>
                <Text
                  style={[
                    styles.scorecardAmount,
                    isWebDesktop && styles.scorecardAmountWebDesktop,
                  ]}
                >
                  {formatCustomerLedgerFigure(sales, detailLedgerState)}
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
                <Text style={styles.scorecardGridLabelPaid}>RECEIVED</Text>
                <Text
                  style={[
                    styles.scorecardGridPaid,
                    isWebDesktop && styles.scorecardGridPaidWebDesktop,
                  ]}
                >
                  {formatCustomerLedgerFigure(paid, detailLedgerState)}
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
                  {formatCustomerLedgerFigure(due, detailLedgerState)}
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
                      {detailLedgerState === "success" ? tripsHandled : "—"}
                    </Text>
                  </View>
                  <View style={styles.profilePreviewRatingRow}>
                    <View style={styles.profilePreviewStars}>
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <FontAwesome
                          key={`client-star-header-${idx}`}
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
                        {clientRating != null ? clientRating.toFixed(1) : "—"}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.profilePreviewTopAction}
                  onPress={openClientFullProfile}
                  activeOpacity={0.85}
                  accessibilityLabel="Open client full profile"
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
                onPress={openClientFullProfile}
                activeOpacity={0.85}
                accessibilityLabel="Open client full profile"
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
                  {clientName}
                </Text>
                <Text style={ecc.dossierSub} numberOfLines={1}>
                  {(client.contact_person ?? "No contact").trim() ||
                    "No contact"}
                </Text>
                <View style={ecc.dossierBadgeRow}>
                  <View style={[ecc.dossierBadge, ecc.dossierBadgeBlue]}>
                    <Text style={ecc.dossierBadgeText}>CLIENT</Text>
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
                      {(client.email ?? "").trim() || "Not available"}
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
                      {(client.phone ?? "").trim() || "Not available"}
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

        {/* Tab switcher */}
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
                id: "pnl",
                label: "Trip P&L",
                value: formatINR(clientPnLTotalInr),
                tone: clientPnLTotalInr >= 0 ? "good" : "bad",
                hint: "View P&L report",
                onPress: () => openClientReport("pnl"),
              },
              {
                id: "receivable",
                label: "Receivable due",
                value: formatINR(tripSelectionDue),
                tone: tripSelectionDue > 0 ? "warn" : "good",
                hint: "View receivable report",
                onPress: () => openClientReport("receivable"),
              },
              {
                id: "collection",
                label: "Collection rate",
                value: `${clientCollectionPct}%`,
                tone:
                  clientCollectionPct >= 80
                    ? "good"
                    : clientCollectionPct >= 50
                      ? "warn"
                      : "bad",
                hint: "Received vs billed",
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

        {/* Tab: Trips — Sales, Received, Due; tap row to open trip detail */}
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
                    Supplier
                  </Text>
                </View>
              ) : null}
              {isWebDesktop ? (
                <View style={styles.driverColWebDesktop}>
                  <Text style={[styles.th, styles.thWebDesktop]} numberOfLines={1}>
                    Driver
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
                  Sales
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
                    Cost
                  </Text>
                </View>
              ) : null}
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
                    P&L
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
                  Received
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
                      styles.thRight,
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
                  onPress={() => {
                    const q = new URLSearchParams();
                    q.set("entryContext", "client");
                    q.set("clientIdFromContext", client.id);
                    q.set("clientNameFromContext", clientName);
                    router.push(`/trip/${row.trip.id}?${q.toString()}`);
                  }}
                >
                  {(() => {
                    const meta = tripTransactionMetaById[
                      String(row.trip.id).trim().toLowerCase()
                    ] ?? {
                      count: 0,
                      lastTxnDate: null,
                    };
                    const {
                      title: supplierColumnTitle,
                      sameAsClient: supplierColumnSameAsClient,
                    } = resolveSupplierDisplayForClientTrip(
                      row.trip,
                      clientName,
                    );
                    const expenseCaptured =
                      tripExpenseById[
                        String(row.trip.id).trim().toLowerCase()
                      ] ?? 0;
                    const tripCost = getTripCostForClientView(
                      row.trip,
                      expenseCaptured,
                      clientName,
                    );
                    const tripPnl = row.sales - tripCost;
                    const marginPct =
                      row.sales > 0 ? (tripPnl / row.sales) * 100 : 0;
                    const hasSupplierRef =
                      !!row.trip.supplier_id ||
                      (!!row.trip.supplier_name &&
                        !isUuidLikeString(row.trip.supplier_name));
                    const isAggregateTrip =
                      hasSupplierRef || isLoadBasedTrip(row.trip);
                    const tripDateIso =
                      row.trip.pickup_date ?? row.trip.created_at;
                    const supplierAv = supplierPartyAvatarProps(
                      row.trip,
                      supplierColumnTitle,
                      supplierById,
                      linkedOrgDisplayMap,
                      partnerOrgBrandingByOrgId,
                    );
                    const driverIdKey = (row.trip.driver_id ?? "")
                      .trim()
                      .toLowerCase();
                    const driverRow = driverIdKey
                      ? driverById.get(driverIdKey)
                      : undefined;
                    const rawDriverName =
                      (row.trip.driver_display_name ?? "").trim() ||
                      (driverRow?.name ?? "").trim();
                    const driverName =
                      !rawDriverName || /^driver$/i.test(rawDriverName)
                        ? "—"
                        : rawDriverName;
                    return (
                      <>
                        <View
                          style={[
                            styles.tdMission,
                            isWebDesktop && styles.tdTripColWebDesktop,
                          ]}
                        >
                          <View style={styles.tdMissionIdRow}>
                            <Text
                              style={[
                                styles.tdMissionId,
                                styles.tdMissionIdFlex,
                                isWebDesktop && styles.tdMissionIdWebDesktop,
                              ]}
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
                            style={[
                              styles.tdRoute,
                              isWebDesktop && styles.tdRouteWebDesktop,
                            ]}
                            numberOfLines={isWebDesktop ? 3 : 2}
                          >
                            {row.route}
                          </Text>
                        </View>
                        {isWebDesktop ? (
                          <View style={styles.partyColWebDesktop}>
                            <View style={styles.tdPartyAvatarRow}>
                              <PartyAvatar
                                name={supplierAv.name}
                                organizationImageUrl={
                                  supplierAv.organizationImageUrl
                                }
                                organizationAvatarSeed={
                                  supplierAv.organizationAvatarSeed
                                }
                                avatarUrl={supplierAv.avatarUrl}
                                avatarSeed={supplierAv.avatarSeed}
                                entityType="supplier"
                                size={TRIP_TABLE_AVATAR}
                              />
                              <View style={styles.tdPartyTextStack}>
                                <Text
                                  style={styles.tdPartyWebDesktop}
                                  numberOfLines={1}
                                >
                                  {supplierColumnTitle}
                                </Text>
                                {isAggregateTrip ? (
                                  <Text
                                    style={styles.tdPartyHintWebDesktop}
                                    numberOfLines={1}
                                  >
                                    {supplierColumnSameAsClient
                                      ? "Same org as client"
                                      : isLoadBasedTrip(row.trip)
                                        ? "Partner"
                                        : "Aggregate"}{" "}
                                    · Margin {marginPct.toFixed(1)}%
                                  </Text>
                                ) : tripCost <= 0 && expenseCaptured > 0 ? (
                                  <Text
                                    style={styles.tdPartyHintWebDesktop}
                                    numberOfLines={1}
                                  >
                                    Asset · Expense captured:{" "}
                                    {formatINR(expenseCaptured)}
                                  </Text>
                                ) : (
                                  <Text
                                    style={styles.tdPartyHintWebDesktop}
                                    numberOfLines={1}
                                  >
                                    Asset
                                  </Text>
                                )}
                              </View>
                            </View>
                          </View>
                        ) : null}
                        {isWebDesktop ? (
                          <View style={styles.driverColWebDesktop}>
                            <View style={styles.tdPartyAvatarRow}>
                              <PartyAvatar
                                name={driverName}
                                avatarUrl={
                                  (driverRow?.avatar_url ?? "").trim() || null
                                }
                                avatarSeed={
                                  (driverRow?.avatar_seed ?? "").trim() || null
                                }
                                entityType="driver"
                                size={TRIP_TABLE_AVATAR}
                              />
                              <View style={styles.tdPartyTextStack}>
                                <Text
                                  style={styles.tdPartyWebDesktop}
                                  numberOfLines={2}
                                >
                                  {driverName}
                                </Text>
                                {(
                                  row.trip.vehicle_display_number ?? ""
                                ).trim() ? (
                                  <Text
                                    style={styles.tdPartyHintWebDesktop}
                                    numberOfLines={1}
                                  >
                                    {(
                                      row.trip.vehicle_display_number ?? ""
                                    ).trim()}
                                  </Text>
                                ) : null}
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
                              ]}
                            >
                              {formatINR(tripCost)}
                            </Text>
                          </View>
                        ) : null}
                        {isWebDesktop ? (
                          <View style={styles.amountColWebDesktop}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.td,
                                styles.tdRight,
                                styles.tdAmountWebDesktop,
                                tripPnl >= 0 ? styles.tdGreen : styles.tdRed,
                                { textAlign: "right" as const },
                              ]}
                            >
                              {formatINR(tripPnl)}
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
                              row.due > 0 ? styles.tdRed : styles.tdAmountMuted,
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

        {/* Tab: Cash Flow — same card layout as Finance Cash page, only transactions relevant to this client */}
        {detailSubTab === "cash" && (
          <View
            style={[
              styles.cashSection,
              isWebDesktop && styles.cashSectionWebDesktop,
            ]}
          >
            <Suspense fallback={<LazySuspenseNullFallback />}>
            <LedgerTransactionListView
              transactions={cashFlowTransactionRows}
              fullWidth
              tripDetailsMap={clientTripDetailsMap}
              useTimelineLayout={true}
              showFiscalSubTabs={false}
              showTitle={false}
              showHistoryHeader={false}
              showGridFooter={false}
              embedInParentScroll={true}
              driverRows={drivers}
              driverProfileImageUrls={cashFlowDriverProfileUrls}
              renderPartyAvatar={(row) => {
                const name = resolveLedgerPartyName(row, {
                  clientById: clientByIdForLedger,
                  supplierById: supplierByIdForLedger,
                  tripPartyMap: tripPartyMapForCash,
                  tripDetailsMap: clientTripDetailsMap,
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
                  tripDetailsMap: clientTripDetailsMap,
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
            </Suspense>
          </View>
        )}

      </ScrollView>

      {/* Success overlay */}
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
                entityType: "CLIENT",
                entityId: clientId,
                partyName:
                  (
                    client?.name ||
                    client?.contact_person ||
                    t("client")
                  ).trim() || t("client"),
                partyContext: "customers",
                partyId: clientId,
                defaultType: "in",
              });
              if (due != null && due > 0) q.set("dueAmountIn", String(due));
              router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
            }}
            accessibilityLabel={t("addTransaction")}
            icon="receipt-text"
          />
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

      {showReportModal ? (
        <Suspense fallback={null}>
          <LedgerReportModal
            visible={showReportModal}
            onClose={() => setShowReportModal(false)}
            transactions={reportTransactions}
            title={
              clientReportKind === "pnl"
                ? `${clientName || t("client")} — P&L performance`
                : clientReportKind === "receivable"
                  ? `${clientName || t("client")} — Receivable statement`
                  : clientName
                    ? `${t("ledgerFor")}${clientName}`
                    : t("ledgerReport")
            }
            customReport={activeClientCustomReport}
            hideCashSummary={
              clientReportKind === "pnl" || clientReportKind === "receivable"
            }
          />
        </Suspense>
      ) : null}
      <Modal
        visible={showProfileModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View
          style={[styles.profileModalWrap, { paddingBottom: insets.bottom }]}
        >
          <Suspense fallback={<LazySuspenseNullFallback />}>
          <CounterpartyProfileSystemCard
            visible={showProfileModal}
            type="client"
            organizationName={client?.name || client?.contact_person || "—"}
            adminName={client?.contact_person}
            email={client?.email}
            phone={client?.phone}
            gstNumber={client?.gstin}
            panNumber={client?.pan_number}
            billingAddress={client?.address}
            gridVolumeLabel={formatCustomerLedgerFigure(sales, detailLedgerState)}
            networkTrustLabel="94.2%"
            isIntegrated={Boolean(
              client?.is_integrated ||
              client?.linked_organization_id ||
              isInApp,
            )}
            entityDisplayId={
              client?.display_id ?? client?.id?.slice(0, 8) ?? null
            }
            warehouses={profileWarehousesForCard}
            contracts={profileContractsForCard}
            onClose={() => setShowProfileModal(false)}
            canEdit={canSurface("sales.clients.edit")}
            onEditPress={() => {
              setShowProfileModal(false);
              if (!client?.id) return;
              router.push({
                pathname: "/(modals)/edit-client",
                params: { clientId: client.id },
              });
            }}
          />
          </Suspense>
          <View style={styles.profileModalFooter}>
            {!client?.linked_organization_id && isInApp && !isLinked && (
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
            {!client?.linked_organization_id && isInApp && isLinked && (
              <View style={[styles.profileSecondaryBtn, { opacity: 0.7 }]}>
                <FontAwesome name="check" size={14} color={Theme.primary} />
                <Text style={styles.profileSecondaryBtnText}>
                  Invitation sent
                </Text>
              </View>
            )}
            {!client?.linked_organization_id && !isInApp && (
              <TouchableOpacity
                style={[
                  styles.profileEditBtn,
                  {
                    backgroundColor: Theme.surface,
                    borderWidth: 1,
                    borderColor: Theme.borderLight,
                  },
                ]}
                onPress={() => {
                  const message = `Join me on Pulse to sync our ledger and compare books with ${clientName}. Download Pulse to get started.`;
                  Share.share({ message, title: "Invite to Pulse" });
                }}
                activeOpacity={0.8}
              >
                <FontAwesome
                  name="link"
                  size={14}
                  color={Theme.textPrimaryDark}
                />
                <Text
                  style={[
                    styles.profileEditBtnText,
                    { color: Theme.textPrimaryDark },
                  ]}
                >
                  {t("linkToAppAccount")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  errorText: { fontSize: 15, color: Theme.textSecondary },
  errorWrap: { padding: 16 },
  ledgerErrorRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    gap: 8,
  },
  ledgerErrorText: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  ledgerRetryBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  ledgerRetryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
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
  profileEntityNameInput: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 2,
  },
  profileEntitySub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 6,
    textAlign: "center",
  },
  profileEntitySubInput: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
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
  profileContactValueInput: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
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
  profileFiscalValueInput: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
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
  profileEditRow: {
    marginTop: 4,
    gap: 8,
  },
  profileEditBtnSecondary: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  profileEditBtnSecondaryText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
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
    backgroundColor: "rgba(29,78,216,0.12)",
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
  clientColWebDesktop: {
    flexGrow: 0,
    flexShrink: 0,
    width: "10%",
    justifyContent: "center",
    paddingRight: 6,
  },
  tripColWebDesktop: edc.tripColDesktop,
  partyColWebDesktop: edc.tripPartyColDesktop,
  driverColWebDesktop: edc.tripDriverColDesktop,
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
  tdMissionIdWebDesktop: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "normal",
  },
  tdRoute: edc.tdRoute,
  tdRouteWebDesktop: {
    fontSize: 8,
    fontWeight: "400",
    fontStyle: "normal",
    color: Theme.textMuted,
    lineHeight: 11,
    marginTop: 2,
  },
  tdTripColWebDesktop: edc.tripColDesktop,
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
  tdAmountMuted: {
    fontWeight: "600",
    color: Theme.textMuted,
  },
  tdSales: { textAlign: "right" as const, color: Theme.textPrimaryDark },
  tdRight: { textAlign: "right" as const },
  tdGreen: { color: Theme.darkGreen, fontWeight: "700" },
  tdRed: { color: Theme.teslaRed, fontWeight: "700" },
  emptyRow: edc.emptyRow,
  emptyRowText: edc.emptyRowText,
  cashSection: { marginBottom: 24 },
  cashSectionWebDesktop: {
    width: "100%",
    alignSelf: "stretch",
  },
  cashCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.surface,
    padding: 18,
    marginBottom: 10,
  },
  cashCardIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  cashCardIconIn: {
    backgroundColor: Theme.positiveMuted,
  },
  cashCardIconOut: {
    backgroundColor: Theme.negativeMuted,
  },
  cashCardBody: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    justifyContent: "center",
  },
  cashCardWhy: {
    fontSize: 11,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  cashCardMeta: {
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textMuted,
    marginTop: 2,
  },
  cashCardAmount: {
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.darkGreen,
  },
  sharedSection: { marginBottom: 24 },
  sharedSectionWeb: { width: "100%", alignSelf: "stretch" },
  analyticsSection: {
    marginBottom: 24,
    marginHorizontal: -Layout.screenPaddingHorizontal,
  },
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
