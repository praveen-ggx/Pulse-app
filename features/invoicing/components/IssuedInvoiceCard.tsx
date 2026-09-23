/**
 * Single issued-invoice row card (Pending Billing side rail + Issued tab).
 */
import Theme from "@/constants/Theme";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import { financeInvoiceHistoryFields } from "@/features/invoicing/utils/invoiceSource.util";
import { StyleSheet, Text, View } from "react-native";

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function IssuedInvoiceCard({
  item,
  compact,
  selected,
}: {
  item: IssuedInvoiceListRow;
  /** Tighter padding for the Pending Billing side rail. */
  compact?: boolean;
  selected?: boolean;
}) {
  const source = financeInvoiceHistoryFields({
    invoice_source: item.invoice_source,
    sales_order_number: item.sales_order_number,
    trip_ids: item.trip_ids,
  });
  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        selected && styles.cardSelected,
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.number} numberOfLines={1}>
          {item.invoice_number || "—"}
        </Text>
        <Text style={styles.status} numberOfLines={1}>
          {item.status}
        </Text>
      </View>
      <Text style={styles.client} numberOfLines={1}>
        {item.client_name || "—"}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>Date {item.invoice_date || "—"}</Text>
        <Text style={styles.meta}>Due {item.due_date || "—"}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.total}>{formatInr(item.total_amount)}</Text>
        <Text style={styles.meta}>
          {source.source} · {source.reference}
        </Text>
      </View>
      <Text style={styles.unsupported}>
        Invoice-level payment / allocation is not supported on this surface.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    padding: 12,
    marginBottom: 10,
  },
  cardCompact: {
    padding: 10,
    marginBottom: 6,
    borderRadius: 6,
    borderColor: Theme.borderMedium,
  },
  cardSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  number: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: -0.1,
  },
  status: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  client: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  metaRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  meta: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
  total: { fontSize: 14, fontWeight: "800", color: Theme.textPrimary },
  unsupported: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 14,
  },
});
