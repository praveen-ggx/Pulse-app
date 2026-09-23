/**
 * Overlapping mutual-connection avatars; each face opens that org's profile.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { MutualAvatarStack, type MutualFace } from "@/features/network/components/MutualAvatarStack";
import {
  NETWORK_PARTY_MUTUAL_FACE_LIST,
} from "@/features/network/components/networkPartyProfileCard.styles";
import type { MutualConnectionRow } from "@/features/network/services/mutual-connections.service";
import { useMutualConnectionsQuery } from "@/lib/queries/useMutualConnectionsQuery";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type MutualConnectionsFacepileProps = {
  viewerOrgId: string | null | undefined;
  targetOrgId: string;
  mutualCount: number;
  faceSize?: number;
  showSectionLabel?: boolean;
  sectionLabel?: string;
  compact?: boolean;
  onPressMutual?: (org: MutualConnectionRow) => void;
  /** Opens full mutual list (e.g. +N chip or row tap). */
  onPressViewAll?: () => void;
  overflowColor?: string;
  /**
   * List cards already have `mutualCount`. Resolving faces is a per-org RPC;
   * keep it off on hub/grow lists so eight cards do not fire eight fetches.
   */
  resolveFaces?: boolean;
};

export function MutualConnectionsFacepile({
  viewerOrgId,
  targetOrgId,
  mutualCount,
  faceSize = NETWORK_PARTY_MUTUAL_FACE_LIST,
  showSectionLabel = false,
  sectionLabel = "Mutuals",
  compact = false,
  onPressMutual,
  onPressViewAll,
  overflowColor = Theme.primary,
  resolveFaces = false,
}: MutualConnectionsFacepileProps) {
  const canQuery = Boolean(viewerOrgId && targetOrgId);
  const { data: mutuals = [], isLoading, isError } = useMutualConnectionsQuery(
    viewerOrgId,
    targetOrgId,
    resolveFaces && mutualCount > 0 && canQuery,
  );

  if (mutualCount <= 0) return null;

  const liveCount =
    canQuery && !isLoading && !isError ? mutuals.length : null;
  const displayCount =
    liveCount != null && liveCount > 0 ? liveCount : mutualCount;
  if (displayCount <= 0) return null;

  const faces: MutualFace[] = mutuals.map((row) => ({
    id: row.id,
    name: row.name,
    avatar_seed: row.avatar_seed,
    avatar_url: row.avatar_url,
  }));

  const handlePressFace = (face: MutualFace) => {
    onPressMutual?.({
      id: face.id,
      name: face.name,
      avatar_seed: face.avatar_seed ?? null,
      avatar_url: face.avatar_url ?? null,
    });
  };

  const openViewAll = onPressViewAll ?? undefined;
  const stack = (
    <MutualAvatarStack
      orgId={targetOrgId}
      mutualCount={displayCount}
      mutuals={faces.length > 0 ? faces : undefined}
      faceSize={faceSize}
      showLabel={false}
      overflowColor={overflowColor}
      compact={compact}
      onPressFace={onPressMutual ? handlePressFace : undefined}
      onPressOverflow={openViewAll}
    />
  );

  const body =
    canQuery && isLoading ? (
      <View style={styles.loading}>
        <LoadingIndicator size={14} color={Theme.primary} />
      </View>
    ) : (
      stack
    );

  const inner = (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {showSectionLabel ? (
        <Text style={styles.sectionLabel} numberOfLines={1}>
          {sectionLabel.toUpperCase()}
        </Text>
      ) : null}
      {body}
    </View>
  );

  // When individual faces are tappable, the MutualAvatarStack handles its own
  // press targets — wrapping in another Pressable would nest <button> inside <button>.
  if (!openViewAll || onPressMutual) {
    return inner;
  }

  return (
    <Pressable
      onPress={openViewAll}
      style={({ pressed }) => [pressed && { opacity: 0.88 }]}
      accessibilityRole="button"
      accessibilityLabel={`${displayCount} mutual connections`}
      hitSlop={6}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 5,
    flexShrink: 0,
  },
  wrapCompact: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: Theme.textSection,
    textAlign: "left",
  },
  loading: {
    minHeight: 28,
    minWidth: 48,
    alignItems: "flex-start",
    justifyContent: "center",
  },
});
