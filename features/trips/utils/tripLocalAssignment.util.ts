/**
 * Trip-local assignment labels. Phone is the driver identity.
 * The app profile name is only a suggestion and must not be overwritten
 * by a trip-specific label.
 */

export function trimAssignmentLabel(value: string | null | undefined): string | null {
  const next = (value ?? "").trim();
  return next.length > 0 ? next : null;
}

export function tripLocalDriverDisplayName(
  value: string | null | undefined,
): string | null {
  const name = trimAssignmentLabel(value);
  if (!name || name.length < 2) return null;
  if (/^driver$/i.test(name)) return null;
  return name;
}

/** Profile name fills the field only when the dispatcher has not locked a local label. */
export function suggestedNameForPhoneLookup(args: {
  currentName: string;
  suggestedAppName: string | null;
  nameOwnedLocally: boolean;
}): string {
  if (args.nameOwnedLocally) return args.currentName;
  return trimAssignmentLabel(args.suggestedAppName) ?? args.currentName;
}

export function buildTripLocalAssignmentPatch(args: {
  driverDisplayName?: string | null;
  vehicleId?: string | null;
  vehicleDisplayNumber?: string | null;
}): {
  driver_display_name?: string | null;
  vehicle_id?: string | null;
  vehicle_display_number?: string | null;
} {
  const patch: {
    driver_display_name?: string | null;
    vehicle_id?: string | null;
    vehicle_display_number?: string | null;
  } = {};
  if (args.driverDisplayName !== undefined) {
    patch.driver_display_name = tripLocalDriverDisplayName(args.driverDisplayName);
  }
  if (args.vehicleId !== undefined) {
    patch.vehicle_id = args.vehicleId;
  }
  if (args.vehicleDisplayNumber !== undefined) {
    const plate = trimAssignmentLabel(args.vehicleDisplayNumber);
    patch.vehicle_display_number = plate;
  }
  return patch;
}
