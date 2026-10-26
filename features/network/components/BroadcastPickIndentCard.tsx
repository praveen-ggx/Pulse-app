/**
 * Broadcast lane picker — same ticket shell as the Trips indent stage.
 */
import Theme from "@/constants/Theme";
import type { IndentRow } from "@/features/indents";
import type { IndentCardAvatarProps } from "@/features/network/utils/indentCardAvatar.util";
import { TripsHubIndentStageCard } from "@/features/trips/components/TripsHubIndentStageCard";
import { Rocket } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

type BroadcastPickIndentCardProps = {
  load: IndentRow;
  indentCount?: number;
  storyLive?: boolean;
  selected: boolean;
  bidCount: number;
  onPress: () => void;
  /** Reach: pick a tariff and boost this live story. */
  onBoost?: () => void;
  boostDisabled?: boolean;
  boostLabel?: string;
  hubGrid?: boolean;
  avatar?: IndentCardAvatarProps | null;
  clientTitle?: string;
};

export function BroadcastPickIndentCard({
  load,
  indentCount = 1,
  storyLive = false,
  selected,
  bidCount,
  onPress,
  onBoost,
  boostDisabled = false,
  boostLabel = "Boost",
  hubGrid = false,
  avatar,
  clientTitle,
}: BroadcastPickIndentCardProps) {
  const laneLabel = indentCount === 1 ? "1 LOAD" : `${indentCount} LOADS`;
  return (
    <View style={[styles.wrap, selected && styles.wrapSelected]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.wrapPressed]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${load.pickup_area} to ${load.drop_location}, ${laneLabel}, ${storyLive ? "active story" : "inactive story"}. ${selected ? "Previewing" : "Tap to preview"}`}
      >
        <View pointerEvents="none" style={styles.ticket}>
          <TripsHubIndentStageCard
            indent={load}
            bidCount={bidCount}
            displayNumber={laneLabel}
            extraTags={[storyLive ? "ACTIVE STORY" : "INACTIVE STORY"]}
            displayClientName={clientTitle}
            onPress={() => undefined}
            tr={(key) => key}
            hubGrid={hubGrid}
            clientAvatarUrl={avatar?.avatarUrl}
            clientAvatarSeed={avatar?.avatarSeed}
            clientAvatarFallbackSeed={avatar?.initialsColorSeed}
            clientOrganizationImageUrl={avatar?.organizationImageUrl}
            clientOrganizationAvatarSeed={avatar?.organizationAvatarSeed}
            clientIntegrated={avatar?.isIntegrated}
          />
        </View>
      </Pressable>
      {onBoost ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onBoost();
          }}
          disabled={boostDisabled}
          style={[styles.boostBtn, boostDisabled && styles.boostBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={boostLabel}
        >
          <Rocket size={13} color={Theme.textOnPrimary} />
          <Text style={styles.boostBtnText}>{boostLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  wrapSelected: {
    borderColor: Theme.primary,
  },
  wrapPressed: { opacity: 0.92 },
  ticket: { minWidth: 0 },
  boostBtn: {
    marginTop: 8,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    zIndex: 2,
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  boostBtnDisabled: { opacity: 0.45 },
  boostBtnText: { fontSize: 13, fontWeight: "800", color: Theme.textOnPrimary },
});
