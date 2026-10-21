/**
 * Shared avatar for Customers, Suppliers, Drivers list rows.
 * Delegates to `PartyAvatar`: linked-org logo → contact photo → seed preset → initials.
 * Integration status: small badge dot (green = integrated, grey = manual).
 */
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { partyAvatarHasRenderableOutput } from "@/lib/partyAvatarDisplay";
import { shouldUseOfflinePartyRoleAvatar } from "@/lib/partyOfflineRoleAvatar";
import { StyleSheet, View } from "react-native";

/** Status-dot diameter used on the avatar overlay. */
export function entityAvatarBadgeGutter(size: number): number {
  return Math.max(8, Math.round(size * 0.28));
}

/** Frame size — the status dot overlays the avatar, so this matches `size`. */
export function entityAvatarOuterSize(
  size: number,
  _showIntegrationBadge = true,
): number {
  return size;
}

export interface EntityAvatarProps {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  /**
   * Tints the initials fallback from a stable id (e.g. org id) without opting the
   * party into a generated face. Pass ids here, never as `avatarSeed`.
   */
  initialsColorSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  /** Determines which seed generator to use for preset fallback. */
  entityType?: PartyEntityType;
  size?: number;
  /** When true, shows a green connected dot; grey dot otherwise. */
  isIntegrated?: boolean;
  /** Hide the integration badge (e.g. dense lists / hero). */
  showIntegrationBadge?: boolean;
  /**
   * Dense mode: keep the outer frame equal to `size` (no reserved gutter) and
   * overlay the status dot on the avatar's lower-right edge. Use in tight rows
   * (e.g. cash ledger) so the avatar aligns to a fixed column.
   */
  badgeOverlay?: boolean;
}

export function EntityAvatar({
  name,
  avatarUrl,
  avatarSeed,
  initialsColorSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  entityType = "client",
  size = 36,
  isIntegrated = false,
  showIntegrationBadge = true,
  badgeOverlay = false,
}: EntityAvatarProps) {
  const badgeSize = Math.max(8, Math.round(size * 0.28));

  const useOfflineRoleIcon = shouldUseOfflinePartyRoleAvatar(
    isIntegrated,
    entityType,
  );

  if (
    !useOfflineRoleIcon &&
    !partyAvatarHasRenderableOutput({
      name,
      organizationImageUrl,
      organizationAvatarSeed,
      avatarUrl,
      avatarSeed,
      entityType,
    })
  ) {
    return null;
  }

  const avatar = (
    <PartyAvatar
      name={name}
      organizationImageUrl={organizationImageUrl}
      organizationAvatarSeed={organizationAvatarSeed}
      avatarUrl={avatarUrl}
      avatarSeed={avatarSeed}
      initialsColorSeed={initialsColorSeed}
      entityType={entityType}
      isIntegrated={isIntegrated}
      size={size}
    />
  );

  if (!showIntegrationBadge) {
    return (
      <View style={[styles.frame, { width: size, height: size }]}>{avatar}</View>
    );
  }

  const overlayBadge = badgeOverlay
    ? Math.max(8, Math.round(size * 0.3))
    : badgeSize;
  const inset = Math.max(1, Math.round(size * 0.04));

  return (
    <View
      style={[
        styles.frame,
        styles.overlayFrame,
        { width: size, height: size },
      ]}
    >
      {avatar}
      <View
        style={[
          styles.badge,
          {
            width: overlayBadge,
            height: overlayBadge,
            borderRadius: overlayBadge / 2,
            right: inset,
            bottom: inset,
            backgroundColor: isIntegrated ? Theme.darkGreen : Theme.iconSlate,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative",
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  overlayFrame: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    right: 1,
    bottom: 1,
    borderWidth: 1.5,
    borderColor: Theme.cardWhite,
    zIndex: 2,
  },
});
