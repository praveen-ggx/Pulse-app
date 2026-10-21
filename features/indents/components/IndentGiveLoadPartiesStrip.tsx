/**
 * Give Load — integrated supplier row on the review hub left card.
 * Nudges owners to grow integrated network for more bids and better margin.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type { LoadCenterIntegratedParty } from "@/features/network/utils/loadCenterIntegratedParties.util";
import { LinearGradient } from "expo-linear-gradient";
import { Check, TrendingUp, UserPlus } from "lucide-react-native";
import { useMemo, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const FACE_SIZE = 32;
const RING_SIZE = 36;
const SLOT_SIZE = 40;
const TILE_WIDTH = 56;
const TILE_LABEL_LINE = 12;
const MAX_VISIBLE = 6;

export type IndentGiveLoadPartiesStripProps = {
  parties: LoadCenterIntegratedParty[];
  quotes: DirectQuoteRow[];
  marginPct: number | null;
  compact?: boolean;
  stacked?: boolean;
  onAddParties: () => void;
  onPartyPress?: (party: LoadCenterIntegratedParty) => void;
};

function resolveInsightCopy(
  partyCount: number,
  bidCount: number,
  marginPct: number | null,
): { headline: string; sub: string } {
  if (partyCount === 0) {
    return {
      headline: "Grow your supplier network",
      sub: "Integrated carriers see your loads and bid — more partners means sharper rates and higher margin.",
    };
  }
  if (bidCount === 0) {
    return {
      headline:
        partyCount < 3
          ? "Add more integrated suppliers"
          : `${partyCount} suppliers connected`,
      sub:
        partyCount < 3
          ? "Each new carrier widens competition — better bids protect your freight margin."
          : "Share this load to your network — connected partners can quote in one tap.",
    };
  }
  if (marginPct != null && marginPct < 15) {
    return {
      headline: "Invite similar carriers",
      sub: "More bidders create leverage — a lower supplier rate lifts your margin on this load.",
    };
  }
  return {
    headline: `${bidCount} bid${bidCount === 1 ? "" : "s"} in — keep momentum`,
    sub: "Add integrated partners you trust to widen reach and save on the next load too.",
  };
}

function PartyTile({
  label,
  onPress,
  accessibilityLabel,
  children,
}: {
  label: string;
  onPress?: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.tile, pressed && onPress && styles.tilePressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function AvatarTileSlot({
  ringStyle,
  badge,
  children,
}: {
  ringStyle: object | object[];
  badge?: "bid" | "integrated";
  children: ReactNode;
}) {
  return (
    <View style={styles.avatarSlot}>
      <View style={[styles.faceRing, ringStyle]}>{children}</View>
      {badge === "bid" ? (
        <View style={styles.bidBadge}>
          <Check size={8} color={Theme.textOnPrimary} strokeWidth={3} />
        </View>
      ) : badge === "integrated" ? (
        <View style={styles.integratedDot} />
      ) : null}
    </View>
  );
}

function PartyFace({
  party,
  hasBid,
  onPress,
}: {
  party: LoadCenterIntegratedParty;
  hasBid: boolean;
  onPress?: () => void;
}) {
  const shortName =
    party.displayName.split(/\s+/).filter(Boolean)[0] ?? party.displayName;

  return (
    <PartyTile
      label={shortName}
      onPress={onPress}
      accessibilityLabel={`${party.displayName}${hasBid ? ", bid received" : ", integrated supplier"}`}
    >
      <AvatarTileSlot
        ringStyle={hasBid ? styles.faceRingBid : styles.faceRingIdle}
        badge={hasBid ? "bid" : "integrated"}
      >
        <PartyAvatar
          name={party.displayName}
          entityType={party.entityType}
          organizationImageUrl={party.organizationImageUrl}
          organizationAvatarSeed={party.organizationAvatarSeed}
          avatarUrl={party.avatarUrl}
          avatarSeed={party.avatarSeed}
          isIntegrated
          size={FACE_SIZE}
          initialsColorSeed={party.linkedOrganizationId || party.id}
        />
      </AvatarTileSlot>
    </PartyTile>
  );
}

export function IndentGiveLoadPartiesStrip({
  parties,
  quotes,
  marginPct,
  compact,
  stacked,
  onAddParties,
  onPartyPress,
}: IndentGiveLoadPartiesStripProps) {
  const bidderOrgIds = useMemo(
    () =>
      new Set(
        quotes
          .map((q) => (q.bidder_organization_id ?? "").trim())
          .filter(Boolean),
      ),
    [quotes],
  );
  const visibleParties = parties.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, parties.length - MAX_VISIBLE);
  const bidCount = quotes.length;
  const insight = resolveInsightCopy(parties.length, bidCount, marginPct);

  if (stacked) {
    return (
      <View style={styles.stackedShell}>
        <View style={styles.stackedHeader}>
          <Text style={styles.stackedTitle}>Integrated suppliers</Text>
          <View style={styles.stackedCount}>
            <Text style={styles.stackedCountText}>{parties.length}</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stackedScroll}
          keyboardShouldPersistTaps="handled"
        >
          {visibleParties.map((party) => (
            <PartyFace
              key={party.id}
              party={party}
              hasBid={bidderOrgIds.has(party.linkedOrganizationId)}
              onPress={onPartyPress ? () => onPartyPress(party) : undefined}
            />
          ))}

          {overflow > 0 ? (
            <PartyTile
              label="More"
              onPress={onAddParties}
              accessibilityLabel={`${overflow} more suppliers`}
            >
              <AvatarTileSlot ringStyle={styles.faceRingOverflow}>
                <Text style={styles.overflowText}>+{overflow}</Text>
              </AvatarTileSlot>
            </PartyTile>
          ) : null}

          <PartyTile
            label="Add"
            onPress={onAddParties}
            accessibilityLabel="Add integrated suppliers"
          >
            <AvatarTileSlot ringStyle={styles.faceRingAdd}>
              <UserPlus size={15} color={Theme.primary} strokeWidth={2.2} />
            </AvatarTileSlot>
          </PartyTile>
        </ScrollView>

        <View style={styles.stackedInsight}>
          <View style={styles.stackedInsightIcon}>
            <TrendingUp size={12} color={Theme.loadAddButtonText} strokeWidth={2.4} />
          </View>
          <View style={styles.stackedInsightCopy}>
            <Text style={styles.stackedInsightHeadline} numberOfLines={1}>
              {insight.headline}
            </Text>
            <Text style={styles.stackedInsightSub} numberOfLines={2}>
              {insight.sub}
            </Text>
          </View>
          {marginPct != null ? (
            <View style={styles.stackedMargin}>
              <Text style={styles.stackedMarginLabel}>Margin</Text>
              <Text style={styles.stackedMarginValue}>{marginPct}%</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.shell, compact && styles.shellCompact]}>
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>Integrated suppliers</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{parties.length}</Text>
        </View>
      </View>

      <View style={[styles.supplierRow, compact && styles.supplierRowCompact]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {visibleParties.map((party) => (
            <PartyFace
              key={party.id}
              party={party}
              hasBid={bidderOrgIds.has(party.linkedOrganizationId)}
              onPress={onPartyPress ? () => onPartyPress(party) : undefined}
            />
          ))}

          {overflow > 0 ? (
            <PartyTile
              label="More"
              onPress={onAddParties}
              accessibilityLabel={`${overflow} more suppliers`}
            >
              <AvatarTileSlot ringStyle={styles.faceRingOverflow}>
                <Text style={styles.overflowText}>+{overflow}</Text>
              </AvatarTileSlot>
            </PartyTile>
          ) : null}

          <PartyTile
            label="Add"
            onPress={onAddParties}
            accessibilityLabel="Add integrated suppliers"
          >
            <AvatarTileSlot ringStyle={styles.faceRingAdd}>
              <UserPlus
                size={16}
                color={Theme.primary}
                strokeWidth={2.2}
              />
            </AvatarTileSlot>
          </PartyTile>
        </ScrollView>
      </View>

      <LinearGradient
        colors={["rgba(205,233,247,0.5)", "rgba(255,255,255,0.85)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.insightCard,
          compact && styles.insightCardCompact,
        ]}
      >
        <View style={styles.insightIcon}>
          <TrendingUp size={14} color={Theme.loadAddButtonText} strokeWidth={2.4} />
        </View>
        <View style={styles.insightCopy}>
          <Text style={styles.insightHeadline} numberOfLines={1}>
            {insight.headline}
          </Text>
          <Text style={styles.insightSub} numberOfLines={2}>
            {insight.sub}
          </Text>
        </View>
        {marginPct != null ? (
          <View style={styles.marginChip}>
            <Text style={styles.marginChipLabel}>Margin</Text>
            <Text style={styles.marginChipValue}>{marginPct}%</Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: 8,
    paddingTop: 2,
  },
  shellCompact: {
    gap: 6,
    paddingTop: 0,
  },
  stackedShell: {
    gap: 10,
    width: "100%",
  },
  stackedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stackedTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  stackedCount: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  stackedCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  stackedScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
  },
  stackedInsight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEEEEE",
  },
  stackedInsightIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stackedInsightCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  stackedInsightHeadline: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  stackedInsightSub: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  stackedMargin: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  stackedMarginLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  stackedMarginValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.positive,
    fontVariant: ["tabular-nums"],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.15,
    textTransform: "none",
    color: Theme.textMuted,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  countPill: {
    minWidth: 18,
    height: 16,
    paddingHorizontal: 5,
    borderRadius: 8,
    backgroundColor: Theme.surfaceLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  supplierRow: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  supplierRowCompact: {
    paddingVertical: 6,
    borderRadius: 10,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  tile: {
    width: TILE_WIDTH,
    alignItems: "center",
    gap: 5,
  },
  tilePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  avatarSlot: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  faceRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  faceRingBid: {
    borderColor: Theme.positive,
    backgroundColor: "rgba(21,128,61,0.08)",
  },
  faceRingIdle: {
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  faceRingAdd: {
    borderColor: Theme.borderLight,
    borderStyle: "dashed",
    backgroundColor: Theme.cardWhite,
  },
  faceRingOverflow: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  integratedDot: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: Theme.positive,
    borderWidth: 1.5,
    borderColor: Theme.cardWhite,
    zIndex: 2,
  },
  bidBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: Theme.positive,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    width: TILE_WIDTH,
    lineHeight: TILE_LABEL_LINE,
    minHeight: TILE_LABEL_LINE,
  },
  overflowText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnPrimary,
  },
  insightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabTrayBorder,
  },
  insightCardCompact: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  insightIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  insightCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  insightHeadline: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.05,
  },
  insightSub: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 12,
  },
  marginChip: {
    alignItems: "flex-end",
    flexShrink: 0,
    paddingLeft: 4,
    marginLeft: "auto",
  },
  marginChipLabel: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  marginChipValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.positive,
    fontVariant: ["tabular-nums"],
  },
});
