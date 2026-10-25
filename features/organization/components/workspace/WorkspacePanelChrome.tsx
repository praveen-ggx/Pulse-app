/**
 * White-surface detail header used by every workspace detail panel.
 * Layout matches the reference: circular back chip + bold title + small
 * uppercase eyebrow subtitle + optional right slot for chips/actions.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightSlot?: React.ReactNode;
  /** When false, skip status-bar inset (parent already applied it). */
  includeSafeArea?: boolean;
};

export function WorkspacePanelChrome({
  title,
  subtitle,
  onBack,
  rightSlot,
  includeSafeArea = true,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: (includeSafeArea ? insets.top : 0) + 10 }]}>
      <View style={styles.bar}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to workspace menu"
        >
          <ArrowLeft size={16} color={Theme.textPrimaryDark} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.rightSlot}>{rightSlot}</View>
      </View>
    </View>
  );
}

/**
 * Detail-pane chrome matches the hub-menu density (see WorkspaceHubMenu).
 * Title drops to 17 / weight 800 / letter -0.3 to peer with the hub's
 * `navyTitle`; back chip drops to 34 px (was 42) so it lines up with
 * the hub's `menuRowIcon`. Eyebrow drops to 9 / 1.4 to match the hub
 * eyebrow + section header scale. These three values are the spine
 * of every workspace detail header (Settings, Team, KYC, Account,
 * Account Edit) so the entire panel family stays visually consistent.
 */
const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 12,
    minHeight: 50,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPressed: {
    backgroundColor: Theme.surfaceGray,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  rightSlot: {
    minWidth: 34,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
