/**
 * Full-screen e-way bill preview — zoom, pan, and 90° rotate on phone and desktop.
 */
import { Theme } from "@/constants/Theme";
import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import {
  adjacentZoom,
  panForZoom,
} from "@/features/trips/components/trip-detail/podPreviewZoom.util";
import { isPdfTripDoc } from "@/features/trips/components/trip-detail/tripDocTypes";
import { TripVaultFilePreview } from "@/features/trips/components/trip-detail/TripVaultFilePreview";
import { isInlinePreviewUri } from "@/features/trips/utils/storagePreviewObjectUrl.util";
import type { EwayBillStripRow } from "@/features/trips/services/ewayBillFields.util";
import { Minus, Plus, RotateCcw, RotateCwSquare, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function ToolButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = ref.current as unknown as HTMLElement | null;
    if (node) node.title = label;
  }, [label]);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.toolBtn, pressed && styles.toolBtnPressed]}
    >
      {children}
    </Pressable>
  );
}

export function EwayBillZoomPreview({
  row,
  organizationId,
  onClose,
}: {
  row: EwayBillStripRow | null;
  organizationId?: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const readyUri = row?.previewUri?.trim() || "";
  const storagePath = row?.previewPath?.trim() || "";
  const [uri, setUri] = useState<string | null>(readyUri || null);
  const [pending, setPending] = useState(Boolean(row) && !readyUri && !!storagePath);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [stageNode, setStageNode] = useState<HTMLElement | null>(null);
  const scaleRef = useRef(1);
  const rotationRef = useRef(0);
  const panRef = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    scaleRef.current = 1;
    rotationRef.current = 0;
    panRef.current = { x: 0, y: 0 };
    setScale(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setDragging(false);
    const ready = row?.previewUri?.trim() || "";
    if (!row) {
      setUri(null);
      setPending(false);
      return;
    }
    if (ready) {
      setUri(ready);
      setPending(false);
      return;
    }
    const path = row.previewPath?.trim() || "";
    if (!path || path.startsWith("ref:")) {
      setUri(null);
      setPending(false);
      return;
    }
    if (isInlinePreviewUri(path)) {
      setUri(path);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    void signCompliancePreviewUrl({
      storagePath: path,
      source: "trip",
      organizationId,
    }).then((signed) => {
      if (cancelled) return;
      setUri(signed);
      setPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, row, row?.id, row?.previewPath, row?.previewUri]);

  const commitView = useCallback((nextScale: number, nextPan: { x: number; y: number }) => {
    scaleRef.current = nextScale;
    panRef.current = nextPan;
    setScale(nextScale);
    setPan(nextPan);
  }, []);

  const applyZoom = useCallback(
    (nextScale: number, cursor?: { x: number; y: number }) => {
      const prev = scaleRef.current;
      const prevPan = panRef.current;
      const next = Math.min(3, Math.max(0.5, nextScale));
      commitView(next, panForZoom(prev, prevPan, next, cursor));
    },
    [commitView],
  );

  const resetView = useCallback(() => {
    rotationRef.current = 0;
    commitView(1, { x: 0, y: 0 });
    setRotation(0);
  }, [commitView]);

  const rotate = useCallback(() => {
    setRotation((current) => {
      const next = (current + 90) % 360;
      rotationRef.current = next;
      return next;
    });
    commitView(1, { x: 0, y: 0 });
  }, [commitView]);

  const setStageRef = useCallback((node: View | null) => {
    setStageNode((node as unknown as HTMLElement | null) ?? null);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !row || !stageNode?.addEventListener) return;
    const node = stageNode;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = node.getBoundingClientRect();
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      const notch = event.deltaMode !== 0 || Math.abs(delta) >= 40;
      const next = notch
        ? adjacentZoom(scaleRef.current, delta < 0 ? 1 : -1)
        : scaleRef.current * Math.exp(-delta * 0.002);
      applyZoom(next, {
        x: event.clientX - (rect.left + rect.width / 2),
        y: event.clientY - (rect.top + rect.height / 2),
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [applyZoom, row, stageNode]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () =>
        scaleRef.current > 1 || rotationRef.current !== 0,
      onPanResponderGrant: () => {
        dragOrigin.current = panRef.current;
        setDragging(true);
      },
      onPanResponderMove: (_, gesture) => {
        const nextPan = {
          x: dragOrigin.current.x + gesture.dx,
          y: dragOrigin.current.y + gesture.dy,
        };
        panRef.current = nextPan;
        setPan(nextPan);
      },
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
    }),
  ).current;

  const isPdf = isPdfTripDoc({
    fileName: row?.previewFileName,
    mimeType: row?.previewMime,
    storagePath: row?.previewPath,
  });
  const rotated = rotation !== 0;
  const keepPdfChrome = isPdf && scale <= 1 && !rotated && !dragging;
  const zoomStyle = {
    transform: [
      { translateX: pan.x },
      { translateY: pan.y },
      { scale },
      { rotate: `${rotation}deg` },
    ],
    ...(Platform.OS === "web"
      ? ({
          transformOrigin: "center center",
          transition: dragging ? "none" : "transform 140ms ease",
        } as ViewStyle)
      : null),
  };
  const stageCursor =
    Platform.OS === "web"
      ? ({
          cursor: dragging ? "grabbing" : scale > 1 ? "grab" : "zoom-in",
          userSelect: "none",
          touchAction: "none",
        } as unknown as ViewStyle)
      : null;
  const title = row?.ewayNo && row.ewayNo !== "—" ? `E-way ${row.ewayNo}` : "E-way bill";

  return (
    <Modal visible={row != null} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          {
            paddingTop: Math.max(insets.top, 8),
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.bar}>
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.hint} numberOfLines={1}>
              Zoom, drag to pan, and rotate to straighten.
            </Text>
          </View>
          <View style={styles.tools}>
            <ToolButton label="Zoom out" onPress={() => applyZoom(adjacentZoom(scale, -1))}>
              <Minus size={16} color={Theme.textPrimaryDark} />
            </ToolButton>
            <Text style={styles.percent} accessibilityLabel={`Zoom ${Math.round(scale * 100)} percent`}>
              {Math.round(scale * 100)}%
            </Text>
            <ToolButton label="Zoom in" onPress={() => applyZoom(adjacentZoom(scale, 1))}>
              <Plus size={16} color={Theme.textPrimaryDark} />
            </ToolButton>
            <ToolButton label="Rotate" onPress={rotate}>
              <RotateCwSquare size={16} color={Theme.textPrimaryDark} />
            </ToolButton>
            <ToolButton label="Reset view" onPress={resetView}>
              <RotateCcw size={15} color={Theme.textPrimaryDark} />
            </ToolButton>
            <ToolButton label="Close preview" onPress={onClose}>
              <X size={16} color={Theme.textPrimaryDark} />
            </ToolButton>
          </View>
        </View>

        <View ref={setStageRef} style={[styles.stage, stageCursor]}>
          {pending ? (
            <ActivityIndicator size="large" color={Theme.primary} />
          ) : uri ? (
            <View
              style={[styles.media, zoomStyle]}
              pointerEvents={keepPdfChrome ? "box-none" : "none"}
            >
              <TripVaultFilePreview
                uri={uri}
                isPdf={isPdf}
                showToolbar={keepPdfChrome}
                interactive={keepPdfChrome}
                scrollbar={keepPdfChrome}
                previewTier={rotated ? "thumb" : "full"}
                sizing="fit"
                style={styles.file}
                accessibilityLabel={row?.previewFileName || title}
              />
            </View>
          ) : (
            <Text style={styles.empty}>No document to preview.</Text>
          )}
          <View
            style={[styles.gesture, keepPdfChrome && styles.gesturePdf]}
            pointerEvents="auto"
            {...panResponder.panHandlers}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
  },
  bar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  hint: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  tools: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    flexShrink: 0,
    gap: 4,
    marginLeft: "auto",
  },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
  },
  toolBtnPressed: {
    opacity: 0.72,
  },
  percent: {
    minWidth: 40,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  stage: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  media: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  file: {
    width: "100%",
    height: "100%",
  },
  empty: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.cardWhite,
  },
  gesture: {
    ...StyleSheet.absoluteFillObject,
  },
  gesturePdf: {
    top: 48,
  },
});
