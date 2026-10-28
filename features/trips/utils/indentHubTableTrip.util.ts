import { getIndentDisplayNumber, type IndentRow } from "@/features/indents/services/indents.service";
import { indentHubLifecycleStatus } from "@/features/trips/utils/indentHubCardPresentation";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatINRChip } from "@/lib/format";

function firstPlace(value: string | null | undefined): string {
  return String(value ?? "").split(",")[0]?.trim() || String(value ?? "").trim();
}

export function indentHubLaneLabel(
  pickup: string | null | undefined,
  drop: string | null | undefined,
): { short: string; full: string } {
  const fullPickup = String(pickup ?? "").trim();
  const fullDrop = String(drop ?? "").trim();
  const full = [fullPickup, fullDrop].filter(Boolean).join(" → ") || "—";
  const short = [firstPlace(fullPickup), firstPlace(fullDrop)].filter(Boolean).join(" → ") || "—";
  return { short, full };
}

export function indentHubTableMoney(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return formatINRChip(n);
}

export function indentHubTableMargin(
  sales: number | null | undefined,
  cost: number | null | undefined,
): { amount: string; ofSales: string } {
  const sale = Number(sales);
  const spend = Number(cost);
  if (!Number.isFinite(sale) || sale <= 0) {
    return { amount: "—", ofSales: "—" };
  }
  const margin = sale - (Number.isFinite(spend) ? spend : 0);
  const pct = Math.round((margin / sale) * 100);
  return {
    amount: formatINRChip(Math.abs(margin)),
    ofSales: `${pct}% of sales`,
  };
}

export function indentHubTableDate(iso: string | null | undefined): string {
  const day = String(iso ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "—";
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function indentHubTableStatus(status: string | null | undefined, bidCount: number): string {
  return indentHubLifecycleStatus(status, bidCount);
}

/** Same hub table row as a trip, so indent-stage table matches Assigned / History. */
export function indentRowToHubTrip(indent: IndentRow): TripRow {
  const code = getIndentDisplayNumber(indent);
  const sales = Number(indent.client_price) || 0;
  const cost = Number(indent.assigned_supplier_rate ?? indent.supplier_target) || 0;
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
    client_price: sales,
    supplier_rate: cost,
    margin: sales - cost,
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
