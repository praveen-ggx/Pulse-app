/**
 * Receivables, ledger, credit notes, reconciliation, and reports beside the
 * invoice book. When the finance book is on this database, figures come from
 * those RPCs. Until then, invoices, receipts, and trip credit and debit notes
 * already recorded for the customer are shown instead.
 */
import { FinanceCreditNotesSection } from "@/features/invoicing/components/finance/FinanceCreditNotesSection";
import { FinanceLedgerSection } from "@/features/invoicing/components/finance/FinanceLedgerSection";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import { FinanceReceivablesSection } from "@/features/invoicing/components/finance/FinanceReceivablesSection";
import { FinanceReconciliationSection } from "@/features/invoicing/components/finance/FinanceReconciliationSection";
import { FinanceReportsSection } from "@/features/invoicing/components/finance/FinanceReportsSection";
import { ActionButton, Card, Field, Note, Row, SectionTitle } from "@/features/invoicing/components/finance/FinanceUi";
import { recordInvoiceEmailRequest, saveReminderRule } from "@/features/invoicing/services/financeControls.service";
import { useState } from "react";

export type FinanceBookSection = "book" | "receivables" | "ledger" | "credits" | "reconcile" | "reports" | "details";

type Issued = { id: string; invoiceNumber: string; total: number };

export function FinanceBooksPanel({
  section,
  orgId,
  clientId,
  clientName = null,
  canRecord,
  invoices,
  trips = [],
  issuedInvoices = [],
  onRecorded,
  onTripsChanged,
}: {
  section: Exclude<FinanceBookSection, "book" | "details">;
  orgId: string;
  clientId: string | null;
  clientName?: string | null;
  canRecord: boolean;
  /** Issued invoices of the selected client (used by the delivery actions). */
  invoices: Issued[];
  trips?: readonly InvoicingTripView[];
  issuedInvoices?: readonly IssuedInvoiceListRow[];
  onRecorded?: () => void;
  onTripsChanged?: () => void;
}) {
  if (section === "receivables") {
    return <FinanceReceivablesSection orgId={orgId} clientId={clientId} clientName={clientName} canRecord={canRecord} />;
  }
  if (section === "ledger") {
    return (
      <FinanceLedgerSection
        orgId={orgId}
        clientId={clientId}
        clientName={clientName}
        canRecord={canRecord}
        trips={trips}
        invoices={issuedInvoices}
        onRecorded={onRecorded}
        onTripsChanged={onTripsChanged}
      />
    );
  }
  if (section === "credits") {
    return (
      <FinanceCreditNotesSection
        orgId={orgId}
        clientId={clientId}
        clientName={clientName}
        canRecord={canRecord}
        trips={trips}
        invoices={issuedInvoices}
        onTripsChanged={onTripsChanged}
      />
    );
  }
  if (section === "reconcile") {
    return (
      <FinanceReconciliationSection
        orgId={orgId}
        canRecord={canRecord}
        clientId={clientId}
        clientName={clientName ?? null}
        trips={trips}
        invoices={issuedInvoices}
      />
    );
  }
  return (
    <FinanceReportsSection
      orgId={orgId}
      clientId={clientId}
      clientName={clientName}
      canRecord={canRecord}
      trips={trips}
      issuedInvoices={issuedInvoices}
      extra={clientId ? <InvoiceDeliveryActions orgId={orgId} canRecord={canRecord} invoices={invoices} /> : null}
    />
  );
}

/** Email request log and reminder rule (unchanged behaviour; mail delivery is not connected). */
function InvoiceDeliveryActions({ orgId, canRecord, invoices }: { orgId: string; canRecord: boolean; invoices: Issued[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  return (
    <Card>
      <SectionTitle title="Invoice delivery" hint="Records an email request for the latest issued invoice. Mail delivery is not connected on this workspace, so nothing is sent." />
      <Row>
        <Field label="Billing email" value={email} onChangeText={setEmail} autoCapitalize="none" />
        <ActionButton
          label="Record invoice email"
          kind="secondary"
          disabled={!canRecord || invoices.length === 0}
          onPress={() => {
            const invoice = invoices[0];
            if (!invoice || !email.includes("@")) {
              setMessage("Enter a billing email. The first issued invoice is the one recorded.");
              return;
            }
            void recordInvoiceEmailRequest({
              orgId,
              invoiceId: invoice.id,
              recipients: [email.trim()],
              subject: `Invoice ${invoice.invoiceNumber}`,
              idempotencyKey: `${invoice.id}:${email.trim().toLowerCase()}`,
            }).then((result) => {
              if (result.error) {
                setMessage(result.error);
                return;
              }
              setMessage(
                result.result?.duplicate
                  ? "This invoice email was already recorded for that address."
                  : "Email request recorded. Mail delivery is not connected on this workspace, so nothing was sent.",
              );
            });
          }}
        />
        <ActionButton
          label="Turn on reminders"
          kind="secondary"
          disabled={!canRecord}
          onPress={() => {
            void saveReminderRule(orgId, true).then((result) => {
              setMessage(result.error ?? "Reminders are on: 3 days before the due date, then 7 days after. One rule per organization.");
            });
          }}
        />
      </Row>
      {message ? <Note>{message}</Note> : null}
    </Card>
  );
}
