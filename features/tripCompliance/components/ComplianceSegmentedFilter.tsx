import Theme from "@/constants/Theme";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

export type ComplianceSegmentOption<T extends string> = {
  id: T;
  label: string;
  /** Longer name for screen readers when `label` is shortened. */
  a11yLabel?: string;
  /** Status dot color; omit or null for no dot (e.g. All). */
  dot?: string | null;
};

/**
 * Segmented control for Compliance queues. Table chips share the row.
 * Card-list chips stay small, keep the full label, and scroll sideways.
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
  wrap = false,
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
  /** Many options: chips wrap onto a second row instead of being cut off. */
  wrap?: boolean;
  /**
   * Card-list header only: small chips with the full label, scrolled sideways.
   * Leave false for table view.
   */
  cardDense?: boolean;
}) {
  const track = (
      <View
        style={[
          styles.track,
          compact && styles.trackCompact,
          cardDense && styles.trackCardDense,
          !cardDense && !narrow && styles.trackFull,
          narrow && styles.trackNarrow,
          wrap && styles.trackWrap,
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
              style={(state) => {
                const { pressed, hovered } = state as { pressed: boolean; hovered?: boolean };
                return [
                  styles.segment,
                  !cardDense && !narrow && styles.segmentFlex,
                  narrow && styles.segmentNarrow,
                  compact && !cardDense && styles.segmentCompact,
                  cardDense && styles.segmentCardDense,
                  cardDense && !active && (hovered || pressed) && styles.segmentCardDenseHover,
                  active && styles.segmentActive,
                  cardDense && active && styles.segmentCardDenseActive,
                  !cardDense && pressed && styles.segmentPressed,
                ];
              }}
            >
              {cardDense ? (
                <View style={styles.segmentInnerCardDense}>
                  {option.dot ? (
                    <View style={[styles.dotCardDense, { backgroundColor: active ? Theme.accentGold : option.dot }]} />
                  ) : null}
                  <Text
                    style={[styles.cardDenseCopy, active && styles.labelActive]}
                    numberOfLines={1}
                  >
                    {`${option.label} `}
                  </Text>
                  <View
                    style={[
                      styles.countBadge,
                      styles.countBadgeDense,
                      { backgroundColor: active ? Theme.accentGold : option.dot ?? Theme.buttonDark },
                    ]}
                  >
                    <Text
                      style={[
                        styles.cardDenseCount,
                        { color: active ? Theme.buttonDark : Theme.buttonDarkText },
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
                    {`${option.label} `}
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
  );

  return (
    <View
      style={[
        styles.bar,
        embedded && styles.barEmbedded,
        cardDense && styles.barCardDense,
        embedded && !narrow && !cardDense && styles.barEmbeddedFull,
        narrow && styles.barNarrow,
      ]}
    >
      {cardDense ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cardDenseScroll}
          contentContainerStyle={styles.cardDenseScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {track}
        </ScrollView>
      ) : (
        track
      )}
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
  trackWrap: {
    flexWrap: "wrap",
    rowGap: 4,
    borderRadius: 14,
  },
  trackCompact: {
    borderRadius: 999,
    padding: 1,
    gap: 0,
  },
  cardDenseScroll: {
    width: "100%",
    height: 34,
    flexGrow: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  cardDenseScrollContent: {
    alignItems: "center",
    minHeight: 34,
  },
  trackCardDense: {
    width: "auto",
    alignSelf: "flex-start",
    alignItems: "center",
    height: 34,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
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
    flexGrow: 0,
    flexShrink: 0,
    height: 26,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
  },
  segmentCardDenseHover: {
    backgroundColor: Theme.cardWhite,
    borderColor: Theme.complianceHoverBorder,
  },
  segmentCardDenseActive: {
    borderColor: Theme.buttonDark,
  },
  segmentActive: {
    backgroundColor: Theme.buttonDark,
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
  /** Equal chips: the label may wrap, the count stays visible. */
  segmentInnerCardDense: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "nowrap",
    gap: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    flexShrink: 0,
  },
  dotCardDense: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
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
    ...WEB_COPY,
  },
  cardDenseCopy: {
    flexShrink: 0,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    includeFontPadding: false,
    textAlign: "left",
    ...WEB_COPY,
  },
  labelActive: {
    color: Theme.buttonDarkText,
    fontWeight: "700",
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
    height: 14,
    minWidth: 16,
    paddingHorizontal: 4,
    flexShrink: 0,
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
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  countOnLight: {
    color: Theme.textPrimaryDark,
  },
  countActive: {
    color: Theme.liquidGoodBack,
    fontWeight: "700",
  },
});
