/**
 * Connection sales sidebar — compact grow recommendations feed.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
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
import { useNetworkDiscovery } from "@/features/network/hooks/useNetworkDiscovery";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import {
  getDiscoverOrgLocation,
  growRowAccentColor,
  growRowMatchLine,
  pickGrowRecommendations,
  type ScoredDiscoverOrg,
} from "@/features/network/utils/discoverRecommendations.util";
import { useEnsureVerified } from "@/features/network/utils/verifiedActionGuard";
import { showAppAlert } from "@/lib/appAlert";
import { todayPendingInviteCountFromSent } from "@/lib/todayPendingInviteCount";
import {
  useConnectionRequestsSentQuery,
  useInvalidateNetwork,
} from "@/lib/queries/useNetworkQueries";
import { Sparkles, UserPlus, X } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

type Props = {
  orgId: string;
  activeLanes?: readonly string[];
  onOpenProfile?: (org: DiscoverOrg) => void;
  onViewAllGrow?: () => void;
  inviteDailyCapReached?: boolean;
};

const RECOMMENDATION_LIMIT = 3;

function GrowRecommendationRow({
  org,
  locationLabel,
  matchPrefix,
  matchHighlight,
  accentColor,
  pending,
  connecting,
  isLast,
  striped,
  onOpenProfile,
  onDismiss,
  onConnect,
  onCancel,
}: {
  org: ScoredDiscoverOrg;
  locationLabel: string;
  matchPrefix: string;
  matchHighlight: string;
  accentColor: string;
  pending: boolean;
  connecting: boolean;
  isLast: boolean;
  striped: boolean;
  onOpenProfile?: () => void;
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
        striped && styles.salesGrowRowStripe,
        isLast && styles.salesGrowRowLast,
      ]}
    >
      <Pressable
        onPress={onOpenProfile}
        disabled={!onOpenProfile}
        style={({ pressed }) => [
          styles.salesGrowRowMain,
          pressed && onOpenProfile && styles.salesGrowRowHeadPressed,
        ]}
      >
        <PartyAvatar
          name={org.name}
          initialsColorSeed={org.id}
          organizationImageUrl={org.avatar_url}
          avatarUrl={org.avatar_url}
          avatarSeed={org.avatar_seed}
          entityType="client"
          size={30}
        />

        <View style={styles.salesGrowRowBody}>
          <View style={styles.salesGrowNameRow}>
            <Text style={styles.salesGrowRowName} numberOfLines={1}>
              {org.name}
            </Text>
            <View
              style={[styles.salesGrowRoleBadge, styles.salesGrowRoleBadgeClient]}
            >
              <Text
                style={[
                  styles.salesGrowRoleBadgeText,
                  styles.salesGrowRoleBadgeTextClient,
                ]}
              >
                Client
              </Text>
            </View>
          </View>

          <Text style={styles.salesGrowMatchLine} numberOfLines={1}>
            {matchPrefix ? (
              <Text style={styles.salesGrowMatchMuted}>{matchPrefix}</Text>
            ) : null}
            <Text style={[styles.salesGrowMatchHighlight, { color: accentColor }]}>
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
        <View style={styles.salesGrowPendingRow}>
          <Text style={styles.salesGrowPendingLabel}>Request sent</Text>
          <Pressable
            onPress={onCancel}
            disabled={connecting}
            hitSlop={6}
          >
            <Text style={styles.salesGrowPendingCancel}>
              {connecting ? "…" : "Cancel"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.salesGrowActionRow}>
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.salesGrowActionGhost,
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

export function NetworkDesktopSalesGrowWidget({
  orgId,
  activeLanes = [],
  onOpenProfile,
  inviteDailyCapReached = false,
}: Props) {
  const { orgs, loading, error, refetch, invalidateCache } = useNetworkDiscovery({
    orgId,
    search: "",
  });
  const sentQ = useConnectionRequestsSentQuery(orgId);
  const invalidateNetwork = useInvalidateNetwork(orgId);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const ensureVerified = useEnsureVerified();

  const atDailyInviteLimit = useMemo(() => {
    const todayInviteCount = todayPendingInviteCountFromSent(sentQ.data ?? []);
    return (
      todayInviteCount >= DAILY_CONNECTION_INVITE_LIMIT ||
      inviteDailyCapReached === true
    );
  }, [sentQ.data, inviteDailyCapReached]);

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
      pickGrowRecommendations(orgs, {
        limit: RECOMMENDATION_LIMIT,
        dismissed: dismissedIds,
      }),
    [orgs, dismissedIds],
  );

  const laneHint =
    activeLanes.length > 0
      ? `${activeLanes.length} lane${activeLanes.length === 1 ? "" : "s"} in view`
      : "Routes & location match";

  const showInviteLimitExceededAlert = useCallback(() => {
    showAppAlert(
      CONNECTION_REQUEST_DAILY_LIMIT_TITLE,
      CONNECTION_REQUEST_DAILY_LIMIT_MESSAGE,
    );
  }, []);

  const handleDismiss = useCallback((orgIdToDismiss: string) => {
    setDismissedIds((prev) => new Set(prev).add(orgIdToDismiss));
  }, []);

  const handleConnect = useCallback(
    async (org: ScoredDiscoverOrg) => {
      if (atDailyInviteLimit) {
        showInviteLimitExceededAlert();
        return;
      }
      // Verified-org only — shows a "Verify now" dialog and opens KYC on confirm.
      if (!(await ensureVerified())) return;
      setConnectingId(org.id);
      const { error: reqErr } = await createConnectionRequest(orgId, org.id, {
        requestShipperClient: true,
        requestCarrierSupplier: false,
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
      invalidateCache,
      invalidateNetwork,
      orgId,
      refetch,
      showInviteLimitExceededAlert,
      ensureVerified,
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

  return (
    <View style={[styles.salesCard, styles.salesGrowPanel]}>
      <View style={styles.salesGrowHeader}>
        <View style={styles.salesGrowTitleIcon}>
          <Sparkles size={11} color={METRONIC.link} />
        </View>
        <View style={styles.salesGrowHeaderText}>
          <Text style={styles.salesGrowTitle}>
            {recommendations.length > 0
              ? `${recommendations.length} suggested`
              : "Grow network"}
          </Text>
          <Text style={styles.salesGrowSub}>{laneHint}</Text>
        </View>
      </View>

      {loading && recommendations.length === 0 ? (
        <View style={styles.salesGrowLoading}>
          <LoadingIndicator size="small" color={METRONIC.link} />
        </View>
      ) : error ? (
        <Text style={styles.salesEmptySide}>{error}</Text>
      ) : recommendations.length === 0 ? (
        <Text style={styles.salesEmptySide}>
          No matches right now — open Grow to search.
        </Text>
      ) : (
        <View style={styles.salesGrowFeed}>
          {recommendations.map((org, idx) => {
            const location = getDiscoverOrgLocation(org);
            const { prefix, highlight, tone } = growRowMatchLine(org.signals);
            const pending =
              pendingByOrgId.get(org.id) ||
              String(org.connection_status ?? "").toLowerCase() === "pending";
            return (
              <GrowRecommendationRow
                key={org.id}
                org={org}
                locationLabel={location ?? "Location not set"}
                matchPrefix={prefix}
                matchHighlight={highlight}
                accentColor={growRowAccentColor(tone)}
                pending={pending}
                connecting={connectingId === org.id}
                isLast={idx === recommendations.length - 1}
                striped={idx % 2 === 1}
                onOpenProfile={
                  onOpenProfile ? () => onOpenProfile(org) : undefined
                }
                onDismiss={() => handleDismiss(org.id)}
                onConnect={() => void handleConnect(org)}
                onCancel={() => void handleCancel(org)}
              />
            );
          })}
        </View>
      )}

      <View style={styles.salesGrowInviteMeta}>
        <Text style={styles.salesGrowInviteMetaText}>{inviteSummary}</Text>
      </View>
    </View>
  );
}
