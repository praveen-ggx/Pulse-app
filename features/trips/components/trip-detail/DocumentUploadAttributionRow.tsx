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
}: DocumentUploadAttribution & {
  size?: number;
  /** Light text on dark full-screen headers. */
  light?: boolean;
  /** Tighter row for vault grid cards. */
  compact?: boolean;
}) {
  const name = String(uploadedByName ?? "").trim();
  const when = formatDocumentUploadAt(uploadedAt);
  if (!name && !when) return null;

  const nameColor = light ? Theme.cardWhite : Theme.textPrimaryDark;
  const metaColor = light ? Theme.cardWhite : Theme.textSecondary;
  /** Always show a label next to the avatar when the row is visible. */
  const displayName = name || "Workspace member";
  const avatarSize = compact ? Math.min(size, 22) : size;

  return (
    <View
      style={[styles.row, compact && styles.rowCompact]}
      accessibilityRole="text"
      accessibilityLabel={
        name && when
          ? `Uploaded by ${name}, ${when}`
          : name
            ? `Uploaded by ${name}`
            : `Uploaded ${when}`
      }
    >
      <UserAvatar
        name={displayName}
        avatarUrl={uploadedByAvatarUrl}
        avatarSeed={uploadedByAvatarSeed}
        context="personal"
        size={avatarSize}
        showBorder={false}
      />
      <View style={styles.copy}>
        <Text
          style={[
            styles.name,
            compact && styles.nameCompact,
            { color: nameColor },
            WEB_COPY,
          ]}
          numberOfLines={1}
        >
          {displayName}
        </Text>
        {when ? (
          <Text
            style={[
              styles.meta,
              compact && styles.metaCompact,
              { color: metaColor, opacity: light ? 0.9 : 1 },
              WEB_COPY,
            ]}
            numberOfLines={1}
          >
            {`Uploaded · ${when}`}
          </Text>
        ) : null}
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
    marginTop: 4,
    alignItems: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
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
