/**
 * DCO Self tab — party-level receivables (Finance Clients list).
 * Marketplace awards roll up as one party; shipper phone assignments
 * roll up per client / assigning shipper.
 */
import {
  driverHistoryLane,
  type DriverHistoryLane,
} from "@/features/drivers/domain/driverOperatingMode";
import { parseDcoPartyTagFromNotes } from "@/features/drivers/utils/dcoTripPartyTag.util";
import { tripEarningsDetailForDriver } from "@/features/drivers/utils/driverUtils.util";
import { tripPartyBilledAmount } from "@/features/trips/utils/tripPartyReceivable.util";
import type {
  DcoSelfParty,
  DcoSelfReceivableListRow,
} from "@/features/dco-self/services/dcoSelfReceivable.service";
import type { TripRow } from "@/features/trips/services/trips.service";

export type DriverReceivableKind = "marketplace" | "shipper";

export type DriverPartyReceivable = {
  id: string;
  kind: DriverReceivableKind;
  name: string;
  subtitle: string;
  trips: number;
  billed: number;
  received: number;
  due: number;
};

export const MARKETPLACE_PARTY_ID = "marketplace";
/** Offline trip not yet tagged to a Self shipper / middleman. */
export const UNTAGGED_PARTY_ID = "untagged";

export function isTripTaggedToParty(
  trip: Pick<TripRow, "client_id" | "notes"> | null | undefined,
): boolean {
  if (String(trip?.client_id ?? "").trim()) return true;
  return parseDcoPartyTagFromNotes(trip?.notes) != null;
}

/** Offline DCO trips only. Marketplace always bills the listing shipper — never tag. */
export function tripNeedsPartyTag(
  trip: Pick<TripRow, "source" | "operating_mode" | "client_id" | "notes"> | null | undefined,
  isFleetDispatched = false,
): boolean {
  if (!trip) return false;
  if (receivableLaneForTrip(trip, isFleetDispatched) !== "offline") return false;
  return !isTripTaggedToParty(trip);
}

export type DriverPartyTripLine = {
  trip: TripRow;
  billed: number;
  received: number;
  due: number;
};

export function shipperPartyIdForTrip(trip: TripRow): string {
  return shipperPartyKey(trip).id;
}

function marketplaceShipperName(trip: TripRow): string {
  const clientName = String(trip.client_name ?? "").trim();
  const orgName = String(trip.organization_name ?? "").trim();
  return clientName || orgName || "Shipper";
}

/** Shipper / client name. Marketplace uses the listing shipper; offline uses the tagged party. */
export function tripReceivablePartyName(trip: TripRow): string {
  if (String(trip.source ?? "").trim() === "market_bid") {
    return marketplaceShipperName(trip);
  }
  return shipperPartyKey(trip).name;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): boolean {
  return UUID_RE.test((value ?? "").trim());
}

/** Client / shipper-org ids used to resolve the party profile avatar. */
export function partyAvatarLookup(
  partyId: string,
  trips: TripRow[],
): { clientId: string | null; orgId: string | null } {
  const first = trips[0];
  const tripClientId = String(first?.client_id ?? "").trim() || null;
  const tripOrgId = String(first?.organization_id ?? "").trim() || null;

  if (!partyId || partyId === MARKETPLACE_PARTY_ID || partyId === UNTAGGED_PARTY_ID) {
    return { clientId: null, orgId: null };
  }
  if (partyId.startsWith("shipper:org:")) {
    const orgId = partyId.slice("shipper:org:".length).trim();
    return { clientId: tripClientId, orgId: isUuid(orgId) ? orgId : tripOrgId };
  }
  if (partyId.startsWith("shipper:name:") || partyId === "shipper:unknown") {
    return { clientId: tripClientId, orgId: tripOrgId };
  }
  if (partyId.startsWith("shipper:")) {
    const rest = partyId.slice("shipper:".length).trim();
    return {
      clientId: isUuid(rest) ? rest : tripClientId,
      orgId: tripOrgId,
    };
  }
  return { clientId: tripClientId, orgId: tripOrgId };
}

/**
 * Trip billed amount for receivable UI.
 * - DCO Self / offline: only `dco_party_billed` or an authoritative receivable (via
 *   `tripPartyBilledAmount`). Never notes JSON, driver earnings, or `client_price`.
 * - Marketplace Exchange: listing economics may still use agreed rate / client_price.
 * Returns null when DCO Self billed amount is unavailable (distinct from zero).
 */
export function tripReceivableBilled(
  trip: TripRow,
  receivable?: { billed_amount?: number | null } | null,
): number | null {
  const fromDcoBook = tripPartyBilledAmount(trip, receivable);
  if (fromDcoBook != null) return fromDcoBook;
  if (String(trip.source ?? "").trim() === "market_bid") {
    const agreed = tripEarningsDetailForDriver(trip);
    if (agreed.amount > 0) return agreed.amount;
    return Math.max(0, Math.round(Number(trip.client_price ?? 0) || 0));
  }
  return null;
}

function shipperPartyKey(trip: TripRow): { id: string; name: string } {
  const clientId = String(trip.client_id ?? "").trim();
  const clientName = String(trip.client_name ?? "").trim();
  const orgName = String(trip.organization_name ?? "").trim();
  // Assigned-by / fleet org is not the DCO commercial party. AR only
  // after the driver tags a Self shipper or middleman (client_id).
  if (clientId) {
    return { id: `shipper:${clientId}`, name: clientName || orgName || "Party" };
  }
  const noted = parseDcoPartyTagFromNotes(trip.notes);
  if (noted) {
    return { id: `shipper:${noted.id}`, name: noted.name || clientName || "Party" };
  }
  return { id: UNTAGGED_PARTY_ID, name: "Untagged" };
}

export function receivableLaneForTrip(
  trip: Pick<TripRow, "source" | "operating_mode">,
  isFleetDispatched: boolean,
): DriverHistoryLane {
  return driverHistoryLane(trip, isFleetDispatched);
}

export function buildDriverPartyReceivables(
  trips: TripRow[],
  receivedByTripId: Record<string, number>,
  isFleetDispatched: (trip: TripRow) => boolean,
): DriverPartyReceivable[] {
  let marketBilled = 0;
  let marketReceived = 0;
  let marketTrips = 0;
  const shippers = new Map<
    string,
    { name: string; trips: number; billed: number; received: number }
  >();

  for (const trip of trips) {
    const lane = receivableLaneForTrip(trip, isFleetDispatched(trip));
    if (lane === "fleet") continue;
    const billed = tripReceivableBilled(trip) ?? 0;
    const received = Math.max(0, Math.round(Number(receivedByTripId[trip.id] ?? 0) || 0));
    if (lane === "marketplace") {
      marketTrips += 1;
      marketBilled += billed;
      marketReceived += received;
      continue;
    }
    const party = shipperPartyKey(trip);
    const prev = shippers.get(party.id);
    if (prev) {
      prev.trips += 1;
      prev.billed += billed;
      prev.received += received;
    } else {
      shippers.set(party.id, {
        name: party.name,
        trips: 1,
        billed,
        received,
      });
    }
  }

  const rows: DriverPartyReceivable[] = [];
  if (marketTrips > 0) {
    rows.push({
      id: MARKETPLACE_PARTY_ID,
      kind: "marketplace",
      name: "Marketplace",
      subtitle: "Pulse Exchange receivable",
      trips: marketTrips,
      billed: marketBilled,
      received: marketReceived,
      due: Math.max(0, marketBilled - marketReceived),
    });
  }

  const shipperRows = [...shippers.entries()]
    .map(([id, row]) => ({
      id,
      kind: "shipper" as const,
      name: row.name,
      subtitle:
        id === UNTAGGED_PARTY_ID
          ? "Tag a shipper or middleman"
          : "Shipper · client receivable",
      trips: row.trips,
      billed: row.billed,
      received: row.received,
      due: Math.max(0, row.billed - row.received),
    }))
    .sort((a, b) => {
      if (a.id === UNTAGGED_PARTY_ID) return -1;
      if (b.id === UNTAGGED_PARTY_ID) return 1;
      return b.due - a.due || b.billed - a.billed || a.name.localeCompare(b.name);
    });

  return [...rows, ...shipperRows];
}

export function tripsForDriverParty(
  trips: TripRow[],
  receivedByTripId: Record<string, number>,
  isFleetDispatched: (trip: TripRow) => boolean,
  partyId: string,
): DriverPartyTripLine[] {
  const lines: DriverPartyTripLine[] = [];
  for (const trip of trips) {
    const lane = receivableLaneForTrip(trip, isFleetDispatched(trip));
    if (lane === "fleet") continue;
    const match =
      partyId === MARKETPLACE_PARTY_ID
        ? lane === "marketplace"
        : lane !== "marketplace" && shipperPartyKey(trip).id === partyId;
    if (!match) continue;
    const billed = tripReceivableBilled(trip) ?? 0;
    const received = Math.max(0, Math.round(Number(receivedByTripId[trip.id] ?? 0) || 0));
    lines.push({
      trip,
      billed,
      received,
      due: Math.max(0, billed - received),
    });
  }
  lines.sort((a, b) => {
    const da = new Date(a.trip.pickup_date ?? a.trip.completed_at ?? a.trip.created_at ?? "").getTime();
    const db = new Date(b.trip.pickup_date ?? b.trip.completed_at ?? b.trip.created_at ?? "").getTime();
    return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
  });
  return lines;
}

export function summarizeDriverPartyReceivables(rows: DriverPartyReceivable[]): {
  billed: number;
  received: number;
  due: number;
  collectionPercent: number;
} {
  let billed = 0;
  let received = 0;
  for (const row of rows) {
    billed += row.billed;
    received += row.received;
  }
  const due = Math.max(0, billed - received);
  const collectionPercent = billed > 0 ? Math.round((received / billed) * 100) : 0;
  return { billed, received, due, collectionPercent };
}

export function buildDriverPartyReceivablesFromBook(
  rows: DcoSelfReceivableListRow[],
  parties: DcoSelfParty[],
): DriverPartyReceivable[] {
  const names = new Map(parties.map((party) => [party.id, party.name]));
  const byParty = new Map<string, DriverPartyReceivable>();
  for (const row of rows) {
    if (row.receivable.status === "void" || row.receivable.status === "draft") continue;
    const partyId = row.receivable.party_b_id;
    const billed = Math.round(Number(row.receivable.billed_amount) || 0);
    const received = Math.round(Number(row.collected) || 0);
    const due = Math.max(0, billed - received);
    const prev = byParty.get(partyId);
    if (prev) {
      prev.trips += 1;
      prev.billed += billed;
      prev.received += received;
      prev.due += due;
    } else {
      byParty.set(partyId, {
        id: partyId,
        kind: "shipper",
        name: names.get(partyId) || row.receivable.party_a_label || "Party",
        subtitle: "DCO Self receivable",
        trips: 1,
        billed,
        received,
        due,
      });
    }
  }
  return [...byParty.values()].sort((a, b) => b.due - a.due || b.billed - a.billed || a.name.localeCompare(b.name));
}
