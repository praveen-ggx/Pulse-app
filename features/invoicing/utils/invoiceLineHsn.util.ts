/**
 * HSN/SAC on invoice lines. Never invent a code.
 * India HSN/SAC is 4–8 digits. Blank is incomplete, not a default.
 */

export function normalizeHsnSac(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\s+/g, "").replace(/[^0-9]/g, "");
  return digits.length > 0 ? digits : null;
}

export function isCompleteHsnSac(raw: string | null | undefined): boolean {
  const digits = normalizeHsnSac(raw);
  if (!digits) return false;
  return digits.length >= 4 && digits.length <= 8;
}

export function invoiceLinesMissingHsn(
  lines: Array<{ hsn_sac?: string | null; description?: string | null; sku?: string | null }>,
): number {
  return lines.filter((line) => !isCompleteHsnSac(line.hsn_sac)).length;
}

export function invoiceHsnIssueBlock(
  lines: Array<{ hsn_sac?: string | null }>,
): string | null {
  const missing = invoiceLinesMissingHsn(lines);
  if (missing === 0) return null;
  return missing === 1
    ? "HSN/SAC is required on every invoice line. Enter a valid 4–8 digit code — do not guess."
    : `${missing} lines are missing HSN/SAC. Enter a valid 4–8 digit code on each line — do not guess.`;
}
