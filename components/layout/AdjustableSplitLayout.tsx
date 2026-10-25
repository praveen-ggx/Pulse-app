/**
 * Drag-to-resize two-pane row. Used by Compliance (trip list, document preview, POD).
 */
import Theme from "@/constants/Theme";
import {
  clampSplitSize,
  hasSplitSize,
  readSplitSize,
  writeSplitSize,
} from "@/lib/layout/adjustableSplit.util";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";

const OTHER_MIN = 280;
const HANDLE = 10;

function setWebDragCursor(on: boolean) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.body.style.cursor = on ? "col-resize" : "";
  document.body.style.userSelect = on ? "none" : "";
}

export function AdjustableSplitLayout({
  storageKey,
  enabled = true,
  stacked = false,
  sizedPane = "start",
  defaultSize,
  defaultRatio,
  minSize,
  maxSize,
  start,
  end,
  style,
}: {
  storageKey: string;
  enabled?: boolean;
  stacked?: boolean;
  sizedPane?: "start" | "end";
  defaultSize: number;
  defaultRatio?: number;
  minSize: number;
  maxSize: number;
  start?: ReactNode;
  end?: ReactNode;
  style?: ViewStyle;
}) {
  const hasStart = start != null;
  const hasEnd = end != null;
  const canResize = enabled && !stacked && hasStart && hasEnd;
  const [size, setSize] = useState(() => readSplitSize(storageKey, defaultSize));
  const [container, setContainer] = useState(0);
  const [dragging, setDragging] = useState(false);
  const sizeRef = useRef(size);
  const startSizeRef = useRef(size);
  const containerRef = useRef(0);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  const clamp = useCallback(
    (next: number) =>
      clampSplitSize(next, minSize, maxSize, containerRef.current, OTHER_MIN),
    [maxSize, minSize],
  );

  useEffect(() => {
    if (container <= 0) return;
    if (!hasSplitSize(storageKey) && defaultRatio != null) {
      setSize(clamp(container * defaultRatio));
      return;
    }
    setSize((current) => clamp(current));
  }, [clamp, container, defaultRatio, storageKey]);

  const persist = useCallback(
    (next: number) => {
      const clamped = clamp(next);
      setSize(clamped);
      writeSplitSize(storageKey, clamped);
    },
    [clamp, storageKey],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startSizeRef.current = sizeRef.current;
          setDragging(true);
          setWebDragCursor(true);
        },
        onPanResponderMove: (_evt, gesture) => {
          const delta = sizedPane === "start" ? gesture.dx : -gesture.dx;
          persist(startSizeRef.current + delta);
        },
        onPanResponderRelease: () => {
          setDragging(false);
          setWebDragCursor(false);
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          setWebDragCursor(false);
        },
      }),
    [persist, sizedPane],
  );

  useEffect(
    () => () => {
      setWebDragCursor(false);
    },
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    containerRef.current = next;
    setContainer(next);
  };

  if (!hasStart) return <View style={[styles.fill, style]}>{end}</View>;
  if (!hasEnd) return <View style={[styles.fill, style]}>{start}</View>;
  if (!canResize) {
    return (
      <View style={[stacked ? styles.column : styles.row, styles.fill, style]}>
        <View style={styles.flexChild}>{start}</View>
        <View style={styles.flexChild}>{end}</View>
      </View>
    );
  }

  const startStyle =
    sizedPane === "start" ? { width: size, flexGrow: 0, flexShrink: 0 } : styles.flexChild;
  const endStyle =
    sizedPane === "end" ? { width: size, flexGrow: 0, flexShrink: 0 } : styles.flexChild;

  return (
    <View style={[styles.row, styles.fill, style]} onLayout={onLayout}>
      <View style={[styles.pane, startStyle]}>{start}</View>
      <View
        style={[styles.handle, dragging && styles.handleOn]}
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Resize side pane"
      >
        <View style={[styles.grip, dragging && styles.gripOn]} />
      </View>
      <View style={[styles.pane, endStyle]}>{end}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0, minHeight: 0 },
  row: { flexDirection: "row", alignItems: "stretch" },
  column: { flexDirection: "column", alignItems: "stretch" },
  pane: { minWidth: 0, minHeight: 0, height: "100%" },
  flexChild: { flex: 1, minWidth: 0, minHeight: 0 },
  handle: {
    width: HANDLE,
    marginHorizontal: -3,
    zIndex: 8,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "col-resize" } as object) : null),
  },
  handleOn: {
    backgroundColor: Theme.complianceSelectedWash,
  },
  grip: {
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: Theme.complianceTripCardBorder,
  },
  gripOn: {
    backgroundColor: Theme.actionBtnInk,
  },
});
