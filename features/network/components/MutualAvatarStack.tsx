/**
 * LinkedIn-style overlapping mutual connection avatars (facepile).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { NETWORK_DISCOVER_MUTUAL_FACE_SIZE } from "@/features/network/components/networkDiscoverDossierCard.styles";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const MAX_VISIBLE = 3;

function mutualSeeds(orgId: string, visible: number): string[] {
  return Array.from({ length: visible }, (_, i) => `${orgId}-mutual-${i}`);
}

export type MutualFace = {
  id: string;
  name: string;
  avatar_seed?: string | null;
  /** Resolved avatar URL (org logo → owner profile avatar). When `null`,
   *  the face renders the seed-derived placeholder so the layout stays
   *  consistent. */
  avatar_url?: string | null;
};

export type MutualAvatarStackProps = {
  orgId: string;
  mutualCount: number;
  /** Resolved mutual orgs — when set, avatars use real names/seeds. */
  mutuals?: MutualFace[];
  onPressFace?: (face: MutualFace, index: number) => void;
  onPressOverflow?: () => void;
  /** When true, show a small caption under the stack. */
  showLabel?: boolean;
  label?: string;
  /** Avatar diameter (default NETWORK_DISCOVER_MUTUAL_FACE_SIZE). */
  faceSize?: number;
  /** Background for +N overflow chip (default dark). */
  overflowColor?: string;
  /** Tighter caption for discover cards. */
  compact?: boolean;
  /** Sit in a row (indent / trip cards) instead of stretching to 100% width. */
  inline?: boolean;
};

export function MutualAvatarStack({
  orgId,
  mutualCount,
  mutuals,
  onPressFace,
  onPressOverflow,
  showLabel = true,
  label,
  faceSize = NETWORK_DISCOVER_MUTUAL_FACE_SIZE,
  overflowColor = Theme.textPrimaryDark,
  compact = false,
  inline = false,
}: MutualAvatarStackProps) {
  const visibleFaces = Math.min(MAX_VISIBLE, Math.max(0, mutualCount));
  const overflow = mutualCount > MAX_VISIBLE ? mutualCount - MAX_VISIBLE : 0;
  /**
   * "Real" faces come from the resolved `mutuals` array (each entry has
   * a true org UUID and the real organization name). "Synthetic" faces
   * are placeholder seeds we render while the mutual list is still
   * loading — they let the avatar stack take its final layout shape
   * without snapping in once the query resolves, but they must NEVER
   * be tappable: their `id` is a fake `${orgId}-mutual-N` string that
   * would break any downstream profile lookup, which is exactly the
   * "MUTUAL 1 / NOT AVAILABLE / 0 trips" stuck-state we used to see.
   */
  const resolvedFaces = useMemo<Array<MutualFace & { isReal: boolean }>>(() => {
    if (mutuals?.length) {
      return mutuals.slice(0, visibleFaces).map((m) => ({ ...m, isReal: true }));
    }
    return mutualSeeds(orgId, visibleFaces).map((seed, index) => ({
      id: seed,
      name: `Mutual ${index + 1}`,
      avatar_seed: seed,
      isReal: false,
    }));
  }, [mutuals, orgId, visibleFaces]);

  const overlap = Math.max(6, Math.round(faceSize * 0.34));
  const slotCount = visibleFaces + (overflow > 0 ? 1 : 0);
  const stackWidth =
    slotCount > 0 ? faceSize + Math.max(0, slotCount - 1) * (faceSize - overlap) : faceSize;

  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        stack: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
          height: faceSize,
          minWidth: stackWidth,
          alignSelf: "flex-start",
        },
        /**
         * IMPORTANT: tap target sizing.
         *
         * `faceSlot` is applied to the OUTER element (the `Pressable`
         * for tappable faces, or a plain `View` for synthetic
         * placeholders). It owns:
         *   - the avatar diameter (so `Pressable` has an explicit
         *     hit area equal to what the user sees), and
         *   - the overlap shift (`marginLeft: -overlap`) for non-first
         *     faces, so the `Pressable`'s bounding box moves with the
         *     visible avatar instead of staying at its natural slot.
         *
         * Previously the overlap lived on the inner `faceWrap` view,
         * which left the `Pressable`'s bounding box anchored to the
         * natural (non-overlapped) slot — taps on overlapping avatars
         * landed on the adjacent sibling's `Pressable` and the wrong
         * profile (or none at all) was opened.
         */
        faceSlot: {
          width: faceSize,
          height: faceSize,
        },
        faceSlotOverlap: {
          marginLeft: -overlap,
        },
        faceWrap: {
          width: faceSize,
          height: faceSize,
          borderRadius: faceSize / 2,
          borderWidth: 2,
          borderColor: Theme.screenBackground,
          backgroundColor: Theme.surfaceGray,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        },
        overflowWrap: {
          backgroundColor: overflowColor,
        },
        overflowText: {
          fontSize: Math.max(8, Math.round(faceSize * 0.36)),
          fontWeight: "800",
          color: Theme.textOnPrimary,
          letterSpacing: -0.2,
        },
      }),
    [faceSize, overlap, overflowColor, stackWidth],
  );

  if (mutualCount <= 0) return null;

  const caption =
    label ??
    `${mutualCount} mutual connection${mutualCount === 1 ? "" : "s"}`;

  const renderFace = (
    face: MutualFace & { isReal: boolean },
    index: number,
  ) => {
    /**
     * Photo when we have one (org logo → owner avatar). Otherwise the
     * seed avatar — same as the rest of Network — so mutuals never
     * collapse to "M1" / "M2" initials.
     */
    const inner = (
      <View style={dynamic.faceWrap}>
        <PartyAvatar
          name={face.name}
          initialsColorSeed={face.id}
          avatarSeed={face.avatar_seed ?? face.id}
          organizationImageUrl={face.avatar_url ?? null}
          avatarUrl={face.avatar_url ?? null}
          entityType="client"
          isIntegrated
          size={faceSize}
          borderStyle={styles.faceImage}
          style={styles.faceImage}
        />
      </View>
    );

    const slotStyle = [
      dynamic.faceSlot,
      index > 0 && dynamic.faceSlotOverlap,
      { zIndex: index + 1 },
    ];

    /**
     * Tap fallback for synthetic placeholders.
     *
     * Real mutual faces always fire `onPressFace` (open that org's
     * profile). Synthetic placeholders historically rendered into a
     * plain `View` and silently swallowed taps, which is what the
     * "mutual icon not opening profile" report was hitting whenever
     * the resolved mutuals query returned empty even though
     * `mutualCount > 0`. We now route placeholder taps to
     * `onPressOverflow` (the "view all mutuals" handler) so the user
     * always gets a meaningful response — they land on the mutual
     * connections list and can pick the party from there.
     */
    const placeholderPress =
      !face.isReal && onPressOverflow ? onPressOverflow : null;

    if (!onPressFace || !face.isReal) {
      if (placeholderPress) {
        return (
          <Pressable
            key={face.id}
            onPress={placeholderPress}
            style={({ pressed }) => [slotStyle, pressed && { opacity: 0.88 }]}
            accessibilityRole="button"
            accessibilityLabel={caption}
            hitSlop={4}
          >
            {inner}
          </Pressable>
        );
      }
      return (
        <View key={face.id} style={slotStyle}>
          {inner}
        </View>
      );
    }

    return (
      <Pressable
        key={face.id}
        onPress={(event) => {
          event.stopPropagation?.();
          onPressFace(
            {
              id: face.id,
              name: face.name,
              avatar_seed: face.avatar_seed,
              avatar_url: face.avatar_url ?? null,
            },
            index,
          );
        }}
        style={({ pressed }) => [slotStyle, pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
        accessibilityLabel={face.name}
        hitSlop={4}
      >
        {inner}
      </Pressable>
    );
  };

  const overflowSlotStyle = [
    dynamic.faceSlot,
    dynamic.faceSlotOverlap,
    { zIndex: MAX_VISIBLE + 1 },
  ];

  const overflowChip = overflow > 0 ? (
    onPressOverflow ? (
      <Pressable
        onPress={onPressOverflow}
        style={({ pressed }) => [overflowSlotStyle, pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
        accessibilityLabel={`${overflow} more mutual connections`}
        hitSlop={4}
      >
        <View style={[dynamic.faceWrap, dynamic.overflowWrap]}>
          <Text style={dynamic.overflowText}>+{overflow}</Text>
        </View>
      </Pressable>
    ) : (
      <View style={overflowSlotStyle}>
        <View style={[dynamic.faceWrap, dynamic.overflowWrap]}>
          <Text style={dynamic.overflowText}>+{overflow}</Text>
        </View>
      </View>
    )
  ) : null;

  return (
    <View
      style={[
        styles.section,
        compact && styles.sectionCompact,
        inline && styles.sectionInline,
      ]}
      accessibilityLabel={caption}
      accessibilityRole="text"
    >
      <View style={dynamic.stack}>
        {resolvedFaces.map((face, index) => renderFace(face, index))}
        {overflowChip}
      </View>
      {showLabel ? (
        <Text
          style={[styles.label, compact && styles.labelCompact]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: "100%",
  },
  sectionCompact: {
    gap: 2,
  },
  sectionInline: {
    width: "auto",
    maxWidth: "100%",
    alignItems: "flex-start",
    alignSelf: "flex-start",
  },
  faceImage: {
    borderWidth: 0,
    width: "100%",
    height: "100%",
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 12,
    paddingHorizontal: 4,
    maxWidth: "100%",
  },
  labelCompact: {
    fontSize: 8,
    lineHeight: 10,
    color: Theme.textMuted,
  },
});
