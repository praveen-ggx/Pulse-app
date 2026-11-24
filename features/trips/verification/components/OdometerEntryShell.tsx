import Feather from "@expo/vector-icons/Feather";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { ExpenseBillScanOverlay } from "@/features/trips/operations/shared/ExpenseBillScanOverlay";
import { dockPaddingBottom, useKeyboardVisible } from "@/lib/hooks/useKeyboardVisible";

import type { OdometerScanState } from "../odometerScan.types";

const GUIDE = 22;
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
        top: top ? 0 : undefined,
        bottom: top ? undefined : 0,
        left: left ? 0 : undefined,
        right: left ? undefined : 0,
        borderColor: GUIDE_COLOR,
        borderTopWidth: top ? 2 : 0,
        borderBottomWidth: top ? 0 : 2,
        borderLeftWidth: left ? 2 : 0,
        borderRightWidth: left ? 0 : 2,
      }}
    />
  );
}

type AttachmentProps = {
  uri: string | null;
  busy?: boolean;
  onAttach: () => void;
  onRemove?: () => void;
};

type Props = {
  title: string;
  subtitle: string;
  kicker?: string;
  onBack: () => void;
  footer: ReactNode;
  scan: OdometerScanState;
  attachment: AttachmentProps;
  children: ReactNode | ((openPhotoPreview: () => void) => ReactNode);
};

export function OdometerEntryShell({
  title,
  subtitle,
  kicker = "Odometer reading",
  onBack,
  footer,
  scan,
  attachment,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { keyboardVisible } = useKeyboardVisible();
  const [previewOpen, setPreviewOpen] = useState(false);
  const pulse = useRef(new Animated.Value(0.45)).current;
  const viewfinderHeight = Math.max(220, Math.min(340, Math.round(windowHeight * 0.38)));

  const hasAttachment = !!attachment.uri?.trim();
  const scanActive = scan.phase === "preparing" || scan.phase === "analyzing";
  const openPhotoPreview = () => {
    if (hasAttachment) setPreviewOpen(true);
  };

  const scanMessage = useMemo(() => {
    if (!scanActive) return undefined;
    return scan.message.trim() || "Reading odometer digits…";
  }, [scan.message, scanActive]);

  const finderStatus = useMemo(() => {
    if (scanActive) return scan.message.trim() || "Looking for numbers...";
    if (scan.phase === "error") return scan.message.trim() || "Could not read numbers";
    if (scan.pendingKm?.trim()) return "Numbers found — confirm below";
    if (scan.detectedKm?.trim()) return `Found ${scan.detectedKm.trim()} KM`;
    return "Looking for numbers...";
  }, [scan.detectedKm, scan.message, scan.pendingKm, scan.phase, scanActive]);

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

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      enabled={Platform.OS !== "web"}
    >
      <View style={styles.body}>
        <View
          style={[styles.viewfinder, { height: viewfinderHeight, paddingTop: insets.top + 6 }]}
          accessibilityLabel={`${kicker}. ${title}. ${subtitle}`}
        >
          <Pressable
            style={styles.backBtn}
            onPress={onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="arrow-left" size={18} color={Theme.textOnPrimary} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <View style={styles.frame}>
            {hasAttachment ? (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={openPhotoPreview}
                accessibilityRole="button"
                accessibilityLabel="View odometer photo"
              >
                <Image source={{ uri: attachment.uri! }} style={styles.framePhoto} resizeMode="cover" />
              </Pressable>
            ) : null}
            <ViewfinderCorner edge="tl" />
            <ViewfinderCorner edge="tr" />
            <ViewfinderCorner edge="bl" />
            <ViewfinderCorner edge="br" />
            {hasAttachment ? null : (
              <Text style={styles.fitLabel}>Fit odometer here</Text>
            )}
            <View style={styles.statusRow}>
              <Feather name="search" size={13} color="rgba(148,163,184,0.95)" />
              <Animated.Text style={[styles.statusText, { opacity: pulse }]} numberOfLines={1}>
                {finderStatus}
              </Animated.Text>
            </View>
            {hasAttachment && attachment.onRemove ? (
              <Pressable
                style={styles.removePhoto}
                onPress={attachment.onRemove}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove odometer photo"
              >
                <Feather name="x" size={14} color={Theme.textOnPrimary} />
              </Pressable>
            ) : null}
            {scanActive ? (
              <View style={styles.frameScan} pointerEvents="none">
                <ExpenseBillScanOverlay visible label="Reading KM" />
              </View>
            ) : null}
          </View>

          <Pressable
            style={styles.captureBtn}
            onPress={attachment.onAttach}
            disabled={attachment.busy}
            accessibilityRole="button"
            accessibilityLabel={hasAttachment ? "Retake odometer photo" : "Click photo"}
          >
            {attachment.busy ? (
              <ActivityIndicator color={Theme.textOnPrimary} size="small" />
            ) : (
              <Feather name="camera" size={14} color={Theme.textOnPrimary} />
            )}
            <Text style={styles.captureText}>
              {attachment.busy ? (scanActive ? "Scanning…" : "Working…") : "Click Photo"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.keypadWrap}>
          {typeof children === "function" ? children(openPhotoPreview) : children}
        </View>

        <View
          style={[
            styles.footerWrap,
            {
              paddingBottom: dockPaddingBottom(insets.bottom, keyboardVisible, 12),
            },
          ]}
        >
          {footer}
        </View>
      </View>

      <Modal
        visible={previewOpen && hasAttachment}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewOpen(false)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewOpen(false)}>
          {attachment.uri ? (
            <Pressable onPress={() => setPreviewOpen(false)} style={styles.previewImageWrap}>
              <Image
                source={{ uri: attachment.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
              {scanActive ? (
                <View style={styles.previewScanOverlay} pointerEvents="none">
                  <ExpenseBillScanOverlay visible scanTravel={120} label="Reading KM" />
                  {scanMessage ? (
                    <View style={styles.previewScanPill}>
                      <ActivityIndicator color="#6ee7b7" size="small" />
                      <Text style={styles.previewScanPillText} numberOfLines={2}>
                        {scanMessage}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.driverEmeraldWash,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  keypadWrap: {
    flex: 1,
    minHeight: 0,
  },
  footerWrap: {
    flexShrink: 0,
    paddingTop: 6,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.driverEmeraldWash,
  },
  viewfinder: {
    backgroundColor: Theme.odometerViewfinder,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    minHeight: 36,
    paddingRight: 8,
  },
  backText: {
    color: Theme.textOnPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  frame: {
    flex: 1,
    minHeight: 120,
    marginHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  framePhoto: {
    width: "100%",
    height: "100%",
  },
  fitLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(203,213,225,0.95)",
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.4,
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
  captureBtn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  captureText: {
    color: Theme.textOnPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  previewImageWrap: {
    width: "100%",
    height: "80%",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewScanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  previewScanPill: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(15,23,42,0.88)",
    borderWidth: 1,
    borderColor: "rgba(110,231,183,0.35)",
  },
  previewScanPillText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
    lineHeight: 15,
  },
});
