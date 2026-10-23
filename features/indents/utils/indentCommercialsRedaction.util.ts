/**
 * Ground Ops see a load's route, cargo and client, never its money: client
 * rate, supplier target, margin, stop charges, vendor rate or bids. The indent
 * screen strips those values once here, at the data boundary, so no component
 * below it can render them by accident (stop charges render only when > 0).
 */
import type { RouteExtraStopSummary } from "@/features/trips/utils/routeExtraStops.util";

export function redactExtraStopSummary(summary: RouteExtraStopSummary): RouteExtraStopSummary {
  return { count: summary.count, clientCharge: 0, supplierCharge: 0 };
}

export function redactExtraStopRows<T extends { client_charge: number; supplier_charge: number }>(
  rows: readonly T[],
): T[] {
  return rows.map((row) => ({ ...row, client_charge: 0, supplier_charge: 0 }));
}
