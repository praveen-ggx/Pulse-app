/**
 * Compact “who uploaded” log row for document headers (vault card, preview, full view).
 * Avatar with the uploader name beside it; “Uploaded · {when}” on the line below.
 */
import { UserAvatar } from "@/components/Avatar";
import Theme from "@/constants/Theme";
import { formatDocumentUploadAt } from "@/features/trips/components/trip-detail/tripDocTypes";
import { Platform, StyleSheet, Text, View } from "react-native";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

export type DocumentUploadAttribution = {
  uploadedByName?: string | null;
  uploadedAt?: string | null;
  uploadedByAvatarUrl?: string | null;
  uploadedByAvatarSeed?: string | null;
};

export function documentUploadAttributionHasContent(
  value?: DocumentUploadAttribution | null,
): boolean {
  if (!value) return false;
  return Boolean(
    String(value.uploadedByName ?? "").trim() ||
      formatDocumentUploadAt(value.uploadedAt),
  );
}

export function DocumentUploadAttributionRow({
  uploadedByName,
  uploadedAt,
  uploadedByAvatarUrl = null,
  uploadedByAvatarSeed = null,
  size = 28,
  light = false,
  compact = false,
  centered = false,
  hideWhen = false,
}: DocumentUploadAttribution & {
  size?: number;
  /** Light text on dark full-screen headers. */
  light?: boolean;
  /** Tighter row for vault grid cards. */
  compact?: boolean;
  /** Center the avatar + copy as one group (shop / Order Details meta). */
  centered?: boolean;
  /**
   * Hide “Uploaded · {when}” when the parent already shows the timestamp
   * (e.g. shop status card “Uploaded on” date).
   */
  hideWhen?: boolean;
}) {
  const name = String(uploadedByName ?? "").trim();
  const when = formatDocumentUploadAt(uploadedAt);
  if (!name && !when) return null;
  /** Status cards already print the date — skip a name-less timestamp-only row. */
  if (hideWhen && !name) return null;

  const nameColor = light ? Theme.cardWhite : Theme.textPrimaryDark;
  const metaColor = light ? Theme.cardWhite : Theme.textSecondary;
  /** Always show a label next to the avatar when the row is visible. */
  const displayName = name || "Workspace member";
  const avatarSize = compact ? Math.min(size, 22) : centered ? Math.max(size, 24) : size;
  const showWhen = Boolean(when) && !hideWhen;

  const a11yLabel =
    name && when
      ? `Uploaded by ${name}, ${when}`
      : name
        ? `Uploaded by ${name}`
        : `Uploaded ${when}`;

  const nameNode = (
    <Text
      style={[
        styles.name,
        (compact || centered) && styles.nameCompact,
        { color: nameColor },
        WEB_COPY,
      ]}
      numberOfLines={1}
    >
      {displayName}
    </Text>
  );
  const whenNode = showWhen ? (
    <Text
      style={[
        styles.meta,
        (compact || centered) && styles.metaCompact,
        { color: metaColor, opacity: light ? 0.9 : 1 },
        WEB_COPY,
      ]}
      numberOfLines={2}
    >
      {`Uploaded · ${when}`}
    </Text>
  ) : null;

  if (centered) {
    return (
      <View
        style={styles.centeredWrap}
        accessibilityRole="text"
        accessibilityLabel={a11yLabel}
      >
        <UserAvatar
          name={displayName}
          avatarUrl={uploadedByAvatarUrl}
          avatarSeed={uploadedByAvatarSeed}
          context="personal"
          size={avatarSize}
          showBorder={false}
        />
        <View style={styles.centeredCopy}>
          {nameNode}
          {whenNode}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.row, compact && styles.rowCompact]}
      accessibilityRole="text"
      accessibilityLabel={a11yLabel}
    >
      <UserAvatar
        name={displayName}
        avatarUrl={uploadedByAvatarUrl}
        avatarSeed={uploadedByAvatarSeed}
        context="personal"
        size={avatarSize}
        showBorder={false}
      />
      <View style={[styles.copy, compact && styles.copyCompact]}>
        {nameNode}
        {whenNode}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    marginTop: 4,
  },
  rowCompact: {
    gap: 8,
    marginTop: 0,
    alignItems: "center",
    flexShrink: 1,
    maxWidth: "100%",
  },
  centeredWrap: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 8,
    maxWidth: "100%",
  },
  centeredCopy: {
    flexShrink: 1,
    gap: 2,
    maxWidth: 220,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    justifyContent: "center",
  },
  copyCompact: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 72,
    maxWidth: 140,
    justifyContent: "center",
  },
  name: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0,
  },
  nameCompact: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
  },
  meta: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    letterSpacing: 0,
  },
  metaCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
});
