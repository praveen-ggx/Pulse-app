/**
 * Single issued-invoice row card (Pending Billing side rail).
 */
import Theme from "@/constants/Theme";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import { FileText } from "lucide-react-native";
import { financeInvoiceHistoryFields } from "@/features/invoicing/utils/invoiceSource.util";
import type { InvoiceSettlement } from "@/features/invoicing/hooks/useInvoiceSettlements";
import { paymentStatusLabel, type InvoicePaymentStatus } from "@/features/invoicing/utils/invoicePayment.util";
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
  settlement,
}: {
  item: IssuedInvoiceListRow;
  /**
   * From the invoice payment ledger. undefined = still loading / unavailable
   * (shown as unavailable, never as ₹0); null = not applicable (draft/cancelled).
   */
  settlement?: InvoiceSettlement | null;
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
    <View style={[styles.card, compact && styles.cardCompact, selected && styles.cardSelected]}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <FileText size={14} color={Theme.darkGreen} strokeWidth={2.25} />
        </View>
        <View style={styles.main}>
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
            <Text style={styles.meta} numberOfLines={1}>
              {item.invoice_date || "—"}
            </Text>
            <Text style={styles.total} numberOfLines={1}>
              {formatInr(item.total_amount)}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta} numberOfLines={1}>
              Due {item.due_date || "—"}
            </Text>
            <Text style={styles.meta}>
              {item.trip_ids.length} trip
              {item.trip_ids.length === 1 ? "" : "s"}
            </Text>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {source.source} · {source.reference}
          </Text>
          {settlement === undefined ? (
            <Text style={styles.meta} numberOfLines={1}>Payment status unavailable</Text>
          ) : settlement ? (
            <View style={styles.metaRow}>
              <Text
                style={[styles.meta, settlement.outstanding > 0 ? styles.payOpen : styles.payDone]}
                numberOfLines={1}
              >
                {paymentStatusLabel(settlement.status as InvoicePaymentStatus)}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                Outstanding {formatInr(settlement.outstanding)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    padding: 12,
    marginBottom: 8,
  },
  cardCompact: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 6,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.positiveMuted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  main: {
    flex: 1,
    minWidth: 0,
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
    color: Theme.textPrimaryDark,
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
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  meta: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  total: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.teslaRed,
  },
  payOpen: { color: Theme.warning },
  payDone: { color: Theme.success },
});
