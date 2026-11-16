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
import { marketplaceLaneTags, type LaneTagKind } from "@/features/network/utils/marketplaceLaneTags.util";
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Eye,
  IndianRupee,
  Layers,
  MapPin,
  Package,
  Route,
  Truck,
  type LucideIcon,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const TAG_ICON: Record<LaneTagKind, LucideIcon> = {
  pay: IndianRupee,
  route: Route,
  requirement: ClipboardCheck,
};

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
  const tags = useMemo(() => marketplaceLaneTags(lane), [lane]);

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
        !isDesktop && styles.cardPhone,
        isDesktop && columns === 2 && styles.cardDesktopTwo,
        isDesktop && columns !== 2 && styles.cardDesktop,
        hovered && styles.cardHover,
      ]}
    >
      <View style={[styles.stage, !isDesktop && styles.stagePhone, hovered && styles.stageHover]}>
        <View style={styles.top}>
          <View style={styles.badges}>
          <View style={styles.poolTag}>
            <Layers size={11} color={Theme.cardWhite} strokeWidth={2.4} />
            <Text style={[styles.poolTagText, !isDesktop && styles.poolTagTextPhone]} numberOfLines={1}>
              POOLED · {loadsLabel.toUpperCase()}
            </Text>
          </View>
            {fitsFleet ? (
              <View style={styles.fitBadge}>
                <Check size={10} color={Theme.positive} strokeWidth={3} />
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
            <Text style={[styles.routeLabel, !isDesktop && styles.routeLabelPhone]}>Pickup</Text>
            <RouteEndpointStack
              value={lane.pickup_area}
              primaryStyle={!isDesktop ? [styles.routeCity, styles.routeCityPhone] : styles.routeCity}
              secondaryStyle={!isDesktop ? [styles.routeArea, styles.routeAreaPhone] : styles.routeArea}
              maxLinesPerItem={1}
            />
          </View>
          <View style={styles.routeConnector} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.routeDot} />
            <View style={styles.routeDash} />
            <View style={styles.routeTruck}>
              <Truck size={12} color={Theme.primaryText} strokeWidth={2.2} />
            </View>
            <View style={styles.routeDash} />
            <MapPin size={13} color={Theme.primaryText} strokeWidth={2.4} />
          </View>
          <View style={[styles.routeCol, styles.routeEnd]}>
            <Text style={[styles.routeLabel, styles.alignEnd, !isDesktop && styles.routeLabelPhone]}>Drop</Text>
            <RouteEndpointStack
              value={lane.drop_location}
              align="end"
              primaryStyle={!isDesktop ? [styles.routeCity, styles.routeCityPhone] : styles.routeCity}
              secondaryStyle={!isDesktop ? [styles.routeArea, styles.routeAreaPhone] : styles.routeArea}
              maxLinesPerItem={1}
            />
          </View>
        </View>
        {vehicle || tags.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            style={styles.tagScroll}
            contentContainerStyle={styles.tagRow}
            accessibilityLabel={[vehicle, ...tags.map((tag) => tag.label)].filter(Boolean).join(", ")}
          >
            {vehicle ? (
              <View style={styles.vehicleChip}>
                <Truck size={12} color={Theme.primaryText} strokeWidth={2.2} />
                <Text style={[styles.vehicle, !isDesktop && styles.vehiclePhone]} numberOfLines={1}>
                  {vehicle}
                </Text>
              </View>
            ) : null}
            {tags.map((tag) => {
              const Icon = TAG_ICON[tag.kind];
              return (
                <View key={tag.key} style={styles.vehicleChip}>
                  <Icon size={12} color={Theme.primaryText} strokeWidth={2.2} />
                  <Text style={[styles.vehicle, !isDesktop && styles.vehiclePhone]} numberOfLines={1}>
                    {tag.label}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <View style={[styles.body, !isDesktop && styles.bodyPhone]}>
        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <View style={[styles.metricIcon, hovered && styles.stageHover]}>
              <Package size={14} color={Theme.primaryText} strokeWidth={2.2} />
            </View>
            <Text style={[styles.metricValue, !isDesktop && styles.metricValuePhone]}>{loadCount}</Text>
            <Text style={[styles.metricUnit, !isDesktop && styles.metricUnitPhone]}>{loadCount === 1 ? "load" : "loads"}</Text>
            <View style={styles.metricRule} />
            <View style={styles.targetInline}>
              <Text style={[styles.targetKicker, !isDesktop && styles.targetKickerPhone]}>Target</Text>
              <Text style={[styles.targetPrice, !isDesktop && styles.targetPricePhone]} numberOfLines={1}>
                {targetLowLabel ?? "—"}
                {!singleTarget && targetHighLabel ? ` – ${targetHighLabel}` : ""}
              </Text>
            </View>
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
            style={({ pressed }) => [styles.cta, !isDesktop && styles.ctaPhone, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Bid on pool, ${lane.pickup_area} to ${lane.drop_location}`}
            hitSlop={6}
          >
            <Text style={[styles.ctaText, !isDesktop && styles.ctaTextPhone]}>Bid</Text>
            <ArrowRight size={13} color={Theme.primaryText} strokeWidth={2.6} />
          </Pressable>
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
  cardPhone: { borderRadius: 12, marginBottom: 8 },
  stagePhone: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  bodyPhone: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10 },
  poolTagTextPhone: { fontSize: 9, letterSpacing: 0.3 },
  routeLabelPhone: { fontSize: 8, lineHeight: 10, letterSpacing: 0.9 },
  routeCityPhone: { fontSize: 12, lineHeight: 15, fontWeight: "600", letterSpacing: -0.1 },
  routeAreaPhone: { fontSize: 9, lineHeight: 12, fontWeight: "400" },
  vehiclePhone: { fontSize: 10, lineHeight: 13, fontWeight: "500" },
  metricValuePhone: { fontSize: 12, lineHeight: 15, fontWeight: "600", letterSpacing: 0 },
  metricUnitPhone: { fontSize: 11, fontWeight: "500" },
  targetKickerPhone: { fontSize: 9, letterSpacing: 0.3 },
  targetPricePhone: { fontSize: 12, fontWeight: "600", letterSpacing: 0 },
  ctaPhone: { minHeight: 28, paddingHorizontal: 12, borderRadius: 14 },
  ctaTextPhone: { fontSize: 12, fontWeight: "600" },
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
  metricRule: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    marginHorizontal: 4,
    backgroundColor: Theme.borderLight,
  },
  targetInline: { flexDirection: "row", alignItems: "baseline", gap: 6, flexShrink: 1, minWidth: 0 },
  targetKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  targetPrice: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: Theme.textPrimaryDark,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  poolTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.primary,
  },
  poolTagText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: Theme.cardWhite,
  },
  route: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  routeConnector: {
    flex: 1,
    minWidth: 56,
    maxWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 4,
    marginTop: 10,
  },
  routeDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Theme.primaryText,
    backgroundColor: Theme.cardWhite,
  },
  routeDash: {
    flex: 1,
    height: 0,
    borderTopWidth: 1.5,
    borderTopColor: Theme.primaryText,
    borderStyle: "dashed",
    opacity: 0.45,
  },
  routeTruck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  routeCol: { flex: 1, minWidth: 0, gap: 1 },
  routeEnd: { alignItems: "flex-end" },
  alignEnd: { textAlign: "right", alignSelf: "stretch" },
  routeLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: Theme.textMuted,
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
  tagScroll: { flexGrow: 0, marginHorizontal: -10 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10 },
  vehicleChip: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
  },
  vehicle: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: Theme.primaryText,
  },
  badges: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  fitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
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
    gap: 4,
    paddingHorizontal: 14,
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: Theme.loadMainTabBg,
  },
  ctaText: { fontSize: 13, fontWeight: "700", color: Theme.primaryText },
});
