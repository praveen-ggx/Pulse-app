/**
 * Record, review, and reverse allocations for one issued invoice.
 * The issued total shown here is the stored invoice total.
 */
import Theme from "@/constants/Theme";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import {
  fetchInvoicePaymentHistory,
  fetchInvoicePaymentSummaries,
  recordInvoicePayment,
  reverseInvoicePayment,
  type InvoicePaymentHistoryRow,
  type InvoicePaymentSummary,
} from "@/features/invoicing/services/invoicePayment.service";
import {
  parseInrAmount,
  paymentReceiptText,
  paymentStatusLabel,
} from "@/features/invoicing/utils/invoicePayment.util";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MODES = ["bank", "upi", "neft", "rtgs", "imps", "cash", "cheque", "other"] as const;

function inr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InvoicePaymentSheet({
  orgId,
  invoice,
  canRecord,
  variant,
  onClose,
}: {
  orgId: string;
  invoice: IssuedInvoiceListRow;
  canRecord: boolean;
  variant: "inline" | "modal";
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [amountText, setAmountText] = useState("");
  const [allocateText, setAllocateText] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso);
  const [mode, setMode] = useState<(typeof MODES)[number]>("neft");
  const [reference, setReference] = useState("");
  const [deposit, setDeposit] = useState("");
  const [notes, setNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => cryptoRandom());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseKey, setReverseKey] = useState(() => cryptoRandom());

  const summaryQuery = useQuery({
    queryKey: ["invoice-payment-summary", orgId, invoice.id],
    queryFn: () => fetchInvoicePaymentSummaries(orgId, [invoice.id]),
  });
  const historyQuery = useQuery({
    queryKey: ["invoice-payment-history", orgId, invoice.id],
    queryFn: () => fetchInvoicePaymentHistory(orgId, invoice.id),
  });

  const summary = summaryQuery.data?.summaries[0] ?? null;
  const outstanding = summary?.amountOutstanding ?? invoice.total_amount;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["invoice-payment-summary", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["invoice-payment-history", orgId, invoice.id] });
    await queryClient.invalidateQueries({ queryKey: ["invoice-payment-summaries", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["customer-invoice-receivables", orgId] });
  }

  async function onRecord() {
    const amount = parseInrAmount(amountText);
    if (!amount) {
      setError("Enter the payment amount");
      return;
    }
    const allocated = allocateText.trim() ? parseInrAmount(allocateText) : Math.min(amount, Math.max(outstanding, 0));
    if (!allocated) {
      setError("Enter how much of this payment applies to the invoice");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await recordInvoicePayment({
      orgId,
      clientId: invoice.client_id,
      paymentDate,
      amount,
      paymentMode: mode,
      transactionReference: reference,
      depositAccountLabel: deposit,
      notes,
      idempotencyKey,
      allocations: [{ invoiceId: invoice.id, amount: allocated }],
    });
    setBusy(false);
    if (result.error || !result.payment) {
      setError(result.error ?? "Payment request failed");
      return;
    }
    const text = paymentReceiptText({
      invoiceNumber: invoice.invoice_number,
      paymentDate,
      amount: result.payment.amount,
      mode,
      reference: reference.trim() || null,
      allocationAmount: allocated,
      status: result.payment.replayed ? "recorded (already saved)" : "recorded",
    });
    setReceipt(text);
    setAmountText("");
    setAllocateText("");
    setReference("");
    setIdempotencyKey(cryptoRandom());
    await refresh();
  }

  async function onReverse() {
    if (!reverseId) return;
    if (!reverseReason.trim()) {
      setError("Enter a reversal reason");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await reverseInvoicePayment({
      orgId,
      paymentId: reverseId,
      reason: reverseReason.trim(),
      idempotencyKey: reverseKey,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setReverseId(null);
    setReverseReason("");
    setReverseKey(cryptoRandom());
    await refresh();
  }

  const body = (
    <View style={[styles.sheet, variant === "inline" && styles.inline]}>
      <View style={styles.head}>
        <Text style={styles.title}>Payments</Text>
        <Text style={styles.invoiceNo} numberOfLines={1}>
          {invoice.invoice_number}
        </Text>
        {variant === "modal" ? (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close payments" hitSlop={8}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        ) : null}
      </View>
      <BalanceSummary
        invoiceTotal={summary?.invoiceTotal ?? invoice.total_amount}
        summary={summary}
        unavailable={summaryQuery.data?.unavailable === true}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {receipt ? (
        <View style={styles.receipt}>
          <Text style={styles.receiptText}>{receipt}</Text>
          <Pressable
            style={styles.secondary}
            onPress={() => void Share.share({ message: receipt })}
            accessibilityRole="button"
            accessibilityLabel="Share payment receipt"
          >
            <Text style={styles.secondaryText}>Share receipt</Text>
          </Pressable>
        </View>
      ) : null}
      {canRecord ? (
        <View style={styles.form}>
          <Text style={styles.label}>Amount received</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={Theme.textMuted}
            style={styles.input}
            accessibilityLabel="Payment amount"
          />
          <Text style={styles.label}>Allocate to this invoice</Text>
          <TextInput
            value={allocateText}
            onChangeText={setAllocateText}
            keyboardType="decimal-pad"
            placeholder={outstanding > 0 ? `Up to ${inr(outstanding)}` : "0.00"}
            placeholderTextColor={Theme.textMuted}
            style={styles.input}
            accessibilityLabel="Amount allocated to this invoice"
          />
          <Text style={styles.hint}>
            Leave allocation blank to apply the payment up to the outstanding balance. Any remainder stays unallocated.
          </Text>
          <Text style={styles.label}>Payment date</Text>
          <TextInput
            value={paymentDate}
            onChangeText={setPaymentDate}
            style={styles.input}
            accessibilityLabel="Payment date"
          />
          <View style={styles.modes}>
            {MODES.map((item) => (
              <Pressable
                key={item}
                onPress={() => setMode(item)}
                style={[styles.mode, mode === item && styles.modeOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === item }}
                accessibilityLabel={`Payment mode ${item}`}
              >
                <Text style={[styles.modeText, mode === item && styles.modeTextOn]}>{item.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder="Transaction reference"
            placeholderTextColor={Theme.textMuted}
            style={styles.input}
            accessibilityLabel="Transaction reference"
          />
          <TextInput
            value={deposit}
            onChangeText={setDeposit}
            placeholder="Deposit account"
            placeholderTextColor={Theme.textMuted}
            style={styles.input}
            accessibilityLabel="Deposit account"
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes"
            placeholderTextColor={Theme.textMuted}
            style={styles.input}
            accessibilityLabel="Payment notes"
          />
          <Pressable
            style={styles.primary}
            onPress={() => void onRecord()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Record payment"
          >
            {busy ? (
              <ActivityIndicator color={Theme.buttonDarkText} />
            ) : (
              <Text style={styles.primaryText}>Record payment</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Text style={styles.hint}>Recording and reversal need an active finance role.</Text>
      )}
      <Text style={styles.section}>History</Text>
      <HistoryList
        rows={historyQuery.data?.rows ?? []}
        loading={historyQuery.isLoading}
        canRecord={canRecord}
        onReverse={(paymentId) => {
          setReverseId(paymentId);
          setReverseReason("");
          setError(null);
        }}
      />
      {reverseId && canRecord ? (
        <View style={styles.form}>
          <Text style={styles.label}>Reversal reason</Text>
          <TextInput
            value={reverseReason}
            onChangeText={setReverseReason}
            style={styles.input}
            accessibilityLabel="Reversal reason"
          />
          <Pressable
            style={styles.primary}
            onPress={() => void onReverse()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Reverse payment"
          >
            <Text style={styles.primaryText}>Reverse payment</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  if (variant === "inline") {
    return (
      <ScrollView style={styles.inlineScroll} contentContainerStyle={styles.inlineContent}>
        {body}
      </ScrollView>
    );
  }

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <ScrollView style={styles.modalCard} contentContainerStyle={styles.modalContent}>
          {body}
        </ScrollView>
      </View>
    </Modal>
  );
}

function BalanceSummary({
  invoiceTotal,
  summary,
  unavailable,
}: {
  invoiceTotal: number;
  summary: InvoicePaymentSummary | null;
  unavailable: boolean;
}) {
  if (unavailable) {
    return <Text style={styles.hint}>Payment tracking is not available on this database yet.</Text>;
  }
  return (
    <View style={styles.balances}>
      <Balance label="Invoice" value={inr(invoiceTotal)} />
      <Balance label="Received" value={summary ? inr(summary.amountReceived) : "—"} />
      <Balance label="Outstanding" value={summary ? inr(summary.amountOutstanding) : "—"} />
      <Balance
        label="Status"
        value={summary ? paymentStatusLabel(summary.paymentStatus) : "—"}
      />
    </View>
  );
}

function Balance({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.balance}>
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text style={styles.balanceValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function HistoryList({
  rows,
  loading,
  canRecord,
  onReverse,
}: {
  rows: InvoicePaymentHistoryRow[];
  loading: boolean;
  canRecord: boolean;
  onReverse: (paymentId: string) => void;
}) {
  if (loading) return <ActivityIndicator color={Theme.primary} />;
  if (rows.length === 0) return <Text style={styles.hint}>No payments recorded.</Text>;
  return (
    <View>
      {rows.map((row) => (
        <View key={row.allocationId} style={styles.historyRow}>
          <Text style={styles.historyMain}>
            {row.paymentDate} · {inr(row.allocationAmount)} of {inr(row.paymentAmount)} · {row.paymentMode.toUpperCase()}
          </Text>
          <Text style={styles.hint}>
            {row.transactionReference || "No reference"}
            {row.depositAccountLabel ? ` · ${row.depositAccountLabel}` : ""}
            {` · ${row.status === "reversed" ? "Reversed" : "Recorded"}`}
          </Text>
          {row.reversalReason ? <Text style={styles.hint}>Reason: {row.reversalReason}</Text> : null}
          {canRecord && row.status !== "reversed" ? (
            <Pressable
              onPress={() => onReverse(row.paymentId)}
              accessibilityRole="button"
              accessibilityLabel="Start payment reversal"
              hitSlop={8}
            >
              <Text style={styles.reverse}>Reverse</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function cryptoRandom(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `pay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalCard: {
    maxHeight: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
  },
  modalContent: { padding: 16 },
  inlineScroll: { maxHeight: 360, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.border },
  inlineContent: { paddingBottom: 12 },
  sheet: { gap: 8 },
  inline: { paddingHorizontal: 12, paddingTop: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: "600", color: Theme.textPrimaryDark },
  invoiceNo: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "500", color: Theme.textSecondary },
  close: { fontSize: 13, fontWeight: "600", color: Theme.primary },
  balances: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  balance: { minWidth: 88, flexGrow: 1 },
  balanceLabel: { fontSize: 11, fontWeight: "500", color: Theme.textSecondary },
  balanceValue: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  form: { gap: 6 },
  label: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary },
  hint: { fontSize: 12, fontWeight: "400", color: Theme.textMuted, lineHeight: 16 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  modes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  mode: {
    minHeight: 36,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modeOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  modeText: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
  modeTextOn: { color: Theme.buttonDarkText },
  primary: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: Theme.buttonDarkText, fontSize: 14, fontWeight: "600" },
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: Theme.primary, fontSize: 13, fontWeight: "600" },
  error: { color: Theme.teslaRed, fontSize: 12, fontWeight: "500" },
  receipt: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: Theme.surface,
    gap: 6,
  },
  receiptText: { fontSize: 12, fontWeight: "400", color: Theme.textPrimaryDark },
  section: { marginTop: 4, fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  historyRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    gap: 2,
  },
  historyMain: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  reverse: { marginTop: 4, fontSize: 12, fontWeight: "600", color: Theme.teslaRed },
});
