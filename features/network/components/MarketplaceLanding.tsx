import { LedgerEntryReceiptCard } from "@/components/ledger/LedgerEntryReceiptCard";
import { LEDGER_RECEIPT } from "@/components/ledger/ledgerEntryReceiptPalette";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import type { MyOrgMarketBidRow } from "@/features/network/services/findLoadsForOrg.service";
import { marketplaceFeeGateSatisfied } from "@/features/network/services/marketBids.service";
import { bidderLaneKey, groupBidsByLane } from "@/features/network/utils/marketplaceLaneSearchMemory.util";
import type { MarketplaceSearchLane } from "@/features/network/utils/marketplaceSearch.util";
import { marketplaceWalletFigures } from "@/features/network/utils/marketplaceWallet.util";
import type { PoolLane } from "@/features/network/utils/pooledOpportunity.util";
import { titleCaseWord } from "@/features/network/components/MarketplaceLoadCardChrome";
import {
  ArrowLeftRight,
  ArrowRight,
  ClipboardList,
  Search,
  Truck,
  X,
} from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

const TILES = [
  { id: "bids", title: "My Bids", body: "Active and past", icon: ClipboardList },
  { id: "transactions", title: "Transactions", body: "Rates you sent", icon: ArrowLeftRight },
] as const;

const HOT_LANE_SLIDE_MS = 40_000;

function laneRateLabel(bids: readonly MyOrgMarketBidRow[]): string {
  const amounts = bids.map((bid) => Number(bid.amount)).filter((amount) => Number.isFinite(amount));
  if (amounts.length === 0) return formatINR(0);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  return low === high ? formatINR(low) : `${formatINR(low)} – ${formatINR(high)}`;
}

function openLoadCount(
  bids: readonly MyOrgMarketBidRow[],
  lanes: readonly MarketplaceSearchLane[],
): number | null {
  if (lanes.length === 0) return null;
  const key = bidderLaneKey(bids[0]?.pickup_area, bids[0]?.drop_location);
  return lanes
    .filter((lane) => bidderLaneKey(lane.pickup_area, lane.drop_location) === key)
    .reduce((sum, lane) => sum + (Number(lane.load_count) || 0), 0);
}

function BidLaneRow({
  bids,
  lanes,
  onPress,
}: {
  bids: readonly MyOrgMarketBidRow[];
  lanes: readonly MarketplaceSearchLane[];
  onPress: () => void;
}) {
  const first = bids[0];
  const loads = openLoadCount(bids, lanes);
  const pending = bids.every((bid) => bid.status === "pending");
  const awarded = bids.every((bid) => bid.status === "accepted");
  const status =
    bids.length > 1
      ? `${bids.length} bids${loads != null ? ` · ${loads} load${loads === 1 ? "" : "s"}` : ""}`
      : awarded
        ? "Awarded"
        : pending
          ? loads != null
            ? `${loads} pooled`
            : "Pending"
          : "Closed";
  return (
    <Pressable
      onPress={onPress}
      style={styles.previewRow}
      accessibilityRole="button"
      accessibilityLabel={`${(first.pickup_area ?? "Pickup").trim()} to ${(first.drop_location ?? "Drop").trim()}, ${status}`}
    >
      <View style={styles.previewCopy}>
        <Text style={styles.previewRoute} numberOfLines={1}>
          {(first.pickup_area ?? "Pickup").trim()}
        </Text>
        <Text style={styles.previewDrop} numberOfLines={1}>
          to {(first.drop_location ?? "Drop").trim()}
        </Text>
      </View>
      <View style={styles.previewMeta}>
        <Text style={styles.previewAmount} numberOfLines={1}>{laneRateLabel(bids)}</Text>
        <Text
          style={[
            styles.previewStatus,
            awarded && styles.previewStatusWon,
            pending && styles.previewStatusLive,
          ]}
          numberOfLines={1}
        >
          {status}
        </Text>
      </View>
    </Pressable>
  );
}

function MetricTile({
  tile,
  fact,
  onPress,
  fill,
}: {
  tile: (typeof TILES)[number];
  fact: { value: string; body: string; stats?: readonly { label: string; value: string }[] };
  onPress: () => void;
  fill: boolean;
}) {
  const Icon = tile.icon;
  const money = tile.id === "transactions";
  const spoken = fact.stats?.map((stat) => `${stat.label} ${stat.value}`).join(", ");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        money && styles.tileMoney,
        fill ? styles.tileFill : styles.tileScroll,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={spoken ? `${tile.title}, ${spoken}` : `${tile.title}, ${fact.value}, ${fact.body}`}
    >
      <View style={styles.tileTop}>
        <View style={[styles.tileIcon, money && styles.tileIconMoney]}>
          <Icon size={14} color={money ? Theme.loadMainTabBg : Theme.primaryText} strokeWidth={2.2} />
        </View>
        <Text style={styles.tileTitle} numberOfLines={1}>{tile.title}</Text>
      </View>
      {fact.stats ? (
        <View style={styles.tileStats}>
          {fact.stats.map((stat) => (
            <View key={stat.label} style={styles.tileStat}>
              <View style={styles.tileStatCell}>
                <Text style={styles.tileStatValue} numberOfLines={1}>{stat.value}</Text>
                <Text style={styles.tileStatLabel} numberOfLines={1}>{stat.label}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.tileMoneyBody}>
          <Text style={styles.tileValue} numberOfLines={1}>{fact.value}</Text>
          <View style={styles.tileChip}>
            <Text style={styles.tileChipText} numberOfLines={1}>{fact.body}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function AwardVehicleAlert({
  bids,
  wide,
  onAssign,
}: {
  bids: readonly MyOrgMarketBidRow[];
  wide: boolean;
  onAssign: (bid: MyOrgMarketBidRow) => void;
}) {
  const [index, setIndex] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setIndex(0);
  }, [bids]);
  useEffect(() => {
    if (bids.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % bids.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [bids.length]);
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!active || reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      active = false;
      loop?.stop();
    };
  }, [pulse]);
  const bid = bids[index % bids.length];
  if (!bid) return null;
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  return (
    <Pressable
      onPress={() => onAssign(bid)}
      style={({ pressed }) => [styles.laneRow, wide && styles.laneRowWide, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Bid awarded, assign a vehicle, ${(bid.pickup_area ?? "Pickup").trim()} to ${(bid.drop_location ?? "Drop").trim()}`}
    >
      <View style={[styles.laneSlide, styles.awardCard, !wide && styles.laneSlideScroll]}>
        <View style={styles.tileTop}>
          <View style={styles.awardKicker}>
            <Animated.View style={[styles.awardDot, { opacity: glow }]} />
            <Text style={styles.tileTitle}>Bid awarded</Text>
          </View>
          <Text style={styles.laneSlideMeta}>{bids.length === 1 ? "Assign now" : `${bids.length} to assign`}</Text>
        </View>
        <Text style={styles.laneSlideRoute} numberOfLines={1}>
          {(bid.pickup_area ?? "Pickup").trim()}
        </Text>
        <View style={styles.laneSlideDrop}>
          <ArrowRight size={12} color={Theme.textMuted} strokeWidth={2.2} />
          <Text style={styles.laneSlideDropText} numberOfLines={1}>
            {(bid.drop_location ?? "Drop").trim()}
          </Text>
        </View>
        <View style={styles.awardAction}>
          <Text style={styles.awardActionText}>Assign vehicle</Text>
          <ArrowRight size={14} color={Theme.primaryText} strokeWidth={2.2} />
        </View>
      </View>
    </Pressable>
  );
}

function HotLaneSlide({
  lanes,
  wide,
  onOpen,
  onWarm,
}: {
  lanes: readonly PoolLane[];
  wide: boolean;
  onOpen: (lane: PoolLane) => void;
  onWarm?: (lane: PoolLane) => void;
}) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    setIndex(0);
  }, [lanes]);
  const visibleCount = wide ? 2 : 1;
  useEffect(() => {
    if (lanes.length <= visibleCount) return;
    const handle: { timer: ReturnType<typeof setInterval> | null } = { timer: null };
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(() => {
      if (!active) return;
      handle.timer = setInterval(() => {
        setIndex((current) => (current + 1) % lanes.length);
      }, HOT_LANE_SLIDE_MS);
    });
    return () => {
      active = false;
      if (handle.timer) clearInterval(handle.timer);
    };
  }, [lanes.length, visibleCount]);
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [fade, index]);
  if (lanes.length === 0) return null;
  const shown = Array.from({ length: Math.min(visibleCount, lanes.length) }, (_, offset) => {
    return lanes[(index + offset) % lanes.length];
  });
  return (
    <Animated.View style={[styles.laneRow, wide && styles.laneRowWide, { opacity: fade }]}>
      {shown.map((lane) => {
        const count = Number(lane.load_count) || 0;
        return (
          <Pressable
            key={lane.poolId}
            onPress={() => onOpen(lane)}
            onPressIn={() => onWarm?.(lane)}
            onHoverIn={() => onWarm?.(lane)}
            style={({ pressed }) => [styles.laneSlide, !wide && styles.laneSlideScroll, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Hot lane, ${lane.pickup_area} to ${lane.drop_location}, ${count} pooled loads`}
          >
            <View style={styles.tileTop}>
              <Text style={styles.tileTitle}>Hot lane</Text>
              <Text style={styles.laneSlideMeta}>{count} pooled</Text>
            </View>
            <Text style={styles.laneSlideRoute} numberOfLines={1}>
              {(lane.pickup_area ?? "Pickup").trim()}
            </Text>
            <View style={styles.laneSlideDrop}>
              <ArrowRight size={12} color={Theme.textMuted} strokeWidth={2.2} />
              <Text style={styles.laneSlideDropText} numberOfLines={1}>
                {(lane.drop_location ?? "Drop").trim()}
              </Text>
            </View>
            <Text style={styles.tileBody} numberOfLines={1}>
              {titleCaseWord(lane.vehicle_type) || "Any vehicle"}
            </Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

function HeroLineArt({ wide }: { wide: boolean }) {
  const travel = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!active || reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(travel, { toValue: 1, duration: 4800, useNativeDriver: true }),
          Animated.timing(travel, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      active = false;
      loop?.stop();
    };
  }, [travel]);
  const shift = travel.interpolate({ inputRange: [0, 1], outputRange: [0, wide ? 22 : 12] });
  return (
    <View style={styles.lineArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.lineCrate}>
        <View style={styles.lineCrateLid} />
      </View>
      <View style={styles.lineLane}>
        <View style={styles.lineGround} />
        <Animated.View style={[styles.lineTruck, { transform: [{ translateX: shift }] }]}>
          <Truck size={wide ? 28 : 22} color={Theme.primaryText} strokeWidth={1.4} />
        </Animated.View>
      </View>
      <View style={styles.lineBoard}>
        <View style={styles.lineBoardDot} />
        <View style={styles.lineBoardRow} />
        <View style={styles.lineBoardRow} />
        <View style={[styles.lineBoardRow, styles.lineBoardRowShort]} />
      </View>
    </View>
  );
}

function LiveMark() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!active || reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      active = false;
      loop?.stop();
    };
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.markRing, { opacity, transform: [{ scale }] }]} />
      <View style={styles.markCore}>
        <Truck size={20} color={Theme.loadMainTabBg} strokeWidth={2.2} />
      </View>
    </View>
  );
}

export function MarketplaceLanding({
  orgName,
  bids,
  transactionBids = [],
  transactionsReady = true,
  loadCount,
  laneCount,
  showing,
  hiddenCount: _hiddenCount,
  isDesktop,
  part = "all",
  onOpenBids,
  onOpenWallet,
  onOpenTransactions,
  onSearchLoads,
  filters,
  featuredLanes = [],
  onOpenFeaturedLane,
  onWarmFeaturedLane,
  lanes = [],
  assignBids = [],
  onAssignVehicle,
}: {
  orgName: string;
  bids: readonly MyOrgMarketBidRow[];
  /** Won bids whose indent already has a trip. */
  transactionBids?: readonly MyOrgMarketBidRow[];
  transactionsReady?: boolean;
  loadCount: number;
  laneCount: number;
  showing: number;
  hiddenCount: number;
  isDesktop: boolean;
  /** Desktop splits the home: main column vs the wallet sidebar. */
  part?: "all" | "main" | "side";
  onOpenLoads: () => void;
  onOpenBids: (focus?: "bids" | "won") => void;
  onOpenWallet: () => void;
  onOpenTransactions: () => void;
  onShowAllLanes: () => void;
  onSearchLoads?: () => void;
  filters?: ReactNode;
  featuredLanes?: readonly PoolLane[];
  onOpenFeaturedLane?: (lane: PoolLane) => void;
  onWarmFeaturedLane?: (lane: PoolLane) => void;
  lanes?: readonly MarketplaceSearchLane[];
  /** Awarded bids that still need a vehicle. */
  assignBids?: readonly MyOrgMarketBidRow[];
  onAssignVehicle?: (bid: MyOrgMarketBidRow) => void;
}) {
  const figures = marketplaceWalletFigures(bids);
  const ratesSent = bids.reduce((sum, bid) => {
    const amount = Number(bid.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const transactionValue = transactionBids.reduce((sum, bid) => {
    const amount = Number(bid.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const tileFacts = {
    bids: {
      value: String(bids.length),
      body: `${figures.awarded} won`,
      stats: [
        { label: "Bids", value: String(bids.length) },
        { label: "Won", value: String(figures.awarded) },
        { label: "Transactions", value: transactionsReady ? String(transactionBids.length) : "—" },
        { label: "Value", value: transactionsReady ? formatINR(transactionValue) : "—" },
      ],
    },
    transactions: { value: formatINR(ratesSent), body: `${figures.awarded} awarded` },
  };
  const activeBids = bids.filter((bid) => bid.status === "pending");
  const wonBids = bids.filter((bid) => bid.status === "accepted");
  const [bidFilter, setBidFilter] = useState<"bids" | "won">("bids");
  const [sidePanel, setSidePanel] = useState<"bids" | "transactions">("bids");
  const [promo, setPromo] = useState(true);
  const [openBid, setOpenBid] = useState<MyOrgMarketBidRow | null>(null);
  const { width } = useWindowDimensions();
  const preview = groupBidsByLane(activeBids).slice(0, 3);
  const actions = {
    bids: onOpenBids,
    transactions: onOpenTransactions,
  };

  const walletCard = (
    <View style={styles.wallet}>
      <Text style={styles.walletKicker}>Marketplace wallet</Text>
      <Text style={styles.walletValue}>{figures.due > 0 ? formatINR(figures.due) : "Clear"}</Text>
      <Text style={styles.walletHint}>{figures.due > 0 ? "Fees due on awarded loads" : "Nothing due"}</Text>
      <View style={styles.walletStats}>
        <View style={styles.walletStat}>
          <Text style={styles.walletStatValue}>{figures.awarded}</Text>
          <Text style={styles.walletStatLabel}>Awarded</Text>
        </View>
        <View style={styles.walletStatRule} />
        <View style={styles.walletStat}>
          <Text style={styles.walletStatValue}>{figures.transactions}</Text>
          <Text style={styles.walletStatLabel}>Rates sent</Text>
        </View>
      </View>
      <View style={styles.walletActions}>
        <Pressable onPress={onOpenTransactions} style={styles.walletPill} accessibilityRole="button" accessibilityLabel="Open transactions">
          <Text style={styles.walletLink}>Transactions</Text>
        </Pressable>
        <Pressable onPress={onOpenWallet} style={styles.walletPill} accessibilityRole="button" accessibilityLabel="Open wallet">
          <Text style={styles.walletLink}>Wallet</Text>
        </Pressable>
      </View>
    </View>
  );

  const bidPreview = preview.length === 0 ? null : (
    <View style={styles.previewCard}>
      <View style={styles.sectionRow}>
        <Text style={styles.previewTitle}>My bids</Text>
        <Pressable onPress={onOpenBids} accessibilityRole="button" accessibilityLabel="See all bids">
          <Text style={styles.link}>See all</Text>
        </Pressable>
      </View>
      {preview.map((group) => (
        <BidLaneRow
          key={group.key}
          bids={group.bids}
          lanes={lanes}
          onPress={() => (group.bids.length > 1 ? onOpenBids() : setOpenBid(group.bids[0]))}
        />
      ))}
    </View>
  );

  const bidReceipt = (
    <BidReceiptModal
      bid={openBid}
      desktop={Platform.OS === "web" && width >= 768}
      onClose={() => setOpenBid(null)}
      onOpenBids={() => {
        setOpenBid(null);
        onOpenBids();
      }}
    />
  );

  if (part === "side") {
    return (
      <View style={styles.side}>
        {walletCard}
        <View style={styles.sideCard}>
          <View style={styles.sectionRow}>
            <View style={styles.panelTabs}>
              <Pressable
                onPress={() => setSidePanel("bids")}
                accessibilityRole="tab"
                accessibilityState={{ selected: sidePanel === "bids" }}
              >
                <Text style={[styles.previewTitle, sidePanel !== "bids" && styles.panelTitleIdle]}>My bids</Text>
              </Pressable>
              <Pressable
                onPress={() => setSidePanel("transactions")}
                accessibilityRole="tab"
                accessibilityState={{ selected: sidePanel === "transactions" }}
              >
                <Text style={[styles.previewTitle, sidePanel !== "transactions" && styles.panelTitleIdle]}>Transactions</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={sidePanel === "bids" ? () => onOpenBids(bidFilter) : onOpenTransactions}
              accessibilityRole="button"
              accessibilityLabel={sidePanel === "bids" ? "See all bids" : "See all transactions"}
            >
              <Text style={styles.link}>See all</Text>
            </Pressable>
          </View>
          {sidePanel === "bids" ? (
            <View style={styles.sideTabs}>
              {([
                { id: "bids" as const, label: "Bids", count: String(activeBids.length) },
                { id: "won" as const, label: "Won", count: String(figures.awarded) },
              ]).map((item) => {
                const selected = item.id === bidFilter;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setBidFilter(item.id)}
                    style={[styles.sideTab, selected && styles.sideTabOn]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.sideTabCount, selected && styles.sideTabCountOn]}>{item.count}</Text>
                    <Text style={[styles.sideTabLabel, selected && styles.sideTabLabelOn]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={[
              styles.previewScrollContent,
              sidePanel === "transactions" && transactionBids.length === 0 && styles.previewScrollEmpty,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {sidePanel === "bids"
              ? (bidFilter === "won" ? wonBids : activeBids).length > 0
                ? groupBidsByLane(bidFilter === "won" ? wonBids : activeBids).map((group) => (
                    <BidLaneRow
                      key={group.key}
                      bids={group.bids}
                      lanes={lanes}
                      onPress={() => (group.bids.length > 1 ? onOpenBids(bidFilter) : setOpenBid(group.bids[0]))}
                    />
                  ))
                : <Text style={styles.previewEmpty}>{bidFilter === "won" ? "No bids won yet" : "No active bids"}</Text>
              : transactionBids.length > 0
                ? transactionBids.map((bid) => {
                    const movement = sidebarMovement(bid);
                    const kind = movement.kind === "Fee due" ? "Fee due" : "Trip";
                    return (
                      <Pressable
                        key={bid.id}
                        onPress={() => setOpenBid(bid)}
                        style={styles.previewRow}
                        accessibilityRole="button"
                        accessibilityLabel={`${kind}, ${movement.amount}`}
                      >
                        <View style={styles.previewCopy}>
                          <Text style={styles.previewRoute} numberOfLines={1}>
                            {(bid.pickup_area ?? "Pickup").trim()}
                          </Text>
                          <Text style={styles.previewDrop} numberOfLines={1}>
                            to {(bid.drop_location ?? "Drop").trim()}
                          </Text>
                        </View>
                        <View style={styles.previewMeta}>
                          <Text style={styles.previewAmount}>{movement.amount}</Text>
                          <Text style={styles.previewStatus}>
                            {kind} · {receiptDate(bid.accepted_at ?? bid.created_at)}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })
                : transactionsReady ? (
                  <View style={styles.txEmpty}>
                    <View style={styles.txSheet}>
                      <View style={styles.txSheetIcon}>
                        <Truck size={18} color={Theme.primaryText} strokeWidth={1.6} />
                      </View>
                      <View style={styles.txLine} />
                      <View style={[styles.txLine, styles.txLineShort]} />
                      <View style={styles.txLine} />
                    </View>
                    <Text style={styles.txEmptyTitle}>No trips yet</Text>
                    <Text style={styles.txEmptyBody}>
                      Awarded loads show here after they are allocated to a trip.
                    </Text>
                  </View>
                ) : null}
          </ScrollView>
        </View>
        {bidReceipt}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.heroRow, isDesktop && styles.heroRowDesktop]}>
        <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
          <View style={styles.heroIdentity}>
            <Text style={styles.heroKicker} numberOfLines={1}>
              {orgName.trim() ? `LIVE MARKETPLACE · ${orgName.trim()}` : "LIVE MARKETPLACE"}
            </Text>
            <View style={styles.heroNameRow}>
              <Text style={[styles.heroName, isDesktop && styles.heroNameDesktop]}>Marketplace Loads</Text>
              <LiveMark />
            </View>
            <Text style={styles.heroTitle}>Find, bid and move more loads</Text>
            <Text style={styles.heroBody}>Verified loads. Competitive bids. Secure payments.</Text>
          </View>
          <View style={[styles.heroArt, isDesktop && styles.heroArtDesktop]} pointerEvents="none">
            <HeroLineArt wide={isDesktop} />
          </View>
        </View>
        {part === "main" ? null : isDesktop ? walletCard : null}
      </View>

      {isDesktop ? (
        <View style={styles.tilesDesktop}>
          {assignBids.length > 0 && onAssignVehicle ? (
            <AwardVehicleAlert bids={assignBids} wide onAssign={onAssignVehicle} />
          ) : featuredLanes.length > 0 && onOpenFeaturedLane ? (
            <HotLaneSlide lanes={featuredLanes} wide onOpen={onOpenFeaturedLane} onWarm={onWarmFeaturedLane} />
          ) : null}
          {TILES.map((tile) => (
            <MetricTile
              key={tile.id}
              tile={tile}
              fact={tileFacts[tile.id]}
              onPress={actions[tile.id]}
              fill
            />
          ))}
        </View>
      ) : (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
        {assignBids.length > 0 && onAssignVehicle ? (
          <AwardVehicleAlert bids={assignBids} wide={false} onAssign={onAssignVehicle} />
        ) : featuredLanes.length > 0 && onOpenFeaturedLane ? (
          <HotLaneSlide lanes={featuredLanes} wide={false} onOpen={onOpenFeaturedLane} onWarm={onWarmFeaturedLane} />
        ) : null}
        {TILES.map((tile) => (
          <MetricTile
            key={tile.id}
            tile={tile}
            fact={tileFacts[tile.id]}
            onPress={actions[tile.id]}
            fill={false}
          />
        ))}
      </ScrollView>
      )}

      {part === "main" || isDesktop ? null : walletCard}

      {promo ? (
        <View style={styles.promo}>
          <View style={styles.promoCopy}>
            <Text style={styles.promoTitle}>Verified lanes from the open market</Text>
            <Text style={styles.promoBody}>
              {laneCount} pooled lanes · {loadCount} loads. A fee is due only after a lane is awarded.
            </Text>
          </View>
          <Pressable onPress={() => setPromo(false)} accessibilityRole="button" accessibilityLabel="Dismiss marketplace note" hitSlop={8}>
            <X size={16} color={Theme.textSecondary} strokeWidth={2.2} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.loadBoard}>
        <View style={styles.loadBoardHead}>
          <Text style={styles.section}>Available loads ({loadCount})</Text>
          <View style={styles.loadBoardMeta}>
            <Pressable
              onPress={onSearchLoads}
              style={styles.searchChip}
              accessibilityRole="button"
              accessibilityLabel="Search a marketplace load"
            >
              <Search size={14} color={Theme.buttonPrimaryText} strokeWidth={2.4} />
              <Text style={styles.searchChipText}>Search a load</Text>
            </Pressable>
            <Text style={styles.sectionMeta}>{showing} showing</Text>
          </View>
        </View>
        {filters ? <View style={styles.loadBoardFilters}>{filters}</View> : null}
      </View>

      {part === "main" ? null : bidPreview}
      {bidReceipt}
    </View>
  );
}

function sidebarMovement(bid: MyOrgMarketBidRow): {
  amount: string;
  kind: string;
  won: boolean;
  live: boolean;
} {
  const fee = Number(bid.platform_fee_amount);
  const feeDue =
    bid.status === "accepted" &&
    !marketplaceFeeGateSatisfied(bid.fee_payment_status) &&
    Number.isFinite(fee) &&
    fee > 0;
  const rate = formatINR(Number(bid.amount) || 0);
  if (feeDue) return { amount: formatINR(fee), kind: "Fee due", won: false, live: true };
  if (bid.status === "accepted") return { amount: rate, kind: "Awarded", won: true, live: false };
  if (bid.status === "pending") return { amount: rate, kind: "Rate sent", won: false, live: true };
  return { amount: rate, kind: "Closed", won: false, live: false };
}

function BidReceiptModal({
  bid,
  desktop,
  onClose,
  onOpenBids,
}: {
  bid: MyOrgMarketBidRow | null;
  desktop: boolean;
  onClose: () => void;
  onOpenBids: () => void;
}) {
  if (!bid) return null;
  const fee = Number(bid.platform_fee_amount);
  const feeDue =
    bid.status === "accepted" &&
    !marketplaceFeeGateSatisfied(bid.fee_payment_status) &&
    Number.isFinite(fee) &&
    fee > 0;
  const statusLabel =
    feeDue ? "FEE DUE" : bid.status === "accepted" ? "AWARDED" : bid.status === "pending" ? "RATE SENT" : "CLOSED";
  const pickup = (bid.pickup_area ?? "Pickup").trim();
  const drop = (bid.drop_location ?? "Drop").trim();
  const details = [
    { label: "Sent", value: receiptDate(bid.created_at) },
    { label: "Lane", value: `${pickup} → ${drop}` },
    { label: "Pickup date", value: receiptDate(bid.pickup_date) },
    { label: "Load", value: (bid.load_type ?? "").trim() || "—" },
    { label: "Indent", value: (bid.indent_number ?? "").trim() || "—" },
    {
      label: "Fee",
      value: feeDue ? formatINR(fee) : marketplaceFeeGateSatisfied(bid.fee_payment_status) && bid.status === "accepted" ? "Settled" : "Not due",
    },
  ];
  if (bid.note?.trim()) details.push({ label: "Note", value: bid.note.trim() });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.receiptOverlay} onPress={onClose} accessibilityLabel="Close bid receipt">
        <View style={styles.receiptShell} onStartShouldSetResponder={() => true}>
          <LedgerEntryReceiptCard
            desktop={desktop}
            heroAnimation={bid.status === "accepted" ? "success" : false}
            statusLabel={statusLabel}
            title={feeDue ? "Marketplace fee" : "Marketplace rate"}
            amount={feeDue ? fee : Number(bid.amount) || 0}
            isIn={!feeDue}
            partyAvatar={{ name: pickup, entityType: "client" }}
            details={details}
            secondaryAction={{ label: "Close", onPress: onClose }}
            primaryAction={{ label: "Open bids", onPress: onOpenBids }}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

function receiptDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const styles = StyleSheet.create({
  receiptOverlay: {
    flex: 1,
    backgroundColor: LEDGER_RECEIPT.overlay,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  receiptShell: { width: "100%", maxWidth: 380, alignSelf: "center" },
  wrap: { paddingBottom: 4, gap: 16 },
  side: { width: 400, alignSelf: "stretch", gap: 12, paddingTop: 0, paddingBottom: 0 },
  sideCard: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    gap: 4,
  },
  previewScroll: { flex: 1 },
  previewScrollContent: { paddingBottom: 4 },
  previewScrollEmpty: { flexGrow: 1, justifyContent: "center" },
  txEmpty: { alignItems: "center", paddingHorizontal: 18, paddingVertical: 24, gap: 8 },
  txSheet: {
    width: 148,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    backgroundColor: Theme.loadMainTabBgIdle,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 6,
  },
  txSheetIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.loadMainTabBg,
    alignItems: "center",
    justifyContent: "center",
  },
  txLine: { height: 6, borderRadius: 3, backgroundColor: Theme.cardWhite },
  txLineShort: { width: "62%" },
  txEmptyTitle: { fontSize: 14, fontWeight: "600", color: Theme.primaryText },
  txEmptyBody: { fontSize: 12, lineHeight: 17, fontWeight: "500", color: Theme.textSecondary, textAlign: "center" },
  previewEmpty: { fontSize: 13, fontWeight: "600", color: Theme.textSecondary, paddingTop: 8 },
  heroRow: { gap: 12 },
  heroRowDesktop: { flexDirection: "row", alignItems: "stretch" },
  hero: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.loadMainTabBg,
    borderRadius: 16,
    paddingLeft: 20,
    paddingVertical: 8,
    paddingRight: 8,
    gap: 12,
    overflow: "hidden",
    minHeight: 148,
  },
  heroDesktop: {
    minHeight: 168,
    paddingLeft: 24,
    paddingRight: 12,
    gap: 16,
  },
  heroIdentity: { flex: 1, flexShrink: 1, minWidth: 0, gap: 6, justifyContent: "center", zIndex: 1 },
  heroArt: {
    width: 188,
    height: 88,
    justifyContent: "center",
    flexShrink: 0,
  },
  heroArtDesktop: { width: 280, height: 120 },
  lineArt: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  lineCrate: {
    width: 28,
    height: 24,
    borderWidth: 1.25,
    borderColor: Theme.primaryText,
    borderRadius: 3,
    justifyContent: "flex-start",
  },
  lineCrateLid: {
    height: 6,
    borderBottomWidth: 1.25,
    borderBottomColor: Theme.primaryText,
  },
  lineLane: { flex: 1, height: 36, justifyContent: "flex-end" },
  lineGround: { height: 1, backgroundColor: Theme.primaryText, opacity: 0.45 },
  lineTruck: { position: "absolute", left: 0, bottom: 2 },
  lineBoard: {
    width: 64,
    height: 52,
    borderWidth: 1.25,
    borderColor: Theme.primaryText,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 5,
  },
  lineBoardDot: { width: 10, height: 3, borderRadius: 2, backgroundColor: Theme.primaryText },
  lineBoardRow: { height: 2, borderRadius: 1, backgroundColor: Theme.primaryText, opacity: 0.28 },
  lineBoardRowShort: { width: "58%" },
  heroNameRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroKicker: {
    color: Theme.primaryText,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  heroName: { color: Theme.primaryText, fontSize: 34, fontWeight: "800", letterSpacing: -0.8, lineHeight: 38 },
  heroNameDesktop: { fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  heroOffer: { gap: 4, minWidth: 0 },
  heroOfferDesktop: { alignItems: "flex-end", maxWidth: 460 },
  heroOfferText: { textAlign: "right" },
  heroTitle: { color: Theme.primaryText, fontSize: 16, fontWeight: "500" },
  mark: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  markRing: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: Theme.primaryText,
  },
  markCore: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.primaryText,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBody: { color: Theme.primaryText, fontSize: 14, lineHeight: 20, maxWidth: 520 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
  heroActionsDesktop: { justifyContent: "flex-end" },
  heroPrimary: {
    backgroundColor: Theme.primaryText,
    borderRadius: 999,
    paddingHorizontal: 16,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPrimaryText: { color: Theme.loadMainTabBg, fontWeight: "800", fontSize: 14 },
  heroSecondary: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.primaryText,
    paddingHorizontal: 16,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heroSecondaryText: { color: Theme.primaryText, fontWeight: "700", fontSize: 14 },
  tiles: { gap: 10, paddingRight: 8 },
  tilesDesktop: { flexDirection: "row", alignItems: "stretch", gap: 12 },
  tileScroll: { width: 168 },
  tileFill: { flex: 1, minWidth: 0 },
  laneRow: { flexDirection: "row", gap: 12 },
  laneRowWide: { flex: 2, minWidth: 0 },
  laneSlide: {
    flex: 1,
    minWidth: 0,
    minHeight: 112,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    justifyContent: "space-between",
  },
  laneSlideScroll: { width: 220, flexGrow: 0, flexShrink: 0 },
  laneSlideMeta: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  laneSlideRoute: { marginTop: 8, fontSize: 16, lineHeight: 20, fontWeight: "600", color: Theme.textPrimaryDark },
  laneSlideDrop: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  laneSlideDropText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 16, fontWeight: "500", color: Theme.textSecondary },
  awardCard: { borderColor: Theme.accentGoldBorder, backgroundColor: Theme.loadMainTabBgIdle },
  awardKicker: { flexDirection: "row", alignItems: "center", gap: 6 },
  awardDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.primaryText },
  awardAction: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.loadMainTabBg,
  },
  awardActionText: { fontSize: 12, fontWeight: "600", color: Theme.primaryText },
  tile: {
    minHeight: 112,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    justifyContent: "space-between",
  },
  tileMoney: {
    backgroundColor: Theme.loadMainTabBgIdle,
    borderColor: Theme.accentGoldBorder,
  },
  tileTop: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 26 },
  tileIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.loadMainTabBg,
    alignItems: "center",
    justifyContent: "center",
  },
  tileIconMoney: { backgroundColor: Theme.primaryText },
  tileTitle: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  tileValue: { fontSize: 24, fontWeight: "800", letterSpacing: -0.6, color: Theme.textPrimaryDark },
  tileBody: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary, marginTop: 2 },
  tileMoneyBody: { marginTop: 12, gap: 8 },
  tileChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.loadMainTabBg,
  },
  tileChipText: { fontSize: 11, lineHeight: 14, fontWeight: "700", color: Theme.primaryText },
  tileStats: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, marginHorizontal: -3 },
  tileStat: { width: "50%", minWidth: 0, paddingHorizontal: 3, paddingBottom: 6 },
  tileStatCell: {
    borderRadius: 10,
    backgroundColor: Theme.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 1,
  },
  tileStatValue: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: Theme.textPrimaryDark },
  tileStatLabel: { fontSize: 10, lineHeight: 13, fontWeight: "600", color: Theme.textSecondary },
  pressed: { opacity: 0.9 },
  wallet: {
    width: "100%",
    maxWidth: "100%",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  walletKicker: { color: Theme.buttonPrimaryText, fontSize: 12, fontWeight: "700", opacity: 0.85 },
  walletValue: { color: Theme.buttonPrimaryText, fontSize: 28, fontWeight: "800", letterSpacing: -0.4 },
  walletHint: { color: Theme.buttonPrimaryText, fontSize: 13, opacity: 0.9 },
  walletStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.buttonPrimaryBorder,
  },
  walletStat: { gap: 1 },
  walletStatValue: { color: Theme.buttonPrimaryText, fontSize: 16, fontWeight: "800" },
  walletStatLabel: { color: Theme.buttonPrimaryText, fontSize: 11, fontWeight: "600", opacity: 0.85 },
  walletStatRule: { width: 1, height: 28, backgroundColor: Theme.buttonPrimaryBorder, opacity: 0.45 },
  walletActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  walletPill: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  walletLink: { color: Theme.buttonPrimaryText, fontWeight: "800", fontSize: 13 },
  promo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Theme.brandBlueSoft,
    borderRadius: 16,
    padding: 14,
  },
  promoCopy: { flex: 1, gap: 4 },
  promoTitle: { fontSize: 16, fontWeight: "800", color: Theme.textPrimaryDark },
  promoBody: { fontSize: 13, lineHeight: 18, color: Theme.textSecondary },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  loadBoard: { gap: 10 },
  loadBoardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  loadBoardMeta: { flexDirection: "row", alignItems: "center", gap: 12 },
  loadBoardFilters: { width: "100%" },
  searchChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  searchChipText: { fontSize: 13, fontWeight: "800", color: Theme.buttonPrimaryText },
  section: { fontSize: 16, fontWeight: "700", color: Theme.textPrimaryDark },
  sectionMeta: { fontSize: 13, fontWeight: "700", color: Theme.textSecondary },
  link: { fontSize: 12, fontWeight: "600", color: Theme.buttonPrimaryText },
  previewCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    gap: 4,
  },
  previewTitle: { fontSize: 14, fontWeight: "600", color: Theme.textPrimaryDark },
  panelTabs: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 16 },
  panelTitleIdle: { color: Theme.textMuted, fontWeight: "500" },
  sideTabs: { flexDirection: "row", gap: 8, marginTop: 8 },
  sideTab: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceLight,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 1,
  },
  sideTabOn: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.buttonPrimaryBorder,
  },
  sideTabCount: { fontSize: 16, lineHeight: 20, fontWeight: "600", color: Theme.textPrimaryDark },
  sideTabCountOn: { color: Theme.buttonPrimaryText },
  sideTabLabel: { fontSize: 11, lineHeight: 14, fontWeight: "500", color: Theme.textSecondary },
  sideTabLabelOn: { color: Theme.buttonPrimaryText },
  previewRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  previewCopy: { flex: 1, minWidth: 0, gap: 2 },
  previewRoute: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: Theme.textPrimaryDark },
  previewDrop: { fontSize: 11, lineHeight: 14, fontWeight: "400", color: Theme.textSecondary },
  previewMeta: { width: 108, alignItems: "flex-end", gap: 2, flexShrink: 0 },
  previewAmount: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: Theme.textPrimaryDark },
  previewStatus: { fontSize: 11, lineHeight: 14, fontWeight: "500", color: Theme.textMuted, textAlign: "right" },
  previewStatusWon: { color: Theme.positive },
  previewStatusLive: { color: Theme.buttonPrimaryText },
});
