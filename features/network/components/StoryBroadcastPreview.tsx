/**
 * Load story preview — single elegant card with entrance motion + Lottie hero.
 */
import { PulseStoryWatermark } from "@/components/brand/PulseStoryWatermark";
import { HubPromoHeroLottie } from "@/components/hub/HubPromoLottie";
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { RouteEndpointStack } from "@/features/network/components/RouteEndpointStack";
import type { PostRow } from "@/features/network/services/posts.service";
import {
  formatStoryBidSubmittedAt,
  type StoryOwnerBidRow,
} from "@/features/network/utils/bidding/storyOwnerBids.util";
import { formatINR } from "@/lib/format";
import { ArrowRight, Package } from "lucide-react-native";
import { useEffect, useRef } from "react";
import {
    Animated,
    Easing,
    Platform,
    StyleSheet,
    Text,
    View,
} from "react-native";

const INK = Theme.loadAddButtonText;
const MUTED = Theme.loadStatusTabTextMuted;
const SKY = Theme.loadAddButtonBg;
const SKY_TRAY = Theme.loadStatusTabTrayBg;

const LOAD_BROADCAST_LOTTIE = require("@/assets/Animated folder/auction.json");
const OPEN_CAPACITY_LOTTIE = require("@/assets/Animated folder/truck.json");

export type StoryBroadcastPreviewProps = {
  post: PostRow;
  loadMaterial: string;
  origin: string | null | undefined;
  destination: string | null | undefined;
  loadTargetRate: number | null;
  isDesktopPreview?: boolean;
  storyKey: string;
  /** Defaults to "Load broadcast". FO capacity uses "Open capacity". */
  kicker?: string;
  /** Owner-only: how many open indents sit on this lane. Hidden for bidders. */
  indentCount?: number;
  /** Owner-only: newest bid on this lane (history stays in the bids sheet). */
  latestBid?: StoryOwnerBidRow | null;
};

export function StoryBroadcastPreview({
  post,
  loadMaterial,
  origin,
  destination,
  loadTargetRate,
  isDesktopPreview = false,
  storyKey,
  kicker = "Load broadcast",
  indentCount,
  latestBid = null,
}: StoryBroadcastPreviewProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(28)).current;
  const routePulse = useRef(new Animated.Value(0)).current;
  const isCapacity = (post.type ?? "").toUpperCase() === "VEHICLE_AVAILABILITY";
  const heroLottie = isCapacity ? OPEN_CAPACITY_LOTTIE : LOAD_BROADCAST_LOTTIE;
  const resolvedKicker = kicker !== "Load broadcast"
    ? kicker
    : isCapacity
      ? "Open capacity"
      : "Load broadcast";

  useEffect(() => {
    fade.setValue(0);
    rise.setValue(28);
    routePulse.setValue(0);

    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(rise, {
        toValue: 0,
        tension: 72,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(routePulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(routePulse, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [storyKey, fade, rise, routePulse]);

  const arrowOpacity = routePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });

  const vehicleHero = post.vehicle_type?.trim() || "Any vehicle";
  const showOwnerIndentCount = typeof indentCount === "number" && indentCount > 0;
  const latestBidAt = latestBid ? formatStoryBidSubmittedAt(latestBid.createdAt) : "";
  const showMetaRow =
    showOwnerIndentCount ||
    Boolean(loadMaterial?.trim()) ||
    post.weight_tonnes != null ||
    loadTargetRate != null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        isDesktopPreview && styles.wrapDesktop,
        { opacity: fade, transform: [{ translateY: rise }] },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.card, isDesktopPreview && styles.cardDesktop]}>
        <View style={styles.brandHero}>
          <View style={[styles.brandRing, isDesktopPreview && styles.brandRingDesktop]}>
            <PartyAvatar
              name={(post.org_name ?? "").trim() || " "}
              organizationImageUrl={post.org_avatar_url}
              organizationAvatarSeed={post.org_avatar_seed}
              avatarSeed={post.org_avatar_seed}
              initialsColorSeed={post.organization_id ?? post.org_name}
              entityType="supplier"
              size={isDesktopPreview ? 96 : 84}
              shape="circle"
            />
            <View style={styles.lottieBadge}>
              <HubPromoHeroLottie
                source={heroLottie}
                width={isDesktopPreview ? 36 : 32}
                height={isDesktopPreview ? 36 : 32}
                renderScale={1.15}
              />
            </View>
          </View>
          {(post.org_name ?? "").trim() ? (
            <Text
              style={[styles.orgName, isDesktopPreview && styles.orgNameDesktop]}
              numberOfLines={2}
            >
              {post.org_name.trim()}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.kicker, isDesktopPreview && styles.kickerDesktop]}>
          {resolvedKicker}
        </Text>

        <Text
          style={[styles.heroTitle, isDesktopPreview && styles.heroTitleDesktop]}
          numberOfLines={2}
        >
          {vehicleHero}
        </Text>

        <View style={styles.watermark} pointerEvents="none">
          <PulseStoryWatermark size={isDesktopPreview ? 42 : 36} opacity={0.48} />
        </View>

        <View style={styles.routeStrip}>
          <View style={styles.routeEndpoint}>
            <View style={styles.dotOrigin} />
            <RouteEndpointStack
              value={origin}
              primaryStyle={styles.routeCity}
              secondaryStyle={styles.routeState}
              maxLinesPerItem={4}
            />
          </View>

          <Animated.View style={[styles.routeArrowWrap, { opacity: arrowOpacity }]}>
            <View style={styles.routeLine} />
            <ArrowRight size={isDesktopPreview ? 18 : 15} color={INK} strokeWidth={2.25} />
            <View style={styles.routeLine} />
          </Animated.View>

          <View style={[styles.routeEndpoint, styles.routeEndpointEnd]}>
            <View style={styles.dotDest} />
            <RouteEndpointStack
              value={destination}
              align="end"
              primaryStyle={styles.routeCity}
              secondaryStyle={styles.routeState}
              maxLinesPerItem={4}
            />
          </View>
        </View>

        {showMetaRow ? (
          <View style={styles.metaRow}>
            {showOwnerIndentCount ? (
              <View style={styles.metaChip} accessibilityLabel={`${indentCount} indents on this lane`}>
                <Text style={styles.metaChipText}>
                  {indentCount} {indentCount === 1 ? "indent" : "indents"}
                </Text>
              </View>
            ) : null}
            {loadMaterial?.trim() ? (
              <View style={styles.metaChip}>
                <Package size={11} color={MUTED} strokeWidth={2} />
                <Text style={styles.metaChipText} numberOfLines={1}>
                  {loadMaterial}
                </Text>
              </View>
            ) : null}
            {post.weight_tonnes != null ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{post.weight_tonnes}T</Text>
              </View>
            ) : null}
            {loadTargetRate != null ? (
              <View style={[styles.metaChip, styles.metaChipRate]}>
                <Text style={styles.metaChipRateText}>{formatINR(loadTargetRate)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {latestBid ? (
          <View
            style={styles.latestBidBox}
            accessibilityLabel={`Latest bid ${formatINR(latestBid.amount)} submitted ${latestBidAt}`}
          >
            <Text style={styles.latestBidKicker}>Latest bid</Text>
            <Text style={styles.latestBidAmount}>{formatINR(latestBid.amount)}</Text>
            <Text style={styles.latestBidMeta} numberOfLines={2}>
              {latestBidAt
                ? `${latestBid.bidderName} · ${latestBidAt}`
                : latestBid.bidderName}
            </Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const cardShadow = Platform.select({
  web: {
    boxShadow:
      "0 8px 28px rgba(77, 54, 54, 0.08), 0 2px 8px rgba(205, 233, 247, 0.45)",
  } as object,
  ios: {
    shadowColor: "#4D3636",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  android: { elevation: 3 },
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  wrapDesktop: {
    maxWidth: 440,
    paddingHorizontal: 0,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabTrayBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
    ...cardShadow,
  },
  cardDesktop: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    borderRadius: 22,
    gap: 10,
  },
  watermark: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  brandHero: {
    zIndex: 1,
    alignItems: "center",
    marginBottom: 2,
    gap: 8,
  },
  orgName: {
    fontSize: 15,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.3,
    textAlign: "center",
    maxWidth: "92%",
    lineHeight: 19,
  },
  orgNameDesktop: {
    fontSize: 17,
    lineHeight: 21,
  },
  brandRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 3,
    borderColor: Theme.cardWhite,
    ...Platform.select({
      web: { boxShadow: "0 8px 20px rgba(77, 54, 54, 0.12)" } as object,
      ios: {
        shadowColor: Theme.pulseIndigo,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  brandRingDesktop: { width: 108, height: 108, borderRadius: 54 },
  lottieBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: SKY_TRAY,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: Theme.pulseIndigo,
    textAlign: "center",
  },
  kickerDesktop: {
    fontSize: 10,
    letterSpacing: 2.4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: INK,
    letterSpacing: -0.5,
    textAlign: "center",
    lineHeight: 26,
    maxWidth: "100%",
  },
  heroTitleDesktop: {
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.7,
  },
  routeStrip: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: SKY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  routeEndpoint: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    alignItems: "flex-start",
  },
  routeEndpointEnd: {
    alignItems: "flex-end",
  },
  dotOrigin: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.positive,
    marginBottom: 2,
  },
  dotDest: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.pulseIndigo,
    marginBottom: 2,
  },
  routeCity: {
    fontSize: 13,
    fontWeight: "900",
    color: INK,
    letterSpacing: -0.2,
    maxWidth: "100%",
  },
  routeCityEnd: {
    textAlign: "right",
  },
  routeState: {
    fontSize: 9,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.3,
    maxWidth: "100%",
  },
  routeStateEnd: {
    textAlign: "right",
  },
  routeArrowWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    paddingHorizontal: 2,
    paddingTop: 18,
  },
  routeLine: {
    width: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: INK,
    opacity: 0.2,
    borderRadius: 1,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
    width: "100%",
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: SKY_TRAY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
    maxWidth: "100%",
  },
  metaChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.1,
  },
  metaChipRate: {
    backgroundColor: Theme.accentGoldMuted,
    borderColor: Theme.accentGoldBorder,
  },
  metaChipRateText: {
    fontSize: 11,
    fontWeight: "900",
    color: INK,
    letterSpacing: -0.15,
  },
  latestBidBox: {
    width: "100%",
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: SKY_TRAY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
    alignItems: "center",
    gap: 2,
  },
  latestBidKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: MUTED,
  },
  latestBidAmount: {
    fontSize: 16,
    fontWeight: "900",
    color: INK,
    letterSpacing: -0.3,
  },
  latestBidMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    textAlign: "center",
  },
});
