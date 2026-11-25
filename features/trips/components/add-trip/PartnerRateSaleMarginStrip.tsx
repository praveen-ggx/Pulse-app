import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { IndianRupee, TrendingDown, TrendingUp } from "lucide-react-native";

import Theme from "@/constants/Theme";

function parseAmount(raw: string): number | null {
  // `Number("")` is 0, not NaN — an empty field must not read as a real zero.
  const digits = String(raw).replace(/[^\d.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatInr(amount: number): string {
  return amount.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

export type PartnerRateSaleMarginStripProps = {
  /** Client sale value (from Load / client step). */
  saleValue: string;
  /** Partner rate / supplier target being typed. */
  partnerRate: string;
  /** Left column label — default "Sale". */
  saleLabel?: string;
  /** Placeholder when sale exists but rate is empty. */
  rateEmptyHint?: string;
  /**
   * Divide the sale by this tonnage before comparing, so a ₹/MT partner rate
   * is measured against a ₹/MT sale rather than a trip total. Omit (or pass
   * null) when both sides are already trip-level.
   */
  saleDivisorTons?: number | null;
  /** Suffix after each amount, e.g. "/MT". */
  unitSuffix?: string;
};

/**
 * Live sale vs margin under partner-rate / supplier-target entry — updates while typing.
 * Twin hero tiles: Sale (ink) + Margin (emerald / loss), edge-to-edge, borderless.
 */
export const PartnerRateSaleMarginStrip = memo(function PartnerRateSaleMarginStrip({
  saleValue,
  partnerRate,
  saleLabel = "Sale",
  rateEmptyHint = "Type rate",
  saleDivisorTons,
  unitSuffix = "",
}: PartnerRateSaleMarginStripProps) {
  const sale = useMemo(() => {
    const raw = parseAmount(saleValue);
    if (raw == null) return null;
    // Per-MT entry: compare rate-to-rate, not rate-to-total.
    if (saleDivisorTons != null && saleDivisorTons > 0) return raw / saleDivisorTons;
    return raw;
  }, [saleValue, saleDivisorTons]);
  const rate = useMemo(() => parseAmount(partnerRate), [partnerRate]);

  const margin = sale != null && rate != null ? sale - rate : null;
  const marginPct =
    margin != null && sale != null && sale > 0
      ? (margin / sale) * 100
      : null;

  const hasSale = sale != null && sale > 0;
  const hasRate = rate != null && String(partnerRate).replace(/[^\d.]/g, "").length > 0;

  if (!hasSale && !hasRate) return null;

  const marginTone =
    margin == null
      ? "neutral"
      : margin > 0
        ? "positive"
        : margin < 0
          ? "negative"
          : "neutral";

  const marginReady = hasSale && hasRate && margin != null;
  const MarginIcon =
    marginTone === "negative" ? TrendingDown : TrendingUp;

  return (
    <View
      style={styles.root}
      accessibilityLabel={
        hasSale && margin != null
          ? `${saleLabel} ${formatInr(sale!)}${unitSuffix}, margin ${formatInr(margin)}${unitSuffix}${
              marginPct != null ? `, ${marginPct.toFixed(0)} percent` : ""
            }`
          : hasSale
            ? `${saleLabel} ${formatInr(sale!)}`
            : undefined
      }
    >
      <LinearGradient
        colors={[Theme.actionBtnInk, Theme.driverEmeraldDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroTile, styles.saleTile]}
      >
        <View style={styles.heroTop}>
          <View style={styles.heroBadge}>
            <IndianRupee size={11} color={Theme.textOnDark} strokeWidth={2.4} />
            <Text style={styles.heroBadgeText}>{saleLabel}</Text>
          </View>
        </View>
        <View style={styles.heroAmountRow}>
          <Text style={styles.heroRupee}>₹</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {hasSale ? formatInr(sale!) : "—"}
          </Text>
        </View>
        {unitSuffix ? (
          <Text style={styles.heroSub}>{unitSuffix.replace(/^\//, "")} basis</Text>
        ) : (
          <Text style={styles.heroSub}>Client billed</Text>
        )}
      </LinearGradient>

      <LinearGradient
        colors={
          marginTone === "negative"
            ? [Theme.negative, Theme.actionBtnInk]
            : marginTone === "positive"
              ? [Theme.driverEmerald, Theme.driverEmeraldDark]
              : [Theme.surfaceLight, Theme.surfaceGray]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroTile, styles.marginTile]}
      >
        <View style={styles.heroTop}>
          <View
            style={[
              styles.heroBadge,
              marginTone === "neutral" && styles.heroBadgeMuted,
            ]}
          >
            <MarginIcon
              size={11}
              color={marginTone === "neutral" ? Theme.textMuted : Theme.textOnDark}
              strokeWidth={2.4}
            />
            <Text
              style={[
                styles.heroBadgeText,
                marginTone === "neutral" && styles.heroBadgeTextMuted,
              ]}
            >
              Margin
            </Text>
          </View>
          {marginReady && marginPct != null ? (
            <Text
              style={[
                styles.pctPill,
                marginTone === "neutral" && styles.pctPillMuted,
              ]}
            >
              {marginPct >= 0 ? "+" : ""}
              {marginPct.toFixed(0)}%
            </Text>
          ) : null}
        </View>
        {marginReady ? (
          <View style={styles.heroAmountRow}>
            <Text
              style={[
                styles.heroRupee,
                marginTone === "neutral" && styles.heroRupeeMuted,
              ]}
            >
              {margin! < 0 ? "−₹" : "₹"}
            </Text>
            <Text
              style={[
                styles.heroAmount,
                marginTone === "neutral" && styles.heroAmountMuted,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatInr(Math.abs(margin!))}
            </Text>
          </View>
        ) : (
          <Text
            style={[
              styles.heroPlaceholder,
              marginTone === "neutral" && styles.heroPlaceholderMuted,
            ]}
            numberOfLines={2}
          >
            {hasSale ? rateEmptyHint : "Set sale first"}
          </Text>
        )}
        <Text
          style={[
            styles.heroSub,
            marginTone === "neutral" && styles.heroSubMuted,
          ]}
        >
          {marginReady
            ? marginTone === "negative"
              ? "Below sale"
              : "After partner rate"
            : "Live vs partner"}
          {unitSuffix ? ` ${unitSuffix}` : ""}
        </Text>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    alignSelf: "stretch",
    gap: 8,
  },
  heroTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 4,
    overflow: "hidden",
  },
  saleTile: {},
  marginTile: {},
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 2,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.tripSelectionInsetBorder,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heroBadgeMuted: {
    backgroundColor: Theme.borderLight,
  },
  heroBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.textOnDark,
  },
  heroBadgeTextMuted: {
    color: Theme.textMuted,
  },
  pctPill: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  pctPillMuted: {
    color: Theme.textMuted,
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 1,
    minHeight: 34,
  },
  heroRupee: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    marginTop: 6,
  },
  heroRupeeMuted: {
    color: Theme.textMuted,
  },
  heroAmount: {
    flex: 1,
    minWidth: 0,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: Theme.textOnDark,
    lineHeight: 32,
    fontVariant: ["tabular-nums"],
  },
  heroAmountMuted: {
    color: Theme.textPrimaryDark,
  },
  heroSub: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
  },
  heroSubMuted: {
    color: Theme.textMuted,
  },
  heroPlaceholder: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnDark,
    minHeight: 32,
    paddingTop: 4,
  },
  heroPlaceholderMuted: {
    color: Theme.textMuted,
  },
});
