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
import { indentCancelReasonLabel } from "@/features/indents/utils/indentCancelReason.util";
import { regionForPlace } from "@/features/tripCompliance/utils/complianceVerifiedExport.util";
import { INTEGRATED_TRIP_CANCEL_REASONS } from "@/features/trips/utils/integratedTripCancel.util";
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

/**
 * Business Sales Report column order. Prices stay in this order for MIR;
 * they are not dropped by role.
 */
export const TRIP_INDENT_REPORT_COLUMNS = [
  { key: "serial", label: "S.No" },
  { key: "customerName", label: "Customer (Client Name)" },
  { key: "region", label: "Region" },
  { key: "commercialType", label: "Adhoc / Contract" },
  { key: "source", label: "Source" },
  { key: "destination", label: "Destination" },
  { key: "supplierName", label: "Supplier Name" },
  { key: "truckNumber", label: "Truck Number" },
  { key: "truckType", label: "Truck Type" },
  { key: "ton", label: "Ton" },
  { key: "driverName", label: "Driver Name" },
  { key: "driverPhone", label: "Driver Number" },
  { key: "indentDate", label: "Indent Date" },
  { key: "awardedDate", label: "Indent Awarded Date" },
  { key: "customerPrice", label: "Customer Price" },
  { key: "supplierPrice", label: "Supplier Price" },
  { key: "status", label: "Status" },
  { key: "indentId", label: "Indent ID" },
  { key: "pulseId", label: "Pulse ID" },
  { key: "tripId", label: "Trip ID" },
  { key: "createdBy", label: "Created By" },
] as const;

/** The MIR sheet always includes Customer Price and Supplier Price. */
export function tripIndentReportColumnsForAccess(_includeCosts?: boolean) {
  return [...TRIP_INDENT_REPORT_COLUMNS];
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
  /** Vehicle type, capacity, and registration by vehicle id. */
  vehicleById?: Record<
    string,
    { vehicleType: string; capacity: string; vehicleNumber?: string }
  >;
  /** Lane stored on the trip row. Present means the trip was created as Contract. */
  laneIdByTripId?: Record<string, string>;
  /** Lane stored on the indent row. Present means the indent was created as Contract. */
  laneIdByIndentId?: Record<string, string>;
  /** Creator display name by auth user id. */
  creatorNameByUserId?: Record<string, string>;
  /** Organization / supplier display name by org id (indent award). */
  orgNameById?: Record<string, string>;
  /** Driver phone by trip id. */
  driverPhoneByTripId?: Record<string, string>;
  /** Driver name by drivers.id when the trip has no display name. */
  driverNameByDriverId?: Record<string, string>;
  /** Supplier name by suppliers.id when the trip row has no supplier name. */
  supplierNameBySupplierId?: Record<string, string>;
  /** Cancel category stored on the trip when the trip list omitted it. */
  tripCancelByTripId?: Record<string, { reason: string; note: string }>;
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

/**
 * Adhoc / Contract from the lane saved at creation.
 * A stored lane_id is Contract. No lane is Adhoc.
 * Marketplace circulation is not a category and must not override the lane.
 */
export function resolveIndentType(input: {
  laneId?: string | null;
  circulationTarget?: string | null;
}): "Contract" | "Adhoc" {
  void input.circulationTarget;
  return blank(input.laneId).length > 0 ? "Contract" : "Adhoc";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function displayCode(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = blank(value);
    if (text && text !== "—" && !UUID_RE.test(text)) return text;
  }
  return "";
}

/**
 * Indent ID is the indent's own display number (`IND…`).
 * Pulse ID is that indent's operational code (`…IND…`), never the trip code.
 * Trip ID is the trip's own display number (`TRP…`), blank until a trip exists.
 * A value already used by an earlier column is left blank so the three
 * columns never repeat the same ID.
 */
export function reportIdentityIds(input: {
  indent?: {
    display_indent_id?: string | null;
    indent_number?: string | null;
    indent_operational_code?: string | null;
    indent_code?: string | null;
  } | null;
  trip?: {
    display_trip_id?: string | null;
    trip_number?: string | null;
  } | null;
}): { indentId: string; pulseId: string; tripId: string } {
  const indentId = displayCode(input.indent?.display_indent_id, input.indent?.indent_number);
  const pulseCandidate = displayCode(
    input.indent?.indent_operational_code,
    input.indent?.indent_code,
  );
  const tripId = input.trip
    ? displayCode(input.trip.display_trip_id, input.trip.trip_number)
    : "";
  const pulseId = pulseCandidate && pulseCandidate !== indentId ? pulseCandidate : "";
  return {
    indentId,
    pulseId,
    tripId: tripId && tripId !== indentId && tripId !== pulseId ? tripId : "",
  };
}

/** Calendar day in Asia/Kolkata, matching the hub date filter. */
export function formatReportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const ASSIGNED_TRIP_STATUSES = new Set([
  "assigned",
  "in_transit",
  "in_progress",
  "picked_up",
  "completed",
  "delivered",
  "started",
  "at_pickup",
  "at_drop",
  "dispatched",
  "transit",
  "unloading",
]);

function cancellationCategory(
  raw: string | null | undefined,
  note?: string | null,
): string {
  const fromIndent = indentCancelReasonLabel(raw);
  if (fromIndent) return fromIndent;
  const id = blank(raw);
  const tripReason = INTEGRATED_TRIP_CANCEL_REASONS.find((reason) => reason.id === id);
  if (!tripReason) return "";
  if (tripReason.id === "other") return blank(note) || tripReason.label;
  return tripReason.label;
}

/**
 * Current workflow stage for the sales sheet.
 * Created, Awarded, Assigned, or the stored cancel / expiry category.
 */
export function salesReportStatus(input: {
  indentStatus?: string | null;
  tripStatus?: string | null;
  indentCancelReason?: string | null;
  tripCancelReason?: string | null;
  tripCancelNote?: string | null;
  hasTrip: boolean;
  hasAssignment: boolean;
}): string {
  const indentStatus = blank(input.indentStatus).toLowerCase();
  const tripStatus = blank(input.tripStatus).toLowerCase();
  if (indentStatus === "expired") {
    return cancellationCategory(input.indentCancelReason) || "Indent expired";
  }
  if (indentStatus === "cancelled" || tripStatus === "cancelled") {
    return (
      cancellationCategory(input.indentCancelReason) ||
      cancellationCategory(input.tripCancelReason, input.tripCancelNote) ||
      "Cancelled"
    );
  }
  if (input.hasAssignment || ASSIGNED_TRIP_STATUSES.has(tripStatus)) return "Assigned";
  if (input.hasTrip || indentStatus === "awarded") return "Awarded";
  return "Created";
}

function storedLaneId(input: {
  tripId?: string;
  tripLaneId?: string | null;
  indentId?: string;
  indentLaneId?: string | null;
  enrichment: TripIndentReportEnrichment;
}): string {
  return (
    (input.tripId ? blank(input.enrichment.laneIdByTripId?.[input.tripId]) : "") ||
    blank(input.tripLaneId) ||
    (input.indentId ? blank(input.enrichment.laneIdByIndentId?.[input.indentId]) : "") ||
    blank(input.indentLaneId)
  );
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
  // Created By is the indent's original creator. The trip creator is the
  // person who awarded or assigned it, and must not replace that name.
  const creatorId = blank(indent?.created_by_user_id);
  const awardedIso = indentId
    ? enrichment.confirmedAtByIndentId?.[indentId] ?? ""
    : "";
  const laneId = storedLaneId({
    tripId: trip.id,
    tripLaneId: (trip as { lane_id?: string | null }).lane_id,
    indentId,
    indentLaneId: indent?.lane_id,
    enrichment,
  });
  const storedCancel = enrichment.tripCancelByTripId?.[trip.id];
  const hasAssignment = Boolean(
    blank(trip.driver_id) ||
      blank(trip.vehicle_id) ||
      blank(trip.driver_display_name) ||
      blank(trip.vehicle_display_number) ||
      blank(vehicle?.vehicleNumber),
  );
  const source = blank(trip.pickup_area) || blank(indent?.pickup_area);

  return {
    serial: 0,
    customerName: blank(trip.client_name) || blank(indent?.client_name),
    region: regionForPlace(source),
    commercialType: resolveIndentType({ laneId }),
    source,
    destination:
      blank(trip.drop_location) || blank(trip.drop_area) || blank(indent?.drop_location),
    supplierName:
      blank(meta?.displaySupplierName) ||
      blank(trip.supplier_name) ||
      blank(enrichment.supplierNameBySupplierId?.[blank(trip.supplier_id)]) ||
      blank(enrichment.orgNameById?.[blank(indent?.assigned_supplier_id)]),
    truckNumber: blank(trip.vehicle_display_number) || blank(vehicle?.vehicleNumber),
    truckType: blank(vehicle?.vehicleType) || blank(indent?.vehicle_type),
    ton: formatTonnageCapacity({
      vehicleCapacity: vehicle?.capacity,
      loadTons: trip.load_tons,
      weightKg: indent?.weight,
    }),
    driverName:
      blank(meta?.displayDriverName) ||
      blank(trip.driver_display_name) ||
      blank(enrichment.driverNameByDriverId?.[blank(trip.driver_id)]),
    driverPhone: blank(enrichment.driverPhoneByTripId?.[trip.id]),
    indentDate: formatReportDate(indent?.created_at),
    awardedDate: formatReportDate(awardedIso || null),
    customerPrice: formatMoney(trip.client_price ?? indent?.client_price),
    supplierPrice: formatMoney(
      trip.supplier_rate ?? indent?.assigned_supplier_rate,
    ),
    status: salesReportStatus({
      indentStatus: indent?.status,
      tripStatus: trip.status,
      indentCancelReason: indent?.cancel_reason,
      tripCancelReason: storedCancel?.reason || trip.cancel_reason,
      tripCancelNote: storedCancel?.note || trip.cancel_reason_note,
      hasTrip: true,
      hasAssignment,
    }),
    ...reportIdentityIds({ indent, trip }),
    createdBy: creatorId ? blank(enrichment.creatorNameByUserId?.[creatorId]) : "",
  };
}

export function buildIndentReportRow(
  indent: IndentRow,
  enrichment: TripIndentReportEnrichment = {},
): TripIndentReportRow {
  const creatorId = blank(indent.created_by_user_id);
  const awardedIso = enrichment.confirmedAtByIndentId?.[indent.id] ?? "";
  const laneId = storedLaneId({
    indentId: indent.id,
    indentLaneId: indent.lane_id,
    enrichment,
  });
  const source = blank(indent.pickup_area);
  return {
    serial: 0,
    customerName: blank(indent.client_name),
    region: regionForPlace(source),
    commercialType: resolveIndentType({ laneId }),
    source,
    destination: blank(indent.drop_location),
    supplierName: blank(
      enrichment.orgNameById?.[blank(indent.assigned_supplier_id)] ?? "",
    ),
    truckNumber: "",
    truckType: blank(indent.vehicle_type),
    ton: formatTonnageCapacity({ weightKg: indent.weight }),
    driverName: "",
    driverPhone: "",
    indentDate: formatReportDate(indent.created_at),
    awardedDate: formatReportDate(awardedIso || null),
    customerPrice: formatMoney(indent.client_price),
    supplierPrice: formatMoney(indent.assigned_supplier_rate),
    status: salesReportStatus({
      indentStatus: indent.status,
      indentCancelReason: indent.cancel_reason,
      hasTrip: false,
      hasAssignment: false,
    }),
    ...reportIdentityIds({ indent, trip: null }),
    createdBy: creatorId ? blank(enrichment.creatorNameByUserId?.[creatorId]) : "",
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
  const indentById: Record<string, IndentRow> = { ...(enrichment.indentById ?? {}) };
  for (const indent of indents) {
    if (indent.id && !indentById[indent.id]) indentById[indent.id] = indent;
  }
  const merged: TripIndentReportEnrichment = { ...enrichment, indentById };
  const covered = indentIdsCoveredByTrips(trips);
  const rows: TripIndentReportRow[] = trips.map((t) => buildTripReportRow(t, merged));
  for (const indent of indents) {
    if (orgId && blank(indent.organization_id) !== blank(orgId)) continue;
    if (covered.has(indent.id)) continue;
    rows.push(buildIndentReportRow(indent, merged));
  }
  return rows.map((row, index) => ({ ...row, serial: index + 1 }));
}

export function tripIndentReportFileName(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `Pulse_Trip_Report_${y}-${m}-${d}.xlsx`;
}
