/**
 * Pulse Invoice product tabs — Create Invoice | POD.
 * In-app router only (no document navigation).
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { ROUTES } from "@/lib/routes";
import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

const TABS = [
  { key: "create", label: "Invoice", href: ROUTES.PULSE_INVOICE },
  { key: "pod", label: "POD", href: ROUTES.PULSE_INVOICE_POD },
] as const;

export function PulseInvoiceSubTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const active =
    pathname === ROUTES.PULSE_INVOICE_POD ||
    pathname.startsWith(`${ROUTES.PULSE_INVOICE_POD}/`)
      ? "pod"
      : "create";

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => {
              if (isActive) return;
              router.replace(tab.href as never);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
            {isActive ? <View style={styles.underline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    minHeight: 44,
  },
  tab: {
    position: "relative",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 4,
    minHeight: 44,
    justifyContent: "flex-end",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  labelActive: {
    color: Theme.textPrimary,
    fontWeight: "800",
  },
  underline: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.primary,
  },
});
