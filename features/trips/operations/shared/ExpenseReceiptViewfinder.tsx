import Feather from "@expo/vector-icons/Feather";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Theme from "@/constants/Theme";

import { ExpenseBillScanOverlay } from "./ExpenseBillScanOverlay";
import { ReceiptCameraScreen } from "./ReceiptCameraScreen";
import { primeReceiptCamera } from "./receiptCameraPrime";

const GUIDE = 18;
const GUIDE_COLOR = "rgba(255,255,255,0.78)";

function ViewfinderCorner({ edge }: { edge: "tl" | "tr" | "bl" | "br" }) {
  const top = edge === "tl" || edge === "tr";
  const left = edge === "tl" || edge === "bl";
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: GUIDE,
        height: GUIDE,
        top: top ? 10 : undefined,
        bottom: top ? undefined : 10,
        left: left ? 10 : undefined,
        right: left ? undefined : 10,
        borderColor: GUIDE_COLOR,
        borderTopWidth: top ? 2 : 0,
        borderBottomWidth: top ? 0 : 2,
        borderLeftWidth: left ? 2 : 0,
        borderRightWidth: left ? 0 : 2,
      }}
    />
  );
}

type Props = {
  uri?: string | null;
  busy?: boolean;
  scanning?: boolean;
  statusText?: string;
  onAttach: () => void;
  onCaptured?: (uri: string) => void;
  onPick?: () => void;
  onRemove?: () => void;
  onPress?: () => void;
};

/** Receipt capture that matches the odometer viewfinder: live frame, Click Photo, Attach Photo. */
export function ExpenseReceiptViewfinder({
  uri,
  busy = false,
  scanning = false,
  statusText,
  onAttach,
  onCaptured,
  onPick,
  onRemove,
  onPress,
}: Props) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  const [cameraOpen, setCameraOpen] = useState(false);
  const hasPhoto = !!uri?.trim();

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const openCamera = () => {
    if (busy) return;
    // Browser without live camera access (e.g. plain http on a phone): open the
    // phone camera directly in this tap instead of a blank viewfinder.
    if (
      Platform.OS === "web" &&
      (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
    ) {
      onAttach();
      return;
    }
    primeReceiptCamera();
    setCameraOpen(true);
  };

  const finderStatus = scanning
    ? statusText?.trim() || "Reading receipt…"
    : statusText?.trim() || "Looking for the receipt...";

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.frame}
        onPress={hasPhoto ? onPress : openCamera}
        disabled={busy || (hasPhoto && !onPress)}
        accessibilityRole="button"
        accessibilityLabel={hasPhoto ? "View receipt photo" : "Open camera"}
      >
        {hasPhoto ? (
          <Image source={{ uri: uri! }} style={styles.framePhoto} resizeMode="cover" />
        ) : null}
        <ViewfinderCorner edge="tl" />
        <ViewfinderCorner edge="tr" />
        <ViewfinderCorner edge="bl" />
        <ViewfinderCorner edge="br" />
        {hasPhoto ? null : <Text style={styles.fitLabel}>Fit receipt here</Text>}
        <View style={styles.statusRow}>
          <Feather name="search" size={13} color="rgba(148,163,184,0.95)" />
          <Animated.Text style={[styles.statusText, { opacity: pulse }]} numberOfLines={1}>
            {finderStatus}
          </Animated.Text>
        </View>
        {hasPhoto && onRemove ? (
          <Pressable
            style={styles.removePhoto}
            onPress={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove receipt photo"
          >
            <Feather name="x" size={14} color={Theme.textOnPrimary} />
          </Pressable>
        ) : null}
        {scanning ? (
          <View style={styles.frameScan} pointerEvents="none">
            <ExpenseBillScanOverlay visible label="Reading receipt" />
          </View>
        ) : null}
      </Pressable>

      <ReceiptCameraScreen
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={(captured) => {
          if (onCaptured) {
            onCaptured(captured);
            return;
          }
          onAttach();
        }}
        onUnavailable={onAttach}
      />

      <View style={styles.captureRow}>
        <Pressable
          style={[styles.captureBtn, busy && styles.captureBtnDisabled]}
          onPress={openCamera}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={hasPhoto ? "Retake receipt photo" : "Click photo"}
        >
          {busy ? (
            <ActivityIndicator color={Theme.textOnPrimary} size="small" />
          ) : (
            <Feather name="camera" size={14} color={Theme.textOnPrimary} />
          )}
          <Text style={styles.captureText} numberOfLines={1}>
            {busy ? (scanning ? "Scanning…" : "Working…") : "Click Photo"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.captureBtn, busy && styles.captureBtnDisabled]}
          onPress={onPick ?? onAttach}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={hasPhoto ? "Replace receipt photo" : "Attach photo"}
        >
          <Feather name="image" size={14} color={Theme.textOnPrimary} />
          <Text style={styles.captureText} numberOfLines={1}>
            Attach Photo
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    gap: 10,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Theme.odometerViewfinder,
    padding: 12,
  },
  frame: {
    height: 148,
    alignItems: "center",
    justifyContent: "center",
  },
  framePhoto: {
    ...StyleSheet.absoluteFillObject,
  },
  fitLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(203,213,225,0.95)",
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  statusText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
    color: "rgba(148,163,184,0.95)",
  },
  frameScan: {
    ...StyleSheet.absoluteFillObject,
  },
  removePhoto: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  captureRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 8,
  },
  captureBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  captureBtnDisabled: {
    opacity: 0.55,
  },
  captureText: {
    flexShrink: 1,
    color: Theme.textOnPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
});
