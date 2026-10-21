import { ChartValueCallout } from "@/components/analytics/ChartValueCallout";
import Theme from "@/constants/Theme";
import type { SalesTrendPoint } from "@/features/network/utils/connectionSalesAnalytics.util";
import { formatINRChip } from "@/lib/format";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";

const PAD = { top: 12, right: 8, bottom: 24, left: 8 };
const CALLOUT_W = 148;
const CALLOUT_H = 72;
const DOT_GAP = 16;

function plotValue(d: SalesTrendPoint): number {
  return d.revenue || d.trips;
}

function calloutOrigin(
  x: number,
  y: number,
  width: number,
  height: number,
): { left: number; top: number } {
  let left = x + DOT_GAP;
  if (left + CALLOUT_W > width - 4) left = x - CALLOUT_W - DOT_GAP;
  left = Math.max(4, Math.min(left, width - CALLOUT_W - 4));
  let top = y - CALLOUT_H / 2;
  top = Math.max(4, Math.min(top, height - CALLOUT_H - 4));
  return { left, top };
}

function smoothLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  }
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i += 1) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const dx = (p1.x - p0.x) * 0.4;
    d += ` C ${(p0.x + dx).toFixed(2)} ${p0.y.toFixed(2)}, ${(p1.x - dx).toFixed(2)} ${p1.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

function smoothAreaPath(
  pts: { x: number; y: number }[],
  baseY: number,
  leftX: number,
): string {
  const line = smoothLinePath(pts);
  if (!line || pts.length < 2) return "";
  const last = pts[pts.length - 1];
  return `${line} L ${last.x.toFixed(2)} ${baseY.toFixed(2)} L ${leftX.toFixed(2)} ${baseY.toFixed(2)} Z`;
}

type Props = {
  data: SalesTrendPoint[];
  width: number;
  height?: number;
  activeMonthKey?: string | null;
  onSelectMonth?: (monthKey: string | null) => void;
  color?: string;
};

export function NetworkDesktopSalesLineChart({
  data,
  width,
  height = 132,
  activeMonthKey = null,
  onSelectMonth,
  color = "#3E97FF",
}: Props) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const { pts, linePath, areaPath } = useMemo(() => {
    const values = data.map((d) => plotValue(d));
    const max = Math.max(...values, 1);
    const n = data.length;
    const scaleX = (i: number) =>
      PAD.left + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
    const scaleY = (v: number) => PAD.top + ((max - v) / max) * chartH;
    const points = data.map((d, i) => ({
      x: scaleX(i),
      y: scaleY(plotValue(d)),
      monthKey: d.monthKey,
    }));
    const base = PAD.top + chartH;
    return {
      pts: points,
      linePath: smoothLinePath(points),
      areaPath: smoothAreaPath(points, base, PAD.left),
      baseY: base,
      maxVal: max,
    };
  }, [chartH, chartW, data]);

  if (data.every((d) => plotValue(d) === 0)) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>No trip trend for current filters.</Text>
      </View>
    );
  }

  const hoverPoint = pts.find((p) => p.monthKey === (hoverKey ?? activeMonthKey));
  const hoverData = data.find((d) => d.monthKey === hoverPoint?.monthKey);

  return (
    <View style={{ width, height, position: "relative" }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="salesLineGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.22" />
            <Stop offset="1" stopColor={color} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + t * chartH;
          return (
            <Line
              key={`grid-${t}`}
              x1={PAD.left}
              y1={y}
              x2={PAD.left + chartW}
              y2={y}
              stroke="#EFF2F5"
              strokeWidth={1}
              strokeDasharray={t === 1 ? "3 3" : undefined}
            />
          );
        })}

        {areaPath ? <Path d={areaPath} fill="url(#salesLineGrad)" /> : null}
        {linePath ? (
          <Path
            d={linePath}
            stroke={color}
            strokeWidth={2.2}
            fill="none"
            strokeLinecap="round"
          />
        ) : null}

        {pts.map((p, i) => {
          const active = activeMonthKey === p.monthKey || hoverKey === p.monthKey;
          return (
            <G key={p.monthKey}>
              <Circle
                cx={p.x}
                cy={p.y}
                r={active ? 6 : 4.5}
                fill={active ? color : Theme.cardWhite}
                stroke={color}
                strokeWidth={active ? 2.5 : 2}
              />
              <SvgText
                x={p.x}
                y={height - 8}
                fontSize={9}
                fill={active ? color : "#A1A5B7"}
                fontWeight={active ? "700" : "500"}
                textAnchor="middle"
              >
                {data[i]?.label ?? ""}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {pts.map((p, i) => {
        const colW = Math.max(28, chartW / Math.max(data.length, 1));
        return (
          <Pressable
            key={`hit-${p.monthKey}`}
            style={[
              styles.hit,
              {
                left: p.x - colW / 2,
                top: 0,
                width: colW,
                height,
              },
            ]}
            onHoverIn={() => setHoverKey(p.monthKey)}
            onHoverOut={() => setHoverKey(null)}
            onPress={() =>
              onSelectMonth?.(activeMonthKey === p.monthKey ? null : p.monthKey)
            }
            accessibilityRole="button"
            accessibilityLabel={`Month ${data[i]?.label ?? p.monthKey}`}
          />
        );
      })}
      {hoverPoint && hoverData ? (
        <ChartValueCallout
          title={hoverData.label}
          rows={[
            { label: "Amount", value: formatINRChip(hoverData.revenue) },
            { label: "Trips", value: String(hoverData.trips) },
          ]}
          {...calloutOrigin(hoverPoint.x, hoverPoint.y, width, height)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
    color: "#A1A5B7",
    fontWeight: "500",
  },
  hit: {
    position: "absolute",
  },
});
