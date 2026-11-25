import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";

export type OperationalTimelineEventType =
  | "fuel_logged"
  | "toll_logged"
  | "other_expense_logged"
  | "odometer_added"
  | "discrepancy_detected"
  | "approval_changed"
  | "posting_completed"
  | "posting_failed"
  | "reimbursement_flagged"
  | "maintenance_logged"
  | "replay_completed"
  | "replay_failed";

export interface TripOperationalTimelineEvent {
  id: string;
  organization_id: string;
  trip_id: string;
  event_type: OperationalTimelineEventType;
  source_type: string | null;
  source_id: string | null;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function appendTripOperationalTimelineEvent(input: {
  organizationId?: string | null;
  tripId: string;
  eventType: OperationalTimelineEventType;
  sourceType?: string | null;
  sourceId?: string | null;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const organizationId = String(input.organizationId ?? "").trim();

  // Preferred path: server function. Members behave exactly as before; the trip's assigned driver
  // (not an org member) is now allowed too. The org defaults to the trip's own org when omitted.
  const rpc = await supabase().rpc("record_trip_operational_timeline_event", {
    p_trip_id: input.tripId,
    p_event_type: input.eventType,
    p_organization_id: (organizationId || null) as never,
    p_source_type: (input.sourceType ?? null) as never,
    p_source_id: (input.sourceId ?? null) as never,
    p_actor_user_id: (input.actorUserId ?? null) as never,
    p_payload: (input.payload ?? {}) as never,
  });
  if (!rpc.error) return { error: null };
  // Function not deployed yet (code can ship before the migration): use the direct insert below.
  const missingRpc = rpc.error.code === "PGRST202" || rpc.error.code === "42883";
  if (!missingRpc) return { error: new Error(rpc.error.message) };

  let legacyOrganizationId = organizationId;
  if (!legacyOrganizationId) {
    const tripRes = await supabase()
      .from("trips")
      .select("organization_id")
      .eq("id", input.tripId)
      .maybeSingle();
    legacyOrganizationId = String(
      (tripRes.data as { organization_id?: string | null } | null)?.organization_id ?? "",
    ).trim();
  }
  if (!legacyOrganizationId) {
    return { error: new Error("organization_id missing for timeline event") };
  }
  const payload = {
    organization_id: legacyOrganizationId,
    trip_id: input.tripId,
    event_type: input.eventType,
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    actor_user_id: input.actorUserId ?? null,
    payload: input.payload ?? {},
  };
  const { error } = await supabase().from("trip_operational_timeline_events").insert(payload);
  return { error: error ? new Error(error.message) : null };
}

export async function appendTripOperationalTimelineEventSafe(input: {
  organizationId?: string | null;
  tripId: string;
  eventType: OperationalTimelineEventType;
  sourceType?: string | null;
  sourceId?: string | null;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
}) {
  try {
    const res = await appendTripOperationalTimelineEvent(input);
    // A refused or failed write comes back as { error }, not a throw. Keep operations non-blocking,
    // but do not lose the signal: it is the only trace that a timeline entry was not written.
    if (res.error) {
      logger.warn("trip timeline event not written", {
        tripId: input.tripId,
        eventType: input.eventType,
        reason: res.error.message,
      });
    }
  } catch {
    // keep operations non-blocking; timeline failures should never block primary workflows
  }
}

export async function getTripOperationalTimelineEvents(input: {
  tripId: string;
  limit?: number;
}): Promise<{ error: Error | null; events: TripOperationalTimelineEvent[] }> {
  const { data, error } = await supabase()
    .from("trip_operational_timeline_events")
    .select("*")
    .eq("trip_id", input.tripId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 60);
  if (error) return { error: new Error(error.message), events: [] };
  return { error: null, events: (data ?? []) as TripOperationalTimelineEvent[] };
}
