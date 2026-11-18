import Theme from "@/constants/Theme";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IndentReviewHubPageShellProps = {
  stacked: boolean;
  children: ReactNode;
};

/**
 * Review Hub page chrome — a full-height page (not a dialog). Wide screens
 * center the hub in a bounded column; compact screens use the full width.
 * The top safe area lives here; the sticky footer owns the bottom inset.
 */
export function IndentReviewHubPageShell({
  stacked,
  children,
}: IndentReviewHubPageShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={[styles.column, !stacked && styles.columnWide]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    backgroundColor: Theme.analyticsCanvas,
  },
  column: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignSelf: "center",
    backgroundColor: Theme.analyticsCanvas,
  },
  columnWide: {
    maxWidth: 1180,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
  },
});
