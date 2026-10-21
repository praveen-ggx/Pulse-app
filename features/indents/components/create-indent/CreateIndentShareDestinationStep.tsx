/**
 * Create Load — who should receive this indent after the supplier target is set.
 * Network and Marketplace can both be on; that persists as circulation_target = both.
 */
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { createTripDesktopStyles as s } from "@/features/trips/components/add-trip/createTripDesktop.styles";
import {
  circulationChannelsFromTarget,
  circulationTargetFromChannels,
} from "@/features/trips/utils/indentHubCardPresentation";

import type { IndentDistributionChoice } from "./createIndentForm.types";

export type CreateIndentShareDestinationStepProps = {
  value: IndentDistributionChoice;
  onChange: (value: IndentDistributionChoice) => void;
  compact?: boolean;
};

const CHANNELS: Array<{
  key: "network" | "marketplace";
  label: string;
  hint: string;
}> = [
  {
    key: "network",
    label: "Network",
    hint: "Send to my connected supplier network",
  },
  {
    key: "marketplace",
    label: "Marketplace",
    hint: "Share with verified fleet owners and businesses on Marketplace",
  },
];

export const CreateIndentShareDestinationStep = memo(
  function CreateIndentShareDestinationStep({
    value,
    onChange,
    compact = false,
  }: CreateIndentShareDestinationStepProps) {
    const selected = circulationChannelsFromTarget(value);

    const toggle = (key: "network" | "marketplace") => {
      const nextNetwork = key === "network" ? !selected.network : selected.network;
      const nextMarketplace =
        key === "marketplace" ? !selected.marketplace : selected.marketplace;
      const composed = circulationTargetFromChannels(nextNetwork, nextMarketplace);
      if (!composed) return;
      onChange(composed);
    };

    const cards = (
      <View style={styles.options}>
        {CHANNELS.map((opt) => {
          const checked = selected[opt.key];
          return (
            <Pressable
              key={opt.key}
              onPress={() => toggle(opt.key)}
              style={[styles.option, checked && styles.optionSelected]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={opt.label}
            >
              <View style={[styles.check, checked && styles.checkSelected]}>
                {checked ? <View style={styles.checkDot} /> : null}
              </View>
              <View style={styles.copy}>
                <Text
                  style={[
                    styles.optionLabel,
                    checked && styles.optionLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.optionHint}>{opt.hint}</Text>
              </View>
            </Pressable>
          );
        })}
        {selected.network && selected.marketplace ? (
          <Text style={styles.bothHint}>
            Both selected — this load is marked Network and Marketplace.
          </Text>
        ) : null}
      </View>
    );

    if (compact) {
      return (
        <View style={styles.compactRoot}>
          <Text style={styles.heading}>Who should receive this load?</Text>
          {cards}
        </View>
      );
    }

    return (
      <View style={s.stepBody}>
        <View style={s.commodityClientSection}>
          <Text style={s.sectionHeading}>Who should receive this load?</Text>
          <Text style={styles.hint}>
            Select Network, Marketplace, or both before sharing.
          </Text>
          {cards}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  compactRoot: {
    width: "100%",
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  heading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  hint: {
    color: Theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  bothHint: {
    color: Theme.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    paddingHorizontal: 2,
  },
  options: {
    width: "100%",
    gap: 10,
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  optionSelected: {
    borderColor: Theme.accentBrownBorder,
    backgroundColor: Theme.accentBrownMuted,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  checkSelected: {
    borderColor: Theme.accentBrownDeep,
    backgroundColor: Theme.accentBrownDeep,
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: Theme.cardWhite,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  optionLabelSelected: {
    color: Theme.accentBrownDeep,
  },
  optionHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
  },
});
