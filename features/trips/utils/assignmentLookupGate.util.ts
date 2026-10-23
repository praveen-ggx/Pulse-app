import { normalizeIndianMobileLast10 } from "@/features/trips/utils/driverPhoneLookup.util";

/** True when the typed phone is the driver already assigned to this trip. */
export function isCurrentAssignedPhone(
  typedPhone: string | null | undefined,
  assignedPhone: string | null | undefined,
): boolean {
  const typed = normalizeIndianMobileLast10(typedPhone ?? "");
  const assigned = normalizeIndianMobileLast10(assignedPhone ?? "");
  return typed.length >= 10 && typed === assigned;
}

/**
 * Availability lookup must not block Confirm when editing the current driver
 * (same last-10) or when only the vehicle is changing.
 */
export function assignmentLookupBlocksSubmit(opts: {
  inTrip: boolean;
  loading: boolean;
  skipDriverSteps: boolean;
  isCurrentAssignedPhone: boolean;
}): boolean {
  if (opts.skipDriverSteps || opts.isCurrentAssignedPhone) return false;
  return opts.inTrip || opts.loading;
}

/** RPC can report this trip as busy; treat that as available for edit/swap. */
export function isBusyOnExcludedTrip(
  busyTripId: string | null | undefined,
  excludeTripId: string | null | undefined,
): boolean {
  const busy = (busyTripId ?? "").trim();
  const exclude = (excludeTripId ?? "").trim();
  return busy.length > 0 && busy === exclude;
}
