/**
 * Issue a credit note against one issued invoice, with the GST breakup derived from
 * the invoice (CGST + SGST or IGST at its rate) or as a value-only credit.
 * The preview mirrors the server; the server recomputes and refuses any difference.
 * A credit above what the customer still owes becomes customer credit; it is not a
 * refund (refunds are recorded under Receivables → Customer credit).
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
  QueryState,
  Row,
  SectionTitle,
  ui,
} from "@/features/invoicing/components/finance/FinanceUi";
import { invalidateFinanceBalances } from "@/features/invoicing/components/finance/PaymentReceiptSheet";
import {
  fetchCreditableInvoice,
  fetchInvoiceRegister,
  financeBooksKeys,
  issueInvoiceCreditNote,
  newFinanceKey,
} from "@/features/invoicing/services/financeBooks.service";
import {
  gstStructure,
  invoiceCreditableValue,
  previewCreditNote,
  type CreditLinePreview,
  type CreditTreatment,
} from "@/features/invoicing/utils/creditNoteTax.util";
import { formatDocDate, formatInr } from "@/features/invoicing/utils/financeDocuments.util";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text } from "react-native";

const MAX_LINES = 10;
const MAX_PICKER = 12;

function istToday(): string {
  const now = new Date();
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().slice(0, 10);
}

function parseAmount(text: string): number {
  const cleaned = text.replace(/,/g, "").trim();
  if (!cleaned) return Number.NaN;
  return Number(cleaned);
}

type LineDraft = { description: string; value: string };
type PreviewRow = CreditLinePreview & { index: number; label: string };

export function CreditNoteIssueForm({ orgId, clientId, onDone }: { orgId: string; clientId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const invoices = useQuery({
    queryKey: financeBooksKeys.invoiceRegister(orgId, clientId, null, null, 0, false),
    queryFn: () => fetchInvoiceRegister({ orgId, clientId, offset: 0, limit: 200, openOnly: false }),
    staleTime: 15_000,
  });
  const issued = (invoices.data?.data.rows ?? []).filter((row) => row.status !== "cancelled");
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const shown = issued.filter((row) => !needle || row.invoiceNumber.toLowerCase().includes(needle)).slice(0, MAX_PICKER);
  const profileQuery = useQuery({
    queryKey: financeBooksKeys.creditableInvoice(orgId, invoiceId ?? "none"),
    queryFn: () => fetchCreditableInvoice(orgId, invoiceId!),
    enabled: Boolean(invoiceId),
    staleTime: 5_000,
  });
  const profile = profileQuery.data?.data ?? null;
  const structure = profile ? gstStructure(profile) : null;

  const [treatment, setTreatment] = useState<CreditTreatment>("gst");
  const [lines, setLines] = useState<LineDraft[]>([{ description: "", value: "" }]);
  const [reason, setReason] = useState("");
  const [creditDate, setCreditDate] = useState(istToday());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" | "warning" } | null>(null);
  const key = useRef<string | null>(null);

  // Default to GST when the invoice's tax can be derived; otherwise value-only.
  useEffect(() => {
    if (structure) setTreatment(structure.ok ? "gst" : "no_gst");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.invoiceId]);

  const touched = () => {
    key.current = null;
    setConfirming(false);
    setMessage(null);
  };

  const values = lines.map((line) => parseAmount(line.value));
  const allEntered = values.every((value) => Number.isFinite(value) && value > 0);
  const preview = useMemo(
    () => (profile && allEntered ? previewCreditNote(profile, treatment, values) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, treatment, lines],
  );

  const submit = async () => {
    if (!profile || !preview?.ok) return;
    if (!reason.trim()) {
      setMessage({ text: "Enter the reason for the credit note.", tone: "error" });
      return;
    }
    key.current = key.current ?? newFinanceKey("credit");
    setBusy(true);
    const result = await issueInvoiceCreditNote({
      orgId,
      invoiceId: profile.invoiceId,
      creditDate,
      reason: reason.trim(),
      treatment,
      lines: lines.map((line, index) => ({
        description: line.description.trim() || reason.trim(),
        value: preview.lines[index]!.taxable,
        cgst: preview.lines[index]!.cgst,
        sgst: preview.lines[index]!.sgst,
        igst: preview.lines[index]!.igst,
      })),
      idempotencyKey: key.current,
    });
    setBusy(false);
    setConfirming(false);
    if (result.error || !result.note) {
      setMessage({ text: result.error ?? "The credit note was not issued.", tone: "error" });
      void profileQuery.refetch();
      return;
    }
    key.current = null;
    await invalidateFinanceBalances(queryClient, orgId);
    setMessage({
      text:
        result.note.customerCredit > 0
          ? `${result.note.creditNumber} issued for ${formatInr(result.note.amount)}. ${formatInr(result.note.customerCredit)} is now customer credit — refund it from Receivables if the money goes back.`
          : `${result.note.creditNumber} issued for ${formatInr(result.note.amount)}.`,
      tone: "success",
    });
    setLines([{ description: "", value: "" }]);
    setReason("");
    void profileQuery.refetch();
  };

  const previewRows: PreviewRow[] = (preview?.ok ? preview.lines : []).map((row, index) => ({
    ...row,
    index,
    label: lines[index]?.description.trim() || reason.trim() || `Line ${index + 1}`,
  }));
  const previewColumns = [
    { key: "line", label: "Line", render: (row: PreviewRow) => row.label },
    { key: "taxable", label: treatment === "gst" ? "Taxable" : "Amount", width: 110, align: "right" as const, render: (row: PreviewRow) => formatInr(row.taxable) },
    ...(treatment === "gst" && preview?.supply === "intra"
      ? [
          { key: "cgst", label: "CGST", width: 90, align: "right" as const, render: (row: PreviewRow) => formatInr(row.cgst) },
          { key: "sgst", label: "SGST", width: 90, align: "right" as const, render: (row: PreviewRow) => formatInr(row.sgst) },
        ]
      : treatment === "gst"
        ? [{ key: "igst", label: "IGST", width: 90, align: "right" as const, render: (row: PreviewRow) => formatInr(row.igst) }]
        : []),
    { key: "amount", label: "Credit", width: 110, align: "right" as const, render: (row: PreviewRow) => formatInr(row.amount) },
  ];

  return (
    <Card>
      <SectionTitle
        title="Issue credit note"
        hint="Against one issued invoice. The tax is taken from the invoice. It cannot be edited or deleted after issue."
      />
      <QueryState
        loading={invoices.isLoading}
        error={invoices.data?.error}
        unavailable={invoices.data?.unavailable}
        empty={!invoices.isLoading && issued.length === 0 && !invoices.data?.error}
        emptyText="This customer has no issued invoice."
        onRetry={() => void invoices.refetch()}
      />
      {issued.length > 0 ? (
        <Field label="Find invoice" value={search} onChangeText={setSearch} placeholder="Invoice number" autoCapitalize="characters" />
      ) : null}
      <Row>
        {shown.map((row) => (
          <Chip
            key={row.invoiceId}
            label={`${row.invoiceNumber} · ${formatInr(row.total)}`}
            active={invoiceId === row.invoiceId}
            onPress={() => {
              setInvoiceId(row.invoiceId);
              touched();
            }}
          />
        ))}
      </Row>
      {issued.length > shown.length ? (
        <Text style={ui.hint}>{`Showing ${shown.length} of ${issued.length} invoices, newest first. Type an invoice number to find others.`}</Text>
      ) : null}
      {invoiceId ? (
        <QueryState
          loading={profileQuery.isLoading}
          error={profileQuery.data?.error}
          unavailable={profileQuery.data?.unavailable}
          empty={false}
          emptyText=""
          onRetry={() => void profileQuery.refetch()}
        />
      ) : null}
      {profile ? (
        <>
          <MetricRow>
            <Metric label="Invoice total" value={formatInr(profile.total)} />
            <Metric label="Taxable value" value={profile.subtotal === null ? "Unavailable" : formatInr(profile.subtotal)} />
            <Metric
              label={profile.igst > 0 ? "GST on invoice (IGST)" : profile.cgst + profile.sgst > 0 ? "GST on invoice (CGST + SGST)" : "GST on invoice"}
              value={profile.cgst + profile.sgst + profile.igst > 0 ? formatInr(profile.cgst + profile.sgst + profile.igst) : "None"}
            />
            <Metric label="Not yet credited" value={formatInr(invoiceCreditableValue(profile))} />
          </MetricRow>
          <Row>
            <Chip
              label={structure?.ok ? `With GST (${structure.supply === "intra" ? "CGST + SGST" : "IGST"} @ ${profile.gstRate}%)` : "With GST"}
              active={treatment === "gst"}
              disabled={!structure?.ok}
              onPress={() => {
                setTreatment("gst");
                touched();
              }}
            />
            <Chip
              label="Without GST (value only)"
              active={treatment === "no_gst"}
              onPress={() => {
                setTreatment("no_gst");
                touched();
              }}
            />
          </Row>
          {structure && !structure.ok ? <Note tone="warning">{structure.reason}</Note> : null}
          {treatment === "no_gst" && structure?.ok ? (
            <Note tone="warning">A credit without GST reduces what the customer owes but does not reverse any GST on the invoice.</Note>
          ) : null}
          {lines.map((line, index) => (
            <Row key={index}>
              <Field
                label={`Line ${index + 1} description`}
                value={line.description}
                onChangeText={(next) => {
                  setLines((prev) => prev.map((item, i) => (i === index ? { ...item, description: next } : item)));
                  touched();
                }}
                placeholder="e.g. Short delivery"
              />
              <Field
                label={treatment === "gst" ? "Taxable amount (₹, before GST)" : "Credit amount (₹)"}
                value={line.value}
                keyboardType="decimal-pad"
                width={200}
                onChangeText={(next) => {
                  setLines((prev) => prev.map((item, i) => (i === index ? { ...item, value: next } : item)));
                  touched();
                }}
              />
              {lines.length > 1 ? (
                <ActionButton
                  label="Remove"
                  kind="secondary"
                  onPress={() => {
                    setLines((prev) => prev.filter((_, i) => i !== index));
                    touched();
                  }}
                />
              ) : null}
            </Row>
          ))}
          <Row>
            {lines.length < MAX_LINES ? (
              <ActionButton
                label="Add line"
                kind="secondary"
                onPress={() => {
                  setLines((prev) => [...prev, { description: "", value: "" }]);
                  touched();
                }}
              />
            ) : null}
          </Row>
          <Row>
            <Field label="Reason" value={reason} onChangeText={(next) => { setReason(next); touched(); }} placeholder="e.g. Rate correction" />
            <Field label="Credit note date (YYYY-MM-DD)" value={creditDate} width={200} onChangeText={(next) => { setCreditDate(next.trim()); touched(); }} />
          </Row>
          {preview && !preview.ok ? <Note tone="error">{preview.error}</Note> : null}
          {preview?.ok ? (
            <>
              <DataTable columns={previewColumns} rows={previewRows} rowKey={(row) => String(row.index)} />
              <MetricRow>
                {treatment === "gst" ? <Metric label="Taxable" value={formatInr(preview.taxable)} /> : null}
                {treatment === "gst" ? (
                  <Metric
                    label={preview.supply === "intra" ? `CGST + SGST @ ${profile.gstRate / 2}% each` : `IGST @ ${profile.gstRate}%`}
                    value={formatInr(preview.tax)}
                  />
                ) : null}
                <Metric label="Credit note total" value={formatInr(preview.amount)} />
                <Metric label="Customer owes before" value={formatInr(preview.openBefore)} />
              </MetricRow>
              {preview.customerCredit > 0 ? (
                <Note tone="warning">
                  {formatInr(preview.customerCredit)} of this credit is more than the customer still owes on {profile.invoiceNumber}. It becomes customer credit.
                  Nothing is paid out until you record a refund.
                </Note>
              ) : null}
            </>
          ) : null}
          {confirming && preview?.ok ? (
            <Row>
              <Note tone="warning">
                Issue a credit note of {formatInr(preview.amount)} on {profile.invoiceNumber} dated {formatDocDate(creditDate)}? It cannot be edited or deleted.
              </Note>
              <ActionButton label="Confirm and issue" busy={busy} onPress={() => void submit()} />
              <ActionButton label="Review again" kind="secondary" onPress={() => setConfirming(false)} />
            </Row>
          ) : (
            <Row>
              <ActionButton label="Issue credit note" disabled={!preview?.ok || !reason.trim()} onPress={() => setConfirming(true)} />
              <ActionButton label="Back to register" kind="secondary" onPress={onDone} />
            </Row>
          )}
        </>
      ) : (
        <Row>
          <ActionButton label="Back to register" kind="secondary" onPress={onDone} />
        </Row>
      )}
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
      {profile && profile.prior.total > 0 ? (
        <Text style={ui.hint}>{`Earlier credit notes on this invoice: ${formatInr(profile.prior.total)}.`}</Text>
      ) : null}
    </Card>
  );
}
