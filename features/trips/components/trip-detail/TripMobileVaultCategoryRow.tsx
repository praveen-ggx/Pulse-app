/**
 * Mobile vault category — full-width card: title, hero, thumb strip.
 */
import Theme from "@/constants/Theme";
import { VaultCardLrStylePreview } from "@/features/trips/components/trip-detail/VaultCardLrStylePreview";
import type { TripDocItem } from "@/features/trips/components/trip-detail/tripDocTypes";
import { Platform, StyleSheet, Text, View } from "react-native";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

export function TripMobileVaultCategoryRow({
  doc,
  statusLabel,
  error = null,
  uploading = false,
  canAdd = false,
  onPreview,
  onAdd,
}: {
  doc: TripDocItem;
  statusLabel: string;
  error?: string | null;
  uploading?: boolean;
  canAdd?: boolean;
  onPreview: (fileIndex: number) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.card} accessibilityLabel={doc.label}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={[styles.title, WEB_COPY]} numberOfLines={1}>
            {doc.label}
          </Text>
          <Text
            style={[
              styles.meta,
              WEB_COPY,
              error ? styles.metaError : null,
            ]}
            numberOfLines={2}
          >
            {uploading ? "Uploading…" : error ?? statusLabel}
          </Text>
        </View>
      </View>
      <VaultCardLrStylePreview
        doc={doc}
        disabled={uploading}
        onAdd={canAdd ? onAdd : undefined}
        onPressFile={onPreview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.actionBtnInk,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
  metaError: {
    color: Theme.negative,
  },
});
