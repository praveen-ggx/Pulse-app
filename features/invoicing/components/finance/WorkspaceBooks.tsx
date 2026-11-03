/**
 * Invoices, receipts, and trip CN/DN for the customer already on screen.
 * Used when the finance-book RPCs are not on this database.
 */
import {
  Chip,
  DataTable,
  FinancePage,
  Metric,
  MetricRow,
  QueryState,
  Row,
  SectionTitle,
  StatusPill,
} from "@/features/invoicing/components/finance/FinanceUi";
import { useInvoiceCustomerLedger } from "@/features/invoicing/hooks/useInvoiceCustomerLedger";
import { useWorkspaceFinance } from "@/features/invoicing/hooks/useWorkspaceFinance";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import type { CustomerReceipt } from "@/features/invoicing/utils/customerReceiptList.util";
import { formatDocDate, formatInr } from "@/features/invoicing/utils/financeDocuments.util";
import type { WorkspaceNote } from "@/features/invoicing/utils/workspaceFinance.util";
import { useState } from "react";

type View = "invoices" | "receipts" | "credits" | "debits";

export function WorkspaceBooks({
  orgId,
  clientId,
  clientName,
  trips,
  invoices,
  title,
  hint,
  initial = "invoices",
}: {
  orgId: string;
  clientId: string | null;
  clientName: string | null;
  trips: readonly InvoicingTripView[];
  invoices: readonly IssuedInvoiceListRow[];
  title: string;
  hint: string;
  initial?: View;
}) {
  const [view, setView] = useState<View>(initial);
  const workspace = useWorkspaceFinance({ orgId, clientId, clientName, trips });
  const customerLedger = useInvoiceCustomerLedger(orgId, clientId);
  const receipts = workspace.receiptsQuery.data?.receipts ?? [];
  const credits = workspace.notes.filter((note) => note.side === "customer" && note.kind === "credit" && !note.voided);
  const debits = workspace.notes.filter((note) => note.side === "customer" && note.kind === "debit" && !note.voided);
  const invoiced = invoices.reduce((sum, invoice) => sum + (Number(invoice.total_amount) || 0), 0);
  const received = receipts.reduce((sum, receipt) => sum + receipt.total, 0);
  const credited = credits.reduce((sum, note) => sum + note.amount, 0);
  const debited = debits.reduce((sum, note) => sum + note.amount, 0);

  return (
    <FinancePage>
      <SectionTitle title={title} hint={hint} />
      <MetricRow>
        <Metric label="Billed" value={formatInr(customerLedger.party?.billed ?? invoiced)} />
        <Metric label="Received" value={formatInr(customerLedger.party?.received ?? received)} />
        <Metric label="Pending" value={formatInr(customerLedger.party?.pending ?? Math.max(0, invoiced - received))} />
        <Metric label="Credit notes" value={formatInr(credited)} />
        <Metric label="Debit notes" value={formatInr(debited)} />
      </MetricRow>
      <Row>
        <Chip label="Invoices" active={view === "invoices"} onPress={() => setView("invoices")} />
        <Chip label="Receipts" active={view === "receipts"} onPress={() => setView("receipts")} />
        <Chip label="Credit notes" active={view === "credits"} onPress={() => setView("credits")} />
        <Chip label="Debit notes" active={view === "debits"} onPress={() => setView("debits")} />
      </Row>
      {view === "invoices" ? <InvoiceRows invoices={invoices} /> : null}
      {view === "receipts" ? (
        <ReceiptRows
          loading={workspace.receiptsQuery.isLoading}
          error={workspace.receiptsQuery.data?.error}
          receipts={receipts}
          onRetry={() => void workspace.receiptsQuery.refetch()}
        />
      ) : null}
      {view === "credits" || view === "debits" ? (
        <NoteRows
          loading={workspace.notesLoading}
          notes={view === "credits" ? credits : debits}
          onRetry={() => void workspace.notesQuery.refetch()}
        />
      ) : null}
    </FinancePage>
  );
}

function InvoiceRows({ invoices }: { invoices: readonly IssuedInvoiceListRow[] }) {
  return (
    <DataTable
      columns={[
        { key: "number", label: "Invoice", width: 150, render: (row: IssuedInvoiceListRow) => row.invoice_number },
        { key: "date", label: "Date", width: 110, render: (row: IssuedInvoiceListRow) => formatDocDate(row.invoice_date) },
        { key: "status", label: "Status", width: 100, render: (row: IssuedInvoiceListRow) => <StatusPill label={row.status} tone={row.status === "paid" ? "ok" : "warn"} /> },
        { key: "total", label: "Total", width: 120, align: "right" as const, render: (row: IssuedInvoiceListRow) => formatInr(Number(row.total_amount) || 0) },
      ]}
      rows={[...invoices]}
      rowKey={(row) => row.id}
      rowLabel={(row) => `Invoice ${row.invoice_number}`}
    />
  );
}

function ReceiptRows({
  loading,
  error,
  receipts,
  onRetry,
}: {
  loading: boolean;
  error?: string | null;
  receipts: CustomerReceipt[];
  onRetry: () => void;
}) {
  return (
    <>
      <QueryState loading={loading} error={error} empty={!loading && receipts.length === 0 && !error} emptyText="No receipts captured for this customer yet." onRetry={onRetry} />
      <DataTable
        columns={[
          { key: "date", label: "Date", width: 110, render: (row: CustomerReceipt) => formatDocDate(row.date) },
          { key: "ref", label: "Reference", width: 140, render: (row: CustomerReceipt) => row.reference ?? "—" },
          { key: "invoice", label: "Invoice", width: 140, render: (row: CustomerReceipt) => row.invoiceNumber ?? "—" },
          { key: "bank", label: "Bank", width: 110, align: "right" as const, render: (row: CustomerReceipt) => formatInr(row.bank) },
          { key: "tds", label: "TDS", width: 100, align: "right" as const, render: (row: CustomerReceipt) => formatInr(row.tds) },
          { key: "total", label: "Total", width: 110, align: "right" as const, render: (row: CustomerReceipt) => formatInr(row.total) },
        ]}
        rows={receipts}
        rowKey={(row) => row.id}
        rowLabel={(row) => `Receipt ${formatInr(row.total)}`}
      />
    </>
  );
}

function NoteRows({ notes, loading, onRetry }: { notes: WorkspaceNote[]; loading: boolean; onRetry: () => void }) {
  return (
    <>
      <QueryState loading={loading} empty={!loading && notes.length === 0} emptyText="No notes on these trips yet." onRetry={onRetry} />
      <DataTable
        columns={[
          { key: "date", label: "Date", width: 110, render: (row: WorkspaceNote) => formatDocDate(row.date) },
          { key: "trip", label: "Trip", width: 120, render: (row: WorkspaceNote) => row.tripLabel },
          { key: "invoice", label: "Invoice", width: 140, render: (row: WorkspaceNote) => row.invoiceNumber ?? "—" },
          { key: "reason", label: "Reason", render: (row: WorkspaceNote) => row.reason },
          { key: "amount", label: "Amount", width: 110, align: "right" as const, render: (row: WorkspaceNote) => formatInr(row.amount) },
        ]}
        rows={notes}
        rowKey={(row) => row.id}
        rowLabel={(row) => `${row.kind} ${formatInr(row.amount)}`}
      />
    </>
  );
}
