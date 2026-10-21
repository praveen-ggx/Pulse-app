/**
 * Live bid card — Load Detail Hub style.
 * Carrier header + amount + 3-metric footer (Target · Margin · VS Target).
 * Selection drives Counter Offer + Award Bid actions and the sticky Award footer.
 */
import { memo, useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { EntityAvatar } from "@/components/EntityAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type { IndentBidBadge } from "@/features/indents/utils/bidding/indentLiveBids.util";
import {
  bidMarginFromClient,
  buildIndentBidFooterInsight,
} from "@/features/indents/utils/bidding/indentLiveBids.util";
import {
  indentHubCardShadow,
} from "@/features/indents/styles/indentReviewHubStyles";
import type { IndentBidAlertInfo } from "@/features/indents/utils/bidding/indentBidAlert.util";
import { formatINR } from "@/lib/format";

export interface IndentLiveBidCardProps {
  quote: DirectQuoteRow;
  badges?: IndentBidBadge[];
  alertInfo?: IndentBidAlertInfo | null;
  selected?: boolean;
  disabled?: boolean;
  clientPriceInr?: number;
  targetRateInr?: number;
  highestPendingAmount?: number | null;
  pendingCount?: number;
  /** True when the bidder is already an integrated partner of the viewing org */
  isConnectedPartner?: boolean;
  onPress?: () => void;
  /** Owner: open counter-offer keypad for this bid */
  onCounterOffer?: () => void;
  /** @deprecated Award lives on the sticky footer — ignored on the card. */
  onAwardBid?: () => void;
  awarding?: boolean;
  /** Mobile stacked: denser row; Counter still available when selected. */
  minimal?: boolean;
}

const AVATAR_SIZE = 28;
const AVATAR_SIZE_MINIMAL = 30;

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

function badgeStyle(kind: IndentBidBadge["kind"]) {
  switch (kind) {
    case "recommended":
      return styles.badgeRecommended;
    case "lowest":
      return styles.badgeLowest;
    case "at_target":
      return styles.badgeTarget;
    case "awarded":
      return styles.badgeAwarded;
    case "deal_lost":
      return styles.badgeDealLost;
    default:
      return styles.badgeLowest;
  }
}

function badgeTextStyle(kind: IndentBidBadge["kind"]) {
  switch (kind) {
    case "recommended":
      return styles.badgeTextRecommended;
    case "lowest":
      return styles.badgeTextLowest;
    case "at_target":
      return styles.badgeTextTarget;
    case "awarded":
      return styles.badgeTextAwarded;
    case "deal_lost":
      return styles.badgeTextDealLost;
    default:
      return styles.badgeTextLowest;
  }
}

export const IndentLiveBidCard = memo(function IndentLiveBidCard({
  quote,
  badges = [],
  alertInfo = null,
  selected = false,
  disabled = false,
  clientPriceInr = 0,
  targetRateInr = 0,
  highestPendingAmount = null,
  pendingCount = 0,
  isConnectedPartner = false,
  onPress,
  onCounterOffer,
  onAwardBid: _onAwardBid,
  awarding: _awarding = false,
  minimal = false,
}: IndentLiveBidCardProps) {
  void _onAwardBid;
  void _awarding;
  const partyName =
    (quote.bidder_organization_name ?? "Supplier").trim() || "Supplier";
  const isDriverDirectOffer = quote.offer_source === "driver_direct_bid";
  const avatarEntityType = isDriverDirectOffer ? "driver" : "supplier";
  const avatarProps = {
    name: partyName,
    avatarUrl: quote.bidder_avatar_url ?? null,
    avatarSeed: quote.bidder_avatar_seed ?? null,
    initialsColorSeed:
      quote.bidder_organization_id || quote.id || partyName,
    entityType: avatarEntityType as "driver" | "supplier",
    showIntegrationBadge: false as const,
  };
  const amount = Number(quote.amount ?? 0);
  const amountDisplay = stripCurrencyPrefix(formatINR(amount));
  const status = (quote.status ?? "pending").toLowerCase();
  const counterAmount =
    quote.counter_amount != null && Number(quote.counter_amount) > 0
      ? Number(quote.counter_amount)
      : null;
  const isCountered = counterAmount != null && status === "pending";
  const isAccepted = status === "accepted";
  const isRejected = status === "rejected";
  const isWithdrawn = status === "withdrawn";
  const isDealLost =
    status === "superseded" || Boolean(quote.bidderUnavailable);
  const statusLabel = isAccepted
    ? "Awarded"
    : isRejected
      ? "Rejected"
      : isWithdrawn
        ? "Withdrawn"
        : isDealLost
          ? "Deal lost"
          : isCountered
            ? "Countered"
            : "Pending";
  const submitted = timeAgo(quote.created_at ?? quote.updated_at);

  const margin = useMemo(
    () => bidMarginFromClient(clientPriceInr, amount),
    [amount, clientPriceInr],
  );
  const vsTarget = targetRateInr > 0 && amount > 0 ? amount - targetRateInr : null;
  const isLowest =
    !isDealLost &&
    !isRejected &&
    !isWithdrawn &&
    (badges.some((b) => b.kind === "lowest" || b.kind === "recommended") ||
      (vsTarget != null && vsTarget <= 0));

  const footerInsight = useMemo(
    () =>
      buildIndentBidFooterInsight({
        amount,
        clientPriceInr,
        targetRateInr,
        highestPendingAmount,
        badges,
        pendingCount,
        status,
      }),
    [
      amount,
      badges,
      clientPriceInr,
      highestPendingAmount,
      pendingCount,
      status,
      targetRateInr,
    ],
  );

  const hasCardActions = Boolean(onCounterOffer);
  const selectedHint =
    footerInsight?.recommendation ??
    (isLowest ? "At or below your target" : "Ready to award from footer");

  if (minimal) {
    const lowestBadge = badges.find(
      (b) => b.kind === "lowest" || b.kind === "recommended",
    );
    const targetLabel =
      targetRateInr > 0
        ? `Target · ₹ ${stripCurrencyPrefix(formatINR(targetRateInr))}`
        : null;
    const marginLabel =
      margin != null
        ? `Margin · ${margin.marginPct}%`
        : null;
    const statusToneLabel = selected && !disabled && !isAccepted
      ? "Selected"
      : lowestBadge && !isAccepted && !isRejected
        ? lowestBadge.label
        : statusLabel;

    const minimalContent = (
      <View
        style={[
          styles.minimalCard,
          selected && styles.minimalCardSelected,
          disabled && styles.cardDisabled,
          isAccepted && styles.cardAwarded,
          isRejected && styles.cardRejected,
          isDealLost && styles.cardDealLost,
        ]}
      >
        <View style={styles.minimalTop}>
          <EntityAvatar
            {...avatarProps}
            size={AVATAR_SIZE_MINIMAL}
          />
          <View style={styles.minimalBody}>
            <View style={styles.minimalNameRow}>
              <Text style={styles.minimalName} numberOfLines={1}>
                {partyName}
              </Text>
              {isConnectedPartner ? (
                <View style={styles.partnerPill}>
                  <Text style={styles.partnerPillText}>Verified</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.minimalMeta} numberOfLines={1}>
              {isConnectedPartner ? "Network supplier" : "Marketplace"}
              {submitted ? ` · ${submitted}` : ""}
            </Text>
          </View>
          <View
            style={[
              styles.minimalStatusPill,
              isAccepted && styles.statusPillAwarded,
              isRejected && styles.statusPillRejected,
              isCountered && styles.statusPillCountered,
              !isAccepted &&
                !isRejected &&
                !isCountered &&
                styles.statusPillPending,
              selected && !disabled && styles.statusPillSelected,
            ]}
          >
            <Text
              style={[
                styles.minimalStatusText,
                isAccepted && styles.statusTextAwarded,
                isRejected && styles.statusTextRejected,
                isCountered && styles.statusTextCountered,
                !isAccepted &&
                  !isRejected &&
                  !isCountered &&
                  styles.statusTextPending,
                selected && !disabled && styles.statusTextSelected,
              ]}
              numberOfLines={1}
            >
              {statusToneLabel}
            </Text>
          </View>
        </View>

        <View style={styles.minimalCommerce}>
          <View style={styles.minimalAmountCol}>
            <Text style={styles.minimalBidLabel}>Bid</Text>
            <Text
              style={[
                styles.minimalAmount,
                isLowest && !isRejected && styles.minimalAmountGreen,
              ]}
              numberOfLines={1}
            >
              ₹ {amountDisplay}
            </Text>
            {isCountered ? (
              <Text style={styles.minimalRef} numberOfLines={1}>
                Counter · ₹ {stripCurrencyPrefix(formatINR(counterAmount!))}
              </Text>
            ) : targetLabel || marginLabel ? (
              <Text style={styles.minimalRef} numberOfLines={1}>
                {[targetLabel, marginLabel].filter(Boolean).join("  ·  ")}
              </Text>
            ) : null}
          </View>
          {selected && !disabled && onCounterOffer ? (
            <TouchableOpacity
              style={styles.minimalCounterBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                onCounterOffer();
              }}
              activeOpacity={0.85}
              accessibilityLabel={
                isCountered ? "Update counter offer" : "Counter offer"
              }
              hitSlop={Layout.touchTargetHitSlop}
            >
              <Text style={styles.minimalCounterBtnText}>
                {isCountered ? "Update" : "Counter"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );

    if (onPress) {
      return (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ selected, disabled }}
        >
          {minimalContent}
        </Pressable>
      );
    }
    return minimalContent;
  }

  const content = (
    <View
      style={[
        styles.card,
        indentHubCardShadow as ViewStyle,
        selected && styles.cardSelected,
        disabled && styles.cardDisabled,
        isAccepted && styles.cardAwarded,
        isRejected && styles.cardRejected,
        isDealLost && styles.cardDealLost,
      ]}
    >
      {selected && !disabled && !isAccepted && !isRejected ? (
        <View style={styles.selectedAccent} pointerEvents="none" />
      ) : null}
      <View style={styles.topSection}>
        <View style={styles.avatarWrap}>
          <EntityAvatar
            {...avatarProps}
            size={AVATAR_SIZE}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.partyName} numberOfLines={1}>
              {partyName}
            </Text>
            {isConnectedPartner ? (
              <View style={styles.partnerPill}>
                <Text style={styles.partnerPillText}>Verified</Text>
              </View>
            ) : (
              <View style={[styles.partnerPill, styles.partnerPillMarket]}>
                <Text
                  style={[styles.partnerPillText, styles.partnerPillTextMarket]}
                >
                  Marketplace
                </Text>
              </View>
            )}
          </View>

          {badges.length > 0 ? (
            <View style={styles.badgeRow}>
              {badges.slice(0, 2).map((badge) => (
                <View
                  key={`${quote.id}-${badge.kind}`}
                  style={[styles.badge, badgeStyle(badge.kind)]}
                >
                  <Text style={[styles.badgeText, badgeTextStyle(badge.kind)]}>
                    {badge.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

          <View style={styles.amountCol}>
          <View style={styles.amountHero}>
            <Text style={styles.amountCurrency}>₹</Text>
            <Text
              style={[
                styles.amount,
                isLowest && !isRejected && styles.amountGreen,
              ]}
              numberOfLines={1}
            >
              {amountDisplay}
            </Text>
          </View>
          <View style={styles.statusMeta}>
            <View
              style={[
                styles.statusPill,
              !isAccepted &&
                !isRejected &&
                !isCountered &&
                !isDealLost &&
                styles.statusPillPending,
              isAccepted && styles.statusPillAwarded,
              isRejected && styles.statusPillRejected,
              isDealLost && styles.statusPillDealLost,
              isCountered && styles.statusPillCountered,
                status === "pending" &&
                  !isCountered &&
                  !isDealLost &&
                  selected &&
                  styles.statusPillSelected,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  !isAccepted &&
                    !isRejected &&
                    !isCountered &&
                    !isDealLost &&
                    styles.statusTextPending,
                  isAccepted && styles.statusTextAwarded,
                  isRejected && styles.statusTextRejected,
                  isDealLost && styles.statusTextDealLost,
                  isCountered && styles.statusTextCountered,
                  status === "pending" &&
                    !isCountered &&
                    selected &&
                    styles.statusTextSelected,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
            {submitted ? (
              <Text style={styles.submittedText}>{submitted}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {targetRateInr > 0 || margin || vsTarget != null ? (
        <View style={styles.metricsBar}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Target rate</Text>
            <Text style={styles.metricValue} numberOfLines={1}>
              {targetRateInr > 0
                ? `₹ ${stripCurrencyPrefix(formatINR(targetRateInr))}`
                : "—"}
            </Text>
            {isLowest && !isRejected ? (
              <View style={styles.metricHintRow}>
                <FontAwesome
                  name="check-circle"
                  size={9}
                  color={Theme.success}
                />
                <Text style={styles.metricHint} numberOfLines={1}>
                  At / below
                </Text>
              </View>
            ) : (
              <View style={styles.metricHintSpacer} />
            )}
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Net margin</Text>
            <Text
              style={[
                styles.metricValue,
                margin && margin.marginInr >= 0
                  ? styles.metricPositive
                  : styles.metricNegative,
              ]}
              numberOfLines={1}
            >
              {margin
                ? `₹ ${stripCurrencyPrefix(formatINR(margin.marginInr))} · ${margin.marginPct}%`
                : "—"}
            </Text>
            <View style={styles.metricHintSpacer} />
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Vs target</Text>
            <Text
              style={[
                styles.metricValue,
                vsTarget != null && vsTarget <= 0
                  ? styles.metricPositive
                  : styles.metricNegative,
              ]}
              numberOfLines={1}
            >
              {vsTarget == null
                ? "—"
                : vsTarget <= 0
                  ? `₹ ${stripCurrencyPrefix(formatINR(Math.abs(vsTarget)))} under`
                  : `₹ ${stripCurrencyPrefix(formatINR(vsTarget))} over`}
            </Text>
            <View style={styles.metricHintSpacer} />
          </View>
        </View>
      ) : null}

      {isDealLost ? (
        <View style={styles.dealLostStrip}>
          <Text style={styles.dealLostStripText}>
            Not available — awarded another load
          </Text>
        </View>
      ) : selected && !disabled && !isAccepted && !isRejected ? (
        hasCardActions ? (
          <View style={styles.actionStrip}>
            <View style={styles.actionLeft}>
              <FontAwesome
                name="check-circle"
                size={12}
                color={Theme.positive}
              />
              <Text style={styles.actionLeftText} numberOfLines={1}>
                {isCountered
                  ? `Countered · ₹ ${stripCurrencyPrefix(formatINR(counterAmount!))}`
                  : "Selected · send a counter or award below"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.counterBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                onCounterOffer?.();
              }}
              activeOpacity={0.85}
              accessibilityLabel={
                isCountered ? "Update counter offer" : "Counter offer"
              }
              hitSlop={Layout.touchTargetHitSlop}
            >
              <Text style={styles.counterBtnText}>
                {isCountered ? "Update" : "Counter"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.selectedStrip}>
            <FontAwesome name="check-circle" size={12} color={Theme.positive} />
            <Text style={styles.selectedStripText}>{selectedHint}</Text>
          </View>
        )
      ) : null}

      {alertInfo ? (
        <View
          style={[
            styles.alertPanel,
            alertInfo.tone === "overdue" && styles.alertPanelOverdue,
            alertInfo.tone === "urgent" && styles.alertPanelUrgent,
            alertInfo.tone === "soon" && styles.alertPanelSoon,
          ]}
        >
          <FontAwesome
            name="clock-o"
            size={12}
            color={
              alertInfo.tone === "overdue"
                ? Theme.teslaRed
                : alertInfo.tone === "urgent"
                  ? Theme.warning
                  : Theme.accentGoldPressed
            }
          />
          <Text style={styles.alertText} numberOfLines={2}>
            {alertInfo.summaryLine ||
              [alertInfo.awardedAgoLabel, alertInfo.dueByLabel]
                .filter(Boolean)
                .join(" · ") ||
              "Action needed"}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressablePressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.pressable}>{content}</View>;
});

const styles = StyleSheet.create({
  pressable: {
    marginBottom: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  pressablePressed: {
    opacity: 0.96,
  },
  card: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    position: "relative",
  },
  cardSelected: {
    borderColor: Theme.primary,
    borderWidth: 1.5,
    backgroundColor: Theme.cardWhite,
  },
  selectedAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: Theme.primary,
    zIndex: 2,
  },
  cardAwarded: {
    borderColor: Theme.positiveMutedDarkBorder,
  },
  cardRejected: {
    borderColor: Theme.borderMedium,
    opacity: 0.86,
  },
  cardDealLost: {
    borderColor: Theme.borderMedium,
    opacity: 0.92,
  },
  cardDisabled: {
    opacity: 0.72,
  },
  topSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatarWrap: {
    width: AVATAR_SIZE + 2,
    height: AVATAR_SIZE + 2,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingRight: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  partyName: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0,
    color: Theme.gpayListTitle,
    flexShrink: 1,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  partnerPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: 1,
    borderColor: Theme.brandBlue,
  },
  partnerPillText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0,
    color: Theme.primary,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  partnerPillMarket: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderMedium,
  },
  partnerPillTextMarket: {
    color: Theme.gpayListSubtitle,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeRecommended: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.brandBlue,
  },
  badgeLowest: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderMedium,
  },
  badgeTarget: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderMedium,
  },
  badgeAwarded: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  badgeDealLost: {
    backgroundColor: Theme.negativeMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  badgeTextRecommended: { color: Theme.primary },
  badgeTextLowest: { color: Theme.gpayListSubtitle },
  badgeTextTarget: { color: Theme.gpayListSubtitle },
  badgeTextAwarded: { color: Theme.positive },
  badgeTextDealLost: { color: Theme.negative },
  amountCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
    flexShrink: 0,
    minWidth: 84,
  },
  amountHero: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 1,
  },
  amountCurrency: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.gpayListSubtitle,
  },
  amount: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0,
    maxWidth: 108,
    color: Theme.gpayListTitle,
    fontVariant: ["tabular-nums"],
  },
  amountGreen: {
    color: Theme.gpayAmountReceived,
  },
  statusMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  statusPillPending: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderMedium,
  },
  statusPillSelected: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.primary,
  },
  statusPillAwarded: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  statusPillRejected: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderMedium,
  },
  statusPillDealLost: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderMedium,
  },
  statusPillCountered: {
    backgroundColor: Theme.aggregatePillBg,
    borderColor: Theme.aggregatePillBorder,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0,
    color: Theme.textMuted,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  statusTextPending: { color: Theme.gpayListSubtitle },
  statusTextSelected: { color: Theme.primary },
  statusTextAwarded: { color: Theme.positive },
  statusTextRejected: { color: Theme.teslaRed },
  statusTextDealLost: { color: Theme.negative },
  statusTextCountered: { color: Theme.aggregatePillText },
  submittedText: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
  },
  metricsBar: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Theme.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  metricCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginVertical: 1,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0,
    color: Theme.gpayListSubtitle,
    marginBottom: 4,
    width: "100%",
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  metricValue: {
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    color: Theme.gpayListTitle,
    letterSpacing: 0,
    width: "100%",
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  metricPositive: {
    color: Theme.gpayAmountReceived,
  },
  metricNegative: {
    color: Theme.teslaRed,
  },
  metricHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
    minHeight: 12,
  },
  metricHint: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.positive,
    flexShrink: 1,
  },
  metricHintSpacer: {
    minHeight: 12,
    marginTop: 3,
  },
  actionStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Theme.cardWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  actionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
    minWidth: 0,
    flex: 1,
  },
  actionLeftText: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.gpayListSubtitle,
    flexShrink: 1,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  selectedStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.brandBlueSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.brandBlue,
  },
  selectedStripText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
    color: Theme.primary,
  },
  dealLostStrip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  dealLostStripText: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
    color: Theme.textMuted,
  },
  counterBtn: {
    height: 26,
    minWidth: 68,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  counterBtnText: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.actionBtnInk,
    letterSpacing: 0,
  },
  alertPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 10,
    marginBottom: 10,
    marginTop: 0,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  alertPanelOverdue: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.borderMedium,
  },
  alertPanelUrgent: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.borderMedium,
  },
  alertPanelSoon: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  alertText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.gpayListTitle,
  },
  minimalCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      web: {
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
      } as object,
      default: {},
    }),
  },
  minimalCardSelected: {
    borderColor: Theme.primary,
    borderWidth: 1.5,
    backgroundColor: Theme.cardWhite,
  },
  minimalTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  minimalBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  minimalNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  minimalName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.gpayListTitle,
    flexShrink: 1,
    letterSpacing: -0.15,
  },
  minimalMeta: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
  },
  minimalCommerce: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  minimalAmountCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  minimalBidLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.gpayListSubtitle,
  },
  minimalAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.gpayListTitle,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.25,
  },
  minimalAmountGreen: {
    color: Theme.gpayAmountReceived,
  },
  minimalRef: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
  },
  minimalStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surface,
    flexShrink: 0,
    maxWidth: "38%",
  },
  minimalStatusText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.35,
    color: Theme.textMuted,
  },
  minimalCounterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
    justifyContent: "center",
    flexShrink: 0,
  },
  minimalCounterBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.positive,
    letterSpacing: 0.15,
  },
});
