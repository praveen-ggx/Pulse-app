import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

type HubScreenShellProps = {
  children: ReactNode;
  /** Pinned bottom bar (e.g. pagination, export). */
  footer?: ReactNode;
};

/**
 * Flex column shell for hub screens: scrollable body fills viewport;
 * optional footer stays pinned at the bottom without overlapping content.
 */
export function HubScreenShell({ children, footer }: HubScreenShellProps) {
  return (
    <View style={styles.root}>
      <View style={styles.body}>{children}</View>
      {footer ? (
        <View style={styles.footer} pointerEvents="auto">
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    overflow: "hidden",
  },
  body: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    zIndex: 0,
  },
  footer: {
    flexShrink: 0,
    zIndex: 4,
    elevation: 4,
    position: "relative",
  },
});
