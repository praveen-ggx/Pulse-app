import Theme from "@/constants/Theme";
import { type ReactNode, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type ChartValueCalloutRow = {
  label: string;
  value: string;
};

type CalloutProps = {
  title: string;
  rows: ChartValueCalloutRow[];
  left?: number;
  top?: number;
};

export function ChartValueCallout({
  title,
  rows,
  left = 8,
  top = 8,
}: CalloutProps) {
  return (
    <View
      pointerEvents="none"
      style={[styles.callout, { left, top }]}
    >
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

type TargetProps = {
  title: string;
  rows: ChartValueCalloutRow[];
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Hover (web) or tap to show a compact value callout over the control. */
export function MetricHover({ title, rows, children, style }: TargetProps) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.target, style]}>
      <Pressable
        onHoverIn={() => setOpen(true)}
        onHoverOut={() => setOpen(false)}
        onPress={() => setOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel={`${title} details`}
        style={styles.press}
      >
        {children}
      </Pressable>
      {open ? <ChartValueCallout title={title} rows={rows} left={12} top={4} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  target: {
    position: "relative",
    minWidth: 0,
    width: "100%",
  },
  press: {
    width: "100%",
    minWidth: 0,
  },
  callout: {
    position: "absolute",
    zIndex: 20,
    minWidth: 132,
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    gap: 6,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: `0 8px 24px 0 ${Theme.brandBlueShadow}`,
        } as ViewStyle)
      : {
          elevation: 6,
          shadowColor: Theme.primary,
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }),
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  value: {
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimary,
    flexShrink: 1,
    minWidth: 0,
    textAlign: "right",
  },
});
