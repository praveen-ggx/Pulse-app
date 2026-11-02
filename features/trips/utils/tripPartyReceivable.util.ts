/**
 * DCO Self billed amount resolution.
 *
 * Authoritative source: issued `dco_self_receivables.billed_amount` only.
 * `trips.dco_party_billed` and `trips.notes` are never financial sources.
 * Never substitute earnings or `client_price`.
 */

function roundMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** Billed amount from an issued DCO Self receivable row. Preserves legitimate zero. */
export function dcoSelfReceivableBilledAmount(
  receivable: { billed_amount?: number | null } | null | undefined,
): number | null {
  if (!receivable) return null;
  return roundMoney(receivable.billed_amount);
}

/**
 * Dedicated DCO Self billed amount for a trip.
 * Requires an authoritative receivable. Without it → unavailable (null).
 * `dco_party_billed` / notes are ignored so tagging alone cannot fabricate billed.
 */
export function tripPartyBilledAmount(
  trip: {
    dco_party_billed?: number | null;
    notes?: string | null;
  } | null | undefined,
  receivable?: { billed_amount?: number | null } | null,
): number | null {
  void trip;
  if (receivable === undefined) return null;
  return dcoSelfReceivableBilledAmount(receivable);
}
