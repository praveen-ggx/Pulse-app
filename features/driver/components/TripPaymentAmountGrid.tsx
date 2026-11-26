import Theme from "@/constants/Theme";
import { Banknote, CircleDollarSign, Wallet } from "lucide-react-native";
import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

type TripPaymentAmountGridProps = {
  expectedAmount: number;
  paymentAmount: number;
  outstandingAmount: number;
  writeOffAmount: number;
  hasPaymentShortfall: boolean;
  mode: "pending" | "fleet_marked" | "settled";
  colors: {
    text: string;
    textMuted: string;
    border: string;
    background: string;
    emerald: string;
  };
  isDark: boolean;
  compact?: boolean;
  /** @deprecated Prefer Sales / Received / Due — kept for callers. */
  expectedLabel?: string;
};

function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

type CellProps = {
  label: string;
  value: string;
  valueColor: string;
  labelColor: string;
  cellBg: string;
  Icon: ComponentType<IconProps>;
  iconColor: string;
  iconWellBg: string;
};

function AmountCell({
  label,
  value,
  valueColor,
  labelColor,
  cellBg,
  Icon,
  iconColor,
  iconWellBg,
}: CellProps) {
  return (
    <View style={[styles.cell, { backgroundColor: cellBg }]}>
      <View style={styles.cellHead}>
        <View style={[styles.iconWell, { backgroundColor: iconWellBg }]}>
          <Icon size={11} color={iconColor} strokeWidth={2.5} />
        </View>
        <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Always Sales · Received · Due so drivers see the full money picture at a glance.
 */
export function TripPaymentAmountGrid({
  expectedAmount,
  paymentAmount,
  outstandingAmount,
  writeOffAmount,
  hasPaymentShortfall,
  mode,
  colors,
  isDark,
  compact = false,
}: TripPaymentAmountGridProps) {
  const cellBg = isDark ? "rgba(255,255,255,0.04)" : Theme.driverEmeraldWash;
  const borderColor = isDark ? colors.border : Theme.borderLight;

  const sales = Math.max(0, expectedAmount);
  const received = Math.max(0, paymentAmount);
  const due =
    mode === "settled" && hasPaymentShortfall && writeOffAmount > 0
      ? 0
      : Math.max(0, outstandingAmount);

  const mutedIcon = isDark ? "rgba(255,255,255,0.55)" : Theme.driverEmerald;
  const emeraldWell = isDark
    ? "rgba(5,150,105,0.22)"
    : "rgba(5,150,105,0.12)";
  const warnWell = isDark ? "rgba(245,158,11,0.22)" : "rgba(245,158,11,0.14)";

  return (
    <View style={[styles.grid, { borderColor }, compact && styles.gridCompact]}>
      <AmountCell
        label="Sales"
        value={fmt(sales)}
        valueColor={colors.text}
        labelColor={colors.textMuted}
        cellBg={cellBg}
        Icon={CircleDollarSign}
        iconColor={mutedIcon}
        iconWellBg={emeraldWell}
      />
      <View style={[styles.divider, { backgroundColor: borderColor }]} />
      <AmountCell
        label="Received"
        value={fmt(received)}
        valueColor={received > 0 ? colors.emerald : colors.textMuted}
        labelColor={colors.textMuted}
        cellBg={cellBg}
        Icon={Wallet}
        iconColor={received > 0 ? colors.emerald : mutedIcon}
        iconWellBg={emeraldWell}
      />
      <View style={[styles.divider, { backgroundColor: borderColor }]} />
      <AmountCell
        label="Due"
        value={fmt(due)}
        valueColor={
          due > 0
            ? Theme.warning
            : mode === "settled"
              ? colors.emerald
              : colors.textMuted
        }
        labelColor={colors.textMuted}
        cellBg={cellBg}
        Icon={Banknote}
        iconColor={due > 0 ? Theme.warning : mutedIcon}
        iconWellBg={due > 0 ? warnWell : emeraldWell}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },
  gridCompact: {
    borderRadius: 10,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 4,
  },
  cellHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  iconWell: {
    width: 18,
    height: 18,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
  },
  label: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
