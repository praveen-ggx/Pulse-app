/**
 * Bank reconciliation: import statement lines, then match each bank credit to a
 * receipt that is already recorded. Importing never creates a payment, and a
 * receipt can be matched to one bank line only (enforced by the database).
 */
import {
  ActionButton,
  Card,
  Chip,
  DataTable,
  Field,
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
} from "@/features/invoicing/components/finance/FinanceUi";
import { invalidateFinanceBalances, PaymentReceiptSheet } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import { WorkspaceBooks } from "@/features/invoicing/components/finance/WorkspaceBooks";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import {
  REGISTER_PAGE_SIZE,
  fetchBankHistory,
  fetchBankLines,
  fetchPaymentRegister,
  financeBooksKeys,
  importBankStatement,
  matchBankLine,
  newFinanceKey,
  paymentModeLabel,
  unmatchBankLine,
  type BankHistoryEvent,
  type BankLine,
  type BankLineFilter,
  type PaymentRegisterRow,
} from "@/features/invoicing/services/financeBooks.service";
import { parseBankStatementCsv } from "@/features/invoicing/utils/bankStatementCsv.util";
import { formatDocDate, formatInr, toCsv } from "@/features/invoicing/utils/financeDocuments.util";
import { exportFinanceCsv } from "@/features/invoicing/utils/financeDocumentOutput.util";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";

const FILTERS: { key: BankLineFilter; label: string }[] = [
  { key: "unmatched", label: "Unmatched" },
  { key: "matched", label: "Matched" },
  { key: "attention", label: "Needs attention" },
  { key: "all", label: "All lines" },
];

function lineStatus(line: BankLine) {
  if (line.warning) return <StatusPill label={line.status === "matched" ? "Check match" : "Check"} tone="bad" />;
  if (line.status === "matched") return <StatusPill label="Matched" tone="ok" />;
  if (line.debit > 0) return <StatusPill label="Debit" tone="muted" />;
  return <StatusPill label="Unmatched" tone="warn" />;
}

export function FinanceReconciliationSection({
  orgId,
  canRecord,
  clientId = null,
  clientName = null,
  trips = [],
  invoices = [],
}: {
  orgId: string;
  canRecord: boolean;
  clientId?: string | null;
  clientName?: string | null;
  trips?: readonly InvoicingTripView[];
  invoices?: readonly IssuedInvoiceListRow[];
}) {
  const [filter, setFilter] = useState<BankLineFilter>("unmatched");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const lines = useQuery({
    queryKey: financeBooksKeys.bankLines(orgId, filter, offset),
    queryFn: () => fetchBankLines(orgId, filter, offset),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const rows = lines.data?.data.rows ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  if (lines.data?.unavailable) {
    return (
      <WorkspaceBooks
        orgId={orgId}
        clientId={clientId}
        clientName={clientName}
        trips={trips}
        invoices={invoices}
        title="Reconciliation"
        hint="Receipts already captured for this customer. Matching them to a bank statement line waits until the finance book is on this database."
        initial="receipts"
      />
    );
  }

  const exportCsv = async () => {
    setExporting(true);
    setMessage(null);
    const all: BankLine[] = [];
    for (let at = 0; at < 5000; at += 200) {
      const page = await fetchBankLines(orgId, filter, at, 200);
      if (page.error) {
        setMessage(page.error);
        setExporting(false);
        return;
      }
      all.push(...page.data.rows);
      if (page.data.rows.length < 200) break;
    }
    try {
      await exportFinanceCsv(
        toCsv(
          ["Date", "Reference", "Description", "Credit", "Debit", "Status", "Receipt", "Receipt date", "Customer", "Receipt bank amount", "Difference", "Warning"],
          all.map((line) => [
            line.txnDate,
            line.reference ?? "",
            line.description ?? "",
            line.credit,
            line.debit,
            line.status,
            line.receiptNumber ?? "",
            line.receiptDate ?? "",
            line.clientName ?? "",
            line.receiptBankAmount ?? "",
            line.difference ?? "",
            line.warning ?? "",
          ]),
        ),
        `bank-reconciliation-${filter}.csv`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    }
    setExporting(false);
  };

  const columns = [
    { key: "date", label: "Date", width: 100, render: (row: BankLine) => formatDocDate(row.txnDate) },
    { key: "ref", label: "Reference", width: 150, render: (row: BankLine) => row.reference ?? "—" },
    { key: "desc", label: "Description", render: (row: BankLine) => row.description ?? "—" },
    { key: "credit", label: "Credit", width: 110, align: "right" as const, render: (row: BankLine) => (row.credit ? formatInr(row.credit) : "") },
    { key: "debit", label: "Debit", width: 100, align: "right" as const, render: (row: BankLine) => (row.debit ? formatInr(row.debit) : "") },
    { key: "receipt", label: "Matched receipt", width: 160, render: (row: BankLine) => row.receiptNumber ?? "—" },
    { key: "status", label: "Status", width: 120, render: lineStatus },
  ];

  return (
    <FinancePage>
      <SectionTitle
        title="Bank reconciliation"
        hint="Import the bank statement, then match each credit to a receipt already recorded. Importing never records a payment."
        actions={
          <>
            <ActionButton label="Export CSV" kind="secondary" busy={exporting} onPress={() => void exportCsv()} />
            {canRecord ? <ActionButton label={importOpen ? "Close import" : "Import statement"} onPress={() => setImportOpen((open) => !open)} /> : null}
          </>
        }
      />
      {importOpen ? <BankImport orgId={orgId} onImported={() => { setFilter("unmatched"); setOffset(0); }} /> : null}
      <Row>
        {FILTERS.map((item) => (
          <Chip key={item.key} label={item.label} active={filter === item.key} onPress={() => { setFilter(item.key); setOffset(0); setSelectedId(null); }} />
        ))}
      </Row>
      <QueryState
        loading={lines.isLoading}
        error={lines.data?.error}
        unavailable={lines.data?.unavailable}
        empty={!lines.isLoading && rows.length === 0 && !lines.data?.error}
        emptyText={filter === "unmatched" ? "No unmatched bank lines." : filter === "attention" ? "Nothing needs attention." : "No bank lines imported yet."}
        onRetry={() => void lines.refetch()}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        selectedKey={selectedId}
        onPressRow={(row) => setSelectedId(row.id === selectedId ? null : row.id)}
        rowLabel={(row) => `Bank line ${formatDocDate(row.txnDate)} ${row.reference ?? ""} ${formatInr(row.credit || row.debit)}`}
      />
      <Pager offset={offset} pageSize={REGISTER_PAGE_SIZE} total={lines.data?.data.total ?? 0} onChange={setOffset} fetching={lines.isFetching && !lines.isLoading} />
      {selected ? <BankLineDetail orgId={orgId} line={selected} canRecord={canRecord} onChanged={() => setSelectedId(null)} /> : null}
      {message ? <Note tone="error">{message}</Note> : null}
      <BankHistory orgId={orgId} />
    </FinancePage>
  );
}

function BankImport({ orgId, onImported }: { orgId: string; onImported: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const key = useRef<string | null>(null);
  const parsed = useMemo(() => parseBankStatementCsv(text), [text]);
  const credits = parsed.rows.filter((row) => Number(row.credit) > 0);

  const pickFile = () => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 2_000_000) {
        setMessage({ text: "That file is larger than 2 MB. Split the statement.", tone: "error" });
        return;
      }
      void file.text().then((content) => {
        setText(content);
        key.current = null;
        setMessage(null);
      });
    };
    input.click();
  };

  const submit = async () => {
    if (parsed.errors.length || parsed.rows.length === 0) return;
    if (parsed.rows.length > 500) {
      setMessage({ text: "Import at most 500 rows at a time.", tone: "error" });
      return;
    }
    key.current = key.current ?? newFinanceKey("bank-import");
    setBusy(true);
    const result = await importBankStatement(orgId, parsed.rows, key.current);
    setBusy(false);
    if (result.error) {
      setMessage({ text: result.error, tone: "error" });
      return;
    }
    key.current = null;
    setText("");
    setMessage({
      text: `${result.inserted} line${result.inserted === 1 ? "" : "s"} added${result.duplicates ? `, ${result.duplicates} already imported and skipped` : ""}. No payments were created.`,
      tone: "success",
    });
    await queryClient.invalidateQueries({ queryKey: financeBooksKeys.all(orgId) });
    onImported();
  };

  return (
    <Card>
      <SectionTitle
        title="Import statement"
        hint="CSV with a header row (Date, Reference/UTR, Description/Narration, Credit, Debit — or one signed Amount column), or rows of: date, reference, description, credit."
        actions={Platform.OS === "web" ? <ActionButton label="Choose CSV file" kind="secondary" onPress={pickFile} /> : null}
      />
      <Field
        label="Statement rows"
        value={text}
        onChangeText={(next) => {
          setText(next);
          key.current = null;
          setMessage(null);
        }}
        multiline
        placeholder={"Date,Reference,Narration,Credit,Debit\n03/11/2026,UTR1234,NEFT CUSTOMER,180000,"}
      />
      {text.trim() ? (
        <MetricRow>
          <Metric label="Rows read" value={String(parsed.rows.length)} />
          <Metric label="Credits" value={`${credits.length} · ${formatInr(credits.reduce((sum, row) => sum + Number(row.credit), 0))}`} />
          <Metric label="Rows with problems" value={String(parsed.errors.length)} tone={parsed.errors.length ? "danger" : undefined} />
        </MetricRow>
      ) : null}
      {parsed.errors.slice(0, 8).map((error) => (
        <Note key={`${error.line}-${error.message}`} tone="error">Line {error.line}: {error.message}</Note>
      ))}
      {parsed.errors.length > 8 ? <Note tone="error">…and {parsed.errors.length - 8} more.</Note> : null}
      <Row>
        <ActionButton
          label={`Import ${parsed.rows.length || ""} line${parsed.rows.length === 1 ? "" : "s"}`.replace("  ", " ")}
          busy={busy}
          disabled={parsed.rows.length === 0 || parsed.errors.length > 0}
          onPress={() => void submit()}
        />
        {parsed.errors.length ? <Note>Fix the rows with problems; nothing is imported until every row reads cleanly.</Note> : null}
      </Row>
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
    </Card>
  );
}

function BankLineDetail({
  orgId,
  line,
  canRecord,
  onChanged,
}: {
  orgId: string;
  line: BankLine;
  canRecord: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(line.reference ?? (line.credit ? line.credit.toFixed(2) : ""));
  const [applied, setApplied] = useState(search);
  const [candidate, setCandidate] = useState<PaymentRegisterRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);

  const candidates = useQuery({
    queryKey: financeBooksKeys.paymentRegister(orgId, null, null, null, applied, 0),
    queryFn: () => fetchPaymentRegister({ orgId, search: applied, offset: 0, limit: 20 }),
    enabled: line.status === "unmatched" && line.credit > 0 && applied.trim().length > 0,
    staleTime: 10_000,
  });
  const options = (candidates.data?.data.rows ?? []).filter((row) => row.status === "recorded" && row.paymentMode !== "tds");
  const difference = candidate ? Math.round((line.credit - candidate.bankAmount) * 100) / 100 : 0;
  const dayGap = candidate ? Math.abs((Date.parse(line.txnDate) - Date.parse(candidate.paymentDate)) / 86400000) : 0;

  const refresh = async () => {
    await invalidateFinanceBalances(queryClient, orgId);
    onChanged();
  };

  const match = async () => {
    if (!candidate) return;
    setBusy(true);
    setMessage(null);
    const result = await matchBankLine(orgId, line.id, candidate.paymentId);
    setBusy(false);
    if (result.error) {
      setMessage({ text: result.error, tone: "error" });
      return;
    }
    await refresh();
  };

  const unmatch = async () => {
    if (!reason.trim()) {
      setMessage({ text: "Enter why the match is being removed.", tone: "error" });
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await unmatchBankLine(orgId, line.id, reason.trim());
    setBusy(false);
    if (result.error) {
      setMessage({ text: result.error, tone: "error" });
      return;
    }
    await refresh();
  };

  const candidateColumns = [
    { key: "number", label: "Receipt", width: 150, render: (row: PaymentRegisterRow) => row.receiptNumber },
    { key: "date", label: "Date", width: 100, render: (row: PaymentRegisterRow) => formatDocDate(row.paymentDate) },
    { key: "client", label: "Customer", render: (row: PaymentRegisterRow) => row.clientName ?? "—" },
    { key: "ref", label: "Mode / reference", width: 170, render: (row: PaymentRegisterRow) => `${paymentModeLabel(row.paymentMode)}${row.reference ? ` · ${row.reference}` : ""}` },
    { key: "bank", label: "Bank amount", width: 120, align: "right" as const, render: (row: PaymentRegisterRow) => formatInr(row.bankAmount) },
    {
      key: "state",
      label: "Bank line",
      width: 110,
      render: (row: PaymentRegisterRow) => (row.bankLineId ? <StatusPill label="Already matched" tone="bad" /> : <StatusPill label="Open" tone="ok" />),
    },
  ];

  return (
    <Card tone={line.warning ? "warning" : undefined}>
      <SectionTitle
        title={`${formatDocDate(line.txnDate)} · ${line.credit ? `Credit ${formatInr(line.credit)}` : `Debit ${formatInr(line.debit)}`}`}
        hint={[line.reference, line.description].filter(Boolean).join(" · ") || "No reference on this line"}
      />
      {line.warning ? <Note tone="warning">{line.warning}</Note> : null}
      {line.status === "matched" ? (
        <>
          <View style={ui.pager}>
            <Text style={ui.td}>
              Matched to {line.receiptNumber} ({line.clientName ?? "customer"}) · receipt bank amount {formatInr(line.receiptBankAmount)}
              {line.difference ? ` · difference ${formatInr(line.difference)}` : ""}
              {line.receiptStatus === "reversed" ? " · receipt reversed" : ""}
            </Text>
            {line.matchedPaymentId ? <ActionButton label="View receipt" kind="secondary" onPress={() => setReceiptId(line.matchedPaymentId)} /> : null}
          </View>
          {canRecord ? (
            <Row>
              <Field label="Reason to unmatch" value={reason} onChangeText={setReason} placeholder="e.g. Matched to the wrong receipt" />
              <ActionButton label="Unmatch" kind="danger" busy={busy} onPress={() => void unmatch()} />
            </Row>
          ) : null}
        </>
      ) : line.debit > 0 ? (
        <Note>This is a bank debit. Only credits are matched to customer receipts.</Note>
      ) : (
        <>
          <Row>
            <Field label="Find a recorded receipt (reference, receipt no. or amount)" value={search} onChangeText={setSearch} autoCapitalize="characters" />
            <ActionButton label="Search" kind="secondary" onPress={() => { setApplied(search.trim()); setCandidate(null); }} />
          </Row>
          <QueryState
            loading={candidates.isLoading && candidates.fetchStatus !== "idle"}
            error={candidates.data?.error}
            empty={!candidates.isLoading && applied.trim().length > 0 && options.length === 0}
            emptyText="No recorded receipt matches. Record the receipt first under Receivables, then match it here."
          />
          <DataTable
            columns={candidateColumns}
            rows={options}
            rowKey={(row) => row.paymentId}
            selectedKey={candidate?.paymentId ?? null}
            onPressRow={(row) => setCandidate(row.bankLineId ? null : row)}
            rowLabel={(row) => `Receipt ${row.receiptNumber} ${formatInr(row.bankAmount)}`}
            rowTone={(row) => (row.bankLineId ? "muted" : null)}
          />
          {candidate ? (
            <Card tone={difference !== 0 || dayGap > 7 ? "warning" : undefined}>
              {difference !== 0 ? (
                <Note tone="warning">
                  Bank credit {formatInr(line.credit)} and receipt bank amount {formatInr(candidate.bankAmount)} differ by {formatInr(difference)}. Match only if this is the same money (for example bank charges).
                </Note>
              ) : null}
              {dayGap > 7 ? <Note tone="warning">The dates are {Math.round(dayGap)} days apart.</Note> : null}
              <Row>
                <ActionButton
                  label={difference !== 0 ? "Match anyway" : `Match to ${candidate.receiptNumber}`}
                  kind={difference !== 0 ? "danger" : "primary"}
                  busy={busy}
                  disabled={!canRecord}
                  onPress={() => void match()}
                />
                <ActionButton label="Clear" kind="secondary" onPress={() => setCandidate(null)} />
              </Row>
            </Card>
          ) : null}
        </>
      )}
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
      <PaymentReceiptSheet orgId={orgId} paymentId={receiptId} canRecord={false} onClose={() => setReceiptId(null)} />
    </Card>
  );
}

const HISTORY_LABEL: Record<string, string> = {
  bank_import: "Statement imported",
  bank_matched: "Matched",
  bank_unmatched: "Unmatched",
};

function historyDetail(event: BankHistoryEvent): string {
  const p = event.payload;
  if (event.type === "bank_import") return `${p.inserted ?? 0} added, ${p.duplicates ?? 0} duplicates`;
  if (event.type === "bank_matched") {
    const diff = Number(p.difference);
    return `${String(p.receipt_number ?? "receipt")} · bank ${formatInr(Number(p.bank_credit))}${diff ? ` · difference ${formatInr(diff)}` : ""}`;
  }
  return event.reason ?? "";
}

function BankHistory({ orgId }: { orgId: string }) {
  const [offset, setOffset] = useState(0);
  const history = useQuery({
    queryKey: financeBooksKeys.bankHistory(orgId, offset),
    queryFn: () => fetchBankHistory(orgId, offset, 20),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const columns = [
    { key: "at", label: "When", width: 110, render: (row: BankHistoryEvent) => formatDocDate(row.at) },
    { key: "type", label: "Event", width: 150, render: (row: BankHistoryEvent) => HISTORY_LABEL[row.type] ?? row.type },
    { key: "detail", label: "Detail", render: historyDetail },
    { key: "actor", label: "By", width: 150, render: (row: BankHistoryEvent) => row.actor ?? "—" },
  ];
  return (
    <>
      <SectionTitle title="Reconciliation history" />
      <QueryState
        loading={history.isLoading}
        error={history.data?.error}
        empty={!history.isLoading && (history.data?.data.rows.length ?? 0) === 0}
        emptyText="No imports or matches yet."
      />
      <DataTable columns={columns} rows={history.data?.data.rows ?? []} rowKey={(row) => row.id} />
      <Pager offset={offset} pageSize={20} total={history.data?.data.total ?? 0} onChange={setOffset} />
    </>
  );
}
