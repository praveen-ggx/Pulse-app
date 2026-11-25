/**
 * Workspace hub drawer — KeenThemes / Metronic reference tokens.
 * @see features/network/components/desktop/networkDesktopHub.styles.ts (METRONIC)
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { WEB_TOP_NAV_ICON } from "@/components/demo/webTopNavIcon.tokens";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { Platform, StyleSheet } from "react-native";

export { METRONIC };

/** Same fill as chat “Start a conversation” — subtle depth top → bottom. */
export const HUB_HEADER_GRADIENT = [CHAT_ACCENT, CHAT_ACCENT, "#3f2c2c"] as const;

export const HUB_PURPLE = Theme.brandBlueInk;
export const HUB_PURPLE_DEEP = "#9ACEEB";
export const HUB_PURPLE_VIVID = Theme.brandBluePressed;
export const HUB_PURPLE_LIGHT = Theme.primaryLight;
export const HUB_PURPLE_TINT = Theme.pulseIndigoWash;
export const HUB_PURPLE_BORDER = Theme.pulseIndigoRing;
/** Hub list / grid glyphs — match web top-nav outline utility icons. */
export const HUB_MENU_ICON = WEB_TOP_NAV_ICON.muted;
export const HUB_MENU_ICON_SIZE = WEB_TOP_NAV_ICON.size;
export const HUB_MENU_ICON_STROKE = WEB_TOP_NAV_ICON.stroke;
export const HUB_ROW_CHEVRON_SIZE = 13;

/** Tinted wells behind hub menu glyphs (aligned with workspace detail panels). */
export const HUB_ICON_WELL = {
  brand: Theme.brandBlueWashSubtle,
  brandBorder: Theme.brandBlueRing,
  indigo: "rgba(99, 102, 241, 0.12)",
  indigoBorder: "rgba(99, 102, 241, 0.22)",
  teal: "rgba(15, 118, 110, 0.12)",
  tealBorder: "rgba(15, 118, 110, 0.22)",
  amber: "rgba(217, 119, 6, 0.12)",
  amberBorder: "rgba(217, 119, 6, 0.22)",
  sky: "rgba(59, 130, 246, 0.12)",
  skyBorder: "rgba(59, 130, 246, 0.22)",
  emerald: Theme.driverEmeraldMuted,
  emeraldBorder: Theme.driverEmeraldBorderSoft,
  slate: "rgba(77, 54, 54, 0.1)",
  slateBorder: Theme.brandBlueRing,
} as const;

const HEADER_GLASS_WEB =
  Platform.OS === "web"
    ? ({
        backdropFilter: "blur(14px) saturate(180%)",
        WebkitBackdropFilter: "blur(14px) saturate(180%)",
      } as const)
    : {};

export const hubStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: METRONIC.bodyBg,
    minWidth: 0,
    position: "relative",
    overflow: "hidden",
  },

  // ── Header band (violet gradient + glass) ───────────────────────────────
  headerBand: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 18,
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 8px 24px rgba(77, 54, 54, 0.28)" as unknown as undefined,
      },
      default: {
        shadowColor: CHAT_ACCENT,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
        elevation: 8,
      },
    }),
  },
  headerGradientFill: {
    ...StyleSheet.absoluteFillObject,
  },
  headerSheen: {
    position: "absolute",
    top: -20,
    left: -10,
    right: "35%",
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.14)",
    opacity: 0.55,
    transform: [{ rotate: "-8deg" }],
  },
  headerVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  headerBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerBandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 1,
  },
  headerLogoWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...HEADER_GLASS_WEB,
    ...Platform.select({
      web: {
        boxShadow:
          "0 2px 10px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.35)" as unknown as undefined,
      },
      default: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
        elevation: 3,
      },
    }),
  },
  headerLogoImage: { width: "100%", height: "100%", borderRadius: 9 },
  headerLogoFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerLogoInitials: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.4,
  },
  headerBandText: { flex: 1, minWidth: 0, gap: 3 },
  headerEyebrow: {
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    ...HEADER_GLASS_WEB,
    ...Platform.select({
      web: {
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28)" as unknown as undefined,
      },
      default: {},
    }),
  },
  closeBtnPressed: { backgroundColor: "rgba(255,255,255,0.26)" },
  headerBandMobile: {
    paddingBottom: 14,
  },

  // ── Scroll body ────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  scrollContentMobile: {
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    flexGrow: 0,
  },

  // Quick actions (Metronic symbol cards)
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 4,
  },
  quickAction: { alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  quickCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: METRONIC.heroBg,
    borderWidth: 1,
    borderColor: METRONIC.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 8px rgba(24, 28, 50, 0.06)" as unknown as undefined,
      },
      default: {
        shadowColor: "#181C32",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  quickCircleBrand: {
    backgroundColor: METRONIC.heroBg,
    borderColor: METRONIC.border,
  },
  quickCircleEmerald: {
    backgroundColor: METRONIC.heroBg,
    borderColor: METRONIC.border,
  },
  quickAvatar: { width: "100%", height: "100%" },
  quickAvatarInitials: { fontSize: 16, fontWeight: "700", color: HUB_PURPLE },
  quickLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: METRONIC.text,
    textAlign: "center",
  },

  // Insight / promo card
  insightBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HUB_ICON_WELL.brandBorder,
    backgroundColor: HUB_ICON_WELL.brand,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  insightIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  insightTextWrap: { flex: 1, minWidth: 0, gap: 4 },
  insightTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: -0.15,
  },
  insightBody: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: METRONIC.muted,
  },

  // Section cards (Preferences / Party)
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: METRONIC.heroBg,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: "#F9F9F9",
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
  },
  sectionAccent: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: HUB_PURPLE_VIVID,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: METRONIC.border,
    minHeight: 44,
  },
  menuRowFirst: { borderTopWidth: 0 },
  menuRowPressed: { backgroundColor: METRONIC.bodyBg },
  menuRowSelected: { backgroundColor: Theme.brandBlueWashSubtle },
  menuRowIconWell: {
    width: HUB_MENU_ICON_SIZE,
    height: HUB_MENU_ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuRowPngIcon: {
    width: 22,
    height: 22,
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.text,
  },
  menuRowChevronSlot: {
    width: HUB_ROW_CHEVRON_SIZE,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Party — single row (scrolls horizontally when narrow)
  partyRowScrollContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 4,
    minWidth: "100%",
  },
  partyRowCell: {
    flex: 1,
    minWidth: 72,
    alignItems: "stretch",
  },
  partyRowChip: {
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    width: "100%",
  },
  partyRowChipPressed: {
    opacity: 0.85,
  },
  partyRowIconSlot: {
    width: HUB_MENU_ICON_SIZE,
    height: HUB_MENU_ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  partyGridLabel: {
    fontSize: 11,
    fontWeight: "400",
    color: METRONIC.muted,
    textAlign: "center",
    minHeight: 28,
    lineHeight: 14,
  },
  valuePill: {
    maxWidth: 112,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: HUB_ICON_WELL.brandBorder,
    backgroundColor: Theme.brandBlueSoft,
  },
  valuePillText: {
    fontSize: 10,
    fontWeight: "600",
    color: HUB_PURPLE,
    textAlign: "center",
  },

  // Footer
  footerWrap: { backgroundColor: METRONIC.heroBg },
  /** Mobile: footer sits in the scroll stack directly under the last section. */
  footerWrapInScroll: {
    marginTop: 4,
    marginHorizontal: -14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: METRONIC.border,
  },
  footerDivider: {
    height: 1,
    backgroundColor: METRONIC.border,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
  },
  footerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  footerAvatar: { width: 34, height: 34, borderRadius: 11 },
  footerAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: HUB_ICON_WELL.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HUB_ICON_WELL.brandBorder,
  },
  footerAvatarInitials: { fontSize: 12, fontWeight: "700", color: HUB_PURPLE },
  footerText: { flex: 1, minWidth: 0 },
  footerName: { fontSize: 12, fontWeight: "700", color: METRONIC.text },
  footerEmail: { fontSize: 10, color: METRONIC.muted, marginTop: 2 },
  signOutBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: METRONIC.bodyBg,
    borderWidth: 1,
    borderColor: METRONIC.border,
  },
  signOutBtnPressed: { backgroundColor: "rgba(232, 33, 39, 0.06)" },

  // Sign-out modal
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: METRONIC.heroBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: METRONIC.border,
    padding: 20,
    gap: 12,
  },
  confirmTitle: { fontSize: 17, fontWeight: "700", color: METRONIC.text },
  confirmBody: { fontSize: 14, color: METRONIC.muted, lineHeight: 20 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  confirmActionsStack: { gap: 10, marginTop: 4 },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: METRONIC.bodyBg,
    borderWidth: 1,
    borderColor: METRONIC.border,
    alignItems: "center",
  },
  confirmSecondaryBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: METRONIC.heroBg,
    borderWidth: 1,
    borderColor: METRONIC.border,
    alignItems: "center",
  },
  confirmSecondaryText: { fontSize: 14, fontWeight: "600", color: METRONIC.text },
  confirmCancelText: { fontSize: 14, fontWeight: "600", color: METRONIC.subtle },
  confirmCtaBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: HUB_PURPLE,
    alignItems: "center",
  },
  confirmCtaText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
