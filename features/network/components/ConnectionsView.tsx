/**
 * Connections tab — clients, suppliers, and fleet drivers.
 * `hubMode`: Network screen layout (nested cards, shared header search/filters in parent).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import type { NetworkPartyRolePill } from "@/features/network/components/NetworkPartyProfileCard";
import { NetworkPartyHubListCard } from "@/features/network/components/NetworkPartyHubListCard";
import { NetworkDesktopConnectionCard } from "@/features/network/components/desktop/NetworkDesktopConnectionCard";
import { NetworkHubConnectionsPagedGrid } from "@/features/network/components/NetworkHubConnectionsPagedGrid";
import {
  getNetworkHubConnectionsLayout,
  getNetworkHubMetronicConnectionsLayout,
  NETWORK_HUB_CONNECTION_DESKTOP_COLUMNS,
  SPLIT_STACK_BREAKPOINT,
  NETWORK_HUB_GRID_GAP_PX,
  NETWORK_HUB_GRID_ROW_PADDING_H,
} from "@/features/network/constants/networkHubGrid";
import { networkCompactListStyle } from "@/features/network/components/NetworkCompactRows";
import { runConnectionInvite } from "@/features/network/utils/connectionInvite.util";
import { formatPartyContactPhone } from "@/features/network/utils/partyContactDisplay.util";
import { isOrgKycVerified } from "@/features/network/utils/orgVerification.util";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import {
    getOrganizationLocationsByIds,
    getOrganizationLocationsByNames,
} from "@/features/organization/services/organization.service";
import {
    averageRatingForRatedParty,
    averageScoreDeduped,
    firstFiniteRating,
    getRatingsForClients,
    getRatingsForDrivers,
    getRatingsForSuppliers,
} from "@/features/ratings/services/ratings.service";
import { useLinkedOrgDisplayMap } from "@/lib/queries/useLinkedOrgDisplayQuery";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useTripPartyCountsQuery } from "@/lib/queries/useTripsQuery";
import { ConnectionEntityAvatar } from "@/features/network/utils/connectionEntityAvatar";
import { useQuery } from "@tanstack/react-query";
import {
    LayoutGrid,
    List,
    MessageCircle,
    Search,
    Zap,
} from "lucide-react-native";
import { NetworkGrowBanner } from "@/features/network/components/NetworkGrowBanner";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlashList } from "@shopify/flash-list";
import {
    Alert,
    Animated,
    Image,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useWebLayoutWidth } from "@/lib/useWebLayoutWidth";

const CONNECTIONS_BODY_WATERMARK = require("@/assets/illustrations/network-connections-watermark.png");
const CONNECTIONS_BODY_WATERMARK_ASPECT = 456 / 334;

export type ConnectionFilterTab = "ALL" | "CLIENT" | "SUPPLIER" | "DRIVER";

interface ConnectionsViewProps {
  orgId: string;
  onRefresh?: () => void;
  onOpenProfile?: (item: ConnectedOrg) => void;
  onPressMutuals?: (org: { id: string; name: string }) => void;
  onPressMutual?: (org: MutualConnectionRow) => void;
  onConnectionsComputed?: (items: ConnectedOrg[]) => void;
  /** Render list without internal scroll (nested in parent ScrollView). */
  embedded?: boolean;
  /**
   * Network hub: parent owns dark header search + filter pills; use hub card layout.
   * Pass `hubSearch` + `hubFilter` (controlled).
   */
  hubMode?: boolean;
  hubSearch?: string;
  hubFilter?: ConnectionFilterTab;
  /** Desktop Metronic hub — 4-column user-directory cards. */
  desktopMetronicGrid?: boolean;
  /** Desktop Metronic — single row, 4 visible, horizontal scroll. */
  desktopMetronicHorizontalScroll?: boolean;
  /** Hub sort: recommended (default name), most trips, or A–Z. */
  hubSortMode?: "recommended" | "active" | "alpha";
  /** Open integrated partner chat (desktop hub flex panel). */
  onChatIntegrated?: (item: ConnectedOrg) => void;
  /** Visible Metronic / hub page (2 rows) — keep partners table in sync. */
  onVisiblePageChange?: (items: ConnectedOrg[]) => void;
}

const COVER_TOKENS = [
  Theme.ledgerNetBarBg,
  Theme.textPrimaryDark,
  Theme.cinematicHeaderBg,
  Theme.primary,
  Theme.darkGreen,
  Theme.teslaRed,
] as const;
function seedColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++)
    h = (h + id.charCodeAt(i)) % COVER_TOKENS.length;
  return COVER_TOKENS[h];
}

function roleTone(role: ConnectedOrg["role"]) {
  if (role === "CLIENT")
    return {
      bg: Theme.networkBadgeClientBg,
      gradientTop: Theme.networkBadgeClientGradientTop,
      text: Theme.networkBadgeClientText,
      border: Theme.networkBadgeClientBorder,
    };
  if (role === "DRIVER")
    return {
      bg: Theme.networkBadgeDriverBg,
      gradientTop: Theme.networkBadgeDriverGradientTop,
      text: Theme.networkBadgeDriverText,
      border: Theme.networkBadgeDriverBorder,
    };
  return {
    bg: Theme.networkBadgeSupplierBg,
    gradientTop: Theme.networkBadgeSupplierGradientTop,
    text: Theme.networkBadgeSupplierText,
    border: Theme.networkBadgeSupplierBorder,
  };
}

export interface ConnectedOrg {
  id: string;
  name: string;
  role: "CLIENT" | "SUPPLIER" | "DRIVER";
  is_integrated: boolean;
  /** Admin KYC verified (`organizations.verification_status = verified`). */
  is_kyc_verified?: boolean;
  verification_status?: string | null;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  mutual_count?: number | null;
  rating?: number | null;
  phone?: string | null;
  linked_organization_id?: string | null;
  city?: string | null;
  state?: string | null;
  location?: string | null;
  business_location?: string | null;
  headquarters?: string | null;
  total_trips?: number | null;
}

function getConnectionLocation(item: ConnectedOrg): string | null {
  const cityState = [item.city, item.state]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ")
    .trim();
  if (cityState) return cityState;

  const direct =
    item.business_location ?? item.location ?? item.headquarters ?? null;
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

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function rolePillsForConnection(item: ConnectedOrg): NetworkPartyRolePill[] {
  const tone = roleTone(item.role);
  const pills: NetworkPartyRolePill[] = [
    {
      label: item.role,
      backgroundColor: tone.bg,
      gradientTop: tone.gradientTop,
      color: tone.text,
      borderColor: tone.border,
    },
  ];
  if (item.is_integrated) {
    pills.push({
      label: "INTEGRATED",
      backgroundColor: Theme.networkBadgeIntegratedBg,
      gradientTop: Theme.networkBadgeIntegratedGradientTop,
      color: Theme.networkBadgeIntegratedText,
      borderColor: Theme.networkBadgeIntegratedBorder,
      highlightColor: Theme.networkBadgeIntegratedHighlight,
    });
  }
  if (item.role !== "DRIVER") {
    if (item.is_kyc_verified) {
      pills.push({
        label: "VERIFIED",
        backgroundColor: Theme.networkBadgeSupplierBg,
        gradientTop: Theme.networkBadgeSupplierGradientTop,
        color: Theme.darkGreen,
        borderColor: Theme.networkBadgeSupplierBorder,
      });
      pills.push({
        label: "RECOMMENDED",
        backgroundColor: Theme.aggregatePillBg,
        gradientTop: Theme.aggregatePillBg,
        color: Theme.aggregatePillText,
        borderColor: Theme.aggregatePillBorder,
      });
    } else {
      pills.push({
        label: "NOT VERIFIED",
        backgroundColor: Theme.surface,
        gradientTop: Theme.surface,
        color: Theme.textSecondary,
        borderColor: Theme.borderLight,
      });
    }
  }
  return pills;
}

function ConnectionProfileCard({
  item,
  compact,
  mobileGrid,
  chatHubTile,
  nativeListRow,
  onOpenProfile,
  onPressMutuals,
  onPressMutual,
  viewerOrgId,
  onConnectionAction,
  actionLoading,
}: {
  item: ConnectedOrg;
  compact?: boolean;
  mobileGrid?: boolean;
  chatHubTile?: boolean;
  nativeListRow?: boolean;
  onOpenProfile?: (item: ConnectedOrg) => void;
  onPressMutuals?: (org: { id: string; name: string }) => void;
  onPressMutual?: (org: MutualConnectionRow) => void;
  viewerOrgId?: string | null;
  onConnectionAction: () => void;
  actionLoading: boolean;
}) {
  const location = getConnectionLocation(item);
  const roleLine =
    item.role === "CLIENT"
      ? "Client partner"
      : item.role === "SUPPLIER"
        ? "Supplier partner"
        : "Fleet driver";

  return (
    <View style={hubCardStyles.listShell}>
      <NetworkPartyHubListCard
        partyId={item.id}
        mutualsOrgId={item.linked_organization_id ?? item.id}
        name={item.name}
        partyType={roleLine}
        phone={formatPartyContactPhone(item.phone)}
        location={location ?? undefined}
        avatarSeed={item.avatar_seed}
        avatarUrl={item.avatar_url}
        entityType={
          item.role === "DRIVER"
            ? "driver"
            : item.role === "SUPPLIER"
              ? "supplier"
              : "client"
        }
        compact={compact}
        mobileGrid={mobileGrid}
        chatHubTile={chatHubTile}
        showVerified={item.is_integrated || isOrgKycVerified(item)}
        nativeListRow={nativeListRow}
        rolePills={rolePillsForConnection(item)}
        totalTrips={item.total_trips ?? null}
        ratingValue={item.rating ?? null}
        mutualCount={item.mutual_count ?? 0}
        showOnline={item.is_integrated}
        viewerOrgId={viewerOrgId}
        onPressMutuals={
          (item.mutual_count ?? 0) > 0 && onPressMutuals
            ? () =>
                onPressMutuals({
                  id: item.linked_organization_id ?? item.id,
                  name: item.name,
                })
            : undefined
        }
        onPressMutual={onPressMutual}
        onPressCard={onOpenProfile ? () => onOpenProfile(item) : undefined}
        onOpenProfile={onOpenProfile ? () => onOpenProfile(item) : undefined}
        connectionIntegrated={item.is_integrated}
        onConnectionAction={onConnectionAction}
        connectionActionDisabled={item.role === "DRIVER" && !item.phone}
        loading={actionLoading}
      />
    </View>
  );
}

const hubCardStyles = StyleSheet.create({
  listShell: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
});

// ─── Grid Card (LinkedIn-style: cover + overlapping avatar) ───────────────────

function GridCard({ item }: { item: ConnectedOrg }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const color = seedColor(item.id);
  const tone = roleTone(item.role);
  const roleSub =
    item.role === "CLIENT"
      ? "Client"
      : item.role === "DRIVER"
        ? "Driver"
        : "Supplier";

  const onIn = () =>
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Pressable onPressIn={onIn} onPressOut={onOut} style={styles.gridCardWrap}>
      <Animated.View style={[styles.gridCard, { transform: [{ scale }] }]}>
        <View style={[styles.gridCover, { backgroundColor: color }]} />
        <View
          style={[
            styles.onlineIndicator,
            {
              backgroundColor: item.is_integrated
                ? Theme.positive
                : Theme.borderMedium,
            },
          ]}
        />
        <View style={styles.gridAvatarOverlap}>
          <View style={styles.gridAvatar}>
            <ConnectionEntityAvatar item={item} size={58} />
          </View>
        </View>
        <View style={styles.gridBody}>
          <Text style={styles.gridName} numberOfLines={2}>
            {item.name.toUpperCase()}
          </Text>
          <Text style={styles.gridHeadline} numberOfLines={2}>
            {roleSub}
            {item.is_integrated ? " · on Pulse" : " · Not on app"}
          </Text>
          <View style={styles.gridMutualRow}>
            <View
              style={[styles.gridMiniDot, { backgroundColor: Theme.iconSlate }]}
            />
            <Text style={styles.gridMutualText} numberOfLines={1}>
              In your Pulse network
            </Text>
          </View>
          <View
            style={[
              styles.gridRoleBadge,
              {
                backgroundColor: tone.bg,
                alignSelf: "center",
              },
            ]}
          >
            <Text
              style={[
                styles.gridRoleText,
                {
                  color: tone.text,
                },
              ]}
            >
              {item.role}
            </Text>
          </View>
        </View>
        <Pressable style={styles.gridConnectOutline} hitSlop={8}>
          <MessageCircle size={15} color={Theme.primary} strokeWidth={2.2} />
          <Text style={styles.gridConnectOutlineText}>Message</Text>
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

// ─── List Card ────────────────────────────────────────────────────────────────

function ListCard({ item }: { item: ConnectedOrg }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const tone = roleTone(item.role);

  const onIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Pressable onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={[styles.listCard, { transform: [{ scale }] }]}>
        <View style={styles.listAvatar}>
          <ConnectionEntityAvatar item={item} size={50} />
        </View>

        <View style={styles.listInfo}>
          <Text style={styles.listName} numberOfLines={1}>
            {item.name.toUpperCase()}
          </Text>
          <View style={styles.listBadges}>
            <View style={[styles.roleBadge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.roleText, { color: tone.text }]}>
                {item.role}
              </Text>
            </View>
            {item.is_integrated && (
              <View style={styles.appBadge}>
                <Zap size={8} color={Theme.positive} fill={Theme.positive} />
                <Text style={styles.appBadgeText}>ON APP</Text>
              </View>
            )}
          </View>
        </View>

        <Pressable style={styles.listMsgBtn} hitSlop={10}>
          <MessageCircle size={17} color={Theme.primary} strokeWidth={2} />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

/** For embedded parent ScrollView: non-scroll FlatList has no height; chunk into rows. */
function chunkForGrid<T>(items: T[], columns: number): T[][] {
  if (columns < 1) return [items];
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export function ConnectionsView({
  orgId,
  onRefresh,
  onOpenProfile,
  onPressMutuals,
  onPressMutual,
  onConnectionsComputed,
  embedded,
  hubMode = false,
  hubSearch,
  hubFilter,
  desktopMetronicGrid = false,
  desktopMetronicHorizontalScroll = false,
  hubSortMode = "recommended",
  onChatIntegrated,
  onVisiblePageChange,
}: ConnectionsViewProps) {
  const onConnectionsComputedRef = useRef(onConnectionsComputed);
  onConnectionsComputedRef.current = onConnectionsComputed;
  const windowWidth = useWebLayoutWidth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConnectionFilterTab>("ALL");
  const [isGrid, setIsGrid] = useState(!hubMode);
  const [refreshing, setRefreshing] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [clientRatingsById, setClientRatingsById] = useState<
    Record<string, number | null>
  >({});
  const [supplierRatingsById, setSupplierRatingsById] = useState<
    Record<string, number | null>
  >({});
  const [driverRatingsById, setDriverRatingsById] = useState<
    Record<string, number | null>
  >({});
  const [ratingsVersion, setRatingsVersion] = useState(0);
  const gridNumColumns = hubMode
    ? windowWidth >= SPLIT_STACK_BREAKPOINT
      ? NETWORK_HUB_CONNECTION_DESKTOP_COLUMNS
      : 1
    : windowWidth >= 1200
      ? 4
      : windowWidth >= 900
        ? 3
        : windowWidth >= SPLIT_STACK_BREAKPOINT
          ? 2
          : 1;

  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const tripPartyCountsQ = useTripPartyCountsQuery(orgId);
  const tripCountByClientId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, count] of Object.entries(
      tripPartyCountsQ.data?.byClientId ?? {},
    )) {
      map.set(id, count);
    }
    return map;
  }, [tripPartyCountsQ.data]);
  const tripCountBySupplierId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, count] of Object.entries(
      tripPartyCountsQ.data?.bySupplierId ?? {},
    )) {
      map.set(id, count);
    }
    return map;
  }, [tripPartyCountsQ.data]);
  const tripCountByDriverId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, count] of Object.entries(
      tripPartyCountsQ.data?.byDriverId ?? {},
    )) {
      map.set(id, count);
    }
    return map;
  }, [tripPartyCountsQ.data]);
  const locationLookupOrganizationIds = useMemo(
    () =>
      [
        ...new Set([
          ...(
            (clientsQ.data ?? []) as {
              id: string;
              linked_organization_id?: string | null;
            }[]
          )
            .map((row) => row.id)
            .filter((id): id is string => Boolean(id)),
          ...(
            (suppliersQ.data ?? []) as {
              id: string;
              linked_organization_id?: string | null;
            }[]
          )
            .map((row) => row.id)
            .filter((id): id is string => Boolean(id)),
          ...(
            (clientsQ.data ?? []) as {
              linked_organization_id?: string | null;
            }[]
          )
            .map((row) => row.linked_organization_id)
            .filter((id): id is string => Boolean(id)),
          ...(
            (suppliersQ.data ?? []) as {
              linked_organization_id?: string | null;
            }[]
          )
            .map((row) => row.linked_organization_id)
            .filter((id): id is string => Boolean(id)),
        ]),
      ].sort(),
    [clientsQ.data, suppliersQ.data],
  );
  const organizationLocationsQ = useQuery({
    queryKey: [
      "network",
      "connections",
      "organization-locations",
      locationLookupOrganizationIds,
    ],
    queryFn: async () => {
      const { error: orgErr, locations } = await getOrganizationLocationsByIds(
        locationLookupOrganizationIds,
      );
      if (orgErr) {
        if (__DEV__)
          console.warn(
            "[ConnectionsView] organization locations:",
            orgErr.message,
          );
        return [];
      }
      return locations;
    },
    enabled: locationLookupOrganizationIds.length > 0,
  });
  const locationLookupNames = useMemo(
    () =>
      [
        ...new Set([
          ...((clientsQ.data ?? []) as { name?: string | null }[])
            .map((row) => normalizeName(row.name))
            .filter(Boolean),
          ...((suppliersQ.data ?? []) as { name?: string | null }[])
            .map((row) => normalizeName(row.name))
            .filter(Boolean),
        ]),
      ].sort(),
    [clientsQ.data, suppliersQ.data],
  );
  const organizationLocationsByNameQ = useQuery({
    queryKey: [
      "network",
      "connections",
      "organization-locations-by-name",
      locationLookupNames,
    ],
    queryFn: async () => {
      const { error: orgErr, locations } =
        await getOrganizationLocationsByNames(locationLookupNames);
      if (orgErr) {
        if (__DEV__)
          console.warn(
            "[ConnectionsView] organization locations by name:",
            orgErr.message,
          );
        return [];
      }
      return locations;
    },
    enabled: locationLookupNames.length > 0,
  });
  const organizationLocationById = useMemo(() => {
    const map: Record<
      string,
      { city: string | null; state: string | null; address_line: string | null }
    > = {};
    for (const location of organizationLocationsQ.data ?? []) {
      map[location.id] = {
        city: location.city ?? null,
        state: location.state ?? null,
        address_line: location.address_line ?? null,
      };
    }
    return map;
  }, [organizationLocationsQ.data]);
  const organizationLocationByName = useMemo(() => {
    const map: Record<
      string,
      { city: string | null; state: string | null; address_line: string | null }
    > = {};
    for (const location of organizationLocationsByNameQ.data ?? []) {
      const key = normalizeName((location as { name?: string | null }).name);
      if (!key) continue;
      map[key] = {
        city: location.city ?? null,
        state: location.state ?? null,
        address_line: location.address_line ?? null,
      };
    }
    return map;
  }, [organizationLocationsByNameQ.data]);

  const linkedOrgIdsForKyc = useMemo(
    () =>
      [
        ...new Set(
          [
            ...((clientsQ.data ?? []) as { linked_organization_id?: string | null }[])
              .map((row) => row.linked_organization_id)
              .filter((id): id is string => Boolean(id)),
            ...((suppliersQ.data ?? []) as { linked_organization_id?: string | null }[])
              .map((row) => row.linked_organization_id)
              .filter((id): id is string => Boolean(id)),
          ],
        ),
      ].sort(),
    [clientsQ.data, suppliersQ.data],
  );

  const linkedOrgDisplay = useLinkedOrgDisplayMap(linkedOrgIdsForKyc);
  const kycByLinkedOrgId = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const [id, row] of Object.entries(linkedOrgDisplay)) {
      out[id] = isOrgKycVerified({
        verification_status: row.verificationStatus,
      });
    }
    return out;
  }, [linkedOrgDisplay]);


  useEffect(() => {
    let cancelled = false;
    const clientIds = (
      (clientsQ.data ?? []) as {
        id: string;
        linked_organization_id?: string | null;
      }[]
    )
      .flatMap((c) => [c.id, c.linked_organization_id])
      .filter((id): id is string => Boolean(id));
    if (clientIds.length === 0) {
      setClientRatingsById({});
      return;
    }
    getRatingsForClients(clientIds).then(({ byClientId }) => {
      if (cancelled) return;
      const next: Record<string, number | null> = {};
      const clients = (clientsQ.data ?? []) as Array<{
        id: string;
        linked_organization_id?: string | null;
      }>;
      for (const c of clients) {
        const score = averageRatingForRatedParty(
          byClientId,
          c.id,
          c.linked_organization_id,
        );
        next[c.id] = score;
        if (c.linked_organization_id) {
          next[c.linked_organization_id] = score;
        }
      }
      for (const id of clientIds) {
        if (next[id] === undefined) {
          next[id] = averageScoreDeduped(byClientId[id] ?? []);
        }
      }
      setClientRatingsById(next);
    });
    return () => {
      cancelled = true;
    };
  }, [clientsQ.data, ratingsVersion]);

  useEffect(() => {
    let cancelled = false;
    const supplierIds = (
      (suppliersQ.data ?? []) as Array<{
        id: string;
        linked_organization_id?: string | null;
      }>
    )
      .flatMap((s) => [s.id, s.linked_organization_id])
      .filter((id): id is string => Boolean(id));
    if (supplierIds.length === 0) {
      setSupplierRatingsById({});
      return;
    }
    getRatingsForSuppliers(supplierIds).then(({ bySupplierId }) => {
      if (cancelled) return;
      const next: Record<string, number | null> = {};
      const supplierRows = (suppliersQ.data ?? []) as Array<{
        id: string;
        linked_organization_id?: string | null;
      }>;
      for (const s of supplierRows) {
        const score = averageRatingForRatedParty(
          bySupplierId,
          s.id,
          s.linked_organization_id,
        );
        next[s.id] = score;
        if (s.linked_organization_id) {
          next[s.linked_organization_id] = score;
        }
      }
      for (const id of supplierIds) {
        if (next[id] === undefined) {
          next[id] = averageScoreDeduped(bySupplierId[id] ?? []);
        }
      }
      setSupplierRatingsById(next);
    });
    return () => {
      cancelled = true;
    };
  }, [suppliersQ.data, ratingsVersion]);

  useEffect(() => {
    let cancelled = false;
    const driverIds = (driversQ.data ?? [])
      .filter((d) => !d.left_at)
      .map((d) => d.id);
    if (driverIds.length === 0) {
      setDriverRatingsById({});
      return;
    }
    getRatingsForDrivers(driverIds).then(({ byDriverId }) => {
      if (cancelled) return;
      const next: Record<string, number | null> = {};
      driverIds.forEach((id) => {
        next[id] = averageScoreDeduped(byDriverId[id] ?? []);
      });
      setDriverRatingsById(next);
    });
    return () => {
      cancelled = true;
    };
  }, [driversQ.data, ratingsVersion]);

  const effectiveSearch = hubMode ? (hubSearch ?? "") : search;
  const effectiveFilter: ConnectionFilterTab = hubMode
    ? (hubFilter ?? "ALL")
    : filter;

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      clientsQ.refetch(),
      suppliersQ.refetch(),
      driversQ.refetch(),
    ]);
    setRatingsVersion((version) => version + 1);
    setRefreshing(false);
    onRefresh?.();
  };

  const connections = useMemo<ConnectedOrg[]>(() => {
    const clients: ConnectedOrg[] = (
      (clientsQ.data ?? []) as {
        id: string;
        name: string;
        phone?: string | null;
        linked_organization_id?: string | null;
        is_integrated?: boolean;
        avatar_url?: string | null;
        avatar_seed?: string | null;
        mutual_count?: number | null;
        mutual_connections_count?: number | null;
        rating?: number | null;
        average_rating?: number | null;
        city?: string | null;
        state?: string | null;
        location?: string | null;
        business_location?: string | null;
        headquarters?: string | null;
      }[]
    ).map((c) => ({
      id: c.id,
      name: c.name,
      role: "CLIENT" as const,
      is_integrated: c.is_integrated ?? Boolean(c.linked_organization_id),
      is_kyc_verified: Boolean(
        c.linked_organization_id &&
          kycByLinkedOrgId[c.linked_organization_id],
      ),
      avatar_url: c.avatar_url ?? null,
      avatar_seed: c.avatar_seed ?? null,
      mutual_count: c.mutual_count ?? c.mutual_connections_count ?? null,
      rating: firstFiniteRating(
        clientRatingsById[c.id],
        c.linked_organization_id
          ? clientRatingsById[c.linked_organization_id]
          : null,
      ),
      phone: c.phone ?? null,
      linked_organization_id: c.linked_organization_id ?? null,
      city:
        c.city ??
        organizationLocationById[c.linked_organization_id ?? ""]?.city ??
        organizationLocationById[c.id]?.city ??
        organizationLocationByName[normalizeName(c.name)]?.city ??
        null,
      state:
        c.state ??
        organizationLocationById[c.linked_organization_id ?? ""]?.state ??
        organizationLocationById[c.id]?.state ??
        organizationLocationByName[normalizeName(c.name)]?.state ??
        null,
      location: c.location ?? null,
      business_location: c.business_location ?? null,
      headquarters: c.headquarters ?? null,
      total_trips: tripCountByClientId.get(c.id) ?? null,
    }));

    const suppliers: ConnectedOrg[] = (
      (suppliersQ.data ?? []) as {
        id: string;
        name: string | null;
        phone?: string | null;
        linked_organization_id?: string | null;
        supplier_type?: string | null;
        is_integrated?: boolean;
        avatar_url?: string | null;
        avatar_seed?: string | null;
        mutual_count?: number | null;
        mutual_connections_count?: number | null;
        rating?: number | null;
        average_rating?: number | null;
        city?: string | null;
        state?: string | null;
        location?: string | null;
        business_location?: string | null;
        headquarters?: string | null;
      }[]
    ).map((s) => ({
      id: s.id,
      name: s.name ?? "Supplier",
      role: "SUPPLIER" as const,
      is_integrated:
        s.is_integrated ??
        (s.supplier_type === "integrated" || Boolean(s.linked_organization_id)),
      is_kyc_verified: Boolean(
        s.linked_organization_id &&
          kycByLinkedOrgId[s.linked_organization_id],
      ),
      avatar_url: s.avatar_url ?? null,
      avatar_seed: s.avatar_seed ?? null,
      mutual_count: s.mutual_count ?? s.mutual_connections_count ?? null,
      rating: firstFiniteRating(
        supplierRatingsById[s.id],
        s.linked_organization_id
          ? supplierRatingsById[s.linked_organization_id]
          : null,
      ),
      phone: s.phone ?? null,
      linked_organization_id: s.linked_organization_id ?? null,
      city:
        s.city ??
        organizationLocationById[s.linked_organization_id ?? ""]?.city ??
        organizationLocationById[s.id]?.city ??
        organizationLocationByName[normalizeName(s.name)]?.city ??
        null,
      state:
        s.state ??
        organizationLocationById[s.linked_organization_id ?? ""]?.state ??
        organizationLocationById[s.id]?.state ??
        organizationLocationByName[normalizeName(s.name)]?.state ??
        null,
      location: s.location ?? null,
      business_location: s.business_location ?? null,
      headquarters: s.headquarters ?? null,
      total_trips: tripCountBySupplierId.get(s.id) ?? null,
    }));

    const driverRows = driversQ.data ?? [];
    const drivers: ConnectedOrg[] = driverRows
      .filter((d) => !d.left_at)
      .map((d) => ({
        id: `driver-${d.id}`,
        name: d.name,
        role: "DRIVER" as const,
        is_integrated: !!d.user_id,
        avatar_url: d.avatar_url ?? null,
        avatar_seed: d.avatar_seed ?? null,
        mutual_count:
          (
            d as {
              mutual_count?: number | null;
              mutual_connections_count?: number | null;
            }
          ).mutual_count ??
          (
            d as {
              mutual_count?: number | null;
              mutual_connections_count?: number | null;
            }
          ).mutual_connections_count ??
          null,
        rating: firstFiniteRating(driverRatingsById[d.id]),
        phone: (d as { phone?: string | null }).phone ?? null,
        city: (d as { city?: string | null }).city ?? null,
        state: (d as { state?: string | null }).state ?? null,
        location: (d as { location?: string | null }).location ?? null,
        business_location:
          (d as { business_location?: string | null }).business_location ??
          null,
        headquarters:
          (d as { headquarters?: string | null }).headquarters ?? null,
        total_trips: tripCountByDriverId.get(d.id) ?? null,
      }));

    let all = [...clients, ...suppliers, ...drivers];
    if (effectiveFilter !== "ALL")
      all = all.filter((c) => c.role === effectiveFilter);
    if (effectiveSearch.trim()) {
      const q = effectiveSearch.toLowerCase();
      all = all.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (hubSortMode === "active") {
      all.sort(
        (a, b) =>
          (b.total_trips ?? 0) - (a.total_trips ?? 0) ||
          a.name.localeCompare(b.name),
      );
    } else {
      all.sort((a, b) => a.name.localeCompare(b.name));
    }
    return all;
  }, [
    clientsQ.data,
    suppliersQ.data,
    driversQ.data,
    effectiveSearch,
    effectiveFilter,
    hubSortMode,
    clientRatingsById,
    supplierRatingsById,
    driverRatingsById,
    organizationLocationById,
    organizationLocationByName,
    kycByLinkedOrgId,
    tripCountByClientId,
    tripCountBySupplierId,
    tripCountByDriverId,
  ]);

  const isNativeApp = Platform.OS !== "web";
  const hubConnectionsLayout = useMemo(
    () => getNetworkHubConnectionsLayout(windowWidth, { nativeApp: isNativeApp }),
    [windowWidth, isNativeApp],
  );
  const metronicConnectionsLayout = useMemo(
    () => getNetworkHubMetronicConnectionsLayout(windowWidth),
    [windowWidth],
  );
  const connectionsPaginationKey = `${effectiveFilter}:${effectiveSearch}:${hubConnectionsLayout.columns}x${hubConnectionsLayout.rows}`;
  const metronicPaginationKey = `${effectiveFilter}:${effectiveSearch}:${metronicConnectionsLayout.columns}x${metronicConnectionsLayout.rows}`;

  const inviteOffAppParty = async (item: ConnectedOrg) => {
    if (item.is_integrated) return;
    if (!item.phone?.trim()) {
      Alert.alert(
        "Phone missing",
        `Add a phone number for ${item.name} before sending an invite.`,
      );
      return;
    }

    setInvitingId(item.id);
    try {
      await runConnectionInvite(orgId, item, async () => {
        await Promise.all([clientsQ.refetch(), suppliersQ.refetch()]);
      });
    } finally {
      setInvitingId(null);
    }
  };

  const isLoading =
    clientsQ.isLoading || suppliersQ.isLoading || driversQ.isLoading;
  const total =
    ((clientsQ.data ?? []) as unknown[]).length +
    ((suppliersQ.data ?? []) as unknown[]).length +
    (driversQ.data ?? []).filter((d) => !d.left_at).length;
  const useHubLayout = hubMode;

  const gridRows = useMemo(
    () => chunkForGrid(connections, gridNumColumns),
    [connections, gridNumColumns],
  );
  const showChrome = !hubMode;

  useEffect(() => {
    onConnectionsComputedRef.current?.(connections);
  }, [connections]);

  const isMobileHub = windowWidth < SPLIT_STACK_BREAKPOINT;
  const hubListCompact =
    !isMobileHub &&
    (hubConnectionsLayout.columns >= 3 ? windowWidth < 1280 : windowWidth < 1100);

  const renderHubConnectionListCard = (item: ConnectedOrg) => (
    <ConnectionProfileCard
      item={item}
      compact={hubListCompact}
      mobileGrid={hubConnectionsLayout.columns > 1}
      chatHubTile={hubConnectionsLayout.rows >= 2}
      nativeListRow={false}
      onOpenProfile={onOpenProfile}
      onPressMutuals={onPressMutuals}
      onPressMutual={onPressMutual}
      viewerOrgId={orgId}
      onConnectionAction={() => void inviteOffAppParty(item)}
      actionLoading={invitingId === item.id}
    />
  );

  const renderMetronicGridBody = () => (
    <NetworkHubConnectionsPagedGrid
      items={connections}
      layout={metronicConnectionsLayout}
      resetKey={`metronic:${metronicPaginationKey}`}
      keyExtractor={(item) => `${item.role}-${item.id}`}
      onVisiblePageChange={onVisiblePageChange}
      contentPaddingHorizontal={0}
      renderItem={(item) => (
        <NetworkDesktopConnectionCard
          item={item}
          onPress={onOpenProfile ? () => onOpenProfile(item) : undefined}
          onInvite={() => void inviteOffAppParty(item)}
          onChat={
            item.is_integrated && item.linked_organization_id && onChatIntegrated
              ? () => onChatIntegrated(item)
              : undefined
          }
          actionLoading={invitingId === item.id}
        />
      )}
    />
  );

  const metronicHorizontalCardWidth = useMemo(() => {
    const visibleCols = 4;
    const gap = 12;
    const pad = NETWORK_HUB_GRID_ROW_PADDING_H * 2;
    return Math.max(
      160,
      Math.floor((windowWidth - pad - gap * (visibleCols - 1)) / visibleCols),
    );
  }, [windowWidth]);

  const renderMetronicHorizontalScrollBody = () => (
    <View style={styles.metronicHorizontalScrollWrap}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.metronicHorizontalScroll}
        contentContainerStyle={styles.metronicHorizontalScrollContent}
      >
        {connections.map((item) => (
          <View
            key={`${item.role}-${item.id}`}
            style={[
              styles.metronicHorizontalCard,
              { width: metronicHorizontalCardWidth },
            ]}
          >
            <NetworkDesktopConnectionCard
              item={item}
              onPress={onOpenProfile ? () => onOpenProfile(item) : undefined}
              onInvite={() => void inviteOffAppParty(item)}
              onChat={
                item.is_integrated && item.linked_organization_id && onChatIntegrated
                  ? () => onChatIntegrated(item)
                  : undefined
              }
              actionLoading={invitingId === item.id}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );

  const renderHubConnectionsBody = () =>
    desktopMetronicGrid ? (
      desktopMetronicHorizontalScroll ? (
        renderMetronicHorizontalScrollBody()
      ) : (
        renderMetronicGridBody()
      )
    ) : (
      <NetworkHubConnectionsPagedGrid
        items={connections}
        layout={hubConnectionsLayout}
        resetKey={connectionsPaginationKey}
        keyExtractor={(item) => `${item.role}-${item.id}`}
        renderItem={renderHubConnectionListCard}
        onVisiblePageChange={onVisiblePageChange}
      />
    );

  const embeddedBody = useHubLayout ? (
    isLoading ? (
      <View style={styles.embeddedLoading}>
        <LoadingIndicator color={Theme.primary} size="small" />
        <Text style={styles.embeddedLoadingText}>Loading your network…</Text>
      </View>
    ) : connections.length === 0 ? (
      <View style={styles.embeddedEmptyWrap}>
        <EmptyState />
      </View>
    ) : (
      <View style={styles.connectionsPhotoSurface}>
        <Image
          source={CONNECTIONS_BODY_WATERMARK}
          style={[
            styles.connectionsPhotoWatermark,
            isMobileHub && styles.connectionsPhotoWatermarkCompact,
          ]}
          resizeMode="contain"
          // ImageProps omits pointerEvents; RN / RN-web still honour it on Image.
          {...({ pointerEvents: "none" } as object)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        {renderHubConnectionsBody()}
      </View>
    )
  ) : isLoading ? (
    <View style={styles.embeddedLoading}>
      <LoadingIndicator color={Theme.primary} size="small" />
      <Text style={styles.embeddedLoadingText}>Loading your network…</Text>
    </View>
  ) : connections.length === 0 ? (
    <View style={styles.embeddedEmptyWrap}>
      <EmptyState />
    </View>
  ) : isGrid ? (
    <View style={styles.embeddedGridRoot}>
      {gridRows.map((row, ri) => (
        <View key={`conn-row-${ri}`} style={styles.gridRowEmbedded}>
          {row.map((item) => (
            <GridCard key={`grid-${item.role}-${item.id}`} item={item} />
          ))}
        </View>
      ))}
    </View>
  ) : (
    <View style={styles.listContentEmbedded}>
      {connections.map((item) => (
        <ListCard key={`list-${item.role}-${item.id}`} item={item} />
      ))}
    </View>
  );

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      {showChrome ? (
        <>
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {(clientsQ.data ?? []).length}
              </Text>
              <Text style={[styles.statLabel, { color: Theme.primary }]}>
                Clients
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {(suppliersQ.data ?? []).length}
              </Text>
              <Text style={[styles.statLabel, { color: Theme.positive }]}>
                Suppliers
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {(driversQ.data ?? []).filter((d) => !d.left_at).length}
              </Text>
              <Text style={[styles.statLabel, { color: Theme.warning }]}>
                Drivers
              </Text>
            </View>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Search size={15} color={Theme.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search your network..."
                placeholderTextColor={Theme.textSecondary}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
            </View>
            <Pressable
              style={[styles.viewToggle, !isGrid && styles.viewToggleActive]}
              onPress={() => setIsGrid(false)}
            >
              <List size={16} color={!isGrid ? "#fff" : Theme.textSecondary} />
            </Pressable>
            <Pressable
              style={[styles.viewToggle, isGrid && styles.viewToggleActive]}
              onPress={() => setIsGrid(true)}
            >
              <LayoutGrid
                size={16}
                color={isGrid ? "#fff" : Theme.textSecondary}
              />
            </Pressable>
          </View>

          <View style={styles.filterRow}>
            {(
              ["ALL", "CLIENT", "SUPPLIER", "DRIVER"] as ConnectionFilterTab[]
            ).map((t) => (
              <Pressable
                key={t}
                style={[
                  styles.filterTab,
                  filter === t && styles.filterTabActive,
                ]}
                onPress={() => setFilter(t)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    filter === t && styles.filterTabTextActive,
                  ]}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {embedded ? (
        embeddedBody
      ) : isLoading ? (
        <LoadingIndicator color={Theme.primary} style={{ marginTop: 48 }} />
      ) : useHubLayout ? (
        connections.length === 0 ? (
          <View style={styles.listContent}>
            <EmptyState />
          </View>
        ) : (
          <View style={[styles.listContent, networkCompactListStyle]}>
            {renderHubConnectionsBody()}
          </View>
        )
      ) : isGrid ? (
        <FlashList
          key="grid"
          data={connections}
          keyExtractor={(item) => `grid-${item.role}-${item.id}`}
          numColumns={gridNumColumns}
          renderItem={({ item }) => <GridCard item={item} />}
          contentContainerStyle={styles.gridList}
          showsVerticalScrollIndicator={false}
          scrollEnabled
          nestedScrollEnabled
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Theme.primary}
            />
          }
          ListEmptyComponent={<EmptyState />}
        />
      ) : (
        <FlashList
          key="list"
          data={connections}
          keyExtractor={(item) => `list-${item.role}-${item.id}`}
          renderItem={({ item }) => <ListCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled
          nestedScrollEnabled
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Theme.primary}
            />
          }
          ListEmptyComponent={<EmptyState />}
        />
      )}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyBanner}>
      <NetworkGrowBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.networkPageBackground },
  containerEmbedded: {
    flex: 0,
    flexGrow: 0,
    backgroundColor: "transparent",
  },
  embeddedLoading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 10,
  },
  embeddedLoadingText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  compactList: {},
  hubGridRoot: {
    width: "100%",
    gap: 8,
    paddingBottom: 4,
  },
  hubScrollWrap: {
    width: "100%",
  },
  hubScrollLoadMore: {
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    paddingTop: 4,
  },
  hubListVertical: {
    width: "100%",
    gap: 8,
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    paddingBottom: 4,
  },
  hubListLoadMore: {
    width: "100%",
    paddingTop: 4,
  },
  embeddedEmptyWrap: {
    minHeight: 200,
    paddingBottom: 16,
    paddingHorizontal: 14,
  },
  /** Avatar grid sits inside the connections hub card shell. */
  connectionsPhotoSurface: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "transparent",
    paddingTop: 4,
    paddingBottom: 8,
    overflow: "visible",
    position: "relative",
  },
  connectionsPhotoWatermark: {
    position: "absolute",
    width: 190,
    height: 190 / CONNECTIONS_BODY_WATERMARK_ASPECT,
    right: 8,
    top: 8,
    opacity: 0.17,
    zIndex: 0,
    ...(Platform.OS === "web" ? { mixBlendMode: "multiply" as const } : null),
  },
  connectionsPhotoWatermarkCompact: {
    width: 150,
    height: 150 / CONNECTIONS_BODY_WATERMARK_ASPECT,
    right: 4,
    top: 12,
    opacity: 0.15,
  },
  metronicGridRoot: {
    width: "100%",
    paddingBottom: 8,
    ...(Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          alignItems: "stretch",
        } as object)
      : {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
        }),
  },
  metronicGridRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  metronicGridCell: {
    minWidth: 0,
    ...(Platform.OS === "web"
      ? { width: "100%" }
      : { width: "47%", flexGrow: 1 }),
  },
  metronicHorizontalScrollWrap: {
    width: "100%",
    minHeight: 200,
    overflow: "visible",
  },
  metronicHorizontalScroll: {
    width: "100%",
    minHeight: 200,
    flexGrow: 0,
  },
  metronicHorizontalScrollContent: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 10,
    minHeight: 200,
  },
  metronicHorizontalCard: {
    flexShrink: 0,
    minWidth: 0,
    alignSelf: "stretch",
  },
  embeddedGridRoot: { paddingBottom: 8 },
  gridRowEmbedded: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    gap: NETWORK_HUB_GRID_GAP_PX,
  },
  listContentEmbedded: { paddingHorizontal: 22, paddingBottom: 16, gap: 8 },

  statsBar: {
    flexDirection: "row",
    backgroundColor: Theme.networkCardBackground,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.networkCardBorder,
  },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
    color: Theme.textPrimary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surfaceBorder,
    marginVertical: 4,
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 14,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 12,
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.textPrimary,
    fontWeight: "500",
  },
  viewToggle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggleActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.primary,
  },

  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Theme.networkCardBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkCardBorder,
  },
  filterTabActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.primary,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.5,
  },
  filterTabTextActive: { color: Theme.buttonPrimaryText },

  // Grid layout
  gridList: { paddingHorizontal: 8, paddingBottom: 40 },
  gridRow: { flexDirection: "row", gap: 0, alignItems: "flex-start" },
  gridCardWrap: { flex: 1, padding: 4, minWidth: 0 },
  gridCard: {
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkCardBorder,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    position: "relative",
    overflow: "hidden",
    paddingBottom: 12,
  },
  gridCover: {
    height: 56,
    width: "100%",
  },
  gridAvatarOverlap: {
    marginTop: -32,
    alignItems: "center",
    zIndex: 2,
  },
  gridBody: { paddingHorizontal: 12, paddingTop: 4, alignItems: "center" },
  gridHeadline: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 14,
    marginTop: 4,
  },
  gridMutualRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  gridMiniDot: { width: 6, height: 6, borderRadius: 3 },
  gridMutualText: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    flex: 1,
  },
  gridConnectOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 10,
    marginTop: 10,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Theme.primary,
  },
  gridConnectOutlineText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
    letterSpacing: 0.1,
  },
  onlineIndicator: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 3,
  },
  gridRoleBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  gridRoleText: { fontSize: 8, fontWeight: "600", letterSpacing: 0.25 },
  gridAvatar: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  gridName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#475569",
    textAlign: "center",
    marginTop: 2,
    lineHeight: 16,
    letterSpacing: 0.1,
  },

  // List layout
  listContent: { paddingHorizontal: 14, paddingBottom: 40, gap: 8 },
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.networkCardBorder,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  listAvatar: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  listInfo: { flex: 1, gap: 5 },
  listName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#475569",
    letterSpacing: 0.08,
  },
  listBadges: { flexDirection: "row", alignItems: "center", gap: 6 },
  roleBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  roleText: { fontSize: 9, fontWeight: "500", letterSpacing: 0.2 },
  appBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: `${Theme.positive}18`,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  appBadgeText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.positive,
    letterSpacing: 0.25,
  },
  listMsgBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: Theme.networkMessageTintBg,
    borderWidth: 1,
    borderColor: Theme.networkMessageTintBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyBanner: {
    width: "100%",
    alignSelf: "stretch",
    paddingTop: 4,
    paddingBottom: 8,
  },
});
