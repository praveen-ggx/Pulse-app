import Theme from "@/constants/Theme";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type ComplianceSegmentOption<T extends string> = {
  id: T;
  label: string;
  /** Longer name for screen readers when `label` is shortened. */
  a11yLabel?: string;
  /** Status dot color; omit or null for no dot (e.g. All). */
  dot?: string | null;
};

/**
 * Segmented control for Compliance queues. Chips share the panel width evenly
 * (no horizontal scroll). Use `cardDense` for the card-list header only —
 * table toolbar keeps the default compact sizing.
 */
export function ComplianceSegmentedFilter<T extends string>({
  value,
  counts,
  options,
  onChange,
  embedded = false,
  compact = false,
  cardDense = false,
  narrow = false,
}: {
  value: T;
  counts: Record<T, number>;
  options: readonly ComplianceSegmentOption<T>[];
  onChange: (next: T) => void;
  /** When true, omit outer bar padding (toolbar / nested placement). */
  embedded?: boolean;
  /** Slightly denser padding for stacked Pending Docs filters. */
  compact?: boolean;
  /** Pending Docs only: chips hug their label instead of sharing the full row. */
  narrow?: boolean;
  /**
   * Card-list header only: denser chips; full label + count stay readable
   * (label may wrap to 2 lines). Leave false for table view.
   */
  cardDense?: boolean;
}) {
  return (
    <View
      style={[
        styles.bar,
        embedded && styles.barEmbedded,
        cardDense && styles.barCardDense,
        embedded && !narrow && styles.barEmbeddedFull,
        narrow && styles.barNarrow,
      ]}
    >
      <View
        style={[
          styles.track,
          compact && styles.trackCompact,
          cardDense && styles.trackCardDense,
          !narrow && styles.trackFull,
          narrow && styles.trackNarrow,
        ]}
        accessibilityRole="tablist"
      >
        {options.map((option) => {
          const active = option.id === value;
          const count = counts[option.id] ?? 0;
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${option.a11yLabel ?? option.label}, ${count} trips`}
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [
                styles.segment,
                !narrow && styles.segmentFlex,
                narrow && styles.segmentNarrow,
                compact && styles.segmentCompact,
                cardDense && styles.segmentCardDense,
                active && styles.segmentActive,
                pressed && styles.segmentPressed,
              ]}
            >
              {cardDense ? (
                <View style={styles.segmentInnerCardDense}>
                  {option.dot ? (
                    <View style={[styles.dotCardDense, { backgroundColor: option.dot }]} />
                  ) : (
                    <View style={styles.dotCardDenseSpacer} />
                  )}
                  <Text
                    style={[styles.cardDenseCopy, active && styles.labelActive]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.countBadge,
                      styles.countBadgeDense,
                      active ? styles.countBadgeActive : null,
                      option.dot && !active ? { backgroundColor: option.dot } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.cardDenseCount,
                        !option.dot && !active && styles.countOnLight,
                        active && styles.countActive,
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.segmentInner, !narrow && styles.segmentInnerFull]}>
                  {option.dot ? <View style={[styles.dot, { backgroundColor: option.dot }]} /> : null}
                  <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.countBadge,
                      active ? styles.countBadgeActive : null,
                      option.dot && !active ? { backgroundColor: option.dot } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.count,
                        !option.dot && !active && styles.countOnLight,
                        active && styles.countActive,
                      ]}
                      numberOfLines={1}
                    >
                      {count}
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  barEmbedded: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },
  barEmbeddedFull: {
    alignSelf: "stretch",
    width: "100%",
  },
  barNarrow: {
    alignSelf: "center",
    maxWidth: "100%",
  },
  barCardDense: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    alignSelf: "stretch",
    width: "100%",
  },
  track: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    width: "100%",
    padding: 1,
    gap: 0,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  trackFull: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  trackNarrow: {
    alignSelf: "center",
    width: "auto",
  },
  trackCompact: {
    borderRadius: 999,
    padding: 1,
    gap: 0,
  },
  trackCardDense: {
    borderRadius: 999,
    padding: 1,
    gap: 0,
  },
  segment: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 0,
    borderRadius: 999,
  },
  segmentFlex: {
    flexGrow: 1,
    flexShrink: 0,
  },
  segmentNarrow: {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 6,
  },
  segmentCompact: {
    height: 22,
    paddingHorizontal: 7,
    paddingVertical: 0,
    borderRadius: 999,
  },
  segmentCardDense: {
    height: 22,
    paddingHorizontal: 6,
    paddingVertical: 0,
    borderRadius: 999,
  },
  segmentActive: {
    backgroundColor: Theme.liquidGoodBack,
    borderRadius: 999,
  },
  segmentPressed: { opacity: 0.7 },
  segmentInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "nowrap",
    gap: 3,
    minWidth: 0,
  },
  segmentInnerFull: {
    flexWrap: "nowrap",
    width: "auto",
  },
  /** Label + count stay on one line so every word remains visible. */
  segmentInnerCardDense: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "nowrap",
    gap: 3,
    width: "auto",
    paddingHorizontal: 1,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    flexShrink: 0,
  },
  dotCardDense: {
    width: 4,
    height: 4,
    borderRadius: 2,
    flexShrink: 0,
  },
  dotCardDenseSpacer: {
    width: 0,
    height: 4,
    flexShrink: 0,
  },
  label: {
    flexShrink: 0,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    includeFontPadding: false,
    textAlign: "center",
  },
  cardDenseCopy: {
    flexShrink: 0,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    includeFontPadding: false,
    textAlign: "center",
  },
  labelActive: {
    color: Theme.buttonDarkText,
    fontWeight: "500",
  },
  countBadge: {
    minWidth: 14,
    height: 12,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  countBadgeDense: {
    height: 12,
    minWidth: 14,
    paddingHorizontal: 4,
  },
  countBadgeActive: {
    backgroundColor: Theme.cardWhite,
  },
  count: {
    flexShrink: 0,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  cardDenseCount: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    fontVariant: ["tabular-nums"],
  },
  countOnLight: {
    color: Theme.textPrimaryDark,
  },
  countActive: {
    color: Theme.liquidGoodBack,
    fontWeight: "700",
  },
});
