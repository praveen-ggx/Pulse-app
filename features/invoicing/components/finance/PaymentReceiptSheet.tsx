/**
 * One payment receipt, rendered from invoice_payment_receipt: view, PDF, print,
 * share, and (for finance staff) reversal. A reversed receipt is marked and is
 * never shown as active.
 */
import {
  ActionButton,
  Card,
  DataTable,
  Field,
  FinanceSheet,
  Metric,
  MetricRow,
  Note,
  QueryState,
  StatusPill,
  ui,
} from "@/features/invoicing/components/finance/FinanceUi";
import {
  FINANCE_BALANCE_KEY_PREFIXES,
  fetchPaymentReceipt,
  financeBooksKeys,
  newFinanceKey,
  paymentModeLabel,
  reverseReceipt,
  type ReceiptAllocation,
} from "@/features/invoicing/services/financeBooks.service";
import {
  buildPaymentReceiptHtml,
  formatDocDate,
  formatInr,
  paymentReceiptFileName,
  paymentReceiptShareText,
} from "@/features/invoicing/utils/financeDocuments.util";
import {
  downloadFinancePdf,
  printFinanceDocument,
  shareFinanceDocument,
} from "@/features/invoicing/utils/financeDocumentOutput.util";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

export async function invalidateFinanceBalances(queryClient: ReturnType<typeof useQueryClient>, orgId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: financeBooksKeys.all(orgId) }),
    ...FINANCE_BALANCE_KEY_PREFIXES.map((prefix) => queryClient.invalidateQueries({ queryKey: [prefix] })),
  ]);
}

export function PaymentReceiptSheet({
  orgId,
  paymentId,
  canRecord,
  onClose,
}: {
  orgId: string;
  paymentId: string | null;
  canRecord: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: financeBooksKeys.receipt(orgId, paymentId ?? "none"),
    queryFn: () => fetchPaymentReceipt(orgId, paymentId!),
    enabled: Boolean(paymentId),
    staleTime: 30_000,
  });
  const receipt = query.data?.data ?? null;
  const [busy, setBusy] = useState<"pdf" | "print" | "share" | "reverse" | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState("");
  const reverseKey = useRef<string | null>(null);

  const run = async (kind: "pdf" | "print" | "share") => {
    if (!receipt) return;
    setBusy(kind);
    setMessage(null);
    const html = buildPaymentReceiptHtml(receipt);
    const title = `Receipt ${receipt.receiptNumber}`;
    try {
      if (kind === "pdf") await downloadFinancePdf(html, paymentReceiptFileName(receipt));
      else if (kind === "print") await printFinanceDocument(html, title);
      else {
        const result = await shareFinanceDocument({ html, title, text: paymentReceiptShareText(receipt) });
        if (result === "copied") setMessage({ text: "Receipt summary copied to the clipboard.", tone: "success" });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      if (!/abort|cancel/i.test(text)) setMessage({ text: text || "Could not open the document.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const reverse = async () => {
    if (!receipt || !reason.trim()) {
      setMessage({ text: "Enter why the receipt is being reversed.", tone: "error" });
      return;
    }
    reverseKey.current = reverseKey.current ?? newFinanceKey("reverse");
    setBusy("reverse");
    setMessage(null);
    const result = await reverseReceipt({ orgId, paymentId: receipt.paymentId, reason: reason.trim(), idempotencyKey: reverseKey.current });
    setBusy(null);
    if (result.error) {
      setMessage({ text: result.error, tone: "error" });
      return;
    }
    reverseKey.current = null;
    setReversing(false);
    setReason("");
    setMessage({ text: "Receipt reversed. The invoices it settled are open again.", tone: "success" });
    await invalidateFinanceBalances(queryClient, orgId);
  };

  const reversed = receipt?.status === "reversed";
  const columns = [
    { key: "invoice", label: "Invoice", render: (row: ReceiptAllocation) => row.invoiceNumber },
    { key: "date", label: "Invoice date", width: 110, render: (row: ReceiptAllocation) => formatDocDate(row.invoiceDate) },
    { key: "total", label: "Invoice total", width: 120, align: "right" as const, render: (row: ReceiptAllocation) => formatInr(row.invoiceTotal) },
    { key: "applied", label: "Applied", width: 120, align: "right" as const, render: (row: ReceiptAllocation) => formatInr(row.amount) },
    {
      key: "status",
      label: "Status",
      width: 96,
      render: (row: ReceiptAllocation) => <StatusPill label={row.status === "reversed" ? "Reversed" : "Applied"} tone={row.status === "reversed" ? "bad" : "ok"} />,
    },
  ];

  return (
    <FinanceSheet
      visible={Boolean(paymentId)}
      title={receipt ? `Receipt ${receipt.receiptNumber}` : "Receipt"}
      onClose={onClose}
      footer={
        receipt ? (
          <>
            <ActionButton label="Download PDF" kind="secondary" busy={busy === "pdf"} disabled={busy !== null} onPress={() => void run("pdf")} />
            <ActionButton label="Print" kind="secondary" busy={busy === "print"} disabled={busy !== null} onPress={() => void run("print")} />
            <ActionButton label="Share" busy={busy === "share"} disabled={busy !== null} onPress={() => void run("share")} />
          </>
        ) : null
      }
    >
      <QueryState
        loading={query.isLoading}
        error={query.data?.error}
        unavailable={query.data?.unavailable}
        empty={!query.isLoading && !receipt && !query.data?.error}
        emptyText="This receipt is not available."
        onRetry={() => void query.refetch()}
      />
      {receipt ? (
        <>
          {reversed ? (
            <Card tone="danger">
              <Text style={ui.tdStrong}>Reversed — not an active receipt</Text>
              <Note>
                {receipt.reversedAt ? `Reversed ${formatDocDate(receipt.reversedAt)}` : "Reversed"}
                {receipt.reversedBy ? ` by ${receipt.reversedBy}` : ""}
                {receipt.reversalReason ? ` · ${receipt.reversalReason}` : ""}
              </Note>
            </Card>
          ) : null}
          <View style={ui.row}>
            <StatusPill label={reversed ? "Reversed" : "Active"} tone={reversed ? "bad" : "ok"} />
            <Text style={ui.hint}>
              {formatDocDate(receipt.paymentDate)} · {paymentModeLabel(receipt.paymentMode)}
              {receipt.transactionReference ? ` · Ref ${receipt.transactionReference}` : ""}
            </Text>
          </View>
          <Card>
            <Text style={ui.fieldLabel}>Received from</Text>
            <Text style={ui.tdStrong}>{receipt.customer?.legalName ?? "Customer"}</Text>
            {receipt.customer?.gstin ? <Text style={ui.hint}>GSTIN {receipt.customer.gstin}</Text> : null}
            {receipt.customer?.addressLines.map((line) => <Text key={line} style={ui.hint}>{line}</Text>)}
          </Card>
          <MetricRow>
            <Metric label="Received in bank" value={formatInr(receipt.bankAmount)} />
            {receipt.tdsAmount > 0 ? <Metric label="TDS deducted" value={formatInr(receipt.tdsAmount)} /> : null}
            <Metric label="Applied to invoices" value={formatInr(reversed ? 0 : receipt.allocated)} />
            {!reversed && receipt.unallocated > 0 ? <Metric label="Unallocated" value={formatInr(receipt.unallocated)} /> : null}
          </MetricRow>
          {receipt.allocations.length ? (
            <DataTable columns={columns} rows={receipt.allocations} rowKey={(row) => `${row.invoiceId}-${row.amount}-${row.status}`} />
          ) : (
            <Note>Not applied to any invoice yet.</Note>
          )}
          <Note>
            Recorded by {receipt.recordedBy ?? "—"}
            {receipt.recordedAt ? ` on ${formatDocDate(receipt.recordedAt)}` : ""}
            {receipt.depositAccountLabel ? ` · Deposited to ${receipt.depositAccountLabel}` : ""}
            {receipt.notes ? ` · ${receipt.notes}` : ""}
          </Note>
          {canRecord && !reversed ? (
            reversing ? (
              <Card tone="warning">
                <Field label="Reason for reversal" value={reason} onChangeText={setReason} placeholder="e.g. Cheque bounced" />
                <Note>The receipt and its allocations stay on record, marked reversed. The invoices it settled become open again.</Note>
                <View style={ui.row}>
                  <ActionButton label="Confirm reversal" kind="danger" busy={busy === "reverse"} onPress={() => void reverse()} />
                  <ActionButton label="Keep receipt" kind="secondary" onPress={() => setReversing(false)} />
                </View>
              </Card>
            ) : (
              <ActionButton label="Reverse receipt" kind="secondary" onPress={() => setReversing(true)} />
            )
          ) : null}
        </>
      ) : null}
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
    </FinanceSheet>
  );
}
