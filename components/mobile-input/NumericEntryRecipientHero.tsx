import { memo } from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import type { NumericEntryPartyPreview } from "./NumericEntryPartyBanner";
import { PoolIndentMark } from "./PoolIndentMark";

export interface NumericEntryRecipientHeroProps {
  party: NumericEntryPartyPreview;
  /**
   * GPay-style line above the name (e.g. "Paying" → “Paying Rohit Kapoor”).
   * When set with `nameInline`, name is merged into one title line.
   */
  caption?: string;
  /** Merge caption + name into one title (“Paying {name}”). Default true when caption set. */
  nameInline?: boolean;
  /** Tighter block for allocation keypad steps above sticky footer. */
  compact?: boolean;
  /** Extra-dense for desktop popup sheets. */
  dense?: boolean;
  /** Tap recipient (e.g. change partner). */
  onPress?: () => void;
}

/** Split corridor-style subtitle into hero route + quieter detail. */
function resolveHeroDetail(party: NumericEntryPartyPreview): {
  hero: string | null;
  detail: string | null;
} {
  const explicitHero = (party.heroLine ?? "").trim() || null;
  const explicitDetail = (party.detailLine ?? "").trim() || null;
  if (explicitHero) {
    return {
      hero: explicitHero,
      detail: explicitDetail,
    };
  }

  const subtitle = (party.subtitle ?? "").trim();
  if (!subtitle) return { hero: null, detail: null };

  if (subtitle.includes("→") || subtitle.includes("->")) {
    const parts = subtitle
      .split(" · ")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return { hero: null, detail: null };
    return {
      hero: parts[0] ?? null,
      detail: parts.slice(1).join(" · ") || null,
    };
  }

  return { hero: null, detail: subtitle };
}

/**
 * Centered recipient block (Google Pay payout) above the amount field.
 */
export const NumericEntryRecipientHero = memo(function NumericEntryRecipientHero({
  party,
  caption,
  nameInline = Boolean(caption),
  compact = false,
  dense = false,
  onPress,
}: NumericEntryRecipientHeroProps) {
  const avatarSize = dense ? 36 : compact ? 44 : 64;
  const title =
    caption && nameInline ? `${caption} ${party.name}`.trim() : party.name;
  const { hero, detail } = resolveHeroDetail(party);

  const content = (
    <View
      style={[
        styles.root,
        compact && styles.rootCompact,
        dense && styles.rootDense,
      ]}
    >
      {party.mark === "pool" ? (
        <PoolIndentMark size={avatarSize} />
      ) : (
        <PartyAvatar
          name={party.name}
          avatarUrl={party.avatarUrl ?? null}
          avatarSeed={party.avatarSeed ?? null}
          organizationImageUrl={party.organizationImageUrl ?? null}
          organizationAvatarSeed={party.organizationAvatarSeed ?? null}
          entityType={party.entityType ?? "client"}
          size={avatarSize}
          shape="circle"
        />
      )}
      {caption && !nameInline ? (
        <Text
          style={[
            styles.caption,
            dense && styles.captionDense,
            compact && styles.captionTrip,
          ]}
          numberOfLines={1}
        >
          {caption}
        </Text>
      ) : null}
      <View style={styles.titleRow}>
        <Text
          style={[
            styles.name,
            compact && styles.nameCompact,
            dense && styles.nameDense,
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {onPress ? (
          <ChevronRight
            size={dense ? 14 : 16}
            color={Theme.textMuted}
            style={styles.chevron}
          />
        ) : null}
      </View>
      {hero ? (
        <Text
          style={[
            styles.heroLine,
            compact && styles.heroLineCompact,
            dense && styles.heroLineDense,
          ]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {hero}
        </Text>
      ) : null}
      {detail ? (
        <Text
          style={[
            styles.detailLine,
            compact && styles.detailLineCompact,
            dense && styles.detailLineDense,
          ]}
          numberOfLines={2}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Change ${party.name}`}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
});

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
    width: "100%",
  },
  rootCompact: {
    paddingTop: 6,
    paddingBottom: 2,
    gap: 4,
  },
  rootDense: {
    paddingTop: 2,
    paddingBottom: 0,
    paddingHorizontal: 16,
    gap: 3,
  },
  pressed: {
    opacity: 0.88,
  },
  caption: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  captionDense: {
    marginTop: 4,
    fontSize: 11,
  },
  captionTrip: {
    marginTop: 0,
    marginBottom: 2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    maxWidth: "100%",
    paddingHorizontal: 8,
  },
  name: {
    fontSize: 20,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  nameCompact: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  nameDense: {
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  chevron: {
    marginTop: 2,
    flexShrink: 0,
  },
  heroLine: {
    marginTop: 2,
    width: "100%",
    maxWidth: 340,
    paddingHorizontal: 4,
    fontSize: 22,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: -0.55,
    lineHeight: 28,
  },
  heroLineCompact: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
  },
  heroLineDense: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22,
    letterSpacing: 0,
    maxWidth: 320,
    color: Theme.textPrimaryDark,
  },
  detailLine: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    letterSpacing: 0,
    maxWidth: 320,
    paddingHorizontal: 8,
  },
  detailLineCompact: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    color: Theme.textPrimaryDark,
  },
  detailLineDense: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    maxWidth: 280,
    color: Theme.textPrimaryDark,
  },
});
