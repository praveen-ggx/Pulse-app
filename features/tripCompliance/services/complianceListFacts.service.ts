/**
 * Batched Compliance list reads (migration 20261005122431). One RPC per list
 * replaces the per-trip get_vehicle_for_trip_viewer / get_supplier_details /
 * vehicles chains that took preprod down on 2026-10-05.
 *
 * Both RPCs authorize every trip id server-side (get_trips_for_org visibility,
 * ground-ops warehouse scope, deleted trips excluded) — ids the viewer can't see
 * simply return no row.
 */
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { getTripExecutionModel } from "@/features/trips/domain/tripExecutionModel";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";
import { supabase } from "@/lib/supabase";

/** Server-side cap per call (SQLSTATE 22023 above it). The list itself is ≤400 (get_trips_for_org). */
export const COMPLIANCE_BATCH_MAX_TRIP_IDS = 1000;

export type ComplianceListTripFactRow = {
  trip_id: string;
  vehicle_id: string | null;
  truck_type: string | null;
  /** NULL = viewer can't read the supplier; "" = supplier has no name fields. */
  supplier_name: string | null;
};

export type ComplianceVehicleVaultRow = {
  trip_id: string;
  vehicle_id: string;
  vehicle_number: string | null;
  documents: VehicleDocuments | null;
};

export type ComplianceListTripFacts = {
  truckTypeByVehicleId: Record<string, string>;
  supplierNameByTripId: Record<string, string>;
};

function uniqueIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += COMPLIANCE_BATCH_MAX_TRIP_IDS) {
    chunks.push(ids.slice(i, i + COMPLIANCE_BATCH_MAX_TRIP_IDS));
  }
  return chunks;
}

/** Calls `rpc` once per ≤1000-id chunk, sequentially (one call for any real list). */
async function callBatchRpc<Row>(
  rpc: "get_compliance_list_trip_facts" | "get_compliance_vehicle_vault_for_trips",
  viewerOrgId: string,
  tripIds: readonly string[],
): Promise<Row[]> {
  const ids = uniqueIds(tripIds);
  if (!viewerOrgId || ids.length === 0) return [];
  const rows: Row[] = [];
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await supabase().rpc(rpc, { p_viewer_org_id: viewerOrgId, p_trip_ids: chunk });
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
}

export function fetchComplianceListTripFacts(
  viewerOrgId: string,
  tripIds: readonly string[],
): Promise<ComplianceListTripFactRow[]> {
  return callBatchRpc<ComplianceListTripFactRow>("get_compliance_list_trip_facts", viewerOrgId, tripIds);
}

export function fetchComplianceVehicleVaultForTrips(
  viewerOrgId: string,
  tripIds: readonly string[],
): Promise<ComplianceVehicleVaultRow[]> {
  return callBatchRpc<ComplianceVehicleVaultRow>("get_compliance_vehicle_vault_for_trips", viewerOrgId, tripIds);
}

/**
 * Pure: list card labels from the facts rows. Same rules the per-trip chains
 * had — asset trip without supplier → "Own fleet"; no supplier, an unreadable
 * supplier, or a supplier with no name → "—".
 */
export function buildComplianceListTripFacts(
  summaries: readonly ComplianceTripSummary[],
  rows: readonly ComplianceListTripFactRow[],
): ComplianceListTripFacts {
  const truckTypeByVehicleId: Record<string, string> = {};
  const factsByTripId = new Map<string, ComplianceListTripFactRow>();
  for (const row of rows) {
    factsByTripId.set(row.trip_id, row);
    const type = row.truck_type?.trim();
    if (row.vehicle_id && type && !truckTypeByVehicleId[row.vehicle_id]) {
      truckTypeByVehicleId[row.vehicle_id] = type;
    }
  }

  const supplierNameByTripId: Record<string, string> = {};
  for (const { trip } of summaries) {
    const supplierId = trip.supplier_id?.trim() ?? "";
    if (!supplierId) {
      supplierNameByTripId[trip.id] = getTripExecutionModel(trip) === "asset" ? "Own fleet" : "—";
      continue;
    }
    supplierNameByTripId[trip.id] = factsByTripId.get(trip.id)?.supplier_name?.trim() || "—";
  }
  return { truckTypeByVehicleId, supplierNameByTripId };
}
