/**
 * Issued invoices from public.invoices. Payment status and outstanding come from
 * the invoice payment ledger (invoice_payment_summaries); issued totals are shown
 * as issued and never recalculated here.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { IssuedInvoiceCard } from "@/features/invoicing/components/IssuedInvoiceCard";
import { useInvoiceSettlements } from "@/features/invoicing/hooks/useInvoiceSettlements";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import { issuedInvoicesForPodToggle } from "@/features/invoicing/utils/invoicePodRequired.util";
import { issuedInvoicesForClient } from "@/features/invoicing/utils/issuedInvoiceMatch.util";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

export function IssuedInvoicesPanel({
  orgId = null,
  invoices,
  podRequired,
  refreshing,
  onRefresh,
  partnerClientId,
  partnerLabel,
  onSelect,
  selectedId,
}: {
  orgId?: string | null;
  invoices: IssuedInvoiceListRow[];
  podRequired: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  partnerClientId?: string | null;
  partnerLabel?: string | null;
  onSelect?: (invoice: IssuedInvoiceListRow) => void;
  selectedId?: string | null;
}) {
  const visible = issuedInvoicesForPodToggle(invoices, podRequired);
  const rows =
    partnerClientId || partnerLabel
      ? issuedInvoicesForClient(visible, {
          clientId: partnerClientId,
          clientName: partnerLabel,
        })
      : visible;
  const settlements = useInvoiceSettlements(
    orgId,
    rows.filter((row) => row.status === "sent" || row.status === "paid").map((row) => row.id),
  );
  const settlementOf = (item: IssuedInvoiceListRow) =>
    item.status === "sent" || item.status === "paid"
      ? settlements.get(item.id) ?? (settlements.ready ? null : undefined)
      : null;

  return (
    <FlatList
      style={styles.list}
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={Theme.loaderAccent}
          />
        ) : undefined
      }
      contentContainerStyle={styles.content}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No issued invoices</Text>
          <Text style={styles.emptySub}>
            Created invoices stay here. POD Required does not hide them.
          </Text>
        </View>
      }
      renderItem={({ item }) =>
        onSelect ? (
          <Pressable
            onPress={() => onSelect(item)}
            accessibilityRole="button"
            accessibilityLabel={`Invoice ${item.invoice_number}`}
            accessibilityState={{ selected: selectedId === item.id }}
          >
            <IssuedInvoiceCard
              item={item}
              compact
              selected={selectedId === item.id}
              settlement={orgId ? settlementOf(item) : null}
            />
          </Pressable>
        ) : (
          <IssuedInvoiceCard item={item} settlement={orgId ? settlementOf(item) : null} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: Theme.screenBackground },
  content: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 32,
    flexGrow: 1,
  },
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  emptySub: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
