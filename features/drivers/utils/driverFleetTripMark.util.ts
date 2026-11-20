/** Marker stored in trips.notes when the driver marks an offline trip as fleet work. */
export const FLEET_TRIP_NOTE_PREFIX = "<!--pulse-fleet-trip:";
const FLEET_TRIP_NOTE_RE = /<!--pulse-fleet-trip:(\{[^<]*\})-->/;

/**
 * `fleetOrgId` is the driver's own connected fleet. Only marks that carry it
 * move a trip into the Fleet lane. Older marks (`orgId` = the trip's client
 * org, written for any driver) are ignored, so those trips stay Offline.
 */
export type FleetTripMark = { name: string; orgId?: string; fleetOrgId?: string };

export function parseFleetTripMarkFromNotes(
  notes: string | null | undefined,
): FleetTripMark | null {
  const raw = String(notes ?? "");
  const match = raw.match(FLEET_TRIP_NOTE_RE);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as {
      name?: unknown;
      orgId?: unknown;
      fleetOrgId?: unknown;
    };
    const name = String(parsed.name ?? "").trim();
    if (!name) return null;
    const orgId = String(parsed.orgId ?? "").trim();
    const fleetOrgId = String(parsed.fleetOrgId ?? "").trim();
    return {
      name,
      ...(orgId ? { orgId } : {}),
      ...(fleetOrgId ? { fleetOrgId } : {}),
    };
  } catch {
    return null;
  }
}

export function isFleetTripMarked(notes: string | null | undefined): boolean {
  return parseFleetTripMarkFromNotes(notes) != null;
}

/** True only for a mark a fleet-connected driver made for their own fleet. */
export function isConnectedFleetTripMark(notes: string | null | undefined): boolean {
  return !!parseFleetTripMarkFromNotes(notes)?.fleetOrgId;
}

/** Remove the fleet marker (a Self party tag makes the trip offline again). */
export function stripFleetTripMarkFromNotes(notes: string | null | undefined): string {
  return String(notes ?? "")
    .replace(FLEET_TRIP_NOTE_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function applyFleetTripMarkToNotes(
  notes: string | null | undefined,
  mark: FleetTripMark,
): string {
  const stripped = stripFleetTripMarkFromNotes(notes);
  const orgId = String(mark.orgId ?? "").trim();
  const fleetOrgId = String(mark.fleetOrgId ?? "").trim();
  const marker = `${FLEET_TRIP_NOTE_PREFIX}${JSON.stringify({
    name: mark.name.trim() || "Fleet",
    ...(orgId ? { orgId } : {}),
    ...(fleetOrgId ? { fleetOrgId } : {}),
  })}-->`;
  return stripped ? `${stripped}\n${marker}` : marker;
}
