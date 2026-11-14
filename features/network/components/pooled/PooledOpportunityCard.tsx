/**
 * One pooled Marketplace opportunity in the Find Loads list: a live lane and
 * its open load count. Deliberately no per-load detail or bid status — bids
 * carry no lane identity, so status is only attributed on the pool detail
 * screen, by indent.
 */
import Theme from "@/constants/Theme";
import { titleCaseWord } from "@/features/network/components/MarketplaceLoadCardChrome";
import { formatFindLoadsRateOffer } from "@/features/network/services/findLoadsForOrg.service";
import { positiveLaneTarget } from "@/features/network/utils/marketplaceSearch.util";
import { PoolStatusPill } from "@/features/network/components/pooled/PoolStatusPill";
import { RouteEndpointStack } from "@/features/network/components/RouteEndpointStack";
import type { PoolLane } from "@/features/network/utils/pooledOpportunity.util";
import { ArrowRight, Eye, Package } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

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
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      accessible={false}
      onHoverIn={() => {
        setHovered(true);
        onWarm?.();
      }}
      onPressIn={onWarm}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.card,
        isDesktop && columns === 2 && styles.cardDesktopTwo,
        isDesktop && columns !== 2 && styles.cardDesktop,
        hovered && styles.cardHover,
      ]}
    >
      <View style={[styles.stage, hovered && styles.stageHover]}>
        <View style={styles.top}>
          <Text style={styles.poolTagText} numberOfLines={1}>
            POOLED · {loadsLabel.toUpperCase()}
          </Text>
          <View style={styles.badges}>
            {fitsFleet ? (
              <View style={styles.fitBadge}>
                <Text style={styles.fitBadgeText}>Fleet fit</Text>
              </View>
            ) : (
              <PoolStatusPill
                state={loadCount > 0 ? "open" : "closed"}
                surface="mint"
                size="compact"
              />
            )}
            {fitsFleet ? (
              <View
                accessibilityLabel={`Pool status: ${loadCount > 0 ? "Open for bids" : "Closed"}`}
              />
            ) : null}
          </View>
        </View>

        <View style={styles.route}>
          <View style={styles.routeCol}>
            <Text style={styles.routeLabel}>Pickup</Text>
            <RouteEndpointStack
              value={lane.pickup_area}
              primaryStyle={styles.routeCity}
              secondaryStyle={styles.routeArea}
              maxLinesPerItem={1}
            />
          </View>
          <View style={styles.routeArrow}>
            <ArrowRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
          </View>
          <View style={[styles.routeCol, styles.routeEnd]}>
            <Text style={[styles.routeLabel, styles.alignEnd]}>Drop</Text>
            <RouteEndpointStack
              value={lane.drop_location}
              align="end"
              primaryStyle={styles.routeCity}
              secondaryStyle={styles.routeArea}
              maxLinesPerItem={1}
            />
          </View>
        </View>
        <Text style={styles.vehicle} numberOfLines={1}>
          {vehicle || " "}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <View style={[styles.metricIcon, hovered && styles.stageHover]}>
              <Package size={14} color={Theme.primaryText} strokeWidth={2.2} />
            </View>
            <Text style={styles.metricValue}>{loadCount}</Text>
            <Text style={styles.metricUnit}>{loadCount === 1 ? "load" : "loads"}</Text>
          </View>
          <View style={styles.actions}>
          <Pressable
            onPress={onPress}
            onPressIn={onWarm}
            style={({ pressed }) => [styles.eyeBtn, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Pooled opportunity, ${lane.pickup_area} to ${lane.drop_location}, ${vehicle}, ${loadsLabel}`}
            hitSlop={8}
          >
            <Eye size={16} color={Theme.primaryText} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            onPress={onBid}
            onPressIn={onWarm}
            style={({ pressed }) => [styles.cta, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Bid on pool, ${lane.pickup_area} to ${lane.drop_location}`}
            hitSlop={6}
          >
            <Text style={styles.ctaText}>Bid</Text>
          </Pressable>
          </View>
        </View>
        <View style={[styles.targetBand, hovered && styles.stageHover]}>
          <Text style={styles.targetKicker}>Target</Text>
          <View style={styles.targetPrices}>
            <Text style={styles.targetPrice} numberOfLines={1}>
              {targetLowLabel ?? "—"}
            </Text>
            {!singleTarget && targetHighLabel ? (
              <>
                <Text style={styles.targetDash}>–</Text>
                <Text style={styles.targetPrice} numberOfLines={1}>
                  {targetHighLabel}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    marginBottom: 10,
    overflow: "hidden",
    ...Platform.select({
      web: { transition: "border-color 160ms ease, background-color 160ms ease" } as object,
      default: {},
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
  cardHover: {
    borderColor: Theme.brandBluePressed,
  },
  cardPressed: { opacity: 0.92 },
  stage: {
    margin: 6,
    borderRadius: 10,
    backgroundColor: Theme.brandBlueMist,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
  },
  stageHover: {
    backgroundColor: Theme.brandBlue,
  },
  body: {
    marginTop: "auto",
    paddingHorizontal: 6,
    paddingTop: 2,
    paddingBottom: 8,
    gap: 6,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 32,
    gap: 6,
  },
  metric: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
  metricIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.brandBlueMist,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: { fontSize: 16, fontWeight: "700", letterSpacing: -0.3, color: Theme.textPrimaryDark },
  metricUnit: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  targetBand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Theme.brandBlueMist,
  },
  targetKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  targetPrices: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  targetPrice: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: Theme.textPrimaryDark,
  },
  targetDash: { fontSize: 13, fontWeight: "600", color: Theme.textSecondary },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  poolTagText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: Theme.primaryText,
  },
  route: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  routeArrow: {
    width: 16,
    height: 14,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  routeCol: { flex: 1, minWidth: 0, gap: 1 },
  routeEnd: { alignItems: "flex-end" },
  alignEnd: { textAlign: "right", alignSelf: "stretch" },
  routeLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.primaryText,
  },
  routeCity: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  routeArea: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  vehicle: {
    minHeight: 14,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: Theme.primaryText,
  },
  badges: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  fitBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
  },
  fitBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.positive,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 4 },
  eyeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: Theme.loadMainTabBg,
  },
  ctaText: { fontSize: 13, fontWeight: "700", color: Theme.primaryText },
});
