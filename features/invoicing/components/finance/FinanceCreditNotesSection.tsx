/**
 * Credit notes: register, detail with lines and audit history, PDF; issuing a
 * credit note against one issued invoice; cancelling an unsettled invoice.
 * The original invoice total is never changed.
 */
import { CreditNoteIssueForm } from "@/features/invoicing/components/finance/CreditNoteIssueForm";
import { CustomerRefundsPanel } from "@/features/invoicing/components/finance/CustomerRefundsPanel";
import {
  ActionButton,
  Card,
  Chip,
  DataTable,
  Field,
  FinancePage,
  Note,
  Pager,
  QueryState,
  Row,
  SectionTitle,
  StatusPill,
  ui,
} from "@/features/invoicing/components/finance/FinanceUi";
import { invalidateFinanceBalances } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import { useWorkspaceFinance } from "@/features/invoicing/hooks/useWorkspaceFinance";
import { cancelIssuedInvoice } from "@/features/invoicing/services/financeControls.service";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import type { WorkspaceNote } from "@/features/invoicing/utils/workspaceFinance.util";
import { REVENUE_REASON_OPTIONS, addTripAdjustment } from "@/features/trips/services/tripAdjustments";
import {
  REGISTER_PAGE_SIZE,
  fetchCreditNotes,
  fetchInvoiceFinanceHistory,
  fetchInvoiceRegister,
  fetchStatementParties,
  financeBooksKeys,
  newFinanceKey,
  type CreditNoteRow,
  type InvoiceHistoryEvent,
  type InvoiceRegisterRow,
} from "@/features/invoicing/services/financeBooks.service";
import { buildCreditNoteHtml, formatDocDate, formatInr } from "@/features/invoicing/utils/financeDocuments.util";
import { downloadFinancePdf, printFinanceDocument } from "@/features/invoicing/utils/financeDocumentOutput.util";
import { queryKeys } from "@/lib/queryKeys";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

const HISTORY_LABELS: Record<string, string> = {
  credit_issued: "Credit note issued",
  cancelled: "Invoice cancelled",
  payment_recorded: "Receipt recorded",
  payment_allocated: "Receipt applied",
  payment_reversed: "Receipt reversed",
  refund_recorded: "Refund paid",
  refund_reversed: "Refund reversed",
};

function creditTaxLine(note: CreditNoteRow): string {
  if (note.taxTreatment === "gst") {
    const rate = note.gstRate ?? 0;
    return note.supplyType === "intra"
      ? `Taxable ${formatInr(note.taxableAmount)} · CGST @ ${rate / 2}% ${formatInr(note.cgstAmount)} · SGST @ ${rate / 2}% ${formatInr(note.sgstAmount)}`
      : `Taxable ${formatInr(note.taxableAmount)} · IGST @ ${rate}% ${formatInr(note.igstAmount)}`;
  }
  return note.taxTreatment === "no_gst" ? "Without GST adjustment (value only)" : "Issued before GST breakups were recorded";
}

export function FinanceCreditNotesSection({
  orgId,
  clientId,
  clientName,
  canRecord,
  trips = [],
  onTripsChanged,
}: {
  orgId: string;
  clientId: string | null;
  clientName: string | null;
  canRecord: boolean;
  trips?: readonly InvoicingTripView[];
  invoices?: readonly IssuedInvoiceListRow[];
  onTripsChanged?: () => void;
}) {
  const [scope, setScope] = useState<"client" | "all">(clientId ? "client" : "all");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<CreditNoteRow | null>(null);
  const [mode, setMode] = useState<"register" | "issue" | "cancel">("register");
  const scopedClient = scope === "client" ? clientId : null;

  const register = useQuery({
    queryKey: financeBooksKeys.creditNotes(orgId, scopedClient, offset),
    queryFn: () => fetchCreditNotes({ orgId, clientId: scopedClient, offset }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    enabled: mode === "register",
  });
  const rows = register.data?.data.rows ?? [];
  const booksDown = register.data?.unavailable === true;
  const workspace = useWorkspaceFinance({ orgId, clientId, clientName, trips });

  const columns = [
    { key: "number", label: "Credit note", width: 170, render: (row: CreditNoteRow) => row.creditNumber },
    { key: "date", label: "Date", width: 100, render: (row: CreditNoteRow) => formatDocDate(row.creditDate) },
    { key: "invoice", label: "Against invoice", width: 140, render: (row: CreditNoteRow) => row.invoiceNumber },
    { key: "client", label: "Customer", render: (row: CreditNoteRow) => row.clientName ?? "—", compactHidden: scope === "client" },
    { key: "reason", label: "Reason", render: (row: CreditNoteRow) => row.reason },
    { key: "tax", label: "GST", width: 100, align: "right" as const, render: (row: CreditNoteRow) => (row.taxTreatment === "gst" ? formatInr(row.taxAmount) : "—") },
    { key: "amount", label: "Amount", width: 110, align: "right" as const, render: (row: CreditNoteRow) => formatInr(row.amount) },
    {
      key: "status",
      label: "Status",
      width: 90,
      render: (row: CreditNoteRow) => <StatusPill label={row.status === "void" ? "Void" : "Issued"} tone={row.status === "void" ? "muted" : "ok"} />,
    },
  ];

  return (
    <FinancePage>
      <SectionTitle
        title="Credit notes"
        hint="Credit notes reduce what the customer owes. Debit notes increase it. Trip notes are the same CN/DN already used on the invoice and the trip."
        actions={
          canRecord ? (
            <>
              <ActionButton label="Issue credit note" kind={mode === "issue" ? "primary" : "secondary"} disabled={!clientId} onPress={() => setMode(mode === "issue" ? "register" : "issue")} />
              {booksDown ? null : (
                <ActionButton label="Cancel invoice" kind={mode === "cancel" ? "primary" : "secondary"} disabled={!clientId} onPress={() => setMode(mode === "cancel" ? "register" : "cancel")} />
              )}
            </>
          ) : null
        }
      />
      {canRecord && !clientId ? <Note>Select a client in the list to issue a credit note or cancel an invoice.</Note> : null}
      {mode === "issue" && clientId ? (
        booksDown ? (
          <TripNoteForm
            orgId={orgId}
            trips={trips}
            onDone={() => setMode("register")}
            onSaved={() => {
              void workspace.notesQuery.refetch();
              onTripsChanged?.();
            }}
          />
        ) : (
          <CreditNoteIssueForm orgId={orgId} clientId={clientId} onDone={() => setMode("register")} />
        )
      ) : mode === "cancel" && clientId && !booksDown ? (
        <CancelInvoice orgId={orgId} clientId={clientId} onDone={() => setMode("register")} />
      ) : (
        <>
          <Row>
            <Chip label={clientName ? `${clientName} only` : "This client"} active={scope === "client"} disabled={!clientId} onPress={() => { setScope("client"); setOffset(0); }} />
            <Chip label="All customers" active={scope === "all"} onPress={() => { setScope("all"); setOffset(0); }} />
          </Row>
          {booksDown ? null : (
            <>
          <QueryState
            loading={register.isLoading}
            error={register.data?.error}
            empty={!register.isLoading && rows.length === 0 && !register.data?.error && !booksDown}
            emptyText="No invoice credit notes issued."
            onRetry={() => void register.refetch()}
          />
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            selectedKey={selected?.id ?? null}
            onPressRow={setSelected}
            rowLabel={(row) => `Credit note ${row.creditNumber}`}
          />
          <Pager offset={offset} pageSize={REGISTER_PAGE_SIZE} total={register.data?.data.total ?? 0} onChange={setOffset} />
          {selected ? <CreditNoteDetail orgId={orgId} note={selected} /> : null}
          {clientId ? <CustomerRefundsPanel orgId={orgId} clientId={clientId} clientName={clientName ?? "Customer"} canRecord={canRecord} /> : null}
            </>
          )}
          <TripNotesBook
            notes={workspace.notes}
            loading={workspace.notesLoading}
            onRetry={() => void workspace.notesQuery.refetch()}
          />
        </>
      )}
    </FinancePage>
  );
}

function CreditNoteDetail({ orgId, note }: { orgId: string; note: CreditNoteRow }) {
  const history = useQuery({
    queryKey: financeBooksKeys.invoiceHistory(orgId, note.invoiceId),
    queryFn: () => fetchInvoiceFinanceHistory(orgId, note.invoiceId),
    staleTime: 15_000,
  });
  const [busy, setBusy] = useState<"pdf" | "print" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const output = async (kind: "pdf" | "print") => {
    setBusy(kind);
    setMessage(null);
    const parties = await fetchStatementParties(orgId, note.clientId);
    if (parties.error || !parties.data) {
      setMessage(parties.error ?? "Could not load the customer.");
      setBusy(null);
      return;
    }
    const html = buildCreditNoteHtml(note, parties.data.issuer, parties.data.customer);
    try {
      if (kind === "pdf") await downloadFinancePdf(html, `${note.creditNumber.replace(/[^A-Za-z0-9_-]+/g, "-")}.pdf`);
      else await printFinanceDocument(html, `Credit note ${note.creditNumber}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      if (!/abort|cancel/i.test(text)) setMessage(text || "Could not open the document.");
    }
    setBusy(null);
  };

  const historyColumns = [
    { key: "at", label: "When", width: 110, render: (row: InvoiceHistoryEvent) => formatDocDate(row.at) },
    { key: "type", label: "Event", width: 160, render: (row: InvoiceHistoryEvent) => HISTORY_LABELS[row.type] ?? row.type },
    { key: "amount", label: "Amount", width: 110, align: "right" as const, render: (row: InvoiceHistoryEvent) => (row.amount === null ? "" : formatInr(row.amount)) },
    { key: "ref", label: "Detail", render: (row: InvoiceHistoryEvent) => [row.reason, row.type.startsWith("payment") ? row.reference : null].filter(Boolean).join(" · ") || "—" },
    { key: "actor", label: "By", width: 140, render: (row: InvoiceHistoryEvent) => row.actor ?? "—" },
  ];

  return (
    <Card>
      <SectionTitle
        title={`Credit note ${note.creditNumber}`}
        hint={`Against ${note.invoiceNumber} (${formatInr(note.invoiceTotal)}) · ${formatDocDate(note.creditDate)} · issued by ${note.issuedBy ?? "—"}`}
        actions={
          <>
            <ActionButton label="Download PDF" kind="secondary" busy={busy === "pdf"} disabled={busy !== null} onPress={() => void output("pdf")} />
            <ActionButton label="Print" kind="secondary" busy={busy === "print"} disabled={busy !== null} onPress={() => void output("print")} />
          </>
        }
      />
      {note.lines.map((line, index) => (
        <View key={`${line.description}-${index}`} style={ui.pager}>
          <Text style={ui.td}>{line.description}</Text>
          <Text style={[ui.tdStrong, ui.num]}>{formatInr(line.amount)}</Text>
        </View>
      ))}
      <Text style={ui.hint}>{creditTaxLine(note)}</Text>
      {note.refunded > 0 ? <Text style={ui.hint}>{`Refunded to the customer: ${formatInr(note.refunded)}`}</Text> : null}
      <Text style={ui.fieldLabel}>Invoice history</Text>
      <QueryState
        loading={history.isLoading}
        error={history.data?.error}
        empty={!history.isLoading && (history.data?.data.length ?? 0) === 0}
        emptyText="No finance events for this invoice."
        onRetry={() => void history.refetch()}
      />
      <DataTable columns={historyColumns} rows={history.data?.data ?? []} rowKey={(row) => `${row.at}-${row.type}-${row.amount}`} />
      {message ? <Note tone="error">{message}</Note> : null}
    </Card>
  );
}

function useClientInvoices(orgId: string, clientId: string, openOnly: boolean) {
  return useQuery({
    queryKey: financeBooksKeys.invoiceRegister(orgId, clientId, null, null, 0, openOnly),
    queryFn: () => fetchInvoiceRegister({ orgId, clientId, offset: 0, limit: 200, openOnly }),
    staleTime: 15_000,
  });
}

function InvoicePicker({
  rows,
  value,
  onChange,
}: {
  rows: InvoiceRegisterRow[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <Row>
      {rows.map((row) => (
        <Chip
          key={row.invoiceId}
          label={`${row.invoiceNumber} · ${formatInr(row.outstanding)} open`}
          active={value === row.invoiceId}
          onPress={() => onChange(row.invoiceId)}
        />
      ))}
    </Row>
  );
}

function CancelInvoice({ orgId, clientId, onDone }: { orgId: string; clientId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const invoices = useClientInvoices(orgId, clientId, false);
  const rows = (invoices.data?.data.rows ?? []).filter(
    (row) => row.status !== "cancelled" && row.received === 0 && row.credited === 0,
  );
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const key = useRef<string | null>(null);
  const picked = rows.find((row) => row.invoiceId === invoiceId) ?? null;

  const submit = async () => {
    if (!picked || !reason.trim()) {
      setMessage({ text: "Choose an invoice and enter the reason.", tone: "error" });
      return;
    }
    key.current = key.current ?? newFinanceKey("cancel");
    setBusy(true);
    const result = await cancelIssuedInvoice({ orgId, invoiceId: picked.invoiceId, reason: reason.trim(), idempotencyKey: key.current });
    setBusy(false);
    setConfirming(false);
    if (result.error) {
      setMessage({ text: result.error, tone: "error" });
      return;
    }
    key.current = null;
    await invalidateFinanceBalances(queryClient, orgId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.invoicing.issued(orgId) });
    setMessage({ text: `${picked.invoiceNumber} cancelled. Its number is kept and its trips can be invoiced again.`, tone: "success" });
    onDone();
  };

  return (
    <Card tone="warning">
      <SectionTitle
        title="Cancel invoice"
        hint="Only an issued invoice with no receipts and no credit notes can be cancelled. The number is kept; the ledger shows the invoice and its cancellation."
      />
      <QueryState
        loading={invoices.isLoading}
        error={invoices.data?.error}
        empty={!invoices.isLoading && rows.length === 0}
        emptyText="No invoice of this customer can be cancelled — each has receipts or credit notes, or is already cancelled."
      />
      <InvoicePicker rows={rows} value={invoiceId} onChange={(id) => { setInvoiceId(id); key.current = null; setConfirming(false); }} />
      <Field label="Reason for cancellation" value={reason} onChangeText={(next) => { setReason(next); key.current = null; }} />
      {confirming && picked ? (
        <Row>
          <Note tone="warning">Cancel {picked.invoiceNumber} for {formatInr(picked.total)}? This cannot be undone.</Note>
          <ActionButton label="Confirm cancellation" kind="danger" busy={busy} onPress={() => void submit()} />
          <ActionButton label="Keep invoice" kind="secondary" onPress={() => setConfirming(false)} />
        </Row>
      ) : (
        <Row>
          <ActionButton label="Cancel invoice" kind="danger" disabled={!picked || !reason.trim()} onPress={() => setConfirming(true)} />
          <ActionButton label="Back to register" kind="secondary" onPress={onDone} />
        </Row>
      )}
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
    </Card>
  );
}

function TripNotesBook({
  notes,
  loading,
  onRetry,
}: {
  notes: WorkspaceNote[];
  loading: boolean;
  onRetry: () => void;
}) {
  const [side, setSide] = useState<"customer" | "supplier">("customer");
  const [kind, setKind] = useState<"credit" | "debit" | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = notes.filter((note) => note.side === side && (kind === "all" || note.kind === kind));
  const open = rows.filter((note) => !note.voided);
  const credit = open.filter((note) => note.kind === "credit").reduce((sum, note) => sum + note.amount, 0);
  const debit = open.filter((note) => note.kind === "debit").reduce((sum, note) => sum + note.amount, 0);
  const selected = rows.find((note) => note.id === selectedId) ?? null;
  return (
    <>
      <SectionTitle title="Trip credit and debit notes" hint="The same notes as on the trip and the invoice. On a trip that is not invoiced yet, a customer credit reduces receivables." />
      <Row>
        <Chip label="Customer" active={side === "customer"} onPress={() => setSide("customer")} />
        <Chip label="Supplier" active={side === "supplier"} onPress={() => setSide("supplier")} />
        <Chip label="All" active={kind === "all"} onPress={() => setKind("all")} />
        <Chip label="Credit" active={kind === "credit"} onPress={() => setKind("credit")} />
        <Chip label="Debit" active={kind === "debit"} onPress={() => setKind("debit")} />
      </Row>
      <Row>
        <Card><Text style={ui.hint}>Credit notes</Text><Text style={ui.title}>{formatInr(credit)}</Text></Card>
        <Card><Text style={ui.hint}>Debit notes</Text><Text style={ui.title}>{formatInr(debit)}</Text></Card>
      </Row>
      <QueryState
        loading={loading}
        error={null}
        empty={!loading && rows.length === 0}
        emptyText="No credit or debit notes on these trips yet."
        onRetry={onRetry}
      />
      <DataTable
        columns={[
          { key: "date", label: "Date", width: 110, render: (row: WorkspaceNote) => formatDocDate(row.date) },
          { key: "kind", label: "Type", width: 90, render: (row: WorkspaceNote) => (row.kind === "credit" ? "Credit" : "Debit") },
          { key: "trip", label: "Trip", width: 120, render: (row: WorkspaceNote) => row.tripLabel },
          { key: "invoice", label: "Invoice", width: 140, render: (row: WorkspaceNote) => row.invoiceNumber ?? "—" },
          { key: "reason", label: "Reason", render: (row: WorkspaceNote) => row.reason },
          { key: "amount", label: "Amount", width: 110, align: "right" as const, render: (row: WorkspaceNote) => formatInr(row.amount) },
          { key: "status", label: "Status", width: 90, render: (row: WorkspaceNote) => <StatusPill label={row.voided ? "Void" : "Active"} tone={row.voided ? "muted" : "ok"} /> },
        ]}
        rows={rows}
        rowKey={(row) => row.id}
        selectedKey={selected?.id ?? null}
        onPressRow={(row) => setSelectedId(row.id === selectedId ? null : row.id)}
        rowLabel={(row) => `${row.kind} ${row.tripLabel} ${formatInr(row.amount)}`}
      />
      {selected ? (
        <Note>
          {selected.kind === "credit" ? "Credit" : "Debit"} on {selected.tripLabel}
          {selected.invoiceNumber ? ` · invoice ${selected.invoiceNumber}` : ""}. {selected.reason}.
        </Note>
      ) : null}
    </>
  );
}

function TripNoteForm({
  orgId,
  trips,
  onSaved,
  onDone,
}: {
  orgId: string;
  trips: readonly InvoicingTripView[];
  onSaved: () => void;
  onDone?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tripId, setTripId] = useState<string | null>(null);
  const [kind, setKind] = useState<"credit" | "debit">("credit");
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const needle = query.trim().toLowerCase();
  const matches = trips
    .filter((trip) => {
      if (!needle) return true;
      return [trip.lr_number, trip.trip_number, trip.id, trip.route].some((value) => (value ?? "").toLowerCase().includes(needle));
    })
    .slice(0, 8);
  const picked = trips.find((trip) => (trip.internal_id || trip.id) === tripId) ?? null;
  const amount = Math.round(Number(amountText.replace(/,/g, "")) * 100) / 100;

  const submit = async () => {
    if (!picked || !reason.trim() || !(amount > 0)) {
      setMessage({ text: "Choose a trip, a reason, and an amount greater than zero.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      await addTripAdjustment(
        picked.internal_id || picked.id,
        { type: "revenue", impact: kind === "credit" ? "minus" : "plus", amount, reason: reason.trim() },
        { organizationId: orgId, missionKey: picked.id },
      );
      setAmountText("");
      setReason("");
      setMessage({ text: kind === "credit" ? "Credit note recorded on the trip." : "Debit note recorded on the trip.", tone: "success" });
      onSaved();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not record the note.", tone: "error" });
    }
    setBusy(false);
  };

  return (
    <Card>
      <SectionTitle title="Record a trip note" hint="This is the same credit or debit note used on the invoice and the trip. A customer credit reduces what is still receivable." />
      <Row>
        <Chip label="Credit note" active={kind === "credit"} onPress={() => setKind("credit")} />
        <Chip label="Debit note" active={kind === "debit"} onPress={() => setKind("debit")} />
      </Row>
      <Field label="Find a trip" value={query} onChangeText={setQuery} placeholder="LR, trip or route" />
      <Row>
        {matches.map((trip) => {
          const id = trip.internal_id || trip.id;
          return (
            <Chip
              key={id}
              label={trip.lr_number?.trim() || trip.trip_number || trip.id}
              active={tripId === id}
              onPress={() => setTripId(id)}
            />
          );
        })}
      </Row>
      <Row>
        {REVENUE_REASON_OPTIONS.map((option) => (
          <Chip key={option} label={option} active={reason === option} onPress={() => setReason(option)} />
        ))}
      </Row>
      <Row>
        <Field label="Amount (₹)" value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" width={180} />
        <Field label="Reason" value={reason} onChangeText={setReason} />
      </Row>
      <Row>
        <ActionButton label={kind === "credit" ? "Record credit note" : "Record debit note"} busy={busy} onPress={() => void submit()} />
        {onDone ? <ActionButton label="Back to register" kind="secondary" onPress={onDone} /> : null}
      </Row>
      {picked ? <Note>On {picked.lr_number?.trim() || picked.id}{picked.issuedInvoiceNumber ? ` · invoice ${picked.issuedInvoiceNumber}` : ""}.</Note> : null}
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
    </Card>
  );
}
