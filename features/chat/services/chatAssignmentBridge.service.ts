/**
 * Posts assignment_update cards to all trip chat lanes when driver/vehicle changes.
 */
import { supabase } from "@/lib/supabase";
import { notifyTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
import { getDriverById } from "@/features/drivers/services/drivers.service";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import { resolveAvatarPublicUrl } from "@/lib/avatarUpload";
import {
  buildAssignmentChatContent,
  type AssignmentNameMaps,
} from "../utils/assignmentAuditChatMessages.util";

/**
 * Reassign must move the driver party lane to the new assignee.
 * Without this, driver inbox/RLS still key off the previous driver_id.
 */
async function syncDriverPartyLaneAfterAssignment(trip: TripRow): Promise<void> {
  const tripId = String(trip.id ?? "").trim();
  if (!tripId) return;

  const driverId = trip.driver_id ?? null;
  const driverName = (trip.driver_display_name ?? "").trim() || null;

  const patch: Record<string, unknown> = {
    driver_id: driverId,
  };
  if (driverName) patch.party_name = driverName;

  const { error: updateErr } = await supabase()
    .from("trip_conversations")
    .update(patch)
    .eq("trip_id", tripId)
    .eq("party_type", "driver");

  if (updateErr && __DEV__) {
    console.warn("[chatAssignmentBridge] sync driver lane failed", {
      tripId,
      message: updateErr.message,
    });
  }

  try {
    await supabase().rpc("fn_ensure_trip_party_conversations", {
      p_trip_id: tripId,
    });
  } catch (err) {
    if (__DEV__) {
      console.warn("[chatAssignmentBridge] ensure party conversations failed", {
        tripId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function resolveAssignmentNameMaps(
  orgId: string,
  row: Pick<
    TripAssignmentAuditRow,
    "driver_id_prev" | "driver_id_new" | "vehicle_id_prev" | "vehicle_id_new"
  >,
  trip: TripRow,
): Promise<AssignmentNameMaps> {
  const driverIds = new Set<string>();
  const vehicleIds = new Set<string>();
  if (row.driver_id_prev) driverIds.add(row.driver_id_prev);
  if (row.driver_id_new) driverIds.add(row.driver_id_new);
  if (row.vehicle_id_prev) vehicleIds.add(row.vehicle_id_prev);
  if (row.vehicle_id_new) vehicleIds.add(row.vehicle_id_new);

  const driverNames: Record<string, string> = {};
  const driverProfiles: AssignmentNameMaps["driverProfiles"] = {};
  const vehicleLabels: Record<string, string> = {};

  await Promise.all([
    ...Array.from(driverIds).map(async (id) => {
      const res = await getDriverById(orgId, id);
      const displayName =
        res.driver?.name?.trim() ||
        res.driver?.phone?.trim() ||
        trip.driver_display_name?.trim() ||
        "Driver";
      driverNames[id] = displayName;
      driverProfiles[id] = {
        displayName,
        avatarUrl: resolveAvatarPublicUrl(res.driver?.avatar_url ?? null),
        avatarSeed: (res.driver?.avatar_seed ?? "").trim() || null,
      };
    }),
    ...Array.from(vehicleIds).map(async (id) => {
      const res = await getVehicleById(orgId, id);
      vehicleLabels[id] =
        [res.vehicle?.vehicle_number, res.vehicle?.vehicle_type]
          .filter(Boolean)
          .join(" · ") ||
        trip.vehicle_display_number?.trim() ||
        "Vehicle";
    }),
  ]);

  return { driverNames, vehicleLabels, driverProfiles };
}

/**
 * Broadcast assignment/reassignment to every trip_conversations lane.
 * Skips first-time driver assign when status→assigned (DB trigger posts that line).
 */
export async function postAssignmentUpdateToTripChats(params: {
  trip: TripRow;
  audit: Pick<
    TripAssignmentAuditRow,
    | "id"
    | "event_type"
    | "driver_id_prev"
    | "driver_id_new"
    | "vehicle_id_prev"
    | "vehicle_id_new"
    | "changed_at"
  >;
  maps?: AssignmentNameMaps;
  /** When true, status broadcast already posted the initial "Vehicle … assigned" line. */
  skipInitialAssignmentDuplicate?: boolean;
}): Promise<void> {
  const { trip, audit } = params;
  const orgId = trip.organization_id;
  if (!orgId) return;

  if (
    params.skipInitialAssignmentDuplicate &&
    audit.event_type === "assignment"
  ) {
    return;
  }

  const maps =
    params.maps ??
    (await resolveAssignmentNameMaps(orgId, audit, trip));

  const content = buildAssignmentChatContent(audit, maps, {
    driver_display_name: trip.driver_display_name,
    vehicle_display_number: trip.vehicle_display_number,
  });
  if (!content.trim()) return;

  let driverAvatarUrl: string | null = null;
  let driverAvatarSeed: string | null = null;
  let driverDisplayNameNew: string | null = null;
  if (audit.driver_id_new) {
    const driverRes = await getDriverById(orgId, audit.driver_id_new);
    driverAvatarUrl = driverRes.driver?.avatar_url ?? null;
    driverAvatarSeed = driverRes.driver?.avatar_seed ?? null;
    driverDisplayNameNew =
      driverRes.driver?.name?.trim() ||
      driverRes.driver?.phone?.trim() ||
      null;
  }

  let driverAvatarUrlPrev: string | null = null;
  let driverAvatarSeedPrev: string | null = null;
  let driverDisplayNamePrev: string | null = null;
  if (audit.driver_id_prev) {
    const driverPrevRes = await getDriverById(orgId, audit.driver_id_prev);
    driverAvatarUrlPrev = driverPrevRes.driver?.avatar_url ?? null;
    driverAvatarSeedPrev = driverPrevRes.driver?.avatar_seed ?? null;
    driverDisplayNamePrev =
      driverPrevRes.driver?.name?.trim() ||
      driverPrevRes.driver?.phone?.trim() ||
      null;
  }

  const metadata = {
    assignment_audit_id: audit.id,
    assignment_audit_key: `${audit.changed_at}|${audit.event_type}|${audit.driver_id_new ?? ""}|${audit.vehicle_id_new ?? ""}`,
    event_type: audit.event_type,
    changed_at: audit.changed_at,
    event_payload: {
      driver_id_prev: audit.driver_id_prev,
      driver_id_new: audit.driver_id_new,
      vehicle_id_prev: audit.vehicle_id_prev,
      vehicle_id_new: audit.vehicle_id_new,
      driver_display_name:
        driverDisplayNameNew || trip.driver_display_name,
      driver_display_name_prev: driverDisplayNamePrev,
      vehicle_display_number: trip.vehicle_display_number,
      driver_avatar_url: driverAvatarUrl,
      driver_avatar_seed: driverAvatarSeed,
      driver_avatar_url_prev: driverAvatarUrlPrev,
      driver_avatar_seed_prev: driverAvatarSeedPrev,
    },
  };

  const { data: conversations, error } = await supabase()
    .from("trip_conversations")
    .select("id, organization_id, party_type")
    .eq("trip_id", trip.id);

  if (error || !conversations?.length) {
    if (__DEV__) {
      console.warn("[chatAssignmentBridge] no conversations", {
        tripId: trip.id,
        message: error?.message,
      });
    }
    return;
  }

  // Batch the per-conversation dedupe check into ONE query for all conversations
  // (was an N+1 SELECT), then Set-lookup which already have this audit card.
  const convIds = conversations.map((c) => c.id);
  const { data: existingRows } = await supabase()
    .from("trip_messages")
    .select("conversation_id")
    .in("conversation_id", convIds)
    .eq("message_type", "assignment_update")
    .contains("metadata", { assignment_audit_id: audit.id });
  const alreadyPosted = new Set(
    (existingRows ?? []).map((r) => (r as { conversation_id: string }).conversation_id),
  );

  for (const conv of conversations) {
    if (alreadyPosted.has(conv.id)) continue;

    const { error: rpcError } = await supabase().rpc("send_trip_chat_message", {
      p_conversation_id: conv.id,
      p_content: content,
      p_sender_role: "system",
      p_sender_name: "Trip System",
      p_sender_user_id: null,
      p_message_type: "assignment_update",
      p_metadata: metadata,
    });

    if (rpcError && __DEV__) {
      console.warn("[chatAssignmentBridge] send failed", {
        conversationId: conv.id,
        message: rpcError.message,
      });
    }
  }

  await syncDriverPartyLaneAfterAssignment(trip);
  notifyTripChatMessagesChanged();
}

/**
 * Posts a single assignment_update card to all conversations for an aggregate trip
 * assignment that went through the `assign_aggregate_trip_driver` RPC (which bypasses
 * updateTripAssignment and therefore skips the normal audit-based broadcast).
 */
export async function postAggregateAssignmentMessage(
  trip: TripRow,
  previousDriverId: string | null,
): Promise<void> {
  if (!trip.organization_id || !trip.driver_id) return;

  const isReassignment =
    previousDriverId != null && previousDriverId !== trip.driver_id;
  const driverName = trip.driver_display_name?.trim() || 'Driver';
  const content = isReassignment
    ? `Driver reassigned to ${driverName}.`
    : `${driverName} assigned as driver.`;

  let driverAvatarUrl: string | null = null;
  let driverAvatarSeed: string | null = null;
  let driverAvatarUrlPrev: string | null = null;
  let driverAvatarSeedPrev: string | null = null;
  let driverDisplayNamePrev: string | null = null;

  // Current and previous driver lookups are independent — fetch in parallel
  // (previous only when a prior driver exists, preserving prior behavior).
  const [driverRes, prevRes] = await Promise.all([
    getDriverById(trip.organization_id, trip.driver_id),
    previousDriverId
      ? getDriverById(trip.organization_id, previousDriverId)
      : Promise.resolve(null),
  ]);

  driverAvatarUrl = driverRes.driver?.avatar_url ?? null;
  driverAvatarSeed = driverRes.driver?.avatar_seed ?? null;

  if (prevRes) {
    driverAvatarUrlPrev = prevRes.driver?.avatar_url ?? null;
    driverAvatarSeedPrev = prevRes.driver?.avatar_seed ?? null;
    driverDisplayNamePrev =
      prevRes.driver?.name?.trim() || prevRes.driver?.phone?.trim() || null;
  }

  const dedupeKey = `agg-assign|${trip.driver_id}|${trip.updated_at ?? new Date().toISOString()}`;

  const { data: conversations, error } = await supabase()
    .from('trip_conversations')
    .select('id, organization_id')
    .eq('trip_id', trip.id);

  if (error || !conversations?.length) {
    if (__DEV__) {
      console.warn('[chatAssignmentBridge] postAggregateAssignmentMessage: no conversations', {
        tripId: trip.id,
        message: error?.message,
      });
    }
    return;
  }

  // Batch the per-conversation dedupe check into ONE query (was an N+1 SELECT).
  const aggConvIds = conversations.map((c) => c.id);
  const { data: aggExistingRows } = await supabase()
    .from('trip_messages')
    .select('conversation_id')
    .in('conversation_id', aggConvIds)
    .eq('message_type', 'assignment_update')
    .contains('metadata', { agg_dedupe_key: dedupeKey });
  const aggAlreadyPosted = new Set(
    (aggExistingRows ?? []).map((r) => (r as { conversation_id: string }).conversation_id),
  );

  for (const conv of conversations) {
    if (aggAlreadyPosted.has(conv.id)) continue;

    const { error: rpcError } = await supabase().rpc('send_trip_chat_message', {
      p_conversation_id: conv.id,
      p_content: content,
      p_sender_role: 'system',
      p_sender_name: 'Trip System',
      p_sender_user_id: null,
      p_message_type: 'assignment_update',
      p_metadata: {
        agg_dedupe_key: dedupeKey,
        driver_id_new: trip.driver_id,
        driver_id_prev: previousDriverId,
        event_payload: {
          driver_id_new: trip.driver_id,
          driver_id_prev: previousDriverId,
          driver_display_name: driverName,
          driver_display_name_prev: driverDisplayNamePrev,
          driver_avatar_url: driverAvatarUrl,
          driver_avatar_seed: driverAvatarSeed,
          driver_avatar_url_prev: driverAvatarUrlPrev,
          driver_avatar_seed_prev: driverAvatarSeedPrev,
        },
      },
    });

    if (rpcError && __DEV__) {
      console.warn('[chatAssignmentBridge] postAggregateAssignmentMessage: send failed', {
        conversationId: conv.id,
        message: rpcError.message,
      });
    }
  }

  await syncDriverPartyLaneAfterAssignment(trip);
  notifyTripChatMessagesChanged();
}

export async function postAssignmentUpdateAfterTripSave(params: {
  trip: TripRow;
  updateData: {
    driver_id?: string | null;
    vehicle_id?: string | null;
    vehicle_display_number?: string | null;
  };
  auditRow: TripAssignmentAuditRow | null;
}): Promise<void> {
  const { trip, updateData, auditRow } = params;
  if (!auditRow) return;

  const driverWasSet =
    updateData.driver_id !== undefined && updateData.driver_id != null;
  const skipInitial =
    auditRow.event_type === "assignment" && driverWasSet;

  await postAssignmentUpdateToTripChats({
    trip,
    audit: auditRow,
    skipInitialAssignmentDuplicate: skipInitial,
  });
}
