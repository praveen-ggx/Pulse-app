/**
 * Receivables, ledger, credit notes, reconciliation, and reports
 * beside the invoice book. Figures come from the finance RPCs.
 */
import Theme from "@/constants/Theme";
import { InvoiceReceivablesStrip } from "@/features/invoicing/components/InvoiceReceivablesStrip";
import { InvoiceSplitPaymentForm } from "@/features/invoicing/components/InvoiceSplitPaymentForm";
import {
  cancelIssuedInvoice,
  fetchCustomerLedger,
  importBankRows,
  issueCreditNote,
  recordInvoiceEmailRequest,
  saveReminderRule,
  type LedgerEntry,
} from "@/features/invoicing/services/financeControls.service";
import { fetchInvoicePaymentSummaries } from "@/features/invoicing/services/invoicePayment.service";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export type FinanceBookSection = "book" | "receivables" | "ledger" | "credits" | "reconcile" | "reports";

type Issued = { id: string; invoiceNumber: string; total: number };

function key() {
  return `fin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FinanceBooksPanel({
  section,
  orgId,
  clientId,
  canRecord,
  invoices,
}: {
  section: Exclude<FinanceBookSection, "book">;
  orgId: string;
  clientId: string | null;
  canRecord: boolean;
  invoices: Issued[];
}) {
  if (!clientId) {
    return <Text style={styles.note}>Select a client to open this book.</Text>;
  }
  if (section === "receivables" || section === "reports") {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <InvoiceReceivablesStrip orgId={orgId} clientId={clientId} />
        {section === "receivables" ? (
          <ReceivablePayment
            orgId={orgId}
            clientId={clientId}
            canRecord={canRecord}
            invoices={invoices}
          />
        ) : (
          <ReportActions orgId={orgId} clientId={clientId} canRecord={canRecord} invoices={invoices} />
        )}
      </ScrollView>
    );
  }
  if (section === "ledger") return <Ledger orgId={orgId} clientId={clientId} />;
  if (section === "credits") {
    return <Credits orgId={orgId} canRecord={canRecord} invoices={invoices} />;
  }
  return <Reconcile orgId={orgId} canRecord={canRecord} />;
}

function ReceivablePayment({
  orgId,
  clientId,
  canRecord,
  invoices,
}: {
  orgId: string;
  clientId: string;
  canRecord: boolean;
  invoices: Issued[];
}) {
  const ids = invoices.map((row) => row.id);
  const query = useQuery({
    queryKey: ["invoice-payment-summaries", orgId, ids.join(",")],
    queryFn: () => fetchInvoicePaymentSummaries(orgId, ids),
    enabled: ids.length > 0,
  });
  const summaries = new Map((query.data?.summaries ?? []).map((row) => [row.invoiceId, row]));
  const open = invoices.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    outstanding: summaries.get(row.id)?.amountOutstanding ?? row.total,
  }));
  return (
    <InvoiceSplitPaymentForm
      orgId={orgId}
      clientId={clientId}
      canRecord={canRecord}
      invoices={open}
    />
  );
}

function Ledger({ orgId, clientId }: { orgId: string; clientId: string }) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["customer-finance-ledger", orgId, clientId, offset],
    queryFn: () => fetchCustomerLedger(orgId, clientId, offset),
  });
  const rows = query.data?.rows ?? [];
  return (
    <ScrollView contentContainerStyle={styles.page}>
      {query.data?.unavailable ? (
        <Text style={styles.note}>The customer ledger is not available on this database yet.</Text>
      ) : null}
      {query.data?.error && !query.data.unavailable ? <Text style={styles.error}>{query.data.error}</Text> : null}
      {rows.map((row) => (
        <LedgerRow key={`${row.type}-${row.number}-${row.date}`} row={row} />
      ))}
      {rows.length === 0 && !query.isLoading ? <Text style={styles.note}>No ledger entries for this client.</Text> : null}
      <View style={styles.row}>
        <Pressable onPress={() => setOffset((value) => Math.max(0, value - 50))} accessibilityRole="button">
          <Text style={styles.link}>Previous</Text>
        </Pressable>
        <Pressable onPress={() => setOffset((value) => value + 50)} accessibilityRole="button">
          <Text style={styles.link}>Next</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function LedgerRow({ row }: { row: LedgerEntry }) {
  return (
    <View style={styles.line}>
      <Text style={styles.strong}>{row.number}</Text>
      <Text style={styles.meta}>{row.date} · {row.type}</Text>
      <Text style={styles.meta}>Debit {inr(row.debit)} · Credit {inr(row.credit)}</Text>
    </View>
  );
}

function Credits({
  orgId,
  canRecord,
  invoices,
}: {
  orgId: string;
  canRecord: boolean;
  invoices: Issued[];
}) {
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.strong}>Credit note</Text>
      <Text style={styles.note}>Issued against one invoice. The original invoice total stays as issued.</Text>
      {invoices.map((row) => (
        <Pressable key={row.id} onPress={() => setInvoiceId(row.id)} accessibilityRole="button">
          <Text style={[styles.meta, invoiceId === row.id && styles.link]}>
            {row.invoiceNumber} · {inr(row.total)}
          </Text>
        </Pressable>
      ))}
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="Credit amount" keyboardType="decimal-pad" />
      <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Reason" />
      <Pressable
        style={styles.button}
        disabled={!canRecord || busy}
        onPress={() => {
          const value = Number(amount);
          if (!invoiceId || !reason.trim() || !(value > 0)) {
            setMessage("Choose an invoice, a reason, and a positive amount.");
            return;
          }
          setBusy(true);
          void issueCreditNote({
            orgId,
            invoiceId,
            reason: reason.trim(),
            amount: value,
            idempotencyKey: key(),
          }).then((result) => {
            setBusy(false);
            setMessage(result.error ?? "Credit note issued.");
          });
        }}
        accessibilityRole="button"
        accessibilityLabel="Issue credit note"
      >
        <Text style={styles.buttonText}>{busy ? "Issuing…" : "Issue credit note"}</Text>
      </Pressable>
      <Text style={styles.strong}>Cancel invoice</Text>
      <Text style={styles.note}>A reason is required. An invoice with a payment or credit note stays in the book.</Text>
      <Pressable
        style={styles.button}
        disabled={!canRecord || busy}
        onPress={() => {
          if (!invoiceId || !reason.trim()) {
            setMessage("Choose an invoice and enter the cancellation reason.");
            return;
          }
          setBusy(true);
          void cancelIssuedInvoice({
            orgId,
            invoiceId,
            reason: reason.trim(),
            idempotencyKey: key(),
          }).then((result) => {
            setBusy(false);
            setMessage(result.error ?? "Invoice cancelled. The number is kept.");
          });
        }}
        accessibilityRole="button"
        accessibilityLabel="Cancel invoice"
      >
        <Text style={styles.buttonText}>Cancel invoice</Text>
      </Pressable>
      {message ? <Text style={styles.note}>{message}</Text> : null}
    </ScrollView>
  );
}

function Reconcile({ orgId, canRecord }: { orgId: string; canRecord: boolean }) {
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.strong}>Bank statement</Text>
      <Text style={styles.note}>One row per line: date, reference, description, credit. Import does not create a payment.</Text>
      <TextInput
        style={[styles.input, styles.area]}
        value={csv}
        onChangeText={setCsv}
        multiline
        placeholder="2026-04-01, UTR1, Megha, 180000"
      />
      <Pressable
        style={styles.button}
        disabled={!canRecord}
        onPress={() => {
          const rows = csv.split("\n").map((line) => line.split(",").map((part) => part.trim())).filter((parts) => parts.length >= 4).map((parts) => ({
            txn_date: parts[0],
            reference: parts[1],
            description: parts[2],
            credit: parts[3],
            debit: "0",
          }));
          if (rows.length === 0) {
            setMessage("Add at least one bank row.");
            return;
          }
          void importBankRows(orgId, rows, key()).then((result) => {
            if (result.error || !result.result) {
              setMessage(result.error ?? "Import failed");
              return;
            }
            setMessage(`${result.result.inserted ?? 0} added, ${result.result.duplicates ?? 0} duplicates skipped.`);
          });
        }}
        accessibilityRole="button"
        accessibilityLabel="Import bank rows"
      >
        <Text style={styles.buttonText}>Import rows</Text>
      </Pressable>
      {message ? <Text style={styles.note}>{message}</Text> : null}
    </ScrollView>
  );
}

function ReportActions({
  orgId,
  clientId,
  canRecord,
  invoices,
}: {
  orgId: string;
  clientId: string;
  canRecord: boolean;
  invoices: Issued[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  return (
    <View style={styles.block}>
      <Text style={styles.strong}>Reports</Text>
      <Text style={styles.note}>Aging above is the outstanding book. Collection rate is received against issued totals.</Text>
      <Pressable
        style={styles.button}
        onPress={() => {
          void fetchCustomerLedger(orgId, clientId, 0).then((result) => {
            if (result.error) {
              setMessage(result.error);
              return;
            }
            const csv = ["date,number,type,debit,credit", ...result.rows.map((row) =>
              [row.date, row.number, row.type, row.debit, row.credit].join(","),
            )].join("\n");
            if (typeof document === "undefined") {
              setMessage(csv);
              return;
            }
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "customer-ledger.csv";
            link.click();
            URL.revokeObjectURL(url);
          });
        }}
        accessibilityRole="button"
        accessibilityLabel="Export customer ledger"
      >
        <Text style={styles.buttonText}>Export ledger</Text>
      </Pressable>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Billing email" autoCapitalize="none" />
      <Pressable
        style={styles.button}
        disabled={!canRecord || invoices.length === 0}
        onPress={() => {
          const invoice = invoices[0];
          if (!invoice || !email.includes("@")) {
            setMessage("Enter a billing email. The first issued invoice is the one recorded.");
            return;
          }
          void recordInvoiceEmailRequest({
            orgId,
            invoiceId: invoice.id,
            recipients: [email.trim()],
            subject: `Invoice ${invoice.invoiceNumber}`,
            idempotencyKey: `${invoice.id}:${email.trim().toLowerCase()}`,
          }).then((result) => {
            if (result.error) {
              setMessage(result.error);
              return;
            }
            setMessage(result.result?.duplicate
              ? "This invoice email was already recorded for that address."
              : "Email request recorded. Mail delivery is not connected on this workspace, so nothing was sent.");
          });
        }}
        accessibilityRole="button"
        accessibilityLabel="Record invoice email"
      >
        <Text style={styles.buttonText}>Record invoice email</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        disabled={!canRecord}
        onPress={() => {
          void saveReminderRule(orgId, true).then((result) => {
            setMessage(result.error ?? "Reminders are on: 3 days before the due date, then 7 days after. One rule per organization.");
          });
        }}
        accessibilityRole="button"
        accessibilityLabel="Turn on payment reminders"
      >
        <Text style={styles.buttonText}>Turn on reminders</Text>
      </Pressable>
      {message ? <Text style={styles.note}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  block: { gap: 10, marginTop: 12 },
  line: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  strong: { fontSize: 14, fontWeight: "500", color: Theme.textPrimaryDark },
  meta: { fontSize: 12, color: Theme.textSecondary, marginTop: 2 },
  note: { fontSize: 13, color: Theme.textSecondary, lineHeight: 18 },
  error: { fontSize: 13, color: Theme.teslaRed },
  link: { color: Theme.primary, fontWeight: "500" },
  row: { flexDirection: "row", gap: 16, marginTop: 8 },
  input: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  area: { minHeight: 96, textAlignVertical: "top" },
  button: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  buttonText: { color: Theme.buttonDarkText, fontSize: 13, fontWeight: "500" },
});
