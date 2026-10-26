/**
 * Pure, targeted updates to the cached Compliance pipeline (`ComplianceTripInputs[]`).
 *
 * Dependency map (what a write changes → which trips' inputs to replace):
 *   trip_documents row        → that trip's `documents`
 *   trips compliance/POD cols → that trip's `flags`
 *   compliance transactions   → that trip's `taggedAdvance` / `balance` (+ `trip.amount_paid`)
 *   vehicle doc (vault/entity)→ `vehicleDocuments` of EVERY trip using that vehicle
 *   driver doc (KYC/entity)   → `driverDocuments` of EVERY trip with that driver
 *   trips catalog row         → that trip's `trip` (identity change → refetch its inputs)
 *
 * Every function returns the SAME array reference when nothing changed and
 * reuses untouched elements, so only affected summaries are re-derived.
 */
import type {
  ComplianceDocumentRow,
  CompliancePaymentSummary,
  ComplianceEntityDocument,
  ComplianceTripFlags,
  ComplianceTripInputs,
} from "@/features/tripCompliance/tripCompliance.types";
import type { TripRow } from "@/features/trips/services/trips.service";

function mapWhere(
  inputs: ComplianceTripInputs[],
  shouldUpdate: (row: ComplianceTripInputs) => boolean,
  update: (row: ComplianceTripInputs) => ComplianceTripInputs,
): ComplianceTripInputs[] {
  let changed = false;
  const next = inputs.map((row) => {
    if (!shouldUpdate(row)) return row;
    const updated = update(row);
    if (updated !== row) changed = true;
    return updated;
  });
  return changed ? next : inputs;
}

/**
 * Mirrors `verify_trip_document`: sets status, verified_by = caller,
 * verified_at = now(), rejection_reason = trimmed reason only when rejected.
 * The RPC returns void, so these are the only columns it can have changed.
 */
export function applyTripDocumentDecision(
  inputs: ComplianceTripInputs[],
  change: {
    tripId: string;
    documentId: string;
    status: "verified" | "rejected";
    actorId: string;
    at: string;
    rejectionReason?: string | null;
  },
): ComplianceTripInputs[] {
  return mapWhere(
    inputs,
    (row) => row.trip.id === change.tripId && row.documents.some((doc) => doc.id === change.documentId),
    (row) => ({
      ...row,
      documents: row.documents.map((doc) =>
        doc.id === change.documentId
          ? {
              ...doc,
              status: change.status,
              verified_by: change.actorId,
              verified_at: change.at,
              rejection_reason: change.status === "rejected" ? (change.rejectionReason ?? "").trim() || null : null,
            }
          : doc,
      ),
    }),
  );
}

export function replaceTripDocuments(
  inputs: ComplianceTripInputs[],
  tripId: string,
  documents: ComplianceDocumentRow[],
): ComplianceTripInputs[] {
  return mapWhere(inputs, (row) => row.trip.id === tripId, (row) => ({ ...row, documents }));
}

/**
 * Mirrors `mark_trip_compliance_verified`'s update: verified_by/at, decision
 * 'approved', exception reason and outstanding summary cleared. POD columns untouched.
 */
export function applyComplianceVerified(
  inputs: ComplianceTripInputs[],
  change: { tripId: string; actorId: string; at: string },
): ComplianceTripInputs[] {
  return mapWhere(
    inputs,
    (row) => row.trip.id === change.tripId,
    (row) => ({
      ...row,
      flags: {
        ...(row.flags ?? EMPTY_FLAGS),
        compliance_verified_at: change.at,
        compliance_verified_by: change.actorId,
        compliance_decision: "approved",
        compliance_exception_reason: null,
        compliance_outstanding_summary: null,
      },
    }),
  );
}

/**
 * Mirrors `decline_trip_compliance`'s update: declined_at/by + trimmed reason.
 * Verified/decision columns untouched, so the trip stays in Compliance Pending.
 */
export function applyComplianceRejected(
  inputs: ComplianceTripInputs[],
  change: { tripId: string; actorId: string; at: string; reason: string; returnTo: "pending_for_docs" | "compliance_pending" },
): ComplianceTripInputs[] {
  return mapWhere(
    inputs,
    (row) => row.trip.id === change.tripId,
    (row) => ({
      ...row,
      flags: {
        ...(row.flags ?? EMPTY_FLAGS),
        compliance_declined_at: change.at,
        compliance_declined_by: change.actorId,
        compliance_decline_reason: change.reason.trim(),
        compliance_reject_return_to: change.returnTo,
        finance_verified_at: null,
        finance_verified_by: null,
      },
    }),
  );
}

export function applyComplianceResubmitted(
  inputs: ComplianceTripInputs[],
  change: { tripId: string; at: string; note?: string | null },
): ComplianceTripInputs[] {
  return mapWhere(
    inputs,
    (row) => row.trip.id === change.tripId,
    (row) => ({
      ...row,
      flags: {
        ...(row.flags ?? EMPTY_FLAGS),
        compliance_resubmitted_at: change.at,
        compliance_resubmit_note: change.note ?? null,
      },
    }),
  );
}

export function applyComplianceDeclined(
  inputs: ComplianceTripInputs[],
  change: { tripId: string; actorId: string; at: string; reason: string },
): ComplianceTripInputs[] {
  return mapWhere(
    inputs,
    (row) => row.trip.id === change.tripId,
    (row) => ({
      ...row,
      flags: {
        ...(row.flags ?? EMPTY_FLAGS),
        compliance_declined_at: change.at,
        compliance_declined_by: change.actorId,
        compliance_decline_reason: change.reason.trim(),
      },
    }),
  );
}

const EMPTY_FLAGS: ComplianceTripFlags = {
  compliance_verified_at: null,
  compliance_verified_by: null,
  compliance_decision: null,
  compliance_exception_reason: null,
  compliance_outstanding_summary: null,
  compliance_declined_at: null,
  compliance_declined_by: null,
  compliance_decline_reason: null,
  pod_hard_copy_courier: null,
  pod_hard_copy_awb_number: null,
  pod_hard_copy_received_by: null,
  pod_received_at: null,
};

/** Charge save leaves POD Received. Kept even if the workflow-event read is still in flight. */
export function applyPodChargesSaved(
  inputs: ComplianceTripInputs[],
  tripId: string,
): ComplianceTripInputs[] {
  return mapWhere(inputs, (row) => row.trip.id === tripId, (row) => ({
    ...row,
    flags: {
      ...(row.flags ?? EMPTY_FLAGS),
      pod_charges_saved: true,
      pod_revalidate_requested: false,
    },
  }));
}

export function applySettlementReleased(
  inputs: ComplianceTripInputs[],
  tripId: string,
): ComplianceTripInputs[] {
  return mapWhere(inputs, (row) => row.trip.id === tripId, (row) => ({
    ...row,
    flags: {
      ...(row.flags ?? EMPTY_FLAGS),
      pod_settlement_released: true,
    },
  }));
}

export function applyPodRevalidateRequested(
  inputs: ComplianceTripInputs[],
  tripId: string,
): ComplianceTripInputs[] {
  return mapWhere(inputs, (row) => row.trip.id === tripId, (row) => ({
    ...row,
    flags: {
      ...(row.flags ?? EMPTY_FLAGS),
      pod_charges_saved: false,
      pod_revalidate_requested: true,
      pod_settlement_released: false,
      pod_no_debit: false,
      pod_has_debit: false,
    },
  }));
}

/** Incorrect receipt: clear received so the trip returns to Awaiting POD. */
export function applyPodNotFound(
  inputs: ComplianceTripInputs[],
  tripId: string,
): ComplianceTripInputs[] {
  return mapWhere(inputs, (row) => row.trip.id === tripId, (row) => ({
    ...row,
    trip: { ...row.trip, pod_received_at: null },
    flags: {
      ...(row.flags ?? EMPTY_FLAGS),
      pod_received_at: null,
      pod_charges_saved: false,
      pod_revalidate_requested: false,
      pod_settlement_released: false,
    },
  }));
}

export function replaceTripFlags(
  inputs: ComplianceTripInputs[],
  tripId: string,
  flags: ComplianceTripFlags | null,
): ComplianceTripInputs[] {
  return mapWhere(inputs, (row) => row.trip.id === tripId, (row) => ({ ...row, flags }));
}

export function applyTripPayment(
  inputs: ComplianceTripInputs[],
  tripId: string,
  payment: {
    taggedAdvance: CompliancePaymentSummary | null;
    balance: CompliancePaymentSummary | null;
    tripFields: Pick<TripRow, "amount_paid" | "updated_at"> | null;
  },
): ComplianceTripInputs[] {
  return mapWhere(
    inputs,
    (row) => row.trip.id === tripId,
    (row) => ({
      ...row,
      taggedAdvance: payment.taggedAdvance,
      balance: payment.balance,
      trip: payment.tripFields ? ({ ...row.trip, ...payment.tripFields } as TripRow) : row.trip,
    }),
  );
}

/** Every trip whose vehicle documents come from `vehicleId` (assigned, owner, or vault match). */
export function tripsUsingVehicle(inputs: ComplianceTripInputs[], vehicleId: string): TripRow[] {
  return inputs
    .filter(
      (row) =>
        row.trip.vehicle_id === vehicleId || row.trip.owner_vehicle_id === vehicleId || row.vaultVehicleId === vehicleId,
    )
    .map((row) => row.trip);
}

export function tripsUsingDriver(inputs: ComplianceTripInputs[], driverId: string): TripRow[] {
  return inputs.filter((row) => row.trip.driver_id === driverId).map((row) => row.trip);
}

export function applyVehicleDocuments(
  inputs: ComplianceTripInputs[],
  byTrip: Map<string, { vehicleDocuments: ComplianceEntityDocument[]; vaultVehicleId: string | null }>,
): ComplianceTripInputs[] {
  return mapWhere(
    inputs,
    (row) => byTrip.has(row.trip.id),
    (row) => ({ ...row, ...byTrip.get(row.trip.id)! }),
  );
}

export function applyDriverDocuments(
  inputs: ComplianceTripInputs[],
  byTrip: Map<string, ComplianceEntityDocument[]>,
): ComplianceTripInputs[] {
  return mapWhere(
    inputs,
    (row) => byTrip.has(row.trip.id),
    (row) => ({ ...row, driverDocuments: byTrip.get(row.trip.id)! }),
  );
}

/** Fields that select which vehicle / driver documents a trip's inputs came from. */
function sameInputIdentity(a: TripRow, b: TripRow): boolean {
  return (
    a.vehicle_id === b.vehicle_id &&
    a.owner_vehicle_id === b.owner_vehicle_id &&
    a.driver_id === b.driver_id &&
    a.vehicle_display_number === b.vehicle_display_number
  );
}

function shallowEqualTrip(a: TripRow, b: TripRow): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a) as (keyof TripRow)[];
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

/**
 * Align cached inputs with the current pipeline trips (from the trips catalog)
 * without refetching what didn't change:
 *   - trip left the pipeline      → dropped
 *   - same trip, same identity    → keep inputs, swap in the new trip row
 *   - vehicle/driver identity changed, or new trip → returned in `needsInputs`
 *     (changed trips keep their old inputs until the fetch lands; new trips
 *     appear once fetched)
 */
export function reconcilePipelineTrips(
  inputs: ComplianceTripInputs[],
  pipelineTrips: TripRow[],
): { next: ComplianceTripInputs[]; needsInputs: TripRow[] } {
  const byId = new Map(inputs.map((row) => [row.trip.id, row]));
  const needsInputs: TripRow[] = [];
  const next: ComplianceTripInputs[] = [];
  for (const trip of pipelineTrips) {
    const prev = byId.get(trip.id);
    if (!prev) {
      needsInputs.push(trip);
      continue;
    }
    if (!sameInputIdentity(prev.trip, trip)) needsInputs.push(trip);
    next.push(shallowEqualTrip(prev.trip, trip) ? prev : { ...prev, trip });
  }
  const unchanged = next.length === inputs.length && next.every((row, index) => row === inputs[index]);
  return { next: unchanged ? inputs : next, needsInputs };
}

/** Insert / replace fetched inputs, ordered by `orderTripIds` (pipeline order). */
export function upsertTripInputs(
  inputs: ComplianceTripInputs[],
  fetched: ComplianceTripInputs[],
  orderTripIds: string[],
): ComplianceTripInputs[] {
  if (fetched.length === 0) return inputs;
  const byId = new Map(inputs.map((row) => [row.trip.id, row]));
  for (const row of fetched) byId.set(row.trip.id, row);
  return orderTripIds.map((id) => byId.get(id)).filter((row): row is ComplianceTripInputs => Boolean(row));
}
