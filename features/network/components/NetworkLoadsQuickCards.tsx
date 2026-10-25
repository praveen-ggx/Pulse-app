/**
 * Give / Get loads + Pulse Boost + Pulse Assist — Network home quick actions.
 * Metronic SVG illustration cards (character art) in one shared chrome / rail.
 */
import Theme from "@/constants/Theme";
import {
    NETWORK_HUB_GRID_ROW_PADDING_H,
    SPLIT_STACK_BREAKPOINT,
} from "@/features/network/constants/networkHubGrid";
import { useVerifiedActionGuard } from "@/features/network/utils/verifiedActionGuard";
import { showAppAlert } from "@/lib/appAlert";
import {
    fitNetworkLoadsIllustration,
    NETWORK_LOADS_QUICK_ACTIONS,
    type NetworkLoadsQuickAction,
} from "@/lib/networkLoadsQuickCardsAssets";
import { ROUTES } from "@/lib/routes";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ArrowUpRight, Lock, Zap } from "lucide-react-native";
import { useState } from "react";
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
    type ViewStyle,
} from "react-native";

const NATIVE_APP = Platform.OS !== "web";
/** Readable subline on pastel supply/demand washes. */
const SUB_ON_WASH = "#64748B";

/** Tablet web: 4 tiles in one row starve the text column — go 2×2 below this. */
const TILE_FOUR_UP_MIN_WIDTH = 1280;
const TILE_PAD_H = 16;
const SIDEBAR_PAD_H = 14;
const INLINE_PAD_H = 14;
const ARROW_ORB_W = 30;
/** Text column floor: under this the label truncates to "Give …" and the chip wraps. */
const TEXT_MIN_W = 128;
/** Below this the illustration is noise, not art — drop it and give the text the space. */
const ART_MIN_W = 56;

export interface NetworkLoadsQuickCardsProps {
  compact?: boolean;
  /** "inline" — a short side-by-side strip that sits beside the story row. */
  layout?: "default" | "sidebar" | "inline";
}

type MarketplaceCardProps = {
  action: NetworkLoadsQuickAction;
  pressed: boolean;
  compact?: boolean;
  variant: "tile" | "sidebar";
  isMobile?: boolean;
  inline?: boolean;
};

function MarketplaceArt({
  action,
  illusBoxW,
  illusBoxH,
}: {
  action: NetworkLoadsQuickAction;
  illusBoxW: number;
  illusBoxH: number;
}) {
  const Illustration = action.illustration;
  const illusSize = fitNetworkLoadsIllustration(
    illusBoxW,
    illusBoxH,
    action.aspect,
  );
  return (
    <View
      style={{
        width: illusBoxW,
        height: illusBoxH,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Illustration width={illusSize.width} height={illusSize.height} />
    </View>
  );
}

function MarketplaceCard({
  action,
  pressed,
  compact,
  variant,
  isMobile,
  inline = false,
}: MarketplaceCardProps) {
  const { width } = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState(0);
  const sidebar = variant === "sidebar";
  const mobileTile = isMobile && variant === "tile";
  const locked = Boolean(action.locked);

  // Keep each SVG's native aspect (robot is nearly square, Reach is wider)
  // so the art does not get squashed into a shared wide box.
  const illusMaxH = inline
    ? 80
    : sidebar
      ? 72
      : compact || width < 380
        ? 82
        : 92;

  const rowPadH = inline ? INLINE_PAD_H : sidebar ? SIDEBAR_PAD_H : TILE_PAD_H;
  const rowGap = inline || sidebar ? 10 : 12;
  const widestAspect = Math.max(
    ...NETWORK_LOADS_QUICK_ACTIONS.map((item) => item.aspect),
  );
  const artBudget =
    cardWidth > 0
      ? cardWidth - rowPadH * 2 - rowGap * 2 - ARROW_ORB_W - TEXT_MIN_W
      : Math.round(illusMaxH * widestAspect);
  const artSlotW = Math.max(
    0,
    Math.min(Math.round(illusMaxH * widestAspect), artBudget),
  );
  let illusBoxH = illusMaxH;
  let illusBoxW = Math.round(illusBoxH * action.aspect);
  if (artSlotW > 0 && illusBoxW > artSlotW) {
    illusBoxW = artSlotW;
    illusBoxH = Math.max(48, Math.round(illusBoxW / action.aspect));
  }
  const showIllustration = artSlotW >= ART_MIN_W;

  const actionOrb = (
    <View
      style={[
        mobileTile ? styles.arrowOrbMobile : styles.arrowOrb,
        locked ? styles.arrowOrbLocked : styles.arrowOrbDefault,
      ]}
    >
      {locked ? (
        <Lock
          size={mobileTile ? 13 : sidebar ? 12 : 13}
          color={Theme.textPrimaryDark}
          strokeWidth={2.3}
        />
      ) : (
        <ArrowUpRight
          size={mobileTile ? 14 : 13}
          color={Theme.textPrimaryDark}
          strokeWidth={2.2}
        />
      )}
    </View>
  );

  if (mobileTile) {
    const artH = compact ? 70 : 80;
    const artW = Math.round(artH * action.aspect);

    return (
      <View
        style={[
          styles.cardMobile,
          compact && styles.cardMobileCompact,
          { backgroundColor: action.wash },
          locked && styles.cardLocked,
          pressed && !locked && styles.cardPressed,
        ]}
      >
        {locked ? (
          <View style={styles.lockedBadge}>
            <Lock size={10} color={Theme.textPrimaryDark} strokeWidth={2.4} />
            <Text style={styles.lockedBadgeText}>Locked</Text>
          </View>
        ) : null}
        <View style={styles.cardMobileBody}>
          <View style={styles.cardMobileText}>
            <Text
              style={[styles.chip, { color: action.accent }]}
              numberOfLines={1}
            >
              {action.chip}
            </Text>
            <Text style={styles.titleMobile} numberOfLines={1}>
              {action.label}
            </Text>
            <Text style={styles.subMobile} numberOfLines={1}>
              {action.sub}
            </Text>
          </View>
          <View style={styles.cardMobileAside}>
            <MarketplaceArt
              action={action}
              illusBoxW={artW}
              illusBoxH={artH}
            />
            {actionOrb}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== cardWidth) setCardWidth(w);
      }}
      style={[
        styles.card,
        sidebar && styles.cardSidebar,
        inline && styles.cardInline,
        compact && !sidebar && !inline && styles.cardCompact,
        { backgroundColor: action.wash },
        locked && styles.cardLocked,
        pressed && !locked && styles.cardPressed,
      ]}
    >
      {locked ? (
        <View style={styles.lockedBadge}>
          <Lock size={10} color={Theme.textPrimaryDark} strokeWidth={2.4} />
          <Text style={styles.lockedBadgeText}>Locked</Text>
        </View>
      ) : null}
      <View
        style={[
          styles.cardBody,
          sidebar && !inline && styles.cardBodySidebar,
          inline && styles.cardBodyInline,
        ]}
      >
        <View
          style={[
            styles.textCol,
            sidebar && !inline && styles.textColSidebar,
            inline && styles.textColInline,
          ]}
        >
          <Text
            style={[styles.chip, { color: action.accent }]}
            numberOfLines={1}
          >
            {action.chip}
          </Text>
          <Text
            style={[styles.title, sidebar && !inline && styles.titleSidebar]}
            numberOfLines={1}
          >
            {action.label}
          </Text>
          <Text
            style={[styles.sub, sidebar && !inline && styles.subSidebar]}
            numberOfLines={1}
          >
            {action.sub}
          </Text>
        </View>

        {showIllustration ? (
          <View
            style={[
              styles.illusWrap,
              { width: artSlotW, height: illusBoxH },
              sidebar && styles.illusWrapSidebar,
              locked && styles.illusLocked,
            ]}
          >
            <MarketplaceArt
              action={action}
              illusBoxW={illusBoxW}
              illusBoxH={illusBoxH}
            />
          </View>
        ) : null}

        {actionOrb}
      </View>
    </View>
  );
}

function SectionHeader({ sidebar, isMobile }: { sidebar?: boolean; isMobile?: boolean }) {
  return (
    <View
      style={[
        sidebar ? styles.headSidebar : styles.head,
        isMobile && styles.headMobile,
      ]}
    >
      <View style={styles.headPill}>
        <View style={styles.headIconOrb}>
          <Zap size={sidebar ? 10 : 11} color={Theme.primary} strokeWidth={2} />
        </View>
        <Text
          style={sidebar ? styles.headTitleSidebar : styles.headTitle}
          numberOfLines={1}
        >
          Load marketplace
        </Text>
      </View>
      {!sidebar ? (
        <Text style={styles.headHint}>
          {isMobile ? "Post or bid on freight" : "Tap to open Load Center"}
        </Text>
      ) : null}
    </View>
  );
}

export function NetworkLoadsQuickCards({
  compact = false,
  layout = "default",
}: NetworkLoadsQuickCardsProps) {
  const router = useRouter();
  const guardVerified = useVerifiedActionGuard();
  const { width } = useWindowDimensions();
  const inline = layout === "inline";
  const sidebar = layout === "sidebar";
  const isMobile = !sidebar && !inline && (NATIVE_APP || width < SPLIT_STACK_BREAKPOINT);
  /** Tablet web sits between: one row of 4 is too tight, so pair them 2×2. */
  const twoUp = !sidebar && !isMobile && width < TILE_FOUR_UP_MIN_WIDTH;

  const openAction = (action: NetworkLoadsQuickAction) => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (action.locked) {
      showAppAlert(
        "Pulse Assist is locked",
        "100% guaranteed assist is coming soon. We’ll unlock this feature for your org when it’s ready.",
      );
      return;
    }
    if (action.id === "reach") {
      router.push(ROUTES.REACH.HOME as never);
      return;
    }
    // Give / get load are verified-org only. Unverified taps route to the KYC
    // panel instead of the Load Center.
    guardVerified(() => {
      router.push(ROUTES.PULSE_LOADS);
    });
  };

  const renderCard = (
    action: NetworkLoadsQuickAction,
    variant: "tile" | "sidebar",
  ) => {
    const tile = variant === "tile";
    return (
      <View
        key={action.id}
        style={
          tile
            ? isMobile
              ? styles.cardSlotMobile
              : [styles.cardSlot, twoUp && styles.cardSlotTwoUp]
            : inline
              ? styles.inlineCardSlot
              : styles.sidebarCardPress
        }
      >
        <Pressable
          onPress={() => openAction(action)}
          style={({ pressed }) => [
            tile ? styles.cardPress : styles.sidebarCardPressInner,
            pressed && !action.locked && styles.pressableScale,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(action.locked) }}
          accessibilityLabel={
            action.locked
              ? "Pulse Assist — feature locked"
              : action.id === "reach"
                ? "Open Pulse Boost"
                : `${action.label} — open Load Center`
          }
        >
          {({ pressed }) => (
            <MarketplaceCard
              action={action}
              pressed={pressed}
              compact={compact}
              variant={variant}
              isMobile={isMobile}
              inline={inline}
            />
          )}
        </Pressable>
      </View>
    );
  };

  if (sidebar || inline) {
    return (
      <View style={styles.wrapSidebar}>
        <View style={inline ? styles.railInline : styles.railSidebar}>
          {NETWORK_LOADS_QUICK_ACTIONS.map((action) =>
            renderCard(action, inline ? "tile" : "sidebar"),
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <SectionHeader isMobile={isMobile} />
      <View
        style={[
          styles.rail,
          compact && styles.railCompact,
          twoUp && styles.railTwoUp,
          isMobile && styles.railMobile,
        ]}
      >
        {NETWORK_LOADS_QUICK_ACTIONS.map((action) =>
          renderCard(action, "tile"),
        )}
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  android: { elevation: 2 },
  web: {
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
  } as ViewStyle,
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 10,
    marginTop: 8,
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    paddingBottom: 12,
  },
  wrapCompact: {
    marginTop: 6,
    paddingBottom: 10,
  },
  wrapSidebar: {
    width: "100%",
    minWidth: 0,
    gap: 12,
    justifyContent: "center",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
  },
  headMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
  },
  headSidebar: {
    paddingHorizontal: 0,
  },
  headPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
  },
  headIconOrb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexShrink: 0,
  },
  headTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.35,
    flexShrink: 1,
    minWidth: 0,
  },
  headTitleSidebar: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    flexShrink: 1,
    minWidth: 0,
  },
  headHint: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  rail: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "stretch",
    gap: 12,
    width: "100%",
  },
  railCompact: {
    gap: 10,
  },
  railTwoUp: {
    flexWrap: "wrap",
  },
  railMobile: {
    flexDirection: "column",
    gap: 10,
    alignSelf: "stretch",
  },
  railSidebar: {
    flexDirection: "column",
    gap: 10,
    width: "100%",
  },
  railInline: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
  },
  card: {
    flex: 1,
    width: "100%",
    minHeight: 104,
    borderRadius: 18,
    borderWidth: 0,
    overflow: "hidden",
    position: "relative",
    ...cardShadow,
  },
  cardLocked: {
    opacity: 0.72,
  },
  lockedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  lockedBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  illusLocked: {
    opacity: 0.55,
  },
  cardMobile: {
    width: "100%",
    minHeight: 96,
    borderRadius: 18,
    borderWidth: 0,
    overflow: "hidden",
    position: "relative",
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...cardShadow,
  },
  cardMobileCompact: {
    minHeight: 88,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardMobileBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  cardMobileText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: "center",
  },
  titleMobile: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  subMobile: {
    fontSize: 12,
    fontWeight: "500",
    color: SUB_ON_WASH,
    lineHeight: 16,
  },
  cardMobileAside: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  arrowOrbMobile: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  arrowOrbDefault: {
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  arrowOrbLocked: {
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surface,
  },
  cardCompact: {
    minHeight: 96,
    borderRadius: 16,
  },
  cardSidebar: {
    minHeight: 92,
  },
  cardInline: {
    minHeight: 100,
    borderRadius: 16,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  cardBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 104,
  },
  cardBodySidebar: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 92,
    gap: 10,
  },
  cardBodyInline: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 100,
    gap: 10,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: "center",
    paddingRight: 4,
  },
  textColSidebar: {
    gap: 2,
  },
  textColInline: {
    gap: 2,
    justifyContent: "center",
  },
  chip: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  titleSidebar: {
    fontSize: 15,
    lineHeight: 20,
  },
  sub: {
    fontSize: 12,
    fontWeight: "500",
    color: SUB_ON_WASH,
    lineHeight: 16,
  },
  subSidebar: {
    fontSize: 12,
    lineHeight: 16,
  },
  illusWrap: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  illusWrapSidebar: {
    marginRight: 0,
  },
  arrowOrb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  cardSlot: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  cardSlotTwoUp: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "48%",
    minWidth: 0,
  },
  cardSlotMobile: {
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  cardPress: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  inlineCardSlot: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  sidebarCardPress: {
    width: "100%",
    minWidth: 0,
  },
  sidebarCardPressInner: {
    width: "100%",
    minWidth: 0,
  },
  pressableScale: {
    opacity: 0.98,
  },
});
