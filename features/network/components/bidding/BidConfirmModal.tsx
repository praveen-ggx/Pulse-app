/**
 * Bid confirm + success — review offer, then celebrate submit / update
 * with an animated check and confetti burst.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import { platformShadow } from "@/lib/platformShadow";
import { resolveBidVsTarget } from "@/components/mobile-input/bidVsTarget";
import { BidVsTargetHint } from "@/components/mobile-input/BidVsTargetHint";
import {
  ArrowRight,
  Building2,
  Check,
  MapPin,
  MessageSquare,
  Sparkles,
  TicketX,
  Truck,
  X,
} from "lucide-react-native";
import { MotiView } from "moti";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing as RNEasing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SHEET_EASE = Easing.bezier(0.16, 1, 0.3, 1);
const TICKET_CORNER = 22;
const TICKET_HOLE = 10;

/** Ticket silhouette: rounded card with transparent side punches. */
function ticketClipPath(width: number, height: number, holeY: number): string {
  const w = Math.max(width, TICKET_CORNER * 2 + 8);
  const h = Math.max(height, TICKET_CORNER * 2 + TICKET_HOLE * 2 + 8);
  const y = Math.min(Math.max(holeY, TICKET_CORNER + TICKET_HOLE + 4), h - TICKET_CORNER - TICKET_HOLE - 4);
  const r = TICKET_CORNER;
  const hr = TICKET_HOLE;
  return [
    `M ${r} 0`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${y - hr}`,
    `A ${hr} ${hr} 0 0 1 ${w} ${y + hr}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${y + hr}`,
    `A ${hr} ${hr} 0 0 1 0 ${y - hr}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join(" ");
}

const PARTICLE_COUNT = 24;
const SUBMIT_PARTICLE_COLORS = [
  Theme.driverEmerald,
  Theme.driverPrimary,
  Theme.accentGold,
  Theme.brandBlueSoft,
  Theme.positiveMuted,
  Theme.warningMuted,
];
const WITHDRAW_PARTICLE_COLORS = [
  Theme.warning,
  Theme.textMuted,
  Theme.negative,
  Theme.borderLight,
  Theme.warningMuted,
  Theme.textSecondary,
];

export type BidConfirmPhase = "review" | "success";

/**
 * A11.1 — Marketplace-only fee preview, computed by the caller from the one
 * authoritative RPC (calculate_marketplace_platform_fee). Optional and
 * rendered only when supplied, so non-Marketplace callers of this shared
 * modal (Reach/relationship direct_quotes bidding) are byte-for-byte
 * unaffected. Never derive "capped"/"amount" any other way than passing
 * through what that RPC already resolved.
 */
export type MarketplaceFeePreview =
  | { status: "loading" }
  | { status: "error" }
  | { status: "inactive" }
  | { status: "active"; amount: number; capped: boolean };

/** Copy overrides for callers whose one amount is sent as several bids (pooled loads). */
export type BidConfirmCopy = {
  /** Shown above the fee on review: what the amount applies to. */
  scopeNote?: string;
  /** Replaces the single-bid fee sentence; receives the RPC-resolved fee. */
  feeNote?: (feeInr: number) => string;
  successTitle?: string;
  successSubtitle?: string;
  /** Shown on cancel-bid review instead of scopeNote. */
  withdrawScopeNote?: string;
};

export type BidConfirmModalProps = {
  visible: boolean;
  phase?: BidConfirmPhase;
  isEditMode?: boolean;
  amount: number;
  ownerName?: string;
  origin?: string;
  destination?: string;
  vehicle?: string;
  weight?: string;
  material?: string;
  targetRate?: number | null;
  note?: string;
  submitting?: boolean;
  /** Marketplace-only. Omit entirely for Reach/relationship bidding. */
  marketplaceFee?: MarketplaceFeePreview;
  /** Render inside a parent modal instead of a second RN Modal (iOS stacked-modal tap bug). */
  embedded?: boolean;
  copy?: BidConfirmCopy;
  /** Review + persist a new/updated offer, or confirm removing a pending bid. */
  intent?: "submit" | "withdraw";
  onCancel: () => void;
  onConfirm: () => void;
  /** Dismiss after success celebration. */
  onSuccessDone?: () => void;
};

function deltaLabel(amount: number, target: number): {
  text: string;
  tone: "under" | "over" | "match";
} {
  const diff = amount - target;
  if (Math.abs(diff) < 0.5) {
    return { text: "At target", tone: "match" };
  }
  if (diff < 0) {
    return {
      text: `${formatINR(Math.abs(diff))} under`,
      tone: "under",
    };
  }
  return {
    text: `${formatINR(diff)} over`,
    tone: "over",
  };
}

function MetaIcon({ kind }: { kind: "route" | "truck" | "note" | "owner" }) {
  const color = Theme.textMuted;
  const stroke = 1.75;
  const size = 14;
  let icon: ReactNode;
  if (kind === "route") icon = <MapPin size={size} color={color} strokeWidth={stroke} />;
  else if (kind === "truck") icon = <Truck size={size} color={color} strokeWidth={stroke} />;
  else if (kind === "note")
    icon = <MessageSquare size={size} color={color} strokeWidth={stroke} />;
  else icon = <Building2 size={size} color={color} strokeWidth={stroke} />;
  return <View style={styles.metaIcon}>{icon}</View>;
}

export const BidConfirmModal = memo(function BidConfirmModal({
  visible,
  phase = "review",
  isEditMode = false,
  amount,
  ownerName,
  origin,
  destination,
  vehicle,
  weight,
  material,
  targetRate,
  note,
  submitting = false,
  marketplaceFee,
  embedded = false,
  copy,
  intent = "submit",
  onCancel,
  onConfirm,
  onSuccessDone,
}: BidConfirmModalProps) {
  const isWithdraw = intent === "withdraw";
  const insets = useSafeAreaInsets();
  const isSuccess = phase === "success";
  const [ticketBox, setTicketBox] = useState({ width: 0, height: 0, holeY: 0 });

  const checkScale = useRef(new Animated.Value(0.4)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.6)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  const stampTilt = useRef(new Animated.Value(18)).current;
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        color: (isWithdraw ? WITHDRAW_PARTICLE_COLORS : SUBMIT_PARTICLE_COLORS)[
          i % (isWithdraw ? WITHDRAW_PARTICLE_COLORS : SUBMIT_PARTICLE_COLORS).length
        ],
        x: (Math.random() - 0.5) * 300,
        delay: Math.random() * 160,
        size: 5 + Math.random() * 7,
        rotate: Math.random() * 360,
        fall: 220 + Math.random() * 140,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, isSuccess, isWithdraw],
  );
  const particleAnims = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      y: new Animated.Value(0),
      o: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    if (!visible || !isSuccess) {
      checkScale.setValue(0.4);
      checkOpacity.setValue(0);
      ringScale.setValue(0.6);
      ringOpacity.setValue(0);
      stampTilt.setValue(18);
      return;
    }

    Animated.parallel([
      Animated.spring(stampTilt, {
        toValue: -8,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringOpacity, {
            toValue: 0.55,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(ringScale, {
            toValue: 1.35,
            duration: 520,
            easing: RNEasing.out(RNEasing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    particleAnims.forEach((p, i) => {
      p.y.setValue(0);
      p.o.setValue(0);
      const pt = particles[i];
      Animated.sequence([
        Animated.delay(pt?.delay ?? 0),
        Animated.parallel([
          Animated.timing(p.o, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(p.y, {
            toValue: 1,
            duration: 1200 + (pt?.delay ?? 0),
            easing: RNEasing.out(RNEasing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(p.o, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [
    visible,
    isSuccess,
    checkScale,
    checkOpacity,
    ringScale,
    ringOpacity,
    stampTilt,
    particleAnims,
    particles,
  ]);

  // Auto-advance from success after a short beat (user can also tap Done).
  // Keep onSuccessDone in a ref so parent identity churn (cache refresh) does
  // not restart the timer and flicker the celebration.
  const onSuccessDoneRef = useRef(onSuccessDone);
  onSuccessDoneRef.current = onSuccessDone;
  useEffect(() => {
    if (!visible || !isSuccess) return;
    const t = setTimeout(
      () => onSuccessDoneRef.current?.(),
      isEditMode ? 3200 : 2800,
    );
    return () => clearTimeout(t);
  }, [visible, isSuccess, isEditMode]);

  const routeLine =
    origin && destination
      ? `${origin} → ${destination}`
      : origin || destination || undefined;

  const specs = [vehicle, weight, material].filter(Boolean).join(" · ");

  const vsTarget =
    targetRate != null && targetRate > 0
      ? deltaLabel(amount, targetRate)
      : null;

  const amountVsTarget = useMemo(
    () => resolveBidVsTarget(amount, targetRate),
    [amount, targetRate],
  );

  const confirmLabel = isWithdraw
    ? submitting
      ? "Cancelling…"
      : "Cancel bid"
    : submitting
      ? isEditMode
        ? "Updating…"
        : "Submitting…"
      : isEditMode
        ? "Confirm update"
        : "Confirm bid";

  const successTitle = isWithdraw
    ? "Bid cancelled"
    : (copy?.successTitle ?? (isEditMode ? "Quote updated" : "Quote submitted"));
  const successSubtitle = isWithdraw
    ? "This offer is no longer on the load. You can quote again if it is still open."
    : (copy?.successSubtitle ??
      (isEditMode
        ? "Your revised offer is live for the load owner."
        : "Your offer is live — the load owner can review it now."));

  const heroAmountColor =
    amountVsTarget?.tone === "over"
      ? Theme.negative
      : amountVsTarget?.tone === "under"
        ? Theme.positive
        : amountVsTarget?.tone === "match"
          ? Theme.driverEmeraldDark
          : Theme.textPrimaryDark;

  const metaRows = useMemo(() => {
    const rows: {
      key: string;
      label: string;
      value: string;
      icon: "route" | "truck" | "note" | "owner";
    }[] = [];
    if (ownerName?.trim()) {
      rows.push({
        key: "owner",
        label: "Load owner",
        value: ownerName.trim(),
        icon: "owner",
      });
    }
    if (routeLine) {
      rows.push({
        key: "route",
        label: "Lane",
        value: routeLine,
        icon: "route",
      });
    }
    if (specs) {
      rows.push({
        key: "specs",
        label: "Load",
        value: specs,
        icon: "truck",
      });
    }
    if (note?.trim()) {
      rows.push({
        key: "note",
        label: "Note",
        value: note.trim(),
        icon: "note",
      });
    }
    return rows;
  }, [ownerName, routeLine, specs, note]);

  if (embedded && !visible) {
    return null;
  }

  const sheet = (
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={
            submitting
              ? undefined
              : isSuccess
                ? onSuccessDone
                : onCancel
          }
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 180 }}
          style={styles.backdrop}
          pointerEvents="none"
        />

        {isSuccess
          ? particles.map((pt, i) => {
              const anim = particleAnims[i];
              if (!anim) return null;
              return (
                <Animated.View
                  key={pt.id}
                  pointerEvents="none"
                  style={[
                    styles.particle,
                    {
                      width: pt.size,
                      height: pt.size * 1.35,
                      backgroundColor: pt.color,
                      transform: [
                        { translateX: pt.x },
                        {
                          translateY: anim.y.interpolate({
                            inputRange: [0, 1],
                            outputRange: [36, pt.fall],
                          }),
                        },
                        { rotate: `${pt.rotate}deg` },
                      ],
                      opacity: anim.o,
                    },
                  ]}
                />
              );
            })
          : null}

        <MotiView
          key={visible ? (isSuccess ? "success" : "review") : "closed"}
          from={{ opacity: 0, scale: 0.92, translateY: 22 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 300, easing: SHEET_EASE }}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setTicketBox((prev) => {
              const holeY = prev.holeY > 0 ? prev.holeY : height * 0.56;
              if (
                prev.width === width &&
                prev.height === height &&
                Math.abs(prev.holeY - holeY) < 0.5
              ) {
                return prev;
              }
              return { width, height, holeY };
            });
          }}
          style={[
            styles.card,
            isSuccess && styles.cardSuccess,
            isSuccess && isWithdraw && styles.cardSuccessWithdraw,
            ticketBox.width > 0 &&
              ticketBox.holeY > 0 &&
              Platform.OS === "web"
              ? {
                  // @ts-expect-error web clip
                  clipPath: `path('${ticketClipPath(ticketBox.width, ticketBox.height, ticketBox.holeY)}')`,
                  WebkitClipPath: `path('${ticketClipPath(ticketBox.width, ticketBox.height, ticketBox.holeY)}')`,
                }
              : null,
          ]}
        >
          {isSuccess ? (
            <View style={styles.successBody}>
              <View
                style={[
                  styles.successRibbon,
                  isWithdraw && styles.successRibbonWithdraw,
                ]}
              >
                <Text
                  style={[
                    styles.successRibbonText,
                    isWithdraw && styles.successRibbonTextWithdraw,
                  ]}
                >
                  {isWithdraw ? "Offer withdrawn" : isEditMode ? "Revision live" : "Offer on the lane"}
                </Text>
              </View>

              <View style={styles.checkStage}>
                <Animated.View
                  style={[
                    styles.checkPulseRing,
                    isWithdraw && styles.checkPulseRingWithdraw,
                    {
                      opacity: ringOpacity,
                      transform: [{ scale: ringScale }],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.checkBadge,
                    isWithdraw && styles.checkBadgeWithdraw,
                    {
                      opacity: checkOpacity,
                      transform: [{ scale: checkScale }],
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.checkBadgeInner,
                      isWithdraw && styles.checkBadgeInnerWithdraw,
                    ]}
                  >
                    {isWithdraw ? (
                      <TicketX size={32} color={Theme.cardWhite} strokeWidth={2.4} />
                    ) : (
                      <Check size={36} color={Theme.cardWhite} strokeWidth={3} />
                    )}
                  </View>
                </Animated.View>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.successStamp,
                    isWithdraw && styles.successStampWithdraw,
                    {
                      opacity: checkOpacity,
                      transform: [
                        { rotate: stampTilt.interpolate({
                          inputRange: [-20, 20],
                          outputRange: ["-20deg", "20deg"],
                        }) },
                      ],
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.successStampText,
                      isWithdraw && styles.successStampTextWithdraw,
                    ]}
                  >
                    {isWithdraw ? "VOID" : "LIVE"}
                  </Text>
                </Animated.View>
              </View>

              <View style={styles.successTitleRow}>
                {isWithdraw ? (
                  <TicketX size={16} color={Theme.warning} strokeWidth={2.2} />
                ) : (
                  <Sparkles size={16} color={Theme.accentGold} strokeWidth={2.2} />
                )}
                <Text style={styles.successTitle}>{successTitle}</Text>
                {isWithdraw ? (
                  <TicketX size={16} color={Theme.warning} strokeWidth={2.2} />
                ) : (
                  <Sparkles size={16} color={Theme.accentGold} strokeWidth={2.2} />
                )}
              </View>
              <Text style={styles.successSubtitle}>{successSubtitle}</Text>

              <View
                style={[
                  styles.successTicket,
                  isWithdraw && styles.successTicketWithdraw,
                ]}
              >
                <View style={styles.successTicketNotchLeft} />
                <View style={styles.successTicketNotchRight} />
                <Text style={styles.successAmountLabel}>
                  {isWithdraw ? "Cancelled offer" : "Your offer"}
                </Text>
                <Text
                  style={[
                    styles.successAmount,
                    isWithdraw && styles.successAmountVoid,
                    !isWithdraw && amountVsTarget?.tone === "over" && styles.successAmountOver,
                    !isWithdraw && amountVsTarget?.tone === "under" && styles.successAmountUnder,
                  ]}
                >
                  {formatINR(amount)}
                </Text>
                {amountVsTarget && !isWithdraw ? (
                  <BidVsTargetHint
                    caption={amountVsTarget.caption}
                    tone={amountVsTarget.tone}
                  />
                ) : null}
                {routeLine ? (
                  <View style={styles.successLane}>
                    <MapPin size={12} color={Theme.textMuted} strokeWidth={2} />
                    <Text style={styles.successRoute} numberOfLines={1}>
                      {routeLine}
                    </Text>
                  </View>
                ) : null}
                {specs ? (
                  <Text style={styles.successSpecs} numberOfLines={1}>
                    {specs}
                  </Text>
                ) : null}
                <View style={styles.successPerf} />
                <Text style={styles.successStub}>
                  {isWithdraw
                    ? "Ticket closed · you can quote again"
                    : "Boarding the shipper review queue"}
                </Text>
              </View>

              <Pressable
                onPress={onSuccessDone}
                style={({ pressed }) => [
                  styles.btnDone,
                  isWithdraw && styles.btnDoneWithdraw,
                  pressed && styles.btnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.btnDoneText}>
                  {isWithdraw ? "Back to bids" : "Done"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.heroWash,
                  isWithdraw && styles.heroWashWithdraw,
                ]}
              >
                {!isWithdraw ? (
                  <>
                    <View
                      pointerEvents="none"
                      style={[styles.heroOrb, styles.heroOrbA]}
                    />
                    <View
                      pointerEvents="none"
                      style={[styles.heroOrb, styles.heroOrbB]}
                    />
                  </>
                ) : null}

                <View style={styles.stampRow}>
                  <View
                    style={[styles.stamp, isWithdraw && styles.stampWithdraw]}
                  >
                    <Text
                      style={[
                        styles.stampText,
                        isWithdraw && styles.stampTextWithdraw,
                      ]}
                    >
                      {isWithdraw
                        ? "Withdraw"
                        : isEditMode
                          ? "Revise"
                          : "New bid"}
                    </Text>
                  </View>
                  {vsTarget ? (
                    <View
                      style={[
                        styles.deltaPill,
                        vsTarget.tone === "under" && styles.deltaPillUnder,
                        vsTarget.tone === "over" && styles.deltaPillOver,
                        vsTarget.tone === "match" && styles.deltaPillMatch,
                      ]}
                    >
                      <Text
                        style={[
                          styles.deltaPillText,
                          vsTarget.tone === "under" &&
                            styles.deltaPillTextUnder,
                          vsTarget.tone === "over" && styles.deltaPillTextOver,
                          vsTarget.tone === "match" &&
                            styles.deltaPillTextMatch,
                        ]}
                      >
                        {vsTarget.text}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.heroEyebrow}>
                  {isWithdraw ? "Remove this offer" : "Confirm your offer"}
                </Text>
                <Text
                  style={[styles.heroAmount, { color: heroAmountColor }]}
                  accessibilityRole="header"
                >
                  {formatINR(amount)}
                </Text>
                {amountVsTarget ? (
                  <BidVsTargetHint
                    caption={amountVsTarget.caption}
                    tone={amountVsTarget.tone}
                    style={styles.heroDelta}
                  />
                ) : targetRate != null && targetRate > 0 ? (
                  <Text style={styles.heroTarget}>
                    Target {formatINR(targetRate)}
                  </Text>
                ) : (
                  <Text style={styles.heroTarget}>
                    {isWithdraw
                      ? "This pending bid will be removed"
                      : "Ready to send to the owner"}
                  </Text>
                )}

                {origin || destination ? (
                  <View style={styles.laneCard}>
                    <View style={styles.laneCity}>
                      <Text style={styles.laneKicker}>From</Text>
                      <Text style={styles.laneName} numberOfLines={2}>
                        {origin || "—"}
                      </Text>
                    </View>
                    <View style={styles.laneTrack} accessibilityElementsHidden>
                      <View style={styles.laneDot} />
                      <View style={styles.laneDash} />
                      <View style={styles.laneMid}>
                        {isWithdraw ? (
                          <X
                            size={12}
                            color={Theme.warning}
                            strokeWidth={2.6}
                          />
                        ) : (
                          <ArrowRight
                            size={12}
                            color={Theme.primary}
                            strokeWidth={2.6}
                          />
                        )}
                      </View>
                      <View style={styles.laneDash} />
                      <View style={[styles.laneDot, styles.laneDotEnd]} />
                    </View>
                    <View style={[styles.laneCity, styles.laneCityEnd]}>
                      <Text style={styles.laneKicker}>To</Text>
                      <Text style={styles.laneName} numberOfLines={2}>
                        {destination || "—"}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>

              <View
                style={styles.ticketEdge}
                onLayout={(event) => {
                  const { y, height } = event.nativeEvent.layout;
                  const holeY = y + height / 2;
                  setTicketBox((prev) =>
                    Math.abs(prev.holeY - holeY) < 0.5
                      ? prev
                      : { ...prev, holeY },
                  );
                }}
              >
                <View style={styles.ticketDashRow}>
                  {Array.from({ length: 18 }).map((_, i) => (
                    <View key={i} style={styles.ticketDash} />
                  ))}
                </View>
              </View>

              <View style={styles.body}>
                {isWithdraw ? (
                  <View style={[styles.feeBlock, styles.withdrawNote]}>
                    <Text style={styles.scopeNote}>
                      {copy?.withdrawScopeNote ??
                        "This removes your pending offer. You can quote again if the load is still open."}
                    </Text>
                  </View>
                ) : copy?.scopeNote ? (
                  <View style={styles.feeBlock}>
                    <Text style={styles.scopeNote}>{copy.scopeNote}</Text>
                  </View>
                ) : null}
                {!isWithdraw && marketplaceFee && marketplaceFee.status === "active" ? (
                  <View style={styles.feeBlock}>
                    <View style={styles.feeRow}>
                      <Text style={styles.feeRowLabel}>Your bid</Text>
                      <Text style={styles.feeRowValue}>{formatINR(amount)}</Text>
                    </View>
                    <View style={styles.feeRow}>
                      <Text style={styles.feeRowLabel}>
                        Marketplace fee{marketplaceFee.capped ? " (capped)" : ""}
                      </Text>
                      <Text style={styles.feeRowValue}>
                        {formatINR(marketplaceFee.amount)}
                      </Text>
                    </View>
                    <Text style={styles.feeNote}>
                      {copy?.feeNote
                        ? copy.feeNote(marketplaceFee.amount)
                        : `You pay Pulse ${formatINR(marketplaceFee.amount)} separately if you win this bid`}
                    </Text>
                  </View>
                ) : !isWithdraw && marketplaceFee && marketplaceFee.status === "inactive" ? (
                  <View style={styles.feeBlock}>
                    <Text style={styles.feeNote}>No platform fee currently applies</Text>
                  </View>
                ) : null}

                {metaRows.filter((row) => row.key !== "route").length > 0 ? (
                  <View style={styles.specRow}>
                    {metaRows
                      .filter((row) => row.key !== "route")
                      .map((row) => (
                        <View key={row.key} style={styles.specChip}>
                          <MetaIcon kind={row.icon} />
                          <View style={styles.metaCopy}>
                            <Text style={styles.metaLabel}>{row.label}</Text>
                            <Text style={styles.metaValue} numberOfLines={2}>
                              {row.value}
                            </Text>
                          </View>
                        </View>
                      ))}
                  </View>
                ) : !origin && !destination ? (
                  <Text style={styles.emptyMeta}>
                    Double-check the amount, then confirm to send.
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    onPress={onCancel}
                    disabled={submitting}
                    style={({ pressed }) => [
                      styles.btnSecondary,
                      pressed && !submitting && styles.btnPressed,
                      submitting && styles.btnDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={isWithdraw ? "Keep bid" : "Edit bid"}
                  >
                    <Text style={styles.btnSecondaryText}>
                      {isWithdraw ? "Keep bid" : "Edit"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={onConfirm}
                    disabled={submitting}
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      isWithdraw && styles.btnWithdraw,
                      pressed && !submitting && !isWithdraw && styles.btnPrimaryPressed,
                      pressed && !submitting && isWithdraw && styles.btnWithdrawPressed,
                      submitting && styles.btnPrimaryBusy,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={confirmLabel}
                    accessibilityState={{ disabled: submitting }}
                  >
                    {submitting ? (
                      <LoadingIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Text style={styles.btnPrimaryText}>
                          {confirmLabel}
                        </Text>
                        {isWithdraw ? (
                          <X size={15} color="#ffffff" strokeWidth={2.4} />
                        ) : (
                          <ArrowRight
                            size={15}
                            color="#ffffff"
                            strokeWidth={2.3}
                          />
                        )}
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </MotiView>
      </View>
  );

  if (embedded) {
    return sheet;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={
        submitting
          ? undefined
          : isSuccess
            ? onSuccessDone
            : onCancel
      }
    >
      {sheet}
    </Modal>
  );
});

export function BidOutcomeToast({
  message,
}: {
  message: string;
}) {
  const withdrawn = /cancel|withdraw|void/i.test(message);
  return (
    <View
      style={[toastStyles.card, withdrawn && toastStyles.cardWithdraw]}
      accessibilityRole="text"
      accessibilityLabel={message}
    >
      <View style={[toastStyles.notch, toastStyles.notchLeft]} />
      <View style={[toastStyles.notch, toastStyles.notchRight]} />
      <View style={[toastStyles.stamp, withdrawn && toastStyles.stampWithdraw]}>
        <Text style={[toastStyles.stampText, withdrawn && toastStyles.stampTextWithdraw]}>
          {withdrawn ? "VOID" : "LIVE"}
        </Text>
      </View>
      <Text style={toastStyles.kicker}>
        {withdrawn ? "Bid withdrawn" : "Bid confirmed"}
      </Text>
      <Text style={toastStyles.title} numberOfLines={2}>
        {message}
      </Text>
    </View>
  );
}

const toastStyles = StyleSheet.create({
  card: {
    minWidth: 196,
    maxWidth: 280,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Theme.driverEmeraldDark,
    borderStyle: "dashed",
    alignItems: "center",
    overflow: "hidden",
    ...platformShadow("0 16px 32px rgba(15, 23, 42, 0.16)", {
      color: Theme.shadow,
      opacity: 0.14,
      radius: 18,
      offsetY: 10,
      elevation: 8,
    }),
  },
  cardWithdraw: {
    borderColor: Theme.warning,
    backgroundColor: Theme.warningMuted,
  },
  notch: {
    position: "absolute",
    top: "42%",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Theme.overlayBackdrop,
  },
  notchLeft: { left: -7 },
  notchRight: { right: -7 },
  stamp: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: Theme.driverEmeraldDark,
    borderRadius: 4,
    marginBottom: 8,
    transform: [{ rotate: "-8deg" }],
  },
  stampWithdraw: {
    borderColor: Theme.negative,
  },
  stampText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: Theme.driverEmeraldDark,
  },
  stampTextWithdraw: {
    color: Theme.negative,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: -0.2,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
  },
  particle: {
    position: "absolute",
    top: "26%",
    left: "50%",
    borderRadius: 2,
    zIndex: 2,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Theme.cardWhite,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    zIndex: 3,
    ...platformShadow("0 22px 48px rgba(15, 23, 42, 0.2)", {
      color: Theme.shadow,
      opacity: 0.18,
      radius: 26,
      offsetY: 14,
      elevation: 14,
    }),
  },
  cardSuccess: {
    maxWidth: 420,
    borderColor: Theme.driverEmeraldBorderSoft,
  },
  cardSuccessWithdraw: {
    borderColor: Theme.warning,
  },
  heroWash: {
    backgroundColor: Theme.brandBlueSoft,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    alignItems: "center",
    overflow: "hidden",
    borderTopLeftRadius: TICKET_CORNER,
    borderTopRightRadius: TICKET_CORNER,
  },
  heroWashWithdraw: {
    backgroundColor: Theme.warningMuted,
  },
  heroOrb: {
    position: "absolute",
    borderRadius: 999,
  },
  heroOrbA: {
    width: 140,
    height: 140,
    top: -48,
    right: -36,
    backgroundColor: Theme.brandBlueWash,
  },
  heroOrbB: {
    width: 90,
    height: 90,
    bottom: -28,
    left: -22,
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  stampRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
    zIndex: 1,
  },
  stamp: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    transform: [{ rotate: "-4deg" }],
  },
  stampWithdraw: {
    borderColor: Theme.warning,
  },
  stampText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Theme.primary,
  },
  stampTextWithdraw: {
    color: Theme.warning,
  },
  deltaPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  deltaPillUnder: {
    backgroundColor: Theme.driverEmeraldMuted,
    borderColor: Theme.driverEmeraldBorderSoft,
  },
  deltaPillOver: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.warning,
  },
  deltaPillMatch: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderColor: Theme.brandBlueRing,
  },
  deltaPillText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Theme.textMuted,
  },
  deltaPillTextUnder: {
    color: Theme.driverEmeraldDark,
  },
  deltaPillTextOver: {
    color: Theme.warning,
  },
  deltaPillTextMatch: {
    color: Theme.buttonPrimaryText,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 2,
    zIndex: 1,
  },
  heroAmount: {
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1.2,
    color: Theme.textPrimaryDark,
    lineHeight: 44,
    zIndex: 1,
  },
  heroDelta: {
    marginTop: 6,
  },
  heroTarget: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    zIndex: 1,
  },
  laneCard: {
    width: "100%",
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    zIndex: 1,
  },
  laneCity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  laneCityEnd: {
    alignItems: "flex-end",
  },
  laneKicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  laneName: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  laneTrack: {
    width: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  laneDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.primary,
  },
  laneDotEnd: {
    backgroundColor: Theme.driverEmeraldDark,
  },
  laneDash: {
    flex: 1,
    height: 1.5,
    backgroundColor: Theme.borderInput,
  },
  laneMid: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    marginHorizontal: 2,
  },
  ticketEdge: {
    height: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    marginTop: -1,
  },
  ticketDashRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  ticketDash: {
    width: 5,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: Theme.borderInput,
    opacity: 0.85,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 14,
    backgroundColor: Theme.cardWhite,
    borderBottomLeftRadius: TICKET_CORNER,
    borderBottomRightRadius: TICKET_CORNER,
  },
  feeBlock: {
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  withdrawNote: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.warning,
  },
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  feeRowLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  feeRowValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  feeNote: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
    lineHeight: 15,
  },
  scopeNote: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 17,
  },
  specRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  specChip: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 132,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  metaIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    marginTop: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  metaCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  emptyMeta: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 17,
    paddingVertical: 6,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 2,
  },
  btnSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  btnWithdraw: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  btnWithdrawPressed: {
    opacity: 0.88,
  },
  btnPrimary: {
    flex: 1.45,
    minHeight: 46,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Theme.driverEmeraldDark,
    paddingHorizontal: 12,
  },
  btnPrimaryPressed: {
    opacity: 0.92,
  },
  btnPrimaryBusy: {
    opacity: 0.85,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  successBody: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 20,
    alignItems: "center",
    gap: 10,
  },
  successRibbon: {
    alignSelf: "stretch",
    marginHorizontal: -20,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Theme.driverEmeraldDark,
    alignItems: "center",
  },
  successRibbonWithdraw: {
    backgroundColor: Theme.textPrimaryDark,
  },
  successRibbonText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: Theme.cardWhite,
  },
  successRibbonTextWithdraw: {
    color: Theme.accentGold,
  },
  checkStage: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  checkPulseRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: Theme.driverEmerald,
  },
  checkPulseRingWithdraw: {
    borderColor: Theme.warning,
  },
  checkBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverEmeraldMuted,
  },
  checkBadgeWithdraw: {
    backgroundColor: Theme.warningMuted,
  },
  checkBadgeInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverEmeraldDark,
  },
  checkBadgeInnerWithdraw: {
    backgroundColor: Theme.textPrimaryDark,
  },
  successStamp: {
    position: "absolute",
    right: -8,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 2,
    borderColor: Theme.driverEmeraldDark,
    borderRadius: 4,
    backgroundColor: Theme.cardWhite,
    transform: [{ rotate: "-8deg" }],
  },
  successStampWithdraw: {
    borderColor: Theme.negative,
  },
  successStampText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: Theme.driverEmeraldDark,
  },
  successStampTextWithdraw: {
    color: Theme.negative,
  },
  successTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 19,
    color: Theme.textSecondary,
    textAlign: "center",
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  successTicket: {
    width: "100%",
    marginTop: 6,
    marginBottom: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: 1.5,
    borderColor: Theme.brandBlue,
    borderStyle: "dashed",
    alignItems: "center",
    gap: 4,
    overflow: "hidden",
    position: "relative",
  },
  successTicketWithdraw: {
    backgroundColor: Theme.warningMuted,
    borderColor: Theme.warning,
  },
  successTicketNotchLeft: {
    position: "absolute",
    left: -8,
    top: "46%",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
  },
  successTicketNotchRight: {
    position: "absolute",
    right: -8,
    top: "46%",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
  },
  successLane: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    maxWidth: "100%",
  },
  successSpecs: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  successPerf: {
    alignSelf: "stretch",
    height: 1,
    marginVertical: 8,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.borderLight,
  },
  successStub: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    textAlign: "center",
  },
  successAmountVoid: {
    textDecorationLine: "line-through",
    color: Theme.textMuted,
  },
  successAmountLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  successAmount: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.8,
    color: Theme.textPrimaryDark,
  },
  successAmountOver: {
    color: Theme.negative,
  },
  successAmountUnder: {
    color: Theme.positive,
  },
  successRoute: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  btnDone: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverEmeraldDark,
    marginTop: 4,
  },
  btnDoneWithdraw: {
    backgroundColor: Theme.textPrimaryDark,
  },
  btnDoneText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    letterSpacing: -0.1,
  },
});
