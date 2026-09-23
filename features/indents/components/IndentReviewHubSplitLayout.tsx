import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { BidReceivedHammer } from "@/features/indents/components/bidding/BidReceivedHammer";
import {
  IndentBidsAwaitingPanel,
  LiveBidsSectionHeader,
} from "@/features/indents/components/bidding/IndentBidsAwaitingPanel";
import { IndentLiveBidsPanel } from "@/features/indents/components/bidding/IndentLiveBidsPanel";
import {
  IndentSupplierQuoteCard,
  type SupplierQuoteActionHint,
} from "@/features/indents/components/IndentSupplierQuoteCard";
import { IndentSupplierPartySummary } from "@/features/indents/components/IndentSupplierPartySummary";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import {
  indentReviewHubSplitLayout as splitStyles,
} from "@/features/indents/styles/indentReviewHubStyles";
import type { IndentBidAlertInfo } from "@/features/indents/utils/bidding/indentBidAlert.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import { EMPTY_STATE_LOTTIE } from "@/lib/emptyStateLottieAssets";
import type { ReactNode } from "react";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type IndentReviewHubBidsPaneProps = {
  isOwner: boolean;
  compact: boolean;
  stacked: boolean;
  title: string;
  liveBidsCount: number;
  isListeningForBids: boolean;
  showTrophy: boolean;
  showHammer: boolean;
  // Owner — give load
  quotes: DirectQuoteRow[];
  quotesLoading?: boolean;
  clientPriceInr: number;
  targetRateInr: number;
  pickupDateIso: string | null;
  selectedQuoteId: string | null;
  onSelectQuote: (id: string | null) => void;
  canAward: boolean;
  canBroadcast: boolean;
  isListening: boolean;
  isBroadcasting: boolean;
  sharingDraft: boolean;
  sharingStory?: boolean;
  broadcastError: string | null;
  onBroadcast?: () => void;
  onShareStory?: () => void;
  onShareWhatsApp?: () => void;
  onBoostReach?: () => void;
  pulseStoryLive?: boolean;
  onCounterOffer?: (quoteId: string) => void;
  onAwardBid?: (quoteId: string) => void;
  awarding?: boolean;
  // Supplier — get load
  myQuote: DirectQuoteRow | null;
  supplierQuoteActionHint: SupplierQuoteActionHint;
  supplierQuoteAlert: IndentBidAlertInfo | null;
  canOpenQuoteModal: boolean;
  onQuotePress?: () => void;
  showSupplierPartySummaries: boolean;
  orgId: string | null;
  shipperName: string;
  linkedTrip: TripRow | null | undefined;
  driverLabel: string;
  vehicleLabel: string;
  allocationPending: boolean;
  targetRateInrSupplier: number;
};

function SupplierBidInvitePanel({
  compact,
}: {
  compact: boolean;
}) {
  return (
    <View style={[styles.supplierInviteCard, compact && styles.supplierInviteCardCompact]}>
      <View style={styles.supplierInviteHero}>
        <View style={[styles.lottieWrap, compact && styles.lottieWrapCompact]}>
          <TinyEmptyLottie source={EMPTY_STATE_LOTTIE.auction} size={compact ? 48 : 56} />
        </View>
        <Text style={[styles.supplierInviteTitle, compact && styles.supplierInviteTitleCompact]}>
          Place your bid
        </Text>
        <Text style={[styles.supplierInviteBody, compact && styles.supplierInviteBodyCompact]}>
          Review the load on the left, then submit a competitive quote. Your bid
          status updates here in real time.
        </Text>
      </View>
    </View>
  );
}

export function IndentReviewHubBidsHeader({
  title,
  liveBidsCount,
  isListeningForBids,
  showTrophy,
  showHammer,
}: Pick<
  IndentReviewHubBidsPaneProps,
  "title" | "liveBidsCount" | "isListeningForBids" | "showTrophy" | "showHammer"
>) {
  return (
    <>
      <LiveBidsSectionHeader
        title={title}
        count={liveBidsCount}
        isListening={isListeningForBids}
        showTrophy={showTrophy}
      />
      {showHammer ? <BidReceivedHammer visible /> : null}
    </>
  );
}

export function IndentReviewHubBidsBody(props: IndentReviewHubBidsPaneProps) {
  const {
    isOwner,
    compact,
    stacked,
    quotes,
    quotesLoading = false,
    clientPriceInr,
    targetRateInr,
    pickupDateIso,
    selectedQuoteId,
    onSelectQuote,
    canAward,
    canBroadcast,
    isListening,
    isBroadcasting,
    sharingDraft,
    sharingStory,
    broadcastError,
    onBroadcast,
    onShareStory,
    onShareWhatsApp,
    onBoostReach,
    pulseStoryLive,
    onCounterOffer,
    myQuote,
    supplierQuoteActionHint,
    supplierQuoteAlert,
    canOpenQuoteModal,
    onQuotePress,
    showSupplierPartySummaries,
    orgId,
    shipperName,
    linkedTrip,
    driverLabel,
    vehicleLabel,
    allocationPending,
    targetRateInrSupplier,
  } = props;

  if (isOwner) {
    if (quotesLoading && quotes.length === 0) {
      return (
        <View style={[styles.awaitingPaneShell, stacked && styles.awaitingPaneShellStacked]}>
          <LoadingIndicator color={Theme.loaderAccent} />
        </View>
      );
    }
    if (quotes.length === 0) {
      return (
        <View
          style={[
            styles.awaitingPaneShell,
            stacked && styles.awaitingPaneShellStacked,
          ]}
        >
          <IndentBidsAwaitingPanel
            compact={compact}
            paneFill={!stacked}
            stacked={stacked}
            canBroadcast={canBroadcast}
            isListening={isListening}
            isBroadcasting={isBroadcasting}
            sharingDraft={sharingDraft}
            sharingStory={sharingStory}
            broadcastError={broadcastError}
            onBroadcast={onBroadcast}
            onShareStory={onShareStory}
            onShareWhatsApp={onShareWhatsApp}
            onBoostReach={onBoostReach}
            pulseStoryLive={pulseStoryLive}
          />
        </View>
      );
    }
    return (
      <View style={styles.ownerBidsWrap}>
        <IndentLiveBidsPanel
          quotes={quotes}
          clientPriceInr={clientPriceInr}
          targetRateInr={targetRateInr}
          pickupDateIso={pickupDateIso}
          selectedQuoteId={selectedQuoteId}
          onSelectQuote={onSelectQuote}
          canSelect={canAward}
          onCounterOffer={onCounterOffer}
          minimalCards={stacked}
          hideFilters={stacked}
        />
      </View>
    );
  }

  if (myQuote) {
    return (
      <IndentSupplierQuoteCard
        quote={myQuote}
        shipperName={shipperName}
        shipperOrgId={orgId}
        targetRateInr={targetRateInrSupplier}
        alertInfo={supplierQuoteAlert}
        canUpdateBid={canOpenQuoteModal}
        actionHint={supplierQuoteActionHint}
        onPress={canOpenQuoteModal ? onQuotePress : undefined}
      >
        {showSupplierPartySummaries ? (
          <IndentSupplierPartySummary
            orgId={orgId}
            shipperName={shipperName}
            awardedQuoteInr={Number(myQuote.amount ?? 0)}
            trip={linkedTrip ?? null}
            driverLabel={driverLabel}
            vehicleLabel={vehicleLabel}
            allocationPending={allocationPending}
          />
        ) : null}
      </IndentSupplierQuoteCard>
    );
  }

  if (canOpenQuoteModal && onQuotePress) {
    return <SupplierBidInvitePanel compact={compact} />;
  }

  if (supplierQuoteActionHint === "locked") {
    return (
      <Text style={styles.supplierHint}>Bidding is closed for this load.</Text>
    );
  }
  if (supplierQuoteActionHint === "completed") {
    return (
      <Text style={styles.supplierHint}>This load is completed.</Text>
    );
  }

  return null;
}

type SplitLayoutProps = {
  useSplit: boolean;
  compact: boolean;
  stacked: boolean;
  summary: ReactNode;
  bidsHeader: ReactNode;
  bidsBody: ReactNode;
  /** When true, stacked layout only renders summary (supplier my-bid embeds quote). */
  hideStackedBids?: boolean;
  footerReserve: number;
  insetsBottom: number;
  refreshing: boolean;
  onRefresh: () => void;
};

export function IndentReviewHubSplitLayout({
  useSplit,
  compact,
  stacked,
  summary,
  bidsHeader,
  bidsBody,
  hideStackedBids = false,
  footerReserve,
  insetsBottom,
  refreshing,
  onRefresh,
}: SplitLayoutProps) {
  const bottomPad = footerReserve + insetsBottom + 8;

  if (!useSplit) {
    return (
      <ScrollView
        style={[styles.stackScroll, stacked && styles.stackScrollMobile]}
        contentContainerStyle={[
          splitStyles.summaryPaneContent,
          compact && splitStyles.summaryPaneContentCompact,
          stacked && splitStyles.summaryPaneContentStacked,
          stacked && styles.stackContentMobile,
          { paddingBottom: bottomPad },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Theme.darkBackground}
          />
        }
      >
        {summary}
        {!hideStackedBids ? (
          <View
            style={[
              styles.stackBidsSection,
              compact && styles.stackBidsSectionCompact,
              stacked && styles.stackBidsSectionMobile,
            ]}
          >
            <View
              style={[
                styles.stackBidsHeader,
                compact && styles.stackBidsHeaderCompact,
              ]}
            >
              {bidsHeader}
            </View>
            {bidsBody}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={splitStyles.splitRow}>
      <ScrollView
        style={splitStyles.summaryPane}
        contentContainerStyle={[
          splitStyles.summaryPaneContent,
          compact && splitStyles.summaryPaneContentCompact,
          { paddingBottom: bottomPad },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Theme.darkBackground}
          />
        }
      >
        {summary}
      </ScrollView>

      <View style={splitStyles.bidsPane}>
        <View style={splitStyles.bidsPaneHeader}>{bidsHeader}</View>
        <ScrollView
          style={splitStyles.bidsPaneScroll}
          contentContainerStyle={[
            splitStyles.bidsPaneScrollContent,
            compact && splitStyles.bidsPaneScrollContentCompact,
            { paddingBottom: bottomPad },
          ]}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {bidsBody}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stackScroll: {
    flex: 1,
    backgroundColor: Theme.surface,
  },
  stackScrollMobile: {
    backgroundColor: "#F0F2F5",
  },
  stackContentMobile: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 0,
  },
  stackBidsSection: {
    marginTop: 6,
    paddingTop: 10,
    gap: 8,
    alignSelf: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 4,
  },
  stackBidsSectionCompact: {
    marginTop: 4,
    paddingTop: 8,
    gap: 6,
  },
  stackBidsSectionMobile: {
    marginTop: 8,
    marginHorizontal: 0,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: Theme.cardWhite,
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  stackBidsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minWidth: 0,
    paddingBottom: 2,
  },
  stackBidsHeaderCompact: {
    paddingBottom: 0,
  },
  ownerBidsWrap: {
    flexGrow: 1,
    minHeight: 120,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  awaitingPaneShell: {
    alignSelf: "stretch",
    width: "100%",
    paddingTop: 2,
    flex: 1,
    minHeight: 360,
    justifyContent: "center",
  },
  awaitingPaneShellStacked: {
    paddingTop: 0,
    flex: 0,
    minHeight: 0,
    justifyContent: "flex-start",
  },
  supplierHint: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 17,
    paddingHorizontal: 2,
  },
  supplierInviteCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 12,
    flexGrow: 1,
    minHeight: 280,
    justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "0 2px 12px rgba(15,23,42,0.06)" } as object,
      default: {},
    }),
  },
  supplierInviteCardCompact: {
    minHeight: 220,
    paddingVertical: 12,
  },
  supplierInviteHero: {
    alignItems: "center",
    gap: 8,
  },
  lottieWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 1,
    borderColor: Theme.pulseIndigoRing,
    alignItems: "center",
    justifyContent: "center",
  },
  lottieWrapCompact: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  supplierInviteTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  supplierInviteTitleCompact: {
    fontSize: 12,
  },
  supplierInviteBody: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
    textAlign: "center",
    maxWidth: 320,
  },
  supplierInviteBodyCompact: {
    fontSize: 10,
    lineHeight: 14,
  },
});
