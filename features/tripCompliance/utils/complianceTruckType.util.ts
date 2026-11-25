/**
 * Truck type with size, e.g. "Open Body Truck · 32 Ft MXL". Size is part of
 * price computation, so Finance needs both. Same format as
 * get_compliance_list_trip_facts (20271008118000).
 */
export function formatTruckTypeWithSize(
  type: string | null | undefined,
  size: string | null | undefined,
): string {
  return [type?.trim(), size?.trim()].filter(Boolean).join(" · ");
}
