/**
 * Desktop web — right-anchored registry drawer with full-viewport blurred backdrop.
 * Used for Notifications and Invitations (Metronic activity drawer pattern).
 *
 * Portaled to document.body so the scrim sits above page content (not trapped in the
 * tab-bar shell stacking context at z-index 100).
 */
import Theme from "@/constants/Theme";
import { useEffect, useState, type ReactNode, type RefObject } from "react";

import { createPortal } from "react-dom";
import { Platform, Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DEFAULT_DRAWER_WIDTH = 480;
/** Inset from viewport edges — floating panel, not flush to the corner. */
const DEFAULT_DRAWER_INSET_RIGHT = 20;
const DEFAULT_DRAWER_INSET_TOP = 16;
const DEFAULT_DRAWER_INSET_BOTTOM = 16;
/** Above app chrome (tab bar shell ~100) and below drawer panel. */
const BACKDROP_Z = 5000;
const DRAWER_Z = 5001;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  hostRef?: RefObject<View | null>;
  /** Drawer width in px (default 480). */
  width?: number;
  insetRight?: number;
  insetTop?: number;
  insetBottom?: number;
};

const webFixed = Platform.OS === "web" ? ({ position: "fixed" } as ViewStyle) : {};

export function RegistryWebDrawer({
  visible,
  onClose,
  children,
  hostRef,
  width = DEFAULT_DRAWER_WIDTH,
  insetRight = DEFAULT_DRAWER_INSET_RIGHT,
  insetTop = DEFAULT_DRAWER_INSET_TOP,
  insetBottom = DEFAULT_DRAWER_INSET_BOTTOM,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const { width: viewportWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = viewportWidth < 768;

  useEffect(() => {
    if (Platform.OS === "web") setPortalReady(true);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible || Platform.OS !== "web" || !portalReady) return null;

  const overlay = (
    <>
      <Pressable
        onPress={onClose}
        style={[styles.backdrop, webFixed, { zIndex: BACKDROP_Z }]}
        accessibilityRole="button"
        accessibilityLabel="Close panel"
      />
      <View
        ref={hostRef}
        style={[
          styles.drawer,
          webFixed,
          compact ? styles.drawerCompact : null,
          compact
            ? {
                zIndex: DRAWER_Z,
                top: Math.max(insets.top, 8) + 4,
                left: 10,
                right: 10,
                bottom: Math.max(insets.bottom, 8) + 4,
              }
            : {
                zIndex: DRAWER_Z,
                top: insetTop,
                right: insetRight,
                bottom: insetBottom,
                width,
              },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.drawerInner}>{children}</View>
      </View>
    </>
  );

  return createPortal(overlay, document.body);
}

const styles = StyleSheet.create({
  backdrop: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    ...Platform.select({
      web: {
        backdropFilter: "blur(16px) saturate(130%)",
        WebkitBackdropFilter: "blur(16px) saturate(130%)",
      } as unknown as ViewStyle,
    }),
  },
  drawerCompact: {
    maxWidth: "100%",
    borderRadius: 16,
  },
  drawer: {
    maxWidth: "96vw" as unknown as number,
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EFF2F5",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow:
          "0 12px 40px rgba(24, 28, 50, 0.14), 0 4px 12px rgba(24, 28, 50, 0.06)",
      },
      default: {
        shadowColor: "#181C32",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        elevation: 16,
      },
    }),
  },
  drawerInner: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
  },
});

export const REGISTRY_DRAWER_WIDTH = DEFAULT_DRAWER_WIDTH;
