/**
 * Customer credit and refunds for one customer.
 *   - Customer credit = unapplied receipt money + credit-note credit above what the
 *     invoice still owed. It is held for the customer; nothing is paid automatically.
 *   - A refund is money actually returned, from one receipt or one credit note, never
 *     more than its refundable balance. Refunds are not deleted; a refund that did
 *     not go through is reversed with a reason.
 * Every figure comes from the database; a failed read shows "Unavailable", never ₹0.
 */
import {
  ActionButton,
  Card,
  Chip,
  DataTable,
  Field,
  Metric,
  MetricRow,
  Note,
  Pager,
  QueryState,
  Row,
  SectionTitle,
  StatusPill,
} from "@/features/invoicing/components/finance/FinanceUi";
import { invalidateFinanceBalances } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import {
  PAYMENT_MODE_LABELS,
  REGISTER_PAGE_SIZE,
  fetchCustomerCreditBalance,
  fetchRefundRegister,
  fetchRefundableSources,
  financeBooksKeys,
  newFinanceKey,
  paymentModeLabel,
  recordCustomerRefund,
  reverseCustomerRefund,
  type RefundMode,
  type RefundRow,
  type RefundableSource,
} from "@/features/invoicing/services/financeBooks.service";
import { exportFinanceCsv } from "@/features/invoicing/utils/financeDocumentOutput.util";
import { formatDocDate, formatInr, toCsv } from "@/features/invoicing/utils/financeDocuments.util";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

const REFUND_MODES: RefundMode[] = ["neft", "imps", "rtgs", "upi", "bank", "cheque", "cash", "other"];

function istToday(): string {
  const now = new Date();
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().slice(0, 10);
}

function sourceLabel(source: Pick<RefundableSource, "sourceType" | "sourceNumber" | "invoiceNumber">): string {
  return source.sourceType === "payment"
    ? `Receipt ${source.sourceNumber}`
    : `Credit note ${source.sourceNumber}${source.invoiceNumber ? ` on ${source.invoiceNumber}` : ""}`;
}

export function CustomerRefundsPanel({ orgId, clientId, clientName, canRecord }: { orgId: string; clientId: string; clientName: string; canRecord: boolean }) {
  const queryClient = useQueryClient();
  const balance = useQuery({
    queryKey: financeBooksKeys.customerCredit(orgId, clientId),
    queryFn: () => fetchCustomerCreditBalance(orgId, clientId),
    staleTime: 15_000,
  });
  const sources = useQuery({
    queryKey: financeBooksKeys.refundSources(orgId, clientId),
    queryFn: () => fetchRefundableSources(orgId, clientId),
    staleTime: 15_000,
  });
  const [offset, setOffset] = useState(0);
  const register = useQuery({
    queryKey: financeBooksKeys.refunds(orgId, clientId, offset),
    queryFn: () => fetchRefundRegister({ orgId, clientId, offset }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const [picked, setPicked] = useState<RefundableSource | null>(null);
  const [reversing, setReversing] = useState<RefundRow | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const b = balance.data?.data ?? null;
  const unavailable = balance.data?.error ? "Unavailable" : null;

  const refreshAll = async () => {
    await invalidateFinanceBalances(queryClient, orgId);
  };

  const sourceColumns = [
    { key: "source", label: "Refund from", render: (row: RefundableSource) => sourceLabel(row) },
    { key: "date", label: "Date", width: 100, render: (row: RefundableSource) => formatDocDate(row.sourceDate) },
    { key: "amount", label: "Original", width: 110, align: "right" as const, render: (row: RefundableSource) => formatInr(row.sourceAmount) },
    { key: "refunded", label: "Refunded", width: 110, align: "right" as const, render: (row: RefundableSource) => formatInr(row.refunded) },
    { key: "refundable", label: "Refundable", width: 120, align: "right" as const, render: (row: RefundableSource) => formatInr(row.refundable) },
  ];
  const refundColumns = [
    { key: "number", label: "Refund", width: 150, render: (row: RefundRow) => row.refundNumber },
    { key: "date", label: "Date", width: 100, render: (row: RefundRow) => formatDocDate(row.refundDate) },
    {
      key: "source",
      label: "From",
      render: (row: RefundRow) => `${row.sourceType === "payment" ? "Receipt" : "Credit note"} ${row.sourceNumber ?? ""}${row.invoiceNumber ? ` · ${row.invoiceNumber}` : ""}`,
    },
    { key: "mode", label: "Paid by", width: 150, render: (row: RefundRow) => `${paymentModeLabel(row.mode)}${row.reference ? ` · ${row.reference}` : ""}` },
    { key: "amount", label: "Amount", width: 110, align: "right" as const, render: (row: RefundRow) => formatInr(row.amount) },
    {
      key: "status",
      label: "Status",
      width: 100,
      render: (row: RefundRow) => <StatusPill label={row.status === "reversed" ? "Reversed" : "Paid out"} tone={row.status === "reversed" ? "muted" : "ok"} />,
    },
  ];

  const exportCsv = async () => {
    const all = await fetchRefundRegister({ orgId, clientId, offset: 0, limit: 200 });
    if (all.error) {
      setMessage({ text: all.error, tone: "error" });
      return;
    }
    const csv = toCsv(
      ["Refund", "Date", "Customer", "Source", "Source number", "Invoice", "Mode", "Reference", "Amount", "Status", "Reversal reason"],
      all.data.rows.map((row) => [
        row.refundNumber,
        row.refundDate,
        row.clientName ?? clientName,
        row.sourceType === "payment" ? "Receipt" : "Credit note",
        row.sourceNumber ?? "",
        row.invoiceNumber ?? "",
        paymentModeLabel(row.mode),
        row.reference ?? "",
        row.amount,
        row.status,
        row.reversalReason ?? "",
      ]),
    );
    await exportFinanceCsv(csv, `refunds-${clientName.replace(/[^A-Za-z0-9_-]+/g, "-")}.csv`);
  };

  return (
    <>
      <SectionTitle
        title="Customer credit and refunds"
        hint="Credit held for this customer from unapplied receipts and credit notes. A refund records money actually paid back."
      />
      <QueryState loading={balance.isLoading} error={balance.data?.error} unavailable={balance.data?.unavailable} empty={false} emptyText="" onRetry={() => void balance.refetch()} />
      <MetricRow>
        <Metric label="Unapplied receipts" value={unavailable ?? (b ? formatInr(b.unappliedReceipts) : "—")} />
        <Metric label="Credit-note credit" value={unavailable ?? (b ? formatInr(b.creditNoteCredit) : "—")} />
        <Metric label="Refundable now" value={unavailable ?? (b ? formatInr(b.refundableNow) : "—")} />
        <Metric label="Refunded so far" value={unavailable ?? (b ? formatInr(b.refundsRecorded) : "—")} />
      </MetricRow>
      {b && b.unappliedReceipts > 0 ? (
        <Note>Unapplied receipt money can also be applied to open invoices from the receipt. TDS is not cash and is never refundable.</Note>
      ) : null}

      <QueryState
        loading={sources.isLoading}
        error={sources.data?.error}
        unavailable={sources.data?.unavailable}
        empty={!sources.isLoading && (sources.data?.data.length ?? 0) === 0 && !sources.data?.error}
        emptyText="Nothing is refundable for this customer."
        onRetry={() => void sources.refetch()}
      />
      {(sources.data?.data.length ?? 0) >= 200 ? (
        <Note>Showing the 200 oldest refundable receipts and credit notes. Refund or apply these to see the rest.</Note>
      ) : null}
      <DataTable
        columns={sourceColumns}
        rows={sources.data?.data ?? []}
        rowKey={(row) => `${row.sourceType}:${row.sourceId}`}
        selectedKey={picked ? `${picked.sourceType}:${picked.sourceId}` : null}
        onPressRow={canRecord ? (row) => { setPicked(row); setMessage(null); } : undefined}
        rowLabel={(row) => `${sourceLabel(row)}, refundable ${formatInr(row.refundable)}`}
      />
      {canRecord && picked ? (
        <RefundForm
          orgId={orgId}
          source={picked}
          onCancel={() => setPicked(null)}
          onDone={async (text) => {
            setPicked(null);
            setMessage({ text, tone: "success" });
            await refreshAll();
          }}
        />
      ) : null}

      <SectionTitle
        title="Refunds"
        actions={<ActionButton label="Export CSV" kind="secondary" disabled={(register.data?.data.total ?? 0) === 0} onPress={() => void exportCsv()} />}
      />
      <QueryState
        loading={register.isLoading}
        error={register.data?.error}
        unavailable={register.data?.unavailable}
        empty={!register.isLoading && (register.data?.data.rows.length ?? 0) === 0 && !register.data?.error}
        emptyText="No refunds recorded for this customer."
        onRetry={() => void register.refetch()}
      />
      <DataTable
        columns={refundColumns}
        rows={register.data?.data.rows ?? []}
        rowKey={(row) => row.refundId}
        selectedKey={reversing?.refundId ?? null}
        onPressRow={canRecord ? (row) => setReversing(row.status === "recorded" ? row : null) : undefined}
        rowLabel={(row) => `Refund ${row.refundNumber} ${formatInr(row.amount)}`}
        rowTone={(row) => (row.status === "reversed" ? "muted" : null)}
      />
      <Pager offset={offset} pageSize={REGISTER_PAGE_SIZE} total={register.data?.data.total ?? 0} onChange={setOffset} />
      {canRecord && reversing ? (
        <ReverseRefund
          orgId={orgId}
          refund={reversing}
          onCancel={() => setReversing(null)}
          onDone={async (text) => {
            setReversing(null);
            setMessage({ text, tone: "success" });
            await refreshAll();
          }}
        />
      ) : null}
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
    </>
  );
}

function RefundForm({
  orgId,
  source,
  onCancel,
  onDone,
}: {
  orgId: string;
  source: RefundableSource;
  onCancel: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [amountText, setAmountText] = useState(source.refundable.toFixed(2));
  const [date, setDate] = useState(istToday());
  const [mode, setMode] = useState<RefundMode>("neft");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const amount = Number(amountText.replace(/,/g, ""));
  const valid = Number.isFinite(amount) && amount > 0 && Math.abs(Math.round(amount * 100) - amount * 100) < 1e-6 && amount <= source.refundable;
  const touched = () => {
    key.current = null;
    setConfirming(false);
    setError(null);
  };

  const submit = async () => {
    key.current = key.current ?? newFinanceKey("refund");
    setBusy(true);
    const result = await recordCustomerRefund({
      orgId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      refundDate: date,
      amount: Math.round(amount * 100) / 100,
      mode,
      reference,
      notes,
      idempotencyKey: key.current,
    });
    setBusy(false);
    setConfirming(false);
    if (result.error || !result.refund) {
      setError(result.error ?? "The refund was not recorded.");
      return;
    }
    key.current = null;
    await onDone(`${result.refund.refundNumber} recorded: ${formatInr(result.refund.amount)} refunded from ${sourceLabel(source)}.`);
  };

  return (
    <Card>
      <SectionTitle title={`Refund from ${sourceLabel(source)}`} hint={`Up to ${formatInr(source.refundable)} can be refunded from this source.`} />
      <Row>
        <Field label="Refund amount (₹)" value={amountText} keyboardType="decimal-pad" width={180} onChangeText={(next) => { setAmountText(next); touched(); }} />
        <Field label="Refund date (YYYY-MM-DD)" value={date} width={180} onChangeText={(next) => { setDate(next.trim()); touched(); }} />
      </Row>
      <Row>
        {REFUND_MODES.map((option) => (
          <Chip key={option} label={PAYMENT_MODE_LABELS[option]} active={mode === option} onPress={() => { setMode(option); touched(); }} />
        ))}
      </Row>
      <Row>
        <Field label="Transfer reference (UTR / cheque no.)" value={reference} onChangeText={(next) => { setReference(next); touched(); }} />
        <Field label="Notes" value={notes} onChangeText={(next) => { setNotes(next); touched(); }} />
      </Row>
      {!valid && amountText.trim() ? (
        <Note tone="error">Enter an amount greater than zero, with at most two decimals, up to {formatInr(source.refundable)}.</Note>
      ) : null}
      {confirming ? (
        <Row>
          <Note tone="warning">Record {formatInr(amount)} paid back to the customer by {PAYMENT_MODE_LABELS[mode]} on {formatDocDate(date)}? A refund cannot be edited; it can only be reversed.</Note>
          <ActionButton label="Confirm refund" busy={busy} onPress={() => void submit()} />
          <ActionButton label="Review again" kind="secondary" onPress={() => setConfirming(false)} />
        </Row>
      ) : (
        <Row>
          <ActionButton label="Record refund" disabled={!valid} onPress={() => setConfirming(true)} />
          <ActionButton label="Cancel" kind="secondary" onPress={onCancel} />
        </Row>
      )}
      {error ? <Note tone="error">{error}</Note> : null}
    </Card>
  );
}

function ReverseRefund({
  orgId,
  refund,
  onCancel,
  onDone,
}: {
  orgId: string;
  refund: RefundRow;
  onCancel: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  const submit = async () => {
    key.current = key.current ?? newFinanceKey("refund-reverse");
    setBusy(true);
    const result = await reverseCustomerRefund({ orgId, refundId: refund.refundId, reason: reason.trim(), idempotencyKey: key.current });
    setBusy(false);
    setConfirming(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    key.current = null;
    await onDone(`${refund.refundNumber} reversed. ${formatInr(refund.amount)} is refundable again.`);
  };

  return (
    <Card tone="warning">
      <SectionTitle
        title={`Reverse refund ${refund.refundNumber}`}
        hint="Use this when the money did not reach the customer or the refund was entered in error. The refund stays on record as reversed."
      />
      <Field label="Reason" value={reason} onChangeText={(next) => { setReason(next); key.current = null; setConfirming(false); }} placeholder="e.g. Transfer bounced" />
      {confirming ? (
        <Row>
          <Note tone="warning">Reverse {formatInr(refund.amount)} refunded on {formatDocDate(refund.refundDate)}?</Note>
          <ActionButton label="Confirm reversal" kind="danger" busy={busy} onPress={() => void submit()} />
          <ActionButton label="Keep refund" kind="secondary" onPress={() => setConfirming(false)} />
        </Row>
      ) : (
        <Row>
          <ActionButton label="Reverse refund" kind="danger" disabled={!reason.trim()} onPress={() => setConfirming(true)} />
          <ActionButton label="Cancel" kind="secondary" onPress={onCancel} />
        </Row>
      )}
      {error ? <Note tone="error">{error}</Note> : null}
    </Card>
  );
}
