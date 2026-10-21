/**
 * Grow network — Metronic Teams grid + list cards (desktop hub).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import type { ConnectionInviteRole } from "@/features/network/components/ConnectionRoleModal";
import { MutualConnectionsFacepile } from "@/features/network/components/MutualConnectionsFacepile";
import { NetworkDesktopGrowMutualMembers } from "@/features/network/components/desktop/NetworkDesktopGrowMutualMembers";
import { NetworkDesktopSalesStars } from "@/features/network/components/desktop/NetworkDesktopSalesStars";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import type { ScoredDiscoverOrg } from "@/features/network/utils/discoverRecommendations.util";
import {
  getDiscoverOrgLocation,
  growRowMatchLine,
} from "@/features/network/utils/discoverRecommendations.util";
import {
  Check,
  MoreVertical,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export type GrowOrgCardVariant = "grid" | "list";

type Props = {
  org: ScoredDiscoverOrg;
  viewerOrgId: string;
  variant?: GrowOrgCardVariant;
  pendingRole?: ConnectionInviteRole | null;
  connecting?: boolean;
  onOpenProfile?: () => void;
  onConnect?: () => void;
  onCancel?: () => void;
  onPressMutuals?: () => void;
  onPressMutual?: (org: MutualConnectionRow) => void;
  onDismiss?: () => void;
};

function ratingStars(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function buildSubtitle(org: ScoredDiscoverOrg, location: string): string {
  const { highlight } = growRowMatchLine(org.signals);
  if (location !== "Location not set") {
    return `${highlight} · ${location}`;
  }
  return highlight;
}

function buildTagline(org: ScoredDiscoverOrg, location: string): string {
  const trips =
    typeof org.trip_count === "number" && org.trip_count >= 0
      ? org.trip_count
      : 0;
  const { highlight } = growRowMatchLine(org.signals);
  const laneCount = org.lane_overlap_count ?? 0;
  if (laneCount >= 2) {
    return `${highlight} · ${laneCount} shared lanes · ${trips} trips`;
  }
  if (location !== "Location not set") {
    return `${highlight} · ${location} · ${trips} trips`;
  }
  return `${highlight} · ${trips} trips on Pulse`;
}

function pendingRoleLabel(
  role: ConnectionInviteRole | null | undefined,
): string | null {
  if (role === "client") return "Client";
  if (role === "supplier") return "Supplier";
  return null;
}

function GrowActionButton({
  isConnected,
  isPending,
  connecting,
  compact,
  onConnect,
  onCancel,
}: {
  isConnected: boolean;
  isPending: boolean;
  pendingRole?: ConnectionInviteRole | null;
  connecting: boolean;
  compact?: boolean;
  onConnect?: () => void;
  onCancel?: () => void;
}) {
  if (isConnected) {
    return (
      <View
        style={[styles.growOrgBtnJoined, compact && styles.growOrgBtnJoinedCompact]}
      >
        <Check size={14} color={METRONIC.subtle} />
        <Text style={styles.growOrgBtnJoinedText}>Joined</Text>
      </View>
    );
  }

  if (isPending) {
    return (
      <View
        style={[
          styles.growOrgStatusBtn,
          compact && styles.growOrgStatusBtnCompact,
        ]}
      >
        <View style={styles.growOrgStatusBtnMain}>
          {connecting ? (
            <ActivityIndicator size="small" color={METRONIC.subtle} />
          ) : (
            <>
              <Check size={14} color={METRONIC.subtle} strokeWidth={2.2} />
              <Text style={styles.growOrgBtnPendingText}>Request sent</Text>
            </>
          )}
        </View>
        <Pressable
          onPress={() => onCancel?.()}
          disabled={connecting}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel request"
          style={({ pressed }) => [
            styles.growOrgStatusBtnClose,
            pressed && styles.growOrgBtnPressed,
            connecting && styles.growOrgBtnDisabled,
          ]}
        >
          <X size={13} color={METRONIC.muted} strokeWidth={2.2} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onConnect?.()}
      disabled={connecting}
      accessibilityRole="button"
      accessibilityLabel="Join"
      style={({ pressed }) => [
        styles.growOrgBtnJoin,
        compact && styles.growOrgBtnJoinCompact,
        pressed && styles.growOrgBtnPressed,
        connecting && styles.growOrgBtnDisabled,
      ]}
    >
      {connecting ? (
        <ActivityIndicator size="small" color={METRONIC.link} />
      ) : (
        <>
          <UserPlus size={14} color={METRONIC.link} strokeWidth={2.2} />
          <Text style={styles.growOrgBtnJoinText}>Join</Text>
        </>
      )}
    </Pressable>
  );
}

function GrowOrgAvatarBadge({
  org,
  size,
  showStatus,
  isConnected,
  isPending,
}: {
  org: ScoredDiscoverOrg;
  size: number;
  showStatus?: boolean;
  isConnected: boolean;
  isPending: boolean;
}) {
  return (
    <View style={styles.growOrgIconHalo}>
      <View style={{ width: size, height: size, position: "relative" }}>
        <PartyAvatar
          name={org.name}
          initialsColorSeed={org.id}
          organizationImageUrl={org.avatar_url}
          avatarUrl={org.avatar_url}
          avatarSeed={org.avatar_seed}
          entityType="client"
          size={size}
        />
        {showStatus ? (
          <View
            style={[
              styles.growOrgOnlineDot,
              {
                backgroundColor: isConnected
                  ? "#50CD89"
                  : isPending
                    ? "#FFC700"
                    : METRONIC.border,
              },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

function GrowOrgSections({
  org,
  viewerOrgId,
  stars,
  onPressMutuals,
  onPressMutual,
  listLayout,
}: {
  org: ScoredDiscoverOrg;
  viewerOrgId: string;
  stars: number;
  onPressMutuals?: () => void;
  onPressMutual?: (org: MutualConnectionRow) => void;
  listLayout?: boolean;
}) {
  const mutuals = org.mutual_count ?? org.mutual_connections_count ?? 0;

  return (
    <>
      <View
        style={[
          styles.growOrgSection,
          listLayout && styles.growOrgSectionList,
        ]}
      >
        <Text style={styles.growOrgSectionLabel}>Rating</Text>
        <NetworkDesktopSalesStars filledStars={stars} size={12} />
      </View>

      <View
        style={[
          styles.growOrgSection,
          listLayout && styles.growOrgSectionList,
          styles.growOrgSectionLast,
        ]}
      >
        <Text style={styles.growOrgSectionLabel}>Mutuals</Text>
        {mutuals > 0 ? (
          listLayout ? (
            <NetworkDesktopGrowMutualMembers
              viewerOrgId={viewerOrgId}
              targetOrgId={org.id}
              mutualCount={mutuals}
              listLayout
              onPressViewAll={onPressMutuals}
              onPressMutual={onPressMutual}
            />
          ) : (
            <MutualConnectionsFacepile
              viewerOrgId={viewerOrgId}
              targetOrgId={org.id}
              mutualCount={mutuals}
              faceSize={24}
              showSectionLabel={false}
              compact
              onPressViewAll={onPressMutuals}
              onPressMutual={onPressMutual}
            />
          )
        ) : (
          <View style={styles.growOrgMembersEmpty}>
            <Users size={12} color={METRONIC.muted} />
            <Text style={styles.growOrgSectionMuted}>No mutuals</Text>
          </View>
        )}
      </View>
    </>
  );
}

function GrowOrgGridCard(props: Props) {
  const {
    org,
    viewerOrgId,
    pendingRole = null,
    connecting = false,
    onOpenProfile,
    onConnect,
    onCancel,
    onPressMutuals,
    onPressMutual,
    onDismiss,
  } = props;

  const location = getDiscoverOrgLocation(org) ?? "Location not set";
  const rating = org.average_rating ?? org.rating ?? null;
  const stars = ratingStars(rating);
  const status = String(org.connection_status ?? "none").toLowerCase();
  const isPending = status === "pending" || Boolean(pendingRole);
  const isConnected = status === "approved";
  const subtitle = buildSubtitle(org, location);

  return (
    <View style={styles.growOrgCard}>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="More options"
          style={styles.growOrgCardMenuFloat}
        >
          <MoreVertical size={15} color={METRONIC.muted} />
        </Pressable>
      ) : null}

      <Pressable
        onPress={onOpenProfile}
        disabled={!onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel={`Open ${org.name}`}
        style={({ pressed }) => [
          pressed && onOpenProfile && styles.growOrgCardPressed,
        ]}
      >
        <View style={styles.growOrgCardHero}>
          <GrowOrgAvatarBadge
            org={org}
            size={44}
            showStatus
            isConnected={isConnected}
            isPending={isPending}
          />
        </View>

        <Text style={styles.growOrgName} numberOfLines={2}>
          {org.name}
        </Text>

        <Text style={styles.growOrgTagline} numberOfLines={2}>
          {subtitle}
        </Text>
      </Pressable>

      <View style={styles.growOrgSectionsWrap}>
        <GrowOrgSections
          org={org}
          viewerOrgId={viewerOrgId}
          stars={stars}
          onPressMutuals={onPressMutuals}
          onPressMutual={onPressMutual}
        />
      </View>

      <View style={styles.growOrgFooter}>
        <GrowActionButton
          isConnected={isConnected}
          isPending={isPending}
          pendingRole={pendingRole}
          connecting={connecting}
          onConnect={onConnect}
          onCancel={onCancel}
        />
      </View>
    </View>
  );
}

function GrowOrgListCard(props: Props) {
  const {
    org,
    viewerOrgId,
    pendingRole = null,
    connecting = false,
    onOpenProfile,
    onConnect,
    onCancel,
    onPressMutuals,
    onPressMutual,
    onDismiss,
  } = props;

  const location = getDiscoverOrgLocation(org) ?? "Location not set";
  const rating = org.average_rating ?? org.rating ?? null;
  const stars = ratingStars(rating);
  const status = String(org.connection_status ?? "none").toLowerCase();
  const isPending = status === "pending" || Boolean(pendingRole);
  const isConnected = status === "approved";
  const tagline = buildTagline(org, location);

  return (
    <View style={styles.growOrgListCard}>
      <View style={styles.growOrgListGrid}>
        <Pressable
          onPress={onOpenProfile}
          disabled={!onOpenProfile}
          accessibilityRole="button"
          accessibilityLabel={`Open ${org.name}`}
          style={({ pressed }) => [
            styles.growOrgListIdentity,
            pressed && onOpenProfile && styles.growOrgCardPressed,
          ]}
        >
          <GrowOrgAvatarBadge
            org={org}
            size={40}
            isConnected={isConnected}
            isPending={isPending}
          />
          <View style={styles.growOrgListTextCol}>
            <Text style={styles.growOrgListName} numberOfLines={1}>
              {org.name}
            </Text>
            <Text style={styles.growOrgListTagline} numberOfLines={2}>
              {tagline}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={onOpenProfile}
          disabled={!onOpenProfile}
          accessibilityRole="button"
          accessibilityLabel={`Open ${org.name} rating`}
          style={({ pressed }) => [
            styles.growOrgListStarsCol,
            pressed && onOpenProfile && styles.growOrgCardPressed,
          ]}
        >
          <NetworkDesktopSalesStars filledStars={stars} size={12} />
        </Pressable>

        <View style={styles.growOrgListMutualsCol}>
          {(org.mutual_count ?? org.mutual_connections_count ?? 0) > 0 ? (
            <NetworkDesktopGrowMutualMembers
              viewerOrgId={viewerOrgId}
              targetOrgId={org.id}
              mutualCount={
                org.mutual_count ?? org.mutual_connections_count ?? 0
              }
              listLayout
              onPressViewAll={onPressMutuals}
              onPressMutual={onPressMutual}
            />
          ) : (
            <Text style={styles.growOrgListMetricEmpty}>—</Text>
          )}
        </View>

        <View style={styles.growOrgListActionCol}>
          {pendingRoleLabel(pendingRole) ? (
            <View style={styles.growOrgRolePill}>
              <Text style={styles.growOrgRolePillText}>
                {pendingRoleLabel(pendingRole)}
              </Text>
            </View>
          ) : null}
          <GrowActionButton
            isConnected={isConnected}
            isPending={isPending}
            pendingRole={pendingRole}
            connecting={connecting}
            compact
            onConnect={onConnect}
            onCancel={onCancel}
          />
          {onDismiss ? (
            <Pressable
              onPress={onDismiss}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="More options"
              style={styles.growOrgListMenu}
            >
              <MoreVertical size={15} color={METRONIC.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function NetworkDesktopGrowOrgCard({
  variant = "grid",
  ...props
}: Props) {
  if (variant === "list") {
    return <GrowOrgListCard {...props} />;
  }
  return <GrowOrgGridCard {...props} />;
}
