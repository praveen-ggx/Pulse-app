/**
 * One payment allocated across the customer's open invoices.
 * Unallocated remainder is whatever is not entered against an invoice.
 */
import Theme from "@/constants/Theme";
import { recordInvoicePayment } from "@/features/invoicing/services/invoicePayment.service";
import { parseInrAmount } from "@/features/invoicing/utils/invoicePayment.util";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export function InvoiceSplitPaymentForm({
  orgId,
  clientId,
  invoices,
  canRecord,
}: {
  orgId: string;
  clientId: string;
  canRecord: boolean;
  invoices: { id: string; invoiceNumber: string; outstanding: number }[];
}) {
  const queryClient = useQueryClient();
  const [amountText, setAmountText] = useState("");
  const [reference, setReference] = useState("");
  const [shares, setShares] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  if (!canRecord || invoices.length === 0) return null;
  const open = invoices.filter((row) => row.outstanding > 0).slice(0, 8);
  if (open.length === 0) return null;

  async function onRecord() {
    const amount = parseInrAmount(amountText);
    if (!amount) {
      setError("Enter the payment amount");
      return;
    }
    const allocations = open
      .map((row) => ({ invoiceId: row.id, amount: parseInrAmount(shares[row.id] ?? "") }))
      .filter((row): row is { invoiceId: string; amount: number } => row.amount != null);
    const allocated = allocations.reduce((sum, row) => sum + row.amount, 0);
    if (allocated - amount > 0.001) {
      setError("allocation exceeds payment balance");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await recordInvoicePayment({
      orgId,
      clientId,
      paymentDate: new Date().toISOString().slice(0, 10),
      amount,
      paymentMode: "neft",
      transactionReference: reference,
      depositAccountLabel: "",
      notes: "",
      idempotencyKey,
      allocations,
    });
    setBusy(false);
    if (result.error || !result.payment) {
      setError(result.error ?? "Payment request failed");
      return;
    }
    setNote(
      `Recorded ${result.payment.amount.toFixed(2)}. Unallocated ${result.payment.unallocated.toFixed(2)}.`,
    );
    setAmountText("");
    setShares({});
    setReference("");
    setIdempotencyKey(newKey());
    await queryClient.invalidateQueries({ queryKey: ["invoice-payment-summaries", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["customer-invoice-receivables", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["invoice-payment-summary", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["invoice-payment-history", orgId] });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Allocate a payment across invoices</Text>
      <TextInput
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        placeholder="Payment amount"
        placeholderTextColor={Theme.textMuted}
        style={styles.input}
        accessibilityLabel="Split payment amount"
      />
      <TextInput
        value={reference}
        onChangeText={setReference}
        placeholder="Transaction reference"
        placeholderTextColor={Theme.textMuted}
        style={styles.input}
        accessibilityLabel="Split payment reference"
      />
      {open.map((row) => (
        <View key={row.id} style={styles.line}>
          <Text style={styles.lineLabel} numberOfLines={1}>
            {row.invoiceNumber}
          </Text>
          <TextInput
            value={shares[row.id] ?? ""}
            onChangeText={(value) => setShares((prev) => ({ ...prev, [row.id]: value }))}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={Theme.textMuted}
            style={styles.share}
            accessibilityLabel={`Allocate to ${row.invoiceNumber}`}
          />
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <Pressable
        style={styles.primary}
        disabled={busy}
        onPress={() => void onRecord()}
        accessibilityRole="button"
        accessibilityLabel="Record split payment"
      >
        <Text style={styles.primaryText}>{busy ? "Saving…" : "Record payment"}</Text>
      </Pressable>
    </View>
  );
}

function newKey(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `split-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 8,
  },
  title: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: Theme.textPrimaryDark,
  },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  lineLabel: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "500", color: Theme.textSecondary },
  share: {
    width: 110,
    minHeight: 44,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    color: Theme.textPrimaryDark,
  },
  primary: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: Theme.buttonDarkText, fontSize: 14, fontWeight: "600" },
  error: { color: Theme.teslaRed, fontSize: 12 },
  note: { color: Theme.success, fontSize: 12 },
});
