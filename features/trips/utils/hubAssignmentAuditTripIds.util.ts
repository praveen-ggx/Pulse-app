/** Hub list only needs Private/Shared badges for the visible page, not every trip. */
export const HUB_ASSIGNMENT_AUDIT_TRIP_LIMIT = 12;

export function hubAssignmentAuditTripIds(
  tripIds: readonly string[],
  limit = HUB_ASSIGNMENT_AUDIT_TRIP_LIMIT,
): string[] {
  if (limit <= 0) return [];
  return tripIds.slice(0, limit);
}
