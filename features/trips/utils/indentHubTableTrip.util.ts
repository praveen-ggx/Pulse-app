import { getIndentDisplayNumber, type IndentRow } from "@/features/indents/services/indents.service";
import type { TripRow } from "@/features/trips/services/trips.service";

/** Same hub table row as a trip, so indent-stage table matches Assigned / History. */
export function indentRowToHubTrip(indent: IndentRow): TripRow {
  const code = getIndentDisplayNumber(indent);
  return {
    id: indent.id,
    organization_id: indent.organization_id,
    trip_number: indent.indent_number ?? code,
    display_trip_id:
      indent.display_indent_id ?? indent.indent_operational_code ?? code,
    trip_operational_code: indent.indent_operational_code ?? null,
    indent_id: indent.id,
    source: "indent",
    pickup_area: indent.pickup_area ?? "",
    drop_location: indent.drop_location ?? "",
    distance: null,
    estimated_duration: null,
    client_id: indent.client_id ?? null,
    client_name: indent.client_name ?? "",
    supplier_id: indent.assigned_supplier_id ?? null,
    driver_id: null,
    vehicle_id: null,
    vehicle_display_number: indent.vehicle_type,
    client_price: Number(indent.client_price) || 0,
    supplier_rate:
      Number(indent.assigned_supplier_rate ?? indent.supplier_target) || 0,
    margin: 0,
    platform_fee: 0,
    driver_commission: 0,
    is_guaranteed: false,
    payment_status: "pending",
    amount_paid: 0,
    status: indent.status,
    pickup_date: indent.pickup_date,
    started_at: null,
    completed_at: null,
    load_type: indent.load_type,
    notes: null,
    created_at: indent.created_at,
    updated_at: indent.created_at,
  } as TripRow;
}
