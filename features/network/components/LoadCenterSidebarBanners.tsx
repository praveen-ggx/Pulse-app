/**
 * Load Center desktop sidebar — Pulse story share + Pulse Boost boost banners.
 */
import { PulseMascotBanner } from "@/components/PulseMascotBanner";
import Theme from "@/constants/Theme";
import {
  METRONIC,
  networkDesktopHubStyles as hubStyles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { ROUTES } from "@/lib/routes";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Rocket, Zap } from "lucide-react-native";
import {
  Platform,
  Pressable,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type Props = {
  /** Broadcast an indent as a 24h Pulse story (or open create when none). */
  onPulseStory?: () => void;
  /** True when at least one indent can be pulsed. */
  hasShareableIndent?: boolean;
};

export function LoadCenterSidebarBanners({
  onPulseStory,
  hasShareableIndent = false,
}: Props) {
  const router = useRouter();

  const openReach = () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(ROUTES.REACH.HOME as never);
  };

  const pulseStory = () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPulseStory?.();
  };

  return (
    <View style={local.stack}>
      <View style={[hubStyles.salesCard, local.storyCard]}>
        <View style={local.storyCopy}>
          <Text style={[local.chip, { color: Theme.pulseIndigo }]}>
            Story
          </Text>
          <Text style={local.title}>Share indents as a story</Text>
          <Text style={local.sub}>
            {hasShareableIndent
              ? "Broadcast an open indent to your network for 24h — suppliers can quote from the story."
              : "Create an open indent, then Pulse it as a story so partners can quote fast."}
          </Text>
        </View>
        <PulseMascotBanner id="broadcastSignal" maxHeight={84} />
        <Pressable
          onPress={pulseStory}
          disabled={!onPulseStory}
          style={({ pressed }) => [
            local.pulseBtn,
            pressed && local.pressed,
            !onPulseStory && local.disabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Pulse indent to network as story"
        >
          <Zap size={12} color={Theme.cardWhite} strokeWidth={2.4} />
          <Text style={local.pulseBtnText}>Pulse</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={openReach}
        style={({ pressed }) => [
          hubStyles.salesCard,
          local.reachCard,
          pressed && local.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Open Pulse Boost — boost your indent story"
      >
        <View style={local.reachCopy}>
          <View style={local.reachChipRow}>
            <Rocket size={11} color={Theme.accentBrown} strokeWidth={2.3} />
            <Text style={[local.chip, { color: Theme.accentBrown }]}>
              Pulse Boost
            </Text>
          </View>
          <Text style={local.reachTitle}>Boost your indent story</Text>
          <Text style={local.reachSub}>
            Make it effective and interesting — amplify reach so more partners
            see and quote your loads.
          </Text>
        </View>
        <PulseMascotBanner id="loadsPileUp" maxHeight={84} />
        <View style={local.reachCta}>
          <Text style={local.reachCtaText}>Open Pulse Boost</Text>
        </View>
      </Pressable>
    </View>
  );
}

const local = {
  stack: {
    gap: 10,
    width: "100%",
  } satisfies ViewStyle,
  pressed: {
    opacity: 0.92,
  } satisfies ViewStyle,
  disabled: {
    opacity: 0.55,
  } satisfies ViewStyle,
  storyCard: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 12,
    gap: 10,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  } satisfies ViewStyle,
  storyCopy: {
    gap: 3,
    minWidth: 0,
  } satisfies ViewStyle,
  chip: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  } satisfies TextStyle,
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.2,
    lineHeight: 17,
  } satisfies TextStyle,
  sub: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.subtle,
    lineHeight: 15,
  } satisfies TextStyle,
  pulseBtn: {
    alignSelf: "stretch",
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: Theme.pulseIndigo,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  } satisfies ViewStyle,
  pulseBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.cardWhite,
  } satisfies TextStyle,
  reachCard: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 12,
    gap: 10,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  } satisfies ViewStyle,
  reachCopy: {
    minWidth: 0,
    gap: 4,
  } satisfies ViewStyle,
  reachChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  } satisfies ViewStyle,
  reachTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.2,
    lineHeight: 17,
  } satisfies TextStyle,
  reachSub: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.subtle,
    lineHeight: 15,
  } satisfies TextStyle,
  reachCta: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: METRONIC.border,
  } satisfies ViewStyle,
  reachCtaText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.accentBrown,
  } satisfies TextStyle,
};
