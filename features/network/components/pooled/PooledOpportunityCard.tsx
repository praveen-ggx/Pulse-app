/**
 * One pooled Marketplace opportunity in the Find Loads list: a live lane and
 * its open load count. Deliberately no per-load detail or bid status — bids
 * carry no lane identity, so status is only attributed on the pool detail
 * screen, by indent.
 */
import { PulseImage } from "@/components/PulseImage";
import Theme from "@/constants/Theme";
import { titleCaseWord } from "@/features/network/components/MarketplaceLoadCardChrome";
import { formatFindLoadsRateOffer } from "@/features/network/services/findLoadsForOrg.service";
import { positiveLaneTarget } from "@/features/network/utils/marketplaceSearch.util";
import type { PoolLane } from "@/features/network/utils/pooledOpportunity.util";
import { routeEndpointLines } from "@/features/network/utils/storyDisplay";
import { Image as ExpoImage } from "expo-image";
import { ArrowRight, Eye } from "lucide-react-native";
import { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

const PUCO = require("@/assets/images/favicon.png");

/** One decode for every lane card. The list paints from this cache instead of fetching the mark per row. */
function laneMarkUri(): string | undefined {
  try {
    return Image.resolveAssetSource(PUCO)?.uri;
  } catch {
    return undefined;
  }
}

const PUCO_URI = laneMarkUri();
if (PUCO_URI) {
  void ExpoImage.prefetch(PUCO_URI, "memory-disk");
}

function placeParts(value: string | null | undefined): { city: string; area: string } {
  const lines = routeEndpointLines(value).map((line) => titleCaseWord(line));
  return { city: lines[0] ?? "—", area: lines.slice(1).join(" · ") };
}

export function PooledOpportunityCard({
  lane,
  fitsFleet,
  isDesktop = false,
  columns = 3,
  onPress,
  onBid,
  onWarm,
}: {
  lane: PoolLane;
  fitsFleet: boolean;
  isDesktop?: boolean;
  columns?: number;
  /** Opens the pool detail. */
  onPress: () => void;
  /** Opens the pool and starts the one-rate bid. */
  onBid: () => void;
  /** Starts the pool manifest fetch before navigation. */
  onWarm?: () => void;
}) {
  const vehicle = titleCaseWord(lane.vehicle_type);
  const loadCount = Number(lane.load_count) || 0;
  const loadsLabel = `${loadCount} load${loadCount === 1 ? "" : "s"}`;
  const targetLo = positiveLaneTarget(lane.target_rate_min);
  const targetHi = positiveLaneTarget(lane.target_rate_max);
  const targetLowLabel = formatFindLoadsRateOffer(targetLo);
  const targetHighLabel = formatFindLoadsRateOffer(targetHi ?? targetLo);
  const singleTarget = Boolean(targetLowLabel && targetLowLabel === targetHighLabel);
  const price =
    targetLowLabel == null
      ? "—"
      : singleTarget || !targetHighLabel
        ? targetLowLabel
        : `${targetLowLabel} – ${targetHighLabel}`;
  const pickup = placeParts(lane.pickup_area);
  const drop = placeParts(lane.drop_location);
  const [hovered, setHovered] = useState(false);
  const open = loadCount > 0;
  const offer = !open ? "Closed" : fitsFleet ? "Fleet fit · Open for bids" : "Open for bids";

  return (
    <View
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={[
        styles.card,
        !isDesktop && styles.cardPhone,
        isDesktop && columns === 2 && styles.cardDesktopTwo,
        isDesktop && columns >= 3 && styles.cardDesktop,
        hovered && styles.cardHover,
      ]}
    >
      <Pressable
        onPressIn={onWarm}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Pooled opportunity, ${lane.pickup_area} to ${lane.drop_location}, ${vehicle}, ${loadsLabel}`}
        style={styles.main}
      >
      <View style={styles.schedule}>
        <PulseImage
          source={PUCO_URI ? { uri: PUCO_URI } : PUCO}
          style={styles.mark}
          accessibilityLabel="Puco"
          contentFit="contain"
          priority="high"
          cachePolicy="memory-disk"
          recyclingKey="puco-lane-mark"
        />
        <View style={styles.leg}>
          <Text style={styles.city} numberOfLines={2}>{pickup.city}</Text>
          <Text style={styles.area} numberOfLines={1}>{pickup.area || "Pickup"}</Text>
        </View>
        <View style={styles.mid}>
          <Text style={styles.midPrimary} numberOfLines={1}>{loadsLabel}</Text>
          <Text style={styles.midSecondary} numberOfLines={1}>{vehicle || "Lane"}</Text>
        </View>
        <View style={[styles.leg, styles.legEnd]}>
          <Text style={[styles.city, styles.alignEnd]} numberOfLines={2}>{drop.city}</Text>
          <Text style={[styles.area, styles.alignEnd]} numberOfLines={1}>{drop.area || "Drop"}</Text>
        </View>
      </View>

      <View style={styles.meta}>
        <View style={styles.metaCopy}>
          <Text
            style={[styles.offer, !open && styles.offerClosed]}
            numberOfLines={1}
            accessibilityLabel={`Pool status: ${open ? "Open for bids" : "Closed"}`}
          >
            {offer}
          </Text>
        </View>
      </View>

      <View style={styles.priceBlock}>
        <Text style={styles.priceLabel}>Target price</Text>
        <Text style={styles.price} numberOfLines={1}>{price}</Text>
      </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          onPress={onPress}
          onPressIn={onWarm}
          style={({ pressed }) => [styles.eyeBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`View lane, ${lane.pickup_area} to ${lane.drop_location}`}
          hitSlop={8}
        >
          <Eye size={16} color={Theme.primaryText} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          onPress={onBid}
          onPressIn={onWarm}
          style={({ pressed }) => [styles.bid, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Bid on pool, ${lane.pickup_area} to ${lane.drop_location}`}
          hitSlop={6}
        >
          <Text style={styles.bidText}>Bid</Text>
          <ArrowRight size={13} color={Theme.primaryText} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    marginBottom: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
    position: "relative",
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)" } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
      },
    }),
  },
  cardDesktopTwo: {
    width: "calc((100% - 12px) / 2)" as unknown as number,
    maxWidth: "calc((100% - 12px) / 2)" as unknown as number,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    alignSelf: "stretch",
    marginBottom: 0,
  },
  cardDesktop: {
    width: "calc((100% - 24px) / 3)" as unknown as number,
    maxWidth: "calc((100% - 24px) / 3)" as unknown as number,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    alignSelf: "stretch",
    marginBottom: 0,
  },
  cardPhone: { borderRadius: 12 },
  cardHover: { borderColor: Theme.brandBluePressed },
  main: { gap: 8 },
  pressed: { opacity: 0.85 },
  mark: { width: 26, height: 26 },
  schedule: { flexDirection: "row", alignItems: "center", gap: 8 },
  leg: { flex: 1, minWidth: 0, gap: 1 },
  legEnd: { alignItems: "flex-end" },
  city: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: -0.1,
    color: Theme.textPrimaryDark,
  },
  area: { fontSize: 11, lineHeight: 14, fontWeight: "400", color: Theme.textSecondary },
  alignEnd: { textAlign: "right", alignSelf: "stretch" },
  mid: { width: 108, flexShrink: 1, alignItems: "center", gap: 1 },
  midPrimary: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: Theme.textSecondary, textAlign: "center" },
  midSecondary: { fontSize: 11, lineHeight: 14, fontWeight: "500", color: Theme.textMuted, textAlign: "center" },
  meta: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingLeft: 34 },
  metaCopy: { flex: 1, minWidth: 0, gap: 1 },
  priceBlock: { minWidth: 0, gap: 1, paddingLeft: 34, paddingRight: 108 },
  priceLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  price: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: Theme.textPrimaryDark,
  },
  offer: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: Theme.driverPrimary },
  offerClosed: { color: Theme.textMuted },
  actions: {
    position: "absolute",
    right: 14,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  eyeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  bid: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: Theme.brandBlue,
  },
  bidText: { fontSize: 13, lineHeight: 16, fontWeight: "600", color: Theme.primaryText },
});
