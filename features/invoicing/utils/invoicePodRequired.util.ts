/**
 * Pulse Invoice "POD Required".
 * Physical/hard-copy receipt is trips.pod_received_at (see tripPodIsReceived).
 * Digital trip_documents document_type=pod is a separate persist gate.
 *
 * ON and OFF: pending list shows all otherwise eligible trips (not already invoiced).
 * ON: Pending (POD not received in the POD flow) stays visible but is not selectable;
 * Issue is blocked for Pending; persist requirePod=true.
 * OFF: Pending is selectable; Issue allowed without POD; persist requirePod=false.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const INVOICE_POD_REQUIRED_DEFAULT = true;

export function invoicePodRequiredStorageKey(workspaceId: string): string {
  return `pulse_invoice_pod_required_v1:${workspaceId}`;
}

export function parseInvoicePodRequiredStored(raw: string | null): boolean {
  if (raw === "0" || raw === "false") return false;
  if (raw === "1" || raw === "true") return true;
  return INVOICE_POD_REQUIRED_DEFAULT;
}

/** Display-only workspace POD Required toggle. Must not change invoice eligibility. */
export async function loadWorkspaceInvoicePodRequired(
  workspaceId: string,
): Promise<boolean> {
  const raw = await AsyncStorage.getItem(invoicePodRequiredStorageKey(workspaceId));
  return parseInvoicePodRequiredStored(raw);
}

export type InvoicePodRequiredTrip = {
  id: string;
  internal_id?: string;
  physicalPodReceived: boolean;
  status?: string;
};

/** Invoice list eligibility vs POD Required. Already-invoiced trips are excluded upstream. */
export function isVisibleOnInvoiceList(args: {
  tripId: string;
  invoicedTripIds: Set<string>;
  physicalPodReceived: boolean;
  podRequired: boolean;
}): boolean {
  if (args.invoicedTripIds.has(args.tripId)) return false;
  return true;
}

/** Pending Billing always lists otherwise eligible trips. POD ON/OFF does not hide rows. */
export function filterTripsByPodRequired<T extends InvoicePodRequiredTrip>(
  trips: T[],
  _podRequired: boolean,
): T[] {
  return trips;
}

/**
 * Pulse POD hard copy: trips.pod_received_at.
 * Legacy fallback: invoice list status "approved" when physical flag is absent.
 */
export function invoiceTripHasPodReceived(trip: {
  status?: string;
  physicalPodReceived?: boolean;
}): boolean {
  if (typeof trip.physicalPodReceived === "boolean") {
    return trip.physicalPodReceived;
  }
  return (trip.status ?? "").toLowerCase() === "approved";
}

/**
 * When POD Required is ON, Pending trips remain listed but cannot be selected.
 * OFF: every listed trip is selectable.
 */
export function isTripSelectableWhenPodRequired(
  podRequired: boolean,
  trip: { status?: string; physicalPodReceived?: boolean },
): boolean {
  if (!podRequired) return true;
  return invoiceTripHasPodReceived(trip);
}

/**
 * When POD Required is ON, Issue is not allowed for Pending (POD not received).
 * Preview remains allowed for selectable trips. Persist still uses {@link invoiceIssueRequirePod}.
 */
export function selectedTripsBlockIssueWhenPodRequired(
  podRequired: boolean,
  trips: Array<{ status?: string; physicalPodReceived?: boolean }>,
): boolean {
  if (!podRequired) return false;
  if (trips.length === 0) return false;
  return trips.some((trip) => !invoiceTripHasPodReceived(trip));
}

export function invoiceIssuePendingPodReason(
  podRequired: boolean,
  trips: Array<{ status?: string; physicalPodReceived?: boolean }>,
): string | null {
  if (!selectedTripsBlockIssueWhenPodRequired(podRequired, trips)) return null;
  return "POD Required is ON. Issue Invoice is only available for trips with POD received, not Pending.";
}

/**
 * UI must not disable Preview / Configure / Build based on the POD Required toggle.
 * Issue persist: pass {@link invoiceIssueRequirePod} into executeInvoiceCreation.
 */
export function invoiceBuildBlockedReason(_podRequired: boolean): string | null {
  return null;
}

/** Explicit persist flag. Pulse Invoice passes false only when POD Required is OFF. */
export function invoiceIssueRequirePod(podRequired: boolean): boolean {
  return podRequired;
}

/** Draft restore: keep IDs that are listed and selectable for the current POD Required state. */
export function restoreInvoiceDraftTripIds(
  savedIds: string[],
  eligibleTrips: Array<{
    id: string;
    status?: string;
    physicalPodReceived?: boolean;
  }>,
  podRequired = false,
): string[] {
  const allowed = new Set(
    eligibleTrips
      .filter((trip) => isTripSelectableWhenPodRequired(podRequired, trip))
      .map((trip) => trip.id),
  );
  return savedIds.filter((id) => allowed.has(id));
}

/** Issued invoices are independent of POD Required ON/OFF. */
export function issuedInvoicesForPodToggle<T>(
  invoices: readonly T[],
  _podRequired: boolean,
): T[] {
  return [...invoices];
}
