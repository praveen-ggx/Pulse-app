/**
 * Mobile load detail — Get/Give load chrome matching the HTML get-load flow
 * (Ajio density: small type, route card, timeline, sticky CTAs).
 *
 * Backend props/handlers unchanged — UI only.
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Clipboard from "expo-clipboard";
import { ArrowRight, MessageCircle, Truck } from "lucide-react-native";
import { memo, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { IndentFreightCardClientProps } from "@/features/indents/components/IndentFreightCard";
import { IndentFreightClientEntity } from "@/features/indents/components/IndentFreightClientEntity";
import { splitLocationParts } from "@/features/network/utils/storyDisplay";
import { formatINR } from "@/lib/format";
import {
  EMPTY_ROUTE_EXTRA_STOP_SUMMARY,
  extraStopChipLabel,
  extraStopPaidLabel,
  type RouteExtraStopSummary,
} from "@/features/trips/utils/routeExtraStops.util";
import { RouteExtraStopsPlan } from "@/features/trips/components/RouteExtraStopsPlan";
import type { RouteExtraStopRow } from "@/features/trips/services/routeExtraStops.service";

const NO_EXTRA_STOP_ROWS: readonly RouteExtraStopRow[] = [];

const LINK = "#2563EB";
const INK = "#111827";
const MUTED = "#6B7280";
const BODY = "#4B5563";
const CANVAS = "#F0F2F5";
const BORDER = "#E5E7EB";
const CARD_EDGE = "#D1D5DB";
const GREEN = "#15803D";
const AMBER = "#B45309";
const BLUE_DOT = "#3B82F6";
const PAD = 14;

export type IndentMobileLoadDetailProps = {
  isOwner: boolean;
  typeLabel: string;
  status: string;
  isDirect: boolean;
  /** Originated from a Commerce (multi-order e-commerce) execution plan. */
  isCommerce?: boolean;
  loadId: string;
  dateLabel: string;
  createdAtLabel: string;
  pickupDateIso: string | null;
  origin: string;
  destination: string;
  vehicleType: string;
  weightKg: string;
  material: string;
  liveBidsCount: number;
  canCancelLoad?: boolean;
  cancelling?: boolean;
  onCancelLoad?: () => void;
  canEditLoad?: boolean;
  onEditAll?: () => void;
  primaryAmount: string;
  supplierRate?: string;
  /** ₹/MT under the client rate, when the main figure is the trip total. */
  clientPerMt?: string | null;
  /** Trip total under the client rate, when the main figure is ₹/MT. */
  clientOverall?: string | null;
  /** ₹/MT under the supplier target, when the main figure is the trip total. */
  supplierPerMt?: string | null;
  /** Trip total under the supplier target, when the main figure is ₹/MT. */
  supplierOverall?: string | null;
  marginPct?: number | null;
  clientPriceInr?: number;
  supplierTargetInr?: number;
  /** Stops in between; their charges are already inside the shown rates. */
  extraStops?: RouteExtraStopSummary;
  /** The stops themselves, in order — listed under the route. */
  extraStopRows?: readonly RouteExtraStopRow[];
  vendorName?: string | null;
  vendorRate?: string | null;
  client: IndentFreightCardClientProps;
  quoteStatus?: string | null;
  quoteAmountInr?: number | null;
  counterAmountInr?: number | null;
  targetRateInr?: number;
  onQuotePress?: () => void;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  bidsSlot?: ReactNode;
  partiesStrip?: ReactNode;
  children?: ReactNode;
};

type Step = {
  key: string;
  label: string;
  date?: string;
  done: boolean;
  tone?: "green" | "amber" | "pending";
};

function norm(v: string): string {
  return v.trim().toLowerCase();
}

function shortDate(iso: string | null | undefined): string | undefined {
  if (!iso?.trim()) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return undefined;
  }
}

/** HTML flow: 5 step dots — browse → bid → my bid → ownership → trip */
function flowStepIndex(args: {
  isOwner: boolean;
  status: string;
  hasQuote: boolean;
  quoteStatus: string | null | undefined;
  liveBids: number;
}): number {
  const { isOwner, status, hasQuote, quoteStatus, liveBids } = args;
  const s = norm(status);
  const q = norm(quoteStatus ?? "");
  if (isOwner) {
    if (s === "completed" || s === "deployed" || s === "assigned") return 4;
    if (s === "awarded") return 3;
    if (liveBids > 0) return 2;
    if (s === "broadcast" || s === "open") return 1;
    return 0;
  }
  if (s === "completed" || s === "deployed" || s === "assigned") return 4;
  if (q === "accepted") return 3;
  if (hasQuote) return 2;
  return 0;
}

function buildOwnerSteps(args: {
  status: string;
  createdAtLabel: string;
  pickupIso: string | null;
  bids: number;
}): Step[] {
  const { status, createdAtLabel, pickupIso, bids } = args;
  const s = norm(status);
  const placed = createdAtLabel !== "—" ? createdAtLabel : undefined;
  const pickup = shortDate(pickupIso);

  if (s === "cancelled" || s === "closed") {
    return [
      { key: "c0", label: "Posted", date: placed, done: true, tone: "green" },
      { key: "c1", label: "Cancelled", date: placed, done: true, tone: "amber" },
    ];
  }

  const awarded = s === "awarded" || s === "deployed" || s === "assigned" || s === "completed";
  const bidding = bids > 0 || s === "open" || s === "broadcast";

  return [
    { key: "o0", label: "Posted", date: placed, done: true, tone: "green" },
    {
      key: "o1",
      label: bids > 0 ? `${bids} bid${bids === 1 ? "" : "s"} received` : "Bidding open",
      date: bidding ? placed : undefined,
      done: bidding || awarded,
      tone: bidding || awarded ? "green" : "pending",
    },
    {
      key: "o2",
      label: awarded ? "Awarded" : "Awarded",
      date: awarded ? pickup ?? placed : undefined,
      done: awarded,
      tone: awarded ? "green" : "pending",
    },
  ];
}

function buildBidSteps(args: {
  quoteStatus: string | null | undefined;
  hasQuote: boolean;
  createdAtLabel: string;
  counterAmount: number | null;
  quoteAmount: number | null;
}): Step[] {
  const { quoteStatus, hasQuote, createdAtLabel, counterAmount, quoteAmount } = args;
  const s = norm(quoteStatus ?? "");
  const placed = createdAtLabel !== "—" ? createdAtLabel : undefined;

  if (!hasQuote) {
    return [
      { key: "b0", label: "Posted", date: placed, done: true, tone: "green" },
      { key: "b1", label: "Bidding open", done: false, tone: "pending" },
    ];
  }

  const steps: Step[] = [
    {
      key: "b0",
      label: "Bid submitted",
      date:
        quoteAmount != null && quoteAmount > 0
          ? `${formatINR(quoteAmount)}${placed ? ` · ${placed}` : ""}`
          : placed,
      done: true,
      tone: "green",
    },
  ];

  if (counterAmount != null && counterAmount > 0 && s === "pending") {
    steps.push({
      key: "b1",
      label: "Countered by shipper",
      date: formatINR(counterAmount),
      done: true,
      tone: "amber",
    });
  } else if (s === "pending") {
    steps.push({
      key: "b1",
      label: "Under review",
      date: placed,
      done: true,
      tone: "green",
    });
  }

  if (s === "accepted") {
    steps.push({
      key: "b2",
      label: "Bids won",
      date: placed,
      done: true,
      tone: "green",
    });
  } else if (s === "rejected") {
    steps.push({
      key: "b2",
      label: "Not selected",
      date: placed,
      done: true,
      tone: "amber",
    });
  } else {
    steps.push({
      key: "b2",
      label: "Bids won",
      done: false,
      tone: "pending",
    });
  }

  return steps;
}

function FlowProgress({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.steps}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[styles.stepDot, i <= activeIndex && styles.stepDotDone]}
        />
      ))}
    </View>
  );
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <View style={styles.timeline}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const tone = step.tone ?? (step.done ? "green" : "pending");
        return (
          <View key={step.key} style={styles.tlItem}>
            {!isLast ? <View style={styles.tlLine} /> : null}
            <View
              style={[
                styles.tlDot,
                tone === "green" && styles.tlDotGreen,
                tone === "amber" && styles.tlDotAmber,
                tone === "pending" && styles.tlDotPending,
              ]}
            />
            <View style={styles.tlBody}>
              <Text
                style={[
                  styles.tlTitle,
                  tone === "pending" && styles.tlTitleMuted,
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
              {step.date ? (
                <Text style={styles.tlSub} numberOfLines={1}>
                  {step.date}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RateBreakupRow({
  label,
  value,
  positive,
  strong,
}: {
  label: string;
  value: string;
  positive?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={[styles.breakupRow, strong && styles.breakupRowTotal]}>
      <Text style={[styles.breakupLabel, strong && styles.breakupStrong]}>
        {label}
      </Text>
      <Text
        style={[
          styles.breakupValue,
          positive && styles.breakupPositive,
          strong && styles.breakupStrong,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function statusPillStyle(kind: "gray" | "amber" | "green" | "blue") {
  switch (kind) {
    case "amber":
      return { wrap: styles.pillAmber, text: styles.pillAmberText };
    case "green":
      return { wrap: styles.pillGreen, text: styles.pillGreenText };
    case "blue":
      return { wrap: styles.pillBlue, text: styles.pillBlueText };
    default:
      return { wrap: styles.pillGray, text: styles.pillGrayText };
  }
}

export const IndentMobileLoadDetail = memo(function IndentMobileLoadDetail({
  isOwner,
  typeLabel,
  status,
  isDirect,
  isCommerce = false,
  loadId,
  dateLabel,
  createdAtLabel,
  pickupDateIso,
  origin,
  destination,
  vehicleType,
  weightKg,
  material,
  liveBidsCount,
  canCancelLoad,
  cancelling,
  onCancelLoad,
  canEditLoad,
  onEditAll,
  primaryAmount,
  supplierRate = "—",
  clientPerMt = null,
  clientOverall = null,
  supplierPerMt = null,
  supplierOverall = null,
  marginPct = null,
  clientPriceInr = 0,
  supplierTargetInr = 0,
  extraStops = EMPTY_ROUTE_EXTRA_STOP_SUMMARY,
  extraStopRows = NO_EXTRA_STOP_ROWS,
  vendorName = null,
  vendorRate = null,
  client,
  quoteStatus,
  quoteAmountInr,
  counterAmountInr = null,
  targetRateInr = 0,
  onQuotePress,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  bidsSlot,
  partiesStrip,
  children,
}: IndentMobileLoadDetailProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const statusLower = norm(status);
  const hasQuote = quoteAmountInr != null && quoteAmountInr > 0;
  const quoteNorm = norm(quoteStatus ?? "");
  const counter =
    counterAmountInr != null && counterAmountInr > 0 ? counterAmountInr : null;
  const displayBidInr = counter ?? (hasQuote ? quoteAmountInr! : 0);

  const originParts = splitLocationParts(origin);
  const destParts = splitLocationParts(destination);

  const flowIndex = flowStepIndex({
    isOwner,
    status,
    hasQuote,
    quoteStatus,
    liveBids: liveBidsCount,
  });

  const steps = useMemo(
    () =>
      isOwner
        ? buildOwnerSteps({
            status,
            createdAtLabel,
            pickupIso: pickupDateIso,
            bids: liveBidsCount,
          })
        : buildBidSteps({
            quoteStatus,
            hasQuote,
            createdAtLabel,
            counterAmount: counter,
            quoteAmount: hasQuote ? quoteAmountInr! : null,
          }),
    [
      isOwner,
      status,
      createdAtLabel,
      pickupDateIso,
      liveBidsCount,
      quoteStatus,
      hasQuote,
      counter,
      quoteAmountInr,
    ],
  );

  const marginInr =
    isOwner && clientPriceInr > 0 && supplierTargetInr > 0
      ? clientPriceInr - supplierTargetInr
      : null;

  const extraStopSide = isOwner ? "client" : "supplier";
  const extraStopChip = extraStopChipLabel(extraStops.count);
  const extraStopPaid = extraStopPaidLabel(extraStops, extraStopSide, formatINR);
  const extraStopCharge =
    extraStopSide === "client" ? extraStops.clientCharge : extraStops.supplierCharge;

  const chips = useMemo(() => {
    const list: { label: string; accent?: boolean }[] = [];
    if (extraStopChip) list.push({ label: extraStopChip, accent: true });
    if (vehicleType && vehicleType !== "—") list.push({ label: vehicleType });
    if (weightKg && weightKg !== "—") list.push({ label: weightKg });
    if (material && material !== "—") list.push({ label: material });
    if (dateLabel && dateLabel !== "—") {
      list.push({ label: dateLabel, accent: true });
    }
    return list;
  }, [extraStopChip, vehicleType, weightKg, material, dateLabel]);

  const title = isOwner ? "Load detail" : hasQuote ? "My bid" : "Load detail";

  const pill = (() => {
    if (isOwner) {
      if (statusLower === "open" || statusLower === "broadcast") {
        return { label: isDirect ? "Direct" : "My loads", kind: "gray" as const };
      }
      if (statusLower === "awarded") {
        return { label: "Awarded", kind: "green" as const };
      }
      return {
        label: status.trim() || typeLabel,
        kind: "gray" as const,
      };
    }
    if (!hasQuote) {
      return {
        label: isDirect ? "Direct" : "Open market",
        kind: "gray" as const,
      };
    }
    if (quoteNorm === "accepted") {
      return { label: "Bids won", kind: "green" as const };
    }
    if (quoteNorm === "rejected") {
      return { label: "Rejected", kind: "gray" as const };
    }
    if (counter) {
      return { label: "Countered", kind: "amber" as const };
    }
    return { label: "Pending", kind: "blue" as const };
  })();

  const rateLabel = isOwner
    ? "Client rate"
    : hasQuote
      ? "Your bid"
      : "Offer";

  const rateValue = isOwner
    ? primaryAmount
    : hasQuote
      ? formatINR(hasQuote ? quoteAmountInr! : 0)
      : targetRateInr > 0
        ? formatINR(targetRateInr)
        : "—";

  const rateDelta =
    isOwner && vendorName
      ? `Vendor · ${vendorName}`
      : !isOwner && counter != null
        ? `Countered ${formatINR(counter)}`
        : isOwner && marginInr != null && marginInr > 0
          ? `Margin ${formatINR(marginInr)}${marginPct != null ? ` (${marginPct}%)` : ""}`
          : null;

  const resolvedPrimary =
    primaryActionLabel ??
    (onPrimaryAction
      ? "Continue"
      : onQuotePress
        ? hasQuote
          ? counter
            ? `Accept ${formatINR(counter)}`
            : "Update bid"
          : "Submit bid"
        : null);

  const resolvedSecondary =
    secondaryActionLabel ??
    (isOwner && canCancelLoad && resolvedPrimary !== "Cancel indent"
      ? cancelling
        ? "Cancelling…"
        : "Cancel indent"
      : !isOwner && hasQuote && quoteNorm === "pending" && counter && onQuotePress
        ? "Update bid"
        : null);

  const handlePrimary = () => {
    if (onPrimaryAction) {
      onPrimaryAction();
      return;
    }
    if (onQuotePress) {
      onQuotePress();
      return;
    }
    if (canEditLoad && onEditAll) onEditAll();
  };

  const handleSecondary = () => {
    if (onSecondaryAction) {
      onSecondaryAction();
      return;
    }
    if (isOwner && canCancelLoad) {
      onCancelLoad?.();
      return;
    }
    if (!isOwner && onQuotePress) onQuotePress();
  };

  const showPrimary = Boolean(
    resolvedPrimary && (onPrimaryAction || onQuotePress || (canEditLoad && onEditAll)),
  );
  const showSecondary = Boolean(
    resolvedSecondary &&
      (onSecondaryAction ||
        (isOwner && canCancelLoad) ||
        (!isOwner && onQuotePress && counter)),
  );

  const copyText = async (label: string, value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      Alert.alert("Copied", `${label} copied.`);
    } catch {
      Alert.alert("Copy failed", `Could not copy ${label}.`);
    }
  };

  const pillStyles = statusPillStyle(pill.kind);
  const timelineTitle = isOwner
    ? "Trip status"
    : hasQuote
      ? "Negotiation"
      : "Trip status";

  return (
    <View style={styles.root}>
      {/* Topbar */}
      <View style={styles.topbar}>
        <Text style={styles.title}>{title}</Text>
        {isCommerce ? (
          <View style={styles.commercePill} accessibilityLabel="Originated from Pulse Commerce">
            <Text style={styles.commercePillText} numberOfLines={1}>
              COMMERCE
            </Text>
          </View>
        ) : null}
        <View style={[styles.pill, pillStyles.wrap]}>
          <Text style={[styles.pillText, pillStyles.text]} numberOfLines={1}>
            {pill.label}
          </Text>
        </View>
      </View>

      <FlowProgress activeIndex={flowIndex} />

      <View style={styles.content}>
        {/* Route / rate card */}
        <View style={styles.card}>
          <View style={styles.routeRow}>
            <View style={styles.routeCol}>
              <View style={styles.dotline}>
                <View style={[styles.dot, styles.dotBlue]} />
                <Text style={styles.labelXxs}>Pickup</Text>
              </View>
              <Text style={styles.city} numberOfLines={1}>
                {originParts.city}
              </Text>
              {originParts.state ? (
                <Text style={styles.subcity} numberOfLines={1}>
                  {originParts.state}
                </Text>
              ) : null}
            </View>
            <View style={styles.arrowMid}>
              <ArrowRight size={12} color="#d1d5db" strokeWidth={2.2} />
            </View>
            <View style={[styles.routeCol, styles.routeColEnd]}>
              <View style={[styles.dotline, styles.dotlineEnd]}>
                <Text style={styles.labelXxs}>Drop</Text>
                <View style={[styles.dot, styles.dotGreen]} />
              </View>
              <Text style={[styles.city, styles.cityEnd]} numberOfLines={1}>
                {destParts.city}
              </Text>
              {destParts.state ? (
                <Text style={[styles.subcity, styles.cityEnd]} numberOfLines={1}>
                  {destParts.state}
                </Text>
              ) : null}
            </View>
          </View>

          <RouteExtraStopsPlan
            stops={extraStopRows}
            side={extraStopSide}
            style={styles.extraStopsPlan}
          />

          {chips.length > 0 ? (
            <View style={styles.chipRow}>
              {chips.map((c) => (
                <View
                  key={c.label}
                  style={[styles.chip, c.accent && styles.chipDate]}
                >
                  <Text
                    style={[styles.chipText, c.accent && styles.chipDateText]}
                    numberOfLines={1}
                  >
                    {c.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.dividerDash} />

          <View style={styles.rateRow}>
            <View style={styles.rateCol}>
              <Text style={styles.rateLabel}>{rateLabel}</Text>
              <Text style={styles.rateValue} numberOfLines={1}>
                {rateValue}
              </Text>
              {extraStopPaid ? (
                <Text style={styles.rateDelta} numberOfLines={1}>
                  {extraStopPaid}
                </Text>
              ) : null}
              {rateDelta ? (
                <Text style={styles.rateDelta} numberOfLines={1}>
                  {rateDelta}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => setDetailsOpen((v) => !v)}
              hitSlop={Layout.touchTargetHitSlop}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              accessibilityLabel={detailsOpen ? "View less" : "View more"}
            >
              <Text style={styles.linkBlue}>
                {detailsOpen ? "View less" : "View more →"}
              </Text>
            </TouchableOpacity>
          </View>

          {detailsOpen ? (
            <View style={styles.breakupPanel}>
              {isOwner ? (
                <>
                  <RateBreakupRow label="Client rate" value={clientPerMt ?? primaryAmount} />
                  {clientOverall ? <RateBreakupRow label="Client total" value={clientOverall} /> : null}
                  <RateBreakupRow label="Supplier target" value={supplierPerMt ?? supplierRate} />
                  {supplierOverall ? <RateBreakupRow label="Supplier total" value={supplierOverall} /> : null}
                  {marginInr != null ? (
                    <RateBreakupRow
                      label="Target margin"
                      value={
                        marginPct != null
                          ? `${formatINR(marginInr)} (${marginPct}%)`
                          : formatINR(marginInr)
                      }
                      positive
                    />
                  ) : null}
                </>
              ) : !hasQuote ? (
                <>
                  <RateBreakupRow
                    label="Shipper target"
                    value={targetRateInr > 0 ? formatINR(targetRateInr) : "—"}
                    strong
                  />
                  <RateBreakupRow
                    label={client.anonymous ? "Pool quote" : "Your bid"}
                    value="Not submitted"
                  />
                </>
              ) : (
                <>
                  <RateBreakupRow
                    label="Shipper target"
                    value={targetRateInr > 0 ? formatINR(targetRateInr) : "—"}
                  />
                  <RateBreakupRow
                    label="Your bid"
                    value={formatINR(quoteAmountInr!)}
                    strong={!counter}
                  />
                  {counter != null ? (
                    <RateBreakupRow
                      label="Counter offer"
                      value={formatINR(counter)}
                      strong
                      positive
                    />
                  ) : null}
                </>
              )}
              {extraStops.count > 0 && extraStopCharge > 0 ? (
                <RateBreakupRow
                  label={`Extra stops (${extraStops.count}) · included`}
                  value={formatINR(extraStopCharge)}
                />
              ) : null}
              <RateBreakupRow
                label="Total"
                value={
                  isOwner
                    ? primaryAmount
                    : hasQuote
                      ? formatINR(displayBidInr)
                      : targetRateInr > 0
                        ? formatINR(targetRateInr)
                        : "—"
                }
                strong
              />
            </View>
          ) : null}
        </View>

        {bidsSlot ? <View style={styles.bidsSlot}>{bidsSlot}</View> : null}

        {detailsOpen ? (
          <>
            {/* Timeline card */}
            <View style={styles.card}>
              <View style={styles.sectionTitle}>
                <View style={styles.sectionIcon}>
                  {hasQuote && !isOwner ? (
                    <MessageCircle size={10} color={INK} strokeWidth={2.4} />
                  ) : (
                    <Truck size={10} color={INK} strokeWidth={2.4} />
                  )}
                </View>
                <Text style={styles.sectionTitleText}>{timelineTitle}</Text>
              </View>
              <Timeline steps={steps} />
            </View>

            {/* Owner parties */}
            {isOwner ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitleText}>Parties</Text>
                <View style={styles.clientPartyCard}>
                  <View style={styles.clientPartyMain}>
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
                      avatarSize={32}
                    />
                  </View>
                  <View style={styles.clientPartyRate}>
                    <Text style={styles.labelXxs}>Rate</Text>
                    <Text style={styles.clientPartyRateValue} numberOfLines={1}>
                      {primaryAmount}
                    </Text>
                  </View>
                </View>
                {vendorName ? (
                  <View style={styles.clientPartyCard}>
                    <View style={styles.clientPartyMain}>
                      <Text style={styles.labelXxs}>VENDOR</Text>
                      <Text style={styles.vendorPartyName} numberOfLines={1}>
                        {vendorName}
                      </Text>
                    </View>
                    {vendorRate ? (
                      <View style={styles.clientPartyRate}>
                        <Text style={styles.labelXxs}>Awarded</Text>
                        <Text style={styles.clientPartyRateValue} numberOfLines={1}>
                          {vendorRate}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {partiesStrip ? (
                  <View style={styles.partiesStripWrap}>{partiesStrip}</View>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {children ? <View style={styles.children}>{children}</View> : null}

        <View style={styles.footerMeta}>
          <TouchableOpacity
            onPress={() => void copyText("Load ID", loadId)}
            hitSlop={Layout.touchTargetHitSlop}
            style={styles.footerMetaHit}
          >
            <Text style={styles.footerMetaText} numberOfLines={1}>
              {loadId}
            </Text>
            <Text style={styles.linkBlueSm}>Copy</Text>
          </TouchableOpacity>
          <Text style={styles.footerMetaText} numberOfLines={1}>
            Posted {createdAtLabel}
          </Text>
        </View>
      </View>

      {/* CTA bar */}
      {showPrimary || showSecondary ? (
        <View style={styles.ctaBar}>
          {showSecondary && resolvedSecondary ? (
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={handleSecondary}
              disabled={cancelling}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={resolvedSecondary}
            >
              <Text style={styles.btnSecondaryText} numberOfLines={1}>
                {resolvedSecondary}
              </Text>
            </TouchableOpacity>
          ) : null}
          {showPrimary && resolvedPrimary ? (
            <TouchableOpacity
              style={[
                styles.btnPrimary,
                showSecondary && styles.btnPrimaryFlex,
                !showSecondary && styles.btnPrimaryFull,
              ]}
              onPress={handlePrimary}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={resolvedPrimary}
            >
              <Text style={styles.btnPrimaryText} numberOfLines={1}>
                {resolvedPrimary}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {isOwner && canEditLoad ? (
        <TouchableOpacity
          style={styles.editLinkRow}
          onPress={onEditAll}
          hitSlop={Layout.touchTargetHitSlop}
        >
          <FontAwesome name="pencil" size={11} color={LINK} />
          <Text style={styles.linkBlue}>Edit load</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
  web: {
    boxShadow:
      "0 1px 2px rgba(15,23,42,.04), 0 4px 12px rgba(15,23,42,.06)",
  } as object,
  default: {},
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    backgroundColor: CANVAS,
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: PAD,
    paddingTop: 10,
    paddingBottom: 0,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: INK,
    flexShrink: 1,
    letterSpacing: -0.15,
  },
  pill: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  /** Marks an Indent that originated from a Commerce execution plan. Text-based — not color-only. */
  commercePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    flexShrink: 0,
  },
  commercePillText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: MUTED,
  },
  pillText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  pillGray: { backgroundColor: "#F3F4F6", borderColor: BORDER },
  pillGrayText: { color: MUTED },
  pillAmber: { backgroundColor: "#FEF3C7", borderColor: "rgba(180,83,9,0.2)" },
  pillAmberText: { color: "#92400E" },
  pillGreen: {
    backgroundColor: "#ECFDF5",
    borderColor: "rgba(21,128,61,0.18)",
  },
  pillGreenText: { color: GREEN },
  pillBlue: {
    backgroundColor: "#EFF6FF",
    borderColor: "rgba(37,99,235,0.22)",
  },
  pillBlueText: { color: LINK },
  steps: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: PAD,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: Theme.cardWhite,
  },
  stepDot: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    flex: 1,
  },
  stepDotDone: {
    backgroundColor: INK,
  },
  content: {
    paddingHorizontal: PAD,
    paddingBottom: 8,
    paddingTop: 2,
    backgroundColor: CANVAS,
    gap: 0,
  },
  card: {
    borderWidth: 1,
    borderColor: CARD_EDGE,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    backgroundColor: Theme.cardWhite,
    ...cardShadow,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  routeCol: { flex: 1, minWidth: 0 },
  routeColEnd: { alignItems: "flex-end" },
  extraStopsPlan: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  dotline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dotlineEnd: { justifyContent: "flex-end" },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  dotBlue: { backgroundColor: BLUE_DOT },
  dotGreen: { backgroundColor: GREEN },
  labelXxs: {
    fontSize: 9,
    letterSpacing: 0.45,
    color: MUTED,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  city: {
    fontSize: 14,
    fontWeight: "700",
    color: INK,
    marginTop: 3,
    letterSpacing: -0.15,
  },
  cityEnd: { textAlign: "right" },
  subcity: {
    fontSize: 11,
    color: BODY,
    marginTop: 2,
  },
  arrowMid: {
    paddingTop: 10,
    paddingHorizontal: 4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  chip: {
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "500",
    color: BODY,
  },
  chipDate: {
    backgroundColor: "#EFF6FF",
    borderColor: "rgba(37,99,235,0.28)",
  },
  chipDateText: {
    fontSize: 10,
    fontWeight: "600",
    color: LINK,
  },
  dividerDash: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: "#E5E7EB",
    marginVertical: 10,
  },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 8,
  },
  rateCol: { flex: 1, minWidth: 0 },
  rateLabel: {
    fontSize: 9,
    letterSpacing: 0.45,
    color: MUTED,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  rateValue: {
    fontSize: 17,
    fontWeight: "700",
    color: INK,
    marginTop: 2,
    letterSpacing: -0.25,
    fontVariant: ["tabular-nums"],
  },
  rateDelta: {
    fontSize: 10,
    fontWeight: "700",
    color: GREEN,
    marginTop: 2,
  },
  linkBlue: {
    color: LINK,
    fontSize: 10.5,
    fontWeight: "700",
  },
  linkBlueSm: {
    color: LINK,
    fontSize: 9.5,
    fontWeight: "700",
  },
  breakupPanel: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    gap: 0,
  },
  breakupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    gap: 8,
  },
  breakupLabel: {
    fontSize: 10.5,
    color: BODY,
    flex: 1,
  },
  breakupValue: {
    fontSize: 10.5,
    color: BODY,
    fontVariant: ["tabular-nums"],
  },
  breakupPositive: { color: GREEN, fontWeight: "700" },
  breakupStrong: {
    fontWeight: "700",
    color: INK,
  },
  breakupRowTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    marginTop: 3,
    paddingTop: 7,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 9,
  },
  sectionIcon: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitleText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: INK,
  },
  timeline: {
    paddingLeft: 16,
  },
  tlItem: {
    position: "relative",
    paddingBottom: 14,
  },
  tlLine: {
    position: "absolute",
    left: -12.5,
    top: 10,
    width: 1,
    bottom: 0,
    backgroundColor: "#e5e7eb",
  },
  tlDot: {
    position: "absolute",
    left: -16,
    top: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tlDotGreen: {
    backgroundColor: GREEN,
    shadowColor: "#eafaf0",
    shadowOpacity: 1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  tlDotAmber: {
    backgroundColor: AMBER,
  },
  tlDotPending: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#d1d5db",
  },
  tlBody: { minWidth: 0 },
  tlTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: INK,
  },
  tlTitleMuted: {
    color: MUTED,
    fontWeight: "600",
  },
  tlSub: {
    fontSize: 9.5,
    color: MUTED,
    marginTop: 1,
  },
  clientPartyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 9,
  },
  clientPartyMain: { flex: 1, minWidth: 0 },
  clientPartyRate: { alignItems: "flex-end", flexShrink: 0 },
  clientPartyRateValue: {
    fontSize: 12,
    fontWeight: "700",
    color: INK,
    marginTop: 2,
  },
  vendorPartyName: {
    fontSize: 13,
    fontWeight: "700",
    color: INK,
    marginTop: 2,
  },
  partiesStripWrap: { marginTop: 10 },
  bidsSlot: {
    marginTop: 12,
    width: "100%",
    alignSelf: "stretch",
  },
  children: { marginTop: 10 },
  footerMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 4,
    gap: 8,
  },
  footerMetaHit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  footerMetaText: {
    fontSize: 9.5,
    color: MUTED,
    flexShrink: 1,
  },
  ctaBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    paddingHorizontal: PAD,
    paddingVertical: 11,
    flexDirection: "row",
    gap: 7,
    backgroundColor: Theme.cardWhite,
  },
  btnPrimary: {
    backgroundColor: INK,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  btnPrimaryFlex: { flex: 1.35 },
  btnPrimaryFull: { flex: 1 },
  btnPrimaryText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#fff",
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  btnSecondaryText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#6b7280",
  },
  editLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: CANVAS,
  },
});
