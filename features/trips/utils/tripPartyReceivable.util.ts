/**
 * DCO Self billed amount resolution.
 *
 * Authoritative source: DCO Self receivable `billed_amount`.
 * Trip column `dco_party_billed` is a non-notes mirror when present.
 * Never parse `trips.notes`, never substitute earnings or `client_price`.
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
 * Prefer an authoritative receivable when provided; otherwise use `dco_party_billed` only.
 * Returns null when unavailable (distinct from zero).
 */
export function tripPartyBilledAmount(
  trip: {
    dco_party_billed?: number | null;
    notes?: string | null;
  } | null | undefined,
  receivable?: { billed_amount?: number | null } | null,
): number | null {
  if (receivable !== undefined) {
    return dcoSelfReceivableBilledAmount(receivable);
  }
  // Intentionally ignore trips.notes (including pulse-dco-party JSON billed).
  void trip?.notes;
  return roundMoney(trip?.dco_party_billed);
}
