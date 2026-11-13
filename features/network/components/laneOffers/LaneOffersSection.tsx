/**
 * "On this lane": offers from the shipper's other open loads on the same lane
 * (pickup, drop, vehicle type) and live Network lane rates. Invite asks the
 * carrier to bid this load at the same rate; nothing is bid or awarded until
 * the carrier accepts. A lane rate is already a commitment, so it is added.
 */
import { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { EntityAvatar } from "@/components/EntityAvatar";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import {
  inviteLaneBidder,
  type LaneOffer,
} from "@/features/network/services/laneOffers.service";
import {
  laneOfferAction,
  laneOfferErrorMessage,
  laneOfferSourceLabel,
} from "@/features/network/utils/laneOffers.util";
import { showAppAlert } from "@/lib/appAlert";
import { formatINR } from "@/lib/format";
import {
  useInvalidateLaneOffers,
  useLaneOffersForIndentQuery,
} from "@/lib/queries/useLaneOffersQuery";

export interface LaneOffersSectionProps {
  indentId: string;
  /** Called for offers that need the load on Marketplace first. Resolves true when switched on. */
  onPostToMarketplace?: () => Promise<boolean>;
  /** Render nothing when the lane has no offers (Review Hub). */
  hideWhenEmpty?: boolean;
  title?: string;
  enabled?: boolean;
}

function channelPill(offer: LaneOffer): string {
  if (offer.kind === "pool_commitment") return "LANE RATE";
  return offer.channel === "network" ? "NETWORK" : "MARKET";
}

const LaneOfferRow = memo(function LaneOfferRow({
  offer,
  busy,
  onAction,
}: {
  offer: LaneOffer;
  busy: boolean;
  onAction: (offer: LaneOffer) => void;
}) {
  const amountLabel = formatINR(offer.amount);
  const action = laneOfferAction(offer, amountLabel);
  const isOrg = offer.bidder_type === "organization";
  const actionable = action.kind !== "status";
  return (
    <View style={styles.row}>
      <EntityAvatar
        name={offer.bidder_name}
        avatarUrl={null}
        avatarSeed={offer.bidder_organization_id ?? offer.offer_key}
        initialsColorSeed={offer.bidder_organization_id ?? offer.offer_key}
        entityType={isOrg ? "supplier" : "driver"}
        showIntegrationBadge={false}
        size={28}
      />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {offer.bidder_name}
          </Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{channelPill(offer)}</Text>
          </View>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {laneOfferSourceLabel(offer)}
        </Text>
      </View>
      <View style={styles.amountCol}>
        <Text style={styles.amount} numberOfLines={1}>
          {amountLabel}
        </Text>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            actionable ? styles.actionBtnPrimary : styles.actionBtnStatic,
            busy && styles.actionBtnBusy,
          ]}
          onPress={() => onAction(offer)}
          disabled={!actionable || busy}
          activeOpacity={0.85}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={`${action.label} — ${offer.bidder_name}`}
        >
          {busy ? (
            <LoadingIndicator size="small" color={Theme.textOnPrimary} />
          ) : (
            <Text
              style={actionable ? styles.actionTextPrimary : styles.actionTextStatic}
              numberOfLines={1}
            >
              {action.label}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

export function LaneOffersSection({
  indentId,
  onPostToMarketplace,
  hideWhenEmpty = true,
  title = "On this lane",
  enabled = true,
}: LaneOffersSectionProps) {
  const query = useLaneOffersForIndentQuery(indentId, { enabled });
  const invalidate = useInvalidateLaneOffers();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const first = query.data?.pages[0] ?? null;
  const offers = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  const handleAction = useCallback(
    async (offer: LaneOffer) => {
      const action = laneOfferAction(offer, formatINR(offer.amount));
      if (action.kind === "status") return;
      setBusyKey(offer.offer_key);
      try {
        if (action.kind === "post_to_marketplace") {
          if (!onPostToMarketplace) {
            showAppAlert("Post to Marketplace", laneOfferErrorMessage(new Error("needs_marketplace")));
            return;
          }
          const switched = await onPostToMarketplace();
          if (switched) invalidate(indentId);
          return;
        }
        const { error, result } = await inviteLaneBidder(indentId, offer);
        if (error) {
          showAppAlert("Could not send", laneOfferErrorMessage(error));
          return;
        }
        invalidate(indentId);
        if (result?.kind === "pool_commitment") {
          showAppAlert(
            result.attached ? "Lane rate added" : "Already on this load",
            result.attached
              ? `${offer.bidder_name}'s lane rate of ${formatINR(offer.amount)} is now an offer on this load.`
              : `${offer.bidder_name} already has an offer on this load.`,
            { tone: "success" },
          );
        } else {
          showAppAlert(
            "Rate request sent",
            `${offer.bidder_name} can accept ${formatINR(offer.amount)} on this load with one tap. You'll see it in Live bids once they accept.`,
            { tone: "success" },
          );
        }
      } finally {
        setBusyKey(null);
      }
    },
    [indentId, invalidate, onPostToMarketplace],
  );

  if (query.isLoading) {
    return hideWhenEmpty ? null : (
      <View style={styles.wrap}>
        <Text style={styles.title}>{title}</Text>
        <LoadingIndicator size="small" color={Theme.primary} />
      </View>
    );
  }
  if (query.isError) {
    return hideWhenEmpty ? null : (
      <View style={styles.wrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{laneOfferErrorMessage(query.error as Error)}</Text>
      </View>
    );
  }
  const total = first?.total_count ?? 0;
  if (total === 0 && hideWhenEmpty) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{total}</Text>
      </View>
      <Text style={styles.subtitle}>
        Offers on your other open loads with the same pickup, drop and vehicle.
      </Text>
      {total === 0 ? (
        <Text style={styles.meta}>No offers on this lane yet.</Text>
      ) : (
        <View style={styles.list}>
          {offers.map((offer) => (
            <LaneOfferRow
              key={offer.offer_key}
              offer={offer}
              busy={busyKey === offer.offer_key}
              onAction={(o) => void handleAction(o)}
            />
          ))}
        </View>
      )}
      {query.hasNextPage ? (
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          accessibilityRole="button"
          accessibilityLabel="Load more lane offers"
        >
          {query.isFetchingNextPage ? (
            <LoadingIndicator size="small" color={Theme.primary} />
          ) : (
            <Text style={styles.moreText}>
              Load more ({Math.max(total - offers.length, 0)} left)
            </Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingVertical: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.gpayListTitle,
    textTransform: "uppercase",
  },
  count: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  subtitle: {
    fontSize: 11,
    color: Theme.gpayListSubtitle,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
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
  name: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.gpayListTitle,
    flexShrink: 1,
  },
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.aggregatePillBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.aggregatePillBorder,
  },
  pillText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.aggregatePillText,
  },
  meta: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.gpayListSubtitle,
  },
  amountCol: {
    alignItems: "flex-end",
    gap: 6,
    flexShrink: 0,
  },
  amount: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.gpayListTitle,
    fontVariant: ["tabular-nums"],
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPrimary: {
    backgroundColor: Theme.darkBackground,
  },
  actionBtnStatic: {
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  actionBtnBusy: {
    opacity: 0.6,
  },
  actionTextPrimary: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  actionTextStatic: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  moreBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
});
