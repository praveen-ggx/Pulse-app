/**
 * Shared “assignment / allocation” modal shell — Staff Handshake, trip driver-vehicle picker, etc.
 * One visual language with TripAssignmentBlock (slate backdrop, white or slate card, step labels).
 */
import Theme from "@/constants/Theme";
import {
  pulsePillButtonContainerOutlineDefault,
  pulsePillButtonLabelDefault,
} from "@/constants/PulsePillButtonChrome";
import { Platform, StyleSheet } from "react-native";

export const assignmentShellColors = {
  backdrop: "rgba(45, 55, 72, 0.62)",
  borderSlate: "#e2e8f0",
  title: "#0f172a",
  subtitle: "#64748b",
  stepMuted: "#94a3b8",
  iconTileBg: "#edf2f7",
  closeBg: "#f1f5f9",
  cardWhite: "#ffffff",
  cardSlateBody: "#f8fafc",
} as const;

export const assignmentShellStyles = StyleSheet.create({
  webModalBackdrop: {
    flex: 1,
    backgroundColor: assignmentShellColors.backdrop,
    padding: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  webModalBackdropTap: {
    ...StyleSheet.absoluteFillObject,
  },

  /** Mobile assignment — edge-to-edge page, not a centered card. */
  webModalBackdropFullPage: {
    flex: 1,
    padding: 0,
    justifyContent: "flex-start",
    alignItems: "stretch",
    backgroundColor: Theme.assignmentPageBg,
  },
  assignModalWrapFullPage: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
    minHeight: 0,
    alignSelf: "stretch",
    backgroundColor: Theme.assignmentPageBg,
  },

  /** Change-driver / assign — notification-sized centered popup. */
  assignModalWrapPopup: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "88%",
    borderRadius: 16,
    overflow: "hidden",
    alignSelf: "center",
    backgroundColor: assignmentShellColors.cardWhite,
    flexDirection: "column",
    ...Platform.select({
      web: {
        boxShadow: "0 16px 48px rgba(24, 28, 50, 0.16)",
      } as object,
      default: {},
    }),
  },

  /** Trip picker modal body (slate) — matches TripAssignmentBlock assignModalWrap */
  assignModalWrapSlate: {
    flex: Platform.OS === "web" ? 0 : 1,
    flexDirection: "column",
    backgroundColor: assignmentShellColors.cardSlateBody,
    overflow: "hidden",
    ...Platform.select({
      web: {
        width: "100%",
        maxWidth: 760,
        maxHeight: "86%",
        minHeight: 420,
      } as object,
    }),
  },

  /** Staff Handshake / white reference modal */
  webModalCardWhite: {
    width: "100%",
    maxWidth: 760,
    backgroundColor: assignmentShellColors.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.2)",
        height: "85vh",
        minHeight: 420,
      } as object,
      default: {
        flex: 1,
        minHeight: 0,
      },
    }),
  },

  modalHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: assignmentShellColors.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: assignmentShellColors.borderSlate,
    gap: 12,
    width: "100%",
    alignSelf: "stretch",
    flexShrink: 0,
    flexWrap: "nowrap",
  },
  modalHeroText: { flex: 1, flexGrow: 1, minWidth: 0 },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: assignmentShellColors.title,
    letterSpacing: -0.35,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: assignmentShellColors.subtitle,
    marginTop: 6,
    lineHeight: 18,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    backgroundColor: assignmentShellColors.closeBg,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },

  modalBodyFlex: {
    flex: 1,
    minHeight: 0,
    backgroundColor: assignmentShellColors.cardWhite,
  },

  bodyScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: assignmentShellColors.cardWhite,
  },

  /** Matches TripAssignmentBlock assignStepLabel */
  stepLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: assignmentShellColors.stepMuted,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 2,
  },

  flowRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  flowRowStack: {
    flexDirection: "column",
    gap: 12,
  },

  choiceCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: assignmentShellColors.cardWhite,
    gap: 12,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
      } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  choiceIconWrap: {
    width: 40,
    height: 40,
    backgroundColor: assignmentShellColors.iconTileBg,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: assignmentShellColors.title,
    letterSpacing: -0.15,
  },
  choiceSub: {
    fontSize: 11,
    fontWeight: "500",
    color: assignmentShellColors.subtitle,
    marginTop: 2,
    lineHeight: 15,
  },
  choiceChevron: { marginLeft: 4, opacity: 0.55 },

  modalFooterBar: {
    borderTopWidth: 1,
    borderTopColor: assignmentShellColors.borderSlate,
    backgroundColor: assignmentShellColors.cardWhite,
    paddingHorizontal: 20,
    paddingTop: 12,
    zIndex: 2,
    elevation: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },

  /** Back pill — light surface + primary text (reference) */
  wizardBackPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#e0f2fe",
    marginBottom: 16,
  },
  wizardBackText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  /** Aggregate “Current node” outer card — white on white modal */
  tripAssignSurfaceCard: {
    backgroundColor: assignmentShellColors.cardWhite,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
      } as object,
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  inputWell: {
    backgroundColor: "#f3f4f6",
  },

  /** Asset | Aggregate mode bar (trip create + Staff Handshake). */
  supplySegmentSection: {
    alignItems: "center",
    marginBottom: 16,
    width: "100%",
  },
  supplySegmentPill: {
    flexDirection: "row",
    backgroundColor: assignmentShellColors.title,
    padding: 4,
    gap: 4,
    ...Platform.select({
      web: { boxShadow: "0 4px 12px rgba(0,0,0,0.15)" } as object,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },
  supplySegBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  supplySegBtnActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
    ...Platform.select({
      web: { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)" } as object,
    }),
  },
  supplySegBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: assignmentShellColors.stepMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  supplySegBtnTextActive: {
    color: Theme.buttonPrimaryText,
  },

  supplyAssignLaterOuter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: assignmentShellColors.cardWhite,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    width: "100%",
    ...Platform.select({
      web: { boxShadow: "0 1px 2px rgba(15,23,42,0.06)" } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  supplyAssignLaterOuterCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  supplyAssignLaterLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  supplyAssignLaterIconWrap: {
    width: 40,
    height: 40,
    backgroundColor: assignmentShellColors.iconTileBg,
    alignItems: "center",
    justifyContent: "center",
  },
  supplyAssignLaterTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e293b",
  },
  supplyAssignLaterSub: {
    fontSize: 10,
    fontWeight: "500",
    color: assignmentShellColors.stepMuted,
    marginTop: 2,
  },

  assignSelectionGrid: {
    gap: 12,
    marginBottom: 14,
  },
  assignSelectionGridDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16,
  },
  assignPickerCard: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    backgroundColor: assignmentShellColors.cardWhite,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)" } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  assignPickerCardError: {
    backgroundColor: "rgba(254, 242, 242, 0.35)",
  },
  assignPickerHeader: {
    marginBottom: 10,
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: assignmentShellColors.borderSlate,
  },
  assignPickerHeaderTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
  },
  assignPickerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "800",
    color: assignmentShellColors.subtitle,
    letterSpacing: 0.85,
    textTransform: "uppercase",
    lineHeight: 14,
  },
  assignPickerCountBadge: {
    flexShrink: 0,
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: assignmentShellColors.cardSlateBody,
  },
  assignPickerCountText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primary,
    fontVariant: ["tabular-nums"],
  },
  assignPickerHeaderAction: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(79, 70, 229, 0.06)",
  },
  assignPickerHeaderActionPressed: {
    opacity: 0.88,
    backgroundColor: "rgba(79, 70, 229, 0.1)",
  },
  assignPickerHeaderActionText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  assignEntityList: {
    gap: 6,
    paddingTop: 2,
    paddingBottom: 2,
  },
  assignEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: assignmentShellColors.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 54,
    marginBottom: 0,
    gap: 10,
    overflow: "hidden",
    position: "relative",
  },
  assignEntityRowActive: {
    backgroundColor: "rgba(79, 70, 229, 0.04)",
  },
  assignEntityRowPressed: {
    opacity: 0.92,
  },
  assignEntityRowDisabled: {
    opacity: 0.5,
  },
  assignEntityActiveBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: Theme.buttonPrimary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  assignEntityIconWrap: {
    width: 36,
    height: 36,
    backgroundColor: assignmentShellColors.iconTileBg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  assignEntityTextCol: {
    flex: 1,
    minWidth: 0,
  },
  assignEntityTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: assignmentShellColors.title,
    letterSpacing: -0.15,
  },
  assignEntityTitleActive: {
    color: Theme.primary,
  },
  assignEntitySubtitle: {
    fontSize: 10,
    fontWeight: "500",
    color: assignmentShellColors.subtitle,
    marginTop: 2,
    lineHeight: 14,
  },
  assignEmptyState: {
    marginTop: 2,
    gap: 10,
  },
  assignEmptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: assignmentShellColors.subtitle,
    lineHeight: 18,
  },
  assignEmptyActionBtn: {
    ...pulsePillButtonContainerOutlineDefault,
    minHeight: 44,
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 14,
  },
  assignEmptyActionBtnText: {
    ...pulsePillButtonLabelDefault,
    fontSize: 12,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  supplyFooterHint: {
    fontSize: 11,
    fontWeight: "500",
    color: assignmentShellColors.subtitle,
    textAlign: "left",
    marginTop: 10,
    lineHeight: 15,
    paddingHorizontal: 2,
  },
});
