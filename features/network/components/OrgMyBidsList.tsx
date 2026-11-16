/**
 * A4.4 Phase 4 — org "My Bids": this organization's own Marketplace bids,
 * grouped by status. Mirrors the driver app's MyBidsContent shape (grouped
 * Pending/Accepted/Closed cards), backed by list_my_org_market_bids instead
 * of a plain market_bids select — see findLoadsForOrg.service.ts.
 *
 * Contact reveal is resolved entirely server-side (Marketplace
 * contact-visibility policy): owner_phone is only non-null once a bid is
 * accepted, so this component never has to decide when to show it — it
 * renders owner_phone ?? owner_masked_phone as-is.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import {
  MarketplaceRouteGrid,
  MarketplaceSpecChips,
  titleCaseWord,
} from "@/features/network/components/MarketplaceLoadCardChrome";
import {
  formatFindLoadsRateOffer,
  type FeePaymentStatus,
  type MarketplaceAwardIndent,
  type MarketplaceConvertedTrip,
  type MyOrgMarketBidRow,
  type MyOrgMarketBidStatus,
} from "@/features/network/services/findLoadsForOrg.service";
import { formatStoryDate } from "@/features/network/utils/storyDisplay";
import { countActiveLoadsInPlay, countLaneBids, countSubmittedBids, laneBidCaption, loadsCaption, loadsStillInPlay } from "@/features/network/utils/bidLoadCount.util";
import { ScoreboardNumber } from "@/features/network/components/ScoreboardNumber";
import { bidderLaneKey, groupBidsByLane } from "@/features/network/utils/marketplaceLaneSearchMemory.util";
import { positiveLaneTarget, type MarketplaceSearchLane } from "@/features/network/utils/marketplaceSearch.util";
import { PoolStatusPill } from "@/features/network/components/pooled/PoolStatusPill";
import { RouteEndpointStack } from "@/features/network/components/RouteEndpointStack";
import { poolKeyFromLane, poolKeyId } from "@/features/network/utils/pooledOpportunity.util";
import {
  createMarketplaceFeeOrder,
  createTestMarketplaceFeeOrder,
  marketplaceFeeGateSatisfied,
  settleMarketplaceFeeAsCash,
  simulateTestMarketplaceFeePayment,
  type TestMarketplaceFeeProvider,
} from "@/features/network/services/marketBids.service";
import {
  RazorpayCheckoutSheet,
  type RazorpayCheckoutResult,
} from "@/features/marketplace/components/RazorpayCheckoutSheet";
import {
  PilotPaymentMethodSheet,
  PilotTestCheckoutSheet,
} from "@/features/marketplace/components/PilotPaymentMethodSheet";
import { RazorpayTestPreviewSheet } from "@/features/driver/components/RazorpayTestPreviewSheet";
import type { IndentRow } from "@/features/indents/services/indents.service";
import { setInitialIndentForDetail } from "@/features/indents/initialIndentForDetail";
import { showAppAlert } from "@/lib/appAlert";
import { confirmDialog } from "@/lib/confirmDialog";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { ArrowRight, ChevronRight, Gavel, Inbox, Layers, Package, Trophy } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

function formatAmount(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

function formatSubmittedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusLabel(status: MyOrgMarketBidStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Awarded";
    case "rejected":
      return "Not selected";
    case "withdrawn":
      return "Withdrawn";
    case "superseded":
      return "Superseded";
    default:
      return status;
  }
}

/** A6.4: the bid became moot before the business decided on it -- not a
 * rejection. (Superseding keys off the submitting account's own
 * availability, same mechanism as the DCO path -- see is_driver_available().) */
function statusExplanation(status: MyOrgMarketBidStatus): string | null {
  if (status === "superseded") {
    return "Another opportunity was awarded before this bid could be decided.";
  }
  return null;
}

function routeLabel(bid: MyOrgMarketBidRow): string {
  const from = (bid.pickup_area ?? "").trim() || "Pickup";
  const to = (bid.drop_location ?? "").trim() || "Drop";
  return `${from} → ${to}`;
}

function feePendingLabel(status: FeePaymentStatus, feeAmount: number | null): string {
  const feeLabel = feeAmount != null ? formatAmount(feeAmount) : "the Marketplace fee";
  switch (status) {
    case "pending":
      return `Payment of ${feeLabel} did not finish. Complete cash payment to unlock Assign.`;
    case "failed":
      return `Payment of ${feeLabel} failed — retry to unlock this load.`;
    case "required":
    default:
      return `Pay ${feeLabel} to Pulse to unlock this load.`;
  }
}

function indentRowFromOrgMarketBid(
  bid: MyOrgMarketBidRow,
  viewerOrgId: string,
): IndentRow {
  return {
    id: bid.indent_id,
    organization_id: bid.owner_organization_id ?? "",
    indent_number:
      (bid.indent_number ?? "").trim() ||
      bid.indent_id.slice(0, 8).toUpperCase(),
    pickup_area: bid.pickup_area ?? "",
    drop_location: bid.drop_location ?? "",
    client_name: "",
    client_price: Number(bid.amount) || 0,
    supplier_target: Number(bid.amount) || 0,
    assigned_supplier_rate: Number(bid.amount) || 0,
    status: "awarded",
    vehicle_type: null,
    load_type: bid.load_type,
    pickup_date: bid.pickup_date,
    circulation_target: "marketplace",
    created_at: bid.created_at,
    creator_organization_name: bid.owner_organization_name,
    assigned_supplier_id: viewerOrgId,
  };
}

const CLIENT_CANCEL_REASONS = new Set(["client_cancelled", "client_requested"]);

function wonSliceFor(
  bid: MyOrgMarketBidRow,
  trip: Pick<MarketplaceConvertedTrip, "status" | "cancelReason"> | undefined,
  indent: MarketplaceAwardIndent | undefined,
): "trips" | "you" | "client" {
  const reason = (trip?.cancelReason || indent?.cancelReason || "").trim();
  const cancelled =
    trip?.status === "cancelled" ||
    indent?.status === "cancelled" ||
    indent?.status === "expired";
  if (!cancelled) return "trips";
  return CLIENT_CANCEL_REASONS.has(reason) ? "client" : "you";
}

export function OrgMyBidsList({
  bids,
  isLoading,
  orgId,
  focus = "bids",
  onFocusChange,
  onPaymentUpdated,
  awardTrips = [],
  awardIndents = [],
  lanePreviewByBidId = {},
  lanes = [],
  laneTargets = {},
  lanesReady = false,
  actionSlot,
  footerSlot,
}: {
  bids: MyOrgMarketBidRow[];
  isLoading: boolean;
  orgId?: string | null;
  focus?: "bids" | "won";
  onFocusChange?: (focus: "bids" | "won") => void;
  /** A8.7: called after a checkout attempt closes, so the caller can refetch bids/loads. */
  onPaymentUpdated?: () => void;
  awardTrips?: readonly Pick<MarketplaceConvertedTrip, "indentId" | "status" | "cancelReason">[];
  awardIndents?: readonly MarketplaceAwardIndent[];
  lanePreviewByBidId?: Readonly<Record<string, { tone: "live" | "reduced" | "expired"; label: string }>>;
  lanes?: readonly MarketplaceSearchLane[];
  laneTargets?: Readonly<Record<string, { min: number | null; max: number | null }>>;
  lanesReady?: boolean;
  /** Needs-response content placed under the summary (rate requests). */
  actionSlot?: ReactNode;
  /** Secondary content after the Marketplace list (network quotes). */
  footerSlot?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const [bidSlice, setBidSlice] = useState<"active" | "failed">("active");
  const [wonSlice, setWonSlice] = useState<"trips" | "you" | "client">("trips");
  const groups = useMemo(() => {
    const pending: MyOrgMarketBidRow[] = [];
    const awarded: MyOrgMarketBidRow[] = [];
    const failed: MyOrgMarketBidRow[] = [];
    const tripsByIndent = new Map(awardTrips.map((trip) => [trip.indentId, trip]));
    const indentsById = new Map(awardIndents.map((indent) => [indent.id, indent]));
    const trips: MyOrgMarketBidRow[] = [];
    const cancelledByYou: MyOrgMarketBidRow[] = [];
    const cancelledByClient: MyOrgMarketBidRow[] = [];
    for (const b of bids) {
      if (b.status === "pending") pending.push(b);
      else if (b.status === "accepted") {
        awarded.push(b);
        const slice = wonSliceFor(b, tripsByIndent.get(b.indent_id), indentsById.get(b.indent_id));
        if (slice === "you") cancelledByYou.push(b);
        else if (slice === "client") cancelledByClient.push(b);
        else trips.push(b);
      } else failed.push(b);
    }
    return { pending, awarded, failed, trips, cancelledByYou, cancelledByClient };
  }, [awardIndents, awardTrips, bids]);

  if (isLoading || bids.length === 0) {
    return (
      <View style={styles.listContent}>
        {actionSlot}
        {isLoading ? (
          <View style={styles.centered}>
            <Text style={styles.message}>Loading your bids…</Text>
          </View>
        ) : (
          <View style={styles.empty}>
            <Inbox size={22} color={Theme.textSecondary} />
            <Text style={styles.emptyTitle}>No Marketplace bids yet</Text>
            <Text style={styles.emptyBody}>
              Bid on an open Marketplace load and it will show up here.
            </Text>
          </View>
        )}
        {footerSlot}
      </View>
    );
  }

  const active = countActiveLoadsInPlay(groups.pending, lanesReady ? lanes : null);
  const awardedLoads = countSubmittedBids(groups.awarded);
  const slice =
    focus === "won"
      ? wonSlice === "you"
        ? groups.cancelledByYou
        : wonSlice === "client"
          ? groups.cancelledByClient
          : groups.trips
      : bidSlice === "failed"
        ? groups.failed
        : groups.pending;
  const sliceTitle =
    focus === "won"
      ? wonSlice === "you"
        ? "Cancelled by you"
        : wonSlice === "client"
          ? "Cancelled by client"
          : "Trips"
      : bidSlice === "failed"
        ? "Failed"
        : "Active";
  const emptyCopy =
    focus === "won"
      ? wonSlice === "trips"
        ? { title: "No trips yet", body: "Awarded loads show here once they are still moving." }
        : wonSlice === "you"
          ? { title: "No cancellations by you", body: "Loads you cancel after winning show here." }
          : { title: "No cancellations by the client", body: "Loads the client cancels after you win show here." }
      : bidSlice === "failed"
        ? { title: "No failed bids", body: "Bids that were not selected show here." }
        : { title: "No active bids", body: "Open bids that are still waiting show here." };

  return (
    <View style={styles.listContent}>
      <View style={[styles.focusRow, isDesktop && styles.focusRowDesktop]}>
        <FocusTab
          count={active.bids}
          label="Active bids"
          caption={loadsCaption(active.loads)}
          icon={<Gavel size={15} strokeWidth={2.2} color={focus === "bids" ? Theme.textOnPrimary : Theme.textSecondary} />}
          selected={focus === "bids"}
          onPress={() => onFocusChange?.("bids")}
        />
        <FocusTab
          count={countLaneBids(groups.awarded).bids}
          label="Won"
          caption={loadsCaption(awardedLoads.loads)}
          icon={<Trophy size={15} strokeWidth={2.2} color={focus === "won" ? Theme.textOnPrimary : Theme.textSecondary} />}
          selected={focus === "won"}
          onPress={() => onFocusChange?.("won")}
        />
      </View>
      {actionSlot}
      <View style={styles.sliceRow}>
        {focus === "won" ? (
          <>
            <SliceTab label="Trips" count={groups.trips.length} selected={wonSlice === "trips"} onPress={() => setWonSlice("trips")} />
            <SliceTab label="By you" count={groups.cancelledByYou.length} selected={wonSlice === "you"} onPress={() => setWonSlice("you")} />
            <SliceTab label="By client" count={groups.cancelledByClient.length} selected={wonSlice === "client"} onPress={() => setWonSlice("client")} />
          </>
        ) : (
          <>
            <SliceTab label="Active" count={countLaneBids(groups.pending).bids} selected={bidSlice === "active"} onPress={() => setBidSlice("active")} />
            <SliceTab label="Failed" count={countLaneBids(groups.failed).bids} selected={bidSlice === "failed"} onPress={() => setBidSlice("failed")} />
          </>
        )}
      </View>
      {slice.length === 0 ? (
        <View style={styles.empty}>
          <Inbox size={22} color={Theme.primaryText} />
          <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
          <Text style={styles.emptyBody}>{emptyCopy.body}</Text>
        </View>
      ) : (
        <Section title={sliceTitle} count={countLaneBids(slice).bids}>
          {groupBidsByLane(slice).map((group) =>
            group.bids.length === 1 ? (
              <BidCard
                key={group.bids[0].id}
                bid={group.bids[0]}
                orgId={orgId}
                onPaymentUpdated={onPaymentUpdated}
                lanePreview={lanePreviewByBidId[group.bids[0].id]}
                lanes={lanes}
                laneTargets={laneTargets}
                lanesReady={lanesReady}
              />
            ) : (
              <BidPoolCard
                key={group.key}
                bids={group.bids}
                orgId={orgId}
                onPaymentUpdated={onPaymentUpdated}
                lanePreview={lanePreviewForGroup(group.bids, lanePreviewByBidId)}
                lanes={lanes}
                laneTargets={laneTargets}
                lanesReady={lanesReady}
              />
            ),
          )}
        </Section>
      )}
      {footerSlot}
    </View>
  );
}

function lanePreviewForGroup(
  bids: readonly MyOrgMarketBidRow[],
  previews: Readonly<Record<string, { tone: "live" | "reduced" | "expired"; label: string }>>,
): { tone: "live" | "reduced" | "expired"; label: string } | undefined {
  const statuses = bids.map((bid) => previews[bid.id]).filter(Boolean);
  return statuses.find((status) => status.tone === "expired")
    ?? statuses.find((status) => status.tone === "reduced")
    ?? statuses[0];
}

function liveLaneForBids(
  bids: readonly MyOrgMarketBidRow[],
  lanes: readonly MarketplaceSearchLane[],
  laneTargets: Readonly<Record<string, { min: number | null; max: number | null }>>,
) {
  const key = bidderLaneKey(bids[0]?.pickup_area, bids[0]?.drop_location);
  const matched = lanes.filter(
    (lane) => bidderLaneKey(lane.pickup_area, lane.drop_location) === key,
  );
  const loadCount = matched.reduce((sum, lane) => sum + (Number(lane.load_count) || 0), 0);
  const vehicles = [...new Set(matched.map((lane) => (lane.vehicle_type ?? "").trim()).filter(Boolean))];
  const targets = matched
    .flatMap((lane) => {
      const saved = laneTargets[poolKeyId(poolKeyFromLane(lane))];
      return [lane.target_rate_min, lane.target_rate_max, saved?.min, saved?.max];
    })
    .map(positiveLaneTarget)
    .filter((value): value is number => value != null);
  return {
    loadCount,
    vehicle: vehicles.length === 1 ? vehicles[0] : vehicles.length > 1 ? vehicles.map(titleCaseWord).join(" · ") : "",
    targetMin: targets.length ? Math.min(...targets) : null,
    targetMax: targets.length ? Math.max(...targets) : null,
  };
}

function formatLaneTarget(min: number | null, max: number | null): string | null {
  const low = formatFindLoadsRateOffer(min);
  const high = formatFindLoadsRateOffer(max ?? min);
  if (!low) return null;
  if (high && high !== low) return `${low} – ${high}`;
  return low;
}

function RateLines({ target, bid }: { target: string | null; bid: string }) {
  return (
    <View style={styles.rateStack}>
      {target ? (
        <View style={styles.poolTarget}>
          <Text style={styles.poolTargetKicker}>Target</Text>
          <Text style={styles.poolTargetPrice} numberOfLines={1}>{target}</Text>
        </View>
      ) : null}
      <View style={styles.poolTarget}>
        <Text style={styles.poolTargetKicker}>Your bid</Text>
        <Text style={styles.poolTargetPrice} numberOfLines={1}>{bid}</Text>
      </View>
    </View>
  );
}

function pooledLoadsLabel(ready: boolean, loadCount: number): string {
  if (!ready) return "Loads";
  const count = Number.isFinite(loadCount) ? loadCount : 0;
  return `${count} load${count === 1 ? "" : "s"}`;
}

function BidPoolCard({
  bids,
  orgId,
  onPaymentUpdated,
  lanePreview,
  lanes,
  laneTargets,
  lanesReady,
}: {
  bids: readonly MyOrgMarketBidRow[];
  orgId?: string | null;
  onPaymentUpdated?: () => void;
  lanePreview?: { tone: "live" | "reduced" | "expired"; label: string };
  lanes: readonly MarketplaceSearchLane[];
  laneTargets: Readonly<Record<string, { min: number | null; max: number | null }>>;
  lanesReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const first = bids[0];
  const lane = liveLaneForBids(bids, lanes, laneTargets);
  const amounts = bids.map((bid) => Number(bid.amount)).filter((amount) => Number.isFinite(amount));
  const low = amounts.length ? Math.min(...amounts) : null;
  const high = amounts.length ? Math.max(...amounts) : null;
  const oneRate = low != null && low === high;
  const covered = countLaneBids(bids);
  const loadsNow = loadsStillInPlay(covered.loads, lanesReady ? lane.loadCount : null);
  const live = lanesReady && loadsNow > 0 && lanePreview?.tone !== "expired";
  const bidLabel = laneBidCaption(loadsNow);
  const loadsLabel = pooledLoadsLabel(lanesReady, loadsNow);
  const targetLow = formatFindLoadsRateOffer(lane.targetMin);
  const targetHigh = formatFindLoadsRateOffer(lane.targetMax ?? lane.targetMin);
  const bidLow = formatAmount(low);
  const bidHigh = formatAmount(high);

  return (
    <View style={[styles.card, styles.poolCard, isDesktop && styles.cardDesktop]}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Pooled bids, ${(first.pickup_area ?? "Pickup").trim()} to ${(first.drop_location ?? "Drop").trim()}, ${loadsLabel}, ${bidLabel}`}
      >
        <View style={styles.poolStage}>
          <View style={styles.poolTop}>
            <Text style={styles.poolTag} numberOfLines={1}>POOLED · {loadsLabel.toUpperCase()}</Text>
            <PoolStatusPill state={live ? "open" : "closed"} surface="mint" size="compact" />
          </View>
          <View style={styles.poolRoute}>
            <View style={styles.poolRouteCol}>
              <Text style={styles.poolRouteLabel}>Pickup</Text>
              <RouteEndpointStack value={first.pickup_area} primaryStyle={styles.poolCity} secondaryStyle={styles.poolArea} maxLinesPerItem={1} />
            </View>
            <View style={styles.poolArrow}>
              <ArrowRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
            </View>
            <View style={[styles.poolRouteCol, styles.poolRouteEnd]}>
              <Text style={[styles.poolRouteLabel, styles.poolAlignEnd]}>Drop</Text>
              <RouteEndpointStack value={first.drop_location} align="end" primaryStyle={styles.poolCity} secondaryStyle={styles.poolArea} maxLinesPerItem={1} />
            </View>
          </View>
          <Text style={styles.poolVehicle} numberOfLines={1}>
            {lane.vehicle ? titleCaseWord(lane.vehicle) : bidLabel}
          </Text>
        </View>
        <View style={styles.poolBody}>
          <View style={styles.poolMetricRow}>
            <View style={styles.poolMetric}>
              <View style={styles.poolMetricIcon}>
                <Package size={14} color={Theme.primaryText} strokeWidth={2.2} />
              </View>
              <Text style={styles.poolMetricValue}>{lanesReady ? loadsNow : "—"}</Text>
              <Text style={styles.poolMetricUnit}>{loadsNow === 1 ? "load" : "loads"}</Text>
            </View>
            <Text style={styles.poolBids}>{lanePreview ? `${bidLabel} · ${lanePreview.label}` : bidLabel}</Text>
          </View>
          <RateLines
            target={targetLow ? (targetHigh && targetHigh !== targetLow ? `${targetLow} – ${targetHigh}` : targetLow) : null}
            bid={oneRate ? bidLow : `${bidLow} – ${bidHigh}`}
          />
        </View>
      </Pressable>
      {open
        ? bids.map((bid) => (
            <BidCard
              key={bid.id}
              bid={bid}
              orgId={orgId}
              onPaymentUpdated={onPaymentUpdated}
              lanePreview={undefined}
              nested
            />
          ))
        : null}
    </View>
  );
}

function SliceTab({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.sliceTab, selected && styles.sliceTabOn]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count}`}
    >
      <Text style={[styles.sliceLabel, selected && styles.sliceLabelOn]}>{label}</Text>
      <Text style={[styles.sliceCount, selected && styles.sliceLabelOn]}>{count}</Text>
    </Pressable>
  );
}

function FocusTab({
  count,
  label,
  caption,
  icon,
  selected,
  onPress,
}: {
  count: number;
  label: string;
  caption: string;
  icon: ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.focusTab, selected && styles.focusTabOn, pressed && styles.focusTabPressed]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count}`}
    >
      <View style={styles.focusHead}>
        <Text style={[styles.focusLabel, selected && styles.focusOnMuted]}>{label}</Text>
        <View style={[styles.focusIcon, selected && styles.focusIconOn]}>{icon}</View>
      </View>
      <ScoreboardNumber value={count} style={[styles.focusCount, selected && styles.focusOnText]} />
      <Text style={[styles.focusCaption, selected && styles.focusOnMuted]} numberOfLines={1}>
        {caption}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title.toUpperCase()} · {count}
      </Text>
      <View style={[styles.sectionGrid, isDesktop && styles.sectionGridDesktop]}>
        {children}
      </View>
    </View>
  );
}

function BidCard({
  bid,
  orgId,
  onPaymentUpdated,
  lanePreview,
  lanes = [],
  laneTargets = {},
  lanesReady = false,
  nested = false,
}: {
  bid: MyOrgMarketBidRow;
  orgId?: string | null;
  onPaymentUpdated?: () => void;
  lanePreview?: { tone: "live" | "reduced" | "expired"; label: string };
  lanes?: readonly MarketplaceSearchLane[];
  laneTargets?: Readonly<Record<string, { min: number | null; max: number | null }>>;
  lanesReady?: boolean;
  nested?: boolean;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const isAccepted = bid.status === "accepted";
  const isRejected = bid.status === "rejected";
  const phoneDisplay = bid.owner_phone ?? bid.owner_masked_phone;
  const feeGateSatisfied = marketplaceFeeGateSatisfied(bid.fee_payment_status);
  /**
   * Shipper identity (name, avatar, indent number, phone) is revealed only at
   * allocation: awarded AND the Marketplace fee settled. Before that the card
   * shows the lane only — same rule as Network pooled bids.
   */
  const identityRevealed = isAccepted && feeGateSatisfied;
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<{
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
  } | null>(null);

  // A11.4 — organization side of the same pilot payment-method picker the
  // DCO path already uses. Reuses the exact same backend mechanism
  // (marketplace-test-payment edge function -> confirm_marketplace_fee_payment());
  // no new payment state, no DCO-specific behavior is introduced here -- a
  // successful payment only unblocks the organization's own existing
  // award -> allocation/trip path via onPaymentUpdated, same as before.
  const [methodSheetOpen, setMethodSheetOpen] = useState(false);
  const [testOrder, setTestOrder] = useState<{ provider: TestMarketplaceFeeProvider; amount: number } | null>(
    null,
  );
  const [isStartingTestPayment, setIsStartingTestPayment] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const canPay =
    isAccepted &&
    (bid.fee_payment_status === "required" ||
      bid.fee_payment_status === "failed" ||
      bid.fee_payment_status === "pending");
  const shipper = titleCaseWord(
    (bid.owner_organization_name ?? "").trim() || "Unknown shipper",
  );
  const specChips = [bid.load_type]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .map(titleCaseWord);
  const dateLabel = bid.pickup_date ? formatStoryDate(bid.pickup_date) : null;
  const laneQuote = lanesReady ? liveLaneForBids([bid], lanes, laneTargets) : null;
  const targetLabel = laneQuote ? formatLaneTarget(laneQuote.targetMin, laneQuote.targetMax) : null;

  const handlePay = async () => {
    if (isStartingPayment) return;
    setIsStartingPayment(true);
    try {
      const { error, order } = await createMarketplaceFeeOrder(bid.id);
      if (error || !order) {
        showAppAlert("Could not start payment", error?.message ?? "Please try again.");
        return;
      }
      setCheckoutOrder(order);
    } finally {
      setIsStartingPayment(false);
    }
  };

  // A8.7: the checkout sheet's own result is advisory only -- used to
  // decide when to close it and refetch. Only a server-confirmed
  // fee_payment_status (via the webhook) is ever treated as proof of
  // payment; see RazorpayCheckoutSheet's own header comment.
  const handleCheckoutClose = (_result: RazorpayCheckoutResult) => {
    setCheckoutOrder(null);
    onPaymentUpdated?.();
  };

  const handleCashSettle = async () => {
    if (isSimulating) return;
    setMethodSheetOpen(false);
    const feeLabel = formatAmount(bid.platform_fee_amount);
    const confirmed = await confirmDialog({
      title: "Pay Marketplace fee with cash",
      message: `Record ${feeLabel} as cash paid to Pulse? This unlocks Assign.`,
      confirmLabel: "Confirm cash paid",
    });
    if (!confirmed) return;
    setIsSimulating(true);
    try {
      const { error } = await settleMarketplaceFeeAsCash(bid.id);
      if (error) {
        showAppAlert("Could not record fee", error.message);
        return;
      }
      onPaymentUpdated?.();
    } finally {
      setIsSimulating(false);
    }
  };

  const handleStartTestPayment = async (provider: TestMarketplaceFeeProvider) => {
    if (provider === "cash") {
      await handleCashSettle();
      return;
    }
    if (isStartingTestPayment) return;
    if (bid.fee_payment_status === "pending") {
      setMethodSheetOpen(false);
      setTestOrder({
        provider,
        amount: Number(bid.platform_fee_amount) || 0,
      });
      return;
    }
    setIsStartingTestPayment(true);
    try {
      const { error, order } = await createTestMarketplaceFeeOrder(bid.id, provider);
      if (error || !order) {
        showAppAlert("Could not start payment", error?.message ?? "Please try again.");
        return;
      }
      setMethodSheetOpen(false);
      setTestOrder({ provider, amount: order.amount });
    } finally {
      setIsStartingTestPayment(false);
    }
  };

  // Used by the plain Cash confirm sheet -- clears testOrder itself once done.
  const handleSimulateOutcome = async (outcome: "paid" | "failed") => {
    if (isSimulating) return;
    setIsSimulating(true);
    try {
      const { error } = await simulateTestMarketplaceFeePayment(bid.id, outcome);
      if (error) {
        showAppAlert("Simulation failed", error.message);
        return;
      }
    } finally {
      setIsSimulating(false);
      setTestOrder(null);
      onPaymentUpdated?.();
    }
  };

  // Used by RazorpayTestPreviewSheet -- does NOT clear testOrder itself, so
  // the preview sheet can show its own success/failure screen and close
  // only when the user dismisses it.
  const handlePreviewOutcome = async (outcome: "paid" | "failed"): Promise<{ error: Error | null }> => {
    const { error } = await simulateTestMarketplaceFeePayment(bid.id, outcome);
    if (!error) {
      onPaymentUpdated?.();
    }
    return { error };
  };

  // Open the fleet step directly. A trip lookup here competed with the
  // driver and vehicle lists, then replaced this screen with a second load.
  const handleAssignVehicle = () => {
    if (!marketplaceFeeGateSatisfied(bid.fee_payment_status)) {
      setMethodSheetOpen(true);
      return;
    }
    const viewerOrgId = (orgId ?? "").trim();
    if (viewerOrgId) {
      setInitialIndentForDetail(indentRowFromOrgMarketBid(bid, viewerOrgId));
    }
    router.push(ROUTES.indentAllocation(bid.indent_id, "vehicle") as never);
  };

  const statusPill = (
    <View
      style={[
        styles.statusPill,
        isAccepted && styles.statusPillAccepted,
        isRejected && styles.statusPillRejected,
      ]}
    >
      <Text
        style={[
          styles.statusText,
          isAccepted && styles.statusTextAccepted,
          isRejected && styles.statusTextRejected,
        ]}
      >
        {statusLabel(bid.status).toUpperCase()}
      </Text>
    </View>
  );

  const actionButton = (
    <>
      {isAccepted && feeGateSatisfied ? (
        <Pressable
          onPress={handleAssignVehicle}
          style={({ pressed }) => [
            styles.assignCta,
            pressed && styles.assignRowPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Assign vehicle"
        >
          <Text style={styles.assignCtaText} numberOfLines={1}>
            Assign
          </Text>
          <ChevronRight size={13} color={Theme.positive} strokeWidth={2.4} />
        </Pressable>
      ) : null}
      {isAccepted && !feeGateSatisfied && canPay ? (
        <Pressable
          onPress={() => setMethodSheetOpen(true)}
          disabled={isStartingPayment || isSimulating}
          style={({ pressed }) => [styles.payButton, pressed && styles.assignRowPressed]}
        >
          <Text style={styles.payButtonText} numberOfLines={1}>
            {isStartingPayment || isSimulating
              ? "Working…"
              : bid.fee_payment_status === "pending"
                ? "Complete payment"
                : "Pay fee"}
          </Text>
        </Pressable>
      ) : null}
    </>
  );

  const footer = (
    <>
      {bid.note?.trim() ? (
        <Text style={styles.note} numberOfLines={1}>
          &ldquo;{bid.note.trim()}&rdquo;
        </Text>
      ) : null}

      {statusExplanation(bid.status) ? (
        <Text style={styles.note} numberOfLines={2}>
          {statusExplanation(bid.status)}
        </Text>
      ) : null}

      {isAccepted && !feeGateSatisfied ? (
        <Text style={styles.feeGateLabel} numberOfLines={2}>
          {feePendingLabel(bid.fee_payment_status, bid.platform_fee_amount)}
        </Text>
      ) : null}

      {checkoutOrder ? (
        <RazorpayCheckoutSheet
          visible
          orderId={checkoutOrder.orderId}
          amount={checkoutOrder.amount}
          currency={checkoutOrder.currency}
          keyId={checkoutOrder.keyId}
          description={`Marketplace fee — ${routeLabel(bid)}`}
          onClose={handleCheckoutClose}
        />
      ) : null}
      <PilotPaymentMethodSheet
        visible={methodSheetOpen}
        busy={isStartingPayment || isStartingTestPayment || isSimulating}
        onClose={() => setMethodSheetOpen(false)}
        onRazorpay={() => {
          setMethodSheetOpen(false);
          void handlePay();
        }}
        onTestProvider={(provider) => void handleStartTestPayment(provider)}
      />
      <RazorpayTestPreviewSheet
        order={testOrder?.provider === "test_online" ? { amount: testOrder.amount } : null}
        onOutcome={handlePreviewOutcome}
        onDismiss={() => setTestOrder(null)}
      />
      <PilotTestCheckoutSheet
        order={testOrder?.provider === "cash" ? testOrder : null}
        busy={isSimulating}
        onCancel={() => setTestOrder(null)}
        onOutcome={(outcome) => void handleSimulateOutcome(outcome)}
      />

      <Text style={styles.submitted}>Submitted {formatSubmittedAt(bid.created_at)}</Text>
    </>
  );

  if (!nested) {
    const loadLine = [...specChips, dateLabel].filter(Boolean).join(" · ");
    const indentLabel = (bid.indent_number ?? "").trim() || bid.indent_id.slice(0, 8).toUpperCase();
    return (
      <View
        style={[
          styles.card,
          styles.poolCard,
          isDesktop && styles.cardDesktop,
          isAccepted && styles.cardAccepted,
          isRejected && styles.cardRejected,
        ]}
      >
        <View style={styles.poolStage}>
          <View style={styles.poolTop}>
            {identityRevealed ? (
              <View style={[styles.cardTopText, styles.laneTag]}>
                <PartyAvatar
                  name={shipper}
                  initialsColorSeed={bid.owner_organization_id ?? shipper}
                  entityType="client"
                  size={20}
                />
                <Text style={styles.poolTag} numberOfLines={1}>
                  {shipper.toUpperCase()} · {indentLabel}
                </Text>
              </View>
            ) : (
              <View style={[styles.cardTopText, styles.laneTag]} testID="marketplace-bid-lane-tag">
                <Layers size={12} color={Theme.primary} strokeWidth={2.4} />
                <Text style={styles.poolTag} numberOfLines={1}>
                  MARKETPLACE
                </Text>
              </View>
            )}
            {statusPill}
          </View>
          <View style={styles.poolRoute}>
            <View style={styles.poolRouteCol}>
              <Text style={styles.poolRouteLabel}>Pickup</Text>
              <RouteEndpointStack value={bid.pickup_area} primaryStyle={styles.poolCity} secondaryStyle={styles.poolArea} maxLinesPerItem={1} />
            </View>
            <View style={styles.poolArrow}>
              <ArrowRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
            </View>
            <View style={[styles.poolRouteCol, styles.poolRouteEnd]}>
              <Text style={[styles.poolRouteLabel, styles.poolAlignEnd]}>Drop</Text>
              <RouteEndpointStack value={bid.drop_location} align="end" primaryStyle={styles.poolCity} secondaryStyle={styles.poolArea} maxLinesPerItem={1} />
            </View>
          </View>
          <Text style={styles.poolVehicle} numberOfLines={1}>
            {loadLine || "Marketplace load"}
          </Text>
        </View>
        <View style={[styles.poolBody, styles.bidBody]}>
          {lanePreview ? (
            <Text
              style={[
                styles.laneStatus,
                lanePreview.tone === "reduced" && styles.laneStatusReduced,
                lanePreview.tone === "expired" && styles.laneStatusExpired,
              ]}
              accessibilityLabel={`Lane status, ${lanePreview.label}`}
            >
              {lanePreview.label}
            </Text>
          ) : null}
          <RateLines target={targetLabel} bid={formatAmount(bid.amount)} />
          {identityRevealed && phoneDisplay ? (
            <Text style={styles.contact} numberOfLines={1}>
              {phoneDisplay}
            </Text>
          ) : null}
          {isAccepted ? <View style={styles.bidActions}>{actionButton}</View> : null}
          {footer}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        isDesktop && !nested && styles.cardDesktop,
        nested && styles.cardNested,
        isAccepted && styles.cardAccepted,
        isRejected && styles.cardRejected,
      ]}
    >
      <View style={styles.cardTop}>
        {identityRevealed ? (
          <>
            <PartyAvatar
              name={shipper}
              initialsColorSeed={bid.owner_organization_id ?? shipper}
              entityType="client"
              size={32}
            />
            <View style={styles.cardTopText}>
              <Text style={styles.orgName} numberOfLines={1}>
                {shipper}
              </Text>
              <Text style={styles.metaLine} numberOfLines={1}>
                {(bid.indent_number ?? "").trim() || bid.indent_id.slice(0, 8).toUpperCase()}
              </Text>
            </View>
          </>
        ) : (
          <View style={[styles.cardTopText, styles.laneTag]} testID="marketplace-bid-lane-tag">
            <Layers size={12} color={Theme.primary} strokeWidth={2.4} />
            <Text style={styles.laneTagText} numberOfLines={1}>
              MARKETPLACE
            </Text>
          </View>
        )}
        {statusPill}
      </View>

      <MarketplaceRouteGrid pickup={bid.pickup_area} drop={bid.drop_location} />
      {lanePreview ? (
        <Text
          style={[
            styles.laneStatus,
            lanePreview.tone === "reduced" && styles.laneStatusReduced,
            lanePreview.tone === "expired" && styles.laneStatusExpired,
          ]}
          accessibilityLabel={`Lane status, ${lanePreview.label}`}
        >
          {lanePreview.label}
        </Text>
      ) : null}
      <MarketplaceSpecChips chips={specChips} dateLabel={dateLabel} />

      <View style={styles.cardFooter}>
        <View style={styles.rateBlock}>
          <Text style={styles.rateLabel}>Your bid</Text>
          <Text style={styles.amount}>{formatAmount(bid.amount)}</Text>
          {identityRevealed && phoneDisplay ? (
            <Text style={styles.contact} numberOfLines={1}>
              {phoneDisplay}
            </Text>
          ) : null}
        </View>
        {actionButton}
      </View>

      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { padding: 24, alignItems: "center" },
  message: { fontSize: 14, color: Theme.textSecondary },
  empty: {
    marginVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: Theme.cardWhite,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: Theme.textPrimaryDark },
  emptyBody: { fontSize: 13, lineHeight: 18, color: Theme.textSecondary, textAlign: "center" },
  listContent: { paddingTop: 4, paddingBottom: 32, gap: 16 },
  focusRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  focusRowDesktop: { maxWidth: 480 },
  focusTab: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  focusTabOn: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
  },
  focusTabPressed: { opacity: 0.85 },
  focusHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  focusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  focusIconOn: { backgroundColor: Theme.separatorDark },
  focusCount: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  focusLabel: { fontSize: 13, lineHeight: 17, fontWeight: "600", color: Theme.textSecondary },
  focusCaption: { fontSize: 11, lineHeight: 14, fontWeight: "500", color: Theme.textMuted },
  focusOnText: { color: Theme.textOnPrimary },
  focusOnMuted: { color: Theme.textOnDarkMuted },
  sliceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sliceTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  sliceTabOn: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
  },
  sliceLabel: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  sliceCount: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary, fontVariant: ["tabular-nums"] },
  sliceLabelOn: { color: Theme.textOnPrimary },
  section: { gap: 8 },
  sectionGrid: { gap: 12 },
  sectionGridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.textMuted,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    gap: 12,
    overflow: "hidden",
    padding: 14,
    ...Platform.select({
      web: { boxSizing: "border-box" } as object,
      default: {},
    }),
  },
  cardDesktop: {
    width: "calc((100% - 24px) / 3)" as unknown as number,
    maxWidth: "calc((100% - 24px) / 3)" as unknown as number,
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 0,
    ...Platform.select({
      web: { boxSizing: "border-box" } as object,
      default: {},
    }),
  },
  cardAccepted: {
    borderColor: Theme.positive,
    borderWidth: 1.5,
    backgroundColor: Theme.cardWhite,
  },
  cardRejected: { opacity: 0.8 },
  laneTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  laneTagText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.primaryText,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardTopText: { flex: 1, minWidth: 0, gap: 2 },
  orgName: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  metaLine: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
  },
  rateBlock: { gap: 1, flex: 1, minWidth: 0 },
  rateLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  amount: { fontSize: 16, fontWeight: "700", color: Theme.primary, letterSpacing: -0.3 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    flexShrink: 0,
  },
  statusPillAccepted: { backgroundColor: Theme.positiveMuted },
  statusPillRejected: { backgroundColor: Theme.negativeMuted },
  statusText: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  statusTextAccepted: { color: Theme.positive },
  statusTextRejected: { color: Theme.negative },
  contact: { fontSize: 11, fontWeight: "600", color: Theme.primaryText, marginTop: 2 },
  note: { fontSize: 12, fontStyle: "italic", color: Theme.textSecondary },
  submitted: { fontSize: 11, color: Theme.textMuted },
  laneStatus: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  laneStatusReduced: { color: Theme.primaryText },
  laneStatusExpired: { color: Theme.textMuted },
  poolCount: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  poolCard: { padding: 0, gap: 0 },
  poolStage: {
    margin: 6,
    borderRadius: 10,
    backgroundColor: Theme.brandBlueMist,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
  },
  poolTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  poolTag: { flex: 1, minWidth: 0, fontSize: 10, fontWeight: "700", letterSpacing: 0.3, color: Theme.primaryText },
  poolRoute: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  poolRouteCol: { flex: 1, minWidth: 0, gap: 1 },
  poolRouteEnd: { alignItems: "flex-end" },
  poolAlignEnd: { textAlign: "right", alignSelf: "stretch" },
  poolArrow: { width: 16, height: 14, marginTop: 14, alignItems: "center", justifyContent: "center" },
  poolRouteLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: Theme.primaryText },
  poolCity: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: Theme.textPrimaryDark, letterSpacing: -0.2 },
  poolArea: { fontSize: 11, lineHeight: 14, fontWeight: "500", color: Theme.textSecondary },
  poolVehicle: { minHeight: 14, fontSize: 11, lineHeight: 14, fontWeight: "600", color: Theme.primaryText },
  poolBody: { paddingHorizontal: 6, paddingTop: 2, paddingBottom: 10, gap: 6 },
  bidBody: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, gap: 8 },
  bidActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  poolMetricRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32, gap: 6 },
  poolMetric: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
  poolMetricIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: Theme.brandBlueMist, alignItems: "center", justifyContent: "center" },
  poolMetricValue: { fontSize: 16, fontWeight: "700", letterSpacing: -0.3, color: Theme.textPrimaryDark },
  poolMetricUnit: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  poolBids: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  rateStack: { gap: 6 },
  poolTarget: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Theme.brandBlueMist,
  },
  poolTargetKicker: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: Theme.textMuted },
  poolTargetPrice: { fontSize: 13, fontWeight: "700", letterSpacing: -0.2, color: Theme.textPrimaryDark },
  cardNested: {
    width: "100%",
    maxWidth: "100%",
    borderRadius: 12,
    padding: 12,
    backgroundColor: Theme.surfaceLight,
  },
  assignCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  assignCtaText: { fontSize: 12, fontWeight: "800", color: Theme.positive },
  assignRowPressed: { opacity: 0.7 },
  feeGateLabel: { fontSize: 11, fontWeight: "600", color: Theme.warning },
  payButton: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Theme.darkBackground,
  },
  payButtonText: { fontSize: 12, fontWeight: "700", color: Theme.textOnPrimary },
});
