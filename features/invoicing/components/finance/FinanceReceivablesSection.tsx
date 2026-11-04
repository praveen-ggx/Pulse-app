/**
 * Receivables: org aging by customer, then one customer's open invoices,
 * receipts and receipt entry. Outstanding = issued total − confirmed allocations −
 * issued credit notes, from the database.
 */
import { CustomerReceiptForm } from "@/features/invoicing/components/finance/CustomerReceiptForm";
import { CustomerRefundsPanel } from "@/features/invoicing/components/finance/CustomerRefundsPanel";
import { FinanceDashboardPanel } from "@/features/invoicing/components/finance/FinanceDashboardPanel";
import {
  ActionButton,
  Chip,
  DataTable,
  FinancePage,
  Metric,
  MetricRow,
  Pager,
  QueryState,
  Row,
  SectionTitle,
  StatusPill,
} from "@/features/invoicing/components/finance/FinanceUi";
import { PaymentReceiptSheet } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import {
  REGISTER_PAGE_SIZE,
  fetchInvoiceRegister,
  fetchOrgAging,
  fetchPaymentRegister,
  financeBooksKeys,
  paymentModeLabel,
  type AgingRow,
  type InvoiceRegisterRow,
  type PaymentRegisterRow,
} from "@/features/invoicing/services/financeBooks.service";
import { formatDocDate, formatInr } from "@/features/invoicing/utils/financeDocuments.util";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const AGING_PAGE = 100;

export function invoiceStatusPill(row: Pick<InvoiceRegisterRow, "status" | "outstanding" | "received" | "credited" | "dueDate">) {
  if (row.status === "cancelled") return <StatusPill label="Cancelled" tone="muted" />;
  if (row.outstanding <= 0) return <StatusPill label="Paid" tone="ok" />;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = row.dueDate != null && row.dueDate < today;
  if (row.received + row.credited > 0) return <StatusPill label={overdue ? "Part paid · overdue" : "Part paid"} tone={overdue ? "bad" : "warn"} />;
  return <StatusPill label={overdue ? "Overdue" : "Unpaid"} tone={overdue ? "bad" : "warn"} />;
}

export function FinanceReceivablesSection({
  orgId,
  clientId,
  clientName,
  canRecord,
}: {
  orgId: string;
  clientId: string | null;
  clientName: string | null;
  canRecord: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(clientId ? { id: clientId, name: clientName ?? "Customer" } : null);
  useEffect(() => {
    if (clientId) setPicked({ id: clientId, name: clientName ?? "Customer" });
  }, [clientId, clientName]);

  const aging = useQuery({
    queryKey: financeBooksKeys.aging(orgId, offset),
    queryFn: () => fetchOrgAging(orgId, offset, AGING_PAGE),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const rows = aging.data?.data.rows ?? [];
  const totals = rows.reduce(
    (sum, row) => ({
      outstanding: sum.outstanding + row.outstanding,
      current: sum.current + row.current,
      overdue: sum.overdue + row.days1To30 + row.days31To60 + row.days61To90 + row.daysOver90,
      over90: sum.over90 + row.daysOver90,
    }),
    { outstanding: 0, current: 0, overdue: 0, over90: 0 },
  );
  const multiPage = (aging.data?.data.total ?? 0) > AGING_PAGE;

  const columns = [
    { key: "client", label: "Customer", render: (row: AgingRow) => row.clientName },
    { key: "count", label: "Invoices", width: 70, align: "right" as const, render: (row: AgingRow) => String(row.invoiceCount) },
    { key: "current", label: "Current", width: 110, align: "right" as const, render: (row: AgingRow) => formatInr(row.current) },
    { key: "b1", label: "1–30", width: 105, align: "right" as const, render: (row: AgingRow) => formatInr(row.days1To30) },
    { key: "b2", label: "31–60", width: 105, align: "right" as const, render: (row: AgingRow) => formatInr(row.days31To60) },
    { key: "b3", label: "61–90", width: 105, align: "right" as const, render: (row: AgingRow) => formatInr(row.days61To90) },
    { key: "b4", label: "90+", width: 105, align: "right" as const, render: (row: AgingRow) => formatInr(row.daysOver90) },
    { key: "out", label: "Outstanding", width: 125, align: "right" as const, render: (row: AgingRow) => formatInr(row.outstanding) },
  ];

  return (
    <FinancePage>
      <SectionTitle
        title="Receivables"
        hint="Open invoices by customer and age past due. Receipts and credit notes reduce the balance; issued totals never change."
      />
      <FinanceDashboardPanel orgId={orgId} />
      <SectionTitle title="By customer" />
      <MetricRow>
        <Metric label={multiPage ? "Outstanding (this page)" : "Outstanding"} value={formatInr(totals.outstanding)} />
        <Metric label="Current (not yet due)" value={formatInr(totals.current)} />
        <Metric label="Overdue" value={formatInr(totals.overdue)} tone={totals.overdue > 0 ? "danger" : undefined} />
        <Metric label="Over 90 days" value={formatInr(totals.over90)} tone={totals.over90 > 0 ? "danger" : undefined} />
      </MetricRow>
      <QueryState
        loading={aging.isLoading}
        error={aging.data?.error}
        unavailable={aging.data?.unavailable}
        empty={!aging.isLoading && rows.length === 0 && !aging.data?.error}
        emptyText="No open receivables. Every issued invoice is settled."
        onRetry={() => void aging.refetch()}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.clientId}
        selectedKey={picked?.id ?? null}
        onPressRow={(row) => setPicked({ id: row.clientId, name: row.clientName })}
        rowLabel={(row) => `${row.clientName}, outstanding ${formatInr(row.outstanding)}`}
      />
      <Pager offset={offset} pageSize={AGING_PAGE} total={aging.data?.data.total ?? 0} onChange={setOffset} fetching={aging.isFetching && !aging.isLoading} />
      {picked ? <CustomerReceivables orgId={orgId} clientId={picked.id} clientName={picked.name} canRecord={canRecord} /> : null}
    </FinancePage>
  );
}

function CustomerReceivables({
  orgId,
  clientId,
  clientName,
  canRecord,
}: {
  orgId: string;
  clientId: string;
  clientName: string;
  canRecord: boolean;
}) {
  const [view, setView] = useState<"open" | "all" | "receipts" | "record" | "credit">("open");
  const [offset, setOffset] = useState(0);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  useEffect(() => setOffset(0), [view, clientId]);

  const invoices = useQuery({
    queryKey: financeBooksKeys.invoiceRegister(orgId, clientId, null, null, offset, view === "open"),
    queryFn: () => fetchInvoiceRegister({ orgId, clientId, offset, openOnly: view === "open" }),
    enabled: view === "open" || view === "all",
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const receipts = useQuery({
    queryKey: financeBooksKeys.paymentRegister(orgId, clientId, null, null, "", offset),
    queryFn: () => fetchPaymentRegister({ orgId, clientId, offset }),
    enabled: view === "receipts",
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const invoiceRows = invoices.data?.data.rows ?? [];

  const invoiceColumns = [
    { key: "number", label: "Invoice", render: (row: InvoiceRegisterRow) => row.invoiceNumber },
    { key: "date", label: "Date", width: 100, render: (row: InvoiceRegisterRow) => formatDocDate(row.invoiceDate) },
    { key: "due", label: "Due", width: 100, render: (row: InvoiceRegisterRow) => formatDocDate(row.dueDate) },
    { key: "total", label: "Total", width: 110, align: "right" as const, render: (row: InvoiceRegisterRow) => formatInr(row.total) },
    { key: "received", label: "Received", width: 110, align: "right" as const, render: (row: InvoiceRegisterRow) => formatInr(row.received) },
    { key: "credited", label: "Credited", width: 100, align: "right" as const, render: (row: InvoiceRegisterRow) => formatInr(row.credited) },
    { key: "open", label: "Outstanding", width: 120, align: "right" as const, render: (row: InvoiceRegisterRow) => formatInr(row.outstanding) },
    { key: "status", label: "Status", width: 140, render: (row: InvoiceRegisterRow) => invoiceStatusPill(row) },
  ];
  const receiptColumns = [
    { key: "number", label: "Receipt", width: 150, render: (row: PaymentRegisterRow) => row.receiptNumber },
    { key: "date", label: "Date", width: 100, render: (row: PaymentRegisterRow) => formatDocDate(row.paymentDate) },
    { key: "mode", label: "Mode / reference", render: (row: PaymentRegisterRow) => `${paymentModeLabel(row.paymentMode)}${row.reference ? ` · ${row.reference}` : ""}` },
    { key: "bank", label: "Bank", width: 110, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.bankAmount) },
    { key: "tds", label: "TDS", width: 90, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.tdsAmount) },
    { key: "unalloc", label: "On account", width: 110, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.unallocated) },
    { key: "refunded", label: "Refunded", width: 100, align: "right" as const, render: (row: PaymentRegisterRow) => (row.refunded > 0 ? formatInr(row.refunded) : "—") },
    {
      key: "status",
      label: "Status",
      width: 100,
      render: (row: PaymentRegisterRow) => <StatusPill label={row.status === "reversed" ? "Reversed" : "Active"} tone={row.status === "reversed" ? "bad" : "ok"} />,
    },
  ];

  return (
    <>
      <SectionTitle title={clientName} hint="Open invoices, receipts and receipt entry for this customer." />
      <Row>
        <Chip label="Open invoices" active={view === "open"} onPress={() => setView("open")} />
        <Chip label="All invoices" active={view === "all"} onPress={() => setView("all")} />
        <Chip label="Receipts" active={view === "receipts"} onPress={() => setView("receipts")} />
        <Chip label="Record receipt" active={view === "record"} onPress={() => setView("record")} />
        <Chip label="Customer credit and refunds" active={view === "credit"} onPress={() => setView("credit")} />
      </Row>
      {view === "credit" ? (
        <CustomerRefundsPanel orgId={orgId} clientId={clientId} clientName={clientName} canRecord={canRecord} />
      ) : view === "record" ? (
        <CustomerReceiptForm
          orgId={orgId}
          clientId={clientId}
          clientName={clientName}
          canRecord={canRecord}
          onRecorded={(paymentId) => setReceiptId(paymentId)}
        />
      ) : view === "receipts" ? (
        <>
          <QueryState
            loading={receipts.isLoading}
            error={receipts.data?.error}
            unavailable={receipts.data?.unavailable}
            empty={!receipts.isLoading && (receipts.data?.data.rows.length ?? 0) === 0 && !receipts.data?.error}
            emptyText="No receipts recorded for this customer."
            onRetry={() => void receipts.refetch()}
          />
          <DataTable
            columns={receiptColumns}
            rows={receipts.data?.data.rows ?? []}
            rowKey={(row) => row.paymentId}
            onPressRow={(row) => setReceiptId(row.paymentId)}
            rowLabel={(row) => `Receipt ${row.receiptNumber}`}
            rowTone={(row) => (row.status === "reversed" ? "muted" : null)}
          />
          <Pager offset={offset} pageSize={REGISTER_PAGE_SIZE} total={receipts.data?.data.total ?? 0} onChange={setOffset} />
        </>
      ) : (
        <>
          <QueryState
            loading={invoices.isLoading}
            error={invoices.data?.error}
            unavailable={invoices.data?.unavailable}
            empty={!invoices.isLoading && invoiceRows.length === 0 && !invoices.data?.error}
            emptyText={view === "open" ? "No open invoices. This customer is fully settled." : "No issued invoices for this customer."}
            onRetry={() => void invoices.refetch()}
          />
          <DataTable columns={invoiceColumns} rows={invoiceRows} rowKey={(row) => row.invoiceId} rowTone={(row) => (row.status === "cancelled" ? "muted" : null)} />
          <Pager offset={offset} pageSize={REGISTER_PAGE_SIZE} total={invoices.data?.data.total ?? 0} onChange={setOffset} />
          {canRecord && view === "open" && invoiceRows.length > 0 ? (
            <ActionButton label="Record a receipt" onPress={() => setView("record")} />
          ) : null}
        </>
      )}
      <PaymentReceiptSheet orgId={orgId} paymentId={receiptId} canRecord={canRecord} onClose={() => setReceiptId(null)} />
    </>
  );
}
