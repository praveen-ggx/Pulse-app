import { listDriverOfflineParties } from "@/features/drivers/offline/driverOfflineParty";
import * as driversService from "@/features/drivers/services/drivers.service";
import {
  MARKETPLACE_PARTY_ID,
  UNTAGGED_PARTY_ID,
  buildDriverPartyReceivables,
  type DriverPartyReceivable,
} from "@/features/drivers/utils/driverPartyReceivables.util";
import * as tripsService from "@/features/trips/services/trips.service";

export type SelectableShipper = { id: string; name: string };

export type TagPartyListRow = {
  id: string;
  name: string;
  phone?: string | null;
};

/** Device-saved parties plus parties already on this driver's Self trips. */
export async function listTagPartyChoices(
  userId: string | undefined,
): Promise<TagPartyListRow[]> {
  const [local, fromTrips] = await Promise.all([
    listDriverOfflineParties().catch(() => []),
    listSelectableShippers(userId),
  ]);
  const byName = new Map<string, TagPartyListRow>();
  for (const row of local) {
    const name = row.name.trim();
    if (!name) continue;
    byName.set(name.toLowerCase(), { id: row.id, name, phone: row.phone ?? null });
  }
  for (const row of fromTrips) {
    const name = row.name.trim();
    const key = name.toLowerCase();
    if (!name || byName.has(key)) continue;
    byName.set(key, { id: row.id, name, phone: null });
  }
  return [...byName.values()];
}

/** Id stored on the trip tag. Keeps local: ids and client uuids; drops fleet-org keys. */
function partyIdFromShipperParty(partyId: string): string | null {
  if (!partyId.startsWith("shipper:")) return null;
  const rest = partyId.slice("shipper:".length).trim();
  if (!rest || rest.startsWith("org:") || rest.startsWith("name:") || rest === "unknown") {
    return null;
  }
  return rest;
}

let memoryShippers: SelectableShipper[] = [];

/** Last Self party list, so the tag sheet can paint without waiting on the network. */
export function peekSelectableShippers(): SelectableShipper[] {
  return memoryShippers;
}

export function publishSelectableShippers(rows: SelectableShipper[]): void {
  memoryShippers = rows;
}

export function selectableShippersFromReceivables(
  rows: DriverPartyReceivable[],
): SelectableShipper[] {
  const seen = new Set<string>();
  const parties: SelectableShipper[] = [];
  for (const row of rows) {
    if (row.kind !== "shipper") continue;
    if (row.id === UNTAGGED_PARTY_ID || row.id === MARKETPLACE_PARTY_ID) continue;
    const id = partyIdFromShipperParty(row.id);
    if (!id || seen.has(id) || row.name === "Untagged") continue;
    seen.add(id);
    parties.push({ id, name: row.name });
  }
  return parties;
}

/** Parties already on the driver's Self receivables (NVIDIA, Ajio, and the rest). */
export async function listSelectableShippers(
  userId: string | undefined,
): Promise<SelectableShipper[]> {
  if (!userId) return [];
  try {
    const driversRes = await driversService.getLinkedDriversForCurrentUser(userId);
    const drivers = driversRes.drivers ?? [];
    if (drivers.length === 0) return [];
    const tripsRes = await tripsService.getDriverUiTripsByDriverIds(drivers.map((row) => row.id));
    const isFleetDispatched = (trip: tripsService.TripRow) => {
      const tripOrgId = String(trip.organization_id ?? "").trim();
      if (!tripOrgId) return false;
      return drivers.some((row) => {
        if (String(row.organization_id ?? "").trim() !== tripOrgId) return false;
        if (row.tracking_only === true) return false;
        return driversService.isActiveFleetRelationshipDriver(row);
      });
    };
    const parties = selectableShippersFromReceivables(
      buildDriverPartyReceivables(tripsRes.trips ?? [], {}, isFleetDispatched),
    );
    if (parties.length > 0) publishSelectableShippers(parties);
    return parties;
  } catch {
    return [];
  }
}
