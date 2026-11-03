/**
 * Receipts for the selected client in the invoice workspace.
 *
 * Invoice receipts come from the invoice payment ledger (invoice_payments).
 * Trip-ledger receipts (customer money recorded on trips) are listed separately
 * and never count toward an invoice until someone links one explicitly; the link
 * records one invoice payment for exactly the trip-ledger amount and leaves the
 * trip ledger unchanged.
 */
import { InvoiceArPanel } from "@/features/invoicing/components/InvoiceArPanel";
import {
  ActionButton,
  Card,
  Chip,
  DataTable,
  DateRangeFields,
  FinancePage,
  Metric,
  MetricRow,
  Note,
  Pager,
  QueryState,
  Row,
  SectionTitle,
  StatusPill,
  ui,
  type DateRange,
} from "@/features/invoicing/components/finance/FinanceUi";
import { invalidateFinanceBalances, PaymentReceiptSheet } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import {
  REGISTER_PAGE_SIZE,
  fetchOpenInvoicesForClient,
  fetchPaymentRegister,
  fetchTripLedgerReceipts,
  financeBooksKeys,
  linkTripLedgerReceipt,
  newFinanceKey,
  paymentModeLabel,
  type InvoiceRegisterRow,
  type PaymentRegisterRow,
  type TripLedgerReceipt,
} from "@/features/invoicing/services/financeBooks.service";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import { fetchCustomerReceipts } from "@/features/invoicing/services/customerReceiptList.service";
import type { CustomerReceipt } from "@/features/invoicing/utils/customerReceiptList.util";
import { formatDocDate, formatInr } from "@/features/invoicing/utils/financeDocuments.util";
import { allocateOldestFirst } from "@/features/invoicing/utils/financeReceipt.util";
import { useCapabilities } from "@/lib/useCapabilities";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

export function InvoiceReceiptsPanel({
  orgId,
  clientId,
  clientName,
  trips = [],
  invoices = [],
  onRecorded,
  onTripsChanged,
  embedded = false,
  recordedOnly = false,
}: {
  orgId: string | null;
  clientId: string | null;
  clientName: string | null;
  trips?: readonly InvoicingTripView[];
  invoices?: readonly IssuedInvoiceListRow[];
  onRecorded?: () => void;
  onTripsChanged?: () => void;
  /** Inside the customer ledger: no second page title, and no second capture button. */
  embedded?: boolean;
  /** The payment book is missing, so list receipts already posted to the trip ledger. */
  recordedOnly?: boolean;
}) {
  const caps = useCapabilities();
  const canRecord = caps.includes("finance_manage");
  const [view, setView] = useState<"invoice" | "trip">("invoice");
  const [offset, setOffset] = useState(0);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const linkedClient = clientId && !clientId.startsWith("name:") ? clientId : null;

  const register = useQuery({
    queryKey: financeBooksKeys.paymentRegister(orgId ?? "none", linkedClient, null, null, "", offset),
    queryFn: () => fetchPaymentRegister({ orgId: orgId!, clientId: linkedClient, offset }),
    enabled: Boolean(orgId && linkedClient) && view === "invoice" && !recordedOnly,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  if (!clientName) {
    return (
      <View style={styles.empty}>
        <Text style={ui.title}>Select a client</Text>
        <Text style={ui.hint}>Receipts for the client on the left are listed here.</Text>
      </View>
    );
  }
  if (!orgId || !linkedClient) {
    return (
      <FinancePage>
        <SectionTitle title="Receipts" />
        <Note>This customer is not linked to a client record, so receipts cannot be recorded against its invoices. Link the client on its trips first.</Note>
      </FinancePage>
    );
  }

  const booksDown = recordedOnly || register.data?.unavailable === true;
  const rows = register.data?.data.rows ?? [];
  const columns = [
    { key: "number", label: "Receipt", width: 150, render: (row: PaymentRegisterRow) => row.receiptNumber },
    { key: "date", label: "Date", width: 100, render: (row: PaymentRegisterRow) => formatDocDate(row.paymentDate) },
    { key: "mode", label: "Mode / reference", render: (row: PaymentRegisterRow) => `${paymentModeLabel(row.paymentMode)}${row.reference ? ` · ${row.reference}` : ""}` },
    { key: "bank", label: "Bank", width: 110, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.bankAmount) },
    { key: "tds", label: "TDS", width: 90, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.tdsAmount) },
    { key: "applied", label: "Applied", width: 110, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.allocated) },
    { key: "unalloc", label: "On account", width: 110, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.unallocated) },
    {
      key: "status",
      label: "Status",
      width: 100,
      render: (row: PaymentRegisterRow) => <StatusPill label={row.status === "reversed" ? "Reversed" : "Active"} tone={row.status === "reversed" ? "bad" : "ok"} />,
    },
  ];

  const body = (
    <>
      {embedded ? null : (
      <SectionTitle
        title="Receipts"
        hint="Receipts recorded against invoices. Reversed receipts stay listed and marked; they settle nothing."
        actions={
          <InvoiceArPanel
            captureOnly
            orgId={orgId}
            clientId={clientId}
            clientName={clientName}
            trips={trips}
            invoices={invoices}
            onRecorded={() => {
              void register.refetch();
              onRecorded?.();
            }}
            onTripsChanged={onTripsChanged}
          />
        }
      />
      )}
      {booksDown ? (
        <RecordedReceiptBook orgId={orgId} clientId={linkedClient} clientName={clientName} />
      ) : (
      <>
      <Row>
        <Chip label="Invoice receipts" active={view === "invoice"} onPress={() => { setView("invoice"); setOffset(0); }} />
        <Chip label="Trip-ledger receipts" active={view === "trip"} onPress={() => { setView("trip"); setOffset(0); }} />
      </Row>
      {view === "invoice" ? (
        <>
          <QueryState
            loading={register.isLoading}
            error={register.data?.error}
            empty={!register.isLoading && rows.length === 0 && !register.data?.error}
            emptyText="No receipts yet. Capture a payment to record one."
            onRetry={() => void register.refetch()}
          />
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.paymentId}
            onPressRow={(row) => setReceiptId(row.paymentId)}
            rowLabel={(row) => `Receipt ${row.receiptNumber}, ${formatInr(row.bankAmount)}`}
            rowTone={(row) => (row.status === "reversed" ? "muted" : null)}
          />
          <Pager offset={offset} pageSize={REGISTER_PAGE_SIZE} total={register.data?.data.total ?? 0} onChange={setOffset} />
        </>
      ) : (
        <TripLedgerReceipts orgId={orgId} clientId={linkedClient} canRecord={canRecord} onLinked={(paymentId) => setReceiptId(paymentId)} />
      )}
      </>
      )}
      <PaymentReceiptSheet orgId={orgId} paymentId={receiptId} canRecord={canRecord} onClose={() => setReceiptId(null)} />
    </>
  );
  return embedded ? body : <FinancePage>{body}</FinancePage>;
}

function RecordedReceiptBook({
  orgId,
  clientId,
  clientName,
}: {
  orgId: string;
  clientId: string;
  clientName: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const query = useQuery({
    queryKey: ["customer-receipts", orgId, clientId, clientName],
    queryFn: () => fetchCustomerReceipts({ orgId, clientId, clientName }),
    staleTime: 15_000,
  });
  const receipts = query.data?.receipts ?? [];
  const shown = receipts.filter((receipt) => {
    const day = receipt.date.slice(0, 10);
    if (range.from && day < range.from) return false;
    if (range.to && day > range.to) return false;
    return true;
  });
  const selected = shown.find((receipt) => receipt.id === selectedId) ?? null;
  const bank = shown.reduce((sum, receipt) => sum + receipt.bank, 0);
  const tds = shown.reduce((sum, receipt) => sum + receipt.tds, 0);
  const columns = [
    { key: "date", label: "Date", width: 110, render: (row: CustomerReceipt) => formatDocDate(row.date) },
    { key: "ref", label: "Reference", width: 140, render: (row: CustomerReceipt) => row.reference ?? "—" },
    { key: "invoice", label: "Invoice", width: 140, render: (row: CustomerReceipt) => row.invoiceNumber ?? "—" },
    { key: "bank", label: "Bank", width: 110, align: "right" as const, render: (row: CustomerReceipt) => formatInr(row.bank) },
    { key: "tds", label: "TDS", width: 100, align: "right" as const, render: (row: CustomerReceipt) => formatInr(row.tds) },
    { key: "total", label: "Total", width: 110, align: "right" as const, render: (row: CustomerReceipt) => formatInr(row.total) },
  ];
  return (
    <>
      <DateRangeFields value={range} onChange={setRange} />
      <MetricRow>
        <Metric label="Bank received" value={formatInr(bank)} />
        <Metric label="TDS kept by the client" value={formatInr(tds)} />
        <Metric label="Receipts" value={String(shown.length)} />
      </MetricRow>
      <QueryState
        loading={query.isLoading}
        error={query.data?.error}
        empty={!query.isLoading && shown.length === 0 && !query.data?.error}
        emptyText={receipts.length === 0 ? "No receipts yet. Capture a payment to record one." : "No receipts in this period."}
        onRetry={() => void query.refetch()}
      />
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(row) => row.id}
        selectedKey={selected?.id ?? null}
        onPressRow={(row) => setSelectedId((current) => (current === row.id ? null : row.id))}
        rowLabel={(row) => `Receipt ${formatDocDate(row.date)} ${formatInr(row.total)}`}
      />
      {selected ? (
        <Card>
          <SectionTitle
            title={selected.invoiceNumber ? `Invoice ${selected.invoiceNumber}` : "Receipt"}
            hint={[formatDocDate(selected.date), selected.reference].filter(Boolean).join(" · ")}
          />
          <DataTable
            columns={[
              { key: "trip", label: "Trip", render: (row: CustomerReceipt["trips"][number]) => row.label },
              { key: "bank", label: "Bank", width: 110, align: "right" as const, render: (row: CustomerReceipt["trips"][number]) => formatInr(row.bank) },
              { key: "tds", label: "TDS", width: 100, align: "right" as const, render: (row: CustomerReceipt["trips"][number]) => formatInr(row.tds) },
              { key: "due", label: "Clears", width: 110, align: "right" as const, render: (row: CustomerReceipt["trips"][number]) => formatInr(row.bank + row.tds) },
            ]}
            rows={selected.trips}
            rowKey={(row) => `${row.tripId ?? row.label}`}
          />
        </Card>
      ) : null}
    </>
  );
}

function TripLedgerReceipts({
  orgId,
  clientId,
  canRecord,
  onLinked,
}: {
  orgId: string;
  clientId: string;
  canRecord: boolean;
  onLinked: (paymentId: string | null) => void;
}) {
  const [onlyUnlinked, setOnlyUnlinked] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<TripLedgerReceipt | null>(null);
  const query = useQuery({
    queryKey: financeBooksKeys.tripLedgerReceipts(orgId, clientId, onlyUnlinked, offset),
    queryFn: () => fetchTripLedgerReceipts({ orgId, clientId, onlyUnlinked, offset }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const rows = query.data?.data.rows ?? [];
  const columns = [
    { key: "date", label: "Date", width: 100, render: (row: TripLedgerReceipt) => formatDocDate(row.date) },
    { key: "desc", label: "Trip ledger entry", render: (row: TripLedgerReceipt) => row.description ?? row.reference ?? "—" },
    { key: "cat", label: "Kind", width: 120, render: (row: TripLedgerReceipt) => (row.category === "tds_receivable" ? "TDS" : row.category ? "Receipt" : "Money in") },
    { key: "amount", label: "Amount", width: 120, align: "right" as const, render: (row: TripLedgerReceipt) => formatInr(row.amount) },
    {
      key: "link",
      label: "Invoice payment",
      width: 160,
      render: (row: TripLedgerReceipt) =>
        row.linkedReceiptNumber ? <StatusPill label={row.linkedReceiptNumber} tone="ok" /> : <StatusPill label="Not linked" tone="warn" />,
    },
  ];
  return (
    <>
      <Note>
        Money this customer paid that was recorded on the trip ledger. It does not settle any invoice until you link it here.
        Linking records one invoice payment for exactly this amount; the trip ledger entry is not changed.
      </Note>
      <Row>
        <Chip label="Not linked" active={onlyUnlinked} onPress={() => { setOnlyUnlinked(true); setOffset(0); }} />
        <Chip label="All" active={!onlyUnlinked} onPress={() => { setOnlyUnlinked(false); setOffset(0); }} />
      </Row>
      <QueryState
        loading={query.isLoading}
        error={query.data?.error}
        unavailable={query.data?.unavailable}
        empty={!query.isLoading && rows.length === 0 && !query.data?.error}
        emptyText={onlyUnlinked ? "Every trip-ledger receipt of this customer is linked, or there are none." : "No trip-ledger receipts for this customer."}
        onRetry={() => void query.refetch()}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.transactionId}
        selectedKey={selected?.transactionId ?? null}
        onPressRow={(row) => setSelected(row.linkedPaymentId ? null : row)}
        rowLabel={(row) => `Trip ledger receipt ${formatDocDate(row.date)} ${formatInr(row.amount)}`}
        rowTone={(row) => (row.linkedPaymentId ? "muted" : null)}
      />
      <Pager offset={offset} pageSize={REGISTER_PAGE_SIZE} total={query.data?.data.total ?? 0} onChange={setOffset} />
      {selected && canRecord ? (
        <LinkTripReceipt
          orgId={orgId}
          clientId={clientId}
          receipt={selected}
          onDone={(paymentId) => {
            setSelected(null);
            onLinked(paymentId);
          }}
        />
      ) : null}
      {selected && !canRecord ? <Note tone="warning">Linking needs finance permission.</Note> : null}
    </>
  );
}

function LinkTripReceipt({
  orgId,
  clientId,
  receipt,
  onDone,
}: {
  orgId: string;
  clientId: string;
  receipt: TripLedgerReceipt;
  onDone: (paymentId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const open = useQuery({
    queryKey: [...financeBooksKeys.invoiceRegister(orgId, clientId, null, null, 0, true), "all-open"],
    queryFn: () => fetchOpenInvoicesForClient(orgId, clientId),
    staleTime: 15_000,
  });
  const invoices = open.data?.data ?? [];
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const allocations = invoices
    .map((row) => ({ invoiceId: row.invoiceId, amount: Math.round(Number((applied[row.invoiceId] ?? "").replace(/,/g, "")) * 100) / 100 }))
    .filter((row) => Number.isFinite(row.amount) && row.amount > 0);
  const total = allocations.reduce((sum, row) => sum + row.amount, 0);
  const over = invoices.find((row) => (allocations.find((a) => a.invoiceId === row.invoiceId)?.amount ?? 0) > row.outstanding);
  const problem = total > receipt.amount ? `More than the trip-ledger amount of ${formatInr(receipt.amount)} is applied.` : over ? `More than ${over.invoiceNumber}'s outstanding is applied.` : null;

  const submit = async () => {
    key.current = key.current ?? newFinanceKey("link");
    setBusy(true);
    setMessage(null);
    const result = await linkTripLedgerReceipt({ orgId, transactionId: receipt.transactionId, clientId, allocations, idempotencyKey: key.current });
    setBusy(false);
    setConfirming(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    key.current = null;
    await invalidateFinanceBalances(queryClient, orgId);
    onDone(null);
  };

  const columns = [
    { key: "number", label: "Invoice", render: (row: InvoiceRegisterRow) => row.invoiceNumber },
    { key: "due", label: "Due", width: 100, render: (row: InvoiceRegisterRow) => formatDocDate(row.dueDate ?? row.invoiceDate) },
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
            key.current = null;
            setConfirming(false);
          }}
          keyboardType="decimal-pad"
          placeholder="0.00"
          accessibilityLabel={`Amount of this receipt to apply to ${row.invoiceNumber}`}
        />
      ),
    },
  ];

  return (
    <Card tone="warning">
      <SectionTitle
        title={`Link ${formatInr(receipt.amount)} from ${formatDocDate(receipt.date)}`}
        hint={receipt.description ?? receipt.reference ?? "Trip ledger receipt"}
        actions={
          invoices.length ? (
            <ActionButton
              label="Apply oldest first"
              kind="secondary"
              onPress={() => {
                const plan = allocateOldestFirst(receipt.amount, invoices.map((row) => ({ id: row.invoiceId, outstanding: row.outstanding })));
                setApplied(Object.fromEntries(plan.map((row) => [row.id, row.amount.toFixed(2)])));
                key.current = null;
              }}
            />
          ) : null
        }
      />
      <QueryState
        loading={open.isLoading}
        error={open.data?.error}
        empty={!open.isLoading && invoices.length === 0}
        emptyText="No open invoices. Linking now keeps the whole amount on account."
      />
      <DataTable columns={columns} rows={invoices} rowKey={(row) => row.invoiceId} />
      <Note>
        Applied {formatInr(total)} · on account {formatInr(Math.max(receipt.amount - total, 0))}. Check this money was not already recorded as an invoice
        receipt — the link records it once more in the invoice payment ledger.
      </Note>
      {problem ? <Note tone="error">{problem}</Note> : null}
      {confirming ? (
        <Row>
          <Note tone="warning">Record {formatInr(receipt.amount)} as an invoice payment for this customer?</Note>
          <ActionButton label="Confirm link" busy={busy} onPress={() => void submit()} />
          <ActionButton label="Back" kind="secondary" onPress={() => setConfirming(false)} />
        </Row>
      ) : (
        <Row>
          <ActionButton label="Link to invoices" disabled={Boolean(problem)} onPress={() => setConfirming(true)} />
          <ActionButton label="Cancel" kind="secondary" onPress={() => onDone(null)} />
        </Row>
      )}
      {message ? <Note tone="error">{message}</Note> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 6 },
});
