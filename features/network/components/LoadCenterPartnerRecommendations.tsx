/**
 * Load Center — suggested partners widget (Give / Get).
 * Give: asset-owning suppliers. Get: aggregators sharing market indents.
 * Mobile (`compact`): collapsible chip header to keep the load list uncluttered.
 * Avatar / row tap opens the same public org profile modal as Network Discover.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import Theme from "@/constants/Theme";
import {
  CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE,
  CONNECTION_REQUEST_DAILY_LIMIT_TITLE,
  cancelPendingConnectionRequestByOrgPair,
  createConnectionRequest,
  DAILY_CONNECTION_INVITE_LIMIT,
  looksLikeConnectionRateLimitError,
} from "@/features/connections/services/connectionRequests.service";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import {
  NetworkProfileModalBody,
  type NetworkProfileModalNode,
} from "@/features/network/components/NetworkProfileModalBody";
import { useNetworkDiscovery } from "@/features/network/hooks/useNetworkDiscovery";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import {
  getDiscoverOrgLocation,
  growRowAccentColor,
  loadCenterRecommendMatchLine,
  pickLoadCenterRecommendations,
  type LoadCenterRecommendMode,
  type ScoredDiscoverOrg,
} from "@/features/network/utils/discoverRecommendations.util";
import { isRegisteredOrgId } from "@/features/network/utils/networkActions.util";
import { maskGstin } from "@/features/network/utils/partyContactDisplay.util";
import { useEnsureVerified } from "@/features/network/utils/verifiedActionGuard";
import { showAppAlert } from "@/lib/appAlert";
import {
  peekNetworkProfileSnapshot,
  prefetchNetworkProfileSnapshot,
  useNetworkProfileSnapshotQuery,
} from "@/lib/queries/useNetworkProfileSnapshotQuery";
import { peekLinkedOrgDisplayProfile } from "@/lib/queries/linkedOrgDisplayCache";
import {
  buildNetworkProfileSeed,
  hasSeededNetworkProfileHeroStats,
  preferProfileConnectionStatus,
} from "@/features/network/utils/networkProfileBootstrap.util";
import {
  useConnectionRequestsSentQuery,
  useInvalidateNetwork,
} from "@/lib/queries/useNetworkQueries";
import { todayPendingInviteCountFromSent } from "@/lib/todayPendingInviteCount";
import { ChevronDown, ChevronUp, Sparkles, UserPlus, X } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const RECOMMENDATION_LIMIT = 6;

type Props = {
  orgId: string;
  mode: LoadCenterRecommendMode;
  onOpenProfile?: (org: DiscoverOrg) => void;
  onViewAll?: () => void;
  /**
   * Mobile / full-width strip: tighter rows + collapsible header
   * (starts minimized so loads stay primary).
   */
  compact?: boolean;
  /** Discover is expensive — keep off until Load primary lists have settled. */
  enabled?: boolean;
  /** Fill a fixed-height parent and scroll the list so the card does not grow. */
  fillHeight?: boolean;
  style?: ViewStyle;
};

function RecommendationRow({
  org,
  roleLabel,
  locationLabel,
  matchPrefix,
  matchHighlight,
  accentColor,
  pending,
  connecting,
  isLast,
  striped,
  compact,
  onOpenProfile,
  onPrefetchProfile,
  onDismiss,
  onConnect,
  onCancel,
}: {
  org: ScoredDiscoverOrg;
  roleLabel: string;
  locationLabel: string;
  matchPrefix: string;
  matchHighlight: string;
  accentColor: string;
  pending: boolean;
  connecting: boolean;
  isLast: boolean;
  striped: boolean;
  compact?: boolean;
  onOpenProfile?: () => void;
  onPrefetchProfile?: () => void;
  onDismiss: () => void;
  onConnect: () => void;
  onCancel: () => void;
}) {
  const trips =
    typeof org.trip_count === "number" && org.trip_count >= 0
      ? org.trip_count
      : 0;

  return (
    <View
      style={[
        styles.salesGrowRow,
        compact && local.rowCompact,
        striped && styles.salesGrowRowStripe,
        isLast && styles.salesGrowRowLast,
      ]}
    >
      <Pressable
        onPress={onOpenProfile}
        onPressIn={onPrefetchProfile}
        disabled={!onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel={`View ${org.name} public profile`}
        style={(state: HoverPressState) => [
          styles.salesGrowRowMain,
          WEB_TRANSITION,
          onOpenProfile && WEB_POINTER,
          onOpenProfile && isHovered(state) && hoverRowWash,
          state.pressed && onOpenProfile && styles.salesGrowRowHeadPressed,
        ]}
      >
        <PartyAvatar
          name={org.name}
          initialsColorSeed={org.id}
          organizationImageUrl={org.avatar_url}
          avatarUrl={org.avatar_url}
          avatarSeed={org.avatar_seed}
          entityType="supplier"
          size={compact ? 34 : 30}
        />

        <View style={styles.salesGrowRowBody}>
          <View style={styles.salesGrowNameRow}>
            <Text style={styles.salesGrowRowName} numberOfLines={1}>
              {org.name}
            </Text>
            <View
              style={[
                styles.salesGrowRoleBadge,
                roleLabel !== "Supplier" && styles.salesGrowRoleBadgeClient,
              ]}
            >
              <Text
                style={[
                  styles.salesGrowRoleBadgeText,
                  roleLabel !== "Supplier" &&
                    styles.salesGrowRoleBadgeTextClient,
                ]}
              >
                {roleLabel}
              </Text>
            </View>
          </View>

          <Text style={styles.salesGrowMatchLine} numberOfLines={1}>
            {matchPrefix ? (
              <Text style={styles.salesGrowMatchMuted}>{matchPrefix}</Text>
            ) : null}
            <Text
              style={[styles.salesGrowMatchHighlight, { color: accentColor }]}
            >
              {matchHighlight}
            </Text>
          </Text>

          <Text style={styles.salesGrowRowMeta} numberOfLines={1}>
            {locationLabel} · {trips} trips
          </Text>
        </View>

        <Pressable
          onPress={(e) => {
            e?.stopPropagation?.();
            onDismiss();
          }}
          hitSlop={8}
          style={styles.salesGrowDismissIcon}
          accessibilityLabel="Dismiss suggestion"
        >
          <X size={11} color={METRONIC.muted} strokeWidth={2.4} />
        </Pressable>
      </Pressable>

      {pending ? (
        <View
          style={[
            styles.salesGrowPendingRow,
            compact && local.actionRowCompact,
          ]}
        >
          <Text style={styles.salesGrowPendingLabel}>Request sent</Text>
          <Pressable onPress={onCancel} disabled={connecting} hitSlop={6}>
            <Text style={styles.salesGrowPendingCancel}>
              {connecting ? "…" : "Cancel"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.salesGrowActionRow,
            compact ? local.actionRowCompact : local.actionRowSidebar,
          ]}
        >
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.salesGrowActionGhost,
              compact && local.ghostCompact,
              pressed && styles.salesGrowActionPressed,
            ]}
          >
            <Text style={styles.salesGrowActionGhostText}>Dismiss</Text>
          </Pressable>
          <Pressable
            onPress={onConnect}
            disabled={connecting}
            style={({ pressed }) => [
              styles.salesGrowActionSend,
              compact && local.sendCompact,
              pressed && styles.salesGrowActionPressed,
            ]}
          >
            <UserPlus
              size={12}
              color={Theme.loadAddButtonText}
              strokeWidth={2.4}
            />
            <Text style={styles.salesGrowActionSendText}>
              {connecting ? "…" : "Send"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function LoadCenterPartnerRecommendations({
  orgId,
  mode,
  onOpenProfile,
  compact = false,
  enabled = true,
  fillHeight = false,
  style,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobileLayout = width < 768 || Platform.OS !== "web";
  const { orgs, loading, error, refetch, invalidateCache } = useNetworkDiscovery({
    orgId,
    search: "",
    enabled,
  });
  const sentQ = useConnectionRequestsSentQuery(enabled ? orgId : null);
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  /** Mobile starts collapsed so the load list stays primary. */
  const [expanded, setExpanded] = useState(!compact);
  const ensureVerified = useEnsureVerified();
  /** Same public profile sheet as Network Discover when parent does not override. */
  const [profileNode, setProfileNode] = useState<NetworkProfileModalNode | null>(
    null,
  );
  const [profileTrips, setProfileTrips] = useState<number | null>(null);

  const profileTargetId =
    profileNode && isRegisteredOrgId(profileNode.id) ? profileNode.id : null;
  const queryClient = useQueryClient();
  const profileSnapshotQ = useNetworkProfileSnapshotQuery(orgId, profileTargetId);
  const profileStatsLoading = Boolean(
    profileTargetId &&
      profileSnapshotQ.isPending &&
      !hasSeededNetworkProfileHeroStats({
        totalTrips: profileTrips,
        vehicleCount: profileNode?.vehicle_count,
        indentCount: profileNode?.indent_count,
        phone: profileNode?.phone,
      }),
  );

  useEffect(() => {
    const snap = profileSnapshotQ.data;
    if (!snap || !profileTargetId || snap.id !== profileTargetId) return;
    setProfileTrips(snap.total_trips ?? 0);
    setProfileNode((prev) => {
      if (!prev || prev.id !== profileTargetId) return prev;
      const next = {
        ...prev,
        name: snap.name?.trim() || prev.name,
        type: snap.type ?? prev.type,
        location:
          snap.location && snap.location !== "Not available"
            ? snap.location
            : prev.location && prev.location !== "Not available"
              ? prev.location
              : snap.location,
        status:
          preferProfileConnectionStatus(prev.status, snap.status) ?? prev.status,
        rating: snap.rating ?? prev.rating,
        mutuals:
          typeof snap.mutuals === "number" ? snap.mutuals : prev.mutuals,
        phone: snap.phone ?? prev.phone,
        avatar_url: snap.avatar_url ?? prev.avatar_url,
        avatar_seed: snap.avatar_seed ?? prev.avatar_seed,
        is_integrated: snap.is_integrated ?? prev.is_integrated,
        is_kyc_verified: snap.is_kyc_verified ?? prev.is_kyc_verified,
        registered_address: snap.registered_address ?? null,
        branch_count: snap.branch_count ?? 0,
        sector: snap.sector ?? null,
        website: snap.website ?? null,
        gstin: maskGstin(snap.gstin),
        operating_model: snap.operating_model ?? null,
        member_since_year: snap.member_since_year ?? prev.member_since_year ?? null,
        vehicle_count: snap.vehicle_count ?? 0,
        indent_count: snap.indent_count ?? 0,
      };
      const unchanged =
        prev.name === next.name &&
        prev.type === next.type &&
        prev.location === next.location &&
        prev.status === next.status &&
        prev.rating === next.rating &&
        prev.mutuals === next.mutuals &&
        prev.phone === next.phone &&
        prev.avatar_url === next.avatar_url &&
        prev.avatar_seed === next.avatar_seed &&
        prev.is_integrated === next.is_integrated &&
        prev.is_kyc_verified === next.is_kyc_verified &&
        prev.registered_address === next.registered_address &&
        prev.branch_count === next.branch_count &&
        prev.sector === next.sector &&
        prev.website === next.website &&
        prev.gstin === next.gstin &&
        prev.operating_model === next.operating_model &&
        prev.member_since_year === next.member_since_year &&
        prev.vehicle_count === next.vehicle_count &&
        prev.indent_count === next.indent_count;
      return unchanged ? prev : next;
    });
  }, [profileSnapshotQ.data, profileTargetId]);

  const openProfileForOrg = useCallback(
    (org: DiscoverOrg) => {
      if (onOpenProfile) {
        onOpenProfile(org);
        return;
      }
      if (!isRegisteredOrgId(org.id)) return;
      const cached = peekLinkedOrgDisplayProfile(queryClient, orgId, org.id);
      const snap = peekNetworkProfileSnapshot(queryClient, orgId, org.id);
      const seeded = buildNetworkProfileSeed(org, cached);
      setProfileNode({
        ...seeded.node,
        ...(snap
          ? {
              type: snap.type,
              location:
                snap.location !== "Not available"
                  ? snap.location
                  : seeded.node.location,
              status:
                preferProfileConnectionStatus(seeded.node.status, snap.status) ??
                seeded.node.status,
              rating: snap.rating ?? seeded.node.rating,
              phone: snap.phone ?? seeded.node.phone,
              avatar_url: snap.avatar_url ?? seeded.node.avatar_url,
              avatar_seed: snap.avatar_seed ?? seeded.node.avatar_seed,
              is_kyc_verified:
                snap.is_kyc_verified ?? seeded.node.is_kyc_verified,
              member_since_year:
                snap.member_since_year ?? seeded.node.member_since_year,
              vehicle_count: snap.vehicle_count ?? seeded.node.vehicle_count,
              indent_count: snap.indent_count ?? seeded.node.indent_count,
            }
          : {}),
      });
      setProfileTrips(snap?.total_trips ?? seeded.totalTrips);
    },
    [onOpenProfile, orgId, queryClient],
  );

  const atDailyInviteLimit = useMemo(() => {
    const todayInviteCount = todayPendingInviteCountFromSent(sentQ.data ?? []);
    return todayInviteCount >= DAILY_CONNECTION_INVITE_LIMIT;
  }, [sentQ.data]);

  const todayInviteCount = useMemo(
    () => todayPendingInviteCountFromSent(sentQ.data ?? []),
    [sentQ.data],
  );

  const inviteSummary = `${todayInviteCount}/${DAILY_CONNECTION_INVITE_LIMIT} invites sent today`;

  const pendingByOrgId = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of sentQ.data ?? []) {
      if (row.status === "pending" && row.to_organization_id) {
        map.set(row.to_organization_id, true);
      }
    }
    return map;
  }, [sentQ.data]);

  const recommendations = useMemo(
    () =>
      pickLoadCenterRecommendations(orgs, {
        mode,
        limit: RECOMMENDATION_LIMIT,
        dismissed: dismissedIds,
      }),
    [orgs, mode, dismissedIds],
  );

  const roleLabel = mode === "give" ? "Supplier" : "Aggregator";
  const subtitle =
    mode === "give"
      ? "Asset owners who can quote your loads"
      : "Aggregators sharing more indents to market";

  const showInviteLimitExceededAlert = useCallback(() => {
    showAppAlert(
      CONNECTION_REQUEST_DAILY_LIMIT_TITLE,
      CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE,
    );
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  const handleConnect = useCallback(
    async (org: ScoredDiscoverOrg) => {
      if (atDailyInviteLimit) {
        showInviteLimitExceededAlert();
        return;
      }
      if (!(await ensureVerified())) return;
      setConnectingId(org.id);
      const { error: reqErr } = await createConnectionRequest(orgId, org.id, {
        requestShipperClient: mode === "get",
        requestCarrierSupplier: mode === "give",
      });
      setConnectingId(null);
      if (reqErr) {
        if (looksLikeConnectionRateLimitError(reqErr.message)) {
          showInviteLimitExceededAlert();
        } else {
          showAppAlert("Could not send request", reqErr.message);
        }
        return;
      }
      invalidateCache();
      invalidateNetwork();
      void refetch();
    },
    [
      atDailyInviteLimit,
      ensureVerified,
      invalidateCache,
      invalidateNetwork,
      mode,
      orgId,
      refetch,
      showInviteLimitExceededAlert,
    ],
  );

  const handleCancel = useCallback(
    async (org: ScoredDiscoverOrg) => {
      setConnectingId(org.id);
      const { error: cancelErr } = await cancelPendingConnectionRequestByOrgPair(
        orgId,
        org.id,
      );
      setConnectingId(null);
      if (cancelErr) {
        Alert.alert("Could not cancel request", cancelErr.message);
        return;
      }
      invalidateCache();
      invalidateNetwork();
      void refetch();
    },
    [invalidateCache, invalidateNetwork, orgId, refetch],
  );

  const titleText =
    recommendations.length > 0
      ? `${recommendations.length} suggested`
      : "Suggested partners";

  const showBody = !compact || expanded;
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <View
      style={[
        styles.salesCard,
        styles.salesGrowPanel,
        local.wrap,
        compact && local.wrapCompact,
        compact && !expanded && local.wrapCollapsed,
        fillHeight && local.wrapFill,
        style,
      ]}
    >
      <Pressable
        onPress={compact ? () => setExpanded((v) => !v) : undefined}
        disabled={!compact}
        style={({ pressed }) => [
          styles.salesGrowHeader,
          compact && local.headerCompact,
          compact && pressed && local.headerPressed,
        ]}
        accessibilityRole={compact ? "button" : undefined}
        accessibilityState={compact ? { expanded } : undefined}
        accessibilityLabel={
          compact
            ? `${titleText}. ${expanded ? "Minimize" : "Expand"} suggestions`
            : undefined
        }
      >
        <View style={styles.salesGrowTitleIcon}>
          <Sparkles size={11} color={METRONIC.link} />
        </View>
        <View style={styles.salesGrowHeaderText}>
          <Text style={styles.salesGrowTitle}>{titleText}</Text>
          <Text style={styles.salesGrowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {compact ? (
          <View style={local.chevronOrb}>
            <Chevron size={14} color={METRONIC.subtle} strokeWidth={2.4} />
          </View>
        ) : null}
      </Pressable>

      {showBody ? (
        <>
          {loading && recommendations.length === 0 ? (
            <View style={styles.salesGrowLoading}>
              <LoadingIndicator size="small" color={METRONIC.link} />
            </View>
          ) : error ? (
            <Text style={styles.salesEmptySide}>{error}</Text>
          ) : recommendations.length === 0 ? (
            <Text style={styles.salesEmptySide}>
              {mode === "give"
                ? "No asset-owner suppliers to suggest right now — open Network to search."
                : "No active aggregators to suggest right now — open Network to search."}
            </Text>
          ) : (
            <ScrollView
              style={fillHeight ? local.feedFill : undefined}
              contentContainerStyle={fillHeight ? local.feedFillContent : undefined}
              nestedScrollEnabled
              showsVerticalScrollIndicator={fillHeight}
            >
              {recommendations.map((org, idx) => {
                const location = getDiscoverOrgLocation(org);
                const { prefix, highlight, tone } = loadCenterRecommendMatchLine(
                  mode,
                  org,
                );
                const pending =
                  pendingByOrgId.get(org.id) ||
                  String(org.connection_status ?? "").toLowerCase() ===
                    "pending";
                return (
                  <RecommendationRow
                    key={org.id}
                    org={org}
                    roleLabel={roleLabel}
                    locationLabel={location ?? "Location not set"}
                    matchPrefix={prefix}
                    matchHighlight={highlight}
                    accentColor={growRowAccentColor(tone)}
                    pending={pending}
                    connecting={connectingId === org.id}
                    isLast={idx === recommendations.length - 1}
                    striped={idx % 2 === 1}
                    compact={compact}
                    onOpenProfile={() => openProfileForOrg(org)}
                    onPrefetchProfile={() => {
                      if (isRegisteredOrgId(org.id)) {
                        void prefetchNetworkProfileSnapshot(
                          queryClient,
                          orgId,
                          org.id,
                        );
                      }
                    }}
                    onDismiss={() => handleDismiss(org.id)}
                    onConnect={() => void handleConnect(org)}
                    onCancel={() => void handleCancel(org)}
                  />
                );
              })}
            </ScrollView>
          )}

          <View style={styles.salesGrowInviteMeta}>
            <Text style={styles.salesGrowInviteMetaText}>{inviteSummary}</Text>
          </View>
        </>
      ) : (
        <View style={[styles.salesGrowInviteMeta, local.inviteCollapsed]}>
          <Text style={styles.salesGrowInviteMetaText}>{inviteSummary}</Text>
        </View>
      )}

      {profileNode ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setProfileNode(null)}
        >
          <View
            style={[
              profileModalStyles.backdrop,
              isMobileLayout && profileModalStyles.backdropMobile,
            ]}
          >
            <Pressable
              style={profileModalStyles.backdropTouch}
              onPress={() => setProfileNode(null)}
              accessibilityLabel="Close profile"
            />
            <View
              style={[
                profileModalStyles.card,
                isMobileLayout && profileModalStyles.cardMobile,
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  profileModalStyles.scroll,
                  isMobileLayout && {
                    paddingBottom: 10 + insets.bottom,
                  },
                ]}
              >
                <NetworkProfileModalBody
                  node={profileNode}
                  viewerOrgId={orgId}
                  isMobile={isMobileLayout}
                  profileStatsLoading={profileStatsLoading}
                  totalTrips={profileTrips ?? 0}
                  onClose={() => setProfileNode(null)}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const local = {
  wrap: {
    marginTop: 0,
    marginBottom: 0,
    alignSelf: "stretch" as const,
    width: "100%" as const,
  } satisfies ViewStyle,
  wrapFill: {
    flex: 1,
    height: "100%" as const,
    minHeight: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  } satisfies ViewStyle,
  feedFill: {
    flex: 1,
    minHeight: 0,
  } satisfies ViewStyle,
  feedFillContent: {
    flexGrow: 1,
  } satisfies ViewStyle,
  wrapCompact: {
    marginHorizontal: 0,
    borderRadius: 12,
  } satisfies ViewStyle,
  wrapCollapsed: {
    paddingBottom: 8,
  } satisfies ViewStyle,
  inviteCollapsed: {
    marginTop: 0,
    marginBottom: 4,
  } satisfies ViewStyle,
  headerCompact: {
    paddingVertical: 10,
    alignItems: "center" as const,
  } satisfies ViewStyle,
  headerPressed: {
    opacity: 0.88,
  } satisfies ViewStyle,
  chevronOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#F1F1F4",
    flexShrink: 0,
  } satisfies ViewStyle,
  rowCompact: {
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
  } satisfies ViewStyle,
  actionRowSidebar: {
    justifyContent: "flex-start" as const,
  } satisfies ViewStyle,
  actionRowCompact: {
    paddingLeft: 42,
    paddingRight: 0,
    justifyContent: "flex-start" as const,
    width: "100%" as const,
    gap: 8,
  } satisfies ViewStyle,
  ghostCompact: {
    flex: 1,
    minHeight: 32,
    justifyContent: "center" as const,
  } satisfies ViewStyle,
  sendCompact: {
    flex: 1,
    minHeight: 32,
    minWidth: 0,
  } satisfies ViewStyle,
};

const profileModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  backdropMobile: {
    justifyContent: "flex-end",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "88%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    overflow: "hidden",
    alignSelf: "center",
    zIndex: 1,
    ...Platform.select({
      web: {
        boxShadow: "0 16px 48px rgba(24, 28, 50, 0.12)",
      },
      default: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.12,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 12 },
        elevation: 10,
      },
    }),
  },
  cardMobile: {
    maxWidth: "100%",
    maxHeight: "92%",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  scroll: {
    paddingBottom: 16,
  },
});
