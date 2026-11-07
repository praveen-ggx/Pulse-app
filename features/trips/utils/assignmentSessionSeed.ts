/** First-paint driver and vehicle already shown on trip detail, so Change does not wait on a second fetch. */
export type AssignmentSessionSeed = {
  tripId: string;
  driverName: string | null;
  driverPhone: string | null;
  driverAvatarUri: string | null;
  vehicleLabel: string | null;
};

let seed: AssignmentSessionSeed | null = null;

export function setAssignmentSessionSeed(next: AssignmentSessionSeed): void {
  seed = next.tripId ? next : null;
}

export function peekAssignmentSessionSeed(
  tripId: string | null | undefined,
): AssignmentSessionSeed | null {
  if (!tripId || seed?.tripId !== tripId) return null;
  return seed;
}
