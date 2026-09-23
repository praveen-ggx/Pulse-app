import Theme from "@/constants/Theme";
import { resolveClientPlanInvoiceAvailability } from "@/features/invoicing/utils/clientPlanInvoice.util";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function ManualInvoiceScreen() {
  const insets = useSafeAreaInsets();
  const availability = resolveClientPlanInvoiceAvailability();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
      }}
    >
      <Text style={styles.title}>Manual Invoice</Text>
      <Text style={styles.sub}>{availability.reason}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.screenBackground },
  title: { fontSize: 22, fontWeight: "700", color: Theme.textPrimary },
  sub: { marginTop: 8, color: Theme.textSecondary, fontSize: 14, lineHeight: 20 },
});
