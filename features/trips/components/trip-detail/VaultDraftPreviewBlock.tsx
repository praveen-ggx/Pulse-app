/**
 * Shared vault / LR draft preview — hero, thumbs, add, remove.
 * Used by hub Add LR and trip-detail vault confirm.
 */
import Theme from "@/constants/Theme";
import { isPdfTripDoc, VAULT_DOC_LIMIT_HINT } from "@/features/trips/components/trip-detail/tripDocTypes";
import { VaultDocThumb } from "@/features/trips/components/trip-detail/VaultDocThumb";
import Feather from "@expo/vector-icons/Feather";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

export type VaultDraftPreviewItem = {
  id: string;
  fileName: string;
  previewUri: string | null;
  storagePath?: string | null;
  locked?: boolean;
};

function previewIdentity(item: VaultDraftPreviewItem | null) {
  if (!item) return { documentKey: null as string | null, documentVersion: null as string | null };
  return {
    documentKey: item.storagePath?.trim() || item.id,
    documentVersion: item.id,
  };
}

type Props = {
  items: VaultDraftPreviewItem[];
  selectedId: string | null;
  busy?: boolean;
  emptyLabel?: string;
  density?: "dialog" | "card";
  showHint?: boolean;
  showAddThumb?: boolean;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  onAdd: () => void;
  onHeroPress?: () => void;
  /** Opens the selected file in the full document viewer. */
  onOpenFull?: () => void;
  onRetrySign?: () => void;
};

export function VaultDraftPreviewBlock({
  items,
  selectedId,
  busy = false,
  emptyLabel = "Upload copy",
  density = "dialog",
  showHint = true,
  showAddThumb = true,
  onSelect,
  onRemove,
  onAdd,
  onHeroPress,
  onOpenFull,
  onRetrySign,
}: Props) {
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const card = density === "card";

  const openFull = onOpenFull ?? onHeroPress;
  const addThumb = showAddThumb ? (
    <Pressable
      onPress={onAdd}
      disabled={busy}
      style={({ pressed }) => [styles.addThumb, card && styles.addThumbCard, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Add more copies"
    >
      <Feather name="plus" size={card ? 14 : 16} color={Theme.actionBtnInk} />
      <Text style={styles.addThumbText}>Add</Text>
    </Pressable>
  ) : null;

  if (items.length === 0) {
    return (
      <View style={[styles.wrap, card && styles.wrapCard]}>
        <Pressable
          onPress={onAdd}
          disabled={busy}
          style={({ pressed }) => [
            card ? styles.hero : styles.dropzone,
            card && styles.heroCard,
            card && styles.heroEmpty,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={emptyLabel}
        >
          <Feather name="upload" size={card ? 18 : 16} color={Theme.textMuted} />
          <Text style={[styles.dropzoneText, card && styles.dropzoneTextCard]} numberOfLines={2}>
            {emptyLabel}
          </Text>
        </Pressable>
        {card ? <View style={styles.thumbsTrack}>{addThumb}</View> : null}
        {showHint ? <Text style={styles.fileHint}>{VAULT_DOC_LIMIT_HINT}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, card && styles.wrapCard]}>
      <View style={[styles.hero, card && styles.heroCard]}>
        <VaultDocThumb
          uri={selected?.previewUri}
          isPdf={isPdfTripDoc({
            fileName: selected?.fileName,
            storagePath: selected?.storagePath,
          })}
          fileName={selected?.fileName}
          style={styles.heroImage}
          documentKey={previewIdentity(selected).documentKey}
          documentVersion={previewIdentity(selected).documentVersion}
          lazy={false}
          priority={2}
          onRetrySign={onRetrySign}
        />
        {openFull ? (
          <Pressable
            onPress={openFull}
            disabled={busy}
            style={({ pressed }) => [styles.heroEye, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`View full ${selected?.fileName || "document"}`}
          >
            <Feather name="eye" size={16} color={Theme.actionBtnInk} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={card ? styles.thumbsTrack : undefined}
        contentContainerStyle={styles.thumbs}
      >
        {items.map((item) => {
          const active = item.id === selected?.id;
          return (
            <View key={item.id} style={[styles.thumbWrap, card && styles.thumbWrapCard]}>
              <Pressable
                onPress={() => onSelect(item.id)}
                style={[styles.thumb, card && styles.thumbCard, active && styles.thumbActive]}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${item.fileName}`}
                accessibilityState={{ selected: active }}
              >
                <VaultDocThumb
                  uri={item.previewUri}
                  isPdf={isPdfTripDoc({
                    fileName: item.fileName,
                    storagePath: item.storagePath,
                  })}
                  fileName={item.fileName}
                  style={styles.thumbFill}
                  documentKey={previewIdentity(item).documentKey}
                  documentVersion={previewIdentity(item).documentVersion}
                  lazy
                  priority={active ? 1 : 0}
                  onRetrySign={onRetrySign}
                />
              </Pressable>
              {onRemove && !item.locked ? (
                <Pressable
                  onPress={() => onRemove(item.id)}
                  disabled={busy}
                  style={styles.thumbRemove}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.fileName}`}
                >
                  <Feather name="x" size={11} color={Theme.buttonDarkText} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {addThumb}
      </ScrollView>
      {selected && !card ? (
        <Text style={styles.fileName} numberOfLines={1}>
          {selected.fileName}
        </Text>
      ) : null}
      {showHint ? <Text style={styles.fileHint}>{VAULT_DOC_LIMIT_HINT}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  wrapCard: {
    gap: 10,
  },
  dropzoneCard: {
    minHeight: 88,
  },
  heroCard: {
    height: 148,
    borderRadius: 10,
  },
  heroEmpty: {
    borderStyle: "dashed",
    gap: 8,
    paddingHorizontal: 12,
  },
  dropzone: {
    minHeight: 72,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dropzoneText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.actionBtnInk,
    ...WEB_COPY,
  },
  dropzoneTextCard: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    color: Theme.textSecondary,
  },
  hero: {
    height: 168,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.surface,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  heroImage: { width: "100%", height: "100%" },
  heroEye: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    zIndex: 2,
  },
  heroPdf: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  heroPdfName: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    ...WEB_COPY,
  },
  thumbsTrack: {
    height: 68,
    flexGrow: 0,
    flexShrink: 0,
  },
  thumbs: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    minHeight: 68,
    paddingTop: 2,
    paddingRight: 8,
  },
  thumbWrap: {
    position: "relative",
    width: 56,
    height: 64,
    paddingTop: 8,
    paddingRight: 8,
  },
  thumbWrapCard: {
    width: 48,
    height: 56,
  },
  thumb: {
    width: 48,
    height: 56,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
  },
  thumbCard: {
    width: 40,
    height: 48,
    borderRadius: 8,
  },
  thumbActive: {
    borderColor: Theme.actionBtnInk,
    borderWidth: 2,
  },
  thumbFill: { width: "100%", height: "100%" },
  thumbPdf: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: Theme.surface,
  },
  thumbPdfLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  thumbRemove: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.actionBtnInk,
    alignItems: "center",
    justifyContent: "center",
  },
  addThumb: {
    marginTop: 8,
    width: 48,
    height: 56,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.actionBtnGhostBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    gap: 2,
  },
  addThumbCard: {
    width: 40,
    height: 48,
    borderRadius: 8,
  },
  addThumbText: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.actionBtnInk,
    ...WEB_COPY,
  },
  fileName: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    ...WEB_COPY,
  },
  fileHint: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  pressed: { opacity: 0.85 },
});
