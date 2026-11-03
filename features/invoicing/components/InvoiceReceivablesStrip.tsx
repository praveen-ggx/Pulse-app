/**
 * Customer outstanding and aging, from confirmed invoice allocations.
 */
import Theme from "@/constants/Theme";
import { fetchCustomerReceivables } from "@/features/invoicing/services/invoicePayment.service";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

function inr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function InvoiceReceivablesStrip({
  orgId,
  clientId,
}: {
  orgId: string;
  clientId: string;
}) {
  const query = useQuery({
    queryKey: ["customer-invoice-receivables", orgId, clientId],
    queryFn: () => fetchCustomerReceivables(orgId, clientId),
  });
  const book = query.data?.receivables;
  if (query.data?.unavailable) {
    return <Text style={styles.note}>Payment tracking is not available on this database yet.</Text>;
  }
  if (query.isLoading) return <ActivityIndicator color={Theme.primary} />;
  if (!book) return null;
  const buckets = [
    ["Current", book.currentAmount],
    ["1–30", book.days1To30],
    ["31–60", book.days31To60],
    ["61–90", book.days61To90],
    ["Over 90", book.daysOver90],
  ] as const;
  return (
    <View style={styles.wrap}>
      <View style={styles.totals}>
        <Text style={styles.kicker}>Outstanding receivables</Text>
        <Text style={styles.outstanding}>{inr(book.amountOutstanding)}</Text>
        <Text style={styles.note}>
          {book.invoiceCount} issued · received {inr(book.amountReceived)}
        </Text>
      </View>
      <View style={styles.buckets}>
        {buckets.map(([label, amount]) => (
          <View key={label} style={styles.bucket}>
            <Text style={styles.bucketLabel}>{label}</Text>
            <Text style={styles.bucketValue} numberOfLines={1}>
              {inr(amount)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 10,
  },
  totals: { gap: 2 },
  kicker: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary, letterSpacing: 0.3 },
  outstanding: { fontSize: 20, fontWeight: "600", color: Theme.textPrimaryDark },
  note: { fontSize: 12, fontWeight: "400", color: Theme.textMuted },
  buckets: { flexDirection: "row", gap: 6 },
  bucket: { flex: 1, minWidth: 0 },
  bucketLabel: { fontSize: 10, fontWeight: "500", color: Theme.textSecondary },
  bucketValue: { fontSize: 11, fontWeight: "600", color: Theme.textPrimaryDark },
});
