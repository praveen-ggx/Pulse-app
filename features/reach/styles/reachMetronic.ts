/**
 * Pulse Boost — Metronic demo2 / KeenThemes tokens + shared chrome.
 * Used by Campaign Manager (home) and Campaign detail.
 */
import Theme from "@/constants/Theme";
import { Platform, StyleSheet, type ViewStyle } from "react-native";

/** Metronic KeenThemes palette (demo2 + Reach brown CTAs). */
export const REACH_M = {
  text: "#181C32",
  muted: "#A1A5B7",
  subtle: "#78829D",
  border: "#EFF2F5",
  borderStrong: "#DBDFE9",
  canvas: "#F5F8FA",
  card: "#FFFFFF",
  quote: "#F5F8FA",
  primary: "#4D3636",
  primarySoft: "#F6F0EA",
  success: "#50CD89",
  successText: "#15803D",
  successBg: "rgba(21, 128, 61, 0.10)",
  successBorder: "rgba(21, 128, 61, 0.28)",
  link: Theme.primary,
  shadow: "0 1px 3px rgba(24, 28, 50, 0.06)",
  shadowMd: "0 4px 12px rgba(24, 28, 50, 0.06)",
} as const;

export const REACH_PAGE_MAX = 1280;
/** Alias for older bundles that still read `REACH_PAGE`. */
export const REACH_PAGE = REACH_PAGE_MAX;
export const REACH_DETAIL_PAGE_MAX = 1440;
export const REACH_DESKTOP_BP = 1024;

export const reachCardShadow = Platform.select({
  web: { boxShadow: REACH_M.shadow } as ViewStyle,
  ios: {
    shadowColor: "#181C32",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  android: { elevation: 1 },
  default: {},
});

export const reachCardShadowMd = Platform.select({
  web: { boxShadow: REACH_M.shadowMd } as ViewStyle,
  ios: {
    shadowColor: "#181C32",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: { elevation: 2 },
  default: {},
});

/** Shared Metronic surface primitives for Reach screens. */
export const reachMetronicShared = StyleSheet.create({
  pageCanvas: {
    flex: 1,
    backgroundColor: REACH_M.canvas,
  },
  headerBleed: {
    borderBottomWidth: 1,
    borderBottomColor: REACH_M.border,
    backgroundColor: REACH_M.card,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    gap: 12,
    width: "100%",
  },
  headerMax: {
    maxWidth: REACH_PAGE_MAX,
    alignSelf: "center",
    width: "100%",
  },
  headerMaxDetail: {
    maxWidth: REACH_DETAIL_PAGE_MAX,
    alignSelf: "center",
    width: "100%",
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: REACH_M.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: REACH_M.card,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: REACH_M.text,
    letterSpacing: -0.25,
  },
  brandSub: {
    fontSize: 11,
    fontWeight: "500",
    color: REACH_M.muted,
    marginTop: 1,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: REACH_M.primary,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: REACH_M.borderStrong,
    backgroundColor: REACH_M.card,
  },
  ghostBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: REACH_M.text,
  },
  card: {
    backgroundColor: REACH_M.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: REACH_M.border,
    overflow: "hidden",
    ...reachCardShadow,
  },
  cardPad: {
    padding: 16,
    gap: 14,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: REACH_M.text,
    letterSpacing: -0.15,
  },
  panelSub: {
    fontSize: 11,
    fontWeight: "500",
    color: REACH_M.muted,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: REACH_M.subtle,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  kpiCard: {
    backgroundColor: REACH_M.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: REACH_M.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    ...reachCardShadow,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: REACH_M.muted,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: "700",
    color: REACH_M.text,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.7,
  },
  kpiIconOrb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: REACH_M.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  statusLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: REACH_M.successBg,
    borderWidth: 1,
    borderColor: REACH_M.successBorder,
  },
  statusLiveText: {
    fontSize: 10,
    fontWeight: "700",
    color: REACH_M.successText,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  centerTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    justifyContent: "center",
  },
  centerTabActive: {
    borderBottomColor: REACH_M.primary,
  },
  centerTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: REACH_M.muted,
  },
  centerTabTextActive: {
    fontWeight: "700",
    color: REACH_M.text,
  },
});
