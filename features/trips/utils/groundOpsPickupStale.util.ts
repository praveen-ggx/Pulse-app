/**
 * Status the trip already moved to when a Ground Ops pickup step was rejected
 * because the screen was stale ("Cannot mark reached-pickup from status in_transit"
 * from simulate_ground_ops_pickup_status); null for any other failure.
 */
export function groundOpsPickupMovedTo(error: string): string | null {
  return /^Cannot mark .+ from status (\w+)/.exec(error)?.[1] ?? null;
}
