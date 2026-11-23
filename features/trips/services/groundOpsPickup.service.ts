/**
 * Ground Ops pickup-side simulate: Assigned → Reached pickup (in_progress) and
 * Reached pickup → In transit. Undo / revoke is not offered to Ground Ops
 * (Trip Ops keep Revoke Last on their own path).
 * Simulate goes through SECURITY DEFINER RPC (migration
 * 20270919100000_ground_ops_pickup_simulation, extended by
 * 20271123101500_ground_ops_pickup_event_at for optional stage clock) that
 * re-checks role, warehouse, the allowed transition, and the org's mandatory
 * trip documents. Ground Ops cannot write trips directly. Optional eventAt is
 * the same picker ISO Trip Ops saves into BISIM / started_at.
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
  /** Selected stage clock (ISO). Same picker value Trip Ops saves into BISIM. */
  eventAt?: string | null,
): Promise<GroundOpsPickupResult> {
  const stageAt = String(eventAt ?? "").trim();
  const { data, error } = await supabase().rpc("simulate_ground_ops_pickup_status", {
    p_trip_id: tripId,
    p_new_status: target,
    ...(stageAt ? { p_event_at: stageAt } : {}),
  });
  if (error) return { ok: false, error: error.message };
  return readResult(data);
}

/** Ground Ops must not undo / revoke a simulation. Trip Ops use their own path. */
export async function revokeGroundOpsPickupStatus(
  _tripId: string,
): Promise<GroundOpsPickupResult> {
  return {
    ok: false,
    error: "Ground Ops can simulate a trip but cannot undo or revoke it",
  };
}
