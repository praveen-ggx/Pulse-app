import Feather from "@expo/vector-icons/Feather";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";
import {
  OdometerCameraPreview,
  type OdometerCameraHandle,
} from "@/features/trips/verification/components/OdometerCameraPreview";

const GUIDE = 28;

function FrameCorner({ edge }: { edge: "tl" | "tr" | "bl" | "br" }) {
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
        borderColor: Theme.textOnPrimary,
        borderTopWidth: top ? 2 : 0,
        borderBottomWidth: top ? 0 : 2,
        borderLeftWidth: left ? 2 : 0,
        borderRightWidth: left ? 0 : 2,
      }}
    />
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onCaptured: (uri: string) => void;
  /** Called in the shutter tap when the live camera has no frame yet. */
  onUnavailable: () => void;
};

/** Full-screen camera so a long receipt can be framed before the photo is taken. */
export function ReceiptCameraScreen({ visible, onClose, onCaptured, onUnavailable }: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<OdometerCameraHandle>(null);
  const [shooting, setShooting] = useState(false);

  const shoot = () => {
    if (shooting) return;
    const camera = cameraRef.current;
    if (!camera?.isReady()) {
      onClose();
      onUnavailable();
      return;
    }
    setShooting(true);
    void camera
      .capture()
      .then((uri) => {
        setShooting(false);
        if (uri) {
          onCaptured(uri);
          onClose();
          return;
        }
        onClose();
        // Let the live camera release before the phone opens the system camera.
        setTimeout(onUnavailable, Platform.OS === "web" ? 0 : 280);
      })
      .catch(() => {
        setShooting(false);
        onClose();
        setTimeout(onUnavailable, Platform.OS === "web" ? 0 : 280);
      });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.screen}>
        <OdometerCameraPreview ref={cameraRef} enabled={visible} fit="contain" usePrimedStream />
        <View style={styles.scrim} pointerEvents="box-none">
          <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close camera"
            >
              <Feather name="x" size={18} color={Theme.textOnPrimary} />
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.frameGuide} pointerEvents="none">
            <FrameCorner edge="tl" />
            <FrameCorner edge="tr" />
            <FrameCorner edge="bl" />
            <FrameCorner edge="br" />
          </View>

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.hint}>Fit the whole receipt in the frame</Text>
            <Pressable
              style={styles.shutter}
              onPress={shoot}
              disabled={shooting}
              accessibilityRole="button"
              accessibilityLabel="Click photo"
            >
              {shooting ? (
                <ActivityIndicator color={Theme.odometerViewfinder} />
              ) : (
                <View style={styles.shutterCore} />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.odometerViewfinder,
    ...(Platform.OS === "web" ? { minHeight: "100vh" as unknown as number } : null),
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topBar: {
    paddingHorizontal: 16,
  },
  closeBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Theme.driverOverlayHeavy,
  },
  closeText: {
    color: Theme.textOnPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  frameGuide: {
    flex: 1,
    marginHorizontal: 28,
    marginVertical: 12,
  },
  bottomBar: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  hint: {
    color: Theme.textOnPrimary,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Theme.textOnPrimary,
    backgroundColor: Theme.driverOverlayHeavy,
  },
  shutterCore: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Theme.textOnPrimary,
  },
});
