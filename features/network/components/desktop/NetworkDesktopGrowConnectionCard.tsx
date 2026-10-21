/**
 * Grow your network — professional partner / business card.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ConnectionInviteRole } from "@/features/network/components/ConnectionRoleModal";
import {
  connectionCardStyles as styles,
  growConnectionCardStyles as growStyles,
} from "@/features/network/components/desktop/networkDesktopConnectionCard.styles";
import { OrgVerificationBadges } from "@/features/network/components/OrgVerificationBadges";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import { MutualConnectionsFacepile } from "@/features/network/components/MutualConnectionsFacepile";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { isOrgKycVerified } from "@/features/network/utils/orgVerification.util";
import {
  formatConnectionExperience,
  formatConnectionRatingValue,
} from "@/features/network/utils/businessConnectionOffer.util";
import { firstFiniteRating } from "@/features/ratings/services/ratings.service";
import { BadgeCheck, CheckCircle2, MapPin, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

const AVATAR_SIZE = 52;
/** 2-up phone / tablet cells are too narrow for a 132px action + facepile. */
const COMPACT_CARD_WIDTH = 280;

function roleTone(pendingRole: ConnectionInviteRole | null | undefined) {
  if (pendingRole === "client") {
    return {
      label: "CLIENT",
      bg: Theme.networkBadgeClientBg,
      text: Theme.networkBadgeClientText,
      border: Theme.networkBadgeClientBorder,
    };
  }
  if (pendingRole === "supplier") {
    return {
      label: "SUPPLIER",
      bg: Theme.networkBadgeSupplierBg,
      text: Theme.networkBadgeSupplierText,
      border: Theme.networkBadgeSupplierBorder,
    };
  }
  return {
    label: "PARTNER",
    bg: Theme.surface,
    text: Theme.textRouteCard,
    border: Theme.borderMedium,
  };
}

function positiveCount(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

type MetricBox = {
  key: string;
  value: string;
  label: string;
};

export type NetworkDesktopGrowConnectionCardProps = {
  org: Pick<
    DiscoverOrg,
    | "id"
    | "name"
    | "avatar_seed"
    | "avatar_url"
    | "connection_status"
    | "is_kyc_verified"
    | "verification_status"
    | "trip_count"
    | "rating_count"
    | "org_created_at"
    | "city"
  >;
  locationLabel: string;
  ratingValue?: number | null;
  mutualCount?: number;
  viewerOrgId?: string | null;
  onPressMutuals?: () => void;
  onPressMutual?: (org: MutualConnectionRow) => void;
  pendingRole?: ConnectionInviteRole | null;
  connecting?: boolean;
  onOpenProfile?: () => void;
  onPrefetchProfile?: () => void;
  onConnect?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
};

export function NetworkDesktopGrowConnectionCard({
  org,
  locationLabel,
  ratingValue = null,
  mutualCount = 0,
  viewerOrgId = null,
  onPressMutuals,
  onPressMutual,
  pendingRole = null,
  connecting = false,
  onOpenProfile,
  onPrefetchProfile,
  onConnect,
  onCancel,
  onDismiss,
}: NetworkDesktopGrowConnectionCardProps) {
  const [cardWidth, setCardWidth] = useState(0);
  const compactActions = cardWidth > 0 && cardWidth < COMPACT_CARD_WIDTH;
  const status = String(org.connection_status ?? "none").toLowerCase();
  const isPending = status === "pending" || Boolean(pendingRole);
  const isConnected = status === "approved";
  const isKycVerified = isOrgKycVerified(org);
  const tone = roleTone(pendingRole);
  const rating = firstFiniteRating(ratingValue);
  const trips = positiveCount(org.trip_count);
  const mutuals = positiveCount(mutualCount);
  const tenure = org.org_created_at
    ? formatConnectionExperience(org.org_created_at)
    : null;
  const showMutualFacepile = mutuals != null && Boolean(viewerOrgId);
  const locationOk =
    locationLabel.trim().length > 0 && locationLabel !== "Location not set";

  const identityStats: MetricBox[] = [
    {
      key: "rating",
      value: rating != null ? formatConnectionRatingValue(rating) : "—",
      label: "Rating",
    },
    {
      key: "trips",
      value: trips != null ? String(trips) : "—",
      label: "Trips",
    },
    {
      key: "aging",
      value: tenure ?? "—",
      label: "Aging",
    },
  ];

  return (
    <View
      style={[styles.card, growStyles.card]}
      onLayout={(event) => {
        const nextWidth = Math.floor(event.nativeEvent.layout.width);
        setCardWidth((prev) => (prev === nextWidth ? prev : nextWidth));
      }}
    >
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel="Dismiss suggestion"
        >
          <X size={13} color={Theme.textMuted} strokeWidth={2.2} />
        </Pressable>
      ) : null}

      <Pressable
        onPress={onOpenProfile}
        onPressIn={onPrefetchProfile}
        disabled={!onOpenProfile}
        style={({ pressed }) => [
          growStyles.bizBody,
          pressed && onOpenProfile && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${org.name}`}
      >
        <View style={growStyles.bizIdentity}>
          <View style={growStyles.bizAvatarCol}>
            <View style={growStyles.bizAvatar}>
              <PartyAvatar
                name={org.name}
                initialsColorSeed={org.id}
                organizationImageUrl={org.avatar_url}
                avatarUrl={org.avatar_url}
                avatarSeed={org.avatar_seed}
                entityType="client"
                size={AVATAR_SIZE}
                shape="circle"
              />
              {isConnected ? <View style={styles.onlineDot} /> : null}
            </View>
          </View>

          <View style={growStyles.bizIdentityText}>
            <View style={growStyles.bizNameRow}>
              <Text style={growStyles.bizName} numberOfLines={1}>
                {org.name}
              </Text>
              {isKycVerified ? (
                <BadgeCheck
                  size={15}
                  color={Theme.analyticsHeroBg}
                  strokeWidth={2.2}
                />
              ) : null}
            </View>
            <View style={growStyles.bizMetaRow}>
              <View style={growStyles.bizMetaItem}>
                <MapPin size={12} color={Theme.textMuted} strokeWidth={2} />
                <Text
                  style={[
                    growStyles.bizLocation,
                    !locationOk && growStyles.bizLocationEmpty,
                  ]}
                  numberOfLines={1}
                >
                  {locationOk ? locationLabel : "No location"}
                </Text>
              </View>
            </View>
            <View style={growStyles.bizTrustBadgesSlot}>
              <View
                style={[
                  styles.roleTag,
                  growStyles.roleTag,
                  { backgroundColor: tone.bg, borderColor: tone.border },
                ]}
              >
                <Text
                  style={[
                    styles.roleTagText,
                    growStyles.roleTagText,
                    { color: tone.text },
                  ]}
                >
                  {tone.label}
                </Text>
              </View>
              <OrgVerificationBadges
                verification={org}
                compact
                style={growStyles.bizTrustBadges}
              />
            </View>
          </View>
        </View>
      </Pressable>

      <View style={growStyles.footerBlock}>
        <View style={growStyles.footerRow}>
          <View style={growStyles.bizMetricBoxes}>
            {(compactActions ? identityStats.slice(0, 2) : identityStats).map((stat) => (
              <View key={stat.key} style={growStyles.bizMetricBox}>
                <Text style={growStyles.bizMetricValue} numberOfLines={1}>
                  {stat.value}
                </Text>
                <Text style={growStyles.bizMetricLabel} numberOfLines={1}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
          <View
            style={[
              growStyles.mutualFacepileSlot,
              compactActions && growStyles.mutualFacepileSlotCompact,
            ]}
          >
            {showMutualFacepile ? (
              <MutualConnectionsFacepile
                viewerOrgId={viewerOrgId}
                targetOrgId={org.id}
                mutualCount={mutualCount}
                faceSize={22}
                compact
                overflowColor="#50CD89"
                onPressMutual={onPressMutual}
                onPressViewAll={onPressMutuals}
              />
            ) : null}
          </View>

        {isConnected ? (
          <View
            style={[
              growStyles.actionBtn,
              compactActions && growStyles.actionBtnCompact,
              growStyles.actionBtnConnected,
            ]}
          >
            <CheckCircle2 size={13} color={Theme.textMuted} strokeWidth={2.2} />
            <Text
              style={[
                styles.actionBtnConnectedText,
                growStyles.actionBtnConnectedText,
              ]}
            >
              Connected
            </Text>
          </View>
        ) : isPending ? (
          <Pressable
            onPress={() => onCancel?.()}
            disabled={connecting}
            style={({ pressed }) => [
              growStyles.actionBtn,
              compactActions && growStyles.actionBtnCompact,
              growStyles.actionBtnPending,
              connecting && styles.actionBtnDisabled,
              pressed && styles.actionBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Cancel request"
          >
            {connecting ? (
              <LoadingIndicator size="small" color={Theme.textMuted} />
            ) : (
              <Text
                style={[
                  styles.actionBtnPendingText,
                  growStyles.actionBtnPendingText,
                ]}
              >
                Request sent
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onConnect?.()}
            disabled={connecting}
            style={({ pressed }) => [
              growStyles.actionBtn,
              compactActions && growStyles.actionBtnCompact,
              growStyles.actionBtnInvite,
              connecting && styles.actionBtnDisabled,
              pressed && !connecting && styles.actionBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Connect with ${org.name}`}
          >
            {connecting ? (
              <LoadingIndicator size="small" color={Theme.primary} />
            ) : (
              <Text
                style={[
                  styles.actionBtnInviteText,
                  growStyles.actionBtnInviteText,
                ]}
              >
                Connect
              </Text>
            )}
          </Pressable>
        )}
      </View>
      </View>
    </View>
  );
}
