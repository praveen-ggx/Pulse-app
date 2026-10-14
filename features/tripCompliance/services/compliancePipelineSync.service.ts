/**
 * Compliance pipeline sync — turns one change into the minimum reads plus a
 * pure patch of the cached `ComplianceTripInputs[]`.
 *
 * Every function returns a `PipelinePatch` that the caller applies against the
 * CURRENT cache (`setQueryData(key, (cur) => patch(cur))`), so a read that
 * resolves after another write never overwrites that write's state.
 *
 * Reads per change:
 *   tripDocumentDecision → 0 (patch mirrors verify_trip_document); 1 read of
 *                          that trip's documents only if the doc isn't cached
 *   tripDocuments        → 1 (trip_documents for one trip)
 *   tripFlags            → trips compliance/POD columns, courier received-LR event, and saved POD charges
 *   complianceVerified   → 0 (patch mirrors mark_trip_compliance_verified)
 *   complianceDeclined   → 0 (patch mirrors decline_trip_compliance)
 *   payment              → 2 (compliance transactions + trips.amount_paid for one trip)
 *   vehicleDocuments     → entity docs + vault for every trip on that vehicle
 *   driverDocuments      → entity docs + KYC for every trip with that driver
 */
import { fetchHardCopyIbondTripIds } from "@/features/trips/services/tripDocumentLrPod.service";
import {
  fetchComplianceTripFlags,
  fetchHardCopyReceivedLrNumbers,
  fetchPodChargeValidatedTripIds,
  fetchComplianceTripInputs,
  fetchDriverDocumentsForTrips,
  fetchTripDocumentsForTrips,
  fetchTripPaymentInputs,
  fetchTripScopedInputs,
  fetchVehicleDocumentsForTrips,
} from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceTripInputs } from "@/features/tripCompliance/tripCompliance.types";
import {
  applyComplianceDeclined,
  applyComplianceRejected,
  applyComplianceResubmitted,
  applyComplianceVerified,
  applyDriverDocuments,
  applyTripDocumentDecision,
  applyTripPayment,
  applyVehicleDocuments,
  reconcilePipelineTrips,
  applyPodChargesSaved,
  replaceTripDocuments,
  replaceTripFlags,
  tripsUsingDriver,
  tripsUsingVehicle,
  upsertTripInputs,
} from "@/features/tripCompliance/utils/compliancePipelinePatch.util";
import { complianceRejectQueueDestination } from "@/features/tripCompliance/utils/complianceRejectReason.util";
import type { TripRow } from "@/features/trips/services/trips.service";

export type PipelinePatch = (current: ComplianceTripInputs[]) => ComplianceTripInputs[];

export type ComplianceChange =
  | {
      type: "tripDocumentDecision";
      tripId: string;
      documentId: string;
      status: "verified" | "rejected";
      actorId: string;
      rejectionReason?: string | null;
    }
  | { type: "tripDocuments"; tripId: string }
  | { type: "tripFlags"; tripId: string }
  | { type: "podChargesSaved"; tripId: string }
  | { type: "complianceVerified"; tripId: string; actorId: string }
  | { type: "complianceDeclined"; tripId: string; actorId: string; reason: string }
  | { type: "complianceRejected"; tripId: string; actorId: string; reason: string }
  | { type: "complianceResubmitted"; tripId: string; at?: string; note?: string | null }
  | { type: "payment"; tripId: string }
  | { type: "vehicleDocuments"; vehicleId: string }
  | { type: "driverDocuments"; driverId: string };

const identity: PipelinePatch = (current) => current;

/** The trip id a change is scoped to, or null for shared (vehicle/driver) changes. */
export function complianceChangeTripId(change: ComplianceChange): string | null {
  return "tripId" in change ? change.tripId : null;
}

export async function patchForComplianceChange(
  current: ComplianceTripInputs[],
  change: ComplianceChange,
  viewerOrgId: string,
  now: () => string = () => new Date().toISOString(),
): Promise<PipelinePatch> {
  switch (change.type) {
    case "tripDocumentDecision": {
      const at = now();
      const patch: PipelinePatch = (cur) => applyTripDocumentDecision(cur, { ...change, at });
      if (patch(current) !== current) return patch;
      // Document not in cache (e.g. uploaded elsewhere) — read that trip's docs.
      return patchForComplianceChange(current, { type: "tripDocuments", tripId: change.tripId }, viewerOrgId, now);
    }
    case "tripDocuments": {
      const docs = await fetchTripDocumentsForTrips([change.tripId]);
      const documents = docs.get(change.tripId) ?? [];
      return (cur) => replaceTripDocuments(cur, change.tripId, documents);
    }
    case "tripFlags": {
      const [flags, received, ibondIds] = await Promise.all([
        fetchComplianceTripFlags([change.tripId]),
        fetchHardCopyReceivedLrNumbers([change.tripId]),
        fetchHardCopyIbondTripIds([change.tripId]),
      ]);
      const validatedIds = await fetchPodChargeValidatedTripIds([change.tripId]);
      const tripFlags = flags.get(change.tripId) ?? null;
      const numbers = received.get(change.tripId) ?? [];
      let merged = tripFlags && numbers.length > 0 ? { ...tripFlags, received_lr_numbers: numbers } : tripFlags;
      if (merged && ibondIds.has(change.tripId)) merged = { ...merged, pod_ibond: true };
      if (merged && validatedIds.has(change.tripId)) merged = { ...merged, pod_charges_saved: true };
      return (cur) => {
        const row = cur.find((item) => item.trip.id === change.tripId);
        const keepSaved =
          validatedIds.has(change.tripId) || row?.flags?.pod_charges_saved === true;
        const base = merged ?? row?.flags ?? null;
        const flags = base && keepSaved ? { ...base, pod_charges_saved: true } : base;
        return replaceTripFlags(cur, change.tripId, flags);
      };
    }
    case "podChargesSaved": {
      return (cur) => applyPodChargesSaved(cur, change.tripId);
    }
    case "complianceVerified": {
      const at = now();
      return (cur) => applyComplianceVerified(cur, { tripId: change.tripId, actorId: change.actorId, at });
    }
    case "complianceDeclined": {
      const at = now();
      return (cur) =>
        applyComplianceDeclined(cur, { tripId: change.tripId, actorId: change.actorId, at, reason: change.reason });
    }
    case "complianceRejected": {
      const at = now();
      return (cur) =>
        applyComplianceRejected(cur, {
          tripId: change.tripId,
          actorId: change.actorId,
          at,
          reason: change.reason,
          returnTo: complianceRejectQueueDestination(change.reason),
        });
    }
    case "complianceResubmitted": {
      const at = change.at ?? now();
      return (cur) => applyComplianceResubmitted(cur, { tripId: change.tripId, at, note: change.note });
    }
    case "payment": {
      const payments = await fetchTripPaymentInputs([change.tripId]);
      const payment = payments.get(change.tripId);
      if (!payment) return identity;
      return (cur) => applyTripPayment(cur, change.tripId, payment);
    }
    case "vehicleDocuments": {
      const trips = tripsUsingVehicle(current, change.vehicleId);
      if (trips.length === 0) return identity;
      const byTrip = await fetchVehicleDocumentsForTrips(trips, viewerOrgId);
      return (cur) => applyVehicleDocuments(cur, byTrip);
    }
    case "driverDocuments": {
      const trips = tripsUsingDriver(current, change.driverId);
      if (trips.length === 0) return identity;
      const byTrip = await fetchDriverDocumentsForTrips(trips);
      return (cur) => applyDriverDocuments(cur, byTrip);
    }
  }
}

/**
 * Trips catalog changed (focus refetch / realtime / payment patch): keep every
 * summary whose inputs are still valid, fetch full inputs only for trips that
 * are new to the pipeline or whose vehicle/driver identity changed.
 */
export async function patchForPipelineTrips(
  current: ComplianceTripInputs[],
  pipelineTrips: TripRow[],
  viewerOrgId: string,
): Promise<PipelinePatch> {
  const { needsInputs } = reconcilePipelineTrips(current, pipelineTrips);
  const fetched = await fetchComplianceTripInputs(needsInputs, viewerOrgId);
  const order = pipelineTrips.map((trip) => trip.id);
  return (cur) => upsertTripInputs(reconcilePipelineTrips(cur, pipelineTrips).next, fetched, order);
}

/**
 * Pipeline query fn.
 *   full (first load this session, or explicit refresh) → one batched read of everything
 *   incremental (focus / invalidate) → reconcile with the trips catalog, re-read only
 *     trip-specific inputs (docs, flags, transactions — 3 batched reads), full inputs
 *     only for new / identity-changed trips. Vehicle, driver and partner-vehicle
 *     viewer reads are not repeated.
 */
export async function loadCompliancePipelineInputs(
  previous: ComplianceTripInputs[] | undefined,
  pipelineTrips: TripRow[],
  options: { full: boolean; viewerOrgId: string },
): Promise<ComplianceTripInputs[]> {
  if (pipelineTrips.length === 0) return [];
  if (options.full || !previous) return fetchComplianceTripInputs(pipelineTrips, options.viewerOrgId);

  const { next, needsInputs } = reconcilePipelineTrips(previous, pipelineTrips);
  const needsIds = new Set(needsInputs.map((trip) => trip.id));
  const keptIds = next.filter((row) => !needsIds.has(row.trip.id)).map((row) => row.trip.id);
  const [scoped, fetched] = await Promise.all([
    fetchTripScopedInputs(keptIds),
    fetchComplianceTripInputs(needsInputs, options.viewerOrgId),
  ]);
  const refreshed = next.map((row) => {
    const tripScoped = scoped.get(row.trip.id);
    return tripScoped ? { ...row, ...tripScoped } : row;
  });
  return upsertTripInputs(refreshed, fetched, pipelineTrips.map((trip) => trip.id));
}

/**
 * Write log — protects local writes from reads that started before them.
 *
 * A read (pipeline query fn, trips reconcile, or a change's own re-read) records
 * `log.generation` when it starts. Every applied write records the trip ids it
 * changed at a new generation. When the read lands, rows for trips written
 * after it started are kept from the CURRENT cache instead of the read's
 * (possibly older) snapshot. The next refetch reconciles them with the server.
 */
export type ComplianceWriteLog = { generation: number; writtenAt: Map<string, number> };

export function createComplianceWriteLog(): ComplianceWriteLog {
  return { generation: 0, writtenAt: new Map() };
}

export function recordComplianceWrites(log: ComplianceWriteLog, tripIds: Iterable<string>): void {
  log.generation += 1;
  for (const id of tripIds) log.writtenAt.set(id, log.generation);
}

export function tripsWrittenSince(log: ComplianceWriteLog, generation: number): Set<string> {
  const ids = new Set<string>();
  for (const [id, at] of log.writtenAt) if (at > generation) ids.add(id);
  return ids;
}

/** `next`, except rows in `protectedTripIds` come from `current` (when present there). */
export function preserveNewerWrites(
  next: ComplianceTripInputs[],
  current: ComplianceTripInputs[] | undefined,
  protectedTripIds: ReadonlySet<string>,
): ComplianceTripInputs[] {
  if (!current || protectedTripIds.size === 0) return next;
  const currentById = new Map(current.map((row) => [row.trip.id, row]));
  let changed = false;
  const merged = next.map((row) => {
    if (!protectedTripIds.has(row.trip.id)) return row;
    const kept = currentById.get(row.trip.id);
    if (!kept || kept === row) return row;
    changed = true;
    return kept;
  });
  return changed ? merged : next;
}

/** Trip ids whose row object differs between two pipeline snapshots. */
export function changedTripIds(before: ComplianceTripInputs[], after: ComplianceTripInputs[]): string[] {
  if (before === after) return [];
  const beforeById = new Map(before.map((row) => [row.trip.id, row]));
  return after.filter((row) => beforeById.get(row.trip.id) !== row).map((row) => row.trip.id);
}
