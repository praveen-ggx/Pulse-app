/**
 * A typed plate on the trip is an assignment. Do not clear vehicle_id just
 * because that plate is not in the local garage list (partner / other-org truck).
 */

export function assignedVehiclePlate(input: {
  displayVehicleFromInput?: string | null;
  vehicleLabel?: string | null;
  vehicleDisplayNumber?: string | null;
  vehicleNumber?: string | null;
}): string {
  const raw =
    input.displayVehicleFromInput?.trim() ||
    input.vehicleLabel?.trim() ||
    input.vehicleDisplayNumber?.trim() ||
    input.vehicleNumber?.trim() ||
    "";
  const head = raw.split(/[·•]/)[0]?.trim() ?? "";
  if (
    !head ||
    head === "—" ||
    /^pending$/i.test(head) ||
    /^unassigned$/i.test(head)
  ) {
    return "";
  }
  return head;
}

export function tripAssignmentVehicleWrite(input: {
  resolvedVehicleId?: string | null;
  plate?: string | null;
  clearVehicle?: boolean;
}): { vehicle_id?: string | null; vehicle_display_number?: string } {
  const plate = (input.plate ?? "").trim();
  const resolved = (input.resolvedVehicleId ?? "").trim() || null;
  if (input.clearVehicle) {
    return {
      vehicle_id: null,
      ...(plate ? { vehicle_display_number: plate } : {}),
    };
  }
  const patch: { vehicle_id?: string | null; vehicle_display_number?: string } =
    {};
  if (plate) patch.vehicle_display_number = plate;
  if (resolved) patch.vehicle_id = resolved;
  return patch;
}
