function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

/** Days implied by a payment-terms phrase. Shared so draft preview and invoice execution do not import each other. */
export function parsePaymentTermDays(paymentTerms: string | null | undefined): number | null {
  const raw = trimOrNull(paymentTerms);
  if (!raw) return null;
  if (/due on receipt/i.test(raw)) return 0;
  const match = /(?:net\s*)?(\d+)/i.exec(raw);
  if (!match) return null;
  const days = Number.parseInt(match[1], 10);
  return Number.isFinite(days) ? days : null;
}
