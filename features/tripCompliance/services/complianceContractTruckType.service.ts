/**
 * Resolve the truck type Finance / Compliance should show for one trip:
 * indent → lane → assigned vehicle type · size.
 */
import { resolveComplianceTruckTypeLabel } from "@/features/tripCompliance/utils/complianceTruckType.util";
import { getVehicleById, getVehicleForTripViewer } from "@/features/vehicles/services/vehicles.service";
import { supabase } from "@/lib/supabase";

export async function resolveTripContractTruckType(args: {
  orgId: string;
  tripId: string;
  indentId?: string | null;
  sourceIndentId?: string | null;
  vehicleId?: string | null;
}): Promise<string> {
  const indentId = (args.indentId ?? args.sourceIndentId ?? "").trim();
  let indentVehicleType: string | null = null;
  let laneVehicleType: string | null = null;

  if (indentId) {
    const { data: indent } = await supabase()
      .from("indents")
      .select("vehicle_type, lane_id")
      .eq("id", indentId)
      .maybeSingle();
    indentVehicleType = (indent?.vehicle_type as string | null | undefined) ?? null;
    const laneId = (indent?.lane_id as string | null | undefined)?.trim();
    if (laneId && !(indentVehicleType ?? "").trim()) {
      const { data: lane } = await supabase()
        .from("client_lane_rates")
        .select("vehicle_type")
        .eq("id", laneId)
        .maybeSingle();
      laneVehicleType = (lane?.vehicle_type as string | null | undefined) ?? null;
    }
  }

  const vehicleId = (args.vehicleId ?? "").trim();
  let vehicleType: string | null = null;
  let vehicleSize: string | null = null;
  if (vehicleId && args.orgId) {
    const owned = await getVehicleById(args.orgId, vehicleId);
    vehicleType = owned.vehicle?.vehicle_type ?? null;
    vehicleSize = owned.vehicle?.vehicle_size ?? null;
    if (!(vehicleType ?? "").trim() && !(vehicleSize ?? "").trim()) {
      const shared = await getVehicleForTripViewer(vehicleId, args.tripId, args.orgId);
      vehicleType = shared.vehicle?.vehicle_type ?? null;
      vehicleSize = shared.vehicle?.vehicle_size ?? null;
    }
  }

  return resolveComplianceTruckTypeLabel({
    indentVehicleType,
    laneVehicleType,
    vehicleType,
    vehicleSize,
  });
}
