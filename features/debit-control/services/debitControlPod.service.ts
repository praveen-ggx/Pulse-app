/**
 * Debit Control — POD Received board and validation.
 * Inward completion is trips.pod_received_at (the same hard-copy receipt
 * written by Mark Inward / Log Incoming PODs / Trip Detail). Validation is
 * a single workflow event per trip so it can be audited and not repeated.
 */
import { getDocumentChargeConfig } from "@/features/organization/services/documentCharges.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { resolveComplianceDocumentationCharge } from "@/features/tripCompliance/utils/compliancePaymentAmount.util";
import {
  encodeHardCopyPodComment,
  fetchTripHardCopyPodState,
  loadLrPodIndexByTripIds,
  markTripHardCopyPodReceived,
  runWithConcurrencyLimit,
  vendorFreightBeforeIbond,
} from "@/features/trips/services/tripDocumentLrPod.service";
import {
  advanceDocumentCostAmount,
  netChargeTotal,
  readPodValidationPayload,
  resolveIndentType,
} from "@/features/debit-control/utils/podChargeTotals.util";
import {
  ADVANCE_DOCUMENT_COST_EVENT,
  POD_VALIDATED_EVENT,
  podValidationIdempotencyKey,
  type DebitControlPendingTrip,
  type DebitControlReceivedTrip,
  type PodChargeLines,
} from "@/features/debit-control/utils/debitControlPod.model";
import { podAgingEndDate, podReceivingAging, todayIsoDate } from "@/features/debit-control/utils/podAging.util";
import { canMarkPodInward, type PodInwardDraft } from "@/features/debit-control/utils/podInwardForm.util";
import { supabase } from "@/lib/supabase";

const TRIP_SELECT =
  "id, trip_operational_code, trip_code, display_trip_id, trip_number, client_id, client_name, client_price, supplier_id, supplier_rate, status, pickup_date, pickup_area, drop_location, pod_received_at, lane_id, vehicle_id, owner_vehicle_id, vehicle_display_number";

const COMPLETED_STATUSES = ["completed", "delivered", "done"];
const WRITE_CONCURRENCY = 3;

type TripQueryRow = {
  id: string;
  trip_operational_code?: string | null;
  trip_code?: string | null;
  display_trip_id?: string | null;
  trip_number?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  client_price?: number | null;
  supplier_id?: string | null;
  supplier_rate?: number | null;
  pickup_date?: string | null;
  pickup_area?: string | null;
  drop_location?: string | null;
  pod_received_at?: string | null;
  lane_id?: string | null;
  vehicle_id?: string | null;
  owner_vehicle_id?: string | null;
  vehicle_display_number?: string | null;
};

export type ValidatePodTripInput = {
  tripId: string;
  remarks: string;
  clientInvoiceNumber: string | null;
  client: PodChargeLines;
  vendor: PodChargeLines;
  tripStartDate?: string | null;
  deliveryDate?: string | null;
  dispatchDate?: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hubLabel(regions: string[] | null | undefined, warehouseZone: string | null): string {
  const zone = text(warehouseZone);
  if (zone) return zone;
  const list = (regions ?? []).map((row) => text(row)).filter(Boolean);
  return list.length > 0 ? list.join(", ") : "—";
}

async function loadValidationByTripId(
  tripIds: string[],
): Promise<Map<string, { createdAt: string; payload: unknown }>> {
  const found = new Map<string, { createdAt: string; payload: unknown }>();
  for (const ids of chunk(tripIds, 40)) {
    const { data, error } = await supabase()
      .from("trip_workflow_events")
      .select("trip_id, payload, created_at")
      .in("trip_id", ids)
      .eq("event_type", POD_VALIDATED_EVENT);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const tripId = text(row.trip_id);
      if (!tripId || found.has(tripId)) continue;
      found.set(tripId, { createdAt: row.created_at, payload: row.payload });
    }
  }
  return found;
}

async function loadInvoiceNumberByTripId(
  orgId: string,
  tripIds: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const ids of chunk(tripIds, 30)) {
    const { data, error } = await supabase()
      .from("invoices")
      .select("invoice_number, trip_ids, status, created_at")
      .eq("org_id", orgId)
      .overlaps("trip_ids", ids)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[debitControl] invoices:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const status = text(row.status).toLowerCase();
      if (status === "void" || status === "cancelled" || status === "canceled") continue;
      const number = text(row.invoice_number);
      if (!number) continue;
      for (const tripId of row.trip_ids ?? []) {
        const id = text(tripId);
        if (id && !found.has(id)) found.set(id, number);
      }
    }
  }
  return found;
}

/** Freight facts already on screen, used when the trip row cannot be re-read. */
export type AdvanceDocumentCostSource = {
  organizationId?: string | null;
  supplierRate?: number | null;
  supplierRateBasis?: string | null;
  loadTons?: number | null;
};

function documentCostPayloadAmount(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const amount = Number((payload as { amount?: unknown }).amount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

/** Amount frozen when the advance was posted. Null when that advance predates the snapshot. */
async function loadStoredAdvanceDocumentCost(tripId: string): Promise<number | null> {
  const { data, error } = await supabase()
    .from("trip_workflow_events")
    .select("payload")
    .eq("trip_id", tripId)
    .eq("event_type", ADVANCE_DOCUMENT_COST_EVENT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return documentCostPayloadAmount(data.payload);
}

/** Same slab Advance Payment deducts, from the trip's own org and vendor freight. */
async function resolveLiveDocumentCost(
  tripId: string,
  fallback?: AdvanceDocumentCostSource,
): Promise<number> {
  let row: {
    organization_id?: string | null;
    supplier_rate?: number | null;
    supplier_rate_basis?: string | null;
    load_tons?: number | null;
  } | null = null;
  const { data, error } = await supabase()
    .from("trips")
    .select("organization_id, supplier_rate, supplier_rate_basis, load_tons")
    .eq("id", tripId)
    .maybeSingle();
  if (!error && data) row = data;

  const freightFromRow = row ? vendorFreightBeforeIbond(row) : 0;
  const freight =
    freightFromRow > 0
      ? freightFromRow
      : vendorFreightBeforeIbond({
          supplier_rate: fallback?.supplierRate,
          supplier_rate_basis: fallback?.supplierRateBasis,
          load_tons: fallback?.loadTons,
        });
  if (freight <= 0) return 0;
  const orgId = text(row?.organization_id) || text(fallback?.organizationId);
  if (!orgId) return 0;
  const config = await getDocumentChargeConfig(orgId);
  if (config.error || !config.data) return 0;
  return resolveComplianceDocumentationCharge(config.data, freight).amount;
}

/** Document charge recorded when this trip's advance was processed. Typed amounts are not used. */
async function loadVendorDocumentCost(tripId: string): Promise<number> {
  try {
    return advanceDocumentCostAmount(await loadStoredAdvanceDocumentCost(tripId));
  } catch {
    return 0;
  }
}

/** Freeze the advance deduction so a later slab change does not rewrite this trip. */
export async function recordAdvanceDocumentCostSnapshot(
  tripId: string,
  fallback?: AdvanceDocumentCostSource,
): Promise<void> {
  const amount = await resolveLiveDocumentCost(tripId, fallback);
  const { data } = await supabase()
    .from("trips")
    .select("organization_id")
    .eq("id", tripId)
    .maybeSingle();
  const orgId = text(data?.organization_id) || text(fallback?.organizationId);
  if (!orgId) return;
  const { error } = await supabase()
    .from("trip_workflow_events")
    .insert({
      trip_id: tripId,
      org_id: orgId,
      event_type: ADVANCE_DOCUMENT_COST_EVENT,
      payload: { amount },
      idempotency_key: `${tripId}:${ADVANCE_DOCUMENT_COST_EVENT}`,
    });
  if (error && error.code !== "23505") return;
}

/** Invoice number from Trips Ops, plus any client charges already validated. */
export async function fetchTripPodClientValidation(
  orgId: string,
  tripId: string,
): Promise<{
  error: Error | null;
  invoiceNumber: string | null;
  validatedAt: string | null;
  clientCharges: PodChargeLines | null;
  vendorCharges: PodChargeLines | null;
  tripStartDate: string | null;
  deliveryDate: string | null;
  dispatchDate: string | null;
  /** Documentation charge already deducted on the advance payment. */
  documentCost: number;
  /** Hard-copy receipt was saved as IBond. */
  ibond: boolean;
  ibondDeductibleCost: number | null;
  ibondVendorCostBefore: number | null;
  ibondVendorCostAfter: number | null;
}> {
  const empty = {
    invoiceNumber: null,
    validatedAt: null,
    clientCharges: null,
    vendorCharges: null,
    tripStartDate: null,
    deliveryDate: null,
    dispatchDate: null,
    documentCost: 0,
    ibond: false,
    ibondDeductibleCost: null,
    ibondVendorCostBefore: null,
    ibondVendorCostAfter: null,
  };
  try {
    const [invoices, validation, pod, documentCost] = await Promise.all([
      loadInvoiceNumberByTripId(orgId, [tripId]),
      loadValidationByTripId([tripId]),
      fetchTripHardCopyPodState(tripId),
      loadVendorDocumentCost(tripId),
    ]);
    const saved = validation.get(tripId);
    const parsed = saved ? readPodValidationPayload(saved.payload) : null;
    return {
      error: null,
      invoiceNumber: invoices.get(tripId) ?? parsed?.clientInvoiceNumber ?? null,
      validatedAt: saved?.createdAt ?? null,
      clientCharges: parsed?.clientCharges ?? null,
      vendorCharges: parsed?.vendorCharges
        ? { ...parsed.vendorCharges, documentCost }
        : null,
      tripStartDate: parsed?.tripStartDate ?? null,
      deliveryDate: parsed?.deliveryDate ?? null,
      dispatchDate: parsed?.dispatchDate ?? pod.state?.dispatchDate ?? null,
      documentCost,
      ibond: pod.state?.ibond === true || (parsed?.vendorCharges.ibondDeductible ?? 0) > 0,
      ibondDeductibleCost: pod.state?.ibondDeductibleCost ?? null,
      ibondVendorCostBefore: pod.state?.ibondVendorCostBefore ?? null,
      ibondVendorCostAfter: pod.state?.ibondVendorCostAfter ?? null,
    };
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error : new Error("Could not load client validation."),
    };
  }
}

export async function fetchDebitControlBoard(orgId: string): Promise<{
  error: Error | null;
  pending: DebitControlPendingTrip[];
  received: DebitControlReceivedTrip[];
}> {
  try {
    const { data, error } = await supabase()
      .from("trips")
      .select(TRIP_SELECT)
      .eq("organization_id", orgId)
      .in("status", COMPLETED_STATUSES)
      .is("deleted_at", null)
      .order("pickup_date", { ascending: false })
      .limit(1000);
    if (error) return { error: new Error(error.message), pending: [], received: [] };

    const rows = (data ?? []) as TripQueryRow[];
    const receivedRows = rows.filter((row) => text(row.pod_received_at));
    const tripIds = rows.map((row) => row.id).filter(Boolean);
    const receivedIds = receivedRows.map((row) => row.id);
    const clientIds = Array.from(new Set(rows.map((row) => text(row.client_id)).filter(Boolean)));
    const supplierIds = Array.from(new Set(rows.map((row) => text(row.supplier_id)).filter(Boolean)));
    const laneIds = Array.from(new Set(rows.map((row) => text(row.lane_id)).filter(Boolean)));
    const vehicleIds = Array.from(new Set(rows.map((row) => text(row.vehicle_id)).filter(Boolean)));
    const ownerVehicleIds = Array.from(
      new Set(rows.map((row) => text(row.owner_vehicle_id)).filter(Boolean)),
    );

    const [lrIndex, validationByTrip, invoiceByTrip, clients, suppliers, lanes, vehicles, ownerVehicles] =
      await Promise.all([
        tripIds.length ? loadLrPodIndexByTripIds(tripIds) : Promise.resolve(new Map()),
        receivedIds.length ? loadValidationByTripId(receivedIds) : Promise.resolve(new Map()),
        receivedIds.length ? loadInvoiceNumberByTripId(orgId, receivedIds) : Promise.resolve(new Map()),
        lookupRows("clients", "id, operating_regions", clientIds),
        lookupRows("suppliers", "id, name, company_name", supplierIds),
        lookupRows("client_lane_rates", "id, is_spot_rate, warehouse_zone, vehicle_type", laneIds),
        lookupRows("vehicles", "id, vehicle_type, vehicle_number", vehicleIds),
        lookupRows("owner_vehicles", "id, vehicle_type, vehicle_number", ownerVehicleIds),
      ]);

    const clientById = new Map(clients.map((row) => [text(row.id), row]));
    const supplierById = new Map(suppliers.map((row) => [text(row.id), row]));
    const laneById = new Map(lanes.map((row) => [text(row.id), row]));
    const vehicleById = new Map(vehicles.map((row) => [text(row.id), row]));
    const ownerVehicleById = new Map(ownerVehicles.map((row) => [text(row.id), row]));

    const pending: DebitControlPendingTrip[] = rows
      .filter((row) => !text(row.pod_received_at))
      .map((row) => {
        const supplier = supplierById.get(text(row.supplier_id));
        const lr = lrIndex.get(row.id.toLowerCase());
        return {
          id: row.id,
          displayId: displayIdOf(row),
          tripDate: row.pickup_date ?? null,
          lrNumbers: lr?.lrNumbers ?? [],
          from: text(row.pickup_area) || "—",
          to: text(row.drop_location) || "—",
          clientName: text(row.client_name) || "—",
          vendorName:
            text(supplier?.name) || text(supplier?.company_name) || (row.supplier_id ? "Vendor" : "Own fleet"),
          hasSoftPod: Boolean(lr?.hasPodDocument),
        };
      });

    const received = receivedRows.map((row) => {
      const id = row.id;
      const lane = laneById.get(text(row.lane_id));
      const vehicle = vehicleById.get(text(row.vehicle_id));
      const ownerVehicle = ownerVehicleById.get(text(row.owner_vehicle_id));
      const supplier = supplierById.get(text(row.supplier_id));
      const client = clientById.get(text(row.client_id));
      const validation = validationByTrip.get(id);
      const stored = validation ? readPodValidationPayload(validation.payload) : null;
      const lr = lrIndex.get(id.toLowerCase());
      const vendorName =
        text(supplier?.name) || text(supplier?.company_name) || (row.supplier_id ? "Vendor" : "Own fleet");
      return {
        id,
        displayId: displayIdOf(row),
        tripDate: row.pickup_date ?? null,
        lrNumbers: lr?.lrNumbers ?? [],
        from: text(row.pickup_area) || "—",
        to: text(row.drop_location) || "—",
        indentType: resolveIndentType({
          laneId: row.lane_id,
          isSpotRate: Boolean(lane?.is_spot_rate),
        }),
        clientName: text(row.client_name) || "—",
        clientHub: hubLabel(
          Array.isArray(client?.operating_regions) ? (client.operating_regions as string[]) : null,
          text(lane?.warehouse_zone) || null,
        ),
        vendorName,
        vehicleType: text(vehicle?.vehicle_type) || text(ownerVehicle?.vehicle_type) || text(lane?.vehicle_type) || "—",
        vehicleNumber:
          text(vehicle?.vehicle_number) ||
          text(ownerVehicle?.vehicle_number) ||
          text(row.vehicle_display_number) ||
          "—",
        clientInvoiceNumber: stored?.clientInvoiceNumber || invoiceByTrip.get(id) || null,
        clientPrice: money(row.client_price),
        supplierRate: money(row.supplier_rate),
        validatedAt: validation?.createdAt ?? null,
        remarks: stored?.remarks ?? null,
        totalClientValue: stored ? stored.totalClientValue : null,
        totalVendorValue: stored ? stored.totalVendorValue : null,
        clientCharges: stored?.clientCharges ?? null,
        vendorCharges: stored?.vendorCharges ?? null,
      } satisfies DebitControlReceivedTrip;
    });

    return { error: null, pending, received };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      pending: [],
      received: [],
    };
  }
}

function displayIdOf(row: TripQueryRow): string {
  return getTripOperationalDisplay({
    trip_operational_code: row.trip_operational_code ?? null,
    trip_code: row.trip_code ?? null,
    display_trip_id: row.display_trip_id ?? null,
    trip_number: row.trip_number ?? null,
  });
}

export async function markPodInward(input: {
  tripIds: string[];
  draft: PodInwardDraft;
}): Promise<{ error: Error | null; updatedIds: string[] }> {
  if (!canMarkPodInward(input.draft)) {
    return { error: new Error("POD Received Date, Courier Name, and Docket Number are required."), updatedIds: [] };
  }
  const ids = Array.from(new Set(input.tripIds.map((id) => text(id)).filter(Boolean)));
  if (ids.length === 0) return { error: new Error("Select at least one trip."), updatedIds: [] };
  const comment = encodeHardCopyPodComment({
    receivedDate: input.draft.receivedDate.trim(),
    receiptMethod: "courier",
  });
  const courier = input.draft.courierName.trim();
  const docket = input.draft.docketNumber.trim();
  const results = await runWithConcurrencyLimit(ids, WRITE_CONCURRENCY, (tripId) =>
    markTripHardCopyPodReceived(tripId, {
      courier,
      awbNumber: docket,
      comment,
    }),
  );
  const updatedIds = ids.filter((_, index) => !results[index]?.error);
  const firstError = results.find((row) => row.error)?.error ?? null;
  if (updatedIds.length > 0) {
    await runWithConcurrencyLimit(updatedIds, WRITE_CONCURRENCY, async (tripId) => {
      const { error } = await supabase().rpc("log_activity", {
        p_action: "POD_LOGGED",
        p_entity_type: "trip",
        p_entity_id: tripId,
        p_details: {
          source: "debit_control_inward",
          method: "courier",
          courier_name: courier,
          docket_number: docket,
          pod_received_date: input.draft.receivedDate.trim(),
        },
      });
      if (error) console.warn("[debitControl] log_activity:", error.message);
    });
  }
  return { error: firstError, updatedIds };
}

async function lookupRows(
  table: "clients" | "suppliers" | "client_lane_rates" | "vehicles" | "owner_vehicles",
  columns: string,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const rows: Record<string, unknown>[] = [];
  for (const part of chunk(ids, 80)) {
    const { data, error } = await supabase().from(table).select(columns).in("id", part);
    if (error) {
      console.warn(`[debitControl] ${table}:`, error.message);
      continue;
    }
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return rows;
}

export async function validateDebitControlPods(input: {
  orgId: string;
  actorId: string | null;
  trips: ValidatePodTripInput[];
}): Promise<{ error: Error | null; updatedIds: string[]; failedIds: string[] }> {
  const orgId = text(input.orgId);
  if (!orgId) return { error: new Error("Organization is missing."), updatedIds: [], failedIds: [] };
  const trips = input.trips.filter((trip) => text(trip.tripId));
  if (trips.length === 0) {
    return { error: new Error("Select at least one trip."), updatedIds: [], failedIds: [] };
  }

  const results = await runWithConcurrencyLimit(trips, WRITE_CONCURRENCY, async (trip) => {
    const tripId = text(trip.tripId);
    const totalClient = netChargeTotal(trip.client);
    const totalVendor = netChargeTotal(trip.vendor);
    const aging = podReceivingAging(
      trip.deliveryDate,
      podAgingEndDate(trip.dispatchDate, todayIsoDate()),
      true,
    );
    const payload = {
      v: 1,
      remarks: text(trip.remarks) || null,
      client_invoice_number: text(trip.clientInvoiceNumber) || null,
      client: trip.client,
      vendor: trip.vendor,
      total_client_value: totalClient,
      total_vendor_value: totalVendor,
      trip_start_date: text(trip.tripStartDate).slice(0, 10) || null,
      delivery_date: text(trip.deliveryDate).slice(0, 10) || null,
      dispatch_date: text(trip.dispatchDate).slice(0, 10) || null,
      aging_days: aging?.days ?? null,
      pod_penalty_amount: aging?.penalty ?? null,
    };
    const idempotencyKey = podValidationIdempotencyKey(tripId);
    const { error } = await supabase()
      .from("trip_workflow_events")
      .insert({
        trip_id: tripId,
        org_id: orgId,
        actor_id: input.actorId,
        event_type: POD_VALIDATED_EVENT,
        idempotency_key: idempotencyKey,
        payload,
      });
    if (!error) return { tripId, ok: true as const };
    const code = String((error as { code?: string }).code ?? "");
    if (code === "23505") {
      const { error: updateError } = await supabase()
        .from("trip_workflow_events")
        .update({ actor_id: input.actorId, payload })
        .eq("trip_id", tripId)
        .eq("event_type", POD_VALIDATED_EVENT)
        .eq("idempotency_key", idempotencyKey);
      if (updateError) return { tripId, ok: false as const, message: updateError.message };
      return { tripId, ok: true as const, already: true };
    }
    return { tripId, ok: false as const, message: error.message };
  });

  const updatedIds = results.filter((row) => row.ok).map((row) => row.tripId);
  const failed = results.filter((row) => !row.ok);
  return {
    error: failed[0] && "message" in failed[0] ? new Error(failed[0].message) : null,
    updatedIds,
    failedIds: failed.map((row) => row.tripId),
  };
}
