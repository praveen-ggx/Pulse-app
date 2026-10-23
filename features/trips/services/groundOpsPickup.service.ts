/**
 * Ground Ops pickup-side simulate: Assigned → Reached pickup (in_progress) and
 * Reached pickup → In transit, plus undo of the last of those two steps.
 * Both go through SECURITY DEFINER RPCs (migration
 * 20270919100000_ground_ops_pickup_simulation) that re-check role, warehouse,
 * the allowed transition, and the org's mandatory trip documents. Trip Ops keep
 * their own direct simulate path; Ground Ops cannot write trips directly.
 */
import { supabase } from "@/lib/supabase";

export type GroundOpsPickupTarget = "in_progress" | "in_transit";

export type GroundOpsPickupResult =
  | { ok: true; status: string }
  | { ok: false; error: string; missingDocumentTypes?: string[] };

function readResult(data: unknown): GroundOpsPickupResult {
  const row = (data ?? {}) as {
    ok?: boolean;
    status?: string;
    error?: string;
    missing_document_types?: string[];
  };
  if (row.ok) return { ok: true, status: String(row.status ?? "") };
  return {
    ok: false,
    error: row.error ?? "Could not update the trip",
    missingDocumentTypes: Array.isArray(row.missing_document_types)
      ? row.missing_document_types
      : undefined,
  };
}

export async function simulateGroundOpsPickupStatus(
  tripId: string,
  target: GroundOpsPickupTarget,
): Promise<GroundOpsPickupResult> {
  const { data, error } = await supabase().rpc("simulate_ground_ops_pickup_status", {
    p_trip_id: tripId,
    p_new_status: target,
  });
  if (error) return { ok: false, error: error.message };
  return readResult(data);
}

export async function revokeGroundOpsPickupStatus(
  tripId: string,
): Promise<GroundOpsPickupResult> {
  const { data, error } = await supabase().rpc("revoke_ground_ops_pickup_status", {
    p_trip_id: tripId,
  });
  if (error) return { ok: false, error: error.message };
  return readResult(data);
}
