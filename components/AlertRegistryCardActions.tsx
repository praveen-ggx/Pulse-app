/**
 * Notification card footer actions — split from signal card to avoid circular imports.
 */
import React from "react";
import Theme from "@/constants/Theme";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

const METRONIC = {
  primaryBtn: Theme.actionBtnInk,
  ghostBorder: Theme.actionBtnGhostBorder,
} as const;

const BTN = {
  height: 26,
  paddingHorizontal: 10,
  borderRadius: 4,
  borderWidth: 1,
  minWidth: 68,
} as const;

const FOOTER_BTN = {
  minHeight: 42,
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 10,
  borderWidth: 1,
  minWidth: 88,
} as const;

export const alertRegistryActionStyles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  actionsCompact: {
    width: "100%",
    justifyContent: "space-between",
    gap: 6,
  },
  ghostBtn: {
    height: BTN.height,
    minWidth: BTN.minWidth,
    paddingHorizontal: BTN.paddingHorizontal,
    borderRadius: BTN.borderRadius,
    borderWidth: BTN.borderWidth,
    borderColor: METRONIC.ghostBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.primaryBtn,
  },
  primaryBtn: {
    height: BTN.height,
    minWidth: BTN.minWidth,
    paddingHorizontal: BTN.paddingHorizontal,
    borderRadius: BTN.borderRadius,
    borderWidth: BTN.borderWidth,
    borderColor: METRONIC.primaryBtn,
    backgroundColor: METRONIC.primaryBtn,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.buttonDarkText,
  },
  ghostBtnCompact: {
    minHeight: 30,
    height: 30,
    minWidth: 0,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  primaryBtnCompact: {
    minHeight: 30,
    height: 30,
    minWidth: 0,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  ghostBtnTextCompact: {
    fontSize: 10,
  },
  primaryBtnTextCompact: {
    fontSize: 10,
  },
  btnCompactFlex: {
    flex: 1,
  },
  viewBtn: {
    height: BTN.height,
    minWidth: BTN.minWidth,
    paddingHorizontal: BTN.paddingHorizontal,
    borderRadius: BTN.borderRadius,
    borderWidth: BTN.borderWidth,
    borderColor: METRONIC.ghostBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  viewBtnText: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.primaryBtn,
  },
  statusPill: {
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusPillText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  footerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingTop: 10,
  },
  footerGhostBtn: {
    minHeight: FOOTER_BTN.minHeight,
    minWidth: FOOTER_BTN.minWidth,
    paddingHorizontal: FOOTER_BTN.paddingHorizontal,
    paddingVertical: FOOTER_BTN.paddingVertical,
    borderRadius: FOOTER_BTN.borderRadius,
    borderWidth: FOOTER_BTN.borderWidth,
    borderColor: METRONIC.ghostBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  footerGhostBtnText: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.primaryBtn,
  },
  footerPrimaryBtn: {
    flex: 1,
    minHeight: FOOTER_BTN.minHeight,
    paddingHorizontal: FOOTER_BTN.paddingHorizontal,
    paddingVertical: FOOTER_BTN.paddingVertical,
    borderRadius: FOOTER_BTN.borderRadius,
    borderWidth: FOOTER_BTN.borderWidth,
    borderColor: METRONIC.primaryBtn,
    backgroundColor: METRONIC.primaryBtn,
    alignItems: "center",
    justifyContent: "center",
  },
  footerPrimaryBtnText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.buttonDarkText,
  },
  footerTertiaryBtn: {
    minHeight: FOOTER_BTN.minHeight,
    paddingHorizontal: FOOTER_BTN.paddingHorizontal,
    paddingVertical: FOOTER_BTN.paddingVertical,
    borderRadius: FOOTER_BTN.borderRadius,
    borderWidth: FOOTER_BTN.borderWidth,
    borderColor: METRONIC.ghostBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  footerTertiaryBtnText: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.primaryBtn,
  },
  footerSummary: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 15,
    marginBottom: 4,
  },
  footerHint: {
    color: Theme.textMuted,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 6,
  },
});

export function RegistryCardActions({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        alertRegistryActionStyles.actions,
        compact && alertRegistryActionStyles.actionsCompact,
      ]}
    >
      {children}
    </View>
  );
}

export function RegistryGhostButton({
  label,
  onPress,
  disabled,
  style,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        alertRegistryActionStyles.ghostBtn,
        compact && alertRegistryActionStyles.ghostBtnCompact,
        disabled && alertRegistryActionStyles.btnDisabled,
        compact && alertRegistryActionStyles.btnCompactFlex,
        style,
      ]}
      accessibilityRole="button"
    >
      <Text
        style={[
          alertRegistryActionStyles.ghostBtnText,
          compact && alertRegistryActionStyles.ghostBtnTextCompact,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function RegistryPrimaryButton({
  label,
  onPress,
  disabled,
  compact = false,
  backgroundColor,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  /** Override default navy fill — e.g. chat accent on ledger audit actions. */
  backgroundColor?: string;
}) {
  const accentStyle =
    backgroundColor != null
      ? { backgroundColor, borderColor: backgroundColor }
      : null;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        alertRegistryActionStyles.primaryBtn,
        accentStyle,
        compact && alertRegistryActionStyles.primaryBtnCompact,
        disabled && alertRegistryActionStyles.btnDisabled,
        compact && alertRegistryActionStyles.btnCompactFlex,
      ]}
      accessibilityRole="button"
    >
      <Text
        style={[
          alertRegistryActionStyles.primaryBtnText,
          compact && alertRegistryActionStyles.primaryBtnTextCompact,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
