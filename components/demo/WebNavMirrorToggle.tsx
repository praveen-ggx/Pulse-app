/**
 * Desktop web header nav — Slack-style mirror toggle.
 * Selection stays fully expanded on a dark thumb; hover previews on a light thumb.
 */
import { WEB_TOP_NAV_ICON } from "@/components/demo/webTopNavIcon.tokens";
import Theme from "@/constants/Theme";
import type { LucideIcon } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
    Easing,
    makeMutable,
    type SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

const PADDING = 6;
const GAP = 6;
const INACTIVE_W = 44;
const ACTIVE_W = 210;
const HEIGHT = 44;

const WIDTH_MOTION = {
  duration: 180,
  easing: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

const WEB_BOX =
  Platform.OS === "web"
    ? ({ boxSizing: "border-box" } as const)
    : ({} as const);

type SegmentVisual = "selected-expanded" | "hover-expanded" | "idle";

export type WebNavMirrorItem = {
  id: string;
  title: string;
  subtitle?: string;
  Icon: LucideIcon;
};

type Props = {
  items: WebNavMirrorItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onWarmAt?: (index: number) => void;
};

function segmentWidthFor(
  index: number,
  activeIndex: number,
  hoverIndex: number | null,
): number {
  if (activeIndex >= 0 && index === activeIndex) return ACTIVE_W;
  if (hoverIndex === index && hoverIndex !== activeIndex) return ACTIVE_W;
  return INACTIVE_W;
}

function segmentVisualFor(
  index: number,
  activeIndex: number,
  hoverIndex: number | null,
): SegmentVisual {
  if (index === activeIndex) return "selected-expanded";
  if (hoverIndex === index && hoverIndex !== activeIndex) return "hover-expanded";
  return "idle";
}

function iconColorFor(visual: SegmentVisual): string {
  if (visual === "selected-expanded") return WEB_TOP_NAV_ICON.onDark;
  if (visual === "hover-expanded") return WEB_TOP_NAV_ICON.onHover;
  return WEB_TOP_NAV_ICON.muted;
}

function WebNavMirrorSegment({
  item,
  visual,
  widthSV,
  selected,
  onPress,
  onHoverIn,
}: {
  item: WebNavMirrorItem;
  visual: SegmentVisual;
  widthSV: SharedValue<number>;
  selected: boolean;
  onPress: () => void;
  onHoverIn: () => void;
}) {
  const expanded = visual !== "idle";
  const labelOpacity = useSharedValue(expanded ? 1 : 0);
  const Icon = item.Icon;

  useEffect(() => {
    labelOpacity.value = withTiming(expanded ? 1 : 0, {
      ...WIDTH_MOTION,
      duration: expanded ? 170 : 110,
    });
  }, [expanded, labelOpacity]);

  const segmentStyle = useAnimatedStyle(() => ({
    width: widthSV.value,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ translateX: (1 - labelOpacity.value) * -6 }],
  }));

  const iconColor = iconColorFor(visual);

  const titleStyle =
    visual === "hover-expanded" ? styles.titleHover : styles.titleActive;
  const subtitleStyle =
    visual === "hover-expanded" ? styles.subtitleHover : styles.subtitleActive;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={onHoverIn}
      style={styles.segmentPressable}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      <Animated.View style={[styles.segment, segmentStyle]}>
        <View style={styles.iconBox}>
          <Icon
            size={WEB_TOP_NAV_ICON.size}
            color={iconColor}
            strokeWidth={WEB_TOP_NAV_ICON.stroke}
          />
        </View>
        <Animated.View style={[styles.labelWrap, labelStyle]} pointerEvents="none">
          <Text numberOfLines={1} style={titleStyle}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text numberOfLines={1} style={subtitleStyle}>
              {item.subtitle}
            </Text>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export function WebNavMirrorToggle({
  items,
  activeIndex,
  onSelect,
  onWarmAt,
}: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const hoverClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * No permitted tabs → render nothing. Otherwise the capsule and its two
   * sliding indicator rails still paint as an empty pill, which is what a
   * restricted member saw once per-domain visibility started filtering items.
   */
  const hasItems = items.length > 0;

  const previewingElsewhere =
    hoverIndex != null && hoverIndex !== activeIndex;

  const segmentWidths = useMemo(
    () =>
      items.map((_, index) =>
        makeMutable(index === activeIndex ? ACTIVE_W : INACTIVE_W),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- width slots keyed by item count only
    [items.length],
  );

  const hoverThumbOpacity = useSharedValue(0);
  const hoverIndexSV = useSharedValue(-1);
  const activeIndexSV = useSharedValue(activeIndex);

  useEffect(() => {
    activeIndexSV.value = activeIndex;
    hoverIndexSV.value = hoverIndex ?? -1;

    items.forEach((_, index) => {
      const width = segmentWidths[index];
      if (!width) return;
      width.value = withTiming(
        segmentWidthFor(index, activeIndex, hoverIndex),
        WIDTH_MOTION,
      );
    });

    hoverThumbOpacity.value = withTiming(previewingElsewhere ? 1 : 0, {
      duration: previewingElsewhere ? 140 : 100,
      easing: Easing.out(Easing.cubic),
    });
  }, [
    activeIndex,
    activeIndexSV,
    hoverIndex,
    hoverIndexSV,
    items,
    hoverThumbOpacity,
    previewingElsewhere,
    segmentWidths,
  ]);

  useEffect(
    () => () => {
      if (hoverClearRef.current) clearTimeout(hoverClearRef.current);
    },
    [],
  );

  const clearHoverSoon = () => {
    if (hoverClearRef.current) clearTimeout(hoverClearRef.current);
    hoverClearRef.current = setTimeout(() => setHoverIndex(null), 60);
  };

  const onSegmentHoverIn = (index: number) => {
    if (hoverClearRef.current) clearTimeout(hoverClearRef.current);
    setHoverIndex(index);
    onWarmAt?.(index);
  };

  const activeThumbStyle = useAnimatedStyle(() => {
    const active = activeIndexSV.value;
    if (active < 0) {
      return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
    }
    let x = 0;
    for (let i = 0; i < active; i += 1) {
      x += (segmentWidths[i]?.value ?? INACTIVE_W) + GAP;
    }
    return {
      opacity: 1,
      transform: [{ translateX: x }],
      width: segmentWidths[active]?.value ?? ACTIVE_W,
    };
  });

  const hoverThumbStyle = useAnimatedStyle(() => {
    const hover = hoverIndexSV.value;
    const active = activeIndexSV.value;
    if (hover < 0 || hover === active) {
      return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
    }
    let x = 0;
    for (let i = 0; i < hover; i += 1) {
      x += (segmentWidths[i]?.value ?? INACTIVE_W) + GAP;
    }
    return {
      opacity: hoverThumbOpacity.value,
      transform: [{ translateX: x }],
      width: segmentWidths[hover]?.value ?? ACTIVE_W,
    };
  });

  // Placed after every hook so hook order stays stable across renders.
  if (!hasItems) return null;

  return (
    <View
      style={styles.track}
      onHoverIn={() => {
        if (hoverClearRef.current) clearTimeout(hoverClearRef.current);
      }}
      onHoverOut={clearHoverSoon}
    >
      <View style={styles.slot}>
        <Animated.View style={[styles.thumbActive, activeThumbStyle]} pointerEvents="none" />
        <Animated.View style={[styles.thumbHover, hoverThumbStyle]} pointerEvents="none" />
        <View style={styles.row}>
          {items.map((item, index) => (
            <WebNavMirrorSegment
              key={item.id}
              item={item}
              visual={segmentVisualFor(index, activeIndex, hoverIndex)}
              widthSV={segmentWidths[index]!}
              selected={index === activeIndex}
              onPress={() => {
                if (hoverClearRef.current) clearTimeout(hoverClearRef.current);
                setHoverIndex(null);
                onSelect(index);
              }}
              onHoverIn={() => onSegmentHoverIn(index)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    borderRadius: 999,
    padding: PADDING,
    minWidth: 0,
    maxWidth: 560,
    overflow: "hidden",
    ...WEB_BOX,
  },
  slot: {
    position: "relative",
    height: HEIGHT,
    alignSelf: "flex-start",
    ...WEB_BOX,
  },
  thumbActive: {
    position: "absolute",
    top: 0,
    left: 0,
    height: HEIGHT,
    borderRadius: 999,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.65)",
    zIndex: 0,
    shadowColor: Theme.brandBlueShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    ...WEB_BOX,
  },
  thumbHover: {
    position: "absolute",
    top: 0,
    left: 0,
    height: HEIGHT,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    zIndex: 1,
    shadowColor: "#94A3B8",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    ...WEB_BOX,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: HEIGHT,
    gap: GAP,
    zIndex: 2,
  },
  segmentPressable: {
    height: HEIGHT,
    flexShrink: 0,
    justifyContent: "center",
  },
  segment: {
    height: HEIGHT,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    ...WEB_BOX,
  },
  iconBox: {
    width: INACTIVE_W,
    height: HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    zIndex: 2,
  },
  labelWrap: {
    position: "absolute",
    left: INACTIVE_W,
    top: 0,
    bottom: 0,
    width: ACTIVE_W - INACTIVE_W,
    justifyContent: "center",
    paddingRight: 8,
    zIndex: 1,
  },
  titleActive: {
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    lineHeight: 14,
    includeFontPadding: false,
    ...(Platform.OS === "web" ? { whiteSpace: "nowrap" as const } : null),
  },
  subtitleActive: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.accentGold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    lineHeight: 10,
    includeFontPadding: false,
  },
  titleHover: {
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    color: "#1e293b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    lineHeight: 14,
    includeFontPadding: false,
    ...(Platform.OS === "web" ? { whiteSpace: "nowrap" as const } : null),
  },
  subtitleHover: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.networkBadgeClientText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    lineHeight: 10,
    includeFontPadding: false,
  },
});
