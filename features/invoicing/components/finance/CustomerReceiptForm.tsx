/**
 * Record a customer receipt (bank credit + optional TDS) and apply it to open
 * invoices. Writes only through record_customer_receipt; the database checks every
 * limit again. Anything not applied stays on account as unallocated.
 */
import {
  ActionButton,
  Card,
  Chip,
  DataTable,
  Field,
  Note,
  QueryState,
  Row,
  SectionTitle,
  ui,
} from "@/features/invoicing/components/finance/FinanceUi";
import { invalidateFinanceBalances } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import {
  fetchOpenInvoicesForClient,
  financeBooksKeys,
  newFinanceKey,
  PAYMENT_MODE_LABELS,
  recordCustomerReceipt,
  type InvoiceRegisterRow,
  type PaymentMode,
} from "@/features/invoicing/services/financeBooks.service";
import { allocateOldestFirst, receiptAllocationProblems } from "@/features/invoicing/utils/financeReceipt.util";
import { formatDocDate, formatInr } from "@/features/invoicing/utils/financeDocuments.util";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { TextInput, View } from "react-native";

const MODES: PaymentMode[] = ["neft", "rtgs", "imps", "upi", "cheque", "cash", "other"];

function today(): string {
  const now = new Date();
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().slice(0, 10);
}

function amountOf(text: string): number {
  const value = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : Number.NaN;
}

export function CustomerReceiptForm({
  orgId,
  clientId,
  clientName,
  canRecord,
  onRecorded,
}: {
  orgId: string;
  clientId: string;
  clientName: string | null;
  canRecord: boolean;
  onRecorded: (paymentId: string, receiptNumber: string) => void;
}) {
  const queryClient = useQueryClient();
  const openQuery = useQuery({
    queryKey: [...financeBooksKeys.invoiceRegister(orgId, clientId, null, null, 0, true), "all-open"],
    queryFn: () => fetchOpenInvoicesForClient(orgId, clientId),
    staleTime: 15_000,
  });
  const open = useMemo(() => openQuery.data?.data ?? [], [openQuery.data]);
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<PaymentMode>("neft");
  const [reference, setReference] = useState("");
  const [bankText, setBankText] = useState("");
  const [tdsText, setTdsText] = useState("");
  const [deposit, setDeposit] = useState("");
  const [notes, setNotes] = useState("");
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const intentKey = useRef<string | null>(null);

  const bank = amountOf(bankText || "0");
  const tds = amountOf(tdsText || "0");
  const total = Number.isFinite(bank) && Number.isFinite(tds) ? Math.round((bank + tds) * 100) / 100 : Number.NaN;
  const allocations = useMemo(
    () =>
      open
        .map((row) => ({ invoiceId: row.invoiceId, amount: amountOf(applied[row.invoiceId] ?? "") }))
        .filter((row) => Number.isFinite(row.amount) && row.amount > 0),
    [applied, open],
  );
  const problems = receiptAllocationProblems({
    bank,
    tds,
    allocations,
    outstanding: Object.fromEntries(open.map((row) => [row.invoiceId, row.outstanding])),
  });
  const allocated = allocations.reduce((sum, row) => sum + row.amount, 0);
  const unallocated = Number.isFinite(total) ? Math.round((total - allocated) * 100) / 100 : 0;

  const touch = () => {
    // Any edit is a new intent: a retry of the same values reuses the key.
    intentKey.current = null;
    setMessage(null);
  };

  const autoApply = () => {
    if (!Number.isFinite(total) || total <= 0) return;
    const plan = allocateOldestFirst(
      total,
      open.map((row) => ({ id: row.invoiceId, outstanding: row.outstanding })),
    );
    setApplied(Object.fromEntries(plan.map((row) => [row.id, row.amount.toFixed(2)])));
    touch();
  };

  const submit = async () => {
    if (problems.length) {
      setMessage({ text: problems[0]!, tone: "error" });
      return;
    }
    intentKey.current = intentKey.current ?? newFinanceKey("receipt");
    setBusy(true);
    setMessage(null);
    const result = await recordCustomerReceipt({
      orgId,
      clientId,
      paymentDate: date,
      bankAmount: bank,
      tdsAmount: tds,
      paymentMode: mode,
      reference,
      depositAccountLabel: deposit,
      notes,
      idempotencyKey: intentKey.current,
      allocations,
    });
    setBusy(false);
    if (result.error || !result.receipt) {
      setMessage({ text: result.error ?? "The receipt was not recorded.", tone: "error" });
      return;
    }
    intentKey.current = null;
    setBankText("");
    setTdsText("");
    setReference("");
    setNotes("");
    setApplied({});
    setMessage({
      text: `${result.receipt.replayed ? "Already recorded" : "Recorded"} ${result.receipt.receiptNumber}${
        result.receipt.unallocated > 0 ? ` · ${formatInr(result.receipt.unallocated)} kept on account` : ""
      }.`,
      tone: "success",
    });
    await invalidateFinanceBalances(queryClient, orgId);
    onRecorded(result.receipt.paymentId, result.receipt.receiptNumber);
  };

  const columns = [
    { key: "number", label: "Invoice", render: (row: InvoiceRegisterRow) => row.invoiceNumber },
    { key: "due", label: "Due", width: 104, render: (row: InvoiceRegisterRow) => formatDocDate(row.dueDate ?? row.invoiceDate) },
    { key: "total", label: "Total", width: 110, align: "right" as const, render: (row: InvoiceRegisterRow) => formatInr(row.total) },
    { key: "open", label: "Outstanding", width: 120, align: "right" as const, render: (row: InvoiceRegisterRow) => formatInr(row.outstanding) },
    {
      key: "apply",
      label: "Apply",
      width: 130,
      align: "right" as const,
      render: (row: InvoiceRegisterRow) => (
        <TextInput
          style={[ui.input, ui.num, { minWidth: 110 }]}
          value={applied[row.invoiceId] ?? ""}
          onChangeText={(next) => {
            setApplied((current) => ({ ...current, [row.invoiceId]: next }));
            touch();
          }}
          placeholder="0.00"
          keyboardType="decimal-pad"
          editable={canRecord}
          accessibilityLabel={`Amount to apply to ${row.invoiceNumber}`}
        />
      ),
    },
  ];

  return (
    <Card>
      <SectionTitle
        title="Record receipt"
        hint={`${clientName ?? "Customer"} · bank credit plus any TDS the customer deducted. Unapplied money stays on account.`}
      />
      {!canRecord ? <Note tone="warning">You can view receivables. Recording receipts needs finance permission.</Note> : null}
      <Row>
        <Field label="Payment date" value={date} onChangeText={(next) => { setDate(next); touch(); }} placeholder="YYYY-MM-DD" width={150} />
        <Field label="Received in bank (₹)" value={bankText} onChangeText={(next) => { setBankText(next); touch(); }} keyboardType="decimal-pad" placeholder="0.00" width={170} />
        <Field label="TDS deducted (₹)" value={tdsText} onChangeText={(next) => { setTdsText(next); touch(); }} keyboardType="decimal-pad" placeholder="0.00" width={150} />
        <Field label="Transaction reference / UTR" value={reference} onChangeText={(next) => { setReference(next); touch(); }} autoCapitalize="characters" />
      </Row>
      <Row>
        {MODES.map((item) => (
          <Chip key={item} label={PAYMENT_MODE_LABELS[item]} active={mode === item} onPress={() => { setMode(item); touch(); }} />
        ))}
      </Row>
      <Row>
        <Field label="Deposited to (optional)" value={deposit} onChangeText={(next) => { setDeposit(next); touch(); }} placeholder="e.g. HDFC current a/c" />
        <Field label="Notes (optional)" value={notes} onChangeText={(next) => { setNotes(next); touch(); }} />
      </Row>
      <SectionTitle
        title="Apply to invoices"
        hint={open.length ? `${open.length} open invoice${open.length === 1 ? "" : "s"}, oldest due first.` : null}
        actions={open.length ? <ActionButton label="Apply oldest first" kind="secondary" disabled={!canRecord || !(total > 0)} onPress={autoApply} /> : null}
      />
      <QueryState
        loading={openQuery.isLoading}
        error={openQuery.data?.error}
        unavailable={openQuery.data?.unavailable}
        empty={!openQuery.isLoading && open.length === 0}
        emptyText="No open invoices. A receipt recorded now stays on account until it is applied."
        onRetry={() => void openQuery.refetch()}
      />
      <DataTable columns={columns} rows={open} rowKey={(row) => row.invoiceId} />
      <View style={ui.pager}>
        <Note>
          Total {Number.isFinite(total) ? formatInr(total) : "—"} · applied {formatInr(allocated)} · on account {formatInr(Math.max(unallocated, 0))}
        </Note>
        <ActionButton label="Record receipt" busy={busy} disabled={!canRecord || problems.length > 0} onPress={() => void submit()} />
      </View>
      {problems.length && (bankText || tdsText || allocations.length) ? <Note tone="error">{problems[0]}</Note> : null}
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
    </Card>
  );
}
