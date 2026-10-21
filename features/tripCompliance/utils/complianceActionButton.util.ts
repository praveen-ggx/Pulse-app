import Theme from "@/constants/Theme";
import { StyleSheet } from "react-native";

/** Same compact action chip as notification Decline / Assign driver. */
export const COMPLIANCE_ACTION_BTN = {
  height: 26,
  paddingHorizontal: 10,
  borderRadius: 4,
  borderWidth: 1,
  minWidth: 68,
} as const;

export const complianceActionButtonStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  ghost: {
    height: COMPLIANCE_ACTION_BTN.height,
    minHeight: COMPLIANCE_ACTION_BTN.height,
    minWidth: COMPLIANCE_ACTION_BTN.minWidth,
    paddingHorizontal: COMPLIANCE_ACTION_BTN.paddingHorizontal,
    borderRadius: COMPLIANCE_ACTION_BTN.borderRadius,
    borderWidth: COMPLIANCE_ACTION_BTN.borderWidth,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  ghostText: {
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 12,
    color: Theme.actionBtnInk,
  },
  primary: {
    height: COMPLIANCE_ACTION_BTN.height,
    minHeight: COMPLIANCE_ACTION_BTN.height,
    minWidth: COMPLIANCE_ACTION_BTN.minWidth,
    paddingHorizontal: COMPLIANCE_ACTION_BTN.paddingHorizontal,
    borderRadius: COMPLIANCE_ACTION_BTN.borderRadius,
    borderWidth: COMPLIANCE_ACTION_BTN.borderWidth,
    borderColor: Theme.actionBtnInk,
    backgroundColor: Theme.actionBtnInk,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  primaryText: {
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 12,
    color: Theme.buttonDarkText,
  },
  icon: {
    width: COMPLIANCE_ACTION_BTN.height,
    height: COMPLIANCE_ACTION_BTN.height,
    minWidth: COMPLIANCE_ACTION_BTN.height,
    paddingHorizontal: 0,
    borderRadius: COMPLIANCE_ACTION_BTN.borderRadius,
    borderWidth: COMPLIANCE_ACTION_BTN.borderWidth,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
});
