import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { JobCardAssignerPayload } from "@/features/trips/utils/driverAssignerDisplay.util";
import { Tag } from "lucide-react-native";
import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  assigner: JobCardAssignerPayload | null;
  fallback?: string;
  mutedColor: string;
  textColor: string;
  /** Compact row for trip list cards (default). */
  compact?: boolean;
  /** DCO commercial party when the trip is tagged. */
  taggedParty?: string | null;
  /** Offline trip with no bill-to party yet. */
  needsTag?: boolean;
  /** Opens the same tag sheet used everywhere else. */
  onTagPress?: () => void;
  /** Third footer cell (e.g. Yield) — same pill, aligned columns. */
  endSlot?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function TripListAssignerRow({
  assigner,
  fallback = "Fleet dispatcher",
  mutedColor,
  textColor,
  compact = true,
  taggedParty = null,
  needsTag = false,
  onTagPress,
  endSlot = null,
  style,
}: Props) {
  const tagged = String(taggedParty ?? "").trim();
  const showUntagged = needsTag && !tagged;
  const split = Boolean(tagged || showUntagged);
  const primary = assigner?.linePrimary.trim() ?? "";
  const secondary = assigner?.lineSecondary.trim() ?? "";
  const hasLines = Boolean(primary || secondary);
  const avatarSize = compact ? 26 : 32;
  const avatarName = assigner?.orgName || primary || fallback;
  const assignerTitle = hasLines ? primary || avatarName : fallback;

  return (
    <View
      style={[
        styles.group,
        compact && styles.groupCompact,
        split ? styles.groupSplit : null,
        showUntagged ? styles.groupUntagged : null,
        endSlot ? styles.groupFooter : null,
        style,
      ]}
    >
      <View style={styles.cell}>
        <View style={styles.avatarWrap}>
          <PartyAvatar
            name={avatarName}
            initialsColorSeed={assigner?.orgId || assigner?.orgName}
            organizationImageUrl={assigner?.orgLogoUrl}
            organizationAvatarSeed={assigner?.orgAvatarSeed}
            avatarUrl={assigner?.orgAvatarUrl}
            entityType="client"
            size={avatarSize}
            borderStyle={styles.avatarBorder}
          />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.kicker, { color: mutedColor }]} numberOfLines={1}>
            Assigned by
          </Text>
          <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
            {assignerTitle}
          </Text>
          {hasLines && secondary ? (
            <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={1}>
              {secondary}
            </Text>
          ) : null}
        </View>
      </View>

      {tagged ? (
        <>
          <View style={styles.rule} />
          <View style={[styles.cellEnd, endSlot ? styles.cellMid : null]}>
            <View style={styles.tagGlyph}>
              <Tag size={11} color={Theme.driverEmerald} strokeWidth={2.4} />
            </View>
            <View style={[styles.copyEnd, endSlot ? styles.copyMid : null]}>
              <Text
                style={[
                  styles.kicker,
                  endSlot ? styles.kickerMid : styles.kickerEnd,
                  { color: mutedColor },
                ]}
                numberOfLines={1}
              >
                Bill to
              </Text>
              <Text
                style={[
                  styles.name,
                  endSlot ? styles.nameMid : styles.nameEnd,
                  { color: textColor },
                ]}
                numberOfLines={1}
              >
                {tagged}
              </Text>
            </View>
          </View>
        </>
      ) : showUntagged ? (
        <>
          <View style={[styles.rule, { backgroundColor: "rgba(245,158,11,0.35)" }]} />
          <Pressable
            onPress={onTagPress}
            disabled={!onTagPress}
            accessibilityRole="button"
            accessibilityLabel="Tag the party"
            style={[styles.cellEnd, endSlot ? styles.cellMid : null]}
          >
            <View style={[styles.tagGlyph, styles.tagGlyphWarn]}>
              <Tag size={11} color={Theme.warning} strokeWidth={2.4} />
            </View>
            <View style={[styles.copyEnd, endSlot ? styles.copyMid : null]}>
              <Text
                style={[
                  styles.kicker,
                  endSlot ? styles.kickerMid : styles.kickerEnd,
                  { color: Theme.warning },
                ]}
                numberOfLines={1}
              >
                Untagged
              </Text>
              <Text style={[styles.note, endSlot ? styles.noteMid : null, { color: mutedColor }]} numberOfLines={2}>
                Tag the party to track the AR
              </Text>
            </View>
          </Pressable>
        </>
      ) : null}
      {endSlot ? (
        <>
          <View style={styles.rule} />
          <View style={styles.cellYield}>{endSlot}</View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginTop: 8,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: "transparent",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 0,
  },
  groupCompact: {
    marginTop: 8,
  },
  groupSplit: {
    paddingRight: 10,
  },
  groupFooter: {
    marginTop: 0,
    width: "100%",
  },
  groupUntagged: {
    borderColor: "rgba(245,158,11,0.35)",
    backgroundColor: "transparent",
  },
  cell: {
    flex: 1.2,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 1,
  },
  cellEnd: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 7,
    paddingLeft: 10,
    paddingVertical: 1,
  },
  cellMid: {
    justifyContent: "flex-start",
  },
  cellYield: {
    flexShrink: 0,
    minWidth: 68,
    maxWidth: "26%",
    paddingLeft: 10,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
  },
  avatarWrap: {
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: "center",
  },
  copyEnd: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: 2,
    justifyContent: "center",
  },
  copyMid: {
    alignItems: "flex-start",
  },
  kickerMid: {
    textAlign: "left",
  },
  nameMid: {
    textAlign: "left",
  },
  noteMid: {
    textAlign: "left",
    maxWidth: "100%",
  },
  tagGlyph: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    flexShrink: 0,
  },
  tagGlyphWarn: {
    borderColor: "rgba(245,158,11,0.45)",
    backgroundColor: "rgba(255,247,237,0.65)",
  },
  note: {
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 13,
    textAlign: "right",
    maxWidth: 128,
  },
  rule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 4,
    backgroundColor: Theme.borderLight,
  },
  kicker: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    lineHeight: 10,
  },
  kickerEnd: {
    textAlign: "right",
  },
  name: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 16,
  },
  nameEnd: {
    textAlign: "right",
  },
  meta: {
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 12,
  },
  avatarBorder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
});
