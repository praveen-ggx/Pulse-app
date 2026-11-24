/**
 * Trip assignment / reassignment → Pulse chat timeline rows.
 * Merges audit history into the message stream and builds copy for new posts.
 */
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { TripMessageRow } from "../types/chat.types";

export type AssignmentDriverProfile = {
  displayName: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
};

export type AssignmentNameMaps = {
  driverNames: Record<string, string>;
  vehicleLabels: Record<string, string>;
  /** Resolved driver photos for assignment audit rows (swap cards). */
  driverProfiles: Record<string, AssignmentDriverProfile>;
};

function resolveDriverName(
  id: string | null | undefined,
  maps: AssignmentNameMaps,
  fallback?: string | null,
): string | null {
  if (!id) return null;
  return maps.driverNames[id] ?? fallback ?? null;
}

function resolveVehicleLabel(
  id: string | null | undefined,
  maps: AssignmentNameMaps,
  fallback?: string | null,
): string | null {
  if (!id) return null;
  return maps.vehicleLabels[id] ?? fallback ?? null;
}

/** Human-readable assignment log body (matches trip detail activity + status broadcast tone). */
export function buildAssignmentChatContent(
  row: Pick<
    TripAssignmentAuditRow,
    | "event_type"
    | "driver_id_prev"
    | "driver_id_new"
    | "vehicle_id_prev"
    | "vehicle_id_new"
  >,
  maps: AssignmentNameMaps,
  tripFallback?: {
    driver_display_name?: string | null;
    vehicle_display_number?: string | null;
  },
): string {
  const driverPrev = resolveDriverName(row.driver_id_prev, maps);
  const driverNew = resolveDriverName(
    row.driver_id_new,
    maps,
    tripFallback?.driver_display_name,
  );
  const vehiclePrev = resolveVehicleLabel(row.vehicle_id_prev, maps);
  const vehicleNew = resolveVehicleLabel(
    row.vehicle_id_new,
    maps,
    tripFallback?.vehicle_display_number,
  );

  const isDriverDeclined =
    row.event_type === "declined_pending" ||
    (row.event_type === "reassignment" &&
      row.driver_id_prev != null &&
      row.driver_id_new == null);

  if (isDriverDeclined) {
    const who = driverPrev ?? "Driver";
    return `${who} declined or was removed from this trip.`;
  }

  const parts: string[] = [];

  if (driverPrev != null && driverNew != null && driverPrev !== driverNew) {
    parts.push(`Driver changed from ${driverPrev} to ${driverNew}.`);
  } else if (driverNew != null && driverPrev == null) {
    parts.push(`${driverNew} assigned as driver.`);
  } else if (driverPrev != null && driverNew == null) {
    parts.push(`Driver ${driverPrev} unassigned.`);
  }

  if (vehiclePrev != null && vehicleNew != null && vehiclePrev !== vehicleNew) {
    parts.push(`Vehicle changed from ${vehiclePrev} to ${vehicleNew}.`);
  } else if (vehicleNew != null && vehiclePrev == null) {
    parts.push(
      `Vehicle ${vehicleNew} assigned${driverNew ? `. ${driverNew} will report shortly` : ""}.`,
    );
  } else if (vehiclePrev != null && vehicleNew == null) {
    parts.push(`Vehicle ${vehiclePrev} unassigned.`);
  }

  if (parts.length > 0) return parts.join(" ");

  if (row.event_type === "reassignment") {
    return "Driver or vehicle assignment was updated.";
  }

  const vehicle = vehicleNew ?? "TBD";
  const driver = driverNew ?? "the driver";
  return `Vehicle ${vehicle} assigned. ${driver} will report shortly.`;
}

function assignmentAuditDedupeKey(row: TripAssignmentAuditRow): string {
  return `${row.changed_at}|${row.event_type}|${row.driver_id_new ?? ""}|${row.vehicle_id_new ?? ""}|${row.driver_id_prev ?? ""}|${row.vehicle_id_prev ?? ""}`;
}

/** Skip synthetic row when the same assignment_update or status broadcast already exists. */
function messageAlreadyCoversAudit(
  messages: TripMessageRow[],
  row: TripAssignmentAuditRow,
  content: string,
): boolean {
  const key = assignmentAuditDedupeKey(row);
  for (const m of messages) {
    const meta = m.metadata as Record<string, unknown> | null | undefined;
    if (meta?.assignment_audit_id === row.id) return true;
    if (
      typeof meta?.assignment_audit_key === "string" &&
      meta.assignment_audit_key === key
    ) {
      return true;
    }
    if (m.message_type === "assignment_update") {
      const body = (m.content ?? "").trim();
      if (body && body === content.trim()) return true;
    }
    if (
      row.event_type === "assignment" &&
      (m.message_type === "system" || m.message_type === "system_log") &&
      (m.content ?? "").toLowerCase().includes("assigned")
    ) {
      const dt = Math.abs(
        new Date(m.created_at).getTime() - new Date(row.changed_at).getTime(),
      );
      if (dt < 120_000) return true;
    }
  }
  return false;
}

export function syntheticAssignmentMessagesFromAudit(
  auditRows: TripAssignmentAuditRow[],
  conversationId: string,
  organizationId: string,
  maps: AssignmentNameMaps,
  existingMessages: TripMessageRow[],
  tripFallback?: {
    driver_display_name?: string | null;
    vehicle_display_number?: string | null;
  },
): TripMessageRow[] {
  const ordered = [...auditRows].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
  );
  const out: TripMessageRow[] = [];

  for (const row of ordered) {
    const content = buildAssignmentChatContent(row, maps, tripFallback);
    if (!content.trim()) continue;
    if (messageAlreadyCoversAudit(existingMessages, row, content)) continue;

    out.push({
      id: `audit-${row.id}-${conversationId}`,
      conversation_id: conversationId,
      organization_id: organizationId,
      sender_user_id: null,
      sender_role: "system",
      sender_name: "Trip System",
      content,
      message_type: "assignment_update",
      metadata: {
        assignment_audit_id: row.id,
        assignment_audit_key: assignmentAuditDedupeKey(row),
        event_type: row.event_type,
        changed_at: row.changed_at,
        event_payload: {
          driver_id_prev: row.driver_id_prev,
          driver_id_new: row.driver_id_new,
          vehicle_id_prev: row.vehicle_id_prev,
          vehicle_id_new: row.vehicle_id_new,
          driver_display_name: row.driver_id_new
            ? (maps.driverProfiles[row.driver_id_new]?.displayName ??
              maps.driverNames[row.driver_id_new] ??
              null)
            : null,
          driver_display_name_prev: row.driver_id_prev
            ? (maps.driverProfiles[row.driver_id_prev]?.displayName ??
              maps.driverNames[row.driver_id_prev] ??
              null)
            : null,
          driver_avatar_url: row.driver_id_new
            ? (maps.driverProfiles[row.driver_id_new]?.avatarUrl ?? null)
            : null,
          driver_avatar_seed: row.driver_id_new
            ? (maps.driverProfiles[row.driver_id_new]?.avatarSeed ?? null)
            : null,
          driver_avatar_url_prev: row.driver_id_prev
            ? (maps.driverProfiles[row.driver_id_prev]?.avatarUrl ?? null)
            : null,
          driver_avatar_seed_prev: row.driver_id_prev
            ? (maps.driverProfiles[row.driver_id_prev]?.avatarSeed ?? null)
            : null,
        },
      },
      is_read: true,
      read_at: null,
      created_at: row.changed_at,
    });
  }

  return out;
}

export function mergeAssignmentAuditIntoTripMessages(
  messages: TripMessageRow[],
  auditRows: TripAssignmentAuditRow[],
  conversationId: string,
  organizationId: string,
  maps: AssignmentNameMaps,
  tripFallback?: {
    driver_display_name?: string | null;
    vehicle_display_number?: string | null;
  },
): TripMessageRow[] {
  const synthetic = syntheticAssignmentMessagesFromAudit(
    auditRows,
    conversationId,
    organizationId,
    maps,
    messages,
    tripFallback,
  );
  if (synthetic.length === 0) return messages;
  return [...messages, ...synthetic].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}
