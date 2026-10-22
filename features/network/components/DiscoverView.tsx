/**
 * Discover tab — search all orgs globally, connect with one tap.
 * Smart recommendations: scored by mutual connections, location match, lane overlap.
 * Shows "WHY" reason chips per card. Sort: recommended first, then alphabetical.
 */
import { ContentErrorState } from '@/components/ContentErrorState';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import {
  ConnectionRoleModal,
  type ConnectionInviteRole,
} from "@/features/network/components/ConnectionRoleModal";
import { NetworkDesktopGrowConnectionCard } from "@/features/network/components/desktop/NetworkDesktopGrowConnectionCard";
import {
  NetworkLoadMoreButton,
  useNetworkListPagination,
} from '@/features/network/components/NetworkCompactRows';
import {
  networkHubSplitStyles,
} from "@/features/network/components/NetworkHubSplitLayout";
import {
  getNetworkHubGrowGridColumns,
  isNetworkHubSplitStacked,
  NETWORK_HUB_DESKTOP_CATEGORY_LIMIT,
  NETWORK_HUB_MOBILE_CATEGORY_LIMIT,
  NETWORK_HUB_GRID_GAP_PX,
  NETWORK_HUB_GRID_ROW_PADDING_H,
  NETWORK_HUB_SPLIT_GRID_COLUMNS,
  SPLIT_STACK_BREAKPOINT,
} from "@/features/network/constants/networkHubGrid";
import { useNetworkDiscovery } from '@/features/network/hooks/useNetworkDiscovery';
import type { DiscoverOrg } from '@/features/network/services/discover.service';
import { useCapabilities } from '@/lib/useCapabilities';
import { allowedConnectionRoles } from '@/lib/capabilities';
import { useEnsureVerified } from "@/features/network/utils/verifiedActionGuard";
import { showAppAlert } from "@/lib/appAlert";
import { todayPendingInviteCountFromSent } from "@/lib/todayPendingInviteCount";
import {
  cancelPendingConnectionRequestByOrgPair,
  CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE,
  CONNECTION_REQUEST_DAILY_LIMIT_TITLE,
  createConnectionRequest,
  DAILY_CONNECTION_INVITE_LIMIT,
  type ConnectionRequestRow,
  looksLikeConnectionRateLimitError,
} from "@/features/connections/services/connectionRequests.service";
import { useConnectionRequestsSentQuery, useInvalidateNetwork } from '@/lib/queries/useNetworkQueries';
import { queryKeys } from '@/lib/queryKeys';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQueryClient } from '@tanstack/react-query';
import {
  Compass,
  Search,
  Sparkles,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlashList } from "@shopify/flash-list";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useWebLayoutWidth } from '@/lib/useWebLayoutWidth';

interface DiscoverViewProps {
  orgId: string;
  /** When true, render the hub grid instead of a standalone scrolling list. */
  embedded?: boolean;
  /**
   * When true with `embedded`, grid scrolls inside a bounded area so the parent can keep
   * a static section header (e.g. Network tab "Grow your network").
   */
  embeddedScrollable?: boolean;
  /** Max height of the embedded scroll area; defaults from window size when omitted. */
  embeddedScrollMaxHeight?: number;
  search?: string;
  onSearchChange?: (value: string) => void;
  showSearchChrome?: boolean;
  onOpenProfile?: (org: DiscoverOrg & { rating_value?: number | null; location_value?: string | null }) => void;
  onPrefetchProfile?: (orgId: string) => void;
  onPressMutuals?: (org: { id: string; name: string }) => void;
  onPressMutual?: (org: { id: string; name: string; avatar_seed?: string | null }) => void;
  /** Called whenever the daily invite count changes so the parent can display it inline. */
  onInviteCountChange?: (count: number, limit: number) => void;
  /** When true (e.g. header shows max invites), block Send request with daily-limit alert even if query count lags. */
  inviteDailyCapReached?: boolean;
  /** When true with `embedded`, parent already shows the Grow section title — skip duplicate header. */
  suppressGrowSectionHeader?: boolean;
}

interface RecommendationSignal {
  type: 'mutual' | 'location' | 'lane';
  label: string;
}

interface ScoredOrg extends DiscoverOrg {
  score: number;
  signals: RecommendationSignal[];
}

function getBusinessLocation(
  org: DiscoverOrg,
  fallback?: { city?: string | null; state?: string | null; address_line?: string | null } | null,
): string | null {
  const candidate = (
    org as DiscoverOrg & {
      business_location?: string | null;
      location?: string | null;
      city?: string | null;
      state?: string | null;
      headquarters?: string | null;
      address_line?: string | null;
    }
  );
  const cityState = [candidate.city, candidate.state]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(', ')
    .trim();
  if (cityState) return cityState;

  const fallbackCityState = [fallback?.city, fallback?.state]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(', ')
    .trim();
  if (fallbackCityState) return fallbackCityState;

  const direct =
    candidate.business_location ??
    candidate.location ??
    candidate.headquarters ??
    (candidate.address_line?.trim() ? candidate.address_line.trim() : null) ??
    null;
  if (direct && direct.trim()) {
    const parts = direct
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
    return direct.trim();
  }
  return null;
}

function chunkBySize<T>(arr: T[], size: number): T[][] {
  if (size < 1) return arr.length ? [arr] : [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Maps RPC-enriched discover row to scored card model (DB already sorted). */
function mapDiscoverOrgToScored(org: DiscoverOrg): ScoredOrg {
  const signals: RecommendationSignal[] = [];
  const mutuals = org.mutual_count ?? org.mutual_connections_count ?? 0;
  const laneOverlaps = org.lane_overlap_count ?? 0;

  if (mutuals > 0) {
    signals.push({
      type: "mutual",
      label: `${mutuals} mutual${mutuals === 1 ? "" : "s"}`,
    });
  }
  if (laneOverlaps >= 1 || org.is_in_user_trip_city) {
    signals.push({ type: "location", label: "Active on your routes" });
  }
  if (laneOverlaps >= 2) {
    signals.push({
      type: "lane",
      label: `${laneOverlaps} lane overlaps`,
    });
  }

  const score =
    typeof org.recommendation_score === "number"
      ? org.recommendation_score
      : signals.length === 0
        ? -1
        : 0;

  return { ...org, score, signals };
}

function discoverOrgLocationFallback(org: DiscoverOrg) {
  if (!org.city && !org.state && !org.address_line) return null;
  return {
    city: org.city ?? null,
    state: org.state ?? null,
    address_line: org.address_line ?? null,
  };
}

// --- Org card ---

function OrgCard({
  org,
  locationFallback,
  ratingValue,
  onConnect,
  onCancel,
  loading,
  onOpenProfile,
  onPrefetchProfile,
  onPressMutuals,
  onPressMutual,
  viewerOrgId,
  onDismiss,
  pendingRole = null,
}: {
  org: ScoredOrg;
  locationFallback?: { city?: string | null; state?: string | null; address_line?: string | null } | null;
  totalTrips?: number | null;
  ratingValue?: number | null;
  onConnect: () => void;
  onCancel: () => void;
  loading: boolean;
  onOpenProfile?: () => void;
  onPrefetchProfile?: () => void;
  onPressMutuals?: () => void;
  onPressMutual?: (org: { id: string; name: string; avatar_seed?: string | null }) => void;
  viewerOrgId?: string | null;
  onDismiss?: () => void;
  pendingRole?: ConnectionInviteRole | null;
  compact?: boolean;
  desktopPane?: boolean;
  mobileGrid?: boolean;
  nativeListRow?: boolean;
}) {
  const { t } = useLanguage();
  const mutuals = org.mutual_count ?? org.mutual_connections_count ?? 0;
  const businessLocation = getBusinessLocation(org, locationFallback);

  return (
    <View style={styles.discoverListItemShell}>
      <NetworkDesktopGrowConnectionCard
        org={org}
        locationLabel={businessLocation || t("networkDiscoverLocationNotSet")}
        ratingValue={ratingValue ?? org.rating ?? org.average_rating ?? null}
        mutualCount={mutuals}
        viewerOrgId={viewerOrgId}
        onPressMutuals={onPressMutuals}
        onPressMutual={onPressMutual}
        pendingRole={pendingRole}
        connecting={loading}
        onOpenProfile={onOpenProfile}
        onPrefetchProfile={onPrefetchProfile}
        onConnect={onConnect}
        onCancel={onCancel}
        onDismiss={onDismiss}
      />
    </View>
  );
}

function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Sparkles size={12} color={Theme.textSecondary} />
      <Text style={styles.sectionTitle}>{label.toUpperCase()}</Text>
      {count != null && count > 0 && (
        <View style={styles.resultCount}>
          <Text style={styles.resultCountText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// --- Main view ---

/** Matches Network tab `isMobileLayout` (<820): 2 cols × 3 rows. Else desktop: 7 cols × 2 rows. */
const DISCOVER_GRID_BREAKPOINT = 820;
const DISCOVER_COLS_DESKTOP = 7;
const DISCOVER_ROWS_DESKTOP = 2;
const DISCOVER_COLS_MOBILE = 2;
const DISCOVER_COLS_NATIVE = 1;
const DISCOVER_ROWS_MOBILE = 3;
const DISCOVER_ROWS_NATIVE = 6;
/** Matches discoverOrganizations fetch limit — show full result set inside embedded scroll. */
const EMBEDDED_SCROLL_ITEM_CAP = 40;
export function DiscoverView({
  orgId,
  embedded,
  embeddedScrollable = false,
  embeddedScrollMaxHeight: embeddedScrollMaxHeightProp,
  search: searchProp,
  onSearchChange,
  showSearchChrome = true,
  onOpenProfile,
  onPrefetchProfile,
  onPressMutuals,
  onPressMutual,
  onInviteCountChange,
  inviteDailyCapReached = false,
  suppressGrowSectionHeader = false,
}: DiscoverViewProps) {
  const { t } = useLanguage();
  const capabilities = useCapabilities();
  const ensureVerified = useEnsureVerified();
  const windowWidth = useWebLayoutWidth();
  const { height: windowHeight } = useWindowDimensions();
  const isNativeApp = Platform.OS !== "web";
  const [internalSearch, setInternalSearch] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [requestRoleModalOrg, setRequestRoleModalOrg] = useState<ScoredOrg | null>(null);
  const queryClient = useQueryClient();
  const search = searchProp ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const {
    orgs,
    loading,
    hasMore,
    loadMoreOrgs,
    hasFetched,
    error,
    refetch: refetchDiscover,
    invalidateCache: invalidateDiscoverCache,
    mutateOrgStatus,
  } = useNetworkDiscovery({ orgId, search });
  /** User-dismissed Grow your network recommendations (session); next scored org fills the slot. */
  const [dismissedRecommendationIds, setDismissedRecommendationIds] = useState<
    Set<string>
  >(() => new Set());

  useEffect(() => {
    setDismissedRecommendationIds(new Set());
  }, [orgId, search]);

  const visibleOrgs = orgs;

  const sentQ = useConnectionRequestsSentQuery(orgId);

  const pendingRoleByOrgId = useMemo<Record<string, ConnectionInviteRole>>(() => {
    const map: Record<string, ConnectionInviteRole> = {};
    for (const r of sentQ.data ?? []) {
      if (r.status === 'pending' && r.from_organization_id === orgId) {
        map[r.to_organization_id] = r.request_shipper_client ? 'client' : 'supplier';
      }
    }
    return map;
  }, [sentQ.data, orgId]);

  const todayInviteCount = useMemo(
    () => todayPendingInviteCountFromSent(sentQ.data ?? []),
    [sentQ.data],
  );

  const atDailyInviteLimit = useMemo(
    () =>
      todayInviteCount >= DAILY_CONNECTION_INVITE_LIMIT || inviteDailyCapReached === true,
    [todayInviteCount, inviteDailyCapReached],
  );

  useEffect(() => {
    onInviteCountChange?.(todayInviteCount, DAILY_CONNECTION_INVITE_LIMIT);
  }, [todayInviteCount, onInviteCountChange]);

  const invalidateNetwork = useInvalidateNetwork(orgId);

  const scoredOrgs = useMemo<ScoredOrg[]>(
    () => visibleOrgs.map(mapDiscoverOrgToScored),
    [visibleOrgs],
  );

  const connectableOrgs = useMemo(
    () => scoredOrgs.filter((o) => {
      const status = String(o.connection_status ?? 'none').toLowerCase();
      const role = String(o.profile_role ?? '').toLowerCase();
      // Show all non-connected users (including pending sent/received requests).
      // Exclude only connected users and drivers.
      return status !== 'approved' && role !== 'driver';
    }),
    [scoredOrgs],
  );
  /** Mutual / lane / city signals (RPC recommendation_score > 0). */
  const signalRecommended = useMemo(
    () => connectableOrgs.filter((o) => o.score > 0),
    [connectableOrgs],
  );
  /**
   * Hub slots (Grow / People you may know). Cold-start workspaces get score -1 from
   * discover_organizations — fall back to the RPC-ordered connectable list so new users
   * still see cards instead of the compass empty state.
   */
  const recommendationPool = useMemo(
    () => (signalRecommended.length > 0 ? signalRecommended : connectableOrgs),
    [signalRecommended, connectableOrgs],
  );
  const rest = connectableOrgs.filter((o) => o.score <= 0);
  /** Backfill source once recommendationPool is exhausted by dismissals. */
  const backfillPool = useMemo(() => {
    if (signalRecommended.length === 0) return recommendationPool;
    const poolIds = new Set(recommendationPool.map((o) => o.id));
    return [...recommendationPool, ...rest.filter((o) => !poolIds.has(o.id))];
  }, [recommendationPool, rest, signalRecommended]);

  const growGridColumns = useMemo(
    () => getNetworkHubGrowGridColumns(windowWidth),
    [windowWidth],
  );
  /** Desktop: 8 per category. Mobile: 6 per category. */
  const growSectionLimit = useMemo(
    () =>
      windowWidth >= SPLIT_STACK_BREAKPOINT
        ? NETWORK_HUB_DESKTOP_CATEGORY_LIMIT
        : NETWORK_HUB_MOBILE_CATEGORY_LIMIT,
    [windowWidth],
  );

  const growNetworkRecommendations = useMemo(() => {
    const slots: ScoredOrg[] = [];
    for (const org of backfillPool) {
      if (dismissedRecommendationIds.has(org.id)) continue;
      slots.push(org);
      if (slots.length >= growSectionLimit) break;
    }
    return slots;
  }, [backfillPool, dismissedRecommendationIds, growSectionLimit]);

  const peopleYouMayKnow = useMemo(() => {
    const growIds = new Set(growNetworkRecommendations.map((o) => o.id));
    const slots: ScoredOrg[] = [];
    for (const org of backfillPool) {
      if (dismissedRecommendationIds.has(org.id)) continue;
      if (growIds.has(org.id)) continue;
      slots.push(org);
      if (slots.length >= growSectionLimit) break;
    }
    return slots;
  }, [
    backfillPool,
    dismissedRecommendationIds,
    growNetworkRecommendations,
    growSectionLimit,
  ]);

  const handleDismissRecommendation = useCallback((targetOrgId: string) => {
    setDismissedRecommendationIds((prev) => new Set(prev).add(targetOrgId));
  }, []);

  /** Fetch the next page before dismissals exhaust the local backfill pool. */
  const undismissedBackfillCount = useMemo(
    () => backfillPool.filter((o) => !dismissedRecommendationIds.has(o.id)).length,
    [backfillPool, dismissedRecommendationIds],
  );
  useEffect(() => {
    if (!hasMore) return;
    if (undismissedBackfillCount > growSectionLimit * 2) return;
    void loadMoreOrgs();
  }, [hasMore, loadMoreOrgs, undismissedBackfillCount, growSectionLimit]);

  const embeddedHubRecommendations = useMemo(
    () => [...growNetworkRecommendations, ...peopleYouMayKnow],
    [growNetworkRecommendations, peopleYouMayKnow],
  );

  const isDiscoverDesktopGrid = windowWidth >= DISCOVER_GRID_BREAKPOINT;
  const discoverColumnCount = isDiscoverDesktopGrid
    ? DISCOVER_COLS_DESKTOP
    : isNativeApp
      ? DISCOVER_COLS_NATIVE
      : DISCOVER_COLS_MOBILE;
  const discoverRowCap = isDiscoverDesktopGrid
    ? DISCOVER_ROWS_DESKTOP
    : isNativeApp
      ? DISCOVER_ROWS_NATIVE
      : DISCOVER_ROWS_MOBILE;
  const discoverMaxVisible = discoverColumnCount * discoverRowCap;

  const _embeddedScrollMaxHeight = useMemo(() => {
    if (embeddedScrollMaxHeightProp != null && embeddedScrollMaxHeightProp > 0) {
      return embeddedScrollMaxHeightProp;
    }
    return Math.min(560, Math.round(windowHeight * 0.48));
  }, [embeddedScrollMaxHeightProp, windowHeight]);

  const discoverDisplayCap = useMemo(
    () =>
      embedded && embeddedScrollable ? EMBEDDED_SCROLL_ITEM_CAP : discoverMaxVisible,
    [embedded, embeddedScrollable, discoverMaxVisible],
  );

  const getDiscoverOrgCardMetrics = useCallback((targetOrg: DiscoverOrg) => ({
    totalTrips: targetOrg.trip_count ?? null,
    ratingValue: targetOrg.average_rating ?? targetOrg.rating ?? null,
  }), []);

  const orgPressMutualsHandler = useCallback(
    (org: ScoredOrg) => {
      const count = org.mutual_count ?? org.mutual_connections_count ?? 0;
      if (count <= 0 || !onPressMutuals) return undefined;
      return () => onPressMutuals({ id: org.id, name: org.name });
    },
    [onPressMutuals],
  );

  const closeRequestRoleModal = useCallback(() => {
    if (connecting) return;
    setRequestRoleModalOrg(null);
  }, [connecting]);

  const showInviteLimitExceededAlert = useCallback(() => {
    showAppAlert(CONNECTION_REQUEST_DAILY_LIMIT_TITLE, CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE);
  }, []);

  const tryBeginConnectionRequest = useCallback(
    (org: ScoredOrg) => {
      if (atDailyInviteLimit) {
        showInviteLimitExceededAlert();
        return;
      }
      // No valid role between these two operating models (e.g. two pure
      // carriers) → don't open a zero-option role modal.
      if (allowedConnectionRoles(capabilities, org.operating_model).length === 0) {
        showAppAlert(
          "Cannot connect",
          "Your organization and this one can't form a client or supplier link.",
        );
        return;
      }
      // Verified-org only — shows a "Verify now" dialog and opens KYC on confirm.
      void ensureVerified().then((ok) => {
        if (ok) setRequestRoleModalOrg(org);
      });
    },
    [atDailyInviteLimit, showInviteLimitExceededAlert, capabilities, ensureVerified],
  );

  const handleConnect = async (org: ScoredOrg, mode: "client" | "supplier") => {
    if (atDailyInviteLimit) {
      showInviteLimitExceededAlert();
      return;
    }
    setConnecting(org.id);
    let result: Awaited<ReturnType<typeof createConnectionRequest>>;
    try {
      result = await createConnectionRequest(orgId, org.id, {
        requestShipperClient: mode === "client",
        requestCarrierSupplier: mode === "supplier",
      });
    } catch {
      setConnecting(null);
      setRequestRoleModalOrg(null);
      Alert.alert("Could not connect", "A network error occurred. Please try again.");
      return;
    }
    const { error, alreadyInvited, requestId } = result;
    setConnecting(null);
    setRequestRoleModalOrg(null);
    if (error) {
      const msg = error.message;
      if (looksLikeConnectionRateLimitError(msg)) {
        showInviteLimitExceededAlert();
      } else {
        showAppAlert("Could not connect", msg);
      }
      return;
    }
    mutateOrgStatus(org.id, 'pending');
    if (alreadyInvited) {
      invalidateDiscoverCache();
      void refetchDiscover(search);
      invalidateNetwork();
      return;
    }
    if (requestId) {
      queryClient.setQueryData<ConnectionRequestRow[]>(
        queryKeys.connectionRequests.sent(orgId),
        (prev = []) => {
          if (prev.some((r) => r.id === requestId)) return prev;
          const optimistic: ConnectionRequestRow = {
            id: requestId,
            from_organization_id: orgId,
            to_organization_id: org.id,
            request_shipper_client: mode === "client",
            request_carrier_supplier: mode === "supplier",
            status: 'pending',
            created_at: new Date().toISOString(),
            responded_at: null,
            responded_by: null,
            from_org_name: '',
            to_org_name: org.name,
          };
          return [optimistic, ...prev];
        }
      );
    }
    invalidateNetwork();
    invalidateDiscoverCache();
    void refetchDiscover(search);
  };

  const handleCancelRequest = async (org: ScoredOrg) => {
    setConnecting(org.id);
    const { error, deleted } = await cancelPendingConnectionRequestByOrgPair(orgId, org.id);
    setConnecting(null);
    if (error) {
      Alert.alert("Could not cancel request", error.message);
      return;
    }
    if (!deleted) {
      Alert.alert("Request already changed", "Refreshing the latest network state.");
    }
    mutateOrgStatus(org.id, 'none');
    queryClient.setQueryData<ConnectionRequestRow[]>(
      queryKeys.connectionRequests.sent(orgId),
      (prev = []) => prev.filter((r) => !(r.to_organization_id === org.id && r.status === "pending"))
    );
    invalidateDiscoverCache();
    void refetchDiscover(search);
    invalidateNetwork();
  };

  type ListItem =
    | { _type: 'header'; label: string; count: number }
    | { _type: 'org'; org: ScoredOrg };

  const discoverListOrgs = useMemo(() => {
    if (embedded && !search) return embeddedHubRecommendations;
    return search ? connectableOrgs : [...signalRecommended, ...rest];
  }, [
    embedded,
    search,
    connectableOrgs,
    embeddedHubRecommendations,
    signalRecommended,
    rest,
  ]);

  const discoverPaginationKey = `${search}:${discoverListOrgs.length}`;

  const {
    visibleItems: visibleDiscoverOrgs,
    hasMore: hasMoreDiscover,
    remaining: remainingDiscover,
    loadMore: loadMoreDiscover,
  } = useNetworkListPagination(discoverListOrgs, discoverPaginationKey);

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    const display = embedded
      ? discoverListOrgs
      : discoverListOrgs.slice(0, discoverDisplayCap);
    if (search && display.length > 0 && !embedded) {
      items.push({ _type: 'header', label: 'Fresh profiles', count: connectableOrgs.length });
    }
    for (const org of display) items.push({ _type: 'org', org });
    return items;
  }, [connectableOrgs, discoverListOrgs, discoverDisplayCap, embedded, search]);

  const isMobileHub = isNetworkHubSplitStacked(windowWidth);
  const discoverListCompact = !isMobileHub && windowWidth < 1100;

  type PaneListGridOptions = {
    columns: number;
    compact?: boolean;
    desktopPane?: boolean;
    mobileGrid?: boolean;
    nativeListRow?: boolean;
  };

  const renderEmbeddedPaneListGrid = useCallback(
    (
      orgs: ScoredOrg[],
      keyPrefix: string,
      containerStyle?: typeof styles.hubMobileListPane,
      options?: PaneListGridOptions,
    ) => {
      const columns = options?.columns ?? NETWORK_HUB_SPLIT_GRID_COLUMNS;
      const compact = options?.compact ?? discoverListCompact;
      const desktopPane = options?.desktopPane ?? false;
      const mobileGrid = options?.mobileGrid ?? (isMobileHub && columns > 1);
      const nativeListRow =
        options?.nativeListRow ?? (isNativeApp && columns === 1);
      const singleColumn = columns === 1;
      const renderOrgCard = (org: ScoredOrg) => (
        <OrgCard
          org={org}
          compact={compact}
          desktopPane={desktopPane}
          mobileGrid={mobileGrid}
          nativeListRow={nativeListRow}
          locationFallback={discoverOrgLocationFallback(org)}
          {...getDiscoverOrgCardMetrics(org)}
          onConnect={() => tryBeginConnectionRequest(org)}
          onCancel={() => void handleCancelRequest(org)}
          onDismiss={!search ? () => handleDismissRecommendation(org.id) : undefined}
          loading={connecting === org.id}
          onOpenProfile={() => {
            const metrics = getDiscoverOrgCardMetrics(org);
            onOpenProfile?.({
              ...org,
              rating_value: metrics.ratingValue,
              location_value: getBusinessLocation(org, discoverOrgLocationFallback(org)),
            });
          }}
          onPrefetchProfile={
            onPrefetchProfile ? () => onPrefetchProfile(org.id) : undefined
          }
          onPressMutuals={orgPressMutualsHandler(org)}
          onPressMutual={onPressMutual}
          viewerOrgId={orgId}
          pendingRole={pendingRoleByOrgId[org.id] ?? null}
        />
      );

      if (singleColumn) {
        return (
          <View style={[networkHubSplitStyles.nativePaneList, containerStyle]}>
            {orgs.map((org) => (
              <View key={`${keyPrefix}-${org.id}`} style={networkHubSplitStyles.nativePaneListItem}>
                {renderOrgCard(org)}
              </View>
            ))}
          </View>
        );
      }

      const rows = chunkBySize(orgs, columns);
      return (
        <View style={[networkHubSplitStyles.paneListGrid, containerStyle]}>
          {rows.map((row, rowIndex) => (
            <View key={`${keyPrefix}-row-${rowIndex}`} style={networkHubSplitStyles.paneListRow}>
              {Array.from({ length: columns }, (_, colIndex) => {
                const org = row[colIndex];
                return (
                  <View
                    key={org ? org.id : `${keyPrefix}-empty-${rowIndex}-${colIndex}`}
                    style={networkHubSplitStyles.paneListCell}
                  >
                    {org ? renderOrgCard(org) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      );
    },
    [
      connecting,
      discoverListCompact,
      getDiscoverOrgCardMetrics,
      pendingRoleByOrgId,
      handleCancelRequest,
      handleDismissRecommendation,
      isMobileHub,
      isNativeApp,
      onOpenProfile,
      onPrefetchProfile,
      onPressMutual,
      orgId,
      orgPressMutualsHandler,
      search,
      tryBeginConnectionRequest,
    ],
  );

  const splitStacked = isNetworkHubSplitStacked(windowWidth);

  const growGridOptions: PaneListGridOptions = {
    columns: growGridColumns,
    compact: false,
    desktopPane: false,
    mobileGrid: growGridColumns > 1,
    nativeListRow: false,
  };

  const embeddedHubGridBody = (
    <View style={styles.hubMobileListRoot}>
      {growNetworkRecommendations.length > 0 ? (
        <View
          style={[
            styles.hubMobileListSection,
            suppressGrowSectionHeader && styles.hubMobileListSectionFlush,
          ]}
        >
          {!suppressGrowSectionHeader ? (
            <View style={styles.hubMobileListSectionHeader}>
              {splitStacked ? (
                <>
                  <Text style={styles.mayKnowKicker}>{t("networkDiscoverAlliesKicker")}</Text>
                  <Text style={styles.mayKnowHeading}>{t("networkDiscoverGrowSlots")}</Text>
                </>
              ) : (
                <Text style={styles.mayKnowHeading}>{t("networkDiscoverRecommended")}</Text>
              )}
            </View>
          ) : null}
          {renderEmbeddedPaneListGrid(
            growNetworkRecommendations,
            "grow",
            styles.hubMobileListPane,
            growGridOptions,
          )}
        </View>
      ) : null}
      {peopleYouMayKnow.length > 0 ? (
        <View style={styles.hubMobileListSection}>
          <View style={styles.hubMobileListSectionHeader}>
            <Text style={styles.mayKnowKicker}>{t("networkDiscoverSuggestions")}</Text>
            <Text style={styles.mayKnowHeading}>{t("networkPeopleYouMayKnow")}</Text>
          </View>
          {renderEmbeddedPaneListGrid(
            peopleYouMayKnow,
            "may-know",
            styles.hubMobileListPane,
            growGridOptions,
          )}
        </View>
      ) : null}
      {growNetworkRecommendations.length === 0 &&
      peopleYouMayKnow.length === 0 &&
      connectableOrgs.length > 0 ? (
        <View
          style={[
            styles.hubMobileListSection,
            suppressGrowSectionHeader && styles.hubMobileListSectionFlush,
          ]}
        >
          {renderEmbeddedPaneListGrid(
            connectableOrgs.slice(0, growSectionLimit * 2),
            "discover-fallback",
            styles.hubMobileListPane,
            growGridOptions,
          )}
        </View>
      ) : null}
    </View>
  );

  const embeddedHubSearchBody = (
    <View style={styles.hubListFull}>
      {renderEmbeddedPaneListGrid(visibleDiscoverOrgs, "discover-search", undefined, {
        columns: growGridColumns,
        compact: discoverListCompact,
      })}
      {hasMoreDiscover ? (
        <View style={styles.hubListLoadMore}>
          <NetworkLoadMoreButton
            remaining={remainingDiscover}
            onPress={loadMoreDiscover}
          />
        </View>
      ) : null}
    </View>
  );

  const embeddedHubBody =
    embedded && !search
      ? embeddedHubGridBody
      : embedded && search
        ? embeddedHubSearchBody
        : null;

  const embeddedHasListContent =
    embedded && !search
      ? growNetworkRecommendations.length > 0 ||
        peopleYouMayKnow.length > 0 ||
        connectableOrgs.length > 0
      : discoverListOrgs.length > 0;

  const showEmbeddedLoading = !hasFetched || (loading && !embeddedHasListContent);
  const showEmbeddedEmpty = hasFetched && !loading && !embeddedHasListContent;

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      {showSearchChrome ? (
        <View style={styles.searchBox}>
          <Search size={16} color={Theme.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by company name..."
            placeholderTextColor={Theme.textSecondary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCapitalize="words"
          />
          {loading && <LoadingIndicator size={14} color={Theme.primary} />}
        </View>
      ) : loading ? (
        <View style={styles.inlineLoading}>
          <LoadingIndicator size={14} color={Theme.primary} />
        </View>
      ) : null}

      {error ? (
        <ContentErrorState
          variant="discover"
          layout="inline"
          message={error}
          onRetry={() => refetchDiscover(search)}
          retrying={loading}
        />
      ) : null}

      {embedded ? (
        <View>
          {showEmbeddedEmpty ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Compass size={36} color={Theme.textSecondary} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyTitle}>
                {search ? "No results found" : "Discover your network"}
              </Text>
              <Text style={styles.emptySub}>
                {search
                  ? `No organizations found for "${search}"`
                  : "Search for companies, clients, and suppliers across the country"}
              </Text>
            </View>
          ) : showEmbeddedLoading ? (
            <View style={styles.embeddedGridLoading}>
              <LoadingIndicator size="small" color={Theme.primary} />
            </View>
          ) : (
            embeddedHubBody
          )}
        </View>
      ) : (
        <FlashList
          data={listData}
          keyExtractor={(item, i) => (item._type === "header" ? `h-${i}` : item.org.id)}
          renderItem={({ item }) => {
            if (item._type === "header") {
              return <SectionLabel label={item.label} count={item.count} />;
            }
            return (
              <OrgCard
                org={item.org}
                locationFallback={discoverOrgLocationFallback(item.org)}
                {...getDiscoverOrgCardMetrics(item.org)}
                onConnect={() => tryBeginConnectionRequest(item.org)}
                onCancel={() => void handleCancelRequest(item.org)}
                loading={connecting === item.org.id}
                pendingRole={pendingRoleByOrgId[item.org.id] ?? null}
                onOpenProfile={() => {
                  const metrics = getDiscoverOrgCardMetrics(item.org);
                  onOpenProfile?.({
                    ...item.org,
                    rating_value: metrics.ratingValue,
                    location_value: getBusinessLocation(item.org),
                  });
                }}
                onPrefetchProfile={
                  onPrefetchProfile
                    ? () => onPrefetchProfile(item.org.id)
                    : undefined
                }
                onPressMutuals={orgPressMutualsHandler(item.org)}
                onPressMutual={onPressMutual}
                viewerOrgId={orgId}
              />
            );
          }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled
          nestedScrollEnabled
          ListEmptyComponent={
            hasFetched && !loading ? (
              <View style={styles.empty}>
                <View style={styles.emptyIconWrap}>
                  <Compass size={36} color={Theme.textSecondary} strokeWidth={1.5} />
                </View>
                <Text style={styles.emptyTitle}>
                  {search ? "No results found" : "Discover your network"}
                </Text>
                <Text style={styles.emptySub}>
                  {search
                    ? `No organizations found for "${search}"`
                    : "Search for companies, clients, and suppliers across the country"}
                </Text>
              </View>
            ) : null
          }
        />
      )}
      <ConnectionRoleModal
        visible={Boolean(requestRoleModalOrg)}
        companyName={requestRoleModalOrg?.name ?? ""}
        allowedRoles={allowedConnectionRoles(
          capabilities,
          requestRoleModalOrg?.operating_model,
        )}
        submitting={Boolean(
          requestRoleModalOrg && connecting === requestRoleModalOrg.id,
        )}
        onClose={closeRequestRoleModal}
        onConfirm={(role) => {
          if (requestRoleModalOrg) void handleConnect(requestRoleModalOrg, role);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.networkPageBackground },
  containerEmbedded: {
    flex: 0,
    flexGrow: 0,
    alignSelf: "stretch",
    width: "100%",
  },
  compactList: {},
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 14,
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 16, color: Theme.textPrimary, fontWeight: '600' },
  inlineLoading: {
    alignItems: "flex-end",
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 10, fontWeight: '900', color: Theme.textSecondary, letterSpacing: 1.2, flex: 1,
  },
  resultCount: {
    backgroundColor: Theme.primary + '18', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  resultCountText: { fontSize: 10, fontWeight: '900', color: Theme.primary },
  list: { paddingHorizontal: 14, paddingBottom: 40, gap: 12 },
  embeddedDiscoverScroll: {
    width: "100%",
    alignSelf: "stretch",
  },
  discoverListItemShell: {
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 40, gap: 12 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: Theme.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: Theme.textPrimary, letterSpacing: -0.3, textAlign: 'center' },
  emptySub: { fontSize: 13, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  embeddedGridLoading: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  hubListFull: {
    width: "100%",
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    gap: NETWORK_HUB_GRID_GAP_PX,
    paddingBottom: 4,
  },
  hubListLoadMore: {
    width: "100%",
    paddingTop: 4,
  },
  mayKnowKicker: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  mayKnowHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  hubMobileListRoot: {
    width: "100%",
    alignSelf: "stretch",
    gap: 0,
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
  },
  hubMobileListSection: {
    width: "100%",
    marginTop: 16,
    gap: 8,
  },
  hubMobileListSectionFlush: {
    marginTop: 4,
  },
  hubMobileListSectionHeader: {
    width: "100%",
    paddingHorizontal: 0,
    gap: 2,
    marginBottom: 4,
  },
  hubMobileListPane: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 0,
    gap: NETWORK_HUB_GRID_GAP_PX,
  },
  inviteCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  inviteCounterText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textSecondary,
    letterSpacing: 0.3,
  },
});
