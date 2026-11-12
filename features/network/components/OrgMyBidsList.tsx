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
import { MarketplaceBidPoolCard } from "@/features/network/components/pooled/MarketplaceBidPoolCard";
import {
  type FeePaymentStatus,
  type MyOrgMarketBidRow,
  type MyOrgMarketBidStatus,
} from "@/features/network/services/findLoadsForOrg.service";
import { buildMarketplaceBidPools } from "@/features/network/utils/marketplaceBidPools.util";
import { formatStoryDate } from "@/features/network/utils/storyDisplay";
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
import { ChevronRight, Inbox, Layers } from "lucide-react-native";
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

export function OrgMyBidsList({
  bids,
  isLoading,
  orgId,
  onPaymentUpdated,
}: {
  bids: MyOrgMarketBidRow[];
  isLoading: boolean;
  orgId?: string | null;
  /** A8.7: called after a checkout attempt closes, so the caller can refetch bids/loads. */
  onPaymentUpdated?: () => void;
}) {
  const groups = useMemo(() => {
    const pending: MyOrgMarketBidRow[] = [];
    const awarded: MyOrgMarketBidRow[] = [];
    const closed: MyOrgMarketBidRow[] = [];
    for (const b of bids) {
      if (b.status === "pending") pending.push(b);
      else if (b.status === "accepted") awarded.push(b);
      else closed.push(b);
    }
    return { pending, awarded, closed };
  }, [bids]);

  const router = useRouter();
  /** Pending / closed stay anonymous pool cards (Network Loads chrome). */
  const pendingPools = useMemo(
    () => buildMarketplaceBidPools(groups.pending),
    [groups.pending],
  );
  const closedPools = useMemo(
    () => buildMarketplaceBidPools(groups.closed),
    [groups.closed],
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Loading your bids…</Text>
      </View>
    );
  }

  if (bids.length === 0) {
    return (
      <View style={styles.empty}>
        <Inbox size={22} color={Theme.primary} />
        <Text style={styles.emptyTitle}>No bids yet</Text>
        <Text style={styles.emptyBody}>
          Bid on an open Marketplace load and it will show up here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.listContent}>
      {groups.awarded.length > 0 ? (
        <Section title="Awarded" count={groups.awarded.length}>
          {groups.awarded.map((b) => (
            <BidCard
              key={b.id}
              bid={b}
              orgId={orgId}
              onPaymentUpdated={onPaymentUpdated}
            />
          ))}
        </Section>
      ) : null}
      {pendingPools.length > 0 ? (
        <Section title="Pending" count={groups.pending.length}>
          {pendingPools.map((pool) => (
            <MarketplaceBidPoolCard
              key={pool.id}
              pool={pool}
              onReviseBid={
                pool.reviseKey
                  ? () => router.push(ROUTES.findLoadsPool(pool.reviseKey!) as never)
                  : undefined
              }
            />
          ))}
        </Section>
      ) : null}
      {closedPools.length > 0 ? (
        <Section title="Not selected" count={groups.closed.length}>
          {closedPools.map((pool) => (
            <MarketplaceBidPoolCard key={pool.id} pool={pool} />
          ))}
        </Section>
      ) : null}
    </View>
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
}: {
  bid: MyOrgMarketBidRow;
  orgId?: string | null;
  onPaymentUpdated?: () => void;
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

  return (
    <View
      style={[
        styles.card,
        isDesktop && styles.cardDesktop,
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
      </View>

      <MarketplaceRouteGrid pickup={bid.pickup_area} drop={bid.drop_location} />
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
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { padding: 24, alignItems: "center" },
  message: { fontSize: 14, color: Theme.textSecondary },
  empty: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: Theme.cardWhite,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: Theme.primaryText },
  emptyBody: { fontSize: 13, color: Theme.textSecondary, textAlign: "center" },
  listContent: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 32, gap: 14 },
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
    borderColor: Theme.surfaceBorder,
    padding: 14,
    backgroundColor: Theme.cardWhite,
    gap: 12,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxSizing: "border-box",
        boxShadow: `0 8px 20px ${Theme.actionAccentShadow}`,
      } as object,
      default: {
        shadowColor: Theme.primaryText,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  cardDesktop: {
    width: "calc((100% - 36px) / 4)" as unknown as number,
    maxWidth: "calc((100% - 36px) / 4)" as unknown as number,
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
