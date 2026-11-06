import { findActiveDriverForVehicle } from "@/features/drivers/services/drivers.service";
import {
  findVehicleByPlate,
  getVehicleById,
  type VehicleRow,
} from "@/features/vehicles/services/vehicles.service";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";
import { normalizeVehicleNumberForMatch } from "@/lib/format";

export type AssignmentFleetSnapshot = {
  vehicleId: string | null;
  plate: string | null;
  type: string | null;
  capacity: string | null;
  make: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
  linkedDriverName: string | null;
  linkedDriverPhone: string | null;
  complianceNote: string | null;
  found: boolean;
};

const cache = new Map<string, AssignmentFleetSnapshot>();
const inflight = new Map<string, Promise<AssignmentFleetSnapshot>>();

function fleetKey(
  organizationId: string,
  vehicleId: string | null | undefined,
  plate: string | null | undefined,
): string {
  return `${organizationId.trim()}|${(vehicleId ?? "").trim()}|${normalizeVehicleNumberForMatch(plate ?? "")}`;
}

export function peekAssignmentFleet(
  organizationId: string | null | undefined,
  vehicleId: string | null | undefined,
  plate: string | null | undefined,
): AssignmentFleetSnapshot | null {
  const orgId = organizationId?.trim() || "";
  if (!orgId) return null;
  return (
    cache.get(fleetKey(orgId, vehicleId, plate)) ??
    (vehicleId ? cache.get(fleetKey(orgId, "", plate)) ?? null : null)
  );
}

function factsFromVehicle(vehicle: VehicleRow): Pick<
  AssignmentFleetSnapshot,
  "type" | "capacity" | "make" | "avatarUrl" | "avatarSeed" | "complianceNote" | "plate" | "vehicleId"
> {
  const type = vehicle.vehicle_type?.trim() || "";
  const body = vehicle.vehicle_body_type?.trim() || "";
  const size = vehicle.vehicle_size?.trim() || "";
  const typeLabel =
    [type || body, size && size.toLowerCase() !== type.toLowerCase() ? size : ""]
      .filter(Boolean)
      .join(" · ") || null;
  const make =
    [vehicle.vehicle_brand, vehicle.vehicle_model]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ") || null;
  return {
    vehicleId: vehicle.id,
    plate: vehicle.vehicle_number?.trim() || null,
    type: typeLabel,
    capacity: vehicle.capacity?.trim() || null,
    make,
    avatarUrl: vehicle.avatar_url?.trim() || null,
    avatarSeed: vehicle.avatar_seed?.trim() || null,
    complianceNote: vehicleComplianceNote(vehicle.documents),
  };
}

function vehicleComplianceNote(documents: VehicleDocuments | null | undefined): string | null {
  const rc = documents?.rc;
  const insurance = documents?.insurance;
  const missing = [!rc?.url && "RC", !insurance?.url && "Insurance"].filter(Boolean);
  if (missing.length > 0) {
    return `${missing.join(" and ")} verification is required before this vehicle is compliant.`;
  }
  const pending = [
    rc?.url && !rc.verifiedAt && "RC",
    insurance?.url && !insurance.verifiedAt && "Insurance",
  ].filter(Boolean);
  if (pending.length > 0) {
    return `${pending.join(" and ")} is on file and still needs compliance verification.`;
  }
  return null;
}

function emptySnapshot(plate: string | null): AssignmentFleetSnapshot {
  return {
    vehicleId: null,
    plate,
    type: null,
    capacity: null,
    make: null,
    avatarUrl: null,
    avatarSeed: null,
    linkedDriverName: null,
    linkedDriverPhone: null,
    complianceNote:
      "This plate is not in the fleet. RC and insurance verification is required before it is compliant.",
    found: false,
  };
}

/** One shared vehicle read for the manifest cards and the change dialog. */
export function bootstrapAssignmentFleet(input: {
  organizationId: string | null | undefined;
  vehicleId?: string | null;
  plate?: string | null;
}): Promise<AssignmentFleetSnapshot | null> {
  const orgId = input.organizationId?.trim() || "";
  const vehicleId = input.vehicleId?.trim() || "";
  const plate = input.plate?.trim() || "";
  if (!orgId || (!vehicleId && plate.length < 4)) return Promise.resolve(null);
  const key = fleetKey(orgId, vehicleId, plate);
  const hit = cache.get(key) ?? (vehicleId ? cache.get(fleetKey(orgId, "", plate)) : undefined);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const byId = vehicleId
      ? await getVehicleById(orgId, vehicleId)
      : { error: null, vehicle: null };
    if (byId.error) return null;
    const idPlate = byId.vehicle?.vehicle_number?.trim() || "";
    const plateMatches =
      !plate ||
      !idPlate ||
      normalizeVehicleNumberForMatch(idPlate) === normalizeVehicleNumberForMatch(plate);
    const loaded =
      byId.vehicle && plateMatches
        ? byId
        : plate.length >= 4
          ? await findVehicleByPlate(orgId, plate)
          : { error: null, vehicle: null };
    if ("error" in loaded && loaded.error) return null;
    if (!loaded.vehicle) {
      const missing = emptySnapshot(plate || null);
      cache.set(key, missing);
      cache.set(fleetKey(orgId, "", plate), missing);
      return missing;
    }
    const facts = factsFromVehicle(loaded.vehicle);
    const linked = await findActiveDriverForVehicle(loaded.vehicle.id);
    const snapshot: AssignmentFleetSnapshot = {
      ...facts,
      linkedDriverName: linked.name,
      linkedDriverPhone: linked.phone,
      found: true,
    };
    const aliasPlate = plate || facts.plate;
    cache.set(key, snapshot);
    cache.set(fleetKey(orgId, "", aliasPlate), snapshot);
    if (facts.vehicleId) {
      cache.set(fleetKey(orgId, facts.vehicleId, aliasPlate), snapshot);
    }
    return snapshot;
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, request);
  return request;
}
