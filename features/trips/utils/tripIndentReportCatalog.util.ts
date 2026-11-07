import type { HubTripCompleteness } from "@/features/trips/utils/hubTripListCounts.util";

/**
 * The hub's all-time list is already the full get_trips_for_org catalog when
 * it came back under the dated cap. The report can use those rows directly.
 */
export function reportTripsAlreadyBootstrapped(input: {
  completeness: HubTripCompleteness;
  allTime: boolean;
}): boolean {
  return input.allTime && input.completeness === "exact";
}

/** Owner indent query under the list cap is the full set, not a truncated page. */
export function reportIndentsAlreadyBootstrapped(
  loadedCount: number,
  cap: number,
): boolean {
  return loadedCount >= 0 && loadedCount < cap;
}
