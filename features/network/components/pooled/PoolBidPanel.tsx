/**
 * The single commercial action for a pooled opportunity: one rate for the
 * loads eligible now and for loads added on this lane later. The bidder
 * never picks loads. Underneath, each load still receives its own per-indent
 * bid, and the shipper accepts each one. Outcomes are reported as counts.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { formatFindLoadsRateOffer } from "@/features/network/services/findLoadsForOrg.service";
import {
  groupPoolBidFailures,
  type PoolBidSubmissionResult,
  type PoolCommercialState,
} from "@/features/network/utils/pooledOpportunity.util";
import { Check, Minus } from "lucide-react-native";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";

const WEB_COPY = Platform.select({
  web: { whiteSpace: "pre-wrap" } as object,
  default: {},
});

function targetRangeLabel(
  min: number | null,
  max: number | null,
): string | null {
  const lo = formatFindLoadsRateOffer(min);
  const hi = formatFindLoadsRateOffer(max);
  if (!lo || !hi) return null;
  return lo === hi ? lo : `${lo} – ${hi}`;
}

function EligibilityRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.eligRow}>
      {ok ? (
        <Check size={13} color={Theme.positive} strokeWidth={2.6} />
      ) : (
        <Minus size={13} color={Theme.textMuted} strokeWidth={2.6} />
      )}
      <Text style={[styles.eligText, !ok && styles.eligTextOff]}>{label}</Text>
    </View>
  );
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function ResultCard({ result }: { result: PoolBidSubmissionResult }) {
  if (result.blocked) {
    return (
      <View style={[styles.banner, styles.bannerWarn]} accessibilityRole="alert">
        <Text style={styles.bannerWarnTitle}>Nothing was submitted</Text>
        <Text style={styles.bannerWarnText}>{result.blocked}</Text>
      </View>
    );
  }
  const ok = result.succeeded.length;
  const failed = result.failed.length;
  if (failed === 0) {
    return (
      <View style={[styles.banner, styles.bannerOk]}>
        <Text style={styles.bannerOkText}>
          Your rate has been submitted for all {plural(ok, "load")}.
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.banner, styles.bannerWarn]} accessibilityRole="alert">
      <Text style={styles.bannerWarnTitle}>
        {ok > 0
          ? `Partly submitted: your rate reached ${ok} of ${result.attempted} loads`
          : `Not submitted: none of the ${plural(result.attempted, "load")} took your rate`}
      </Text>
      {groupPoolBidFailures(result.failed).map((g) => (
        <Text key={g.message} style={styles.bannerWarnText} numberOfLines={3}>
          {plural(g.count, "load")}: {g.message}
        </Text>
      ))}
    </View>
  );
}

export function PoolBidPanel({
  state,
  eligibleCount,
  preparing,
  blockedReason,
  targetRateMin,
  targetRateMax,
  canBidCapability,
  fitsFleet,
  result,
  onBid,
}: {
  state: PoolCommercialState;
  /** Every member this org can bid on; the whole scope of the rate. */
  eligibleCount: number;
  /** Still reading pool members; the rate can't be offered yet. */
  preparing: boolean;
  blockedReason: string | null;
  targetRateMin: number | null;
  targetRateMax: number | null;
  canBidCapability: boolean;
  fitsFleet: boolean;
  result: PoolBidSubmissionResult | null;
  onBid: () => void;
}) {
  const range = targetRangeLabel(targetRateMin, targetRateMax);
  const disabled =
    !canBidCapability || preparing || blockedReason != null || eligibleCount === 0;
  const ctaLabel =
    state === "submitted" ? "Update rate for pool" : "Submit rate for pool";

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>COMMERCIAL</Text>
      <Text style={styles.title}>Your rate for this pooled opportunity</Text>
      <Text style={styles.body}>
        One rate for the loads these shippers have open now, and for loads added
        on this lane over the next 48 hours. Each shipper accepts its own bid.
      </Text>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Applies to</Text>
          <Text style={styles.statValue} testID="pool-bid-scope">
            {preparing
              ? "Preparing pool…"
              : `All ${plural(eligibleCount, "eligible load")}`}
          </Text>
        </View>
        {range ? (
          <View style={[styles.stat, styles.statTarget]}>
            <Text style={styles.statLabel}>Shipper target</Text>
            <Text style={[styles.statValue, styles.statRate]} numberOfLines={1}>
              {range}
            </Text>
          </View>
        ) : null}
      </View>

      {blockedReason ? (
        <Text style={styles.blocked} accessibilityRole="alert">
          {blockedReason}
        </Text>
      ) : null}

      <Pressable
        onPress={onBid}
        disabled={disabled}
        style={({ pressed }) => [
          styles.cta,
          disabled && styles.ctaDisabled,
          pressed && !disabled && styles.ctaPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        accessibilityState={{ disabled }}
      >
        {preparing ? (
          <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
        ) : (
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        )}
      </Pressable>
      {!canBidCapability ? (
        <Text style={styles.note}>Your role can view this pool but can't bid.</Text>
      ) : !preparing && !blockedReason && eligibleCount > 0 ? (
        <Text style={styles.note}>
          Your rate covers these {plural(eligibleCount, "eligible load")} only. Each
          shipper reviews their own load. Nothing is awarded until that shipper
          accepts.
        </Text>
      ) : null}

      {result ? <ResultCard result={result} /> : null}

      <View style={styles.divider} />
      <Text style={styles.eyebrow}>ELIGIBILITY</Text>
      <View style={styles.eligGrid}>
        <EligibilityRow ok={canBidCapability} label="Bidding access" />
        <EligibilityRow ok={fitsFleet} label="Vehicle type in your fleet" />
        <EligibilityRow ok={eligibleCount > 0} label="Loads open for your bid" />
      </View>
      <Text style={styles.note}>Competing bids are not shown to bidders.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 16,
    gap: 10,
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)" } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
      },
    }),
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0,
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    lineHeight: 22,
    ...WEB_COPY,
  },
  body: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimary,
    lineHeight: 20,
    ...WEB_COPY,
  },
  statRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  stat: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  statTarget: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.brandBlue,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0,
    textTransform: "uppercase",
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
    ...WEB_COPY,
  },
  statRate: { color: Theme.primary },
  blocked: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.warning,
    lineHeight: 16,
  },
  note: { fontSize: 13, fontWeight: "500", color: Theme.textPrimary, lineHeight: 18, ...WEB_COPY },
  cta: {
    marginTop: 4,
    minHeight: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaPressed: { opacity: 0.88 },
  ctaText: { fontSize: 14, fontWeight: "600", color: Theme.buttonPrimaryText },
  banner: { borderRadius: 10, padding: 10, gap: 3 },
  bannerOk: { backgroundColor: Theme.positiveMuted },
  bannerOkText: { fontSize: 13, fontWeight: "600", color: Theme.positive },
  bannerWarn: { backgroundColor: Theme.warningMuted },
  bannerWarnTitle: { fontSize: 13, fontWeight: "700", color: Theme.warning },
  bannerWarnText: { fontSize: 12, color: Theme.textSecondary },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surfaceBorder,
    marginVertical: 6,
  },
  eligGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  eligRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  eligText: { fontSize: 13, color: Theme.textPrimaryDark, ...WEB_COPY },
  eligTextOff: { color: Theme.textMuted },
});
