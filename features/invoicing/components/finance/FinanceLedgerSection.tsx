/**
 * Customer ledger with a running balance computed by the database over the
 * customer's whole history, so a page or a date filter never restarts it.
 * Statement: the same entries for a period, with the opening balance carried in.
 */
import {
  ActionButton,
  DataTable,
  DateRangeFields,
  FinancePage,
  FinanceSheet,
  Metric,
  MetricRow,
  Note,
  Pager,
  QueryState,
  SectionTitle,
  StatusPill,
  financialYearStart,
  ui,
  type DateRange,
} from "@/features/invoicing/components/finance/FinanceUi";
import { InvoiceArPanel } from "@/features/invoicing/components/InvoiceArPanel";
import { useInvoiceCustomerLedger } from "@/features/invoicing/hooks/useInvoiceCustomerLedger";
import { InvoiceReceiptsPanel } from "@/features/invoicing/components/InvoiceReceiptsPanel";
import { PaymentReceiptSheet } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import {
  LEDGER_PAGE_SIZE,
  fetchCustomerLedgerPage,
  fetchCustomerStatement,
  fetchStatementParties,
  financeBooksKeys,
  type CustomerLedgerEntry,
} from "@/features/invoicing/services/financeBooks.service";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import {
  LEDGER_TYPE_LABELS,
  buildCustomerStatementHtml,
  formatBalance,
  formatDocDate,
  formatInr,
  ledgerCsv,
  statementFileName,
  statementPeriodLabel,
} from "@/features/invoicing/utils/financeDocuments.util";
import { customerLedgerHeadlineSource } from "@/features/invoicing/utils/customerLedgerHeadline.util";
import {
  downloadFinancePdf,
  exportFinanceCsv,
  printFinanceDocument,
  shareFinanceDocument,
} from "@/features/invoicing/utils/financeDocumentOutput.util";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";

function today(): string {
  const now = new Date();
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().slice(0, 10);
}

const TYPE_TONE: Record<string, "ok" | "warn" | "bad" | "muted"> = {
  invoice: "warn",
  credit_note: "ok",
  payment: "ok",
  allocation: "muted",
  reversal: "bad",
  cancellation: "muted",
};

export function FinanceLedgerSection({
  orgId,
  clientId,
  clientName,
  canRecord,
  trips = [],
  invoices = [],
  onRecorded,
  onTripsChanged,
}: {
  orgId: string;
  clientId: string | null;
  clientName: string | null;
  canRecord: boolean;
  trips?: readonly InvoicingTripView[];
  invoices?: readonly IssuedInvoiceListRow[];
  onRecorded?: () => void;
  onTripsChanged?: () => void;
}) {
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [offset, setOffset] = useState(0);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const customerLedger = useInvoiceCustomerLedger(orgId, clientId);

  const query = useQuery({
    queryKey: financeBooksKeys.ledger(orgId, clientId ?? "none", range.from, range.to, offset),
    queryFn: () => fetchCustomerLedgerPage({ orgId, clientId: clientId!, from: range.from, to: range.to, offset }),
    enabled: Boolean(clientId),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  if (!clientId) {
    return (
      <FinancePage>
        <SectionTitle title="Customer ledger" hint="Select a client in the list to open their ledger." />
      </FinancePage>
    );
  }

  const booksDown = query.data?.unavailable === true;
  const page = booksDown ? null : query.data?.data;
  const headline = customerLedgerHeadlineSource(!booksDown);
  const rows = page?.rows ?? [];

  const exportCsv = async () => {
    setExporting(true);
    setMessage(null);
    const result = await fetchCustomerStatement({ orgId, clientId, from: range.from, to: range.to });
    if (result.error) {
      setMessage(result.error);
      setExporting(false);
      return;
    }
    try {
      await exportFinanceCsv(ledgerCsv(result.data), `${statementFileName(clientName, range.from, range.to)}.csv`);
      if (result.data.truncated) setMessage("Only the first 5,000 entries were exported. Narrow the dates for the rest.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    }
    setExporting(false);
  };

  const columns = [
    { key: "date", label: "Date", width: 100, render: (row: CustomerLedgerEntry) => formatDocDate(row.date) },
    {
      key: "type",
      label: "Type",
      width: 130,
      render: (row: CustomerLedgerEntry) => <StatusPill label={LEDGER_TYPE_LABELS[row.type] ?? row.type} tone={TYPE_TONE[row.type] ?? "muted"} />,
    },
    { key: "number", label: "Document", width: 150, render: (row: CustomerLedgerEntry) => row.number ?? "—" },
    {
      key: "detail",
      label: "Details",
      render: (row: CustomerLedgerEntry) => [row.reference && row.reference !== row.number ? row.reference : null, row.description].filter(Boolean).join(" · ") || "—",
    },
    { key: "debit", label: "Debit", width: 110, align: "right" as const, render: (row: CustomerLedgerEntry) => (row.debit ? formatInr(row.debit) : "") },
    { key: "credit", label: "Credit", width: 110, align: "right" as const, render: (row: CustomerLedgerEntry) => (row.credit ? formatInr(row.credit) : "") },
    { key: "balance", label: "Balance", width: 130, align: "right" as const, render: (row: CustomerLedgerEntry) => formatBalance(row.runningBalance) },
  ];

  return (
    <FinancePage>
      <SectionTitle
        title={`Customer ledger · ${clientName ?? "Customer"}`}
        hint={
          booksDown
            ? "Same billed, received, and pending figures as Finance → Customers. Receipts captured here update that ledger."
            : "Balances run across the customer's whole history. Dr = due from the customer, Cr = held for the customer."
        }
        actions={
          <>
            <InvoiceArPanel
              captureOnly
              orgId={orgId}
              clientId={clientId}
              clientName={clientName}
              trips={trips}
              invoices={invoices}
              onRecorded={() => {
                void queryClient.invalidateQueries({ queryKey: ["customer-receipts", orgId, clientId, clientName] });
                void query.refetch();
                onRecorded?.();
              }}
              onTripsChanged={onTripsChanged}
            />
            {booksDown ? null : <ActionButton label="Export CSV" kind="secondary" busy={exporting} onPress={() => void exportCsv()} />}
            {booksDown ? null : <ActionButton label="Statement" onPress={() => setStatementOpen(true)} />}
          </>
        }
      />
      {headline === "trip" && customerLedger.party ? (
        <MetricRow>
          <Metric label="Billed" value={formatInr(customerLedger.party.billed)} />
          <Metric label="Received" value={formatInr(customerLedger.party.received)} />
          <Metric label="Pending" value={formatInr(customerLedger.party.pending)} />
        </MetricRow>
      ) : null}
      {booksDown ? (
        <InvoiceReceiptsPanel
          embedded
          recordedOnly
          orgId={orgId}
          clientId={clientId}
          clientName={clientName}
          trips={trips}
          invoices={invoices}
          onRecorded={onRecorded}
          onTripsChanged={onTripsChanged}
        />
      ) : null}
      {booksDown ? null : (
      <>
      <DateRangeFields
        value={range}
        onChange={(next) => {
          setRange(next);
          setOffset(0);
        }}
      />
      {page ? (
        <MetricRow>
          <Metric label={range.from ? `Opening ${formatDocDate(range.from)}` : "Opening"} value={formatBalance(page.openingBalance)} />
          <Metric label="Debits in period" value={formatInr(page.periodDebit)} />
          <Metric label="Credits in period" value={formatInr(page.periodCredit)} />
          <Metric label={range.to ? `Closing ${formatDocDate(range.to)}` : "Closing"} value={formatBalance(page.closingBalance)} />
        </MetricRow>
      ) : null}
      <QueryState
        loading={query.isLoading}
        error={query.data?.error}
        empty={!query.isLoading && rows.length === 0 && !query.data?.error && !booksDown}
        emptyText="No ledger entries in this period."
        onRetry={() => void query.refetch()}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        onPressRow={(row) => {
          if (row.paymentId) setReceiptId(row.paymentId);
        }}
        rowLabel={(row) => `${LEDGER_TYPE_LABELS[row.type] ?? row.type} ${row.number ?? ""} ${formatDocDate(row.date)}`}
        rowTone={(row) => (row.type === "allocation" ? "muted" : null)}
      />
      <Pager offset={offset} pageSize={LEDGER_PAGE_SIZE} total={page?.total ?? 0} onChange={setOffset} fetching={query.isFetching && !query.isLoading} />
      <Note>Receipt rows open the receipt. "Applied" rows show where a receipt was used and do not change the balance.</Note>
      <SectionTitle title="Receipts" hint="The documents behind the credits. Open one to see where the money was applied." />
      <InvoiceReceiptsPanel
        embedded
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
      </>
      )}
      {message ? <Note tone="error">{message}</Note> : null}
      <PaymentReceiptSheet orgId={orgId} paymentId={receiptId} canRecord={canRecord} onClose={() => setReceiptId(null)} />
      <CustomerStatementSheet
        visible={statementOpen}
        orgId={orgId}
        clientId={clientId}
        clientName={clientName}
        initial={range.from || range.to ? range : { from: financialYearStart(), to: today() }}
        onClose={() => setStatementOpen(false)}
      />
    </FinancePage>
  );
}

export function CustomerStatementSheet({
  visible,
  orgId,
  clientId,
  clientName,
  initial,
  onClose,
}: {
  visible: boolean;
  orgId: string;
  clientId: string;
  clientName: string | null;
  initial: DateRange;
  onClose: () => void;
}) {
  const [range, setRange] = useState<DateRange>(initial);
  const [busy, setBusy] = useState<"pdf" | "print" | "share" | "csv" | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const statement = useQuery({
    queryKey: [...financeBooksKeys.ledger(orgId, clientId, range.from, range.to, -1), "statement"],
    queryFn: () => fetchCustomerStatement({ orgId, clientId, from: range.from, to: range.to }),
    enabled: visible,
    staleTime: 15_000,
  });
  const parties = useQuery({
    queryKey: [...financeBooksKeys.all(orgId), "statement-parties", clientId],
    queryFn: () => fetchStatementParties(orgId, clientId),
    enabled: visible,
    staleTime: 5 * 60_000,
  });
  const data = statement.data?.data;
  const heads = parties.data?.data;

  const html = () =>
    data && heads
      ? buildCustomerStatementHtml({ issuer: heads.issuer, customer: heads.customer, from: range.from, to: range.to, generatedOn: today(), ledger: data })
      : null;

  const run = async (kind: "pdf" | "print" | "share" | "csv") => {
    const doc = html();
    if (!doc || !data) return;
    setBusy(kind);
    setMessage(null);
    const name = statementFileName(heads?.customer.legalName ?? clientName, range.from, range.to);
    try {
      if (kind === "pdf") await downloadFinancePdf(doc, `${name}.pdf`);
      else if (kind === "print") await printFinanceDocument(doc, name);
      else if (kind === "csv") await exportFinanceCsv(ledgerCsv(data), `${name}.csv`);
      else {
        const result = await shareFinanceDocument({
          html: doc,
          title: name,
          text: `Statement of account · ${heads?.customer.legalName ?? clientName ?? ""} · ${statementPeriodLabel(range.from, range.to)} · closing ${formatBalance(data.closingBalance)}`,
        });
        if (result === "copied") setMessage({ text: "Statement summary copied to the clipboard.", tone: "success" });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      if (!/abort|cancel/i.test(text)) setMessage({ text: text || "Could not open the statement.", tone: "error" });
    }
    setBusy(null);
  };

  const ready = Boolean(data && heads);
  return (
    <FinanceSheet
      visible={visible}
      title={`Statement · ${clientName ?? "Customer"}`}
      onClose={onClose}
      footer={
        <>
          <ActionButton label="CSV" kind="secondary" busy={busy === "csv"} disabled={!ready || busy !== null} onPress={() => void run("csv")} />
          <ActionButton label="Download PDF" kind="secondary" busy={busy === "pdf"} disabled={!ready || busy !== null} onPress={() => void run("pdf")} />
          <ActionButton label="Print" kind="secondary" busy={busy === "print"} disabled={!ready || busy !== null} onPress={() => void run("print")} />
          <ActionButton label="Share" busy={busy === "share"} disabled={!ready || busy !== null} onPress={() => void run("share")} />
        </>
      }
    >
      <DateRangeFields value={range} onChange={setRange} />
      <QueryState
        loading={statement.isLoading || parties.isLoading}
        error={statement.data?.error ?? parties.data?.error}
        unavailable={statement.data?.unavailable}
        empty={false}
        emptyText=""
        onRetry={() => {
          void statement.refetch();
          void parties.refetch();
        }}
      />
      {data ? (
        <>
          <Text style={ui.hint}>{statementPeriodLabel(range.from, range.to)}</Text>
          <MetricRow>
            <Metric label="Opening balance" value={formatBalance(data.openingBalance)} />
            <Metric label="Invoiced and debits" value={formatInr(data.periodDebit)} />
            <Metric label="Receipts and credits" value={formatInr(data.periodCredit)} />
            <Metric label="Closing balance" value={formatBalance(data.closingBalance)} />
          </MetricRow>
          <View style={ui.row}>
            <Note>
              {data.rows.filter((row) => row.type !== "allocation").length} transaction{data.rows.length === 1 ? "" : "s"} in the period.
            </Note>
          </View>
          {data.truncated ? <Note tone="warning">More than 5,000 entries in this period — narrow the dates for a complete statement.</Note> : null}
        </>
      ) : null}
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
    </FinanceSheet>
  );
}
