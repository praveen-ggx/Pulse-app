import Theme from "@/constants/Theme";
import type { SalesBarItem } from "@/features/network/utils/connectionSalesAnalytics.util";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";

type Props = {
  items: SalesBarItem[];
  orientation?: "horizontal" | "vertical";
  variant?: "default" | "sidebar";
  activeKey?: string | null;
  onSelectKey?: (key: string | null) => void;
  emptyMessage?: string;
  width?: number;
  height?: number;
  /** @deprecated Use footerText */
  showRevenue?: boolean;
  footerText?: string;
};

const BAR_COLORS = ["#3E97FF", "#50CD89", "#7239EA", "#FFC700", "#F1416C", "#009EF7"];

export function NetworkDesktopSalesBarChart({
  items,
  orientation = "horizontal",
  variant = "default",
  activeKey = null,
  onSelectKey,
  emptyMessage = "No data for current filters.",
  width = 280,
  height = 160,
  showRevenue = false,
  footerText,
}: Props) {
  const resolvedFooter =
    footerText ??
    (showRevenue
      ? "Trip-weighted contribution · tap a lane to cross-filter"
      : undefined);
  const isSidebar = variant === "sidebar";
  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  if (orientation === "horizontal") {
    const maxVal = Math.max(...items.map((i) => i.value), 1);
    return (
      <View style={[styles.hWrap, isSidebar && styles.hWrapSidebar]}>
        {items.map((item, idx) => {
          const pct = Math.round((item.value / maxVal) * 100);
          const active = activeKey === item.key;
          const displayLabel = item.shortLabel ?? item.label;
          const row = (
            <View style={[styles.hRow, isSidebar && styles.hRowSidebar]}>
              <Text
                style={[
                  styles.hLabel,
                  isSidebar && styles.hLabelSidebar,
                  active && styles.hLabelActive,
                ]}
                numberOfLines={1}
              >
                {displayLabel}
              </Text>
              <View style={[styles.hTrack, isSidebar && styles.hTrackSidebar]}>
                <View
                  style={[
                    styles.hFill,
                    {
                      width: `${Math.max(pct, item.value > 0 ? 4 : 0)}%`,
                      backgroundColor:
                        item.color ?? BAR_COLORS[idx % BAR_COLORS.length],
                      opacity: active ? 1 : activeKey ? 0.45 : 0.9,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.hValue, isSidebar && styles.hValueSidebar]}>
                {item.contributionPct}%
              </Text>
            </View>
          );
          if (!onSelectKey) {
            return <View key={item.key}>{row}</View>;
          }
          return (
            <Pressable
              key={item.key}
              onPress={() =>
                onSelectKey(active ? null : item.key)
              }
              style={({ pressed }) => [
                styles.hPress,
                active && styles.hPressActive,
                pressed && { opacity: 0.88 },
              ]}
            >
              {row}
            </Pressable>
          );
        })}
        {resolvedFooter ? (
          <Text style={[styles.hFoot, isSidebar && styles.hFootSidebar]}>
            {resolvedFooter}
          </Text>
        ) : null}
      </View>
    );
  }

  const pad = { top: 12, right: 8, bottom: 28, left: 8 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  const groupW = items.length > 0 ? chartW / items.length : chartW;
  const barW = Math.max(10, Math.min(22, groupW * 0.55));
  const baseY = pad.top + chartH;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((t) => (
          <Line
            key={`g-${t}`}
            x1={pad.left}
            y1={pad.top + t * chartH}
            x2={pad.left + chartW}
            y2={pad.top + t * chartH}
            stroke="#EFF2F5"
            strokeWidth={1}
            strokeDasharray={t === 0.5 ? "3 3" : undefined}
          />
        ))}
        {items.map((item, i) => {
          const barH = Math.max(2, (item.value / maxVal) * chartH);
          const x = pad.left + i * groupW + (groupW - barW) / 2;
          const active = activeKey === item.key;
          const color =
            item.color ?? BAR_COLORS[i % BAR_COLORS.length];
          return (
            <G key={item.key}>
              <Rect
                x={x}
                y={baseY - barH}
                width={barW}
                height={barH}
                fill={color}
                rx={3}
                opacity={active ? 1 : activeKey ? 0.4 : 0.88}
              />
              <SvgText
                x={x + barW / 2}
                y={height - 8}
                fontSize={8}
                fill={active ? color : "#A1A5B7"}
                fontWeight={active ? "700" : "500"}
                textAnchor="middle"
              >
                {item.shortLabel ?? item.label.slice(0, 6)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {onSelectKey
        ? items.map((item, i) => {
            const groupW = chartW / items.length;
            const x = pad.left + i * groupW;
            const active = activeKey === item.key;
            return (
              <Pressable
                key={`hit-${item.key}`}
                style={{
                  position: "absolute",
                  left: x,
                  top: pad.top,
                  width: groupW,
                  height: chartH + pad.bottom,
                }}
                onPress={() =>
                  onSelectKey(active ? null : item.key)
                }
              />
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: "#A1A5B7",
    fontWeight: "500",
    textAlign: "center",
  },
  hWrap: {
    gap: 7,
    width: "100%",
  },
  hWrapSidebar: {
    gap: 8,
  },
  hPress: {
    borderRadius: 6,
    paddingVertical: 1,
    paddingHorizontal: 2,
    marginHorizontal: -2,
  },
  hPressActive: {
    backgroundColor: "rgba(62, 151, 255, 0.08)",
  },
  hRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  hRowSidebar: {
    gap: 6,
    minHeight: 22,
  },
  hLabel: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "32%",
    minWidth: 64,
    maxWidth: 120,
    fontSize: 10,
    fontWeight: "600",
    color: "#181C32",
    overflow: "hidden",
  },
  hLabelSidebar: {
    width: 78,
    fontSize: 10,
    lineHeight: 13,
  },
  hLabelActive: {
    color: "#3E97FF",
    fontWeight: "700",
  },
  hTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F1F1F4",
    overflow: "hidden",
    minWidth: 40,
  },
  hTrackSidebar: {
    height: 7,
    minWidth: 28,
  },
  hFill: {
    height: "100%",
    borderRadius: 999,
  },
  hValue: {
    width: 40,
    fontSize: 10,
    fontWeight: "700",
    color: "#78829D",
    textAlign: "right",
    flexShrink: 0,
  },
  hValueSidebar: {
    width: 28,
    fontSize: 10,
    lineHeight: 13,
  },
  hFoot: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 4,
  },
  hFootSidebar: {
    marginTop: 6,
    lineHeight: 13,
  },
});
