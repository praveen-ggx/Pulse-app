/**
 * Market bid card — Review Hub v1.
 * A DCO/fleet-owner bid placed directly on this indent (market_bids), shown
 * alongside Reach/direct-quote offers in the same "Offers" list. Deliberately
 * lighter than IndentLiveBidCard: no target/margin metrics bar, no counter-
 * offer — just who's bidding, what vehicle, how much, and Accept/Reject
 * wired straight to accept_market_bid()/reject_market_bid(). Not merged into
 * IndentLiveBidCard — different source, different actions, own component.
 */
import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import { indentHubCardShadow } from "@/features/indents/styles/indentReviewHubStyles";
import type { MarketBidForIndentRow } from "@/features/network/services/marketBids.service";
import { marketBidExpiryView } from "@/features/network/utils/marketBidExpiry.util";
import { formatINR } from "@/lib/format";
import { LoadingIndicator } from "@/components/LoadingIndicator";

export interface MarketBidCardProps {
  bid: MarketBidForIndentRow;
  /** Clock for expiry display; defaults to the device time at render. */
  nowMs?: number;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
}

function stripCurrencyPrefix(formatted: string): string {
  return formatted.replace(/^[^\d,.-]+/, "").trim() || formatted;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function vehicleSummary(bid: MarketBidForIndentRow): string | null {
  const parts = [bid.vehicle_number, bid.vehicle_brand, bid.vehicle_capacity].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export const MarketBidCard = memo(function MarketBidCard({
  bid,
  nowMs,
  busy = false,
  onAccept,
  onReject,
}: MarketBidCardProps) {
  const status = (bid.status || "pending").toLowerCase();
  const expiry = marketBidExpiryView(bid, nowMs ?? Date.now());
  const isExpired = expiry.kind === "expired";
  const isPending = status === "pending" && !isExpired;
  const isAccepted = status === "accepted";
  const isRejected = status === "rejected";
  // A6.4: 'superseded' is neither a business decision (rejected) nor a
  // driver withdrawal -- the driver was awarded a DIFFERENT load and this
  // bid became moot. Must not fall through to the unconditional "Pending"
  // default below.
  const isSuperseded = status === "superseded";
  const statusLabel = isAccepted
    ? "Accepted"
    : isRejected
      ? "Rejected"
      : status === "withdrawn"
        ? "Withdrawn"
          : isSuperseded
            ? "Deal lost"
            : isExpired
              ? "Expired"
              : isPending
                ? "Pending"
                : status;

  const amountDisplay = stripCurrencyPrefix(formatINR(Number(bid.amount ?? 0)));
  const submitted = timeAgo(bid.created_at);
  const vehicle = vehicleSummary(bid);
  const isOrgBidder = bid.bidder_type === "organization";
  const bidderLabel = isOrgBidder
    ? bid.bidder_organization_name ?? "Business"
    : bid.is_fleet_owner
      ? `Fleet owner (${bid.bidder_display_name})`
      : `Driver (${bid.bidder_display_name})`;
  const phoneDisplay = bid.bidder_phone ?? bid.bidder_masked_phone;

  return (
    <View
      style={[
        styles.card,
        indentHubCardShadow as object,
        isAccepted && styles.cardAccepted,
        isRejected && styles.cardRejected,
      ]}
    >
      <View style={styles.topRow}>
        <EntityAvatar
          name={isOrgBidder ? (bid.bidder_organization_name ?? "Business") : bid.bidder_display_name}
          avatarUrl={null}
          avatarSeed={isOrgBidder ? bid.bidder_organization_id : bid.bidder_user_id}
          initialsColorSeed={isOrgBidder ? bid.bidder_organization_id : bid.bidder_user_id}
          entityType={isOrgBidder ? "supplier" : "driver"}
          showIntegrationBadge={false}
          size={28}
        />
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.partyName} numberOfLines={1}>
              {bidderLabel}
            </Text>
            {isOrgBidder ? (
              <View style={styles.sourcePill}>
                <Text style={styles.sourcePillText}>BUSINESS</Text>
              </View>
            ) : null}
            <View style={styles.sourcePill}>
              <Text style={styles.sourcePillText}>MARKET</Text>
            </View>
          </View>
          {vehicle ? (
            <Text style={styles.vehicleText} numberOfLines={1}>
              {vehicle}
            </Text>
          ) : null}
          {phoneDisplay ? (
            <Text style={styles.vehicleText} numberOfLines={1}>
              {phoneDisplay}
              {!bid.bidder_phone ? " · revealed after award" : ""}
            </Text>
          ) : null}
        </View>
        <View style={styles.amountCol}>
          <Text style={styles.amount} numberOfLines={1}>
            ₹{amountDisplay}
          </Text>
          <View
            style={[
              styles.statusPill,
              isPending && styles.statusPillPending,
              isAccepted && styles.statusPillAccepted,
              isRejected && styles.statusPillRejected,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isPending && styles.statusTextPending,
                isAccepted && styles.statusTextAccepted,
                isRejected && styles.statusTextRejected,
              ]}
            >
              {statusLabel.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {bid.note?.trim() ? (
        <View style={styles.noteWrap}>
          <Text style={styles.noteText} numberOfLines={2}>
            &ldquo;{bid.note.trim()}&rdquo;
          </Text>
        </View>
      ) : null}

      {isSuperseded ? (
        <View style={styles.noteWrap}>
          <Text style={styles.noteText} numberOfLines={2}>
            Not available — awarded another load.
          </Text>
        </View>
      ) : null}

      <View style={styles.footerRow}>
        <View style={styles.footerMeta}>
          {submitted ? <Text style={styles.submittedText}>{submitted}</Text> : null}
          {expiry.kind !== "none" ? (
            <Text
              style={[styles.expiryText, isExpired && styles.expiryTextExpired]}
              numberOfLines={1}
            >
              {expiry.label}
            </Text>
          ) : null}
        </View>
        {isExpired && onAccept ? (
          <View style={styles.actionsRow}>
            {onReject ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={onReject}
                disabled={busy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Reject this Market bid"
              >
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
            ) : null}
            <View
              style={[styles.actionBtn, styles.acceptBtn, styles.actionBtnDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              accessibilityLabel="Accept unavailable, bid expired"
              testID="market-bid-accept-disabled"
            >
              <Text style={styles.acceptBtnText}>Accept</Text>
            </View>
          </View>
        ) : isPending && (onAccept || onReject) ? (
          <View style={styles.actionsRow}>
            {onReject ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={onReject}
                disabled={busy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Reject this Market bid"
              >
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
            ) : null}
            {onAccept ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn, busy && styles.actionBtnDisabled]}
                onPress={onAccept}
                disabled={busy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Accept this Market bid"
              >
                {busy ? (
                  <LoadingIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.acceptBtnText}>Accept</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 8,
  },
  cardAccepted: {
    borderColor: Theme.positiveMutedDarkBorder,
  },
  cardRejected: {
    borderColor: Theme.borderMedium,
    opacity: 0.86,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  partyName: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.gpayListTitle,
    flexShrink: 1,
  },
  sourcePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.aggregatePillBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.aggregatePillBorder,
  },
  sourcePillText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.aggregatePillText,
  },
  vehicleText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
  },
  amountCol: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  amount: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: Theme.gpayListTitle,
    fontVariant: ["tabular-nums"],
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  // A9.4: pending must read as "awaiting your decision", not "already won"
  // -- was identical to statusPillAccepted (same positiveMuted/positive
  // pair), which looked like success on a bid nobody has decided on yet.
  // Theme.warning/warningMuted is the same pairing InvitationsView.tsx
  // already uses for its own "pending" pill -- reused, not invented.
  statusPillPending: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.borderMedium,
  },
  statusPillAccepted: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  statusPillRejected: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderMedium,
  },
  statusText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.35,
    color: Theme.textMuted,
  },
  statusTextPending: { color: Theme.warning },
  statusTextAccepted: { color: Theme.positive },
  statusTextRejected: { color: Theme.teslaRed },
  noteWrap: {
    paddingHorizontal: 2,
  },
  noteText: {
    fontSize: 11,
    fontStyle: "italic",
    color: Theme.gpayListSubtitle,
    lineHeight: 15,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  submittedText: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
  },
  footerMeta: {
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  expiryText: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
  },
  expiryTextExpired: {
    fontWeight: "700",
    color: Theme.negative,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  rejectBtn: {
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  rejectBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  acceptBtn: {
    backgroundColor: Theme.darkBackground,
    minWidth: 72,
  },
  acceptBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
});
