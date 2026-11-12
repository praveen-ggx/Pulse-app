import Feather from "@expo/vector-icons/Feather";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";

import { ExpenseBillScanOverlay } from "./ExpenseBillScanOverlay";

type Props = {
  uri?: string | null;
  title?: string;
  emptyTitle?: string;
  hint?: string;
  emptyHint?: string;
  scanning?: boolean;
  busy?: boolean;
  scanLabel?: string;
  compact?: boolean;
  /** Nested inside a parent card — no own border/shadow. */
  embedded?: boolean;
  onAttach: () => void;
  onPress?: () => void;
  onRetake?: () => void;
  onRemove?: () => void;
};

/**
 * Fixed-height body photo slot for driver odometer / expense entry.
 * Shows preview when attached, or a camera affordance in the same layout when empty.
 */
export function OpsEntryBodyPhotoSlot({
  uri,
  title = "Attached photo",
  emptyTitle,
  hint = "Tap image to enlarge",
  emptyHint = "Photograph the bill to auto-fill fields",
  scanning = false,
  busy = false,
  scanLabel = "AI scan",
  compact = false,
  embedded = false,
  onAttach,
  onPress,
  onRetake,
  onRemove,
}: Props) {
  const hasPhoto = !!uri?.trim();
  const slotTitle = hasPhoto ? title : (emptyTitle ?? title);
  const slotHint = hasPhoto ? (scanning ? "Reading photo…" : hint) : emptyHint;
  const iconColor = Theme.textMuted;

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        compact && styles.cardCompactFill,
        embedded && styles.cardEmbedded,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Feather
            name={hasPhoto ? "image" : "camera"}
            size={11}
            color={iconColor}
          />
          <Text style={styles.title}>{slotTitle}</Text>
        </View>
        {hasPhoto && !compact ? (
          <View style={styles.actions}>
            {onRetake ? (
              <Pressable
                style={styles.actionBtn}
                onPress={onRetake}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Retake photo"
              >
                <Feather name="refresh-cw" size={10} color={Theme.textMuted} />
                <Text style={styles.actionText}>Retake</Text>
              </Pressable>
            ) : null}
            {onRemove ? (
              <Pressable
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={onRemove}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <Feather name="trash-2" size={10} color={Theme.destructive} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {hasPhoto ? (
        <View
          style={[
            compact ? styles.previewWrapCompactFilled : styles.previewWrap,
            scanning && styles.previewWrapScanning,
          ]}
        >
          <Pressable
            style={styles.previewPressable}
            onPress={onPress ?? onAttach}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={onPress ? "View attached bill full screen" : "Retake bill photo"}
          >
            <Image
              source={{ uri: uri! }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            <ExpenseBillScanOverlay visible={scanning} scanTravel={108} label={scanLabel} />
            {compact ? (
              <View style={styles.compactPreviewHintWrap} pointerEvents="none">
                <View style={styles.compactPreviewHint}>
                  <Feather name="maximize-2" size={10} color="#fff" />
                  <Text style={styles.compactPreviewHintText}>Preview</Text>
                </View>
              </View>
            ) : null}
          </Pressable>
          {compact ? (
            <View style={styles.compactOverlay} pointerEvents="box-none">
              <View style={styles.compactOverlayTop}>
                {onRemove ? (
                  <Pressable
                    style={[styles.compactIconBtn, styles.compactIconBtnDanger]}
                    onPress={onRemove}
                    disabled={busy}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Remove bill photo"
                  >
                    <Feather name="trash-2" size={11} color={Theme.destructive} />
                  </Pressable>
                ) : null}
                {onRetake ? (
                  <Pressable
                    style={styles.compactIconBtn}
                    onPress={onRetake}
                    disabled={busy}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Retake bill photo"
                  >
                    <Feather name="refresh-cw" size={11} color={Theme.textPrimaryDark} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable
          style={[
            compact ? styles.previewWrapCompactEmpty : styles.emptyWrap,
            busy && styles.emptyWrapBusy,
          ]}
          onPress={onAttach}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Attach photo"
        >
          {busy ? (
            <>
              <ActivityIndicator color={Theme.driverEmeraldDark} size="small" />
              <Text style={styles.emptyBtnText}>{scanning ? "Scanning…" : "Working…"}</Text>
            </>
          ) : (
            <>
              <View style={[styles.emptyIconRing, compact && styles.emptyIconRingCompact]}>
                <Feather name="camera" size={compact ? 16 : 22} color={iconColor} />
              </View>
              <Text style={[styles.emptyBtnText, compact && styles.emptyBtnTextCompact]}>
                Attach photo
              </Text>
              {!compact ? <Text style={styles.emptySubtext}>Camera or gallery</Text> : null}
            </>
          )}
        </Pressable>
      )}

      {!compact ? (
        <Text style={styles.hint} numberOfLines={2}>
          {slotHint}
        </Text>
      ) : null}
    </View>
  );
}

/** @deprecated Use OpsEntryBodyPhotoSlot — kept for callers that always have a uri. */
export function OpsEntryBodyPhotoPreview(
  props: Omit<Props, "onAttach"> & { uri: string; onAttach?: () => void },
) {
  return (
    <OpsEntryBodyPhotoSlot
      {...props}
      onAttach={props.onAttach ?? props.onRetake ?? (() => {})}
    />
  );
}

const COMPACT_PREVIEW_H = 120;

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 8,
    gap: 6,
  },
  cardCompact: {
    padding: 0,
    gap: 6,
  },
  cardCompactFill: {
    flex: 1,
  },
  cardEmbedded: {
    borderWidth: 0,
    backgroundColor: "transparent",
    borderRadius: 0,
    padding: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...Typography.headerTitle,
    fontSize: 9,
    letterSpacing: 0.55,
    color: Theme.textMuted,
    flexShrink: 1,
    textTransform: "uppercase",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.3)",
    backgroundColor: "rgba(148,163,184,0.1)",
  },
  actionBtnDanger: {
    borderColor: "rgba(239,68,68,0.25)",
    backgroundColor: "rgba(254,226,226,0.5)",
    paddingHorizontal: 6,
  },
  actionText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  previewWrap: {
    position: "relative",
    height: 132,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  previewWrapCompactFilled: {
    position: "relative",
    height: COMPACT_PREVIEW_H,
    minHeight: COMPACT_PREVIEW_H,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  previewWrapCompactEmpty: {
    height: COMPACT_PREVIEW_H,
    minHeight: COMPACT_PREVIEW_H,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(148,163,184,0.4)",
    backgroundColor: "rgba(148,163,184,0.08)",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 8,
  },
  previewWrapScanning: {
    borderColor: "#6ee7b7",
    shadowColor: Theme.driverEmeraldDark,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  previewPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  compactOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-start",
    padding: 6,
  },
  compactOverlayTop: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 4,
  },
  compactIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.35)",
  },
  compactIconBtnDanger: {
    backgroundColor: "rgba(254,226,226,0.95)",
    borderColor: "rgba(239,68,68,0.28)",
  },
  compactPreviewHintWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 6,
  },
  compactPreviewHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  compactPreviewHintText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.2,
  },
  emptyWrap: {
    height: 132,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(148,163,184,0.4)",
    backgroundColor: "rgba(148,163,184,0.08)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  emptyWrapBusy: {
    borderStyle: "solid",
    borderColor: "rgba(148,163,184,0.28)",
  },
  emptyIconRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.28)",
  },
  emptyIconRingCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  emptyBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.1,
  },
  emptyBtnTextCompact: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptySubtext: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  hint: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 12,
  },
});
