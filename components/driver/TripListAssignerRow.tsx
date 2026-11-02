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
          <View style={[styles.rule, { backgroundColor: Theme.driverEmeraldBorderSoft }]} />
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
          <View style={[styles.rule, { backgroundColor: Theme.warning }]} />
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
              <Text style={[styles.note, endSlot && styles.noteMid, { color: mutedColor }]} numberOfLines={2}>
                Tag the party to track the AR
              </Text>
            </View>
          </Pressable>
        </>
      ) : null}
      {endSlot ? (
        <>
          <View style={[styles.rule, { backgroundColor: Theme.driverEmeraldBorderSoft }]} />
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
    alignItems: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.driverEmeraldBorderSoft,
    backgroundColor: Theme.driverEmeraldMuted,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 0,
  },
  groupCompact: {
    marginTop: 8,
  },
  groupSplit: {
    paddingRight: 8,
  },
  groupFooter: {
    marginTop: 0,
    width: "100%",
  },
  groupUntagged: {
    borderColor: Theme.warning,
    backgroundColor: Theme.warningMuted,
  },
  cell: {
    flex: 1.15,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cellEnd: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    paddingLeft: 8,
  },
  cellMid: {
    justifyContent: "flex-start",
  },
  cellYield: {
    flexShrink: 0,
    minWidth: 72,
    maxWidth: "28%",
    paddingLeft: 8,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 1,
  },
  avatarWrap: {
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  copyEnd: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: 1,
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
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.driverEmeraldBorder,
    flexShrink: 0,
  },
  tagGlyphWarn: {
    borderColor: Theme.warning,
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
    marginVertical: 2,
  },
  kicker: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    lineHeight: 10,
  },
  kickerEnd: {
    textAlign: "right",
  },
  name: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.15,
    lineHeight: 15,
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
    borderWidth: 1,
    borderColor: Theme.driverEmeraldBorderSoft,
  },
});
