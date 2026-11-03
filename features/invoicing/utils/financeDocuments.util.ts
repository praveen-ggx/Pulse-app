/**
 * Printable finance documents (payment receipt, customer statement, credit note)
 * and CSV exports. Pure: input is what the finance RPCs returned, output is HTML or
 * CSV text. No figure is computed here except sums of the rows given.
 */
import type {
  CreditNoteRow,
  CustomerLedgerEntry,
  CustomerLedgerPage,
  PaymentReceipt,
  ReceiptParty,
} from "@/features/invoicing/services/financeBooks.service";
import { paymentModeLabel } from "@/features/invoicing/services/financeBooks.service";

export function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  const sign = amount < 0 ? "−" : "";
  return `${sign}₹${Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Balance with Dr / Cr: positive means the customer owes us. */
export function formatBalance(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  if (Math.abs(amount) < 0.005) return "₹0.00";
  return `${formatInr(Math.abs(amount))} ${amount > 0 ? "Dr" : "Cr"}`;
}

export function formatDocDate(iso: string | null | undefined): string {
  const raw = (iso ?? "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw || "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${match[3]} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeLogo(url: string | null): string | null {
  if (!url) return null;
  return /^https:\/\//i.test(url) ? url : null;
}

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  credit_note: "Credit note",
  payment: "Receipt",
  allocation: "Applied",
  reversal: "Receipt reversed",
  cancellation: "Invoice cancelled",
  refund: "Refund",
  refund_reversal: "Refund reversed",
};

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px; font-size: 12px; }
  .doc { max-width: 760px; margin: 0 auto; position: relative; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #4D3636; padding-bottom: 16px; }
  .issuer { display: flex; gap: 12px; align-items: flex-start; }
  .issuer img { max-height: 48px; max-width: 140px; object-fit: contain; }
  .issuer h1 { font-size: 16px; margin: 0 0 4px; }
  .muted { color: #64748b; }
  .title { text-align: right; }
  .title h2 { font-size: 18px; margin: 0; letter-spacing: 0.5px; color: #4D3636; }
  .title .no { font-size: 13px; font-weight: 600; margin-top: 4px; }
  .grid { display: flex; gap: 24px; margin: 18px 0; }
  .grid > div { flex: 1; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #4D3636; color: #fff; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; text-align: left; padding: 7px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { margin-left: auto; width: 320px; margin-top: 12px; }
  .totals td { border: none; padding: 4px 8px; }
  .totals tr.strong td { font-weight: 700; border-top: 1px solid #0f172a; font-size: 13px; }
  .stamp { position: absolute; top: 120px; left: 50%; transform: translateX(-50%) rotate(-18deg); font-size: 64px; font-weight: 800; color: rgba(232, 33, 39, 0.16); border: 6px solid rgba(232, 33, 39, 0.16); padding: 4px 24px; letter-spacing: 6px; pointer-events: none; }
  .banner { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 8px 12px; margin: 12px 0; border-radius: 4px; font-weight: 600; }
  .foot { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #64748b; }
  @media (max-width: 600px) {
    body { padding: 12px; font-size: 11px; }
    .head, .grid { flex-direction: column; gap: 12px; }
    .title { text-align: left; }
    th, td { padding: 5px 4px; font-size: 10px; }
    .num { white-space: normal; }
    .totals { width: 100%; }
    .stamp { font-size: 34px; border-width: 4px; padding: 2px 10px; letter-spacing: 3px; }
  }
  @media print { body { padding: 0; } .doc { max-width: none; } }
  @page { size: A4; margin: 16mm; }
`;

function partyBlock(partyIn: ReceiptParty | null, fallback: string): string {
  if (!partyIn) return `<div><strong>${escapeHtml(fallback)}</strong></div>`;
  const lines = [
    `<strong>${escapeHtml(partyIn.legalName ?? fallback)}</strong>`,
    ...partyIn.addressLines.map((line) => `<div class="muted">${escapeHtml(line)}</div>`),
    partyIn.gstin ? `<div>GSTIN ${escapeHtml(partyIn.gstin)}</div>` : "",
    partyIn.pan ? `<div>PAN ${escapeHtml(partyIn.pan)}</div>` : "",
    partyIn.phone ? `<div class="muted">${escapeHtml(partyIn.phone)}</div>` : "",
    partyIn.email ? `<div class="muted">${escapeHtml(partyIn.email)}</div>` : "",
  ];
  return lines.filter(Boolean).join("");
}

function issuerHead(issuer: ReceiptParty, title: string, number: string, subtitle: string): string {
  const logo = safeLogo(issuer.logoUrl);
  return `
    <div class="head">
      <div class="issuer">
        ${logo ? `<img src="${escapeHtml(logo)}" alt="" />` : ""}
        <div>
          <h1>${escapeHtml(issuer.legalName ?? "")}</h1>
          ${issuer.addressLines.map((line) => `<div class="muted">${escapeHtml(line)}</div>`).join("")}
          ${issuer.gstin ? `<div>GSTIN ${escapeHtml(issuer.gstin)}</div>` : ""}
          ${issuer.pan ? `<div>PAN ${escapeHtml(issuer.pan)}</div>` : ""}
        </div>
      </div>
      <div class="title">
        <h2>${escapeHtml(title)}</h2>
        <div class="no">${escapeHtml(number)}</div>
        <div class="muted">${escapeHtml(subtitle)}</div>
      </div>
    </div>`;
}

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>${BASE_CSS}</style></head><body><div class="doc">${body}</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Payment receipt
// ---------------------------------------------------------------------------

export function paymentReceiptFileName(receipt: Pick<PaymentReceipt, "receiptNumber">): string {
  return `${receipt.receiptNumber.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "receipt"}.pdf`;
}

export function buildPaymentReceiptHtml(receipt: PaymentReceipt): string {
  const reversed = receipt.status === "reversed";
  const rows = receipt.allocations
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.invoiceNumber)}${row.status === "reversed" ? ' <span class="muted">(reversed)</span>' : ""}</td>
        <td>${escapeHtml(formatDocDate(row.invoiceDate))}</td>
        <td class="num">${escapeHtml(formatInr(row.invoiceTotal))}</td>
        <td class="num">${escapeHtml(formatInr(row.amount))}</td>
      </tr>`,
    )
    .join("");
  const body = `
    ${reversed ? '<div class="stamp">REVERSED</div>' : ""}
    ${issuerHead(receipt.issuer, "PAYMENT RECEIPT", receipt.receiptNumber, `Date ${formatDocDate(receipt.paymentDate)}`)}
    ${
      reversed
        ? `<div class="banner">This receipt was reversed${receipt.reversedAt ? ` on ${escapeHtml(formatDocDate(receipt.reversedAt))}` : ""}${
            receipt.reversalReason ? ` — ${escapeHtml(receipt.reversalReason)}` : ""
          }. It is not an active receipt and settles no invoice.</div>`
        : ""
    }
    <div class="grid">
      <div><div class="label">Received from</div>${partyBlock(receipt.customer, "Customer")}</div>
      <div>
        <div class="label">Payment</div>
        <div>Mode: <strong>${escapeHtml(paymentModeLabel(receipt.paymentMode))}</strong></div>
        <div>Reference: <strong>${escapeHtml(receipt.transactionReference ?? "—")}</strong></div>
        ${receipt.depositAccountLabel ? `<div>Deposited to: ${escapeHtml(receipt.depositAccountLabel)}</div>` : ""}
        <div>Status: <strong>${reversed ? "Reversed" : "Active"}</strong></div>
      </div>
    </div>
    <table>
      <thead><tr><th>Applied to invoice</th><th>Invoice date</th><th class="num">Invoice total</th><th class="num">Applied</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">Not applied to any invoice yet.</td></tr>'}</tbody>
    </table>
    <table class="totals">
      <tr><td>Amount received in bank</td><td class="num">${escapeHtml(formatInr(receipt.bankAmount))}</td></tr>
      ${receipt.tdsAmount > 0 ? `<tr><td>TDS deducted by customer</td><td class="num">${escapeHtml(formatInr(receipt.tdsAmount))}</td></tr>` : ""}
      <tr class="strong"><td>Total settled</td><td class="num">${escapeHtml(formatInr(receipt.amount))}</td></tr>
      <tr><td>Applied to invoices</td><td class="num">${escapeHtml(formatInr(reversed ? 0 : receipt.allocated))}</td></tr>
      ${!reversed && receipt.refunded > 0 ? `<tr><td>Refunded to the customer</td><td class="num">${escapeHtml(formatInr(receipt.refunded))}</td></tr>` : ""}
      ${!reversed && receipt.unallocated > 0 ? `<tr><td>Unallocated (on account)</td><td class="num">${escapeHtml(formatInr(receipt.unallocated))}</td></tr>` : ""}
    </table>
    ${receipt.refunds.length > 0 ? `<p class="muted">Refunds: ${receipt.refunds
      .map((refund) => `${escapeHtml(refund.refundNumber)} ${escapeHtml(formatDocDate(refund.refundDate))} ${escapeHtml(formatInr(refund.amount))}${refund.status === "reversed" ? " (reversed)" : ""}`)
      .join("; ")}</p>` : ""}
    ${receipt.notes ? `<p class="muted">Notes: ${escapeHtml(receipt.notes)}</p>` : ""}
    <div class="foot">
      Recorded by ${escapeHtml(receipt.recordedBy ?? "—")}${receipt.recordedAt ? ` on ${escapeHtml(formatDocDate(receipt.recordedAt))}` : ""}.
      ${reversed && receipt.reversedBy ? ` Reversed by ${escapeHtml(receipt.reversedBy)}.` : ""}
      This receipt is generated from the recorded payment. It is not a tax invoice.
    </div>`;
  return wrap(`Receipt ${receipt.receiptNumber}`, body);
}

export function paymentReceiptShareText(receipt: PaymentReceipt): string {
  const lines = [
    `${receipt.issuer.legalName ?? ""} — Payment receipt ${receipt.receiptNumber}`.trim(),
    receipt.status === "reversed" ? "STATUS: REVERSED — not an active receipt" : null,
    `Date: ${formatDocDate(receipt.paymentDate)}`,
    `Received from: ${receipt.customer?.legalName ?? "Customer"}`,
    `Amount received: ${formatInr(receipt.bankAmount)}`,
    receipt.tdsAmount > 0 ? `TDS deducted: ${formatInr(receipt.tdsAmount)}` : null,
    `Mode: ${paymentModeLabel(receipt.paymentMode)}${receipt.transactionReference ? ` · Ref ${receipt.transactionReference}` : ""}`,
    receipt.allocations.length
      ? `Applied: ${receipt.allocations
          .filter((row) => row.status === "confirmed")
          .map((row) => `${row.invoiceNumber} ${formatInr(row.amount)}`)
          .join(", ")}`
      : null,
    receipt.unallocated > 0 && receipt.status !== "reversed" ? `Unallocated: ${formatInr(receipt.unallocated)}` : null,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

// ---------------------------------------------------------------------------
// Customer statement
// ---------------------------------------------------------------------------

export type StatementInput = {
  issuer: ReceiptParty;
  customer: ReceiptParty;
  from: string | null;
  to: string | null;
  generatedOn: string;
  ledger: CustomerLedgerPage & { truncated?: boolean };
};

export function statementPeriodLabel(from: string | null, to: string | null): string {
  if (!from && !to) return "All transactions";
  if (from && to) return `${formatDocDate(from)} – ${formatDocDate(to)}`;
  if (from) return `From ${formatDocDate(from)}`;
  return `Up to ${formatDocDate(to)}`;
}

function statementRows(entries: readonly CustomerLedgerEntry[]): CustomerLedgerEntry[] {
  // Allocations move no money between the customer and us; they stay on screen, not on paper.
  return entries.filter((row) => row.type !== "allocation");
}

export function buildCustomerStatementHtml(input: StatementInput): string {
  const { ledger } = input;
  const rows = statementRows(ledger.rows)
    .map(
      (row) => `<tr>
        <td>${escapeHtml(formatDocDate(row.date))}</td>
        <td>${escapeHtml(LEDGER_TYPE_LABELS[row.type] ?? row.type)}</td>
        <td>${escapeHtml(row.number ?? "")}${row.reference && row.reference !== row.number ? `<div class="muted">${escapeHtml(row.reference)}</div>` : ""}</td>
        <td class="num">${row.debit ? escapeHtml(formatInr(row.debit)) : ""}</td>
        <td class="num">${row.credit ? escapeHtml(formatInr(row.credit)) : ""}</td>
        <td class="num">${escapeHtml(formatBalance(row.runningBalance))}</td>
      </tr>`,
    )
    .join("");
  const body = `
    ${issuerHead(input.issuer, "STATEMENT OF ACCOUNT", statementPeriodLabel(input.from, input.to), `Generated ${formatDocDate(input.generatedOn)}`)}
    <div class="grid">
      <div><div class="label">Customer</div>${partyBlock(input.customer, "Customer")}</div>
      <div>
        <div class="label">Summary</div>
        <table class="totals" style="margin:0;width:100%">
          <tr><td>Opening balance</td><td class="num">${escapeHtml(formatBalance(ledger.openingBalance))}</td></tr>
          <tr><td>Invoiced and debits</td><td class="num">${escapeHtml(formatInr(ledger.periodDebit))}</td></tr>
          <tr><td>Receipts and credits</td><td class="num">${escapeHtml(formatInr(ledger.periodCredit))}</td></tr>
          <tr class="strong"><td>Closing balance</td><td class="num">${escapeHtml(formatBalance(ledger.closingBalance))}</td></tr>
        </table>
      </div>
    </div>
    ${ledger.truncated ? '<div class="banner">This period has more entries than one statement can hold. Narrow the dates.</div>' : ""}
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Document</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead>
      <tbody>
        <tr><td></td><td colspan="4"><strong>Opening balance</strong></td><td class="num"><strong>${escapeHtml(formatBalance(ledger.openingBalance))}</strong></td></tr>
        ${rows || '<tr><td colspan="6" class="muted">No transactions in this period.</td></tr>'}
        <tr><td></td><td colspan="4"><strong>Closing balance</strong></td><td class="num"><strong>${escapeHtml(formatBalance(ledger.closingBalance))}</strong></td></tr>
      </tbody>
    </table>
    <div class="foot">Dr = amount due from the customer. Cr = amount held for the customer. Balances include every transaction before the period, so the opening balance carries forward.</div>`;
  return wrap(`Statement ${input.customer.legalName ?? ""}`, body);
}

export function statementFileName(customerName: string | null, from: string | null, to: string | null): string {
  const name = (customerName ?? "customer").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "customer";
  return `statement-${name}-${from ?? "start"}-${to ?? "today"}`;
}

// ---------------------------------------------------------------------------
// Credit note
// ---------------------------------------------------------------------------

function rateLabel(rate: number | null, half: boolean): string {
  if (rate === null) return "";
  const value = half ? rate / 2 : rate;
  return ` @ ${Number.isInteger(value) ? value.toFixed(0) : String(value)}%`;
}

export function buildCreditNoteHtml(note: CreditNoteRow, issuer: ReceiptParty, customer: ReceiptParty | null): string {
  const gst = note.taxTreatment === "gst";
  const intra = note.supplyType === "intra";
  const head = gst
    ? `<tr><th>Description</th><th class="num">Taxable value</th>${intra ? '<th class="num">CGST</th><th class="num">SGST</th>' : '<th class="num">IGST</th>'}<th class="num">Amount</th></tr>`
    : '<tr><th>Description</th><th class="num">Tax included</th><th class="num">Amount</th></tr>';
  const rows = note.lines
    .map((line) =>
      gst
        ? `<tr><td>${escapeHtml(line.description)}</td><td class="num">${escapeHtml(formatInr(line.amount - line.taxAmount))}</td>${
            intra
              ? `<td class="num">${escapeHtml(formatInr(line.cgstAmount))}</td><td class="num">${escapeHtml(formatInr(line.sgstAmount))}</td>`
              : `<td class="num">${escapeHtml(formatInr(line.igstAmount))}</td>`
          }<td class="num">${escapeHtml(formatInr(line.amount))}</td></tr>`
        : `<tr><td>${escapeHtml(line.description)}</td><td class="num">${escapeHtml(formatInr(line.taxAmount))}</td><td class="num">${escapeHtml(formatInr(line.amount))}</td></tr>`,
    )
    .join("");
  const totals = gst
    ? `<tr><td>Taxable value</td><td class="num">${escapeHtml(formatInr(note.taxableAmount))}</td></tr>
       ${intra
         ? `<tr><td>CGST${escapeHtml(rateLabel(note.gstRate, true))}</td><td class="num">${escapeHtml(formatInr(note.cgstAmount))}</td></tr>
            <tr><td>SGST${escapeHtml(rateLabel(note.gstRate, true))}</td><td class="num">${escapeHtml(formatInr(note.sgstAmount))}</td></tr>`
         : `<tr><td>IGST${escapeHtml(rateLabel(note.gstRate, false))}</td><td class="num">${escapeHtml(formatInr(note.igstAmount))}</td></tr>`}`
    : "";
  const treatmentNote =
    note.taxTreatment === "gst"
      ? `GST ${intra ? "CGST + SGST (intra-state)" : "IGST (inter-state)"} reversed at the invoice rate.`
      : note.taxTreatment === "no_gst"
        ? "Commercial credit without GST adjustment."
        : "Issued before GST breakups were recorded.";
  const body = `
    ${note.status === "void" ? '<div class="stamp">VOID</div>' : ""}
    ${issuerHead(issuer, "CREDIT NOTE", note.creditNumber, `Date ${formatDocDate(note.creditDate)}`)}
    <div class="grid">
      <div><div class="label">Issued to</div>${partyBlock(customer, note.clientName ?? "Customer")}</div>
      <div>
        <div class="label">Against invoice</div>
        <div><strong>${escapeHtml(note.invoiceNumber)}</strong> dated ${escapeHtml(formatDocDate(note.invoiceDate))}</div>
        <div>Invoice total ${escapeHtml(formatInr(note.invoiceTotal))}</div>
        <div>Reason: ${escapeHtml(note.reason)}</div>
      </div>
    </div>
    <table>
      <thead>${head}</thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">${totals}<tr class="strong"><td>Credit amount</td><td class="num">${escapeHtml(formatInr(note.amount))}</td></tr>${
      note.refunded > 0 ? `<tr><td>Refunded to the customer</td><td class="num">${escapeHtml(formatInr(note.refunded))}</td></tr>` : ""
    }</table>
    <p class="muted">${escapeHtml(treatmentNote)}</p>
    <div class="foot">Issued by ${escapeHtml(note.issuedBy ?? "—")}. The original invoice total is unchanged; this credit reduces the amount due on it. A credit note is not a refund; money returned to the customer is recorded separately as a refund.</div>`;
  return wrap(`Credit note ${note.creditNumber}`, body);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(2) : "") : String(value);
  // Neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value !== "number" ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: readonly string[], rowsIn: readonly (readonly unknown[])[]): string {
  return [header.map(csvCell).join(","), ...rowsIn.map((row) => row.map(csvCell).join(","))].join("\r\n");
}

export function ledgerCsv(ledger: CustomerLedgerPage): string {
  return toCsv(
    ["Date", "Type", "Document", "Reference", "Description", "Debit", "Credit", "Balance"],
    [
      ["", "Opening balance", "", "", "", "", "", ledger.openingBalance],
      ...ledger.rows.map((row) => [
        row.date,
        LEDGER_TYPE_LABELS[row.type] ?? row.type,
        row.number ?? "",
        row.reference ?? "",
        row.description ?? "",
        row.debit,
        row.credit,
        row.runningBalance,
      ]),
      ["", "Closing balance", "", "", "", ledger.periodDebit, ledger.periodCredit, ledger.closingBalance],
    ],
  );
}
