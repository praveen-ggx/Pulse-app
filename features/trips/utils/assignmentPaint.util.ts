export type AssignmentPaint = {
  tripId: string;
  driverName: string;
  vehicleLabel: string;
  vehicleType?: string | null;
  vehicleId?: string | null;
  driverPhone?: string | null;
  /** Last wizard panel so Edit can reopen the same party. */
  focus?: "driver" | "vehicle";
  confirm: boolean;
};

let current: AssignmentPaint | null = null;
const listeners = new Set<(paint: AssignmentPaint | null) => void>();

function emit() {
  for (const listener of listeners) listener(current);
}

export function peekAssignmentPaint(): AssignmentPaint | null {
  return current;
}

export function publishAssignmentPaint(next: AssignmentPaint): void {
  current = next;
  emit();
}

export function dismissAssignmentConfirm(): void {
  if (!current?.confirm) return;
  current = { ...current, confirm: false };
  emit();
}

export function subscribeAssignmentPaint(
  listener: (paint: AssignmentPaint | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function liveAssignmentDriverName(
  tripId: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (tripId && current?.tripId === tripId && current.driverName.trim()) {
    return current.driverName.trim();
  }
  const next = (fallback ?? "").trim();
  return next || null;
}

export function applyAssignmentPaintToTrip<T extends {
  id?: string | null;
  driver_display_name?: string | null;
  vehicle_display_number?: string | null;
  vehicle_id?: string | null;
  driver_id?: string | null;
}>(trip: T): T {
  if (!current || !trip.id || current.tripId !== trip.id) return trip;
  return {
    ...trip,
    driver_display_name: current.driverName.trim() || trip.driver_display_name,
    vehicle_display_number: current.vehicleLabel.trim() || trip.vehicle_display_number,
    ...(current.vehicleId !== undefined ? { vehicle_id: current.vehicleId } : {}),
  };
}

export function liveAssignmentVehicleLabel(
  tripId: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (tripId && current?.tripId === tripId && current.vehicleLabel.trim()) {
    return current.vehicleLabel.trim();
  }
  const next = (fallback ?? "").trim();
  return next || null;
}
