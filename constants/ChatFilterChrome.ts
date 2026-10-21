/**
 * Filter/tab chrome shared with Chat (`ChatScreen` list header).
 * Use for Finance cash toolbar, Trips filters, etc.
 *
 * Selected pill uses pastel blue wash + ink label (Add Load family).
 */
import { StyleSheet } from "react-native";
import Theme from "@/constants/Theme";

export const CHAT_FILTER_MUTED = "#64748b";
export const CHAT_FILTER_TRAY_BG = "#f1f5f9";
export const CHAT_FILTER_TRAY_BORDER = "#e8ecf1";
export const CHAT_FILTER_ACTIVE_BG = Theme.primary;

export const chatFilterChromeStyles = StyleSheet.create({
  toolbarStack: {
    width: "100%",
    minWidth: 0,
    gap: 6,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 18,
    backgroundColor: CHAT_FILTER_TRAY_BG,
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
  },
  tabPill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
    backgroundColor: "#ffffff",
    minHeight: 34,
  },
  tabPillActive: {
    borderColor: Theme.loadAddButtonBorder,
    backgroundColor: Theme.pulseIndigoWash,
  },
  tabPillHover: {
    backgroundColor: Theme.complianceSelectedWash,
  },
  /** Size to label + count — use on Trips / toolbars where equal flex causes truncation. */
  tabPillHug: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    minWidth: 0,
    paddingHorizontal: 12,
  },
  tabPillLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: CHAT_FILTER_MUTED,
    letterSpacing: 0.55,
    textTransform: "uppercase",
    textAlign: "center",
  },
  tabPillLabelActive: {
    color: CHAT_FILTER_ACTIVE_BG,
  },
  tabPillLabelHug: {
    flexShrink: 0,
  },
  searchScopeStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  searchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: "#334155",
    fontWeight: "500",
    paddingVertical: 0,
  },
  scopeSegment: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 5,
    flexShrink: 0,
  },
  scopePill: {
    minWidth: 58,
    maxWidth: 84,
    paddingVertical: 7,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  scopePillActive: {
    backgroundColor: Theme.pulseIndigoWash,
    borderColor: CHAT_FILTER_ACTIVE_BG,
  },
  scopePillText: {
    fontSize: 8,
    fontWeight: "600",
    color: CHAT_FILTER_MUTED,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  scopePillTextActive: {
    color: CHAT_FILTER_ACTIVE_BG,
  },
  /** Header row: supply tabs left, main tabs + view toggle right. */
  filterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    minWidth: 0,
    flexWrap: "nowrap",
  },
  filterHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    marginLeft: "auto",
  },
  tabRowHug: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  /** Grid / list view switcher — same tray as `tabRow`. */
  iconToggleTray: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 18,
    backgroundColor: CHAT_FILTER_TRAY_BG,
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
    flexShrink: 0,
  },
  iconToggleBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
    backgroundColor: "#ffffff",
  },
  iconToggleBtnActive: {
    borderColor: CHAT_FILTER_ACTIVE_BG,
    backgroundColor: Theme.pulseIndigoWash,
  },
});
