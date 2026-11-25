/**
 * Quick-settlement % chips (40–90% + full payment) for ledger amount entry.
 */
import { memo, useCallback, useMemo } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { LedgerSyncPalette } from "@/constants/LedgerSyncPalette";
import { formatINR, formatLedgerAmountInput } from "@/lib/format";

export const SETTLEMENT_PCTS = [40, 50, 60, 70, 80, 90] as const;
export const FULL_SETTLEMENT_PCT = 100;

/** @deprecated Use formatLedgerAmountInput from @/lib/format */
export function formatLedgerSettlementAmount(amount: number): string {
  return formatLedgerAmountInput(amount);
}

function parseLedgerAmountStr(value: string): number | null {
  const parsed = parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveActiveSettlementPct(
  dueTotalInr: number,
  amountStr: string,
): number | null {
  const parsed = parseLedgerAmountStr(amountStr);
  if (parsed == null || parsed <= 0 || dueTotalInr <= 0) return null;
  const rounded = Math.round(parsed);
  if (rounded === Math.round(dueTotalInr)) return FULL_SETTLEMENT_PCT;
  for (const pct of SETTLEMENT_PCTS) {
    if (rounded === Math.round((dueTotalInr * pct) / 100)) return pct;
  }
  return null;
}

export type LedgerSettlementPctDockProps = {
  dueTotalInr: number;
  amountStr: string;
  onAmountChange: (value: string) => void;
  accentColor: string;
  /** Light = default cards; dark = legacy ink hero (avoid on new layouts). */
  variant?: "light" | "dark";
  /** Tighter tiles for mobile ledger amount step. */
  compact?: boolean;
};

export const LedgerSettlementPctDock = memo(function LedgerSettlementPctDock({
  dueTotalInr,
  amountStr,
  onAmountChange,
  accentColor,
  variant = "light",
  compact = false,
}: LedgerSettlementPctDockProps) {
  const dark = variant === "dark";
  const activePct = useMemo(
    () => resolveActiveSettlementPct(dueTotalInr, amountStr),
    [dueTotalInr, amountStr],
  );

  const applySettlementPct = useCallback(
    (pct: number) => {
      if (dueTotalInr <= 0) return;
      Keyboard.dismiss();
      const value =
        pct >= FULL_SETTLEMENT_PCT
          ? dueTotalInr
          : Math.round((dueTotalInr * pct) / 100);
      onAmountChange(formatLedgerAmountInput(value));
    },
    [dueTotalInr, onAmountChange],
  );

  if (dueTotalInr <= 0) return null;

  const fullActive = activePct === FULL_SETTLEMENT_PCT;

  return (
    <View
      style={[
        styles.dock,
        compact && styles.dockCompact,
        dark && styles.dockDark,
      ]}
    >
      <Text style={[styles.sectionLabel, compact && styles.sectionLabelCompact, dark && styles.sectionLabelDark]}>
        Quick settlement
      </Text>
      <Pressable
        style={({ pressed }) => [
          styles.fullPayTile,
          compact && styles.fullPayTileCompact,
          dark && styles.fullPayTileDark,
          fullActive && styles.fullPayTileActive,
          fullActive && { borderColor: accentColor },
          fullActive && dark && { backgroundColor: "rgba(255,255,255,0.08)" },
          pressed && styles.tilePressed,
        ]}
        onPress={() => applySettlementPct(FULL_SETTLEMENT_PCT)}
        accessibilityRole="button"
        accessibilityLabel={`Full payment, ${formatINR(dueTotalInr)}`}
      >
        <Text style={[styles.fullPayLabel, compact && styles.fullPayLabelCompact, dark && styles.fullPayLabelDark, fullActive && { color: accentColor }]}>
          Full payment
        </Text>
        <Text style={[styles.fullPayAmount, compact && styles.fullPayAmountCompact, { color: accentColor }]}>
          {formatINR(dueTotalInr)}
        </Text>
      </Pressable>
      <Text style={[styles.subsectionLabel, compact && styles.subsectionLabelCompact, dark && styles.subsectionLabelDark]}>
        Or choose % of due
      </Text>
      <View style={[styles.pctGrid, compact && styles.pctGridCompact]}>
        {SETTLEMENT_PCTS.map((pct) => {
          const preview = Math.round((dueTotalInr * pct) / 100);
          const active = activePct === pct;
          return (
            <Pressable
              key={pct}
              style={({ pressed }) => [
                styles.pctTile,
                compact && styles.pctTileCompact,
                dark && styles.pctTileDark,
                active && styles.pctTileActive,
                active && { borderColor: accentColor },
                active && dark && { backgroundColor: "rgba(255,255,255,0.1)" },
                pressed && styles.tilePressed,
              ]}
              onPress={() => applySettlementPct(pct)}
              accessibilityRole="button"
              accessibilityLabel={`${pct} percent, ${formatINR(preview)}`}
            >
              <Text
                style={[
                  styles.pctTilePct,
                  compact && styles.pctTilePctCompact,
                  dark && styles.pctTilePctDark,
                  active && styles.pctTilePctActive,
                  active && { color: accentColor },
                ]}
              >
                {pct}%
              </Text>
              <Text
                style={[
                  styles.pctTileAmt,
                  compact && styles.pctTileAmtCompact,
                  dark && styles.pctTileAmtDark,
                  active && styles.pctTileAmtActive,
                  active && !dark && { color: LedgerSyncPalette.ink },
                  active && dark && { color: Theme.textOnDark },
                ]}
                numberOfLines={1}
              >
                {formatINR(preview)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  dock: {
    paddingTop: 12,
    paddingBottom: 4,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: LedgerSyncPalette.border,
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    zIndex: 2,
  },
  dockCompact: {
    paddingTop: 8,
    marginTop: 6,
    paddingBottom: 2,
  },
  dockDark: {
    borderTopColor: "rgba(255,255,255,0.12)",
    marginTop: 10,
    paddingTop: 14,
    backgroundColor: "transparent",
  },
  sectionLabel: {
    marginBottom: 8,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: Theme.textPrimaryDark,
    lineHeight: 14,
    textAlign: "left",
    width: "100%",
  },
  sectionLabelCompact: {
    marginBottom: 8,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  sectionLabelDark: {
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
  subsectionLabel: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 12,
    textAlign: "left",
    width: "100%",
  },
  subsectionLabelCompact: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 10,
  },
  subsectionLabelDark: {
    color: "rgba(255,255,255,0.55)",
  },
  fullPayTile: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: LedgerSyncPalette.border,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 2,
    minHeight: 56,
    cursor: "pointer",
  },
  fullPayTileCompact: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 52,
    borderRadius: 12,
  },
  fullPayTileDark: {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  fullPayTileActive: {
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 2,
  },
  fullPayLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  fullPayLabelCompact: {
    fontSize: 11,
  },
  fullPayLabelDark: {
    color: "rgba(255,255,255,0.72)",
  },
  fullPayAmount: {
    fontSize: 17,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.35,
    lineHeight: 20,
  },
  fullPayAmountCompact: {
    fontSize: 16,
    lineHeight: 19,
  },
  pctGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  pctGridCompact: {
    gap: 8,
  },
  pctTile: {
    width: "31.2%",
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: 1.5,
    borderColor: LedgerSyncPalette.border,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 58,
    cursor: "pointer",
  },
  pctTileCompact: {
    paddingVertical: 9,
    paddingHorizontal: 3,
    minHeight: 56,
    borderRadius: 12,
  },
  pctTileDark: {
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pctTileActive: {
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 2,
  },
  pctTilePct: {
    fontSize: 15,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  pctTilePctCompact: {
    fontSize: 15,
    lineHeight: 18,
  },
  pctTilePctDark: {
    color: "rgba(255,255,255,0.92)",
  },
  pctTilePctActive: {
    color: Theme.primary,
  },
  pctTileAmt: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
    lineHeight: 14,
    textAlign: "center",
  },
  pctTileAmtCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  pctTileAmtDark: {
    color: "rgba(255,255,255,0.55)",
  },
  pctTileAmtActive: {
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  tilePressed: {
    opacity: 0.88,
  },
});
