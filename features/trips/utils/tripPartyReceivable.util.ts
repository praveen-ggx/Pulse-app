const DCO_PARTY_NOTE_RE = /<!--pulse-dco-party:(\{[^<]*\})-->/;

/** Dedicated DCO Self receivable. Never inferred from supplier_rate. */
export function tripPartyBilledAmount(trip: {
  dco_party_billed?: number | null;
  notes?: string | null;
} | null | undefined): number | null {
  const column = Math.round(Number(trip?.dco_party_billed) || 0);
  if (column > 0) return column;
  const match = String(trip?.notes ?? "").match(DCO_PARTY_NOTE_RE);
  if (!match?.[1]) return null;
  try {
    const billed = Math.round(Number(JSON.parse(match[1])?.billed) || 0);
    return billed > 0 ? billed : null;
  } catch {
    return null;
  }
}
