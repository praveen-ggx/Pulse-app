import { useCallback, useEffect, useRef } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import Theme from "@/constants/Theme";

const ITEM_H = 48;
const FADE_COLOR_SOLID = "rgba(255,255,255,0.96)";
const FADE_COLOR_TRANS = "rgba(255,255,255,0)";
const VISIBLE = 5; // 2 above, selected, 2 below
const DIAL_H = ITEM_H * VISIBLE;
const PAD = 2; // padding rows each side = (VISIBLE-1)/2

// Common Indian truck tonnages
export const CAPACITY_VALUES: string[] = [
  "0.3", "0.5", "0.75", "1", "1.5", "2", "2.5", "3",
  "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7",
  "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11",
  "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "28", "30",
  "32", "35", "40", "43", "45", "50",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

function CapacityDialPickerNative({ value, onChange }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const lastIndex = useRef(-1);

  const resolvedValue = value && CAPACITY_VALUES.includes(value) ? value : CAPACITY_VALUES[0]!;

  const getIndex = (v: string) => {
    const idx = CAPACITY_VALUES.indexOf(v);
    return idx >= 0 ? idx : 0;
  };

  useEffect(() => {
    const idx = getIndex(resolvedValue);
    if (idx === lastIndex.current) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated: false });
    }, 50);
    return () => clearTimeout(t);
   
  }, [resolvedValue]);

  useEffect(() => {
    if (!value || !CAPACITY_VALUES.includes(value)) {
      onChange(CAPACITY_VALUES[0]!);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScrollSettled = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      const idx = Math.max(0, Math.min(Math.round(y / ITEM_H), CAPACITY_VALUES.length - 1));
      lastIndex.current = idx;
      const picked = CAPACITY_VALUES[idx]!;
      if (picked !== value) onChange(picked);
    },
    [value, onChange],
  );

  return (
    <View style={styles.root}>
      <View style={styles.selectorBar} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={onScrollSettled}
        onScrollEndDrag={onScrollSettled}
        contentContainerStyle={styles.content}
        bounces={false}
      >
        {Array.from({ length: PAD }).map((_, i) => (
          <View key={`t${i}`} style={styles.padItem} />
        ))}
        {CAPACITY_VALUES.map((v) => {
          const active = v === resolvedValue;
          return (
            <View key={v} style={styles.item}>
              <Text style={[styles.label, active && styles.labelActive]}>{v}</Text>
              <Text style={[styles.unit, active && styles.unitActive]}>TON</Text>
            </View>
          );
        })}
        {Array.from({ length: PAD }).map((_, i) => (
          <View key={`b${i}`} style={styles.padItem} />
        ))}
      </ScrollView>
      <LinearGradient
        colors={[FADE_COLOR_SOLID, FADE_COLOR_TRANS]}
        style={[styles.fade, styles.fadeTop]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[FADE_COLOR_TRANS, FADE_COLOR_SOLID]}
        style={[styles.fade, styles.fadeBot]}
        pointerEvents="none"
      />
    </View>
  );
}

function CapacityDialPickerWeb({ value, onChange }: Props) {
  const resolvedValue = value && CAPACITY_VALUES.includes(value) ? value : CAPACITY_VALUES[0]!;

  useEffect(() => {
    if (!value || !CAPACITY_VALUES.includes(value)) {
      onChange(CAPACITY_VALUES[0]!);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.webRoot}>
      {/* Invisible native select covers the entire touchable area for interaction */}
      <select
        value={resolvedValue}
        onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
        style={webSelectOverlay}
      >
        {CAPACITY_VALUES.map((v) => (
          <option key={v} value={v}>{v} TON</option>
        ))}
      </select>
      {/* Visible styled display — matches other TextInput fields */}
      <View style={styles.webDisplay} pointerEvents="none">
        <Text style={styles.webDisplayText}>{resolvedValue} TON</Text>
        <Text style={styles.webCaret}>⌄</Text>
      </View>
    </View>
  );
}

const webSelectOverlay = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
  zIndex: 2,
  fontSize: 16,
} as object;

export function CapacityDialPicker(props: Props) {
  if (Platform.OS === "web") return <CapacityDialPickerWeb {...props} />;
  return <CapacityDialPickerNative {...props} />;
}

const styles = StyleSheet.create({
  webRoot: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E5E7",
    backgroundColor: "#FBFBFB",
    marginBottom: 12,
    position: "relative",
    justifyContent: "center",
  },
  webDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    pointerEvents: "none",
  },
  webDisplayText: {
    fontSize: 15,
    color: "#1e293b",
    fontWeight: "400",
  },
  webCaret: {
    fontSize: 16,
    color: "#94a3b8",
    lineHeight: 16,
  },
  root: {
    height: DIAL_H,
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  scroll: {
    flex: 1,
  },
  content: {
    alignItems: "center",
  },
  padItem: {
    height: ITEM_H,
  },
  item: {
    height: ITEM_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  label: {
    fontSize: 16,
    fontWeight: "400",
    color: Theme.textMuted,
    minWidth: 48,
    textAlign: "right",
    opacity: 0.45,
  },
  labelActive: {
    fontSize: 28,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    opacity: 1,
  },
  unit: {
    fontSize: 10,
    fontWeight: "600",
    color: "transparent",
    letterSpacing: 0.4,
    minWidth: 28,
  },
  unitActive: {
    color: Theme.primary,
  },
  selectorBar: {
    position: "absolute",
    top: ITEM_H * PAD,
    left: 0,
    right: 0,
    height: ITEM_H,
    backgroundColor: Theme.surfaceLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    zIndex: 0,
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ITEM_H * PAD,
    zIndex: 2,
  },
  fadeTop: {
    top: 0,
  },
  fadeBot: {
    bottom: 0,
  },
});
