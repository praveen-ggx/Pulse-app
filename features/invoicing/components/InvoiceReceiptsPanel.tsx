/**
 * Customer receipts for the selected client, in the invoice workspace table.
 */
import Theme from "@/constants/Theme";
import { InvoiceArPanel } from "@/features/invoicing/components/InvoiceArPanel";
import { fetchCustomerReceipts } from "@/features/invoicing/services/customerReceiptList.service";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import type { CustomerReceipt } from "@/features/invoicing/utils/customerReceiptList.util";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function InvoiceReceiptsPanel({
  orgId,
  clientId,
  clientName,
  trips = [],
  invoices = [],
  onRecorded,
  onTripsChanged,
}: {
  orgId: string | null;
  clientId: string | null;
  clientName: string | null;
  trips?: readonly InvoicingTripView[];
  invoices?: readonly IssuedInvoiceListRow[];
  onRecorded?: () => void;
  onTripsChanged?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["customer-receipts", orgId, clientId, clientName],
    queryFn: () =>
      fetchCustomerReceipts({
        orgId: orgId!,
        clientId,
        clientName,
      }),
    enabled: Boolean(orgId && clientName),
  });
  if (!clientName) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Select a client</Text>
        <Text style={styles.emptyBody}>Receipts for the client on the left are listed here.</Text>
      </View>
    );
  }
  const receipts = query.data?.receipts ?? [];
  const selected = receipts.find((receipt) => receipt.id === selectedId) ?? receipts[0] ?? null;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text style={styles.title}>Receipts</Text>
          <Text style={styles.hint}>
            {receipts.length} receipt{receipts.length === 1 ? "" : "s"}
            {selected ? ` · ${inr(receipts.reduce((sum, receipt) => sum + receipt.bank, 0))} received` : ""}
          </Text>
        </View>
        <InvoiceArPanel
          captureOnly
          orgId={orgId}
          clientId={clientId}
          clientName={clientName}
          trips={trips}
          invoices={invoices}
          onRecorded={() => {
            void query.refetch();
            onRecorded?.();
          }}
          onTripsChanged={onTripsChanged}
        />
      </View>
      {query.isLoading ? <ActivityIndicator color={Theme.primary} /> : null}
      {query.data?.error ? <Text style={styles.error}>{query.data.error}</Text> : null}
      {!query.isLoading && receipts.length === 0 ? (
        <Text style={styles.hint}>No receipts yet. Capture a payment to record one.</Text>
      ) : null}
      {receipts.length > 0 ? (
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, styles.colDate]}>Date</Text>
            <Text style={[styles.th, styles.colRef]}>Reference</Text>
            <Text style={[styles.th, styles.colInvoice]}>Invoice</Text>
            <Text style={[styles.th, styles.colMoney]}>Bank</Text>
            <Text style={[styles.th, styles.colMoney]}>TDS</Text>
            <Text style={[styles.th, styles.colMoney]}>Total</Text>
          </View>
          {receipts.map((receipt, index) => {
            const on = selected?.id === receipt.id;
            return (
              <Pressable
                key={receipt.id}
                style={[styles.tr, index % 2 === 1 && styles.trAlt, on && styles.trOn]}
                onPress={() => setSelectedId(receipt.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Receipt ${receipt.reference || receipt.invoiceNumber || receipt.date}`}
              >
                <Text style={[styles.td, styles.colDate]} numberOfLines={1}>{receipt.date}</Text>
                <Text style={[styles.td, styles.colRef]} numberOfLines={1}>{receipt.reference || "—"}</Text>
                <Text style={[styles.tdStrong, styles.colInvoice]} numberOfLines={1}>{receipt.invoiceNumber || "—"}</Text>
                <Text style={[styles.tdNum, styles.colMoney]}>{inr(receipt.bank)}</Text>
                <Text style={[styles.tdNum, styles.colMoney]}>{inr(receipt.tds)}</Text>
                <Text style={[styles.tdNum, styles.colMoney]}>{inr(receipt.total)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {selected ? <ReceiptDetail receipt={selected} /> : null}
    </ScrollView>
  );
}

function ReceiptDetail({ receipt }: { receipt: CustomerReceipt }) {
  return (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <Text style={styles.title}>{receipt.invoiceNumber || "Receipt"}</Text>
        <Text style={styles.hint}>
          {receipt.date}
          {receipt.reference ? ` · ${receipt.reference}` : ""}
        </Text>
      </View>
      <View style={styles.facts}>
        <Text style={styles.fact}>Bank {inr(receipt.bank)}</Text>
        <Text style={styles.fact}>TDS {inr(receipt.tds)}</Text>
        <Text style={styles.fact}>Clears {inr(receipt.total)}</Text>
      </View>
      <View style={styles.tripHead}>
        <Text style={[styles.tripHeadText, styles.tripName]}>Trip</Text>
        <Text style={[styles.tripHeadText, styles.tripMeta]}>TDS</Text>
        <Text style={[styles.tripHeadText, styles.tripMeta]}>Receivable</Text>
      </View>
      {receipt.trips.map((trip) => (
        <View key={`${trip.tripId ?? "customer"}-${trip.label}`} style={styles.tripRow}>
          <Text style={styles.tripName} numberOfLines={1}>{trip.label}</Text>
          <Text style={styles.tripMeta}>{inr(trip.tds)}</Text>
          <Text style={styles.tripMeta}>{inr(trip.bank)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Theme.surface },
  pageContent: { padding: 16, paddingBottom: 28, gap: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: "500", color: Theme.textPrimaryDark },
  emptyBody: { fontSize: 12, fontWeight: "400", color: Theme.textMuted, textAlign: "center", maxWidth: 360 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, fontWeight: "500", color: Theme.textPrimaryDark },
  hint: { fontSize: 12, fontWeight: "400", color: Theme.textMuted },
  error: { fontSize: 12, fontWeight: "400", color: Theme.teslaRed },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  trHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Theme.primary,
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
  },
  trAlt: { backgroundColor: Theme.surface },
  trOn: { backgroundColor: Theme.brandBlueWashSubtle },
  th: { fontSize: 10, fontWeight: "500", letterSpacing: 0.4, color: Theme.buttonDarkText },
  td: { fontSize: 12, fontWeight: "400", color: Theme.textPrimaryDark },
  tdStrong: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  tdNum: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  colDate: { width: 108 },
  colRef: { width: 120 },
  colInvoice: { flex: 1, minWidth: 0 },
  colMoney: { width: 96, textAlign: "right" },
  detail: {
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
    gap: 10,
  },
  detailHead: { gap: 2 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  fact: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  tripHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  tripHeadText: { fontSize: 10, fontWeight: "500", color: Theme.textMuted },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
  },
  tripName: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  tripMeta: { width: 110, textAlign: "right", fontSize: 12, fontWeight: "400", color: Theme.textPrimaryDark },
});
