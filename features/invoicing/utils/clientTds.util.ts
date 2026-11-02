function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A client withholds this percent once. 0 means the bank credit matches the invoice. */
export function normalizeClientTdsPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return round2(Math.min(100, value));
}

/** Split a gross amount into the TDS the client keeps and the bank credit we expect. */
export function expectedAfterTds(
  gross: number,
  percent: number,
): { gross: number; percent: number; tds: number; bank: number } {
  const base = round2(Math.max(0, gross));
  const rate = normalizeClientTdsPercent(percent);
  const tds = round2(base * rate / 100);
  return { gross: base, percent: rate, tds, bank: round2(base - tds) };
}

/** Bank credit implies the TDS when the client rate is already known. */
export function tdsForBankCredit(bank: number, percent: number): number {
  const rate = normalizeClientTdsPercent(percent);
  const cash = round2(Math.max(0, bank));
  if (rate <= 0 || rate >= 100 || cash <= 0) return 0;
  return round2(cash * rate / (100 - rate));
}
