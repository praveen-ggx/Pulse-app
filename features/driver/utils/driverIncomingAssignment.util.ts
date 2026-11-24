import type { TripRow } from "@/features/trips/services/trips.service";

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

/** Assigned / pending / scheduled trips that still need the driver accept popup. */
export function isIncomingAssignableTrip(
  trip: Pick<TripRow, "status" | "started_at">,
): boolean {
  if (trip.started_at) return false;
  const status = normalizeStatus(trip.status);
  return status === "assigned" || status === "pending" || status === "scheduled";
}

export function hasIncomingAssignableTrips(
  trips: ReadonlyArray<Pick<TripRow, "status" | "started_at">> | null | undefined,
): boolean {
  return (trips ?? []).some(isIncomingAssignableTrip);
}

/**
 * DCO "You're available" surface only when there is no dispatcher / phone
 * assignment waiting. Incoming linked trips and pending OTP claims must force
 * DriverHomeScreen so JobRequestCard can appear.
 */
export function shouldShowDriverAvailableSurface(input: {
  participationKnown: boolean;
  availabilityLoading: boolean;
  availabilityError: boolean;
  isDcoEligible: boolean;
  available: boolean | undefined;
  hasIncomingAssignment: boolean;
  incomingAssignmentKnown?: boolean;
}): boolean {
  if (!input.participationKnown) return false;
  if (input.availabilityLoading || input.availabilityError) return false;
  if (!input.isDcoEligible) return false;
  if (input.available !== true) return false;
  // Until trips/OTP have loaded once, keep Available off so a just-assigned
  // trip cannot flash the marketplace surface over the accept popup.
  if (input.incomingAssignmentKnown === false) return false;
  if (input.hasIncomingAssignment) return false;
  return true;
}
