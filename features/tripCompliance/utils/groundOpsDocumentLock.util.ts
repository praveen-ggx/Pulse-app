/**
 * Ground Ops may not replace, delete or renumber a trip document once the trip
 * has moved on. Same rule as the database guard `guard_trip_document_ground_ops`
 * (migration ground_ops_trip_document_lock); keep the two in step.
 *
 * Locked when the trip is in transit or later, compliance verified, finance
 * approved, or the advance is posted. Two exceptions keep the reject flow
 * working: a document Compliance rejected, and a trip back with Ground Ops
 * after a hold / finance reject (until they resubmit). Adding a missing
 * document is never locked; only existing files are. For 15 minutes a user may
 * still change their own new file (more pages, number fill, wrong upload).
 */

/** Same window as the database guard (v_grace). */
export const GROUND_OPS_OWN_UPLOAD_GRACE_MS = 15 * 60 * 1000;

/** The file was uploaded by this user within the grace window. */
export function isOwnRecentUpload(
  row: { uploaded_by?: string | null; uploaded_at?: string | null } | null | undefined,
  userId: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!row || !userId || row.uploaded_by !== userId) return false;
  const at = Date.parse(row.uploaded_at ?? "");
  return Number.isFinite(at) && nowMs - at < GROUND_OPS_OWN_UPLOAD_GRACE_MS;
}

/** In transit and every later stage. Loading / assigned stay editable. */
export const GROUND_OPS_LOCKED_TRIP_STATUSES: ReadonlySet<string> = new Set([
  "in_transit",
  "unloading",
  "at_drop",
  "completed",
  "delivered",
  "pod_received",
  "closed",
]);

export type GroundOpsDocumentLockTrip = {
  status?: string | null;
  compliance_verified_at?: string | null;
  compliance_declined_at?: string | null;
  compliance_resubmitted_at?: string | null;
  finance_verified_at?: string | null;
};

export type GroundOpsDocumentLockReason =
  | "in_transit"
  | "compliance_verified"
  | "advance_approved"
  | "advance_processed";

const REASON_LABELS: Record<GroundOpsDocumentLockReason, string> = {
  in_transit: "Locked: trip is in transit",
  compliance_verified: "Locked: compliance approved",
  advance_approved: "Locked: advance approved",
  advance_processed: "Locked: advance processed",
};

function time(value: string | null | undefined): number | null {
  const ms = Date.parse(value ?? "");
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Hold (never verified) or finance reject (declined at/after verify) with no
 * resubmit at/after the latest decline. Mirrors public.compliance_awaiting_resubmit.
 */
export function tripAwaitingResubmit(trip: GroundOpsDocumentLockTrip): boolean {
  const declined = time(trip.compliance_declined_at);
  if (declined == null) return false;
  const verified = time(trip.compliance_verified_at);
  const resubmitted = time(trip.compliance_resubmitted_at);
  return (verified == null || declined >= verified) && (resubmitted == null || resubmitted < declined);
}

/**
 * Why Ground Ops may not change this existing document, or null when it may.
 * `advancePosted` is a `compliance_advance` ledger row for the trip, when known.
 */
export function groundOpsDocumentLockReason(input: {
  trip: GroundOpsDocumentLockTrip | null | undefined;
  documentStatus?: string | null;
  advancePosted?: boolean;
  /** Every file concerned is the user's own upload from the grace window. */
  ownRecentUpload?: boolean;
}): GroundOpsDocumentLockReason | null {
  const { trip } = input;
  if (!trip) return null;
  if (input.ownRecentUpload) return null;
  if (String(input.documentStatus ?? "").trim().toLowerCase() === "rejected") return null;
  if (tripAwaitingResubmit(trip)) return null;
  if (input.advancePosted) return "advance_processed";
  if (trip.finance_verified_at) return "advance_approved";
  if (trip.compliance_verified_at) return "compliance_verified";
  const status = String(trip.status ?? "").trim().toLowerCase();
  if (GROUND_OPS_LOCKED_TRIP_STATUSES.has(status)) return "in_transit";
  return null;
}

export function groundOpsDocumentLockLabel(reason: GroundOpsDocumentLockReason): string {
  return REASON_LABELS[reason];
}
