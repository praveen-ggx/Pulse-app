/**
 * Finance reports. Every table is a paged database read; every export re-reads
 * the full range from the database (bounded), never the visible page only.
 */
import {
  ActionButton,
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
  dateRangePresets,
  type DateRange,
} from "@/features/invoicing/components/finance/FinanceUi";
import { invoiceStatusPill } from "@/features/invoicing/components/finance/FinanceReceivablesSection";
import { WorkspaceBooks } from "@/features/invoicing/components/finance/WorkspaceBooks";
import { FinanceDashboardPanel } from "@/features/invoicing/components/finance/FinanceDashboardPanel";
import { PaymentReceiptSheet } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import {
  REGISTER_PAGE_SIZE,
  fetchCollections,
  fetchCustomerStatement,
  fetchInvoiceRegister,
  fetchOrgAging,
  fetchPaymentRegister,
  financeBooksKeys,
  paymentModeLabel,
  type AgingRow,
  type CollectionsRow,
  type InvoiceRegisterRow,
  type PaymentRegisterRow,
} from "@/features/invoicing/services/financeBooks.service";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import { formatDocDate, formatInr, ledgerCsv, statementFileName, toCsv } from "@/features/invoicing/utils/financeDocuments.util";
import { exportFinanceCsv } from "@/features/invoicing/utils/financeDocumentOutput.util";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

type ReportKey = "aging" | "outstanding" | "invoices" | "payments" | "collections" | "ledger";

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: "aging", label: "Aging" },
  { key: "outstanding", label: "Outstanding" },
  { key: "invoices", label: "Invoice register" },
  { key: "payments", label: "Payment register" },
  { key: "collections", label: "Collections" },
  { key: "ledger", label: "Customer ledger export" },
];

const EXPORT_CAP = 5000;

async function collectPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ error: string | null; data: { rows: T[] } }>,
): Promise<{ error: string | null; rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let offset = 0; offset < EXPORT_CAP; offset += 200) {
    const page = await fetchPage(offset, 200);
    if (page.error) return { error: page.error, rows: [], truncated: false };
    rows.push(...page.data.rows);
    if (page.data.rows.length < 200) return { error: null, rows, truncated: false };
  }
  return { error: null, rows, truncated: true };
}

export function FinanceReportsSection({
  orgId,
  clientId,
  clientName,
  canRecord,
  extra,
  trips = [],
  issuedInvoices = [],
}: {
  orgId: string;
  clientId: string | null;
  clientName: string | null;
  canRecord: boolean;
  trips?: readonly InvoicingTripView[];
  issuedInvoices?: readonly IssuedInvoiceListRow[];
  /** Existing invoice delivery actions, kept below the reports. */
  extra?: ReactNode;
}) {
  const [report, setReport] = useState<ReportKey>("aging");
  const [range, setRange] = useState<DateRange>(() => dateRangePresets().find((preset) => preset.key === "fy")!.range);
  const [onlyClient, setOnlyClient] = useState(false);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" | "warning" } | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const scopedClient = onlyClient ? clientId : null;
  const probe = useQuery({
    queryKey: ["finance-books-probe", orgId],
    queryFn: () => fetchOrgAging(orgId, 0, 1),
    staleTime: 60_000,
  });
  if (probe.data?.unavailable) {
    return (
      <WorkspaceBooks
        orgId={orgId}
        clientId={clientId}
        clientName={clientName}
        trips={trips}
        invoices={issuedInvoices}
        title="Reports"
        hint="Invoices, receipts, and trip credit and debit notes for this customer. The aged register appears once the finance book is on this database."
      />
    );
  }

  const choose = (next: ReportKey) => {
    setReport(next);
    setOffset(0);
    setMessage(null);
  };

  const run = async (label: string, work: () => Promise<{ csv: string; name: string; truncated: boolean } | string>) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await work();
      if (typeof result === "string") {
        setMessage({ text: result, tone: "error" });
      } else {
        await exportFinanceCsv(result.csv, result.name);
        setMessage(
          result.truncated
            ? { text: `${label}: only the first ${EXPORT_CAP} rows were exported. Narrow the dates.`, tone: "warning" }
            : { text: `${label} exported.`, tone: "success" },
        );
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Export failed.", tone: "error" });
    }
    setBusy(false);
  };

  return (
    <FinancePage>
      <SectionTitle title="Reports" hint="Figures come from issued invoices, recorded receipts and credit notes. Exports read the full range from the database." />
      <FinanceDashboardPanel orgId={orgId} />
      <Row>
        {REPORTS.map((item) => (
          <Chip key={item.key} label={item.label} active={report === item.key} onPress={() => choose(item.key)} />
        ))}
      </Row>
      {report === "invoices" || report === "payments" || report === "collections" || report === "ledger" ? (
        <DateRangeFields
          value={range}
          onChange={(next) => {
            setRange(next);
            setOffset(0);
          }}
        />
      ) : null}
      {(report === "invoices" || report === "payments") && clientId ? (
        <Row>
          <Chip label="All customers" active={!onlyClient} onPress={() => { setOnlyClient(false); setOffset(0); }} />
          <Chip label={`${clientName ?? "This client"} only`} active={onlyClient} onPress={() => { setOnlyClient(true); setOffset(0); }} />
        </Row>
      ) : null}

      {report === "aging" || report === "outstanding" ? (
        <AgingReport
          orgId={orgId}
          outstandingOnly={report === "outstanding"}
          offset={offset}
          onOffset={setOffset}
          busy={busy}
          onExport={() =>
            void run(report === "aging" ? "Aging report" : "Outstanding receivables", async () => {
              const all = await collectPages((at, limit) => fetchOrgAging(orgId, at, limit));
              if (all.error) return all.error;
              return {
                truncated: all.truncated,
                name: report === "aging" ? "receivables-aging.csv" : "outstanding-receivables.csv",
                csv: toCsv(
                  ["Customer", "Invoices", "Invoiced", "Received", "Credited", "Current", "1-30", "31-60", "61-90", "Over 90", "Outstanding", "Oldest due"],
                  all.rows.map((row) => [
                    row.clientName, row.invoiceCount, row.invoiceTotal, row.received, row.credited, row.current,
                    row.days1To30, row.days31To60, row.days61To90, row.daysOver90, row.outstanding, row.oldestDue ?? "",
                  ]),
                ),
              };
            })
          }
        />
      ) : null}

      {report === "invoices" ? (
        <InvoiceRegisterReport
          orgId={orgId}
          clientId={scopedClient}
          range={range}
          offset={offset}
          onOffset={setOffset}
          busy={busy}
          onExport={() =>
            void run("Invoice register", async () => {
              const all = await collectPages((at, limit) => fetchInvoiceRegister({ orgId, clientId: scopedClient, from: range.from, to: range.to, offset: at, limit }));
              if (all.error) return all.error;
              return {
                truncated: all.truncated,
                name: `invoice-register-${range.from ?? "start"}-${range.to ?? "today"}.csv`,
                csv: toCsv(
                  ["Invoice", "Date", "Due", "Customer", "Status", "Total", "Received", "Credited", "Outstanding"],
                  all.rows.map((row) => [row.invoiceNumber, row.invoiceDate ?? "", row.dueDate ?? "", row.clientName ?? "", row.status, row.total, row.received, row.credited, row.outstanding]),
                ),
              };
            })
          }
        />
      ) : null}

      {report === "payments" ? (
        <PaymentRegisterReport
          orgId={orgId}
          clientId={scopedClient}
          range={range}
          offset={offset}
          onOffset={setOffset}
          onOpen={setReceiptId}
          busy={busy}
          onExport={() =>
            void run("Payment register", async () => {
              const all = await collectPages((at, limit) => fetchPaymentRegister({ orgId, clientId: scopedClient, from: range.from, to: range.to, offset: at, limit }));
              if (all.error) return all.error;
              return {
                truncated: all.truncated,
                name: `payment-register-${range.from ?? "start"}-${range.to ?? "today"}.csv`,
                csv: toCsv(
                  ["Receipt", "Date", "Customer", "Mode", "Reference", "Bank amount", "TDS", "Settled", "Applied", "On account", "Status", "Bank matched"],
                  all.rows.map((row) => [
                    row.receiptNumber, row.paymentDate, row.clientName ?? "", paymentModeLabel(row.paymentMode), row.reference ?? "",
                    row.bankAmount, row.tdsAmount, row.amount, row.allocated, row.unallocated, row.status, row.bankLineId ? "yes" : "no",
                  ]),
                ),
              };
            })
          }
        />
      ) : null}

      {report === "collections" ? (
        <CollectionsReport
          orgId={orgId}
          range={range}
          busy={busy}
          onExport={(rows) =>
            void run("Collections", async () => ({
              truncated: false,
              name: `collections-${range.from}-${range.to}.csv`,
              csv: toCsv(
                ["Month", "Mode", "Receipts", "Bank amount", "TDS", "Settled"],
                rows.map((row) => [row.month.slice(0, 7), paymentModeLabel(row.paymentMode), row.receiptCount, row.bankAmount, row.tdsAmount, row.settledAmount]),
              ),
            }))
          }
        />
      ) : null}

      {report === "ledger" ? (
        clientId ? (
          <>
            <Note>Exports {clientName ?? "this customer"}'s ledger for the period with opening balance, every entry, the running balance and the closing balance.</Note>
            <ActionButton
              label="Export customer ledger (CSV)"
              busy={busy}
              onPress={() =>
                void run("Customer ledger", async () => {
                  const result = await fetchCustomerStatement({ orgId, clientId, from: range.from, to: range.to });
                  if (result.error) return result.error;
                  return { truncated: result.data.truncated, name: `${statementFileName(clientName, range.from, range.to)}.csv`, csv: ledgerCsv(result.data) };
                })
              }
            />
          </>
        ) : (
          <Note>Select a client in the list to export their ledger.</Note>
        )
      ) : null}

      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
      {extra}
      <PaymentReceiptSheet orgId={orgId} paymentId={receiptId} canRecord={canRecord} onClose={() => setReceiptId(null)} />
    </FinancePage>
  );
}

function ExportButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return <ActionButton label="Export CSV" kind="secondary" busy={busy} onPress={onPress} />;
}

function AgingReport({
  orgId,
  outstandingOnly,
  offset,
  onOffset,
  busy,
  onExport,
}: {
  orgId: string;
  outstandingOnly: boolean;
  offset: number;
  onOffset: (next: number) => void;
  busy: boolean;
  onExport: () => void;
}) {
  const query = useQuery({
    queryKey: financeBooksKeys.aging(orgId, offset),
    queryFn: () => fetchOrgAging(orgId, offset, 100),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const rows = query.data?.data.rows ?? [];
  const sum = (pick: (row: AgingRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const columns = outstandingOnly
    ? [
        { key: "client", label: "Customer", render: (row: AgingRow) => row.clientName },
        { key: "count", label: "Invoices", width: 80, align: "right" as const, render: (row: AgingRow) => String(row.invoiceCount) },
        { key: "invoiced", label: "Invoiced", width: 120, align: "right" as const, render: (row: AgingRow) => formatInr(row.invoiceTotal) },
        { key: "received", label: "Received", width: 120, align: "right" as const, render: (row: AgingRow) => formatInr(row.received) },
        { key: "credited", label: "Credited", width: 110, align: "right" as const, render: (row: AgingRow) => formatInr(row.credited) },
        { key: "out", label: "Outstanding", width: 130, align: "right" as const, render: (row: AgingRow) => formatInr(row.outstanding) },
        { key: "oldest", label: "Oldest due", width: 110, render: (row: AgingRow) => formatDocDate(row.oldestDue) },
      ]
    : [
        { key: "client", label: "Customer", render: (row: AgingRow) => row.clientName },
        { key: "current", label: "Current", width: 110, align: "right" as const, render: (row: AgingRow) => formatInr(row.current) },
        { key: "b1", label: "1–30", width: 105, align: "right" as const, render: (row: AgingRow) => formatInr(row.days1To30) },
        { key: "b2", label: "31–60", width: 105, align: "right" as const, render: (row: AgingRow) => formatInr(row.days31To60) },
        { key: "b3", label: "61–90", width: 105, align: "right" as const, render: (row: AgingRow) => formatInr(row.days61To90) },
        { key: "b4", label: "90+", width: 105, align: "right" as const, render: (row: AgingRow) => formatInr(row.daysOver90) },
        { key: "out", label: "Total", width: 125, align: "right" as const, render: (row: AgingRow) => formatInr(row.outstanding) },
      ];
  return (
    <>
      <Row>
        <ExportButton busy={busy} onPress={onExport} />
      </Row>
      {rows.length ? (
        <MetricRow>
          <Metric label="Outstanding" value={formatInr(sum((row) => row.outstanding))} />
          <Metric label="Current" value={formatInr(sum((row) => row.current))} />
          <Metric label="1–30" value={formatInr(sum((row) => row.days1To30))} />
          <Metric label="31–60" value={formatInr(sum((row) => row.days31To60))} />
          <Metric label="61–90" value={formatInr(sum((row) => row.days61To90))} />
          <Metric label="Over 90" value={formatInr(sum((row) => row.daysOver90))} tone={sum((row) => row.daysOver90) > 0 ? "danger" : undefined} />
        </MetricRow>
      ) : null}
      {(query.data?.data.total ?? 0) > 100 ? <Note>Totals cover this page of customers. The export covers all of them.</Note> : null}
      <QueryState
        loading={query.isLoading}
        error={query.data?.error}
        unavailable={query.data?.unavailable}
        empty={!query.isLoading && rows.length === 0 && !query.data?.error}
        emptyText="No open receivables."
        onRetry={() => void query.refetch()}
      />
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.clientId} />
      <Pager offset={offset} pageSize={100} total={query.data?.data.total ?? 0} onChange={onOffset} />
    </>
  );
}

function InvoiceRegisterReport({
  orgId,
  clientId,
  range,
  offset,
  onOffset,
  busy,
  onExport,
}: {
  orgId: string;
  clientId: string | null;
  range: DateRange;
  offset: number;
  onOffset: (next: number) => void;
  busy: boolean;
  onExport: () => void;
}) {
  const query = useQuery({
    queryKey: financeBooksKeys.invoiceRegister(orgId, clientId, range.from, range.to, offset),
    queryFn: () => fetchInvoiceRegister({ orgId, clientId, from: range.from, to: range.to, offset }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const rows = query.data?.data.rows ?? [];
  const columns = [
    { key: "number", label: "Invoice", width: 150, render: (row: InvoiceRegisterRow) => row.invoiceNumber },
    { key: "date", label: "Date", width: 100, render: (row: InvoiceRegisterRow) => formatDocDate(row.invoiceDate) },
    { key: "client", label: "Customer", render: (row: InvoiceRegisterRow) => row.clientName ?? "—" },
    { key: "total", label: "Total", width: 110, align: "right" as const, render: (row: InvoiceRegisterRow) => formatInr(row.total) },
    { key: "received", label: "Received", width: 110, align: "right" as const, render: (row: InvoiceRegisterRow) => formatInr(row.received) },
    { key: "credited", label: "Credited", width: 100, align: "right" as const, render: (row: InvoiceRegisterRow) => formatInr(row.credited) },
    { key: "out", label: "Outstanding", width: 120, align: "right" as const, render: (row: InvoiceRegisterRow) => formatInr(row.outstanding) },
    { key: "status", label: "Status", width: 140, render: (row: InvoiceRegisterRow) => invoiceStatusPill(row) },
  ];
  return (
    <>
      <Row>
        <ExportButton busy={busy} onPress={onExport} />
      </Row>
      <QueryState
        loading={query.isLoading}
        error={query.data?.error}
        unavailable={query.data?.unavailable}
        empty={!query.isLoading && rows.length === 0 && !query.data?.error}
        emptyText="No invoices issued in this period."
        onRetry={() => void query.refetch()}
      />
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.invoiceId} rowTone={(row) => (row.status === "cancelled" ? "muted" : null)} />
      <Pager offset={offset} pageSize={REGISTER_PAGE_SIZE} total={query.data?.data.total ?? 0} onChange={onOffset} fetching={query.isFetching && !query.isLoading} />
    </>
  );
}

function PaymentRegisterReport({
  orgId,
  clientId,
  range,
  offset,
  onOffset,
  onOpen,
  busy,
  onExport,
}: {
  orgId: string;
  clientId: string | null;
  range: DateRange;
  offset: number;
  onOffset: (next: number) => void;
  onOpen: (paymentId: string) => void;
  busy: boolean;
  onExport: () => void;
}) {
  const query = useQuery({
    queryKey: financeBooksKeys.paymentRegister(orgId, clientId, range.from, range.to, "", offset),
    queryFn: () => fetchPaymentRegister({ orgId, clientId, from: range.from, to: range.to, offset }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const rows = query.data?.data.rows ?? [];
  const columns = [
    { key: "number", label: "Receipt", width: 150, render: (row: PaymentRegisterRow) => row.receiptNumber },
    { key: "date", label: "Date", width: 100, render: (row: PaymentRegisterRow) => formatDocDate(row.paymentDate) },
    { key: "client", label: "Customer", render: (row: PaymentRegisterRow) => row.clientName ?? "—" },
    { key: "mode", label: "Mode / reference", width: 170, render: (row: PaymentRegisterRow) => `${paymentModeLabel(row.paymentMode)}${row.reference ? ` · ${row.reference}` : ""}` },
    { key: "bank", label: "Bank", width: 110, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.bankAmount) },
    { key: "tds", label: "TDS", width: 90, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.tdsAmount) },
    { key: "unalloc", label: "On account", width: 110, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.unallocated) },
    {
      key: "status",
      label: "Status",
      width: 100,
      render: (row: PaymentRegisterRow) => <StatusPill label={row.status === "reversed" ? "Reversed" : "Active"} tone={row.status === "reversed" ? "bad" : "ok"} />,
    },
  ];
  return (
    <>
      <Row>
        <ExportButton busy={busy} onPress={onExport} />
      </Row>
      <QueryState
        loading={query.isLoading}
        error={query.data?.error}
        unavailable={query.data?.unavailable}
        empty={!query.isLoading && rows.length === 0 && !query.data?.error}
        emptyText="No receipts in this period."
        onRetry={() => void query.refetch()}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.paymentId}
        onPressRow={(row) => onOpen(row.paymentId)}
        rowLabel={(row) => `Receipt ${row.receiptNumber}`}
        rowTone={(row) => (row.status === "reversed" ? "muted" : null)}
      />
      <Pager offset={offset} pageSize={REGISTER_PAGE_SIZE} total={query.data?.data.total ?? 0} onChange={onOffset} fetching={query.isFetching && !query.isLoading} />
    </>
  );
}

function CollectionsReport({
  orgId,
  range,
  busy,
  onExport,
}: {
  orgId: string;
  range: DateRange;
  busy: boolean;
  onExport: (rows: CollectionsRow[]) => void;
}) {
  const valid = Boolean(range.from && range.to);
  const query = useQuery({
    queryKey: financeBooksKeys.collections(orgId, range.from ?? "", range.to ?? ""),
    queryFn: () => fetchCollections(orgId, range.from!, range.to!),
    enabled: valid,
    staleTime: 30_000,
  });
  const rows = query.data?.data ?? [];
  const total = rows.reduce(
    (sum, row) => ({ bank: sum.bank + row.bankAmount, tds: sum.tds + row.tdsAmount, count: sum.count + row.receiptCount }),
    { bank: 0, tds: 0, count: 0 },
  );
  const columns = [
    { key: "month", label: "Month", width: 110, render: (row: CollectionsRow) => row.month.slice(0, 7) },
    { key: "mode", label: "Mode", render: (row: CollectionsRow) => paymentModeLabel(row.paymentMode) },
    { key: "count", label: "Receipts", width: 90, align: "right" as const, render: (row: CollectionsRow) => String(row.receiptCount) },
    { key: "bank", label: "Bank", width: 130, align: "right" as const, render: (row: CollectionsRow) => formatInr(row.bankAmount) },
    { key: "tds", label: "TDS", width: 110, align: "right" as const, render: (row: CollectionsRow) => formatInr(row.tdsAmount) },
    { key: "settled", label: "Settled", width: 130, align: "right" as const, render: (row: CollectionsRow) => formatInr(row.settledAmount) },
  ];
  if (!valid) return <Note>Choose a start and end date (up to three years) for collections.</Note>;
  return (
    <>
      <Row>
        <ExportButton busy={busy} onPress={() => onExport(rows)} />
      </Row>
      {rows.length ? (
        <MetricRow>
          <Metric label="Collected in bank" value={formatInr(total.bank)} />
          <Metric label="TDS deducted" value={formatInr(total.tds)} />
          <Metric label="Receipts" value={String(total.count)} />
        </MetricRow>
      ) : null}
      <QueryState
        loading={query.isLoading}
        error={query.data?.error}
        unavailable={query.data?.unavailable}
        empty={!query.isLoading && rows.length === 0 && !query.data?.error}
        emptyText="No receipts in this period. Reversed receipts are not counted."
        onRetry={() => void query.refetch()}
      />
      <DataTable columns={columns} rows={rows} rowKey={(row) => `${row.month}-${row.paymentMode}`} />
    </>
  );
}
