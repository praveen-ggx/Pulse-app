import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const INDENT_REVIEW_HUB_ROOT_SCREEN_OPTIONS = {
  presentation: "transparentModal" as const,
  animation: "fade" as const,
  headerShown: false,
  contentStyle: { flex: 1, backgroundColor: "transparent" as const },
};

type IndentReviewHubDialogShellProps = {
  onDismiss: () => void;
  stacked: boolean;
  children: ReactNode;
};

/**
 * Review Hub chrome — dimmed backdrop + centered card on desktop,
 * bottom sheet on compact. Safe-area lives on the shell so the hub
 * header stays a compact dialog bar.
 */
export function IndentReviewHubDialogShell({
  onDismiss,
  stacked,
  children,
}: IndentReviewHubDialogShellProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const gutter = stacked ? 10 : 24;
  const topGap = stacked
    ? Math.max(10, insets.top + 6)
    : Math.max(16, insets.top + 8);
  const bottomGap = Math.max(stacked ? 8 : 16, insets.bottom + (stacked ? 4 : 8));
  const sheetMax = Math.max(320, height - topGap - bottomGap);
  const sheetWidth = Math.min(width - gutter * 2, stacked ? width : 1180);

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Pressable
        style={styles.backdrop}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close review hub"
      />
      <View
        style={[
          styles.sheet,
          stacked ? styles.sheetStacked : styles.sheetDesktop,
          {
            width: sheetWidth,
            height: sheetMax,
            maxHeight: sheetMax,
            marginTop: topGap,
            marginBottom: bottomGap,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Theme.overlayBackdrop,
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(10px) saturate(120%)",
          WebkitBackdropFilter: "blur(10px) saturate(120%)",
          cursor: "pointer",
        } as unknown as ViewStyle)
      : null),
  },
  sheet: {
    zIndex: 2,
    flexGrow: 0,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow:
          "0 16px 48px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(15, 23, 42, 0.06)",
      } as object,
      default: {
        shadowColor: Theme.shadow,
        shadowOpacity: 0.16,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
        elevation: 18,
      },
    }),
  },
  sheetDesktop: {
    borderRadius: 16,
    maxWidth: 1180,
  },
  sheetStacked: {
    borderRadius: 16,
    maxWidth: Layout.desktopHubMaxWidth,
    alignSelf: "center",
  },
});
