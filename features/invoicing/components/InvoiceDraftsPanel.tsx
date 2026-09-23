import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import { financeInvoiceHistoryFields } from "@/features/invoicing/utils/invoiceSource.util";
import { issuedInvoicesForClient } from "@/features/invoicing/utils/issuedInvoiceMatch.util";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatWhen(raw?: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InvoiceDraftsPanel({
  drafts,
  partnerClientId,
  partnerLabel,
  onResume,
  onCancel,
}: {
  drafts: IssuedInvoiceListRow[];
  partnerClientId?: string | null;
  partnerLabel?: string | null;
  onResume: (draft: IssuedInvoiceListRow) => void;
  onCancel: (draft: IssuedInvoiceListRow) => void;
}) {
  const rows =
    partnerClientId || partnerLabel
      ? issuedInvoicesForClient(drafts, {
          clientId: partnerClientId,
          clientName: partnerLabel,
        })
      : drafts;

  return (
    <FlatList
      style={styles.list}
      data={rows}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No drafts</Text>
          <Text style={styles.emptySub}>
            Create Invoice saves a draft that reserves trips until you issue or
            cancel it.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card} accessibilityLabel={`Draft ${item.invoice_number}`}>
          <Text style={styles.number} numberOfLines={1}>
            {item.invoice_number}
          </Text>
          <Text style={styles.meta}>
            {(() => {
              const history = financeInvoiceHistoryFields({
                invoice_source: item.invoice_source,
                sales_order_number: item.sales_order_number,
                trip_ids: item.trip_ids,
              });
              return `${history.source} · ${history.reference} · ${formatInr(item.total_amount)}`;
            })()}
          </Text>
          <Text style={styles.meta}>
            Updated {formatWhen(item.updated_at || item.created_at)}
          </Text>
          <Text style={styles.status}>Draft</Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.primary}
              onPress={() => onResume(item)}
              accessibilityRole="button"
              accessibilityLabel="Resume draft"
            >
              <Text style={styles.primaryText}>Open</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => onCancel(item)}
              accessibilityRole="button"
              accessibilityLabel="Cancel draft"
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
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
  card: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  number: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  status: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  primary: {
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  primaryText: {
    color: Theme.buttonPrimaryText,
    fontWeight: "800",
    fontSize: 13,
  },
  secondary: {
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  secondaryText: {
    color: Theme.textPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
});
