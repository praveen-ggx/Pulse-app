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
  ChevronLeft,
  ClipboardList,
  Gavel,
  Lock,
  MapPin,
  Search,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
      <View style={[styles.laneSlide, styles.awardCard]}>
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
  const showDots = !wide && lanes.length > 1;
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
            style={({ pressed }) => [styles.laneSlide, styles.hotLaneCard, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Hot lane, ${lane.pickup_area} to ${lane.drop_location}, ${count} pooled loads`}
          >
            <View style={styles.tileTop}>
              <View style={styles.hotLaneBadge}>
                <View style={styles.hotLaneBadgeDot} />
                <Text style={styles.hotLaneBadgeText}>HOT LANE</Text>
              </View>
              <Text style={styles.hotLaneCount}>
                {count} load{count === 1 ? "" : "s"} pooled
              </Text>
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
            <View style={styles.hotLaneFoot}>
              <View style={styles.hotLaneVehicle}>
                <Truck size={12} color={Theme.textSecondary} strokeWidth={2} />
                <Text style={styles.hotLaneVehicleText} numberOfLines={1}>
                  {titleCaseWord(lane.vehicle_type) || "Any vehicle"}
                </Text>
              </View>
              {showDots ? (
                <View style={styles.hotLaneDots}>
                  {lanes.slice(0, 5).map((dotLane, dot) => (
                    <View
                      key={dotLane.poolId}
                      style={[styles.hotLaneDot, dot === index % Math.min(lanes.length, 5) && styles.hotLaneDotOn]}
                    />
                  ))}
                </View>
              ) : null}
              <View style={styles.hotLaneCta}>
                <Text style={styles.hotLaneCtaText}>View lane</Text>
                <ArrowRight size={14} color={Theme.primaryText} strokeWidth={2.4} />
              </View>
            </View>
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
  const shift = travel.interpolate({ inputRange: [0, 1], outputRange: [0, wide ? 132 : 88] });
  return (
    <View style={styles.routeArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.routeArtHead}>
        <View style={styles.routeArtBadge}>
          <Truck size={16} color={Theme.loadMainTabBg} strokeWidth={2.2} />
        </View>
        <View style={styles.routeArtCopy}>
          <Text style={styles.routeArtTitle}>Open lanes</Text>
          <Text style={styles.routeArtSub}>Bids open now</Text>
        </View>
      </View>
      <View style={styles.routeTrack}>
        <View style={styles.routeDot} />
        <View style={styles.routeLine}>
          <Animated.View style={[styles.routeTruck, { transform: [{ translateX: shift }] }]}>
            <Truck size={18} color={Theme.primaryText} strokeWidth={1.8} />
          </Animated.View>
        </View>
        <MapPin size={16} color={Theme.primaryText} strokeWidth={2.2} />
      </View>
      <View style={styles.routeLabels}>
        <Text style={styles.routeLabel}>Pickup</Text>
        <Text style={styles.routeLabel}>Drop</Text>
      </View>
    </View>
  );
}

const HERO_POINTS = [
  { label: "Verified loads", Icon: ShieldCheck },
  { label: "Competitive bids", Icon: Gavel },
  { label: "Secure payments", Icon: Lock },
] as const;

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
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
  return (
    <View style={styles.livePill}>
      <View style={styles.liveDotWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.liveDotRing, { opacity, transform: [{ scale }] }]} />
        <View style={styles.liveDot} />
      </View>
      <Text style={styles.livePillText}>LIVE</Text>
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
          <Text style={styles.walletStatValue}>{figures.ratesSent}</Text>
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

  const summaryStats: readonly { label: string; value: string; onPress: () => void; a11y: string }[] = [
    { label: "Active bids", value: String(activeBids.length), onPress: () => onOpenBids("bids"), a11y: "Open active bids" },
    { label: "Won", value: String(figures.awarded), onPress: () => onOpenBids("won"), a11y: "Open won bids" },
    { label: "Rates sent", value: formatINR(ratesSent), onPress: () => onOpenBids("bids"), a11y: "Open bids you sent" },
    {
      label: "Trips",
      value: transactionsReady ? String(transactionBids.length) : "—",
      onPress: onOpenTransactions,
      a11y: "Open marketplace transactions",
    },
  ];

  const mobileSummary = (
    <View style={styles.summary}>
      <View style={styles.summaryTop}>
        <View style={styles.summaryCopy}>
          <Text style={styles.walletKicker}>Marketplace wallet</Text>
          <Text style={styles.walletValue}>{figures.due > 0 ? formatINR(figures.due) : "Clear"}</Text>
          <Text style={styles.walletHint}>{figures.due > 0 ? "Fees due on awarded loads" : "Nothing due right now"}</Text>
        </View>
        <Pressable
          onPress={onOpenWallet}
          style={({ pressed }) => [styles.summaryWalletBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open wallet"
        >
          <Text style={styles.summaryWalletBtnText}>Wallet</Text>
          <ArrowRight size={14} color={Theme.buttonPrimaryText} strokeWidth={2.4} />
        </Pressable>
      </View>
      <View style={styles.summaryStats}>
        {summaryStats.map((stat) => (
          <Pressable
            key={stat.label}
            onPress={stat.onPress}
            style={({ pressed }) => [styles.summaryStat, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${stat.a11y}, ${stat.value}`}
          >
            <Text style={styles.summaryStatValue} numberOfLines={1}>{stat.value}</Text>
            <Text style={styles.summaryStatLabel} numberOfLines={1}>{stat.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.walletActions}>
        <Pressable onPress={() => onOpenBids()} style={styles.walletPill} accessibilityRole="button" accessibilityLabel="Open my bids">
          <ClipboardList size={14} color={Theme.buttonPrimaryText} strokeWidth={2.2} />
          <Text style={styles.walletLink}>My bids</Text>
        </Pressable>
        <Pressable onPress={onOpenTransactions} style={styles.walletPill} accessibilityRole="button" accessibilityLabel="Open transactions">
          <ArrowLeftRight size={14} color={Theme.buttonPrimaryText} strokeWidth={2.2} />
          <Text style={styles.walletLink}>Transactions</Text>
        </Pressable>
      </View>
    </View>
  );

  const bidPreview = preview.length === 0 ? null : (
    <View style={styles.previewCard}>
      <View style={styles.sectionRow}>
        <Text style={styles.previewTitle}>My bids</Text>
        <Pressable onPress={() => onOpenBids()} accessibilityRole="button" accessibilityLabel="See all bids">
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
            <View style={styles.heroKickerRow}>
              <LiveMark />
              <Text style={styles.heroKicker} numberOfLines={1}>
                {orgName.trim() ? orgName.trim().toUpperCase() : "MARKETPLACE"}
              </Text>
            </View>
            <Text
              style={[styles.heroName, isDesktop && styles.heroNameDesktop, !isDesktop && width < 420 && styles.heroNameCompact]}
              accessibilityRole="header"
            >
              Marketplace Loads
            </Text>
            <Text style={styles.heroTitle}>Find, bid and move more loads</Text>
            <View style={styles.heroPoints}>
              {HERO_POINTS.map(({ label, Icon }) => (
                <View key={label} style={styles.heroPoint}>
                  <Icon size={13} color={Theme.primaryText} strokeWidth={2.4} />
                  <Text style={styles.heroPointText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
          {isDesktop || width >= 600 ? (
            <View style={[styles.heroArt, isDesktop && styles.heroArtDesktop]} pointerEvents="none">
              <HeroLineArt wide={isDesktop} />
            </View>
          ) : null}
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
        <View style={styles.tilesMobile}>
          {assignBids.length > 0 && onAssignVehicle ? (
            <AwardVehicleAlert bids={assignBids} wide={false} onAssign={onAssignVehicle} />
          ) : featuredLanes.length > 0 && onOpenFeaturedLane ? (
            <HotLaneSlide lanes={featuredLanes} wide={false} onOpen={onOpenFeaturedLane} onWarm={onWarmFeaturedLane} />
          ) : null}
          {part === "main" ? null : mobileSummary}
        </View>
      )}

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

  const receipt = (
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
  );

  if (!desktop) {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
        <BidReceiptPage onClose={onClose}>{receipt}</BidReceiptPage>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.receiptOverlay} onPress={onClose} accessibilityLabel="Close bid receipt">
        <View style={styles.receiptShell} onStartShouldSetResponder={() => true}>
          {receipt}
        </View>
      </Pressable>
    </Modal>
  );
}

function BidReceiptPage({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.receiptPage, { paddingTop: insets.top }]}>
      <View style={styles.receiptPageHead}>
        <Pressable
          onPress={onClose}
          style={styles.receiptPageBack}
          accessibilityRole="button"
          accessibilityLabel="Back to marketplace"
          hitSlop={8}
        >
          <ChevronLeft size={20} color={Theme.textPrimaryDark} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.receiptPageTitle}>Bid receipt</Text>
      </View>
      <ScrollView
        style={styles.receiptPageScroll}
        contentContainerStyle={[styles.receiptPageContent, { paddingBottom: insets.bottom + 24 }]}
      >
        {children}
      </ScrollView>
    </View>
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
  receiptPage: { flex: 1, backgroundColor: Theme.surfaceLight },
  receiptPageHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  receiptPageBack: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  receiptPageTitle: { fontSize: 18, fontWeight: "800", color: Theme.textPrimaryDark },
  receiptPageScroll: { flex: 1 },
  receiptPageContent: { paddingHorizontal: 16, paddingTop: 16 },
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
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 16,
    overflow: "hidden",
  },
  heroDesktop: {
    paddingHorizontal: 28,
    paddingVertical: 24,
    gap: 24,
  },
  heroIdentity: { flex: 1, flexShrink: 1, minWidth: 0, gap: 8, justifyContent: "center" },
  heroArt: { width: 188, flexShrink: 0 },
  heroArtDesktop: { width: 280 },
  routeArt: {
    backgroundColor: Theme.loadMainTabBgIdle,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    padding: 14,
    gap: 14,
  },
  routeArtHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeArtBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.primaryText,
    alignItems: "center",
    justifyContent: "center",
  },
  routeArtCopy: { flex: 1, minWidth: 0, gap: 1 },
  routeArtTitle: { color: Theme.primaryText, fontSize: 13, fontWeight: "800" },
  routeArtSub: { color: Theme.primaryText, opacity: 0.65, fontSize: 11, fontWeight: "600" },
  routeTrack: { flexDirection: "row", alignItems: "center", gap: 8 },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Theme.primaryText,
  },
  routeLine: {
    flex: 1,
    height: 22,
    justifyContent: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: Theme.primaryText,
    borderStyle: "dashed",
  },
  routeTruck: { position: "absolute", left: 0, bottom: 2 },
  routeLabels: { flexDirection: "row", justifyContent: "space-between" },
  routeLabel: { color: Theme.primaryText, opacity: 0.6, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  heroKickerRow: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  heroKicker: {
    flexShrink: 1,
    color: Theme.primaryText,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    opacity: 0.72,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primaryText,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexShrink: 0,
  },
  livePillText: { color: Theme.loadMainTabBg, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  liveDotWrap: { width: 8, height: 8, alignItems: "center", justifyContent: "center" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.driverPrimary },
  liveDotRing: { position: "absolute", width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.driverPrimary },
  heroName: { color: Theme.primaryText, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, lineHeight: 36 },
  heroNameDesktop: { fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  heroNameCompact: { fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
  heroPoints: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  heroPoint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.loadMainTabBgIdle,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroPointText: { color: Theme.primaryText, fontSize: 12, fontWeight: "600" },
  heroOffer: { gap: 4, minWidth: 0 },
  heroOfferDesktop: { alignItems: "flex-end", maxWidth: 460 },
  heroOfferText: { textAlign: "right" },
  heroTitle: { color: Theme.primaryText, fontSize: 15, fontWeight: "500", lineHeight: 20 },
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
  tilesMobile: { gap: 12 },
  hotLaneCard: { borderColor: Theme.accentGoldBorder, gap: 2 },
  hotLaneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.loadMainTabBg,
  },
  hotLaneBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Theme.primaryText },
  hotLaneBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: Theme.primaryText },
  hotLaneCount: { marginLeft: "auto", fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  hotLaneFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  hotLaneVehicle: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surfaceLight,
  },
  hotLaneVehicleText: { flexShrink: 1, fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  hotLaneDots: { flexDirection: "row", alignItems: "center", gap: 4 },
  hotLaneDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Theme.borderLight },
  hotLaneDotOn: { width: 14, backgroundColor: Theme.primaryText },
  hotLaneCta: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  hotLaneCtaText: { fontSize: 13, fontWeight: "700", color: Theme.primaryText },
  summary: {
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  summaryTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  summaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  summaryWalletBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.buttonPrimaryBorder,
  },
  summaryWalletBtnText: { fontSize: 13, fontWeight: "800", color: Theme.buttonPrimaryText },
  summaryStats: { flexDirection: "row", gap: 8 },
  summaryStat: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    gap: 2,
  },
  summaryStatValue: { fontSize: 15, fontWeight: "800", color: Theme.buttonPrimaryText, letterSpacing: -0.2 },
  summaryStatLabel: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
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
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
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
  loadBoardHead: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 12 },
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
