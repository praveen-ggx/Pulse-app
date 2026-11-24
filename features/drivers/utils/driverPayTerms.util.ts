/**
 * ONE rule for "what pay terms does this driver have with this fleet".
 *
 * Source of truth = the driver's row for that fleet (`drivers`):
 *  - accept_driver_invite copies the agreed invite terms onto it,
 *  - the fleet edits terms on it (Driver profile → Compensation → Edit),
 *  - the DB trigger fill_driver_commission pays trips from it.
 * The accepted invite is only the ORIGINAL offer; it is used as a fallback
 * when the row carries no terms at all (rows accepted before terms were
 * copied). All three terms come from the same source — never mixed.
 */

export type PayTermsSource = {
  payable_amount?: number | string | null;
  commission_percent?: number | string | null;
  commission_per_km?: number | string | null;
};

export type ResolvedPayTerms = {
  payableAmount: number | null;
  commissionPercent: number | null;
  commissionPerKm: number | null;
};

/** DB numerics can arrive as strings. Zero / blank / invalid → null. */
function positive(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function termsOf(src: PayTermsSource | null | undefined): ResolvedPayTerms {
  return {
    payableAmount: positive(src?.payable_amount),
    commissionPercent: positive(src?.commission_percent),
    commissionPerKm: positive(src?.commission_per_km),
  };
}

export function hasAnyPayTerm(t: ResolvedPayTerms): boolean {
  return t.payableAmount != null || t.commissionPercent != null || t.commissionPerKm != null;
}

/** Driver row terms first; accepted invite only when the row has none. */
export function resolveAgreedPayTerms(
  driverRow: PayTermsSource | null | undefined,
  acceptedInvite?: PayTermsSource | null,
): ResolvedPayTerms {
  const fromRow = termsOf(driverRow);
  if (hasAnyPayTerm(fromRow)) return fromRow;
  return termsOf(acceptedInvite);
}

type RowLike = PayTermsSource & {
  id?: string | null;
  organization_id?: string | null;
  left_at?: string | null;
};

/**
 * The driver row a trip is paid from: the trip's own driver_id first (what
 * the DB trigger uses), else this driver's active row in the trip's fleet.
 * Never a row from another fleet.
 */
export function pickDriverRowForTrip<T extends RowLike>(
  trip: { driver_id?: string | null; organization_id?: string | null } | null | undefined,
  rows: ReadonlyArray<T | null | undefined>,
): T | null {
  if (!trip) return null;
  const list = rows.filter((r): r is T => r != null);
  const driverId = String(trip.driver_id ?? "").trim();
  if (driverId) {
    const exact = list.find((r) => String(r.id ?? "").trim() === driverId);
    if (exact) return exact;
  }
  const orgId = String(trip.organization_id ?? "").trim();
  if (!orgId) return null;
  return (
    list.find(
      (r) =>
        String(r.organization_id ?? "").trim() === orgId &&
        !(r.left_at != null && String(r.left_at).trim() !== ""),
    ) ?? null
  );
}
