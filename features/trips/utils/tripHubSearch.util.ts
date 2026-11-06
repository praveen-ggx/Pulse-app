import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";

export function foldSearchToken(value: string): string {
  return value.toLowerCase().replace(/[\s\-_.]/g, "");
}

/**
 * LR / E-LR numbers from trip_documents (comma-separated labels ok).
 * Strong thresholds align with trip-code / vehicle structural search (≥80).
 */
export function scoreTripLrHubSearchMatch(
  lrLabel: string | null | undefined,
  query: string,
): number {
  const qFold = foldSearchToken(query.trim());
  if (qFold.length < 2) return 0;
  const raw = String(lrLabel ?? "").trim();
  if (!raw) return 0;
  let best = 0;
  for (const part of raw.split(/[,;/|]+/)) {
    const lr = foldSearchToken(part);
    if (!lr) continue;
    if (lr === qFold) best = Math.max(best, 100);
    else if (lr.includes(qFold) || qFold.includes(lr)) best = Math.max(best, 85);
  }
  return best;
}

export type TripHubSearchExtras = {
  clientName?: string | null;
  supplierName?: string | null;
  lrLabel?: string | null;
  elrLabel?: string | null;
  organizationId?: string | null;
};

/**
 * Trips toolbar match: trip id, LR / E-LR, vehicle plate, driver, client, supplier.
 */
export function tripMatchesHubSearch(
  trip: TripRow,
  query: string,
  extras?: TripHubSearchExtras,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qFold = foldSearchToken(q);
  const viewerOrgId = extras?.organizationId ?? trip.organization_id ?? null;
  const tripNo = getTripDisplayNumber(trip, viewerOrgId);
  const vehicle =
    trip.vehicle_display_number ??
    (trip as { vehicle_number?: string | null }).vehicle_number ??
    "";
  const hay = [
    trip.id,
    trip.trip_number,
    trip.display_trip_id,
    tripNo,
    extras?.clientName ?? trip.client_name,
    extras?.supplierName ?? trip.supplier_name,
    trip.driver_display_name,
    vehicle,
    extras?.lrLabel,
    extras?.elrLabel,
    trip.pickup_area,
    trip.drop_location,
  ]
    .map((part) => String(part ?? "").toLowerCase())
    .join(" ");
  if (hay.includes(q)) return true;
  return qFold.length >= 3 && foldSearchToken(hay).includes(qFold);
}
