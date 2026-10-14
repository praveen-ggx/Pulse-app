/**
 * AwardModal — Offer Hub for reviewing and awarding quotes.
 * Desktop/tablet (web ≥768): right-side drawer (same pattern as Update bid).
 * Mobile: bottom sheet.
 * Commercial truth (price, canAward, lifecycle) from resolveCommercialOpportunity().
 */
import Theme from "@/constants/Theme";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { getIndentDisplayNumber, type IndentRow } from "@/features/indents";
import { IndentCounterOfferEntry } from "@/features/indents/components/bidding/IndentCounterOfferEntry";
import { IndentLiveBidsPanel } from "@/features/indents/components/bidding/IndentLiveBidsPanel";
import { submitDirectQuoteCounterOffer } from "@/features/indents/services/direct-quotes.service";
import {
  indentReviewHubStyles,
  indentReviewHubText,
} from "@/features/indents/styles/indentReviewHubStyles";
import { resolveCommercialOpportunity } from "@/features/marketplace/domain";
import { type AwardQuoteResult } from "@/features/network/hooks/useAwardQuote";
import { submitDriverDirectBidCounterOffer } from "@/features/network/services/bids.service";
import { MarketBidCard } from "@/features/network/components/MarketBidCard";
import {
  awardMarketBid,
  calculateMarketplacePlatformFee,
  createMarketTripAfterFeePayment,
  rejectMarketBid,
  refundTestMarketplaceFeeAndRevokeIndent,
  revokeIndentAward,
} from "@/features/network/services/marketBids.service";
import { formatMarketplaceTransactionError } from "@/features/marketplace/utils/marketplaceErrorFormat.util";
import {
  awardRevokePresentation,
  TEST_FEE_REVOKE_REASON,
} from "@/features/marketplace/utils/testFeeRevoke.util";
import { indentHasAwardRevokedTag } from "@/features/trips/utils/indentHubCardPresentation";
import { useMarketBidsForIndentQuery } from "@/lib/queries/useBidsQuery";
import { useInvalidateIndents } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import { showAppAlert } from "@/lib/appAlert";
import { confirmDialog } from "@/lib/confirmDialog";
import { formatINR } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { X } from "lucide-react-native";

const LIFECYCLE_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Open Market",
  receiving_bids: "Receiving Bids",
  evaluating: "Evaluating",
  awarded: "Awarded",
  executing: "Executing",
  completed: "Completed",
};

interface AwardModalProps {
  visible: boolean;
  award: AwardQuoteResult;
  onViewIndent: (load: IndentRow) => void;
  insets: { top: number; bottom: number };
}

export function AwardModal({ visible, award, onViewIndent, insets }: AwardModalProps) {
  const queryClient = useQueryClient();

  const {
    currentLoad,
    selectedQuoteId,
    awarding,
    sortedQuotes,
    pendingCount,
    lowestPendingAmount,
    quotesLoading,
    connectedSupplierOrgIds,
  } = award;

  const [counterQuoteId, setCounterQuoteId] = useState<string | null>(null);
  const [submittingCounter, setSubmittingCounter] = useState(false);
  const [marketBidActionId, setMarketBidActionId] = useState<string | null>(null);
  const [revokingAward, setRevokingAward] = useState(false);
  const invalidateIndents = useInvalidateIndents();

  const {
    data: marketBids = [],
    isLoading: marketBidsLoading,
  } = useMarketBidsForIndentQuery(currentLoad?.id ?? null);

  const handleAcceptMarketBid = useCallback(
    async (bidId: string, amount: number, bidderLabel: string, bidderType: "dco" | "organization") => {
      const bidAmountLabel = `₹${Number(amount ?? 0).toLocaleString("en-IN")}`;

      // A9.2: the organization branch deliberately awards the indent
      // WITHOUT creating a trip -- the winning org still has to self-assign
      // a vehicle/driver via their own "My Bids" screen (OrgMyBidsList's
      // Assign Vehicle action) before a trip exists. A8.6.2: the DCO branch
      // no longer creates a trip immediately either -- award and trip
      // creation are now always separate steps, gated on the Marketplace
      // platform fee (paid, or not required while the fee stays off). The
      // confirm/success copy must not claim a trip is created up front.
      let message =
        bidderType === "organization"
          ? `Award this bid from ${bidderLabel} for ${bidAmountLabel}? The load will be assigned to their organization -- they'll need to assign a vehicle and driver before a trip is created. Any other pending offers on this load will be rejected.`
          : `Accept this bid from ${bidderLabel} for ${bidAmountLabel}? This rejects any other pending offers on this load.`;

      // A8.6.2: the platform fee is charged to the WINNING BIDDER, not the
      // awarding business -- the client/load value is unaffected. The
      // preview now renders for both bidder types (previously DCO-only,
      // when the fee was still added on top of the client price).
      const { calc } = await calculateMarketplacePlatformFee(amount);
      if (calc && calc.is_active_config_found && calc.resolved_fee > 0) {
        const feeLabel = `₹${Number(calc.resolved_fee).toLocaleString("en-IN")}`;
        message =
          `Bid amount ${bidAmountLabel}\n` +
          `Marketplace fee ${feeLabel} (paid by the winning bidder to Pulse)\n` +
          `Client/load value ${bidAmountLabel} (unchanged)\n\n` +
          (bidderType === "organization"
            ? `${bidderLabel} will need to pay this fee before they can assign a vehicle and driver. Any other pending offers on this load will be rejected.`
            : `${bidderLabel} will need to pay this fee before the trip is created. Any other pending offers on this load will be rejected.`);
      }

      const confirmed = await confirmDialog({
        title: bidderType === "organization" ? "Award Market bid" : "Accept Market bid",
        message,
        confirmLabel: bidderType === "organization" ? "Award" : "Accept",
        destructive: false,
      });
      if (!confirmed) return;
      try {
        setMarketBidActionId(bidId);
        const { error, feePaymentStatus } = await awardMarketBid(bidId);
        if (error) {
          showAppAlert("Could not accept bid", formatMarketplaceTransactionError(error.message));
          return;
        }

        // A8.6.2: when the fee isn't required (its current, default,
        // production state), chain trip creation immediately for a DCO
        // award so the business still experiences one "Accept" action --
        // create_market_trip_after_fee_payment() explicitly allows an
        // authorized member of the load-owning org to call it for exactly
        // this case. Once the fee is active, this chain is skipped and the
        // bidder unlocks their own trip after paying.
        let tripCreated = false;
        if (bidderType === "dco" && feePaymentStatus === "not_required") {
          const { error: tripError } = await createMarketTripAfterFeePayment(bidId);
          if (tripError) {
            showAppAlert("Could not accept bid", formatMarketplaceTransactionError(tripError.message));
            return;
          }
          tripCreated = true;
        }

        if (currentLoad?.id) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.bids.marketForIndent(currentLoad.id),
          });
        }
        if (currentLoad?.organization_id) {
          invalidateIndents(currentLoad.organization_id);
        }
        queryClient.invalidateQueries({ queryKey: ["indents", "offer-counts"] });

        if (feePaymentStatus === "required" || feePaymentStatus === "pending") {
          showAppAlert(
            "Bid awarded",
            bidderType === "organization"
              ? "The winning organization has been selected. Once they pay the Marketplace fee, they'll be able to assign a vehicle and driver."
              : "The bidder has been awarded this load. Once they pay the Marketplace fee, the trip will be created.",
          );
        } else if (bidderType === "organization") {
          showAppAlert(
            "Bid awarded",
            "The winning organization has been selected. They'll assign a vehicle and driver to create the trip.",
          );
        } else if (tripCreated) {
          showAppAlert("Bid accepted", "Trip created from this Market bid.");
        } else {
          showAppAlert("Bid accepted", "This bid has been awarded.");
        }
      } catch (e) {
        const msg = e instanceof Error ? formatMarketplaceTransactionError(e.message) : "Something went wrong. Please try again.";
        showAppAlert("Could not accept bid", msg);
      } finally {
        setMarketBidActionId(null);
      }
    },
    [currentLoad?.id, currentLoad?.organization_id, queryClient, invalidateIndents],
  );

  const revokePresentation = awardRevokePresentation(marketBids);
  const handleRevokeAward = useCallback(async () => {
    if (!currentLoad?.id || marketBidsLoading) return;
    const confirmed = await confirmDialog({
      title: revokePresentation.confirmTitle,
      message: revokePresentation.confirmMessage,
      confirmLabel: revokePresentation.confirmLabel,
      destructive: true,
    });
    if (!confirmed) return;
    try {
      setRevokingAward(true);
      const { error, awardRevokedAt } =
        revokePresentation.mode === "refund_test"
          ? await refundTestMarketplaceFeeAndRevokeIndent(
              currentLoad.id,
              TEST_FEE_REVOKE_REASON,
            )
          : await revokeIndentAward(currentLoad.id);
      if (error) {
        showAppAlert("Could not revoke award", formatMarketplaceTransactionError(error.message));
        return;
      }
      award.open({
        ...currentLoad,
        status: "open",
        assigned_supplier_id: null,
        assigned_supplier_rate: null,
        award_revoked_at: awardRevokedAt ?? new Date().toISOString(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.bids.marketForIndent(currentLoad.id),
      });
      queryClient.invalidateQueries({
        queryKey: ["indents", currentLoad.id, "direct-quotes"],
      });
      if (currentLoad.organization_id) {
        invalidateIndents(currentLoad.organization_id);
      }
      queryClient.invalidateQueries({ queryKey: ["indents", "offer-counts"] });
      showAppAlert(
        "Award revoked",
        "This load is open for bidding again. Award the same supplier or pick another offer.",
      );
    } catch (e) {
      const msg =
        e instanceof Error
          ? formatMarketplaceTransactionError(e.message)
          : "Something went wrong. Please try again.";
      showAppAlert("Could not revoke award", msg);
    } finally {
      setRevokingAward(false);
    }
  }, [award, currentLoad, invalidateIndents, marketBidsLoading, queryClient, revokePresentation]);

  const handleRejectMarketBid = useCallback(
    async (bidId: string, bidderLabel: string) => {
      const confirmed = await confirmDialog({
        title: "Reject Market bid",
        message: `Reject this bid from ${bidderLabel}?`,
        confirmLabel: "Reject",
        destructive: true,
      });
      if (!confirmed) return;
      try {
        setMarketBidActionId(bidId);
        const { error } = await rejectMarketBid(bidId);
        if (error) {
          showAppAlert("Could not reject bid", formatMarketplaceTransactionError(error.message));
          return;
        }
        if (currentLoad?.id) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.bids.marketForIndent(currentLoad.id),
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? formatMarketplaceTransactionError(e.message) : "Something went wrong. Please try again.";
        showAppAlert("Could not reject bid", msg);
      } finally {
        setMarketBidActionId(null);
      }
    },
    [currentLoad?.id, queryClient],
  );

  const opportunity = useMemo(() => {
    if (!currentLoad) return null;
    return resolveCommercialOpportunity({
      viewerOrgId: currentLoad.organization_id,
      ownerOrgId: currentLoad.organization_id,
      isLoad: true,
      indentStatus: currentLoad.status,
      postIsActive: true,
      bidCount: sortedQuotes.length,
      supplierTarget: currentLoad.supplier_target,
      currentBestBid: lowestPendingAmount,
      ownerEvaluating: pendingCount > 0,
    });
  }, [
    currentLoad,
    sortedQuotes.length,
    lowestPendingAmount,
    pendingCount,
  ]);

  const targetRateInr = opportunity?.pricing.displayPrice ?? null;
  const lifecycleLabel = opportunity
    ? LIFECYCLE_LABEL[opportunity.lifecycleState] ?? opportunity.lifecycleState
    : null;
  const loadStatusLower = (currentLoad?.status || "").trim().toLowerCase();
  const isAwardedView =
    loadStatusLower === "awarded" ||
    opportunity?.lifecycleState === "awarded";
  const showAwardRevokedTag = indentHasAwardRevokedTag(
    currentLoad?.status,
    currentLoad?.award_revoked_at,
  );

  const selectedIsPending = sortedQuotes.some(
    (q) =>
      q.id === selectedQuoteId && (q.status || "").toLowerCase() === "pending",
  );

  // Reach-only bidders may bid but may not be awarded until they accept a
  // supplier invite, so the primary action swaps to "Invite as supplier".
  const needsInvite =
    !!selectedQuoteId && selectedIsPending && award.selectedBidderNeedsInvite;
  const inviteSending = award.selectedBidderInviteStatus === "sending";
  const invitePending = award.selectedBidderInviteStatus === "pending";
  const inviteDisabled = inviteSending || invitePending;

  const canActOnBids =
    pendingCount > 0 && Boolean(opportunity?.permissions.canAward);

  const counterQuote =
    counterQuoteId != null
      ? (sortedQuotes.find((q) => q.id === counterQuoteId) ?? null)
      : null;

  const openCounterOffer = useCallback((quoteId: string) => {
    award.selectQuote(quoteId);
    setCounterQuoteId(quoteId);
  }, [award]);

  const handleSubmitCounter = useCallback(
    async (amount: number): Promise<boolean> => {
      if (!counterQuoteId || !currentLoad) return false;
      const offer =
        sortedQuotes.find((q) => q.id === counterQuoteId) ?? null;
      try {
        setSubmittingCounter(true);
        const { error } =
          offer?.offer_source === "driver_direct_bid"
            ? await submitDriverDirectBidCounterOffer(counterQuoteId, amount)
            : await submitDirectQuoteCounterOffer(counterQuoteId, amount);
        if (error) {
          showAppAlert("Could not send counter", error.message);
          return false;
        }
        setCounterQuoteId(null);
        queryClient.invalidateQueries({
          queryKey: ["indents", currentLoad.id, "direct-quotes"],
        });
        if (offer?.offer_source === "driver_direct_bid") {
          queryClient.invalidateQueries({
            queryKey: ["q", "bids", "direct-post"],
          });
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error.";
        showAppAlert("Could not send counter", msg);
        return false;
      } finally {
        setSubmittingCounter(false);
      }
    },
    [counterQuoteId, currentLoad, queryClient, sortedQuotes],
  );

  // Single source for the gate so the `disabled` prop and the dimmed style can
  // never disagree — a button that looks enabled but ignores taps reads as a bug.
  const hasPendingSelection = Boolean(selectedQuoteId) && selectedIsPending;
  const awardDisabled =
    awarding ||
    !hasPendingSelection ||
    !(opportunity?.permissions.canAward ?? false);

  const awardCtaLabel = isAwardedView
    ? revokingAward
      ? revokePresentation.busyLabel
      : revokePresentation.buttonLabel
    : awarding
      ? "Awarding…"
      : opportunity?.actions.primary?.kind === "award"
        ? "Award selected"
        : opportunity?.permissions.canAward
          ? "Award selected"
          : lifecycleLabel
            ? `${lifecycleLabel} — viewing only`
            : "Award selected";

  const close = () => {
    award.close();
  };

  const panelBody = (
    <View style={styles.panelRoot}>
      <View style={styles.reviewHubModalHeader}>
        <TouchableOpacity
          onPress={close}
          hitSlop={12}
          style={styles.reviewHubModalBack}
          accessibilityLabel="Close Review Hub"
        >
          <X size={18} color={Theme.textPrimaryDark} strokeWidth={2.25} />
        </TouchableOpacity>
        <View style={styles.modalHeaderTitleWrap}>
          <Text style={styles.modalTitle}>Review Hub</Text>
          {currentLoad ? (
            <Text style={styles.modalSubtitle} numberOfLines={1}>
              {lifecycleLabel
                ? `${lifecycleLabel} · ${getIndentDisplayNumber(currentLoad)}`
                : `Audit indent ${getIndentDisplayNumber(currentLoad)}`}
            </Text>
          ) : null}
        </View>
        {isAwardedView ? (
          <TouchableOpacity
            onPress={() => void handleRevokeAward()}
            disabled={revokingAward || marketBidsLoading}
            hitSlop={8}
            style={styles.reviewHubRevokeHeaderBtn}
            accessibilityLabel={revokePresentation.buttonLabel}
          >
            <Text style={styles.reviewHubRevokeHeaderBtnText} numberOfLines={1}>
              {revokingAward ? "…" : revokePresentation.mode === "refund_test" ? "Refund" : "Revoke"}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.reviewHubModalHeaderSpacer} />
        )}
      </View>

      <View style={styles.bodyColumn}>
        {currentLoad ? (
          <View style={indentReviewHubStyles.reviewHubHero}>
            <View
              style={[
                indentReviewHubStyles.reviewHubHeroGlow,
                { pointerEvents: "none" },
              ]}
            />
            <Text style={indentReviewHubStyles.reviewHubHeroKicker}>
              Target route
            </Text>
            {showAwardRevokedTag ? (
              <View style={styles.revokedTag} accessibilityLabel="Award revoked">
                <Text style={styles.revokedTagText}>AWARD REVOKED</Text>
              </View>
            ) : null}
            <Text
              style={indentReviewHubStyles.reviewHubHeroRoute}
              numberOfLines={2}
            >
              {(currentLoad.pickup_area || "—").toUpperCase()} →{" "}
              {(currentLoad.drop_location || "—").toUpperCase()}
            </Text>
            <View style={indentReviewHubStyles.reviewHubHeroMeta}>
              <View style={indentReviewHubStyles.reviewHubHeroMetaCol}>
                <Text style={indentReviewHubStyles.reviewHubHeroStatLabel}>
                  Offers
                </Text>
                <Text
                  style={indentReviewHubStyles.reviewHubHeroStatValue}
                  numberOfLines={1}
                >
                  {quotesLoading
                    ? "—"
                    : String(
                        (opportunity?.pricing.bidCount ?? sortedQuotes.length) +
                          marketBids.length,
                      )}
                </Text>
              </View>
              {targetRateInr != null ? (
                <View style={indentReviewHubStyles.reviewHubHeroMetaColEnd}>
                  <Text style={indentReviewHubStyles.reviewHubHeroStatLabel}>
                    Target
                  </Text>
                  <Text
                    style={[
                      indentReviewHubStyles.reviewHubHeroStatValue,
                      indentReviewHubStyles.reviewHubHeroStatValueEnd,
                    ]}
                    numberOfLines={1}
                  >
                    {formatINR(targetRateInr)}
                  </Text>
                </View>
              ) : lowestPendingAmount != null && pendingCount > 0 ? (
                <View style={indentReviewHubStyles.reviewHubHeroMetaColEnd}>
                  <Text style={indentReviewHubStyles.reviewHubHeroStatLabel}>
                    Lowest bid
                  </Text>
                  <Text
                    style={[
                      indentReviewHubStyles.reviewHubHeroStatValue,
                      indentReviewHubStyles.reviewHubHeroStatValueEnd,
                    ]}
                    numberOfLines={1}
                  >
                    {formatINR(lowestPendingAmount)}
                  </Text>
                </View>
              ) : (
                <View style={indentReviewHubStyles.reviewHubHeroMetaColEnd}>
                  <Text style={indentReviewHubStyles.reviewHubHeroStatLabel}>
                    Pending
                  </Text>
                  <Text
                    style={[
                      indentReviewHubStyles.reviewHubHeroStatValue,
                      indentReviewHubStyles.reviewHubHeroStatValueEnd,
                    ]}
                    numberOfLines={1}
                  >
                    {String(pendingCount)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        {quotesLoading || marketBidsLoading ? (
          <View style={styles.bidEmptyWrap}>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={styles.bidEmptyText}>Loading offers…</Text>
          </View>
        ) : sortedQuotes.length === 0 && marketBids.length === 0 ? (
          <View style={styles.bidEmptyWrap}>
            <View style={styles.bidEmptyIcon}>
              <FontAwesome name="inbox" size={22} color={Theme.textMuted} />
            </View>
            <Text style={styles.bidEmptyText}>No offers yet</Text>
            <Text style={styles.bidEmptySubtext}>
              Offers from drivers and your network will appear here.
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.bidsScroll}
              contentContainerStyle={styles.bidsScrollContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {sortedQuotes.length > 0 ? (
                <IndentLiveBidsPanel
                  quotes={sortedQuotes}
                  clientPriceInr={Number(currentLoad?.client_price ?? 0)}
                  targetRateInr={Number(targetRateInr ?? 0)}
                  pickupDateIso={currentLoad?.pickup_date}
                  selectedQuoteId={selectedQuoteId}
                  onSelectQuote={award.selectQuote}
                  canSelect={canActOnBids}
                  connectedSupplierOrgIds={connectedSupplierOrgIds}
                  awarding={awarding}
                  onCounterOffer={
                    canActOnBids ? openCounterOffer : undefined
                  }
                />
              ) : null}

              {marketBids.length > 0 ? (
                <View style={styles.marketSection}>
                  {sortedQuotes.length > 0 ? (
                    <Text style={styles.marketSectionLabel}>MARKET</Text>
                  ) : null}
                  <View style={styles.marketList}>
                    {marketBids.map((bid) => (
                      <MarketBidCard
                        key={bid.id}
                        bid={bid}
                        busy={marketBidActionId === bid.id}
                        onAccept={
                          bid.status === "pending"
                            ? () =>
                                void handleAcceptMarketBid(
                                  bid.id,
                                  bid.amount,
                                  bid.bidder_display_name,
                                  bid.bidder_type,
                                )
                            : undefined
                        }
                        onReject={
                          bid.status === "pending"
                            ? () =>
                                void handleRejectMarketBid(
                                  bid.id,
                                  bid.bidder_display_name,
                                )
                            : undefined
                        }
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </ScrollView>
            {pendingCount === 0 ? (
              <Text style={styles.footerHint}>
                No pending offers to award.
              </Text>
            ) : opportunity?.permissions.canAward ? (
              <Text style={styles.footerHint}>
                {needsInvite
                  ? invitePending
                    ? "Waiting for this supplier to accept your invite. You can award once they accept."
                    : "This bidder is not in your supplier network yet. Invite them as a supplier to award this load."
                  : selectedQuoteId
                    ? "Review the selected offer, then award below."
                    : "Select an offer to continue."}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {currentLoad ? (
        <View style={styles.footerActions}>
          {/* Unconnected bidder: awarding is blocked until they accept a
              supplier invite, so the primary action becomes the invite. */}
          {isAwardedView ? (
            <TouchableOpacity
              style={[
                styles.modalSubmit,
                revokingAward && styles.modalSubmitDisabled,
              ]}
              onPress={() => void handleRevokeAward()}
              activeOpacity={0.9}
              disabled={revokingAward || marketBidsLoading}
              accessibilityLabel={revokePresentation.buttonLabel}
            >
              <Text style={styles.modalSubmitText}>{awardCtaLabel}</Text>
            </TouchableOpacity>
          ) : needsInvite ? (
            <TouchableOpacity
              style={[
                styles.modalSubmit,
                inviteDisabled && styles.modalSubmitDisabled,
              ]}
              onPress={() => void award.inviteSelectedBidder()}
              activeOpacity={0.9}
              disabled={inviteDisabled}
            >
              <Text style={styles.modalSubmitText}>
                {inviteSending
                  ? "Sending invite…"
                  : invitePending
                    ? "Invite sent — awaiting acceptance"
                    : "Invite as supplier"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.modalSubmit,
                awardDisabled && styles.modalSubmitDisabled,
              ]}
              onPress={() => void award.award()}
              activeOpacity={0.9}
              disabled={awardDisabled}
            >
              <Text style={styles.modalSubmitText}>{awardCtaLabel}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.viewIndentBtn}
            onPress={() => {
              award.close();
              onViewIndent(currentLoad);
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.viewIndentBtnText}>View indent</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  const counterEntry = (
    <IndentCounterOfferEntry
      visible={counterQuote != null}
      carrierName={
        counterQuote?.bidder_organization_name?.trim() || "Supplier"
      }
      currentBidAmount={Number(counterQuote?.amount ?? 0)}
      indentDisplayNumber={
        currentLoad ? getIndentDisplayNumber(currentLoad) : undefined
      }
      origin={currentLoad?.pickup_area}
      destination={currentLoad?.drop_location}
      initialCounterAmount={
        counterQuote?.counter_amount != null &&
        Number(counterQuote.counter_amount) > 0
          ? Number(counterQuote.counter_amount)
          : null
      }
      submitting={submittingCounter}
      onClose={() => {
        if (submittingCounter) return;
        setCounterQuoteId(null);
      }}
      onSubmitAmount={handleSubmitCounter}
    />
  );

  return (
    <>
      <ResponsiveDrawer visible={visible} onClose={close} insets={insets}>
        {panelBody}
      </ResponsiveDrawer>
      {counterEntry}
    </>
  );
}

const styles = StyleSheet.create({
  panelRoot: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    flexDirection: "column",
  },
  bodyColumn: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  reviewHubModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 10,
    flexShrink: 0,
  },
  reviewHubModalBack: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    ...Platform.select({
      web: { boxShadow: "0 1px 4px rgba(15,23,42,0.06)" } as object,
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      default: { elevation: 1 },
    }),
  },
  reviewHubModalHeaderSpacer: {
    width: 40,
    height: 40,
  },
  reviewHubRevokeHeaderBtn: {
    minWidth: 72,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.warningMuted,
    borderWidth: 1,
    borderColor: Theme.warning,
  },
  reviewHubRevokeHeaderBtnText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.warning,
  },
  modalHeaderTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 0,
    gap: 2,
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    textAlign: "center",
    color: Theme.textPrimaryDark,
    width: "100%",
  },
  modalSubtitle: {
    ...indentReviewHubText.modalSubtitle,
    fontSize: 11,
    letterSpacing: 0.2,
    marginTop: 0,
  },
  bidsScroll: {
    flex: 1,
    minHeight: 0,
  },
  bidsScrollContent: {
    paddingBottom: 4,
  },
  bidEmptyWrap: {
    paddingVertical: 36,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  bidEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  bidEmptyText: {
    ...indentReviewHubText.partyTitle,
    fontSize: 13,
    color: Theme.textPrimaryDark,
  },
  bidEmptySubtext: {
    ...indentReviewHubText.bodyMuted,
    textAlign: "center",
    maxWidth: 280,
  },
  marketSection: {
    marginTop: 12,
    gap: 8,
  },
  marketSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  marketList: {
    gap: 8,
  },
  footerHint: {
    ...indentReviewHubText.bodyMuted,
    marginTop: 10,
    marginBottom: 2,
    textAlign: "center",
    fontSize: 11,
  },
  footerActions: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    gap: 8,
    flexShrink: 0,
  },
  modalSubmit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    backgroundColor: Theme.darkBackground,
    borderRadius: 12,
    alignSelf: "stretch",
    minWidth: 0,
    minHeight: 48,
  },
  modalSubmitDisabled: {
    opacity: 0.38,
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  revokedTag: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.warningMuted,
  },
  revokedTagText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.warning,
  },
  viewIndentBtn: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    minHeight: 46,
  },
  viewIndentBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
