import Theme from "@/constants/Theme";
import { StyleSheet, Text, View } from "react-native";

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
  expectedLabel?: string;
};

function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

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
  expectedLabel = "Trip earning",
}: TripPaymentAmountGridProps) {
  const cellBg = isDark ? colors.background : colors.background;
  const borderColor = isDark ? colors.border : "rgba(226,232,240,0.9)";

  if (hasPaymentShortfall && mode === "fleet_marked") {
    return (
      <View style={[styles.grid, { borderColor }, compact && styles.gridCompact]}>
        <View style={[styles.cell, { backgroundColor: cellBg }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{expectedLabel}</Text>
          <Text style={[styles.value, { color: colors.text }]}>{fmt(expectedAmount)}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={[styles.cell, { backgroundColor: cellBg }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Fleet marked</Text>
          <Text style={[styles.value, { color: colors.text }]}>{fmt(paymentAmount)}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={[styles.cell, { backgroundColor: cellBg }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Outstanding</Text>
          <Text style={[styles.value, { color: Theme.negative }]}>{fmt(outstandingAmount)}</Text>
        </View>
      </View>
    );
  }

  if (hasPaymentShortfall && mode === "settled") {
    return (
      <View style={[styles.grid, { borderColor }, compact && styles.gridCompact]}>
        <View style={[styles.cell, { backgroundColor: cellBg }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{expectedLabel}</Text>
          <Text style={[styles.value, { color: colors.text }]}>{fmt(expectedAmount)}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={[styles.cell, { backgroundColor: cellBg }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Received</Text>
          <Text style={[styles.value, { color: colors.emerald }]}>{fmt(paymentAmount)}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={[styles.cell, { backgroundColor: cellBg }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Written off</Text>
          <Text style={[styles.value, { color: Theme.negative }]}>{fmt(writeOffAmount)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.gridTwo, { borderColor }, compact && styles.gridCompact]}>
      <View style={[styles.cell, { backgroundColor: cellBg }]}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{expectedLabel}</Text>
        <Text style={[styles.value, { color: colors.text }]}>{fmt(expectedAmount)}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={[styles.cell, { backgroundColor: cellBg }]}>
        <Text style={[styles.label, { color: colors.textMuted }]}>
          {mode === "settled" ? "Received" : "Outstanding"}
        </Text>
        <Text
          style={[
            styles.value,
            { color: mode === "settled" ? colors.emerald : Theme.negative },
          ]}
        >
          {mode === "settled" ? fmt(paymentAmount) : fmt(outstandingAmount)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: "hidden",
  },
  gridTwo: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: "hidden",
  },
  gridCompact: {
    borderRadius: 8,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 8,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  value: {
    fontSize: 10,
    fontWeight: "600",
  },
});
