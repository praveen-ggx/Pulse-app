import type { Router } from "expo-router";

import { tripIdForChangeDriverPopup } from "@/lib/alertRegistry/changeDriverPopup.util";
import { ROUTES } from "@/lib/routes";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";

export type NavigateToOpsAlertOptions = {
  /** Opens the Change driver popup. Unassigned-trip alerts never route to assignment. */
  onOpenChangeDriver?: (tripId: string) => void;
};

/**
 * Route ops alerts straight to the relevant detail page — no extra DB reads.
 * Trip-linked alerts hook directly into the trip detail page (never the
 * intermediate trip-ledger view). Unassigned-trip / Change driver stays a
 * popup (`onOpenChangeDriver`); `/trip/:id/assignment` remains Fleet assign.
 */
export function navigateToOpsAlert(
  router: Router,
  ops: GlobalOperationAlert,
  options?: NavigateToOpsAlertOptions,
): void {
  const tripId = ops.trip_id?.trim() || null;
  const changeDriverTripId = tripIdForChangeDriverPopup(ops);
  if (changeDriverTripId) {
    options?.onOpenChangeDriver?.(changeDriverTripId);
    return;
  }

  // Any trip-linked alert opens the actionable trip detail page directly.
  if (tripId) {
    router.push(`/trip/${tripId}` as const);
    return;
  }

  if (ops.category === "payment_received") {
    router.push(ROUTES.TABS.FINANCE as Parameters<typeof router.push>[0]);
    return;
  }

  router.push(ROUTES.TABS.TRIPS as Parameters<typeof router.push>[0]);
}
