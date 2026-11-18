/**
 * Decide what one trips realtime payload may change.
 *
 * Postgres default replica identity puts only the primary key in `old`.
 * Comparing a missing old column with the new value looks like a change to
 * every column and reloads the compliance catalog. A column counts as changed
 * only when the previous value is actually known: from `old`, or from the
 * cached row when the payload did not include that column.
 */
import { mergeTripRowIntoList } from "@/lib/queries/patchTripListCache";
import { queryKeys } from "@/lib/queryKeys";
import { scheduleInvalidation } from "@/lib/platform/moderator";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";

const MEMBERSHIP_COLUMNS = [
  "status",
  "compliance_verified_at",
  "compliance_declined_at",
  "finance_verified_at",
] as const;

const POD_COLUMNS = [
  "pod_received_at",
  "pod_hard_copy_courier",
  "pod_hard_copy_awb_number",
  "pod_hard_copy_received_by",
] as const;

const recentEvents = new Set<string>();
/** Newest UPDATE commit applied for a trip. Older commits cannot overwrite it. */
const latestUpdateCommit = new Map<string, string>();

export function resetTripRealtimeDedupeForTests(): void {
  recentEvents.clear();
  latestUpdateCommit.clear();
}

export type TripRealtimeDecision = {
  ignore: boolean;
  duplicate: boolean;
  tripId: string | null;
  patch: boolean;
  invalidateLists: boolean;
  /** One compliance catalog read when a membership change cannot patch a cached row. */
  complianceFallback: boolean;
  podChanged: boolean;
  settlementChanged: boolean;
  clientChanged: boolean;
  assignmentChanged: boolean;
  counterpartyChanged: boolean;
};

type TripRecord = Record<string, unknown>;

function asRecord(value: unknown): TripRecord | null {
  return value && typeof value === "object" ? (value as TripRecord) : null;
}

function tripIdOf(payload: RealtimePostgresChangesPayload<TripRecord>): string | null {
  const id = asRecord(payload.new)?.id ?? asRecord(payload.old)?.id;
  return typeof id === "string" && id ? id : null;
}

function organizationOf(row: TripRecord | null): string | null {
  const value = row?.organization_id;
  return typeof value === "string" && value ? value : null;
}

function findCachedTrip(
  qc: QueryClient,
  organizationId: string,
  tripId: string,
): TripRecord | null {
  for (const queryKey of [
    queryKeys.trips.compliance(organizationId),
    queryKeys.trips.finite(organizationId),
  ]) {
    const rows = qc.getQueryData(queryKey);
    if (!Array.isArray(rows)) continue;
    const found = rows.find((row) => row && typeof row === "object" && (row as TripRecord).id === tripId);
    if (found && typeof found === "object") return found as TripRecord;
  }
  return null;
}

/** True only when the previous value is present and differs. Missing old columns are not changes. */
export function realtimeColumnChanged(
  next: TripRecord | null,
  previous: TripRecord | null,
  cached: TripRecord | null,
  key: string,
): boolean {
  const known = previous && Object.prototype.hasOwnProperty.call(previous, key)
    ? previous
    : cached && Object.prototype.hasOwnProperty.call(cached, key)
      ? cached
      : null;
  if (!known) return false;
  return (next?.[key] ?? null) !== (known[key] ?? null);
}

function commitOf(payload: RealtimePostgresChangesPayload<TripRecord>): string | null {
  const commit = (payload as { commit_timestamp?: unknown }).commit_timestamp;
  return typeof commit === "string" && commit ? commit : null;
}

/** Stable identity of one row image. Two different writes can share a commit timestamp. */
function rowFingerprint(row: TripRecord | null): string {
  if (!row) return "";
  return Object.keys(row)
    .sort()
    .map((key) => `${key}=${JSON.stringify(row[key] ?? null)}`)
    .join("&");
}

function rememberDuplicate(payload: RealtimePostgresChangesPayload<TripRecord>, tripId: string | null): boolean {
  const commit = commitOf(payload);
  if (!tripId || !commit || !payload.eventType) return false;
  const image = payload.eventType === "DELETE" ? asRecord(payload.old) : asRecord(payload.new);
  const key = `${payload.eventType}:${tripId}:${commit}:${rowFingerprint(image)}`;
  if (recentEvents.has(key)) return true;
  recentEvents.add(key);
  if (recentEvents.size > 300) {
    const oldest = recentEvents.values().next().value;
    if (oldest) recentEvents.delete(oldest);
  }
  return false;
}

/** An older UPDATE must not patch over a newer one. Equal timestamps are different writes. */
function staleUpdate(
  payload: RealtimePostgresChangesPayload<TripRecord>,
  tripId: string | null,
): boolean {
  if (payload.eventType !== "UPDATE" || !tripId) return false;
  const commit = commitOf(payload);
  if (!commit) return false;
  const latest = latestUpdateCommit.get(tripId);
  if (latest && commit < latest) return true;
  latestUpdateCommit.set(tripId, commit);
  if (latestUpdateCommit.size > 300) {
    const oldest = latestUpdateCommit.keys().next().value;
    if (oldest) latestUpdateCommit.delete(oldest);
  }
  return false;
}

export function decideTripRealtimeChange(
  organizationId: string,
  payload: RealtimePostgresChangesPayload<TripRecord>,
  cached: TripRecord | null,
  complianceHasTrip: boolean,
): TripRealtimeDecision {
  const none: TripRealtimeDecision = {
    ignore: true,
    duplicate: false,
    tripId: null,
    patch: false,
    invalidateLists: false,
    complianceFallback: false,
    podChanged: false,
    settlementChanged: false,
    clientChanged: false,
    assignmentChanged: false,
    counterpartyChanged: false,
  };
  const newRow = asRecord(payload.new);
  const oldRow = asRecord(payload.old);
  const statedOrg = organizationOf(newRow) ?? organizationOf(oldRow);
  if (statedOrg && statedOrg !== organizationId) return none;

  const tripId = tripIdOf(payload);
  if (rememberDuplicate(payload, tripId)) {
    return { ...none, ignore: true, duplicate: true, tripId };
  }
  if (staleUpdate(payload, tripId)) {
    return { ...none, ignore: true, tripId };
  }

  const isUpdate = payload.eventType === "UPDATE";
  const changed = (key: string) => realtimeColumnChanged(newRow, oldRow, cached, key);
  const membershipChanged = MEMBERSHIP_COLUMNS.some(changed);
  return {
    ignore: false,
    duplicate: false,
    tripId,
    patch: isUpdate && !!tripId && !!newRow,
    invalidateLists: !isUpdate,
    complianceFallback: isUpdate && !complianceHasTrip && membershipChanged,
    podChanged: isUpdate && POD_COLUMNS.some(changed),
    settlementChanged:
      isUpdate &&
      (changed("compliance_verified_at") ||
        changed("compliance_decision") ||
        changed("compliance_declined_at") ||
        changed("amount_paid")),
    clientChanged: !isUpdate || changed("client_id") || changed("client_name"),
    assignmentChanged:
      !isUpdate ||
      changed("driver_id") ||
      changed("vehicle_id") ||
      changed("assigned_by_user_id") ||
      changed("status"),
    counterpartyChanged:
      !isUpdate ||
      changed("supplier_name") ||
      changed("client_name") ||
      changed("supplier_id") ||
      changed("client_id"),
  };
}

/** Patch cached trip lists, or schedule the list reads an insert/delete requires. */
export function applyTripRealtimeCatalogUpdate(
  qc: QueryClient,
  organizationId: string,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): TripRealtimeDecision {
  const tripId = tripIdOf(payload);
  const cached = tripId ? findCachedTrip(qc, organizationId, tripId) : null;
  const compliance = qc.getQueryData(queryKeys.trips.compliance(organizationId));
  const complianceHasTrip =
    !!tripId &&
    Array.isArray(compliance) &&
    compliance.some((row) => row && typeof row === "object" && (row as TripRecord).id === tripId);
  const decision = decideTripRealtimeChange(organizationId, payload, cached, complianceHasTrip);
  if (decision.ignore) return decision;

  const newRow = asRecord(payload.new);
  if (decision.patch && decision.tripId && newRow) {
    qc.setQueryData(queryKeys.trips.detail(decision.tripId), (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      return { ...(old as TripRecord), ...newRow };
    });
    for (const queryKey of [
      queryKeys.trips.finite(organizationId),
      queryKeys.trips.compliance(organizationId),
    ]) {
      qc.setQueriesData({ queryKey }, (old: unknown) =>
        mergeTripRowIntoList(old, decision.tripId ?? "", newRow),
      );
    }
  } else if (decision.tripId) {
    void qc.invalidateQueries({ queryKey: queryKeys.trips.detail(decision.tripId) });
  }

  if (decision.invalidateLists || decision.complianceFallback) {
    if (decision.invalidateLists) {
      // `trips.all` already covers the hub finite list and the wide-range totals query.
      // The compliance catalog is a different key, so it is scheduled on its own.
      scheduleInvalidation(qc, queryKeys.trips.all(organizationId));
      scheduleInvalidation(qc, queryKeys.trips.finite(organizationId));
      scheduleInvalidation(qc, queryKeys.trips.whereOrgIsClient(organizationId));
      scheduleInvalidation(qc, queryKeys.trips.whereOrgIsSupplier(organizationId));
    }
    scheduleInvalidation(qc, queryKeys.trips.compliance(organizationId));
  }
  return decision;
}
