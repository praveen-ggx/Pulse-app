/**
 * Full-screen notice for a Ground Ops member with no warehouse assigned —
 * their trip lists are empty by design, so tell them who can fix it.
 */
import Theme from "@/constants/Theme";
import { Warehouse } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function GroundOpsWarehouseNotice({ sourcing = false }: { sourcing?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <View style={styles.icon}>
        <Warehouse size={26} color={Theme.textPrimary} strokeWidth={2} />
      </View>
      <Text style={styles.title}>
        {sourcing ? "No client or warehouse assigned" : "No warehouse assigned"}
      </Text>
      <Text style={styles.body}>
        {sourcing
          ? "You see indents and trips only for the clients and warehouses assigned to you. Ask your admin to assign them."
          : "You see trips only for the warehouses assigned to you. Ask your admin to assign your warehouse."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceBorder,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimary,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
    textAlign: "center",
    maxWidth: 360,
  },
});
