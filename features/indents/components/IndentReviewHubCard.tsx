/**
 * Indent Review Hub — left summary column.
 * Multi-card layout (route · shipment/commercials · suppliers · insight)
 * matching the Load Detail Hub visual system. Props/handlers unchanged.
 */
import { memo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { IndentFreightClientEntity } from "@/features/indents/components/IndentFreightClientEntity";
import { IndentHubInsightTicketTail } from "@/features/indents/components/IndentHubInsightTicketTail";
import type { IndentFreightCardClientProps } from "@/features/indents/components/IndentFreightCard";
import { IndentMobileLoadDetail } from "@/features/indents/components/IndentMobileLoadDetail";
import {
  indentHubCardShadow,
  indentReviewHubLayout,
  indentReviewHubText,
} from "@/features/indents/styles/indentReviewHubStyles";
import type { IndentBidAlertInfo } from "@/features/indents/utils/bidding/indentBidAlert.util";
import type { IndentBidFooterInsight } from "@/features/indents/utils/bidding/indentLiveBids.util";
import { formatINR } from "@/lib/format";
import { RouteExtraStopsNote } from "@/features/trips/components/RouteExtraStopsNote";
import {
  RouteExtraStopsPlan,
  RouteStopsTimeline,
} from "@/features/trips/components/RouteExtraStopsPlan";
import type { RouteExtraStopRow } from "@/features/trips/services/routeExtraStops.service";
import {
  EMPTY_ROUTE_EXTRA_STOP_SUMMARY,
  extraStopChipLabel,
  extraStopPaidLabel,
  type RouteExtraStopSummary,
} from "@/features/trips/utils/routeExtraStops.util";

const cardShadow = indentHubCardShadow as ViewStyle;

const NO_EXTRA_STOP_ROWS: readonly RouteExtraStopRow[] = [];

export type IndentReviewHubCardProps = {
  isOwner: boolean;
  typeLabel: string;
  status: string;
  isDirect: boolean;
  /** Originated from a Commerce (multi-order e-commerce) execution plan. */
  isCommerce?: boolean;
  dateLabel: string;
  origin: string;
  destination: string;
  vehicleType: string;
  weightKg: string;
  material: string;
  canCancelLoad?: boolean;
  cancelling?: boolean;
  onCancelLoad?: () => void;
  canEditLoad?: boolean;
  onEditAll?: () => void;
  primaryAmount: string;
  supplierRate?: string;
  /** ₹/MT line under the supplier target, when the main figure is the trip total. */
  supplierPerMt?: string | null;
  /** Trip total under the supplier target, when the main figure is ₹/MT. */
  supplierOverall?: string | null;
  /** ₹/MT line under the client rate, when the main figure is the trip total. */
  clientPerMt?: string | null;
  /** Trip total under the client rate, when the main figure is ₹/MT. */
  clientOverall?: string | null;
  marginPct?: number | null;
  client: IndentFreightCardClientProps;
  quoteStatus?: string | null;
  quoteAmountInr?: number | null;
  counterAmountInr?: number | null;
  targetRateInr?: number;
  footerInsight?: IndentBidFooterInsight | null;
  alertInfo?: IndentBidAlertInfo | null;
  onQuotePress?: () => void;
  /** When true (GET LOAD split layout), quote hero moves to the bids pane. */
  suppressSupplierQuoteHero?: boolean;
  compact?: boolean;
  stacked?: boolean;
  /** Mobile order-detail layout extras (ignored on desktop split). */
  loadId?: string;
  createdAtLabel?: string;
  pickupDateIso?: string | null;
  liveBidsCount?: number;
  clientPriceInr?: number;
  supplierTargetInr?: number;
  /** Stops in between; their charges are already inside the shown rates. */
  extraStops?: RouteExtraStopSummary;
  /** The stops themselves, in order — listed under the route. */
  extraStopRows?: readonly RouteExtraStopRow[];
  /** Awarded vendor (Give Load owner). Shown on Parties when the load is awarded. */
  vendorName?: string | null;
  vendorRate?: string | null;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  bidsSlot?: ReactNode;
  partiesStrip?: ReactNode;
  children?: ReactNode;
};

function stripCurrencyPrefix(formatted: string): string {
  return formatted.replace(/^[^\d,.-]+/, "").trim() || formatted;
}

function quoteStatusStyles(status: string) {
  const s = status.toLowerCase();
  if (s === "accepted") {
    return { pill: styles.statusAwarded, text: styles.statusAwardedText };
  }
  if (s === "rejected") {
    return { pill: styles.statusRejected, text: styles.statusRejectedText };
  }
  return { pill: styles.statusPending, text: styles.statusPendingText };
}

function SpecTile({ label, value }: { label: string; value: string }) {
  const empty = value === "—" || !String(value).trim();
  return (
    <View style={styles.specTile}>
      <Text style={styles.specTileLabel}>{label}</Text>
      <Text
        style={[styles.specTileValue, empty && styles.specTileValueEmpty]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function GlassCard({
  children,
  compact,
  stacked,
  style,
}: {
  children: ReactNode;
  compact?: boolean;
  stacked?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.glassCard,
        compact && styles.glassCardCompact,
        stacked && styles.glassCardStacked,
        cardShadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export const IndentReviewHubCard = memo(function IndentReviewHubCard({
  isOwner,
  typeLabel,
  status,
  isDirect,
  isCommerce = false,
  dateLabel,
  origin,
  destination,
  vehicleType,
  weightKg,
  material,
  canCancelLoad,
  cancelling,
  onCancelLoad,
  canEditLoad,
  onEditAll,
  primaryAmount,
  supplierRate = "—",
  supplierPerMt = null,
  supplierOverall = null,
  clientPerMt = null,
  clientOverall = null,
  marginPct = null,
  client,
  quoteStatus,
  quoteAmountInr,
  counterAmountInr = null,
  targetRateInr = 0,
  footerInsight,
  alertInfo,
  onQuotePress,
  suppressSupplierQuoteHero = false,
  compact = false,
  stacked = false,
  loadId = "",
  createdAtLabel = "—",
  pickupDateIso = null,
  liveBidsCount = 0,
  clientPriceInr = 0,
  supplierTargetInr = 0,
  extraStops = EMPTY_ROUTE_EXTRA_STOP_SUMMARY,
  extraStopRows = NO_EXTRA_STOP_ROWS,
  vendorName = null,
  vendorRate = null,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  bidsSlot,
  partiesStrip,
  children,
}: IndentReviewHubCardProps) {
  if (stacked) {
    return (
      <IndentMobileLoadDetail
        isOwner={isOwner}
        typeLabel={typeLabel}
        status={status}
        isDirect={isDirect}
        isCommerce={isCommerce}
        loadId={loadId || "—"}
        dateLabel={dateLabel}
        createdAtLabel={createdAtLabel}
        pickupDateIso={pickupDateIso}
        origin={origin}
        destination={destination}
        vehicleType={vehicleType}
        weightKg={weightKg}
        material={material}
        liveBidsCount={liveBidsCount}
        canCancelLoad={canCancelLoad}
        cancelling={cancelling}
        onCancelLoad={onCancelLoad}
        canEditLoad={canEditLoad}
        onEditAll={onEditAll}
        primaryAmount={primaryAmount}
        supplierRate={supplierRate}
        clientPerMt={clientPerMt}
        clientOverall={clientOverall}
        supplierPerMt={supplierPerMt}
        supplierOverall={supplierOverall}
        marginPct={marginPct}
        clientPriceInr={clientPriceInr}
        supplierTargetInr={supplierTargetInr}
        extraStops={extraStops}
        extraStopRows={extraStopRows}
        vendorName={vendorName}
        vendorRate={vendorRate}
        client={client}
        quoteStatus={quoteStatus}
        quoteAmountInr={quoteAmountInr}
        counterAmountInr={counterAmountInr}
        targetRateInr={targetRateInr}
        onQuotePress={
          suppressSupplierQuoteHero ? undefined : onQuotePress
        }
        primaryActionLabel={primaryActionLabel}
        onPrimaryAction={onPrimaryAction}
        secondaryActionLabel={secondaryActionLabel}
        onSecondaryAction={onSecondaryAction}
        bidsSlot={bidsSlot}
        partiesStrip={partiesStrip}
      >
        {children}
      </IndentMobileLoadDetail>
    );
  }

  const hasQuote =
    !suppressSupplierQuoteHero &&
    quoteAmountInr != null &&
    quoteAmountInr > 0;
  const ownerInlineFreight = isOwner && !onQuotePress;
  const quoteStatusNorm = (quoteStatus ?? "").trim().toLowerCase();
  const statusStyles = quoteStatus ? quoteStatusStyles(quoteStatusNorm) : null;

  const heroIsQuote = !isOwner && hasQuote;
  const heroAmount = heroIsQuote
    ? stripCurrencyPrefix(formatINR(quoteAmountInr!))
    : stripCurrencyPrefix(primaryAmount);
  const heroKicker = heroIsQuote
    ? "YOUR QUOTE"
    : isOwner
      ? "CLIENT RATE"
      : "TARGET RATE";
  const referenceTarget =
    !isOwner && hasQuote && targetRateInr > 0
      ? stripCurrencyPrefix(formatINR(targetRateInr))
      : null;

  const statusUpper = status.toUpperCase();
  const statusDisplay =
    statusUpper === "OPEN"
      ? "ACTIVE"
      : statusUpper === "BROADCAST"
        ? "LIVE"
        : statusUpper === "PENDING"
          ? "PENDING"
          : statusUpper;

  function renderHero() {
    return (
      <View style={styles.heroBlock}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroKicker}>{heroKicker}</Text>
          {statusStyles && heroIsQuote ? (
            <View style={[styles.statusPill, statusStyles.pill]}>
              <Text style={[styles.statusPillText, statusStyles.text]}>
                {quoteStatusNorm === "accepted"
                  ? "Awarded"
                  : quoteStatusNorm === "rejected"
                    ? "Rejected"
                    : "Pending"}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.heroAmountRow}>
          <Text style={styles.heroCurrency}>₹</Text>
          <Text
            style={[styles.heroAmount, compact && styles.heroAmountCompact]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {heroAmount}
          </Text>
        </View>
        {referenceTarget ? (
          <Text style={styles.heroReference}>
            Shipper target · ₹ {referenceTarget}
          </Text>
        ) : null}
        {onQuotePress && !hasQuote ? (
          <Text style={styles.heroTapHint}>Tap to place your bid</Text>
        ) : null}
      </View>
    );
  }

  const heroBlock = onQuotePress ? (
    <Pressable onPress={onQuotePress} style={styles.heroPressable}>
      {renderHero()}
    </Pressable>
  ) : (
    renderHero()
  );

  return (
    <View style={[styles.stack, stacked && styles.stackStacked]}>
      {/* ── Card 1: Route & status ── */}
      <GlassCard compact={compact} stacked={stacked}>
        <View style={styles.orb} pointerEvents="none" />

        <View style={styles.tagsRow}>
          <View style={styles.pillRow}>
            <View style={styles.typePill}>
              <Text style={styles.typePillText}>{typeLabel}</Text>
            </View>
            <View style={styles.statePill}>
              <Text style={styles.statePillText}>{statusDisplay}</Text>
            </View>
            {isDirect ? (
              <View style={styles.directPill}>
                <Text style={styles.directPillText}>DIRECT</Text>
              </View>
            ) : null}
            {isCommerce ? (
              <View style={styles.commercePill} accessibilityLabel="Originated from Pulse Commerce">
                <Text style={styles.commercePillText}>COMMERCE</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.tagsRight}>
            <Text style={styles.dateLine}>{dateLabel}</Text>
            {isOwner && canCancelLoad ? (
              <TouchableOpacity
                onPress={onCancelLoad}
                disabled={cancelling}
                activeOpacity={0.7}
                accessibilityLabel="Cancel load"
                hitSlop={Layout.touchTargetHitSlop}
              >
                <Text style={styles.cancelLinkText}>
                  {cancelling ? "Cancelling…" : "Cancel load"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={[styles.routePanel, compact && styles.routePanelCompact]}>
          <LoadCardRouteRow
            origin={origin}
            destination={destination}
            compact
            style={styles.route}
          />
          {!compact && extraStopRows.length > 0 ? (
            <RouteStopsTimeline
              stops={extraStopRows}
              side={isOwner ? "client" : "supplier"}
              origin={origin}
              destination={destination}
              summary={[
                extraStopChipLabel(extraStops.count),
                extraStopPaidLabel(extraStops, isOwner ? "client" : "supplier", formatINR),
              ]
                .filter(Boolean)
                .join(" · ")}
              style={styles.extraStopsTimeline}
            />
          ) : (
            <>
              <RouteExtraStopsNote
                summary={extraStops}
                side={isOwner ? "client" : "supplier"}
                style={styles.extraStopsNote}
              />
              <RouteExtraStopsPlan
                stops={extraStopRows}
                side={isOwner ? "client" : "supplier"}
                style={styles.extraStopsPlan}
              />
            </>
          )}
        </View>
      </GlassCard>

      {/* ── Card 2: Shipment + commercials ── */}
      <GlassCard compact={compact} stacked={stacked}>
        <View style={styles.specsHeader}>
          <Text style={styles.specsTitle}>SHIPMENT PROFILE</Text>
          {isOwner && canEditLoad ? (
            <TouchableOpacity
              onPress={onEditAll}
              hitSlop={Layout.touchTargetHitSlop}
              style={styles.editAllBtn}
            >
              <FontAwesome
                name="pencil"
                size={9}
                color={Theme.positive}
              />
              <Text style={styles.editAll}>EDIT ALL</Text>
            </TouchableOpacity>
          ) : isOwner ? (
            <Text style={styles.editAllDisabled}>Locked</Text>
          ) : (
            <View style={styles.readOnlyPill}>
              <FontAwesome name="eye" size={10} color={Theme.textMuted} />
              <Text style={styles.readOnlyText}>Read only</Text>
            </View>
          )}
        </View>

        <View style={styles.specGrid}>
          <SpecTile label="Vehicle" value={vehicleType} />
          <SpecTile label="Weight" value={weightKg} />
          <SpecTile label="Cargo Load" value={material} />
        </View>

        {isOwner ? (
          <View style={styles.financeRow}>
            <View style={styles.supplierTargetCard}>
              <Text style={styles.financeLabelDark}>SUPPLIER TARGET</Text>
              <Text
                style={[
                  styles.financeValueDark,
                  compact && styles.financeValueDarkCompact,
                  supplierPerMt && supplierOverall && styles.financeValueWithSub,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {supplierPerMt ?? supplierRate}
              </Text>
              {supplierPerMt && supplierOverall ? (
                <Text
                  style={styles.financeSubDark}
                  numberOfLines={1}
                >
                  {supplierOverall}
                </Text>
              ) : null}
              {marginPct != null ? (
                <View style={styles.marginChip}>
                  <Text style={styles.marginChipText}>
                    {marginPct}% TARGET MARGIN
                  </Text>
                </View>
              ) : (
                <View style={styles.baselineChip}>
                  <Text style={styles.baselineChipText}>Target Baseline</Text>
                </View>
              )}
            </View>

            <View style={styles.clientRateCard}>
              <View style={styles.clientRateTop}>
                <Text style={styles.financeLabelLight}>CLIENT RATE</Text>
              </View>
              {ownerInlineFreight ? (
                <View>
                  <Text
                    style={[
                      styles.financeValueLight,
                      compact && styles.financeValueLightCompact,
                      clientPerMt && clientOverall && styles.financeValueWithSub,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {clientPerMt ?? primaryAmount}
                  </Text>
                  {clientPerMt && clientOverall ? (
                    <Text style={styles.financeSubLight} numberOfLines={1}>
                      {clientOverall}
                    </Text>
                  ) : null}
                </View>
              ) : (
                heroBlock
              )}
              <View style={styles.clientEntityDivider} />
              <View style={styles.clientEntitySlot}>
                <IndentFreightClientEntity
                  label="CLIENT"
                  displayName={client.displayName}
                  avatarName={client.avatarName}
                  clientId={client.clientId}
                  ownerOrgId={client.ownerOrgId}
                  shipperOrgId={client.shipperOrgId}
                  isOwner={client.isOwner}
                  anonymous={client.anonymous}
                  align="left"
                  nameLines={1}
                  surface="light"
                  avatarSize={compact ? 28 : 32}
                />
              </View>
              {vendorName ? (
                <View style={styles.vendorEntitySlot}>
                  <Text style={styles.financeLabelLight}>VENDOR</Text>
                  <Text
                    style={styles.vendorName}
                    numberOfLines={1}
                  >
                    {vendorName}
                  </Text>
                  {vendorRate ? (
                    <Text style={styles.vendorRate} numberOfLines={1}>
                      {vendorRate}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.financeRow}>
            <View style={[styles.clientRateCard, { flex: 1.4 }]}>
              <Text style={styles.financeLabelLight}>SHIPPER</Text>
              <IndentFreightClientEntity
                displayName={client.displayName}
                avatarName={client.avatarName}
                clientId={client.clientId}
                ownerOrgId={client.ownerOrgId}
                shipperOrgId={client.shipperOrgId}
                isOwner={client.isOwner}
                anonymous={client.anonymous}
                align="left"
                nameLines={2}
                surface="light"
                hideLabel
              />
              <Text style={[styles.financeLabelLight, { marginTop: 10 }]}>
                TARGET RATE
              </Text>
              <Text style={styles.financeValueLight}>
                {targetRateInr > 0 ? formatINR(targetRateInr) : "—"}
              </Text>
            </View>
            {!suppressSupplierQuoteHero ? (
              <View style={styles.quoteHeroCard}>{heroBlock}</View>
            ) : null}
          </View>
        )}
      </GlassCard>

      {/* ── Card 3: Integrated suppliers ── */}
      {isOwner && partiesStrip ? (
        <GlassCard compact={compact} stacked={stacked}>
          {partiesStrip}
        </GlassCard>
      ) : null}

      {/* ── Insight / recommendation ── */}
      {(footerInsight || alertInfo) ? (
        <View
          style={[
            styles.insightWrap,
            compact && styles.insightWrapCompact,
            stacked && styles.insightWrapStacked,
          ]}
        >
          <IndentHubInsightTicketTail
            insight={footerInsight}
            alertInfo={alertInfo}
            contentPadding={indentReviewHubLayout.summaryCardPadding}
          />
        </View>
      ) : null}

      {children ? <View style={styles.childrenSlot}>{children}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  extraStopsNote: {
    marginTop: 8,
  },
  extraStopsTimeline: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  extraStopsPlan: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  stack: {
    gap: 8,
    marginBottom: 4,
    width: "100%",
    alignSelf: "stretch",
  },
  stackStacked: {
    gap: 8,
    marginBottom: 2,
    width: "100%",
  },
  glassCard: {
    position: "relative",
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    overflow: "hidden",
    width: "100%",
    alignSelf: "stretch",
  },
  glassCardCompact: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
  },
  glassCardStacked: {
    alignSelf: "stretch",
    width: "100%",
  },
  orb: {
    position: "absolute",
    top: -36,
    right: -28,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Theme.positive,
    opacity: 0.045,
  },
  tagsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    zIndex: 1,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  tagsRight: {
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
  },
  typePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.darkBackground,
  },
  typePillText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: Theme.textOnDark,
  },
  statePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  statePillText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.positive,
  },
  directPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  directPillText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    color: Theme.textPrimaryDark,
  },
  /** Marks an Indent that originated from a Commerce execution plan. Text-based — not color-only. */
  commercePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  commercePillText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    color: Theme.textPrimaryDark,
  },
  dateLine: {
    ...indentReviewHubText.dateLine,
    fontSize: 9,
    fontWeight: "500",
  },
  cancelLinkText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.negative,
    letterSpacing: 0.15,
  },
  routePanel: {
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    zIndex: 1,
  },
  routePanelCompact: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  route: { marginBottom: 0 },
  specsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  specsTitle: {
    ...indentReviewHubText.fieldLabel,
    fontSize: 8,
    letterSpacing: 0.7,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  editAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  editAll: {
    ...indentReviewHubText.buttonLabel,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.45,
    color: Theme.positive,
  },
  editAllDisabled: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    color: Theme.textMuted,
  },
  readOnlyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Theme.surfaceLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  readOnlyText: {
    ...indentReviewHubText.chipLabel,
    fontSize: 8,
    color: Theme.textMuted,
  },
  specGrid: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
    alignItems: "stretch",
  },
  specTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    backgroundColor: Theme.surface,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 7,
    justifyContent: "flex-start",
  },
  specTileLabel: {
    ...indentReviewHubText.specLabel,
    fontSize: 7,
    letterSpacing: 0.5,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  specTileValue: {
    ...indentReviewHubText.fieldValue,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 13,
  },
  specTileValueEmpty: {
    color: Theme.textMuted,
    fontWeight: "500",
  },
  financeRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
    marginTop: 10,
  },
  supplierTargetCard: {
    flex: 1.2,
    minWidth: 0,
    backgroundColor: Theme.darkBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "space-between",
    gap: 8,
  },
  clientRateCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "flex-start",
    gap: 6,
  },
  quoteHeroCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.positiveMuted,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positiveMutedDarkBorder,
    padding: 12,
    justifyContent: "center",
  },
  financeLabelDark: {
    ...indentReviewHubText.freightLabelDark,
    fontSize: 7,
    letterSpacing: 0.55,
  },
  financeLabelLight: {
    ...indentReviewHubText.freightGridLabelLight,
    fontSize: 7,
    letterSpacing: 0.55,
    marginBottom: 0,
  },
  financeValueDark: {
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: Theme.textOnDark,
    letterSpacing: -0.2,
    marginTop: 4,
    marginBottom: 6,
  },
  financeValueDarkCompact: {
    fontSize: 13,
  },
  financeValueWithSub: {
    marginBottom: 0,
  },
  financeSubDark: {
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: Theme.textOnDarkMuted,
    marginTop: 2,
    marginBottom: 6,
  },
  financeSubLight: {
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: Theme.textSecondary,
    marginTop: 2,
    marginBottom: 6,
  },
  financeValueLight: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    marginTop: 4,
    marginBottom: 6,
  },
  financeValueLightCompact: {
    fontSize: 12,
  },
  clientRateTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clientEntityDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginTop: 4,
    marginBottom: 2,
  },
  clientEntitySlot: {
    marginTop: 0,
  },
  vendorEntitySlot: {
    marginTop: 10,
    gap: 2,
  },
  vendorName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  vendorRate: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  marginChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(16,185,129,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16,185,129,0.32)",
  },
  marginChipText: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.35,
    color: Theme.positiveMuted,
  },
  baselineChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  baselineChipText: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
  },
  heroPressable: { minWidth: 0 },
  heroBlock: { gap: 1 },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  heroKicker: {
    ...indentReviewHubText.freightGridLabelLight,
    fontSize: 7,
    marginBottom: 0,
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  heroCurrency: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  heroAmount: {
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  heroAmountCompact: {
    fontSize: 13,
  },
  heroReference: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 9,
    marginTop: 1,
  },
  heroTapHint: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 9,
    color: Theme.positive,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.25,
  },
  statusPending: { backgroundColor: Theme.surfaceGray },
  statusPendingText: { color: Theme.textMuted },
  statusAwarded: { backgroundColor: "#FEF3C7" },
  statusAwardedText: { color: "#B45309" },
  statusRejected: { backgroundColor: "#FEE2E2" },
  statusRejectedText: { color: "#B91C1C" },
  insightWrap: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positiveMutedDarkBorder,
    backgroundColor: Theme.positiveMuted,
  },
  insightWrapCompact: {
    borderRadius: 10,
  },
  insightWrapStacked: {
    width: "100%",
  },
  childrenSlot: {
    marginTop: 2,
  },
});
