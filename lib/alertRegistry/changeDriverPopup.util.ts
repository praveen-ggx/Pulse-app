import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";

/**
 * Notification "Change driver" / unassigned-trip alerts open a centered popup
 * instead of `/trip/:id/assignment` (that route stays Fleet assign).
 */
export function tripIdForChangeDriverPopup(
  ops: GlobalOperationAlert,
): string | null {
  if (ops.category !== "unassigned_trip") return null;
  const tripId = (ops.trip_id ?? "").trim();
  return tripId || null;
}
