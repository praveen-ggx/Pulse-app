/**
 * Horizontal date preset pills (Finance, entity detail, load board).
 * Light variant matches Trips hub date chips (compact tray + black active pill).
 */
import Theme from "@/constants/Theme";
import {
  WEB_POINTER,
  WEB_TRANSITION,
  hoverOnDarkWash,
  hoverRowWash,
  isHovered,
  type HoverPressState,
} from "@/constants/hoverSelection";
import type { FinancePeriodFilter } from "@/features/finance/types";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const LIGHT_PRESETS: { id: FinancePeriodFilter; label: string }[] = [
  { id: "RANGE", label: "All" },
  { id: "TODAY", label: "Today" },
  { id: "YESTERDAY", label: "Yesterday" },
  { id: "WEEK", label: "Week" },
  { id: "MONTH", label: "Month" },
];

const DARK_PRESETS: { id: FinancePeriodFilter; label: string }[] = [
  { id: "RANGE", label: "All" },
  { id: "TODAY", label: "Today" },
  { id: "YESTERDAY", label: "Yesterday" },
  { id: "WEEK", label: "Week" },
  { id: "MONTH", label: "Month" },
];

export interface DatePresetPillBarProps {
  period: FinancePeriodFilter;
  onPeriodChange: (p: FinancePeriodFilter) => void;
  /** Opens custom range picker (parent owns modal). */
  onCustomRangePress: () => void;
  customFrom?: string | null;
  customTo?: string | null;
  /** Dark background (legacy headers) vs light card (Finance / Trips parity). */
  variant?: "onDark" | "onLight";
}

export function DatePresetPillBar({
  period,
  onPeriodChange,
  onCustomRangePress,
  customFrom: _customFrom,
  customTo: _customTo,
  variant = "onDark",
}: DatePresetPillBarProps) {
  const onLight = variant === "onLight";
  const presets = onLight ? LIGHT_PRESETS : DARK_PRESETS;
  const customActive = period === "CUSTOM";

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          onLight ? styles.lightTrayScroll : styles.darkScrollContent,
          onLight && styles.lightTrayScrollInner,
        ]}
        style={onLight ? styles.lightTrayScrollView : undefined}
      >
        <View style={onLight ? styles.lightTray : styles.darkTray}>
          {presets.map(({ id, label }) => {
            const active = period === id;
            return (
              <Pressable
                key={id}
                style={(state: HoverPressState) => [
                  onLight ? styles.lightChip : styles.darkPill,
                  active &&
                    (onLight ? styles.lightChipActive : styles.darkPillActive),
                  WEB_POINTER,
                  WEB_TRANSITION,
                  !active &&
                    isHovered(state) &&
                    (onLight ? hoverRowWash : hoverOnDarkWash),
                ]}
                onPress={() => onPeriodChange(id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <Text
                  style={[
                    onLight ? styles.lightChipText : styles.darkPillText,
                    active &&
                      (onLight
                        ? styles.lightChipTextActive
                        : styles.darkPillTextActive),
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            style={(state: HoverPressState) => [
              onLight ? styles.lightIconBtn : styles.darkIconPill,
              customActive &&
                (onLight ? styles.lightChipActive : styles.darkPillActive),
              WEB_POINTER,
              WEB_TRANSITION,
              !customActive &&
                isHovered(state) &&
                (onLight ? hoverRowWash : hoverOnDarkWash),
            ]}
            onPress={onCustomRangePress}
            accessibilityRole="button"
            accessibilityLabel="Pick custom date range"
          >
            <FontAwesome
              name="calendar"
              size={12}
              color={
                customActive
                  ? onLight
                    ? Theme.textOnPrimary
                    : Theme.darkBackground
                  : onLight
                    ? Theme.textRouteCard
                    : Theme.textOnDarkMuted
              }
            />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  lightTrayScrollView: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  lightTrayScroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  lightTrayScrollInner: {
    paddingRight: 4,
  },
  lightTray: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderRadius: 14,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  lightChip: {
    minHeight: 26,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  lightChipActive: {
    borderColor: Theme.iconPrimary,
    backgroundColor: Theme.iconPrimary,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  lightChipText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textRouteCard,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  lightChipTextActive: {
    color: Theme.textOnPrimary,
  },
  lightIconBtn: {
    minHeight: 26,
    minWidth: 26,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  darkScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  darkTray: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  darkPill: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: Theme.driverSurfaceElevated,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  darkPillActive: {
    backgroundColor: Theme.textOnDark,
    borderColor: Theme.textOnDark,
  },
  darkPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  darkPillTextActive: {
    color: Theme.darkBackground,
    fontWeight: "700",
  },
  darkIconPill: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: Theme.driverSurfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
});
