/**
 * Segmented date filter. One capsule: a quiet Date mark, the presets, and a calendar.
 * The selected preset is the only filled chip, so the row reads as a single control.
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";

export type SmartDateOption<T extends string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  /** Current id. May be a custom value that is not one of `options`. */
  value: string;
  options: readonly SmartDateOption<T>[];
  onChange: (id: T) => void;
  /** Leading mark. Date filters say Date; other filters pass their own name. */
  mark?: string;
  markIcon?: ComponentProps<typeof FontAwesome>["name"];
  customActive?: boolean;
  rangeLabel?: string | null;
  onCustomPress?: () => void;
};

export function SmartDateFilter<T extends string>({
  value,
  options,
  onChange,
  customActive = false,
  rangeLabel,
  onCustomPress,
  mark = "Date",
  markIcon = "calendar-o",
}: Props<T>) {
  const presetActive = options.some((option) => option.id === value);
  const live = customActive || (presetActive && options[0] != null && value !== options[0].id);
  const range = (rangeLabel ?? "").trim();

  return (
    <View
      style={[styles.tray, live && styles.trayLive]}
      accessibilityRole="tablist"
    >
      <View style={styles.mark}>
        <FontAwesome
          name={markIcon}
          size={11}
          color={live ? Theme.primary : Theme.textRouteCard}
        />
        <Text style={[styles.markText, live && styles.markTextLive]}>{mark}</Text>
      </View>
      {options.map((option) => {
        const selected = !customActive && value === option.id;
        return (
          <Pressable
            key={option.id}
            style={(state: HoverPressState) => [
              styles.segment,
              selected && styles.segmentOn,
              WEB_POINTER,
              WEB_TRANSITION,
              !selected && isHovered(state) && hoverRowWash,
            ]}
            onPress={() => onChange(option.id)}
            hitSlop={4}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
          >
            <Text
              style={[styles.segmentText, selected && styles.segmentTextOn]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
      {onCustomPress ? (
        <Pressable
          style={(state: HoverPressState) => [
            styles.calendar,
            customActive && styles.segmentOn,
            WEB_POINTER,
            WEB_TRANSITION,
            !customActive && isHovered(state) && hoverRowWash,
          ]}
          onPress={onCustomPress}
          hitSlop={Layout.touchTargetHitSlop}
          accessibilityRole="button"
          accessibilityState={{ selected: customActive }}
          accessibilityLabel={
            customActive && range ? `Custom range ${range}` : "Pick a custom date range"
          }
        >
          <FontAwesome
            name="calendar"
            size={12}
            color={customActive ? Theme.primary : Theme.textRouteCard}
          />
          {customActive && range ? (
            <Text style={styles.rangeText} numberOfLines={1}>
              {range}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 2,
    padding: 3,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  trayLive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueSoft,
  },
  mark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    minHeight: 28,
  },
  markText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textRouteCard,
  },
  markTextLive: {
    color: Theme.primary,
  },
  segment: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  segmentOn: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.primary,
  },
  segmentText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: Theme.textRouteCard,
  },
  segmentTextOn: {
    color: Theme.primary,
    fontWeight: "700",
  },
  calendar: {
    minHeight: 28,
    minWidth: 28,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  rangeText: {
    maxWidth: 120,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: Theme.primary,
  },
});
