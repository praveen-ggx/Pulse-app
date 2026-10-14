import Theme from "@/constants/Theme";
import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import { CHAT_PAYMENT_LOTTIE, resolveChatPaymentLottieSource } from "@/lib/chatPaymentLottieAssets";
import type { CompliancePaymentSummary } from "@/features/tripCompliance/tripCompliance.types";
import type { LottieSource } from "@/lib/lottieSource";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

const MONEY_BAG_LOTTIE = require("@/assets/Animated folder/money-bag.json") as LottieSource;

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function PostedMoneyBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[styles.badgeWrap, { transform: [{ scale: pulse }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.badgeRing}>
        <TinyEmptyLottie source={MONEY_BAG_LOTTIE} size={40} renderScale={1.12} speed={0.9} />
      </View>
    </Animated.View>
  );
}

/**
 * Hero + payment log for a posted advance (or a Finance advance on file before
 * verify). Large amount, party credit line, mode / UTR with Lottie.
 */
export function ComplianceAdvanceCreditCard({
  payment,
  partyName,
  tone = "posted",
  footer,
  showHeroArt = true,
  embedded = false,
}: {
  payment: CompliancePaymentSummary;
  /** Supplier / payee display name; falls back to "party". */
  partyName: string | null | undefined;
  tone?: "posted" | "blocked";
  footer?: React.ReactNode;
  /** Decorative hero animation. Off on Advance Processed. */
  showHeroArt?: boolean;
  /** No outer chrome — parent receipt supplies the card. */
  embedded?: boolean;
}) {
  const party = (partyName ?? "").trim() || "party";
  const mode = payment.paymentMode?.trim() || "—";
  const modeLottie = useMemo(
    () => resolveChatPaymentLottieSource("out", payment.paymentMode ?? "", false, false),
    [payment.paymentMode],
  );
  const blocked = tone === "blocked";
  const utr = payment.utr?.trim() || "";
  const showLog = Boolean(mode !== "—" || utr);

  return (
    <View style={[styles.card, blocked && styles.cardBlocked, embedded && styles.cardEmbedded]}>
      <View style={[styles.hero, !blocked && styles.heroPosted]}>
        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, !blocked && styles.eyebrowPosted]}>
            {blocked ? "Advance on file" : "Advance credited"}
          </Text>
          <Text
            style={[styles.amount, blocked && styles.amountBlocked]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {formatInr(payment.amount)}
          </Text>
          <Text style={styles.partyLine} numberOfLines={2}>
            Credited to <Text style={styles.partyName}>{party}</Text>
          </Text>
        </View>
        {blocked && showHeroArt ? (
          <TinyEmptyLottie
            source={CHAT_PAYMENT_LOTTIE.dispute}
            size={72}
            renderScale={1.35}
            speed={0.9}
          />
        ) : !blocked ? (
          <PostedMoneyBadge />
        ) : null}
      </View>

      {showLog ? (
        <View style={[styles.log, !blocked && styles.logPosted]}>
          <Text style={styles.logTitle}>Payment log</Text>
          {mode !== "—" ? (
            <View style={styles.logRow}>
              <TinyEmptyLottie source={modeLottie} size={26} renderScale={1.4} speed={0.85} />
              <View style={styles.logCopy}>
                <Text style={styles.logLabel}>Mode of payment</Text>
                <Text style={styles.logValue} numberOfLines={2}>
                  {mode}
                </Text>
              </View>
            </View>
          ) : null}
          {utr ? (
            <View style={[styles.logRow, mode !== "—" && styles.logRowBorder]}>
              <TinyEmptyLottie source={CHAT_PAYMENT_LOTTIE.bank} size={26} renderScale={1.4} speed={0.85} />
              <View style={styles.logCopy}>
                <Text style={styles.logLabel}>UTR / reference</Text>
                <Text style={styles.logValue} numberOfLines={2} selectable>
                  {utr}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  cardEmbedded: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  cardBlocked: {
    borderColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.complianceStageDocsBg,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  heroPosted: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: Theme.cardWhite,
  },
  heroCopy: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  eyebrowPosted: { color: Theme.complianceStageSuccessFg },
  amount: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: Theme.textPrimaryDark,
    lineHeight: 34,
    fontVariant: ["tabular-nums"],
  },
  amountBlocked: { color: Theme.complianceStageDocsFg },
  partyLine: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  partyName: { fontWeight: "800", color: Theme.textPrimaryDark },
  badgeWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  badgeRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
    backgroundColor: Theme.complianceStageSuccessBg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  log: {
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  logPosted: {
    marginTop: 8,
    marginBottom: 10,
    backgroundColor: Theme.cardWhite,
  },
  logTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.textMuted,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 2,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  logRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
  },
  logCopy: { flex: 1, minWidth: 0, gap: 1 },
  logLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.25,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  logValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  footer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});
