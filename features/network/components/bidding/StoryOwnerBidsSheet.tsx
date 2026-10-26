/**
 * Owner story footer — live bids from Pulse story vs Load center (network load page).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  StoryFlowSheetPortal,
  useStoryPhoneFrameMetrics,
} from "@/features/network/components/StoryMobilePopupShell";
import type { StoryOwnerBidRow } from "@/features/network/utils/bidding/storyOwnerBids.util";
import {
  formatStoryBidSubmittedAt,
  storyOwnerBidsLabel,
} from "@/features/network/utils/bidding/storyOwnerBids.util";
import { formatINR } from "@/lib/format";
import Feather from "@expo/vector-icons/Feather";
import { Clock3, Gavel, Radio, Truck, X, Zap } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = Theme.loadAddButtonText;
const MUTED = Theme.loadStatusTabTextMuted;
const SKY = Theme.loadAddButtonBg;

type Filter = "all" | "pulse_story" | "load_center" | "fleet_owner";

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusTone(status: string): { bg: string; text: string; label: string } {
  if (status === "accepted") {
    return {
      bg: Theme.positiveMuted,
      text: Theme.positive,
      label: "Awarded",
    };
  }
  if (status === "rejected" || status === "withdrawn") {
    return {
      bg: Theme.surfaceGray,
      text: Theme.textMuted,
      label: status === "withdrawn" ? "Withdrawn" : "Rejected",
    };
  }
  // A6.4: not a business decision, not a driver withdrawal -- the driver was
  // awarded a different load and this bid became moot. Must not fall
  // through to the "Pending" default below.
  if (status === "superseded") {
    return {
      bg: Theme.surfaceGray,
      text: Theme.textMuted,
      label: "Superseded",
    };
  }
  return {
    bg: SKY,
    text: INK,
    label: "Pending",
  };
}

function ChannelIcon({ channel }: { channel: StoryOwnerBidRow["channel"] }) {
  if (channel === "pulse_story") {
    return <Zap size={11} color={INK} strokeWidth={2.25} />;
  }
  if (channel === "fleet_owner") {
    return <Gavel size={11} color={INK} strokeWidth={2.25} />;
  }
  return <Truck size={11} color={INK} strokeWidth={2.25} />;
}

function LiveDot() {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveDotRing, { opacity: pulse, transform: [{ scale: pulse }] }]} />
      <View style={styles.liveDotCore} />
    </View>
  );
}

function BidRowCard({
  row,
  latest,
}: {
  row: StoryOwnerBidRow;
  latest?: boolean;
}) {
  const tone = statusTone(row.status);
  const isFleetOwnerBid = row.channel === "fleet_owner";
  const submittedAt = formatStoryBidSubmittedAt(row.createdAt);
  const pending = tone.label === "Pending";

  return (
    <View style={[styles.bidCard, latest && styles.bidCardLatest]}>
      <PartyAvatar
        name={row.bidderName}
        avatarUrl={row.bidderAvatarUrl}
        avatarSeed={row.bidderAvatarSeed}
        initialsColorSeed={row.bidderOrgId}
        entityType={isFleetOwnerBid ? "driver" : "supplier"}
        size={40}
        shape="circle"
      />
      <View style={styles.bidMain}>
        <View style={styles.bidTopRow}>
          <Text style={styles.bidderName} numberOfLines={1}>
            {row.bidderName}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
            {pending ? <LiveDot /> : null}
            <Text style={[styles.statusText, { color: tone.text }]}>{tone.label}</Text>
          </View>
        </View>
        <Text style={styles.bidAmount}>{formatINR(row.amount)}</Text>
        <View style={styles.bidMetaRow}>
          <View style={styles.channelPill}>
            <ChannelIcon channel={row.channel} />
            <Text style={styles.channelText}>{row.channelLabel}</Text>
          </View>
          {latest ? (
            <View style={styles.latestPill}>
              <Radio size={10} color={Theme.positive} strokeWidth={2.4} />
              <Text style={styles.latestTag}>Latest</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bidTimeRow}>
          <Clock3 size={10} color={MUTED} strokeWidth={2.2} />
          <Text style={styles.bidTime} numberOfLines={1}>
            {submittedAt || timeAgo(row.createdAt)}
          </Text>
          <Text style={styles.bidIdText}>{row.identifier}</Text>
        </View>
        {row.note?.trim() ? (
          <Text style={styles.bidNote} numberOfLines={2}>
            {row.note.trim()}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export type StoryOwnerBidsSheetProps = {
  visible: boolean;
  bids: StoryOwnerBidRow[];
  loading: boolean;
  indentId: string | null;
  indentLabel?: string | null;
  latestBidKey?: string | null;
  onClose: () => void;
  onOpenReviewHub?: () => void;
};

export function StoryOwnerBidsSheet({
  visible,
  bids,
  loading,
  indentId,
  indentLabel,
  latestBidKey,
  onClose,
  onOpenReviewHub,
}: StoryOwnerBidsSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { phonePopup, sheetBottomPad } = useStoryPhoneFrameMetrics();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return bids;
    return bids.filter((b) => b.channel === filter);
  }, [bids, filter]);

  const storyCount = bids.filter((b) => b.channel === "pulse_story").length;
  const loadCount = bids.filter((b) => b.channel === "load_center").length;
  const fleetCount = bids.filter((b) => b.channel === "fleet_owner").length;
  const pendingCount = bids.filter((b) => statusTone(b.status).label === "Pending").length;
  const highest = bids.reduce<number>((max, row) => Math.max(max, row.amount || 0), 0);
  const listMaxHeight = Math.min(Math.max(filtered.length, 1) * 118 + 10, windowHeight * 0.46);
  const bottomPad = sheetBottomPad ?? insets.bottom + 14;

  return (
    <StoryFlowSheetPortal
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Close bids"
    >
      <View style={[styles.sheet, phonePopup && styles.sheetPhone, { paddingBottom: bottomPad }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeading}>
              <View style={styles.headerIcon}>
                <Gavel size={16} color={INK} strokeWidth={2.25} />
              </View>
              <View style={styles.headerCopy}>
                <View style={styles.liveRow}>
                  {pendingCount > 0 ? <LiveDot /> : null}
                  <Text style={styles.liveKicker}>
                    {pendingCount > 0 ? "Live auction" : "Bid desk"}
                  </Text>
                </View>
                <Text style={styles.title}>{storyOwnerBidsLabel(bids.length, loading)}</Text>
                {indentLabel ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {indentLabel}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={16} color={INK} strokeWidth={2.25} />
            </Pressable>
          </View>

          {!loading && bids.length > 0 ? (
            <View style={styles.ticker}>
              <View style={styles.tickerCell}>
                <Text style={styles.tickerLabel}>Highest</Text>
                <Text style={styles.tickerValue}>{formatINR(highest)}</Text>
              </View>
              <View style={styles.tickerRule} />
              <View style={styles.tickerCell}>
                <Text style={styles.tickerLabel}>Pending</Text>
                <Text style={styles.tickerValue}>{pendingCount}</Text>
              </View>
              <View style={styles.tickerRule} />
              <View style={styles.tickerCell}>
                <Text style={styles.tickerLabel}>Story</Text>
                <Text style={styles.tickerValue}>{storyCount}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.filterRow}>
            {(
              [
                { id: "all" as const, label: "All", count: bids.length, Icon: Radio },
                { id: "pulse_story" as const, label: "Story", count: storyCount, Icon: Zap },
                { id: "load_center" as const, label: "Load", count: loadCount, Icon: Truck },
                { id: "fleet_owner" as const, label: "Fleet", count: fleetCount, Icon: Gavel },
              ] as const
            ).map((chip) => {
              const active = filter === chip.id;
              const Icon = chip.Icon;
              return (
                <Pressable
                  key={chip.id}
                  onPress={() => setFilter(chip.id)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Icon size={11} color={active ? INK : MUTED} strokeWidth={2.3} />
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {chip.label} {chip.count}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={INK} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>Waiting for partners</Text>
              <Text style={styles.emptyBody}>
                Bids from your Pulse story show as STORY·… IDs. Quotes from the Load
                center show as LOAD·… IDs. Fleet Owner / driver direct bids show as FO·…
                or DRV·… with the owner name.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.map((row) => (
                <BidRowCard
                  key={row.key}
                  row={row}
                  latest={latestBidKey != null && row.key === latestBidKey}
                />
              ))}
            </ScrollView>
          )}

          {indentId && onOpenReviewHub ? (
            <Pressable
              style={({ pressed }) => [styles.reviewBtn, pressed && styles.reviewBtnPressed]}
              onPress={() => {
                onClose();
                onOpenReviewHub();
              }}
              accessibilityRole="button"
              accessibilityLabel="Open indent review hub"
            >
              <Text style={styles.reviewBtnText}>Open review hub</Text>
              <Feather name="arrow-up-right" size={12} color={Theme.buttonPrimaryText} />
            </Pressable>
          ) : null}
      </View>
    </StoryFlowSheetPortal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    maxHeight: "88%",
    ...Platform.select({
      web: { boxShadow: "0 -8px 32px rgba(15,23,42,0.12)" } as object,
      default: {},
    }),
  },
  sheetPhone: {
    width: "100%",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  headerLeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SKY,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.positive,
  },
  liveDotWrap: {
    width: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  liveDotRing: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.positiveMuted,
  },
  liveDotCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.positive,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 0.15,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceLight,
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  ticker: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  tickerCell: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tickerLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: MUTED,
  },
  tickerValue: {
    fontSize: 16,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  tickerRule: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: Theme.borderMedium,
    marginHorizontal: 8,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.screenBackground,
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  filterChipActive: {
    backgroundColor: SKY,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.1,
  },
  filterChipTextActive: {
    color: INK,
  },
  loadingWrap: {
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyWrap: {
    paddingVertical: 20,
    paddingHorizontal: 10,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: INK,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    lineHeight: 17,
    textAlign: "center",
  },
  listContent: {
    gap: 8,
    paddingBottom: 4,
  },
  bidCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      web: { boxShadow: "0 4px 16px rgba(77, 54, 54, 0.06)" } as object,
      default: {},
    }),
  },
  bidCardLatest: {
    borderColor: Theme.positive,
    backgroundColor: Theme.screenBackground,
  },
  bidMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  bidTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  bidderName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  bidAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  bidMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  channelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderWidth: 1,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  channelText: {
    fontSize: 10,
    fontWeight: "800",
    color: INK,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  latestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bidIdText: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 0.2,
    fontVariant: ["tabular-nums"],
  },
  bidTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  bidTime: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  latestTag: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.positive,
  },
  bidNote: {
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    lineHeight: 16,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  reviewBtn: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  reviewBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  reviewBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    letterSpacing: -0.2,
  },
});
