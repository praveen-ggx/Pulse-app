/** Marker stored in trips.notes when the driver marks an offline trip as fleet work. */
export const FLEET_TRIP_NOTE_PREFIX = "<!--pulse-fleet-trip:";
const FLEET_TRIP_NOTE_RE = /<!--pulse-fleet-trip:(\{[^<]*\})-->/;

export type FleetTripMark = { name: string; orgId?: string };

export function parseFleetTripMarkFromNotes(
  notes: string | null | undefined,
): FleetTripMark | null {
  const raw = String(notes ?? "");
  const match = raw.match(FLEET_TRIP_NOTE_RE);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as { name?: unknown; orgId?: unknown };
    const name = String(parsed.name ?? "").trim();
    if (!name) return null;
    const orgId = String(parsed.orgId ?? "").trim();
    return orgId ? { name, orgId } : { name };
  } catch {
    return null;
  }
}

export function isFleetTripMarked(notes: string | null | undefined): boolean {
  return parseFleetTripMarkFromNotes(notes) != null;
}

export function applyFleetTripMarkToNotes(
  notes: string | null | undefined,
  mark: FleetTripMark,
): string {
  const stripped = String(notes ?? "")
    .replace(FLEET_TRIP_NOTE_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const orgId = String(mark.orgId ?? "").trim();
  const marker = `${FLEET_TRIP_NOTE_PREFIX}${JSON.stringify({
    name: mark.name.trim() || "Fleet",
    ...(orgId ? { orgId } : {}),
  })}-->`;
  return stripped ? `${stripped}\n${marker}` : marker;
}
