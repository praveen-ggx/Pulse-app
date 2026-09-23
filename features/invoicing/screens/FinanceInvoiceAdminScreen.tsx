import Theme from "@/constants/Theme";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { IssuedInvoiceCard } from "@/features/invoicing/components/IssuedInvoiceCard";
import {
  useDraftInvoicesQuery,
  useIssuedInvoicesQuery,
} from "@/lib/queries/useInvoicingExecuteQueries";
import { ROUTES } from "@/lib/routes";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AdminTab = "issued" | "drafts";

export function FinanceInvoiceAdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentOrganization, isLoading: orgLoading } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const [tab, setTab] = useState<AdminTab>("issued");
  const issuedQ = useIssuedInvoicesQuery(orgId);
  const draftsQ = useDraftInvoicesQuery(orgId);

  if (orgLoading || !orgId) {
    return <CenteredLoadingView />;
  }

  const rows = tab === "issued" ? (issuedQ.data ?? []) : (draftsQ.data ?? []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Invoices</Text>
      <Text style={styles.sub}>
        Invoice history for this workspace. New billing starts from a Fulfilled
        Commerce order. Manual Invoice stays blocked until a Client Plan exists.
        Historical trip invoices remain readable.
      </Text>
      <View style={styles.actions}>
        <Pressable
          style={styles.primary}
          onPress={() => router.push(ROUTES.INVOICING_MANUAL as never)}
          accessibilityRole="button"
          accessibilityLabel="Create Manual Invoice"
        >
          <Text style={styles.primaryText}>Create Manual Invoice</Text>
        </Pressable>
      </View>
      <View style={styles.tabs}>
        {(["issued", "drafts"] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>
              {key === "issued" ? "Issued" : "Drafts"}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>
            {tab === "issued"
              ? "No issued invoices yet."
              : "No drafts. Open a fulfilled Commerce order to create one."}
          </Text>
        ) : (
          rows.map((item) => <IssuedInvoiceCard key={item.id} item={item} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.screenBackground, paddingHorizontal: 16 },
  title: { fontSize: 22, fontWeight: "700", color: Theme.textPrimary },
  sub: { marginTop: 6, fontSize: 13, color: Theme.textSecondary, lineHeight: 18 },
  actions: { marginTop: 16, flexDirection: "row", gap: 8 },
  primary: {
    backgroundColor: Theme.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  primaryText: { color: Theme.textOnPrimary, fontWeight: "600", fontSize: 14 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 18, marginBottom: 8 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  tabOn: { backgroundColor: Theme.brandBlueWashSubtle, borderColor: Theme.primary },
  tabText: { fontSize: 13, color: Theme.textSecondary },
  tabTextOn: { color: Theme.textPrimary, fontWeight: "600" },
  empty: { marginTop: 24, color: Theme.textMuted, fontSize: 13 },
});
