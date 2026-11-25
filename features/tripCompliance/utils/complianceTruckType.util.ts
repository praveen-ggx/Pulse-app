/**
 * Truck type shown on Compliance / Advance Payment.
 *
 * Prefer the contract indent (and its lane) — that is what was booked and priced.
 * Fall back to assigned vehicle "type · size" only when no indent/lane type exists
 * (asset / ad-hoc trips). Same precedence as get_compliance_list_trip_facts
 * (20271125110000).
 */

/** Legacy vehicle master label, e.g. "Open Body Truck · 32 Ft MXL". */
export function formatTruckTypeWithSize(
  type: string | null | undefined,
  size: string | null | undefined,
): string {
  return [type?.trim(), size?.trim()].filter(Boolean).join(" · ");
}

/** Contract / indent label wins; vehicle master is fallback only. */
export function resolveComplianceTruckTypeLabel(args: {
  indentVehicleType?: string | null;
  laneVehicleType?: string | null;
  vehicleType?: string | null;
  vehicleSize?: string | null;
}): string {
  const indent = args.indentVehicleType?.trim() || "";
  if (indent) return indent;
  const lane = args.laneVehicleType?.trim() || "";
  if (lane) return lane;
  return formatTruckTypeWithSize(args.vehicleType, args.vehicleSize);
}
