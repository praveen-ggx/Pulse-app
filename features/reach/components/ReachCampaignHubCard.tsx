/**
 * Pulse Boost campaign ticket — same visual language as Compliance cards.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { HUB_CARD_HEAD_AVATAR } from "@/components/hub/hubGridCardLayout";
import Theme from "@/constants/Theme";
import type { ReachCampaignRow, ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { getCampaignIdentity } from "@/features/reach/utils/campaignIdentity";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import { useReachTripMetricsQuery } from "@/lib/queries/useReachCampaignsQuery";
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

type HoverPressState = { pressed: boolean; hovered?: boolean };

const WEB_POINTER: ViewStyle | null =
  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

type ReachCampaignHubCardProps = {
  campaign: ReachCampaignRow;
  plan?: ReachPlanRow;
  tripCampaignIds?: string[];
  indentCount?: number;
  selected: boolean;
  onPress: () => void;
};

function asLabel(value: unknown): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s || "—";
}

function RoutePin({ variant }: { variant: "origin" | "dest" }) {
  return (
    <View
      style={[
        styles.routePin,
        variant === "origin" ? styles.routePinOrigin : styles.routePinDest,
      ]}
    />
  );
}

function RouteLeg({
  location,
  variant,
  align,
}: {
  location: string;
  variant: "origin" | "dest";
  align: "left" | "right";
}) {
  const { city, state } = splitHubRouteLocationDisplay(location);
  const end = align === "right";
  return (
    <View style={[styles.leg, end && styles.legEnd]}>
      <View style={[styles.legRow, end && styles.legRowEnd]}>
        {!end ? <RoutePin variant={variant} /> : null}
        <View style={[styles.legText, end && styles.legTextEnd]}>
          <Text style={[styles.legCity, end && styles.textEnd]} numberOfLines={1}>
            {asLabel(city)}
          </Text>
          <Text style={[styles.legState, end && styles.textEnd]} numberOfLines={1}>
            {state || "\u00a0"}
          </Text>
        </View>
        {end ? <RoutePin variant={variant} /> : null}
      </View>
    </View>
  );
}

export function ReachCampaignHubCard({
  campaign,
  plan,
  tripCampaignIds,
  indentCount = 1,
  selected,
  onPress,
}: ReachCampaignHubCardProps) {
  const id = getCampaignIdentity(campaign);
  const isActive = campaign.status === "active";
  const metricsQ = useReachTripMetricsQuery(
    tripCampaignIds && tripCampaignIds.length > 0 ? tripCampaignIds : [campaign.id],
  );
  const m = metricsQ.data;
  const origin = campaign.snapshot_origin ?? "";
  const dest = campaign.snapshot_destination ?? (id.isVehicle ? "Anywhere" : "");

  return (
    <Pressable
      onPress={onPress}
      style={(state: HoverPressState) => [
        styles.card,
        WEB_POINTER,
        (selected || state.pressed || state.hovered) && styles.cardHover,
        selected && styles.cardSelected,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${id.title}, ${id.route ?? "campaign"}`}
    >
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <PartyAvatar
            name={id.title}
            initialsColorSeed={campaign.id}
            entityType="client"
            size={HUB_CARD_HEAD_AVATAR}
          />
          <View style={styles.headText}>
            <Text style={styles.brand} numberOfLines={2}>
              {id.title.toUpperCase()}
            </Text>
            <Text style={styles.tripId} numberOfLines={1}>
              {id.tripId}
              {"  ·  "}
              {indentCount === 1 ? "1 indent" : `${indentCount} indents`}
            </Text>
          </View>
        </View>
        <View style={styles.headMeta}>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: isActive ? Theme.positiveMuted : Theme.surface },
            ]}
          >
            <Text
              style={[
                styles.statusPillText,
                { color: isActive ? Theme.success : Theme.textMuted },
              ]}
            >
              {isActive ? "LIVE" : campaign.status.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.planHint} numberOfLines={1}>
            {plan?.name ?? "Boost"}
          </Text>
        </View>
      </View>

      <View style={styles.route}>
        <RouteLeg location={origin} variant="origin" align="left" />
        <View style={styles.routeMid}>
          <Text style={styles.routeArrow}>→</Text>
          <Text style={styles.routeStatus} numberOfLines={1}>
            {id.truck ?? "Any"}
          </Text>
        </View>
        <RouteLeg location={dest || "Anywhere"} variant="dest" align="right" />
      </View>

      <View style={styles.metrics}>
        {(
          [
            ["Reach", m?.impressions],
            ["Views", m?.views],
            ["Bids", m?.bids],
            ["Credits", m?.creditsUsed],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={styles.metricTile}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>
              {metricsQ.isLoading || value == null ? "—" : value.toLocaleString()}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  cardHover: {
    borderColor: Theme.borderMedium,
  },
  cardSelected: {
    backgroundColor: Theme.complianceSelectedWash ?? Theme.primaryLight,
    borderColor: Theme.primary,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  headText: { flex: 1, minWidth: 0, gap: 1 },
  brand: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: Theme.actionBtnInk,
  },
  tripId: { fontSize: 10, fontWeight: "400", color: Theme.textMuted },
  headMeta: { alignItems: "flex-end", gap: 4, flexShrink: 0 },
  statusPill: {
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.2 },
  planHint: { fontSize: 10, fontWeight: "500", color: Theme.textMuted },
  route: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  routeMid: { width: 52, alignItems: "center", flexShrink: 0 },
  routeArrow: { fontSize: 14, color: Theme.textMuted, fontWeight: "500" },
  routeStatus: { fontSize: 9, fontWeight: "600", color: Theme.textMuted, textAlign: "center" },
  leg: { flex: 1, minWidth: 0 },
  legEnd: { alignItems: "flex-end" },
  legRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  legRowEnd: { flexDirection: "row-reverse" },
  legText: { flex: 1, minWidth: 0 },
  legTextEnd: { alignItems: "flex-end" },
  textEnd: { textAlign: "right" },
  legCity: { fontSize: 13, fontWeight: "600", color: Theme.actionBtnInk },
  legState: { fontSize: 10, fontWeight: "400", color: Theme.textMuted },
  routePin: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  routePinOrigin: { backgroundColor: Theme.positive },
  routePinDest: { backgroundColor: Theme.primary },
  metrics: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingTop: 8,
    gap: 6,
  },
  metricTile: { flex: 1, minWidth: 0, gap: 1 },
  metricLabel: { fontSize: 10, fontWeight: "400", color: Theme.textMuted },
  metricValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.actionBtnInk,
    fontVariant: ["tabular-nums"],
  },
});
