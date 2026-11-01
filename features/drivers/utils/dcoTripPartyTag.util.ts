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

export function stripDcoPartyTagFromNotes(
  notes: string | null | undefined,
): string {
  return String(notes ?? "")
    .replace(DCO_PARTY_NOTE_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
