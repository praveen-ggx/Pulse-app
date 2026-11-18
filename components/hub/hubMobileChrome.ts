/**
 * Shared mobile hub chrome — Trips, Load Center (indents), and future hub screens.
 * Single source for header row, underline tabs, search row, and filter affordances.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { Platform, StyleSheet } from "react-native";

/** Primary accent for hub underline tabs (trips default). */
export const HUB_MOBILE_ACCENT = Theme.pulseIndigo;

export const HUB_MOBILE_SEARCH_FONT_SIZE = 13;
export const HUB_MOBILE_SEARCH_LINE_HEIGHT = 18;
export const HUB_MOBILE_SEARCH_ROW_HEIGHT = 34;

export const hubMobileChromeStyles = StyleSheet.create({
  shell: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: Theme.screenBackground,
  },
  screenHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
    paddingBottom: 8,
    gap: 10,
  },
  screenTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
    includeFontPadding: false,
  },
  screenHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  tabHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 36,
  },
  filterBtn: {
    width: 34,
    height: 34,
    marginRight: 2,
    marginBottom: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  filterBtnActive: {
    borderRadius: 10,
    backgroundColor: Theme.pulseTabActiveBg,
  },
  primaryTabsScroll: {
    flex: 1,
    minWidth: 0,
  },
  primaryTabsContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingRight: 4,
  },
  tabItem: {
    position: "relative",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    marginRight: 2,
    justifyContent: "flex-end",
    minHeight: 34,
  },
  tabItemCompact: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 7,
    minHeight: 30,
    marginRight: 0,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textRouteCard,
    letterSpacing: -0.2,
  },
  tabLabelCompact: {
    fontSize: 11,
    letterSpacing: -0.25,
  },
  tabLabelActive: {
    fontWeight: "600",
    color: HUB_MOBILE_ACCENT,
  },
  tabUnderline: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: HUB_MOBILE_ACCENT,
  },
  tabUnderlineCompact: {
    left: 8,
    right: 8,
    height: 2,
  },
  tabDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginBottom: 0,
  },
  metricTabsScroll: {
    minWidth: 0,
    alignSelf: "stretch",
    marginTop: 2,
    marginBottom: 2,
  },
  metricTabsContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingRight: 4,
    paddingBottom: 0,
    gap: 0,
  },
  metricTabsContentSpread: {
    flexGrow: 1,
    justifyContent: "space-between",
  },
  metricTabDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginVertical: 4,
    marginHorizontal: 2,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    height: HUB_MOBILE_SEARCH_ROW_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingLeft: 10,
    paddingRight: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  searchLeadingIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: HUB_MOBILE_SEARCH_FONT_SIZE,
    lineHeight: HUB_MOBILE_SEARCH_LINE_HEIGHT,
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    height: HUB_MOBILE_SEARCH_LINE_HEIGHT,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  /** Mobile filter block inside scroll — matches trips hub bleed pattern. */
  bodyFiltersMobileInLayout: {
    marginBottom: 6,
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingTop: 2,
    paddingBottom: 6,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "transparent",
    overflow: "hidden",
  },
});
