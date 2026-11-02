/** Marker stored in trips.notes when the driver-write guard blocks client_id. */
export const DCO_PARTY_NOTE_PREFIX = "<!--pulse-dco-party:";
const DCO_PARTY_NOTE_RE =
  /<!--pulse-dco-party:(\{[^<]*\})-->/;

export type DcoPartyTag = { id: string; name: string; billed?: number };

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
    };
    const id = String(parsed.id ?? "").trim();
    const name = String(parsed.name ?? "").trim();
    if (!id) return null;
    const billed = money(parsed.billed);
    return billed != null
      ? { id, name: name || "Party", billed }
      : { id, name: name || "Party" };
  } catch {
    return null;
  }
}

export function applyDcoPartyTagToNotes(
  notes: string | null | undefined,
  party: DcoPartyTag,
): string {
  const stripped = stripDcoPartyTagFromNotes(notes);
  const billed = money(party.billed);
  const marker = `${DCO_PARTY_NOTE_PREFIX}${JSON.stringify({
    id: party.id,
    name: party.name,
    ...(billed != null ? { billed } : {}),
  })}-->`;
  return stripped ? `${stripped}\n${marker}` : marker;
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
