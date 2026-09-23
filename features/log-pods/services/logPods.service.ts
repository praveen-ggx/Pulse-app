/**
 * Log incoming PODs — Supabase operations aligned with cashflow LogIncomingPodsPage.
 * Same DB as pulse-unified-base; RLS applies.
 */
import {
    getTripsWhereOrgIsClient,
    getTripsWhereOrgIsSupplier,
    getShipperDisplayNamesForSupplierTrips,
    supplierRowToTripRow,
    type TripRow,
} from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import { supabase } from "@/lib/supabase";
import {
  loadLrPodIndexByTripIds,
  markTripHardCopyPodReceived,
  receivedLrNumbersForTrip,
  runWithConcurrencyLimit,
  tripPodIsReceived,
  type TripLrPodIndex,
} from "@/features/trips/services/tripDocumentLrPod.service";
import type {
  LogIncomingPodsListTab,
  LogPodsPartyOption,
  LogPodsSupplierOption,
} from "@/features/log-pods/utils/logPodsListFilter.util";

export type { LogIncomingPodsListTab, LogPodsPartyOption, LogPodsSupplierOption };

export interface LogPodsTripView {
  /** User-facing trip id. */
  id: string;
  internal_id: string;
  client: string;
  supplier_id: string;
  supplier_name: string;
  driver_id: string;
  driver_name: string;
  lane: "asset" | "market";
  from: string;
  to: string;
  amount: number | null;
  status: string;
  lrNumbers: string[];
  receivedLRs: string[];
  date: string;
  hardCopyReceived: boolean;
}

export type CourierPartnerRow = {
  label: string;
  value: string;
  category: string;
  active?: boolean | null;
  is_custom?: boolean | null;
};

type TripRecord = Pick<
  TripRow,
  | "id"
  | "organization_id"
  | "trip_operational_code"
  | "trip_code"
  | "display_trip_id"
  | "trip_number"
  | "client_name"
  | "client_price"
  | "supplier_id"
  | "driver_id"
  | "status"
  | "pickup_date"
  | "pickup_area"
  | "drop_location"
  | "notes"
  | "created_at"
  | "booking_ref"
> & {
  // Live trips columns used for POD list (cashflow lr_no / pod_status are retired).
  pod_received_at?: string | null;
  pod_required?: boolean | null;
  driver_display_name?: string | null;
  trip_payout_mode?: string | null;
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Public trip id for list rows (operational code, else uuid). */
export function getTripStringId(row: TripRecord): string {
  const r = row as {
    trip_operational_code?: string;
    trip_code?: string;
    trip_id?: string;
    display_trip_id?: string;
    trip_number?: string;
    id?: string;
  };
  const operationalRef = getTripOperationalDisplay({
    trip_operational_code: r.trip_operational_code ?? null,
    trip_code: r.trip_code ?? null,
    display_trip_id: r.display_trip_id ?? null,
    trip_number: r.trip_number ?? null,
  });
  return str(operationalRef !== "—" ? operationalRef : r.trip_id || r.id);
}

function mergeTripsById(lists: TripRecord[][]): TripRecord[] {
  const map = new Map<string, TripRecord>();
  for (const list of lists) {
    for (const t of list) {
      if (t?.id && !map.has(t.id)) map.set(t.id, t);
    }
  }
  return [...map.values()];
}

function passesLogPodsRow(t: TripRecord): boolean {
  return !tripPodIsReceived({
    pod_received_at: t.pod_received_at ?? null,
    pod_status: (t as { pod_status?: string | null }).pod_status,
  });
}

function tripLane(t: TripRecord): "asset" | "market" {
  const raw = str((t as { trip_payout_mode?: string | null }).trip_payout_mode).toLowerCase();
  if (raw === "market" || raw === "asset") return raw;
  return str((t as { supplier_id?: string | null }).supplier_id) ? "market" : "asset";
}

function mapRowToView(
  t: TripRecord,
  lrByTripId: Map<string, TripLrPodIndex>,
  shipperNameByTripId: Record<string, string>,
  supplierNameById: Map<string, string>,
  driverNameById: Map<string, string>,
): LogPodsTripView {
  const tripKey = getTripStringId(t);
  const internalId = str(t.id);
  const docs = lrByTripId.get(internalId);
  const allLrNumbers = docs?.lrNumbers ?? [];
  const tripReceived = tripPodIsReceived({
    pod_received_at: t.pod_received_at ?? null,
    pod_status: (t as { pod_status?: string | null }).pod_status,
  });
  const finalReceived = receivedLrNumbersForTrip(allLrNumbers, {
    tripReceived,
    hasPodDocument: docs?.hasPodDocument ?? false,
  });

  const tripDate =
    (t as { trip_date?: string | null }).trip_date ??
    (t as { pickup_date?: string | null }).pickup_date;
  const dateLabel = tripDate
    ? new Date(tripDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "N/A";

  const from =
    str((t as { pp_location?: string | null }).pp_location) ||
    str((t as { pickup_area?: string | null }).pickup_area) ||
    "Unknown";
  const to =
    str((t as { drop_point?: string | null }).drop_point) ||
    str((t as { drop_location?: string | null }).drop_location) ||
    "Unknown";

  return {
    id: tripKey,
    internal_id: str(t.id),
    client: shipperNameByTripId[internalId] || str((t as { client_name?: string | null }).client_name) || "—",
    supplier_id: str((t as { supplier_id?: string | null }).supplier_id),
    supplier_name:
      supplierNameById.get(str((t as { supplier_id?: string | null }).supplier_id)) ||
      str((t as { vendor_name?: string | null }).vendor_name) ||
      str((t as { supplier_name?: string | null }).supplier_name) ||
      "Unknown Supplier",
    driver_id: str((t as { driver_id?: string | null }).driver_id),
    driver_name:
      driverNameById.get(str((t as { driver_id?: string | null }).driver_id)) ||
      str((t as { driver_display_name?: string | null }).driver_display_name) ||
      "Unknown Driver",
    lane: tripLane(t),
    from,
    to,
    amount:
      num((t as { total_client_value?: unknown }).total_client_value) ??
      num((t as { client_price?: unknown }).client_price),
    status:
      str((t as { trip_status?: string | null }).trip_status) ||
      str((t as { status?: string | null }).status) ||
      "—",
    lrNumbers: Array.from(new Set(allLrNumbers)),
    receivedLRs: finalReceived,
    date: dateLabel,
    hardCopyReceived: tripReceived,
  };
}

export async function fetchOrgSuppliersForLogPods(
  orgId: string,
): Promise<{ error: Error | null; suppliers: LogPodsSupplierOption[] }> {
  try {
    const { data, error } = await supabase()
      .from("suppliers")
      .select("id, name, company_name")
      .eq("organization_id", orgId)
      .order("name", { ascending: true });
    if (error) return { error: new Error(error.message), suppliers: [] };
    const suppliers = (data ?? [])
      .map((row) => ({
        id: str(row.id),
        name: str(row.name || row.company_name).trim() || "Supplier",
      }))
      .filter((row) => row.id);
    suppliers.sort((a, b) => a.name.localeCompare(b.name));
    return { error: null, suppliers };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), suppliers: [] };
  }
}

export async function fetchOrgDriversForLogPods(
  orgId: string,
): Promise<{ error: Error | null; drivers: LogPodsPartyOption[] }> {
  try {
    const { data, error } = await supabase()
      .from("drivers")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name", { ascending: true });
    if (error) return { error: new Error(error.message), drivers: [] };
    const drivers = (data ?? [])
      .map((row) => ({
        id: str(row.id),
        name: str(row.name).trim() || "Driver",
      }))
      .filter((row) => row.id);
    drivers.sort((a, b) => a.name.localeCompare(b.name));
    return { error: null, drivers };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), drivers: [] };
  }
}

/**
 * Max simultaneous per-trip writes/RPCs for the bulk POD-received flows below.
 * A user can select an arbitrarily large batch of pending trips; matches the
 * concurrency limit already established for the same class of fan-out in
 * tripDocumentLrPod.service.ts / tripDocuments.service.ts.
 */
const LOG_PODS_CONCURRENCY = 3;

export type MarkHardCopyPodsReceivedInput = {
  tripInternalIds: string[];
  receivedAt: string;
  method: "courier" | "in_hand";
  courierName?: string | null;
  trackingId?: string | null;
  comment?: string | null;
};

export async function markSelectedTripsHardCopyPodReceived(
  input: MarkHardCopyPodsReceivedInput,
): Promise<{ error: Error | null; updatedCount: number }> {
  const ids = Array.from(
    new Set(input.tripInternalIds.map((id) => str(id)).filter(Boolean)),
  );
  if (ids.length === 0) {
    return { error: new Error("Select at least one pending trip."), updatedCount: 0 };
  }
  const receivedAt = str(input.receivedAt) || new Date().toISOString();
  const courierName =
    input.method === "courier" ? str(input.courierName).trim() : "In hand";
  const trackingId =
    input.method === "courier" ? str(input.trackingId).trim() || null : null;

  const results = await runWithConcurrencyLimit(
    ids,
    LOG_PODS_CONCURRENCY,
    (id) =>
      markTripHardCopyPodReceived(id, {
        courier: courierName || null,
        awbNumber: trackingId,
        comment: str(input.comment).trim() || null,
      }),
  );
  const firstError = results.find((r) => r.error != null)?.error;
  if (firstError) return { error: firstError, updatedCount: 0 };
  await runWithConcurrencyLimit(ids, LOG_PODS_CONCURRENCY, async (tripInternalId) => {
    const { error } = await supabase().rpc("log_activity", {
      p_action: "POD_LOGGED",
      p_entity_type: "trip",
      p_entity_id: tripInternalId,
      p_details: {
        method: input.method,
        courier_name: courierName || null,
        tracking_id: trackingId,
        received_at: receivedAt,
      },
    });
    if (error) console.warn("[logPods] log_activity:", error.message);
  });

  return { error: null, updatedCount: ids.length };
}

export async function fetchTripsForLogPods(
  orgId: string,
  options?: { includeReceived?: boolean },
): Promise<{ error: Error | null; trips: LogPodsTripView[] }> {
  try {
    const [ownerRes, supRes, cliRes, shipperNamesRes] = await Promise.all([
      supabase()
        .from("trips")
        .select(
          "id, organization_id, trip_operational_code, trip_code, display_trip_id, trip_number, supplier_id, driver_id, driver_display_name, trip_payout_mode, client_name, client_price, status, pickup_date, pickup_area, drop_location, created_at, pod_received_at, pod_required, notes, booking_ref",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(3000),
      getTripsWhereOrgIsSupplier(orgId),
      getTripsWhereOrgIsClient(orgId),
      getShipperDisplayNamesForSupplierTrips(orgId),
    ]);

    if (ownerRes.error)
      return { error: new Error(ownerRes.error.message), trips: [] };
    if (supRes.error) return { error: supRes.error, trips: [] };
    if (cliRes.error) return { error: cliRes.error, trips: [] };

    const ownerRows = (ownerRes.data ?? []) as TripRecord[];
    const supRows = (supRes.trips ?? []).map(supplierRowToTripRow) as TripRecord[];
    const cliRows = (cliRes.trips ?? []) as TripRecord[];
    const shipperNameByTripId = shipperNamesRes.shipperNameByTripId ?? {};

    const mergedAll = mergeTripsById([ownerRows, supRows, cliRows]);
    const merged = options?.includeReceived
      ? mergedAll
      : mergedAll.filter(passesLogPodsRow);

    const internalIds = merged.map(t => str(t.id)).filter(Boolean);
    const supplierIds = Array.from(new Set(merged.map(t => str((t as {supplier_id?: string | null}).supplier_id)).filter(Boolean)));
    const driverIds = Array.from(new Set(merged.map(t => str((t as {driver_id?: string | null}).driver_id)).filter(Boolean)));

    let lrByTripId = new Map<string, TripLrPodIndex>();
    let supplierNameById = new Map<string, string>();
    let driverNameById = new Map<string, string>();

    if (supplierIds.length > 0) {
      const { data: supData, error: supErr } = await supabase()
        .from("suppliers")
        .select("id, name, company_name")
        .in("id", supplierIds);
      
      if (supErr) {
        console.warn("[logPods] suppliers fetch:", supErr.message);
      } else {
        for (const row of supData ?? []) {
          if (row.id) {
            supplierNameById.set(row.id, str(row.name || row.company_name));
          }
        }
      }
    }

    if (driverIds.length > 0) {
      const { data: driverData, error: driverErr } = await supabase()
        .from("drivers")
        .select("id, name")
        .in("id", driverIds);
      if (driverErr) {
        console.warn("[logPods] drivers fetch:", driverErr.message);
      } else {
        for (const row of driverData ?? []) {
          if (row.id) driverNameById.set(row.id, str(row.name));
        }
      }
    }

    if (internalIds.length > 0) {
      lrByTripId = await loadLrPodIndexByTripIds(internalIds);
    }

    const views = merged.map((t) =>
      mapRowToView(t, lrByTripId, shipperNameByTripId, supplierNameById, driverNameById),
    );
    return { error: null, trips: views };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), trips: [] };
  }
}

export async function syncLogPodsTripsWithCache(
  orgId: string,
  currentRows: LogPodsTripView[],
): Promise<{ error: Error | null; trips: LogPodsTripView[] }> {
  try {
    const trips = await syncDomainRows<LogPodsTripView>({
      domain: "log-pods",
      orgId,
      schemaVersion: "1",
      policy: { maxDeltaLagMs: 2 * 60_000, fullSyncEveryMs: 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await fetchTripsForLogPods(orgId);
        if (res.error) throw res.error;
        return res.trips;
      },
      getDelta: async () => {
        const res = await fetchTripsForLogPods(orgId);
        if (res.error) throw res.error;
        return {
          changed: res.trips,
          deletedIds: [],
          nextCursor: { updatedAt: new Date().toISOString() },
        };
      },
      merge: (existing, delta) =>
        mergeDeltaRows({
          existing,
          changed: delta.changed,
          deletedIds: delta.deletedIds,
          compare: (a, b) => b.date.localeCompare(a.date),
        }),
    });
    return { error: null, trips };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), trips: currentRows };
  }
}

/** Table is not in this project's schema. Do not probe REST (404). */
let courierPartnersTableUnavailable = true;

function isCourierPartnersTableMissing(
  err: { message?: string; code?: string; status?: number } | null | undefined,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST205") return true;
  if (err.status === 404) return true;
  const m = String(err.message ?? "").toLowerCase();
  if (m.includes("schema cache")) return true;
  if (m.includes("could not find the table") && m.includes("courier_partners")) {
    return true;
  }
  if (m.includes("relation") && m.includes("courier_partners") && m.includes("does not exist")) {
    return true;
  }
  if (m.includes("courier_partners") && (m.includes("404") || m.includes("not found"))) {
    return true;
  }
  return false;
}

export async function fetchCourierPartners(): Promise<{
  error: Error | null;
  partners: CourierPartnerRow[];
}> {
  if (courierPartnersTableUnavailable) {
    return { error: null, partners: [] };
  }
  const { data, error } = await supabase()
    .from("courier_partners")
    .select("label, value, category, active, is_custom")
    .eq("active", true)
    .order("label", { ascending: true });

  if (error) {
    if (isCourierPartnersTableMissing(error)) {
      courierPartnersTableUnavailable = true;
      return { error: null, partners: [] };
    }
    return { error: new Error(error.message), partners: [] };
  }
  return { error: null, partners: (data ?? []) as CourierPartnerRow[] };
}

export interface MappedPodAttachment {
  trip_id: string;
  lr_number: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

export interface LogPodsPayload {
  selectedLRs: Record<string, string[]>;
  allTrips: LogPodsTripView[];
  courierValue: string;
  customCourierName: string;
  trackingId: string;
  dbCourierPartners: CourierPartnerRow[];
  mappedAttachments: MappedPodAttachment[];
  receivedAt?: string;
}

export async function ensureCustomCourierPartner(
  courierValue: string,
  customCourierName: string,
): Promise<{ error: Error | null; partner: CourierPartnerRow | null }> {
  if (courierValue !== "custom" || !customCourierName.trim())
    return { error: null, partner: null };
  if (courierPartnersTableUnavailable) {
    return { error: null, partner: null };
  }
  const value = customCourierName.toLowerCase().replace(/\s+/g, "_");
  const { data: existing, error: existingErr } = await supabase()
    .from("courier_partners")
    .select("label, value, category, active, is_custom")
    .eq("value", value)
    .maybeSingle();

  if (existingErr) {
    if (isCourierPartnersTableMissing(existingErr)) {
      courierPartnersTableUnavailable = true;
      return { error: null, partner: null };
    }
    return { error: new Error(existingErr.message), partner: null };
  }
  if (existing) return { error: null, partner: existing as CourierPartnerRow };

  const partnerData = {
    label: customCourierName.trim(),
    value,
    category: "other",
    is_custom: true,
  };

  const { error } = await supabase().from("courier_partners").insert(partnerData);

  if (error) {
    if (isCourierPartnersTableMissing(error)) {
      courierPartnersTableUnavailable = true;
      return { error: null, partner: null };
    }
    return { error: new Error(error.message), partner: null };
  }
  return { error: null, partner: partnerData as CourierPartnerRow };
}

function resolveCourierName(
  courierValue: string,
  customCourierName: string,
  partners: CourierPartnerRow[],
): string {
  const selected = partners.find((cp) => cp.value === courierValue);
  if (courierValue === "custom") return customCourierName.trim();
  return selected?.label || courierValue;
}

/** Executes POD logging: trip_documents already hold files; trips.pod_received_at is trip-level state. */
export async function executeLogIncomingPods(payload: LogPodsPayload): Promise<{
  error: Error | null;
  attachmentWarning?: string;
}> {
  const {
    selectedLRs,
    courierValue,
    customCourierName,
    trackingId,
    dbCourierPartners,
    mappedAttachments,
    receivedAt: receivedAtRaw,
  } = payload;

  const finalCourierName = resolveCourierName(
    courierValue,
    customCourierName,
    dbCourierPartners,
  );

  const customErr = await ensureCustomCourierPartner(
    courierValue,
    customCourierName,
  );
  if (customErr.error) return { error: customErr.error };

  const receivedAt = str(receivedAtRaw) || new Date().toISOString();
  const tripIds = Object.entries(selectedLRs)
    .filter(([, lrs]) => lrs.length > 0)
    .map(([tripInternalId]) => tripInternalId);

  const tripResults = await runWithConcurrencyLimit(
    tripIds,
    LOG_PODS_CONCURRENCY,
    (internalId) =>
      markTripHardCopyPodReceived(internalId, { courier: finalCourierName || null, awbNumber: trackingId || null }),
  );
  const tripUpdateError = tripResults.find((r) => r.error != null)?.error;
  if (tripUpdateError) {
    return { error: tripUpdateError };
  }

  const podLoggedEntries = Object.entries(selectedLRs).filter(([, lrs]) => lrs.length > 0);
  await runWithConcurrencyLimit(
    podLoggedEntries,
    LOG_PODS_CONCURRENCY,
    async ([tripInternalId, lrs]) => {
      const attCount = mappedAttachments.filter(
        (a) => a.trip_id === tripInternalId,
      ).length;
      const { error } = await supabase().rpc("log_activity", {
        p_action: "POD_LOGGED",
        p_entity_type: "trip",
        p_entity_id: tripInternalId,
        p_details: {
          lr_numbers: lrs.filter((lr) => lr !== "N/A"),
          courier_name: finalCourierName,
          tracking_id: trackingId || null,
          attachment_count: attCount,
          received_at: receivedAt,
        },
      });
      if (error) console.warn("[logPods] log_activity:", error.message);
    },
  );

  return { error: null };
}
