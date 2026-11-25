/** Marker stored in trips.notes when the driver-write guard blocks client_id. */
export const DCO_PARTY_NOTE_PREFIX = "<!--pulse-dco-party:";
const DCO_PARTY_NOTE_RE =
  /<!--pulse-dco-party:(\{[^<]*\})-->/;

/**
 * `entered` = the driver typed `billed` by hand (offline flow, 2026-11-25).
 * Older tags without it carry an app-suggested amount (10% guess / trip price).
 */
export type DcoPartyTag = { id: string; name: string; billed?: number; entered?: boolean };

function money(value: unknown): number | undefined {
  const n = Math.round(Number(value) || 0);
  return n > 0 ? n : undefined;
}

export function parseDcoPartyTagFromNotes(
  notes: string | null | undefined,
): DcoPartyTag | null {
  const raw = String(notes ?? "");
  const match = raw.match(DCO_PARTY_NOTE_RE);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as {
      id?: unknown;
      name?: unknown;
      billed?: unknown;
      entered?: unknown;
    };
    const id = String(parsed.id ?? "").trim();
    const name = String(parsed.name ?? "").trim();
    if (!id) return null;
    const billed = money(parsed.billed);
    if (billed == null) return { id, name: name || "Party" };
    return parsed.entered === true
      ? { id, name: name || "Party", billed, entered: true }
      : { id, name: name || "Party", billed };
  } catch {
    return null;
  }
}

export function applyDcoPartyTagToNotes(
  notes: string | null | undefined,
  party: DcoPartyTag,
): string {
  const prior = parseDcoPartyTagFromNotes(notes);
  const stripped = stripDcoPartyTagFromNotes(notes);
  // Keep an existing Yield when retagging without a new billed amount.
  const billed = money(party.billed) ?? money(prior?.billed);
  const marker = `${DCO_PARTY_NOTE_PREFIX}${JSON.stringify({
    id: party.id,
    name: party.name,
    ...(billed != null ? { billed } : {}),
    ...(billed != null && party.entered ? { entered: true } : {}),
  })}-->`;
  return stripped ? `${stripped}\n${marker}` : marker;
}

/**
 * Offline trip amount the driver typed when tagging the party. 0 when nothing
 * was typed — never a calculated figure (no 10% guess, no trip price).
 */
export function offlineEnteredBilled(notes: string | null | undefined): number {
  const tag = parseDcoPartyTagFromNotes(notes);
  return tag?.entered && tag.billed ? tag.billed : 0;
}

export function offlinePartyId(name: string, phone?: string | null): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length >= 8) return `offline:${digits}`;
  const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return `offline:${slug || "party"}`;
}

export function offlinePartiesFromTrips(
  trips: Array<{ client_id?: string | null; client_name?: string | null; notes?: string | null }>,
): Array<{ id: string; name: string; phone?: string | null }> {
  const byId = new Map<string, { id: string; name: string; phone?: string | null }>();
  for (const trip of trips) {
    const noted = parseDcoPartyTagFromNotes(trip.notes);
    if (noted?.id) {
      byId.set(noted.id, { id: noted.id, name: noted.name });
      continue;
    }
    const clientId = String(trip.client_id ?? "").trim();
    const clientName = String(trip.client_name ?? "").trim();
    if (clientId && clientName) {
      byId.set(clientId, { id: clientId, name: clientName });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function stripDcoPartyTagFromNotes(
  notes: string | null | undefined,
): string {
  return String(notes ?? "")
    .replace(DCO_PARTY_NOTE_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
