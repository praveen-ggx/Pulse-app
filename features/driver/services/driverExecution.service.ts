import { supabase } from "@/lib/supabase";
import { getPlatformEventBus } from "@/lib/platform/events/InProcessEventBus";
import { uuidv7 } from "@/lib/uuidv7";
import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * Driver Execution Authority client. The server (driver_execute_command) owns
 * authorization, the transition table, prerequisites (POD, stops, supplier
 * linkage) and timestamps; this module only sends intent and reports outcome.
 */

export type DriverCommand =
  | "ACCEPT_TRIP"
  | "START_TRIP"
  | "DEPART_PICKUP"
  | "ARRIVE_DROP"
  | "COMPLETE_TRIP"
  | "UNDO_STEP"
  | "RECORD_ODOMETER"
  | "ARRIVE_STOP"
  | "COMPLETE_STOP";

export type DriverCommandErrorCode =
  | "invalid_command"
  | "invalid_payload"
  | "not_assigned_driver"
  | "trip_not_executable"
  | "invalid_transition"
  | "stale_state"
  | "pod_required"
  | "stops_incomplete"
  | "supplier_link_required"
  | "other_active_trip"
  | "idempotency_conflict"
  | "stop_not_found"
  | "stop_out_of_order"
  | "command_not_enabled";

export interface DriverStopSnapshot {
  trip_id: string;
  stop_id: string;
  sequence: number;
  driver_id: string | null;
  status: string;
  arrived_at: string | null;
  completed_at: string | null;
  skip_reason: string | null;
  failure_reason: string | null;
  pod_required: boolean;
}

export interface DriverOdometerSnapshot {
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  odometer_distance_km: number | null;
  gps_distance_km: number | null;
  distance_discrepancy_km: number | null;
  distance_source: string | null;
  odometer_verification_state: string | null;
  odometer_notes: string | null;
  odometer_updated_by: string | null;
  odometer_updated_at: string | null;
}

export interface DriverCommandResult {
  ok: boolean;
  command: DriverCommand | string;
  error_code?: DriverCommandErrorCode;
  applied?: boolean;
  replayed?: boolean;
  experience?: "core" | "commerce";
  trip_id?: string;
  organization_id?: string;
  trip_status?: string;
  previous_status?: string;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  allowed_commands?: DriverCommand[];
  stops_total?: number;
  stops_open?: number;
  odometer?: DriverOdometerSnapshot;
  /** Stop commands: the stop after the command (partial on errors). */
  stop?: Partial<DriverStopSnapshot> & { stop_id: string; status: string };
  /** ARRIVE_STOP on an assigned trip started it. */
  trip_started?: boolean;
  /** COMPLETE_STOP on the final open stop completed the trip. */
  trip_completed?: boolean;
}

export interface ExecuteDriverCommandInput {
  tripId: string;
  command: DriverCommand;
  /** Status the UI believes the trip is in; required for UNDO_STEP. */
  expectedStatus?: string | null;
  /** Reuse across retries of the same user intent. Generated when omitted. */
  commandId?: string;
  payload?: Record<string, unknown>;
}

const DRIVER_COMMAND_ERROR_MESSAGES: Record<DriverCommandErrorCode, string> = {
  invalid_command: "This action is not available.",
  invalid_payload: "Some of the values entered are not valid.",
  not_assigned_driver: "You are not the assigned driver for this trip.",
  trip_not_executable: "This trip can no longer be updated.",
  invalid_transition: "This step is not available for the trip's current stage.",
  stale_state: "This trip was updated elsewhere. Refresh and try again.",
  pod_required: "Upload proof of delivery before completing this trip.",
  stops_incomplete: "Finish every stop before completing this trip.",
  supplier_link_required:
    "Cannot complete aggregate trip without a supplier. Assign a supplier first.",
  other_active_trip: "Finish your other active trip before starting this one.",
  idempotency_conflict: "This request conflicts with an earlier one. Try again.",
  stop_not_found: "This stop is not part of the trip.",
  stop_out_of_order: "Finish the earlier stops on this route first.",
  command_not_enabled: "This action is not available yet.",
};

export class DriverCommandError extends Error {
  readonly code: DriverCommandErrorCode | "rpc_error";
  readonly result: DriverCommandResult | null;

  constructor(code: DriverCommandErrorCode | "rpc_error", message: string, result: DriverCommandResult | null) {
    super(message);
    this.name = "DriverCommandError";
    this.code = code;
    this.result = result;
  }
}

export function driverCommandErrorMessage(code: DriverCommandErrorCode | string | undefined): string {
  return (
    DRIVER_COMMAND_ERROR_MESSAGES[code as DriverCommandErrorCode] ??
    "Could not update the trip. Please try again."
  );
}

function publishLifecycleEvent(result: DriverCommandResult, trip: Pick<TripRow, "indent_id" | "driver_id" | "vehicle_id"> | null) {
  if (!result.applied || result.replayed || !result.trip_id || !result.organization_id) return;
  const base = {
    workspaceId: result.organization_id,
    correlationId: uuidv7(),
    occurredAt: new Date().toISOString(),
  };
  const ids = {
    tripId: result.trip_id,
    indentId: trip?.indent_id ?? null,
    driverId: trip?.driver_id ?? null,
    vehicleId: trip?.vehicle_id ?? null,
  };
  if (result.previous_status === "assigned" && result.trip_status === "in_progress") {
    void getPlatformEventBus()
      .publish({ name: "TripStarted", ...base, payload: { ...ids, startedAt: result.started_at ?? "" } })
      .catch((err) => {
        if (__DEV__) console.warn("[driverExecution] TripStarted publish failed:", err);
      });
  } else if (result.previous_status !== "completed" && result.trip_status === "completed") {
    void getPlatformEventBus()
      .publish({ name: "TripDelivered", ...base, payload: { ...ids, deliveredAt: result.completed_at ?? "" } })
      .catch((err) => {
        if (__DEV__) console.warn("[driverExecution] TripDelivered publish failed:", err);
      });
  }
}

export async function executeDriverCommand(
  input: ExecuteDriverCommandInput,
  trip?: Pick<TripRow, "indent_id" | "driver_id" | "vehicle_id"> | null,
): Promise<{ error: DriverCommandError | null; result: DriverCommandResult | null }> {
  const { data, error } = await supabase().rpc("driver_execute_command", {
    p_trip_id: input.tripId,
    p_command: input.command,
    p_command_id: input.commandId ?? uuidv7(),
    p_expected_status: input.expectedStatus ?? null,
    p_payload: input.payload ?? {},
  });
  if (error) {
    // Drivers lose signal on highways: show a plain message, not "TypeError: Network request failed".
    const raw = String(error.message ?? "");
    const message = /network request failed|failed to fetch|networkerror|load failed|timed? ?out|aborted/i.test(raw)
      ? "No internet connection. Check your signal and try again."
      : raw;
    return { error: new DriverCommandError("rpc_error", message, null), result: null };
  }
  const result = (data ?? null) as DriverCommandResult | null;
  if (!result) {
    return { error: new DriverCommandError("rpc_error", driverCommandErrorMessage(undefined), null), result: null };
  }
  if (!result.ok) {
    const code = result.error_code ?? "invalid_command";
    return { error: new DriverCommandError(code, driverCommandErrorMessage(code), result), result };
  }
  publishLifecycleEvent(result, trip ?? null);
  return { error: null, result };
}

/** Merge the server's authoritative status fields into a locally held trip row. */
export function applyDriverCommandResult<T extends Partial<TripRow>>(trip: T, result: DriverCommandResult): T {
  return {
    ...trip,
    status: result.trip_status ?? trip.status,
    started_at: result.started_at !== undefined ? result.started_at : trip.started_at,
    completed_at: result.completed_at !== undefined ? result.completed_at : trip.completed_at,
    updated_at: result.updated_at ?? trip.updated_at,
    ...(result.odometer ?? {}),
  };
}
