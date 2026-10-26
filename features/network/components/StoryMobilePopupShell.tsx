/**
 * Desktop web: story opens as a centered mobile phone-frame popup.
 * Native / narrow viewports: children fill the screen as today.
 *
 * StoryFlowSheetPortal keeps boost / bids / viewers sheets inside that same
 * phone frame so the full story flow stays mobile-shaped on desktop.
 */
import Theme from "@/constants/Theme";
import type { ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

export const STORY_PHONE_FRAME_WIDTH = 390;
/** At this width and above on web, use the phone-frame popup. */
export const STORY_PHONE_POPUP_MIN_WIDTH = 768;

export function useStoryPhonePopup(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= STORY_PHONE_POPUP_MIN_WIDTH;
}

export function useStoryPhoneFrameMetrics() {
  const { height } = useWindowDimensions();
  const phonePopup = useStoryPhonePopup();
  return {
    phonePopup,
    frameWidth: STORY_PHONE_FRAME_WIDTH,
    frameHeight: Math.min(844, Math.round(height * 0.92)),
    /** Safe bottom padding inside the phone frame (no device home indicator). */
    sheetBottomPad: phonePopup ? 14 : undefined as number | undefined,
  };
}

/**
 * Modal host for story secondary sheets. On desktop phone-popup mode, the
 * sheet slides up inside a phone-sized column aligned with the story frame.
 */
export function StoryFlowSheetPortal({
  visible,
  onClose,
  children,
  accessibilityLabel = "Close",
  animationType = "slide",
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  accessibilityLabel?: string;
  animationType?: "none" | "slide" | "fade";
}) {
  const { phonePopup, frameWidth, frameHeight } = useStoryPhoneFrameMetrics();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onClose}
    >
      <View
        style={[
          portalStyles.overlay,
          phonePopup && portalStyles.overlayPhone,
        ]}
      >
        {phonePopup ? (
          <View
            style={[
              portalStyles.phoneColumn,
              {
                width: "100%",
                maxWidth: frameWidth,
                height: frameHeight,
              },
            ]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
            />
            {children}
          </View>
        ) : (
          <>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
            />
            {children}
          </>
        )}
      </View>
    </Modal>
  );
}

export function StoryMobilePopupShell({
  children,
  onBackdropPress,
}: {
  children: ReactNode;
  onBackdropPress?: () => void;
}) {
  const { phonePopup, frameWidth, frameHeight } = useStoryPhoneFrameMetrics();

  if (!phonePopup) {
    return <>{children}</>;
  }

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Pressable
        style={styles.backdrop}
        onPress={onBackdropPress}
        accessibilityRole="button"
        accessibilityLabel="Close story"
      />
      <View
        style={[
          styles.frame,
          {
            width: "100%",
            maxWidth: frameWidth,
            height: frameHeight,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const portalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: Theme.overlayBackdrop,
  },
  overlayPhone: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  phoneColumn: {
    justifyContent: "flex-end",
    overflow: "hidden",
    borderRadius: 28,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    ...(Platform.OS === "web"
      ? ({ backdropFilter: "blur(6px)" } as object)
      : null),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  frame: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.35)",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 24px 64px rgba(15, 23, 42, 0.35)",
        } as object)
      : {
          shadowColor: Theme.brandBlueInk,
          shadowOpacity: 0.28,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
          elevation: 16,
        }),
  },
});
