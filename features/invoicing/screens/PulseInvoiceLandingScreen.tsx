/**
 * Pulse Invoice product landing — workspace entry only.
 * Zero data fetch. Does not query billing tables.
 * CTA is navigation-only (no entitlements, no invoice APIs).
 * Product chrome (brand / profile) comes from PulseProductShell.
 */
import { PulsePillButton } from "@/components/PulsePillButton";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { ROUTES } from "@/lib/routes";
import { parseSafeReturnTo, withReturnTo } from "@/features/finance-pro/components/financeProReturnTo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export function PulseInvoiceLandingScreen() {
  const router = useRouter();
  const returnTo = parseSafeReturnTo(useLocalSearchParams().returnTo);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.tagline}>Pulse billing.</Text>
        <Text style={styles.body}>
          Commerce Orders own Create Invoice (one Fulfilled order → one
          invoice). Finance Pro invoices trips and typed Manual Invoices
          against a client. All three share the same draft, tax, preview,
          and PDF engine.
        </Text>
        <PulsePillButton
          label="Finance Pro invoices"
          accessibilityLabel="Open Finance Pro invoice workspace"
          fullWidth
          onPress={() =>
            router.push(
              returnTo
                ? withReturnTo(ROUTES.INVOICING_EXECUTE, returnTo)
                : ROUTES.INVOICING_EXECUTE,
            )
          }
          style={styles.cta}
        />
        <PulsePillButton
          label="Create Manual Invoice"
          accessibilityLabel="Create Manual Invoice"
          fullWidth
          onPress={() =>
            router.push(
              returnTo
                ? withReturnTo(ROUTES.INVOICING_EXECUTE, returnTo)
                : ROUTES.INVOICING_EXECUTE,
            )
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Layout.spacingExtraLarge,
    backgroundColor: Theme.screenBackground,
  },
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    padding: Layout.spacingExtraLarge,
    gap: Layout.spacingMedium,
    maxWidth: 560,
  },
  tagline: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimary,
    lineHeight: 22,
  },
  body: {
    fontSize: 14,
    color: Theme.textSecondary,
    lineHeight: 20,
  },
  cta: {
    marginTop: Layout.spacingSmall,
  },
});
