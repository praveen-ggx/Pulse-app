/**
 * Shared animated chart primitives for party analytics dashboards.
 * Built on react-native-svg + Animated (same stack as vehicle analytics).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { ChartValueCallout } from "@/components/analytics/ChartValueCallout";
import Layout from "@/constants/Layout";
import { Theme } from "@/constants/Theme";
import { formatINRChip } from "@/lib/format";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const PAD = { top: 20, right: 14, bottom: 32, left: 50 };

export interface TrendPoint {
  label: string;
  revenue: number;
  expense: number;
  profit: number;
  margin: number;
  tripCount: number;
  customerCount?: number;
}

function smoothLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
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

function useEntranceAnim(trigger: string, duration = 520) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [trigger, anim, duration]);
  return anim;
}

function useBarAnim(trigger: string, duration = 780) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [trigger, anim, duration]);
  return anim;
}

export interface TrendLineTooltipRow {
  label: string;
  value: string;
}

export interface TrendLineChartProps {
  data: readonly TrendPoint[];
  width: number;
  height?: number;
  field: "revenue" | "profit" | "margin";
  color?: string;
  gradientId?: string;
  /** When set, points are tappable and show a detail card. */
  interactive?: boolean;
  selectedIndex?: number | null;
  onPointPress?: (index: number, point: TrendPoint) => void;
  detailRows?: (point: TrendPoint) => TrendLineTooltipRow[];
}

const TOOLTIP_WIDTH = 196;

export const TrendLineChart = memo(function TrendLineChart({
  data,
  width,
  height = 160,
  field,
  color = Theme.primary,
  gradientId = "trendLineGrad",
  interactive = false,
  selectedIndex: selectedIndexProp,
  onPointPress,
  detailRows,
}: TrendLineChartProps) {
  const [internalIndex, setInternalIndex] = useState<number | null>(null);
  const selectedIndex =
    selectedIndexProp !== undefined ? selectedIndexProp : internalIndex;

  const trigger = data.map((d) => `${d.label}:${d[field]}`).join("|") + field;
  const entrance = useEntranceAnim(trigger);
  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  useEffect(() => {
    setInternalIndex(null);
  }, [trigger]);

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const values = data.map((d) => d[field]);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const n = data.length;
  const scaleX = (i: number) =>
    PAD.left + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const scaleY = (v: number) => PAD.top + ((maxVal - v) / range) * chartH;

  const pts = data.map((d, i) => ({ x: scaleX(i), y: scaleY(d[field]) }));
  const baseY = PAD.top + chartH;

  const linePath = smoothLinePath(pts);
  const areaPath = smoothAreaPath(pts, baseY, PAD.left);

  const yTicks = [0, 0.5, 1].map((t) => ({
    y: PAD.top + t * chartH,
    val: maxVal - t * range,
  }));

  const isMargin = field === "margin";
  const pathLength = useMemo(() => {
    if (pts.length < 2) return 400;
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return Math.max(len * 1.2, 200);
  }, [pts]);

  const lineDraw = useRef(new Animated.Value(pathLength)).current;
  useEffect(() => {
    lineDraw.setValue(pathLength);
    Animated.timing(lineDraw, {
      toValue: 0,
      duration: 950,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [lineDraw, pathLength, trigger]);

  const handlePointPress = useCallback(
    (index: number) => {
      const point = data[index];
      if (!point) return;
      const next = selectedIndex === index ? null : index;
      if (selectedIndexProp === undefined) setInternalIndex(next);
      onPointPress?.(index, point);
    },
    [data, onPointPress, selectedIndex, selectedIndexProp],
  );

  const activePoint =
    selectedIndex != null && selectedIndex >= 0 ? data[selectedIndex] : null;
  const activePos =
    selectedIndex != null && selectedIndex >= 0 ? pts[selectedIndex] : null;
  const tooltipRows = activePoint
    ? detailRows?.(activePoint) ?? [
        {
          label: isMargin ? "Margin" : "Amount",
          value: isMargin
            ? `${activePoint[field].toFixed(0)}%`
            : formatINRChip(activePoint[field]),
        },
      ]
    : [];

  const tooltipLeft = activePos
    ? Math.max(
        8,
        Math.min(activePos.x - TOOLTIP_WIDTH / 2, width - TOOLTIP_WIDTH - 8),
      )
    : 0;
  const tooltipTop =
    activePos && activePos.y < 128
      ? activePos.y + 18
      : activePos
        ? Math.max(4, activePos.y - 148)
        : 0;

  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [{ translateY }],
        position: "relative",
        width,
        height,
      }}
    >
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {yTicks.map((tick, i) => (
          <Line
            key={i}
            x1={PAD.left}
            y1={tick.y}
            x2={PAD.left + chartW}
            y2={tick.y}
            stroke={Theme.borderLight}
            strokeWidth={1}
            strokeDasharray={i === 2 ? undefined : "3 3"}
          />
        ))}

        {areaPath ? <Path d={areaPath} fill={`url(#${gradientId})`} /> : null}

        {linePath ? (
          <AnimatedPath
            d={linePath}
            stroke={color}
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={pathLength}
            strokeDashoffset={lineDraw}
          />
        ) : null}

        {activePos ? (
          <Line
            x1={activePos.x}
            y1={PAD.top}
            x2={activePos.x}
            y2={baseY}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="4 4"
            strokeOpacity={0.45}
          />
        ) : null}

        {pts.map((p, i) => (
          <TrendDot
            key={`${p.x}-${p.y}-${i}`}
            cx={p.x}
            cy={p.y}
            color={color}
            index={i}
            trigger={trigger}
            selected={selectedIndex === i}
          />
        ))}

        {yTicks.map((tick, i) => (
          <SvgText
            key={i}
            x={PAD.left - 5}
            y={tick.y + 4}
            textAnchor="end"
            fontSize={8}
            fill={Theme.textMuted}
          >
            {isMargin
              ? `${tick.val.toFixed(0)}%`
              : formatINRChip(Math.abs(tick.val))}
          </SvgText>
        ))}

        {data.map((d, i) => (
          <SvgText
            key={d.label}
            x={scaleX(i)}
            y={height - 6}
            textAnchor="middle"
            fontSize={9}
            fill={selectedIndex === i ? Theme.textPrimary : Theme.textMuted}
            fontWeight="600"
          >
            {d.label}
          </SvgText>
        ))}
      </Svg>

      {interactive
        ? pts.map((p, i) => (
            <Pressable
              key={`hit-${data[i]?.label ?? i}`}
              onPress={() => handlePointPress(i)}
              accessibilityRole="button"
              accessibilityLabel={`${data[i].label}, ${
                isMargin
                  ? `${data[i][field].toFixed(0)} percent`
                  : formatINRChip(data[i][field])
              }. Show month details.`}
              accessibilityState={{ selected: selectedIndex === i }}
              hitSlop={Layout.touchTargetHitSlop}
              style={[
                styles.hit,
                {
                  left: p.x - Layout.minTouchTargetSize / 2,
                  top: p.y - Layout.minTouchTargetSize / 2,
                },
                Platform.OS === "web"
                  ? ({ cursor: "pointer" } as unknown as ViewStyle)
                  : null,
              ]}
            />
          ))
        : null}

      {interactive && activePoint && activePos ? (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            { left: tooltipLeft, top: tooltipTop, width: TOOLTIP_WIDTH },
          ]}
        >
          <Text style={styles.tooltipTitle} numberOfLines={1}>
            {activePoint.label}
          </Text>
          {tooltipRows.map((row) => (
            <View key={row.label} style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>{row.label}</Text>
              <Text style={styles.tooltipValue} numberOfLines={1}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
});

function TrendDot({
  cx,
  cy,
  color,
  index,
  trigger,
  selected = false,
}: {
  cx: number;
  cy: number;
  color: string;
  index: number;
  trigger: string;
  selected?: boolean;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    scale.setValue(0);
    const t = setTimeout(() => {
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: false,
      }).start();
    }, 120 + index * 55);
    return () => clearTimeout(t);
  }, [scale, index, trigger]);

  const r = scale.interpolate({
    inputRange: [0, 1],
    outputRange: [0, selected ? 7 : 5],
  });

  return (
    <G>
      {selected ? (
        <Circle
          cx={cx}
          cy={cy}
          r={12}
          fill={color}
          fillOpacity={0.16}
        />
      ) : null}
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={r as unknown as number}
        fill={selected ? color : Theme.screenBackground}
        stroke={color}
        strokeWidth={2}
      />
    </G>
  );
}

const styles = StyleSheet.create({
  hit: {
    position: "absolute",
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    borderRadius: Layout.minTouchTargetSize / 2,
  },
  tooltip: {
    position: "absolute",
    zIndex: 4,
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
        } as unknown as ViewStyle)
      : {
          elevation: 6,
          shadowColor: Theme.primary,
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }),
  },
  tooltipTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tooltipLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  tooltipValue: {
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimary,
    flexShrink: 1,
    minWidth: 0,
    textAlign: "right",
  },
});

export interface TrendBarChartProps {
  data: readonly TrendPoint[];
  width: number;
  height?: number;
  /** Primary bar field (defaults to revenue). */
  primaryField?: "revenue" | "expense";
  /** Secondary bar field (defaults to expense). */
  secondaryField?: "revenue" | "expense";
  primaryColor?: string;
  secondaryColor?: string;
  activeIndex?: number | null;
  onSelectIndex?: (index: number | null) => void;
}

export const TrendBarChart = memo(function TrendBarChart({
  data,
  width,
  height = 168,
  primaryField = "revenue",
  secondaryField = "expense",
  primaryColor = Theme.primary,
  secondaryColor = Theme.teslaRed,
  activeIndex = null,
  onSelectIndex,
}: TrendBarChartProps) {
  const trigger = data.map((d) => d.label).join(",");
  const barAnim = useBarAnim(trigger);
  const entrance = useEntranceAnim(trigger, 400);

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const maxVal = Math.max(
    ...data.flatMap((d) => [d[primaryField], d[secondaryField]]),
    1,
  );
  const baseY = PAD.top + chartH;
  const barGroupW = data.length > 0 ? chartW / data.length : chartW;
  const barW = Math.max(4, Math.min(20, barGroupW * 0.34));

  const scaleH = (v: number) => Math.max(2, (v / maxVal) * chartH);
  const scaleX = (i: number) => PAD.left + i * barGroupW + barGroupW / 2;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const hoverPoint = hoverIndex != null ? data[hoverIndex] : null;

  return (
    <Animated.View style={{ opacity: entrance, position: "relative", width, height }}>
      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((t, i) => (
          <Line
            key={i}
            x1={PAD.left}
            y1={PAD.top + t * chartH}
            x2={PAD.left + chartW}
            y2={PAD.top + t * chartH}
            stroke={Theme.borderLight}
            strokeWidth={1}
            strokeDasharray={i > 0 ? "3 3" : undefined}
          />
        ))}

        <SvgText
          x={PAD.left - 5}
          y={PAD.top + 4}
          textAnchor="end"
          fontSize={8}
          fill={Theme.textMuted}
        >
          {formatINRChip(maxVal)}
        </SvgText>

        {data.map((d, i) => {
          const gx = scaleX(i);
          const primaryH = scaleH(d[primaryField]);
          const secondaryH = scaleH(d[secondaryField]);
          const dimmed = activeIndex != null && activeIndex !== i;

          const animPrimaryH = barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, primaryH],
          });
          const animPrimaryY = barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [baseY, baseY - primaryH],
          });
          const animSecondaryH = barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, secondaryH],
          });
          const animSecondaryY = barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [baseY, baseY - secondaryH],
          });

          return (
            <G key={d.label}>
              <AnimatedRect
                x={gx - barW - 1.5}
                y={animPrimaryY as unknown as number}
                width={barW}
                height={animPrimaryH as unknown as number}
                fill={primaryColor}
                rx={3}
                fillOpacity={dimmed ? 0.28 : 0.92}
              />
              <AnimatedRect
                x={gx + 1.5}
                y={animSecondaryY as unknown as number}
                width={barW}
                height={animSecondaryH as unknown as number}
                fill={secondaryColor}
                rx={3}
                fillOpacity={dimmed ? 0.22 : 0.78}
              />
              <SvgText
                x={gx}
                y={height - 7}
                textAnchor="middle"
                fontSize={9}
                fill={hoverIndex === i ? Theme.textPrimary : Theme.textMuted}
                fontWeight="600"
              >
                {d.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {data.map((d, i) => (
        <Pressable
          key={`hit-${d.label}`}
          onHoverIn={() => setHoverIndex(i)}
          onHoverOut={() => setHoverIndex(null)}
          onPress={() => onSelectIndex?.(activeIndex === i ? null : i)}
          style={{
            position: "absolute",
            left: PAD.left + i * barGroupW,
            top: PAD.top,
            width: barGroupW,
            height: chartH + PAD.bottom,
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: activeIndex === i }}
          accessibilityLabel={d.label}
        />
      ))}
      {hoverPoint && hoverIndex != null ? (
        <ChartValueCallout
          title={hoverPoint.label}
          rows={[
            { label: "In", value: formatINRChip(hoverPoint[primaryField]) },
            { label: "Out", value: formatINRChip(hoverPoint[secondaryField]) },
          ]}
          left={Math.max(8, Math.min(scaleX(hoverIndex) - 66, width - 148))}
          top={8}
        />
      ) : null}
    </Animated.View>
  );
});

/** @deprecated Use TrendLineChart — alias for migration from vehicle charts. */
export const LineChart = TrendLineChart;

/** @deprecated Use TrendBarChart — alias for migration from vehicle charts. */
export const RevExpBarChart = TrendBarChart;
