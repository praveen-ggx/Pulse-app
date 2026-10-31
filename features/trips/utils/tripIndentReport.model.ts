/**
 * Sales Trip & Indent Excel report — column contract, row uniqueness, and field mapping.
 *
 * Export page: Trip Operations hub (`TripsScreen` / Trips hub toolbar), next to Add Trip.
 * Sales members get this sheet. TripOps-only members get `tripOpsReport` instead.
 *
 * Row uniqueness:
 * - One row per trip in the org catalog.
 * - One row per org-owned indent that has no linked trip yet
 *   (`trips.indent_id` / `trips.source_indent_id`).
 * - When an indent becomes a trip, only the trip row remains (no duplicate indent row).
 */

import type { IndentRow } from "@/features/indents/services/indents.service";
import type { TripRow } from "@/features/trips/services/trips.service";

/** Who is downloading — Sales → this report; TripOps → classic ops sheet. */
export type TripIndentReportAudience = "sales" | "tripops";

/**
 * Prefer the Sales indent report when the member has the sales domain.
 * TripOps-only members download the classic ops sheet (`tripOpsReport`).
 */
export function resolveTripIndentReportAudience(access: {
  sales: boolean;
  tripops: boolean;
}): TripIndentReportAudience {
  if (access.sales) return "sales";
  if (access.tripops) return "tripops";
  return "tripops";
}

export const TRIP_INDENT_REPORT_COLUMNS = [
  { key: "customerName", label: "Customer Name" },
  { key: "indentType", label: "Indent Type" },
  { key: "source", label: "Source" },
  { key: "destination", label: "Destination" },
  { key: "supplierName", label: "Supplier Name" },
  { key: "truckNumber", label: "Truck Number" },
  { key: "truckType", label: "Truck Type" },
  { key: "tonnageCapacity", label: "Tonnage / Vehicle Capacity" },
  { key: "driverName", label: "Driver Name" },
  { key: "driverPhone", label: "Driver Phone Number" },
  { key: "indentCreatedAt", label: "Indent Created Date & Time" },
  { key: "confirmedAt", label: "Confirmed Date & Time" },
  { key: "clientCost", label: "Client Cost" },
  { key: "supplierCost", label: "Supplier Cost" },
  { key: "status", label: "Status" },
  { key: "createdBy", label: "Created By" },
  { key: "indentId", label: "Indent ID" },
  { key: "pulseId", label: "Pulse ID" },
  { key: "tripId", label: "Trip ID" },
] as const;

/** Money columns — finance members only. */
const COST_COLUMN_KEYS = new Set<string>(["clientCost", "supplierCost"]);

/** Drop Client/Supplier Cost unless the member has finance access. */
export function tripIndentReportColumnsForAccess(includeCosts: boolean) {
  if (includeCosts) return [...TRIP_INDENT_REPORT_COLUMNS];
  return TRIP_INDENT_REPORT_COLUMNS.filter((c) => !COST_COLUMN_KEYS.has(c.key));
}

export type TripIndentReportColumnKey =
  (typeof TRIP_INDENT_REPORT_COLUMNS)[number]["key"];

export type TripIndentReportRow = Record<TripIndentReportColumnKey, string | number>;

export type TripIndentReportPartyMeta = {
  displaySupplierName?: string | null;
  displayDriverName?: string | null;
};

export type TripIndentReportEnrichment = {
  /** Accepted market bid timestamp by indent id. */
  confirmedAtByIndentId?: Record<string, string>;
  /** Vehicle type / capacity by vehicle id. */
  vehicleById?: Record<string, { vehicleType: string; capacity: string }>;
  /** Creator display name by auth user id. */
  creatorNameByUserId?: Record<string, string>;
  /** Organization / supplier display name by org id (indent award). */
  orgNameById?: Record<string, string>;
  /** Driver phone by trip id. */
  driverPhoneByTripId?: Record<string, string>;
  /** Hub party labels by trip id. */
  partyMetaByTripId?: Map<string, TripIndentReportPartyMeta> | Record<string, TripIndentReportPartyMeta>;
  /** Indent created_at / codes by indent id (when trip rows need indent create time). */
  indentById?: Record<string, IndentRow>;
  /** Stage / status label for a trip (hub stage). */
  stageLabelForTrip?: (trip: TripRow) => string;
};

function blank(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function partyMetaFor(
  enrichment: TripIndentReportEnrichment | undefined,
  tripId: string,
): TripIndentReportPartyMeta | undefined {
  const map = enrichment?.partyMetaByTripId;
  if (!map) return undefined;
  if (map instanceof Map) return map.get(tripId);
  return map[tripId];
}

/** ADHOC / Contract / Spot from lane + circulation (existing app meanings). */
export function resolveIndentType(input: {
  laneId?: string | null;
  circulationTarget?: string | null;
}): string {
  if (blank(input.laneId).length > 0) return "Contract";
  const circ = blank(input.circulationTarget).toLowerCase();
  if (circ === "marketplace" || circ === "both") return "Spot";
  return "ADHOC";
}

/** Hub dates use Asia/Kolkata — keep Excel timestamps on the same calendar. */
export function formatReportDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Human Indent ID for the report — operational / display codes only.
 * Never the UUID.
 */
export function resolveIndentId(input: {
  tripIndentNumber?: string | null;
  tripSourceIndentCode?: string | null;
  indentNumber?: string | null;
  indentCode?: string | null;
  indentOperationalCode?: string | null;
}): string {
  return (
    blank(input.tripIndentNumber) ||
    blank(input.tripSourceIndentCode) ||
    blank(input.indentOperationalCode) ||
    blank(input.indentCode) ||
    blank(input.indentNumber)
  );
}

/** Indent weight is stored in kg; trip load_tons is MT. Prefer capacity string. */
export function formatTonnageCapacity(input: {
  vehicleCapacity?: string | null;
  loadTons?: number | null;
  weightKg?: number | null;
}): string {
  const cap = blank(input.vehicleCapacity);
  if (cap) return cap;
  const tons = Number(input.loadTons);
  if (Number.isFinite(tons) && tons > 0) return `${tons} MT`;
  const kg = Number(input.weightKg);
  if (Number.isFinite(kg) && kg > 0) {
    const mt = kg / 1000;
    return `${Number.isInteger(mt) ? mt : Number(mt.toFixed(3))} MT`;
  }
  return "";
}

export function formatMoney(amount: number | null | undefined): string | number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return n;
}

/**
 * Enterprise operational identity (Pulse ID) — not the human Trip ID / IND###.
 * Trip: `trip_operational_code` then `trip_code`.
 * Indent: `indent_operational_code` then `indent_code`.
 * Never falls back to display_trip_id / trip_number / indent_number.
 */
export function resolvePulseId(input: {
  tripOperationalCode?: string | null;
  tripCode?: string | null;
  indentOperationalCode?: string | null;
  indentCode?: string | null;
}): string {
  return (
    blank(input.tripOperationalCode) ||
    blank(input.tripCode) ||
    blank(input.indentOperationalCode) ||
    blank(input.indentCode)
  );
}

export function indentLifecycleStatus(status: string | null | undefined): string {
  const s = blank(status).toLowerCase();
  if (!s) return "Pending";
  if (s === "awarded") return "Awarded";
  if (s === "completed") return "Completed";
  if (s === "cancelled") return "Cancelled";
  if (s === "expired") return "Expired";
  if (s === "draft") return "Pending";
  if (s === "broadcast" || s === "quoted" || s === "pending" || s === "open") return "Pending";
  return blank(status);
}

/** Indent ids already represented by a trip row. */
export function indentIdsCoveredByTrips(trips: readonly TripRow[]): Set<string> {
  const ids = new Set<string>();
  for (const trip of trips) {
    const a = blank(trip.indent_id);
    const b = blank(trip.source_indent_id);
    if (a) ids.add(a);
    if (b) ids.add(b);
  }
  return ids;
}

export function buildTripReportRow(
  trip: TripRow,
  enrichment: TripIndentReportEnrichment = {},
): TripIndentReportRow {
  const indentId = blank(trip.indent_id) || blank(trip.source_indent_id);
  const indent = indentId ? enrichment.indentById?.[indentId] : undefined;
  const meta = partyMetaFor(enrichment, trip.id);
  const vehicleId = blank(trip.vehicle_id);
  const vehicle = vehicleId ? enrichment.vehicleById?.[vehicleId] : undefined;
  const creatorId = blank(trip.created_by_user_id) || blank(trip.created_by);
  const confirmedIso =
    (indentId ? enrichment.confirmedAtByIndentId?.[indentId] : undefined) ||
    trip.converted_from_indent_at ||
    "";

  return {
    customerName: blank(trip.client_name),
    indentType: resolveIndentType({
      laneId: (trip as { lane_id?: string | null }).lane_id ?? indent?.lane_id,
      circulationTarget: indent?.circulation_target,
    }),
    source: blank(trip.pickup_area),
    destination: blank(trip.drop_location) || blank(trip.drop_area),
    supplierName:
      blank(meta?.displaySupplierName) || blank(trip.supplier_name),
    truckNumber: blank(trip.vehicle_display_number),
    truckType: blank(vehicle?.vehicleType) || blank(indent?.vehicle_type),
    tonnageCapacity: formatTonnageCapacity({
      vehicleCapacity: vehicle?.capacity,
      loadTons: trip.load_tons,
      weightKg: indent?.weight,
    }),
    driverName:
      blank(meta?.displayDriverName) || blank(trip.driver_display_name),
    driverPhone: blank(enrichment.driverPhoneByTripId?.[trip.id]),
    indentCreatedAt: formatReportDateTime(indent?.created_at ?? trip.created_at),
    confirmedAt: formatReportDateTime(confirmedIso || null),
    clientCost: formatMoney(trip.client_price),
    supplierCost: formatMoney(trip.supplier_rate),
    status: enrichment.stageLabelForTrip?.(trip) || blank(trip.status) || "",
    createdBy: creatorId ? blank(enrichment.creatorNameByUserId?.[creatorId]) : "",
    indentId: resolveIndentId({
      tripIndentNumber: trip.indent_number,
      tripSourceIndentCode: trip.source_indent_code,
      indentNumber: indent?.indent_number,
      indentCode: indent?.indent_code,
      indentOperationalCode: indent?.indent_operational_code,
    }),
    pulseId: resolvePulseId({
      tripOperationalCode: trip.trip_operational_code,
      tripCode: trip.trip_code,
      indentOperationalCode: indent?.indent_operational_code,
      indentCode: indent?.indent_code,
    }),
    tripId: blank(trip.display_trip_id) || blank(trip.trip_number) || blank(trip.id),
  };
}

export function buildIndentReportRow(
  indent: IndentRow,
  enrichment: TripIndentReportEnrichment = {},
): TripIndentReportRow {
  const creatorId = blank(indent.created_by_user_id);
  const confirmedIso = enrichment.confirmedAtByIndentId?.[indent.id] ?? "";
  return {
    customerName: blank(indent.client_name),
    indentType: resolveIndentType({
      laneId: indent.lane_id,
      circulationTarget: indent.circulation_target,
    }),
    source: blank(indent.pickup_area),
    destination: blank(indent.drop_location),
    supplierName: blank(
      enrichment.orgNameById?.[blank(indent.assigned_supplier_id)] ?? "",
    ),
    truckNumber: "",
    truckType: blank(indent.vehicle_type),
    tonnageCapacity: formatTonnageCapacity({ weightKg: indent.weight }),
    driverName: "",
    driverPhone: "",
    indentCreatedAt: formatReportDateTime(indent.created_at),
    confirmedAt: formatReportDateTime(confirmedIso || null),
    clientCost: formatMoney(indent.client_price),
    supplierCost: formatMoney(
      indent.assigned_supplier_rate ?? indent.supplier_target,
    ),
    status: indentLifecycleStatus(indent.status),
    createdBy: creatorId ? blank(enrichment.creatorNameByUserId?.[creatorId]) : "",
    indentId: resolveIndentId({
      indentNumber: indent.indent_number,
      indentCode: indent.indent_code,
      indentOperationalCode: indent.indent_operational_code,
    }),
    pulseId: resolvePulseId({
      indentOperationalCode: indent.indent_operational_code,
      indentCode: indent.indent_code,
    }),
    tripId: "",
  };
}

/**
 * Deduped report rows: every trip, plus org-owned indents with no trip yet.
 * Optional `orgId` filters indent ownership.
 */
export function buildTripIndentReportRows(
  trips: readonly TripRow[],
  indents: readonly IndentRow[],
  enrichment: TripIndentReportEnrichment = {},
  orgId?: string | null,
): TripIndentReportRow[] {
  const covered = indentIdsCoveredByTrips(trips);
  const rows: TripIndentReportRow[] = trips.map((t) => buildTripReportRow(t, enrichment));
  for (const indent of indents) {
    if (orgId && blank(indent.organization_id) !== blank(orgId)) continue;
    if (covered.has(indent.id)) continue;
    rows.push(buildIndentReportRow(indent, enrichment));
  }
  return rows;
}

export function tripIndentReportFileName(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `Pulse_Trip_Report_${y}-${m}-${d}.xlsx`;
}
