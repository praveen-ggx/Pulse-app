/**
 * User-facing invoice reference. The database id on invoices.id stays the
 * permanent unique key. Changing the sequence never rewrites a saved number.
 */

export type InvoiceNumberSettings = {
  /** Empty means “use the company prefix”. */
  prefix: string;
  start: number;
};

export function indiaFinancialYear(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month >= 4) return `${year}-${String(year + 1).slice(-2)}`;
  return `${year - 1}-${String(year).slice(-2)}`;
}

/** First three letters of the legal name. Falls back to INV. */
export function companyInvoicePrefix(legalName: string | null | undefined): string {
  const letters = (legalName ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length >= 3) return letters.slice(0, 3);
  if (letters.length > 0) return letters.padEnd(3, "X");
  return "INV";
}

export function normalizeInvoicePrefix(value: string, legalName?: string | null): string {
  const letters = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (letters.length > 0) return letters;
  return companyInvoicePrefix(legalName);
}

export function formatInvoiceReference(args: {
  prefix: string;
  financialYear: string;
  sequence: number;
}): string {
  const seq = Math.max(1, Math.floor(args.sequence));
  return `${args.prefix}/${args.financialYear}/${String(seq).padStart(5, "0")}`;
}

export function sequenceInReference(
  invoiceNumber: string,
  prefix: string,
  financialYear: string,
): number | null {
  const match = new RegExp(`^${prefix}/${financialYear}/(\\d+)$`, "i").exec(invoiceNumber.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** Next reference. Saved numbers are only read, never chosen again. */
export function nextInvoiceSequence(args: { start: number; used: readonly number[] }): number {
  const start = Number.isFinite(args.start) && args.start > 0 ? Math.floor(args.start) : 1;
  const highest = args.used.reduce((max, value) => (value > max ? value : max), 0);
  return Math.max(start, highest + 1);
}
