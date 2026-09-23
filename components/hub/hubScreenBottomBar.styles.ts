import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { StyleSheet } from "react-native";

/** Pinned hub footer — trips, loads, and other desktop list screens. */
export const hubScreenBottomBarStyles = StyleSheet.create({
  shell: {
    flexShrink: 0,
    marginTop: "auto",
    width: "100%",
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 44,
    width: "100%",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
    flex: 1,
  },
  center: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    zIndex: 2,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
  },
  full: {
    width: "100%",
  },
});
