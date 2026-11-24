import type { ActiveTripRecentEvent } from "@/lib/globalSync/types";

/** Assignment-audit shape needed to detect a driver decline / remove. */
export type DeclineAuditLike = {
  event_type?: string | null;
  driver_id_prev?: string | null;
  driver_id_new?: string | null;
  changed_by?: string | null;
};

/**
 * Driver cleared themselves (reject / decline-pending) or left an equivalent
 * remove audit. Dispatcher clears look the same on the row shape when
 * `changed_by` is not the previous driver — callers may pass previousDriverUserId
 * when they have it.
 */
export function isDriverDeclineAuditRow(
  row: DeclineAuditLike | null | undefined,
  previousDriverUserId?: string | null,
): boolean {
  if (!row) return false;
  const eventType = String(row.event_type ?? "").trim().toLowerCase();
  if (eventType === "declined_pending") return true;
  const removed =
    (row.driver_id_prev ?? null) != null && (row.driver_id_new ?? null) == null;
  if (!removed) return false;
  if (eventType !== "reassignment" && eventType !== "declined_pending") {
    return false;
  }
  const changedBy = String(row.changed_by ?? "").trim();
  const prevUser = String(previousDriverUserId ?? "").trim();
  if (prevUser && changedBy && changedBy === prevUser) return true;
  // Without a user_id match, still treat remove-reassignment as decline-shaped
  // for notification copy (dispatcher clear uses the same audit shape today).
  return eventType === "reassignment" || eventType === "declined_pending";
}

/** Chat / bootstrap recent_events that mention a driver decline. */
export function recentEventsSuggestDriverDecline(
  events: ReadonlyArray<ActiveTripRecentEvent> | null | undefined,
): boolean {
  const list = events ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const event = list[i];
    if (!event) continue;
    const messageType = String(event.message_type ?? "").toLowerCase();
    const content = String(event.content ?? "").toLowerCase();
    if (
      messageType === "assignment_update" &&
      (content.includes("declin") ||
        content.includes("rejected") ||
        content.includes("was removed"))
    ) {
      return true;
    }
  }
  return false;
}

export function shouldOpenChangeDriverAfterUnassign(input: {
  previousDriverId: string | null | undefined;
  nextDriverId: string | null | undefined;
  canAssign: boolean;
}): boolean {
  if (!input.canAssign) return false;
  const prev = String(input.previousDriverId ?? "").trim();
  const next = String(input.nextDriverId ?? "").trim();
  return prev.length > 0 && next.length === 0;
}
