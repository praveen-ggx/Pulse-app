import { normalizeVehicleNumberForMatch } from "@/lib/format";

type DriverSearchFields = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type VehicleSearchFields = {
  vehicle_number?: string | null;
  vehicle_type?: string | null;
  vehicle_body_type?: string | null;
};

function textIncludes(value: string | null | undefined, query: string): boolean {
  return (value ?? "").toLowerCase().includes(query);
}

/** Deploy-load driver picker: match name, email, or phone (digits only, so "98765 4" works). */
export function filterDriversByAllocationQuery<T extends DriverSearchFields>(
  drivers: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...drivers];
  const qDigits = q.replace(/\D/g, "");
  return drivers.filter(
    (driver) =>
      textIncludes(driver.name, q) ||
      textIncludes(driver.email, q) ||
      (qDigits.length > 0 &&
        (driver.phone ?? "").replace(/\D/g, "").includes(qDigits)),
  );
}

/** Deploy-load vehicle picker: match plate ignoring spaces ("TN 17" finds TN17AS2202), or type. */
export function filterVehiclesByAllocationQuery<T extends VehicleSearchFields>(
  vehicles: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...vehicles];
  const qPlate = normalizeVehicleNumberForMatch(q);
  return vehicles.filter(
    (vehicle) =>
      (qPlate.length > 0 &&
        normalizeVehicleNumberForMatch(vehicle.vehicle_number).includes(qPlate)) ||
      textIncludes(vehicle.vehicle_type, q) ||
      textIncludes(vehicle.vehicle_body_type, q),
  );
}
