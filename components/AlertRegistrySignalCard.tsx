/**
 * Single notification row — Metronic-style feed item (avatar + rich text + actions).
 */
import React from "react";
import { alertRegistryActionStyles } from "@/components/AlertRegistryCardActions";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type {
  RegistryStatusTone,
  RegistryTag,
} from "@/lib/alertRegistry/registryAlertPresentation.util";
import {
  formatRegistryLabel,
  formatRegistryStatusLabel,
  registryStatusStyle,
  registryTagStyle,
} from "@/lib/alertRegistry/registryAlertPresentation.util";
import type { RegistryNotificationAvatar } from "@/lib/alertRegistry/registryNotificationAvatar.types";
import { createStyles, text, view, webView } from "@/lib/styles/createStyles";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

/** Metronic demo2 tokens — notifications dropdown + privacy-settings buttons. */
const METRONIC = {
  border: "#EFF2F5",
  muted: "#A1A5B7",
  quoteBg: "#F5F8FA",
  primaryBtn: "#181C32",
  ghostBorder: "#DBDFE9",
  link: Theme.primary,
  unreadDot: "#50CD89",
} as const;

const TAG = {
  height: 18,
  paddingHorizontal: 7,
  borderRadius: 4,
  borderWidth: 1,
} as const;

export type RegistryCardMode = "active" | "completed";

export type AlertRegistrySignalCardProps = {
  avatar: RegistryNotificationAvatar;
  actorName: string;
  actionText: string;
  highlightText?: string;
  trailingText?: string;
  /** Plain detail line inside the gray card (legacy). */
  detail?: string;
  /** Bold primary line in the detail card — e.g. amount or trip ref. */
  detailTitle?: string;
  /** Secondary line in the detail card — e.g. category or note. */
  detailSubtitle?: string;
  /** Optional media inside the gray quote card (uploaded document thumb). */
  detailMedia?: React.ReactNode;
  timeLabel: string;
  contextLabel?: string;
  tags?: RegistryTag[];
  statusPill?: { label: string; tone: RegistryStatusTone };
  mode?: RegistryCardMode;
  isUnread?: boolean;
  onPress?: () => void;
  footer?: React.ReactNode;
  /**
   * Top-right of the card body (e.g. Verified / Recommended) —
   * keeps status tags out of the action footer.
   */
  headerEnd?: React.ReactNode;
  /** Contained card for horizontal grids (no feed divider). */
  variant?: "feed" | "tile";
  /** Tighter padding and typography for hub tile grids. */
  compact?: boolean;
  /** Replaces the initials avatar (e.g. method icons). */
  avatarSlot?: React.ReactNode;
};

function NotificationAvatar({
  avatar,
  isUnread,
  mode,
  size = AVATAR_SIZE,
  compact = false,
  avatarSlot,
}: {
  avatar: RegistryNotificationAvatar;
  isUnread?: boolean;
  mode: RegistryCardMode;
  size?: number;
  compact?: boolean;
  avatarSlot?: React.ReactNode;
}) {
  const showUnread = mode === "active" && isUnread;
  const dotSize = compact ? 7 : 8;
  const slot = size + dotSize;
  return (
    <View style={[styles.avatarWrap, { width: slot, height: slot }]}>
      <View style={[styles.avatarCore, { width: size, height: size }]}>
        {avatarSlot ?? (
          <PartyAvatar
            name={avatar.name}
            entityType={avatar.entityType ?? "client"}
            avatarUrl={avatar.avatarUrl}
            avatarSeed={avatar.avatarSeed}
            organizationImageUrl={avatar.organizationImageUrl}
            organizationAvatarSeed={avatar.organizationAvatarSeed}
            initialsColorSeed={avatar.initialsColorSeed}
            size={size}
            shape="circle"
          />
        )}
      </View>
      <View
        style={[
          styles.statusDot,
          compact && styles.statusDotCompact,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
          },
          showUnread ? styles.statusDotUnread : styles.statusDotRead,
        ]}
      />
    </View>
  );
}

export function RegistryStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: RegistryStatusTone;
}) {
  const palette = registryStatusStyle(tone);
  return (
    <View
      style={[
        alertRegistryActionStyles.statusPill,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[alertRegistryActionStyles.statusPillText, { color: palette.text }]}>
        {formatRegistryStatusLabel(label)}
      </Text>
    </View>
  );
}

export function RegistryTagPill({ tag }: { tag: RegistryTag }) {
  const palette = registryTagStyle(tag.variant ?? "default");
  return (
    <View
      style={[
        styles.tagPill,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.tagText, { color: palette.text }]} numberOfLines={1}>
        {formatRegistryLabel(tag.label)}
      </Text>
    </View>
  );
}

const AVATAR_SIZE = 36;
const COMPACT_AVATAR_SIZE = 28;

export function AlertRegistrySignalCard({
  avatar,
  actorName,
  actionText,
  highlightText,
  trailingText,
  detail,
  detailTitle,
  detailSubtitle,
  detailMedia,
  timeLabel,
  contextLabel,
  tags,
  statusPill,
  mode = "active",
  isUnread = false,
  onPress,
  footer,
  headerEnd,
  variant = "feed",
  compact = false,
  avatarSlot,
}: AlertRegistrySignalCardProps) {
  const showDetailCard = Boolean(detailTitle || detailSubtitle || detail || detailMedia);
  const avatarSize = compact && variant === "tile" ? COMPACT_AVATAR_SIZE : AVATAR_SIZE;

  const content = (
    <View
      style={[
        styles.row,
        variant === "tile" && styles.rowTile,
        compact && variant === "tile" && styles.rowTileCompact,
        mode === "completed" && styles.rowCompleted,
      ]}
    >
      <NotificationAvatar
        avatar={avatar}
        isUnread={isUnread}
        mode={mode}
        size={avatarSize}
        compact={compact && variant === "tile"}
        avatarSlot={avatarSlot}
      />

      <View style={[styles.body, compact && variant === "tile" && styles.bodyCompact]}>
        <View style={styles.headlineRow}>
          <View style={[styles.headlineCol, !headerEnd && styles.headlineColFull]}>
            <Text
              style={[
                styles.headline,
                WEB_COPY,
                compact && variant === "tile" && styles.headlineCompact,
              ]}
              numberOfLines={compact ? 2 : 4}
            >
              <Text style={[styles.actorName, WEB_COPY]}>{actorName}</Text>
              <Text style={[styles.actionText, WEB_COPY]}> {actionText}</Text>
              {highlightText ? (
                <Text style={styles.highlightText}> {highlightText}</Text>
              ) : null}
              {trailingText ? (
                <Text style={styles.actionText}> {trailingText}</Text>
              ) : null}
            </Text>
          </View>
          {headerEnd ? (
            <View style={styles.headerEnd} pointerEvents="box-none">
              {headerEnd}
            </View>
          ) : null}
        </View>

        <Text
          style={[styles.metaLine, WEB_COPY, compact && variant === "tile" && styles.metaLineCompact]}
          numberOfLines={1}
        >
          {timeLabel}
          {contextLabel ? <Text style={styles.metaContext}> · {contextLabel}</Text> : null}
        </Text>

        {showDetailCard ? (
          <View
            style={[
              styles.detailCard,
              compact && variant === "tile" && styles.detailCardCompact,
            ]}
          >
            {detailMedia ? <View style={styles.detailMedia}>{detailMedia}</View> : null}
            {detailTitle ? (
              <Text
                style={[
                  styles.detailTitle,
                  WEB_COPY,
                  compact && variant === "tile" && styles.detailTitleCompact,
                ]}
                numberOfLines={2}
              >
                {detailTitle}
              </Text>
            ) : null}
            {detailSubtitle ? (
              <Text
                style={[
                  styles.detailSubtitle,
                  WEB_COPY,
                  compact && variant === "tile" && styles.detailSubtitleCompact,
                ]}
                numberOfLines={2}
              >
                {detailSubtitle}
              </Text>
            ) : null}
            {!detailTitle && detail ? (
              <Text style={styles.detailBody} numberOfLines={4}>
                {detail}
              </Text>
            ) : null}
          </View>
        ) : null}

        {tags?.length || statusPill || footer ? (
          <View
            style={[
              styles.metaBlock,
              compact && variant === "tile" && styles.metaBlockCompact,
            ]}
          >
            <View style={styles.metaLeft}>
              {tags?.map((tag) => (
                <RegistryTagPill key={tag.label} tag={tag} />
              ))}
              {statusPill ? (
                <RegistryStatusPill label={statusPill.label} tone={statusPill.tone} />
              ) : null}
            </View>
            {footer ? (
              <View
                style={[
                  styles.metaActions,
                  compact && variant === "tile" && styles.metaActionsCompact,
                ]}
              >
                {footer}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed, hovered }) => [
        styles.pressable,
        hovered && styles.pressableHover,
        pressed && onPress ? styles.pressablePressed : null,
      ]}
      accessibilityRole={onPress && !footer ? "button" : "none"}
    >
      {content}
    </Pressable>
  );
}

const stylesDef = {
  pressable: view({
    width: "100%",
    backgroundColor: Theme.cardWhite,
  }),
  pressableHover: view({
    backgroundColor: Theme.tableRowHover,
  }),
  pressablePressed: view({
    opacity: 0.92,
  }),
  row: view({
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
    backgroundColor: "transparent",
  }),
  rowCompleted: view({
    backgroundColor: "#FCFCFD",
  }),
  rowTile: view({
    borderBottomWidth: 0,
    flex: 1,
    minHeight: 0,
  }),
  rowTileCompact: view({
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  }),
  avatarWrap: view({
    flexShrink: 0,
    position: "relative",
  }),
  avatarCore: view({
    position: "absolute",
    left: 0,
    top: 0,
  }),
  statusDot: view({
    position: "absolute",
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  }),
  statusDotUnread: view({
    backgroundColor: METRONIC.unreadDot,
  }),
  statusDotRead: view({
    backgroundColor: METRONIC.muted,
  }),
  statusDotCompact: view({
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
  }),
  body: view({
    flex: 1,
    minWidth: 0,
    gap: 4,
  }),
  bodyCompact: view({
    gap: 3,
  }),
  headlineRow: view({
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
  }),
  headlineCol: view({
    flex: 1,
    minWidth: 0,
  }),
  headlineColFull: view({
    flex: 1,
  }),
  headline: text({
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
    color: METRONIC.primaryBtn,
  }),
  headlineCompact: text({
    fontSize: 12,
    lineHeight: 16,
  }),
  headerEnd: view({
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingTop: 1,
    maxWidth: "48%",
  }),
  actorName: text({
    fontWeight: "500",
    color: METRONIC.primaryBtn,
  }),
  actionText: text({
    fontWeight: "400",
    color: Theme.textRouteCard,
  }),
  highlightText: text({
    fontWeight: "500",
    color: METRONIC.link,
  }),
  metaLine: text({
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    color: METRONIC.muted,
  }),
  metaLineCompact: text({
    fontSize: 11,
    lineHeight: 15,
  }),
  metaContext: text({
    color: "#78829D",
    fontWeight: "400",
  }),
  detailCard: view({
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: METRONIC.quoteBg,
    gap: 2,
  }),
  detailCardCompact: view({
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 1,
  }),
  detailMedia: view({
    width: "100%",
    minHeight: 0,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 4,
  }),
  detailTitle: text({
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: METRONIC.primaryBtn,
  }),
  detailTitleCompact: text({
    fontSize: 11,
    lineHeight: 15,
  }),
  detailSubtitle: text({
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    color: "#78829D",
  }),
  detailSubtitleCompact: text({
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: METRONIC.link,
  }),
  detailBody: text({
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    color: "#78829D",
  }),
  tagPill: view({
    ...TAG,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  }),
  tagText: text({
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "500",
    letterSpacing: 0.1,
  }),
  metaBlock: view({
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 3,
    alignSelf: "stretch",
  }),
  metaBlockCompact: view({
    flexDirection: "column",
    alignItems: "stretch",
    gap: 6,
    marginTop: 2,
  }),
  metaLeft: view({
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    flex: 1,
    minWidth: 0,
  }),
  metaActions: view({
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 1,
    minWidth: 0,
    marginLeft: "auto",
  }),
  metaActionsCompact: webView({
    width: "100%",
    marginLeft: 0,
    justifyContent: "stretch",
  }),
};;

const styles = createStyles(stylesDef);
