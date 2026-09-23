/**
 * Invoicing execute service — maps to cashflow InvoicingCenter / api.ts.
 * Same DB as pulse-unified-base; RLS applies.
 */
import {
  getTripsWhereOrgIsSupplier,
  supplierRowToTripRow,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import {
  computePodReconciliationSummaryFromTrips,
  mergeTripsForPodOrg,
  withIssuedInvoiceOverlay,
} from "@/features/pod-reconciliation/services/podReconciliationService";
import {
  tripIsDeliveredStatus,
  tripPodIsReceived,
} from "@/features/trips/services/tripDocumentLrPod.service";
import {
  resolveInvoiceTripDriverName,
  resolveInvoiceTripLrNumber,
  resolveInvoiceTripSupplierName,
} from "@/features/invoicing/utils/invoiceTripOperational.util";
import { INVOICE_TRIP_NOT_COMPLETED } from "@/features/invoicing/utils/financeWorkflowState.util";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import { supabase } from "@/lib/supabase";
import { recordTripWorkflowEvent } from "@/features/trips/services/tripWorkflow.service";
import {
  computeInvoiceTax,
  round2,
  type InvoiceTaxEngineInput,
} from "@/features/invoicing/services/invoiceTax.service";
import {
  INVOICE_POD_HARD_COPY_REQUIRED,
  INVOICE_POD_LEGACY_REQUIRED,
  INVOICE_POD_POLICY_UNCONFIGURED,
  INVOICE_POD_SOFT_COPY_REQUIRED,
  conflictingInvoicePodOptions,
  effectiveInvoicePodPolicyFromClientRaw,
  invoiceNeedsDigitalPodLookup,
  invoiceSelectionClientIdentityError,
  isTripEligibleForInvoicePodPolicy,
} from "@/features/invoicing/utils/invoicePodEnforcement.util";
import type { InvoicePodPolicy } from "@/features/invoicing/utils/invoicePodPolicy.util";

export type TripStatus =
  | "approved"
  | "received"
  | "pending"
  | "warning"
  | "blocked";

export interface TripChecks {
  poMatch: boolean;
  idConfirmed: boolean;
  podReceived: boolean;
}

export interface InvoicingTripView {
  id: string;
  internal_id: string;
  organization_id: string | null;
  client_id: string | null;
  client: string;
  supplier_name: string;
  driver_name?: string | null;
  lr_number?: string | null;
  route: string;
  date: string;
  amount: number;
  status: TripStatus;
  details: string;
  checks: TripChecks;
  /** trips.pod_received_at — physical/hard-copy receipt, not a digital POD file. */
  physicalPodReceived: boolean;
  /** trip_documents document_type=pod. Independent of physicalPodReceived. */
  digitalPodPresent: boolean;
  /** Operational trips.status — not invoice Approved/Pending. */
  tripStatus: string;
  /** True when this trip id appears on an issued/sent invoice. */
  invoiced: boolean;
  issuedInvoiceNumber: string | null;
  inDraft: boolean;
  draftInvoiceNumber: string | null;
}

export interface AdditionalCharge {
  id: string;
  description: string;
  amount: number;
  tripId?: string;
}

export interface InvoiceConfig {
  includeGst: boolean;
  gstRate: number;
  includeFuel: boolean;
  fuelRate: number;
  additionalCharges: AdditionalCharge[];
}

export interface PodReconciliationSummary {
  pod_pending_count: number;
  pod_pending_sum: number;
  received_count: number;
  received_sum: number;
  approved_count: number;
  approved_sum: number;
  invoiced_count: number;
  invoiced_sum: number;
}

const LIVE_TRIP_SELECT =
  "id, organization_id, trip_operational_code, trip_code, display_trip_id, trip_number, booking_ref, supplier_id, driver_id, driver_display_name, client_id, client_name, client_price, status, pickup_date, pickup_area, drop_location, notes, created_at, pod_received_at";

const POD_IN_CHUNK = 40;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  | "status"
  | "pickup_date"
  | "pickup_area"
  | "drop_location"
  | "notes"
  | "created_at"
  | "booking_ref"
> & {
  client_id?: string | null;
  pod_received_at?: string | null;
  driver_id?: string | null;
  driver_display_name?: string | null;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function resolveSupplierName(
  row: TripRecord,
  supplierNameById?: Map<string, string>,
): string {
  const supplierId = str((row as { supplier_id?: string | null }).supplier_id);
  const byId = supplierId ? str(supplierNameById?.get(supplierId)) : "";
  return resolveInvoiceTripSupplierName({ lookupName: byId }) || "—";
}

function parseNetDays(paymentTerms: string | undefined): number {
  const match = /net\s*(\d+)/i.exec(paymentTerms ?? "");
  if (!match) return 30;
  const days = Number.parseInt(match[1], 10);
  return Number.isFinite(days) ? days : 30;
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** FY segment from an issued invoice number (`INV/{fy}/#####`). */
export function financialYearFromAllocatedNumber(
  invoiceNumber: string,
): string | null {
  const match = /^INV\/([^/]+)\//i.exec(invoiceNumber.trim());
  const fy = match?.[1]?.trim();
  return fy ? fy : null;
}

export type InvoiceTaxIdentityInput = Pick<
  InvoiceTaxEngineInput,
  "issuer" | "clients" | "invoiceOrgId" | "tripOrgIds"
>;

export function computeInvoiceTotals(
  tripAmounts: number[],
  config: {
    includeGst?: boolean;
    gstRate?: number;
    includeFuel?: boolean;
    fuelRate?: number;
    additionalCharges?: { amount?: number }[];
  },
  identity?: InvoiceTaxIdentityInput,
): {
  subtotal: number;
  gstRate: number;
  sgst: number;
  cgst: number;
  igst: number;
  totalAmount: number;
  tax?: ReturnType<typeof computeInvoiceTax>;
} {
  const includeGst = config.includeGst === true;
  const gstRate = config.gstRate ?? 0;
  const includeFuel = config.includeFuel === true;
  const fuelRate = config.fuelRate ?? 0;
  const additionalCharges = config.additionalCharges ?? [];

  if (identity) {
    const tax = computeInvoiceTax({
      ...identity,
      includeGst,
      gstRate,
      tripAmounts,
      includeFuel,
      fuelRate,
      additionalCharges,
    });
    return {
      subtotal: tax.taxable_base,
      gstRate: tax.gst_rate,
      sgst: tax.sgst_amount,
      cgst: tax.cgst_amount,
      igst: tax.igst_amount,
      totalAmount: tax.total_amount,
      tax,
    };
  }

  const baseFreightTotal = tripAmounts.reduce((acc, n) => acc + n, 0);
  const additionalTotal = additionalCharges.reduce(
    (acc, c) => acc + (c.amount || 0),
    0,
  );
  const fuelSurcharge = includeFuel ? baseFreightTotal * (fuelRate / 100) : 0;
  const subtotal = round2(baseFreightTotal + additionalTotal + fuelSurcharge);
  const appliedRate = includeGst ? gstRate : 0;
  const half = appliedRate / 2;
  const sgst = round2(subtotal * (half / 100));
  const cgst = round2(subtotal * (half / 100));
  return {
    subtotal,
    gstRate: appliedRate,
    sgst,
    cgst,
    igst: 0,
    totalAmount: round2(subtotal + sgst + cgst),
  };
}

function toAppError(e: unknown): Error {
  const msg =
    e instanceof Error
      ? e.message
      : e &&
          typeof e === "object" &&
          "message" in e &&
          typeof (e as { message: unknown }).message === "string"
        ? (e as { message: string }).message
        : String(e);
  if (
    msg.includes("42703") ||
    /column .* does not exist/i.test(msg) ||
    /pod_status|invoice_status_1|invoice_status_2|\binvoice_no\b|activity_logs|log_activity/i.test(
      msg,
    )
  ) {
    return new Error("Invoice could not be completed. Please try again.");
  }
  return e instanceof Error ? e : new Error(msg);
}

/** Batched physical-POD stamps for trips missing pod_received_at on the owner select. */
async function fetchPhysicalPodReceivedAtByIds(
  tripIds: string[],
): Promise<Map<string, string | null>> {
  const found = new Map<string, string | null>();
  if (tripIds.length === 0) return found;
  for (let i = 0; i < tripIds.length; i += POD_IN_CHUNK) {
    const chunk = tripIds.slice(i, i + POD_IN_CHUNK);
    const { data, error } = await supabase()
      .from("trips")
      .select("id, pod_received_at")
      .in("id", chunk);
    if (error) throw toAppError(error);
    for (const row of data ?? []) {
      const id = str((row as { id?: string | null }).id);
      if (!id) continue;
      found.set(
        id,
        (row as { pod_received_at?: string | null }).pod_received_at ?? null,
      );
    }
  }
  return found;
}

export async function fetchDigitalPodTripIdsForInvoice(
  tripIds: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  if (tripIds.length === 0) return found;
  for (let i = 0; i < tripIds.length; i += POD_IN_CHUNK) {
    const chunk = tripIds.slice(i, i + POD_IN_CHUNK);
    const { data, error } = await supabase()
      .from("trip_documents")
      .select("trip_id")
      .in("trip_id", chunk)
      .eq("document_type", "pod");
    if (error) throw toAppError(error);
    for (const row of data ?? []) {
      const id = str((row as { trip_id?: string | null }).trip_id);
      if (id) found.add(id);
    }
  }
  return found;
}

async function fetchInvoiceAllocationsForOrg(orgId: string): Promise<{
  invoicedIds: Set<string>;
  invoiceNumberByTripId: Map<string, string>;
  draftIds: Set<string>;
  draftNumberByTripId: Map<string, string>;
}> {
  const invoicedIds = new Set<string>();
  const invoiceNumberByTripId = new Map<string, string>();
  const draftIds = new Set<string>();
  const draftNumberByTripId = new Map<string, string>();
  const { data, error } = await supabase()
    .from("invoices")
    .select("invoice_number, trip_ids, status")
    .eq("org_id", orgId);
  if (error) throw toAppError(error);
  for (const row of data ?? []) {
    const status = str((row as { status?: string | null }).status).toLowerCase();
    if (status === "void" || status === "cancelled") continue;
    const number = str((row as { invoice_number?: string | null }).invoice_number);
    const ids = (row as { trip_ids?: string[] | null }).trip_ids ?? [];
    const issued = status === "sent" || status === "paid";
    const draft = status === "draft";
    for (const id of ids) {
      if (!id) continue;
      if (issued) {
        invoicedIds.add(id);
        if (number && !invoiceNumberByTripId.has(id)) {
          invoiceNumberByTripId.set(id, number);
        }
      } else if (draft) {
        draftIds.add(id);
        if (number && !draftNumberByTripId.has(id)) {
          draftNumberByTripId.set(id, number);
        }
      }
    }
  }
  return { invoicedIds, invoiceNumberByTripId, draftIds, draftNumberByTripId };
}

async function fetchInvoicedTripIdsForOrg(orgId: string): Promise<Set<string>> {
  const { invoicedIds } = await fetchInvoiceAllocationsForOrg(orgId);
  return invoicedIds;
}

export function getTripStringId(row: TripRecord): string {
  const r = row as {
    booking_ref?: string | null;
    trip_operational_code?: string;
    trip_code?: string;
    trip_id?: string;
    display_trip_id?: string;
    trip_number?: string;
    id?: string;
  };
  if (r.booking_ref?.trim()) return r.booking_ref.trim();
  const operationalRef = getTripOperationalDisplay({
    trip_operational_code: r.trip_operational_code ?? null,
    trip_code: r.trip_code ?? null,
    display_trip_id: r.display_trip_id ?? null,
    trip_number: r.trip_number ?? null,
  });
  return str(operationalRef !== "—" ? operationalRef : r.trip_id || r.id);
}

function mapRowToView(
  row: TripRecord,
  supplierNameById: Map<string, string> | undefined,
  driverNameById: Map<string, string> | undefined,
  hasPod: boolean,
  physicalPodReceived: boolean,
  invoiced: boolean,
  issuedInvoiceNumber: string | null,
  inDraft = false,
  draftInvoiceNumber: string | null = null,
): InvoicingTripView {
  const tripDate = str((row as { pickup_date?: string | null }).pickup_date);
  const ppLocation = str((row as { pickup_area?: string | null }).pickup_area);
  const dropPoint = str(
    (row as { drop_location?: string | null }).drop_location,
  );
  const route = `${ppLocation || "Unknown"} ➔ ${dropPoint || "Unknown"}`;

  const clientId = str((row as { client_id?: string | null }).client_id);
  const organizationId = str(row.organization_id);
  return {
    internal_id: str(row.id),
    id: getTripStringId(row),
    organization_id: organizationId || null,
    client_id: clientId || null,
    client: str((row as { client_name?: string | null }).client_name) || "—",
    supplier_name: resolveSupplierName(row, supplierNameById),
    driver_name: resolveInvoiceTripDriverName({
      displayName: str(
        (row as { driver_display_name?: string | null }).driver_display_name,
      ),
      lookupName: str(
        (row as { driver_id?: string | null }).driver_id
          ? driverNameById?.get(
              str((row as { driver_id?: string | null }).driver_id),
            )
          : "",
      ),
    }),
    lr_number: resolveInvoiceTripLrNumber({
      bookingRef: str((row as { booking_ref?: string | null }).booking_ref),
    }),
    route,
    date: tripDate,
    amount:
      num((row as { total_client_value?: unknown }).total_client_value) ||
      num((row as { client_price?: unknown }).client_price) ||
      0,
    status: hasPod ? "approved" : physicalPodReceived ? "received" : "pending",
    details: str((row as { notes?: string | null }).notes),
    checks: {
      poMatch: true,
      idConfirmed: true,
      podReceived: hasPod,
    },
    physicalPodReceived,
    digitalPodPresent: hasPod,
    tripStatus: str((row as { status?: string | null }).status),
    invoiced,
    issuedInvoiceNumber,
    inDraft,
    draftInvoiceNumber,
  };
}

export async function fetchInvoicingTrips(
  orgId: string,
): Promise<{ error: Error | null; trips: InvoicingTripView[] }> {
  try {
    const [ownerRes, supRes] = await Promise.all([
      supabase()
        .from("trips")
        .select(LIVE_TRIP_SELECT)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(3000),
      getTripsWhereOrgIsSupplier(orgId),
    ]);

    if (ownerRes.error) return { error: toAppError(ownerRes.error), trips: [] };
    if (supRes.error) return { error: supRes.error, trips: [] };

    const ownerRows = (ownerRes.data ?? []) as TripRecord[];
    const supRows = (supRes.trips ?? []).map(supplierRowToTripRow) as TripRecord[];

    const map = new Map<string, TripRecord>();
    for (const t of [...ownerRows, ...supRows]) {
      if (t?.id && !map.has(t.id)) map.set(t.id, t);
    }
    const merged = Array.from(map.values());
    const mergedIds = merged.map((t) => str(t.id)).filter(Boolean);
    const missingPhysicalStampIds = mergedIds.filter((id) => {
      const row = map.get(id);
      return row != null && !("pod_received_at" in row);
    });
    const [allocations, physicalStampById] = await Promise.all([
      fetchInvoiceAllocationsForOrg(orgId),
      fetchPhysicalPodReceivedAtByIds(missingPhysicalStampIds),
    ]);

    const supplierIds = Array.from(
      new Set(
        merged
          .map((trip) =>
            str((trip as { supplier_id?: string | null }).supplier_id),
          )
          .filter(Boolean),
      ),
    );
    const supplierNameById = new Map<string, string>();
    const driverNameById = new Map<string, string>();
    const driverIds = Array.from(
      new Set(
        merged
          .map((row) => str((row as { driver_id?: string | null }).driver_id))
          .filter(Boolean),
      ),
    );

    if (supplierIds.length > 0) {
      const { data: supData } = await supabase()
        .from("suppliers")
        .select("id, name, company_name")
        .in("id", supplierIds);

      for (const s of supData ?? []) {
        const id = str((s as { id?: string | null }).id);
        if (!id) continue;
        const name =
          str((s as { name?: string | null }).name) ||
          str((s as { company_name?: string | null }).company_name);
        if (name) supplierNameById.set(id, name);
      }
    }

    if (driverIds.length > 0) {
      const { data: driverData } = await supabase()
        .from("drivers")
        .select("id, name")
        .in("id", driverIds);
      for (const d of driverData ?? []) {
        const id = str((d as { id?: string | null }).id);
        const name = str((d as { name?: string | null }).name);
        if (id && name) driverNameById.set(id, name);
      }
    }

    const views = merged.map((row) => {
      const id = str(row.id);
      const stamp =
        row.pod_received_at !== undefined
          ? row.pod_received_at
          : (physicalStampById.get(id) ?? null);
      return mapRowToView(
        row,
        supplierNameById,
        driverNameById,
        false,
        tripPodIsReceived({ pod_received_at: stamp }),
        allocations.invoicedIds.has(id),
        allocations.invoiceNumberByTripId.get(id) ?? null,
        allocations.draftIds.has(id),
        allocations.draftNumberByTripId.get(id) ?? null,
      );
    });
    return { error: null, trips: views };
  } catch (e) {
    return { error: toAppError(e), trips: [] };
  }
}

export async function syncInvoicingTripsWithCache(
  orgId: string,
  currentRows: InvoicingTripView[],
): Promise<{ error: Error | null; trips: InvoicingTripView[] }> {
  try {
    const trips = await syncDomainRows<InvoicingTripView>({
      domain: "invoicing",
      orgId,
      schemaVersion: "2",
      policy: { maxDeltaLagMs: 2 * 60_000, fullSyncEveryMs: 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await fetchInvoicingTrips(orgId);
        if (res.error) throw res.error;
        return res.trips;
      },
      getDelta: async () => {
        const res = await fetchInvoicingTrips(orgId);
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

export async function fetchPodReconciliationSummary(
  organizationId?: string | null,
): Promise<{
  error: Error | null;
  summary: PodReconciliationSummary | null;
}> {
  try {
    if (!organizationId) {
      return { error: null, summary: null };
    }
    const { error, trips } = await mergeTripsForPodOrg(organizationId);
    if (error) throw error;
    const overlaid = await withIssuedInvoiceOverlay(organizationId, trips);
    const s = computePodReconciliationSummaryFromTrips(overlaid);
    return {
      error: null,
      summary: {
        pod_pending_count: s.pod_pending_count,
        pod_pending_sum: s.pod_pending_sum,
        received_count: s.received_count,
        received_sum: s.received_sum,
        approved_count: s.approved_count,
        approved_sum: s.approved_sum,
        invoiced_count: s.invoiced_count,
        invoiced_sum: s.invoiced_sum,
      },
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      summary: null,
    };
  }
}

export interface InvoicePayload {
  notes?: string;
  paymentTerms?: string;
  includeGst?: boolean;
  gstRate?: number;
  includeFuel?: boolean;
  fuelRate?: number;
  additionalCharges?: AdditionalCharge[];
  createdBy?: string | null;
  clientName?: string;
  calculations?: {
    subtotal?: number;
    sgst?: number;
    cgst?: number;
    igst?: number;
    totalAmount?: number;
  };
  draftId?: string;
  idempotencyKey?: string;
}

/**
 * Legacy `requirePod` remains for existing callers (true = digital POD, false = skip).
 * Omitted requirePod + omitted podPolicy = authoritative client/workspace revalidation.
 * Do not pass both inconsistently.
 */
export type ExecuteInvoiceOptions = {
  requirePod?: boolean;
  podPolicy?: InvoicePodPolicy;
};

async function fetchAuthoritativeClientInvoicePodPolicy(
  orgId: string,
  clientId: string,
): Promise<unknown> {
  const { data, error } = await supabase()
    .from("clients")
    .select("id, invoice_pod_policy")
    .eq("organization_id", orgId)
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw toAppError(error);
  if (!data) {
    throw new Error("Client not found or you cannot view this client.");
  }
  return (data as { invoice_pod_policy?: unknown }).invoice_pod_policy;
}

async function enforceInvoicePodGate(args: {
  rows: TripRecord[];
  sanitizedIds: string[];
  orgId: string;
  options?: ExecuteInvoiceOptions;
}): Promise<void> {
  const requirePodSupplied = args.options != null && "requirePod" in args.options;
  const podPolicySupplied =
    args.options != null &&
    "podPolicy" in args.options &&
    args.options.podPolicy != null;
  const conflict = conflictingInvoicePodOptions({
    requirePodSupplied,
    podPolicySupplied,
    requirePod: args.options?.requirePod,
    podPolicy: args.options?.podPolicy,
  });
  if (conflict) throw new Error(conflict);

  if (requirePodSupplied && !podPolicySupplied) {
    if (args.options?.requirePod === false) return;
    const podTripIds = await fetchDigitalPodTripIdsForInvoice(args.sanitizedIds);
    const missingPod = args.sanitizedIds.filter((id) => !podTripIds.has(id));
    if (missingPod.length > 0) {
      throw new Error(INVOICE_POD_LEGACY_REQUIRED);
    }
    return;
  }

  const identityError = invoiceSelectionClientIdentityError(args.rows);
  if (identityError) throw new Error(identityError);

  const clientIds = Array.from(
    new Set(
      args.rows
        .map((row) => str((row as { client_id?: string | null }).client_id))
        .filter((id) => isUuid(id)),
    ),
  );

  let clientPolicyRaw: unknown = null;
  if (clientIds.length === 1) {
    clientPolicyRaw = await fetchAuthoritativeClientInvoicePodPolicy(
      args.orgId,
      clientIds[0],
    );
  }

  const resolved = effectiveInvoicePodPolicyFromClientRaw({
    clientPolicyRaw,
  });
  if (!resolved.ok) throw new Error(resolved.error);
  const policy = resolved.policy;

  if (policy === "none") return;

  if (invoiceNeedsDigitalPodLookup(policy)) {
    const podTripIds = await fetchDigitalPodTripIdsForInvoice(args.sanitizedIds);
    const missing = args.sanitizedIds.some((id) => !podTripIds.has(id));
    if (missing) throw new Error(INVOICE_POD_SOFT_COPY_REQUIRED);
    return;
  }

  const physicalById = new Map<string, boolean>();
  const missingStampIds: string[] = [];
  for (const row of args.rows) {
    const id = str(row.id);
    if (row.pod_received_at !== undefined) {
      physicalById.set(
        id,
        tripPodIsReceived({ pod_received_at: row.pod_received_at }),
      );
    } else {
      missingStampIds.push(id);
    }
  }
  if (missingStampIds.length > 0) {
    const stamps = await fetchPhysicalPodReceivedAtByIds(missingStampIds);
    for (const id of missingStampIds) {
      physicalById.set(
        id,
        tripPodIsReceived({ pod_received_at: stamps.get(id) ?? null }),
      );
    }
  }
  const missingPhysical = args.sanitizedIds.some(
    (id) =>
      !isTripEligibleForInvoicePodPolicy("hard_copy", {
        digitalPodPresent: false,
        physicalPodReceived: physicalById.get(id) === true,
      }),
  );
  if (missingPhysical) throw new Error(INVOICE_POD_HARD_COPY_REQUIRED);
}

export async function executeInvoiceCreation(
  internalIds: string[],
  payload?: InvoicePayload,
  options?: ExecuteInvoiceOptions,
): Promise<{ error: Error | null; invoiceNumber?: string }> {
  try {
    const sanitizedIds = Array.from(
      new Set(internalIds.filter((id) => Boolean(id) && isUuid(id))),
    );
    if (sanitizedIds.length === 0) {
      throw new Error("No approved trips selected for invoice issuance.");
    }

    const { data: candidates, error: candidateError } = await supabase()
      .from("trips")
      .select(
        "id, organization_id, trip_number, display_trip_id, booking_ref, trip_operational_code, trip_code, client_id, client_name, client_price, pickup_date, pickup_area, drop_location, notes, pod_received_at, status",
      )
      .in("id", sanitizedIds);

    if (candidateError) throw toAppError(candidateError);

    const rows = (candidates ?? []) as unknown as TripRecord[];
    if (rows.length !== sanitizedIds.length) {
      throw new Error(
        "Some selected trips are no longer available for invoicing. Please refresh.",
      );
    }

    const incomplete = rows.some(
      (row) => !tripIsDeliveredStatus(str((row as { status?: string | null }).status)),
    );
    if (incomplete) {
      throw new Error(INVOICE_TRIP_NOT_COMPLETED);
    }

    const orgIds = Array.from(
      new Set(
        rows
          .map((row) => str((row as { organization_id?: string | null }).organization_id))
          .filter(Boolean),
      ),
    );
    if (orgIds.length !== 1) {
      throw new Error("Selected trips must belong to the same workspace.");
    }
    const orgId = orgIds[0];

    await enforceInvoicePodGate({
      rows,
      sanitizedIds,
      orgId,
      options,
    });

    const invoicedTripIds = await fetchInvoicedTripIdsForOrg(orgId);
    if (sanitizedIds.some((id) => invoicedTripIds.has(id))) {
      throw new Error("One or more selected trips have already been invoiced.");
    }

    const tripAmounts = rows.map(
      (row) =>
        num((row as { total_client_value?: unknown }).total_client_value) ||
        num((row as { client_price?: unknown }).client_price) ||
        0,
    );
    const computed = computeInvoiceTotals(tripAmounts, {
      includeGst: payload?.includeGst,
      gstRate: payload?.gstRate,
      includeFuel: payload?.includeFuel,
      fuelRate: payload?.fuelRate,
      additionalCharges: payload?.additionalCharges,
    });
    const calc = payload?.calculations;
    const subtotal =
      typeof calc?.subtotal === "number" && Number.isFinite(calc.subtotal)
        ? calc.subtotal
        : computed.subtotal;
    const sgstAmount =
      typeof calc?.sgst === "number" && Number.isFinite(calc.sgst)
        ? calc.sgst
        : computed.sgst;
    const cgstAmount =
      typeof calc?.cgst === "number" && Number.isFinite(calc.cgst)
        ? calc.cgst
        : computed.cgst;
    const igstAmount =
      typeof calc?.igst === "number" && Number.isFinite(calc.igst)
        ? calc.igst
        : computed.igst;
    const totalAmount =
      typeof calc?.totalAmount === "number" && Number.isFinite(calc.totalAmount)
        ? calc.totalAmount
        : computed.totalAmount;

    const clientIds = Array.from(
      new Set(
        rows
          .map((row) => str((row as { client_id?: string | null }).client_id))
          .filter((id) => isUuid(id)),
      ),
    );
    const clientId = clientIds.length === 1 ? clientIds[0] : null;
    if (!clientId) {
      throw new Error(INVOICE_POD_POLICY_UNCONFIGURED);
    }
    const clientName =
      (typeof payload?.clientName === "string" && payload.clientName.trim()) ||
      str((rows[0] as { client_name?: string | null }).client_name) ||
      null;

    const invoiceDate = new Date().toISOString().slice(0, 10);
    const dueDate = addDaysIso(invoiceDate, parseNetDays(payload?.paymentTerms));
    const createdBy =
      typeof payload?.createdBy === "string" && isUuid(payload.createdBy)
        ? payload.createdBy
        : null;

    const { data: issuedNumber, error: issueError } = await supabase().rpc(
      "issue_customer_invoice",
      {
        p_org_id: orgId,
        p_client_id: clientId,
        p_client_name: clientName,
        p_trip_ids: sanitizedIds,
        p_subtotal: subtotal,
        p_gst_rate: computed.gstRate,
        p_sgst_amount: sgstAmount,
        p_cgst_amount: cgstAmount,
        p_igst_amount: igstAmount,
        p_total_amount: totalAmount,
        p_notes: typeof payload?.notes === "string" ? payload.notes : null,
        p_invoice_date: invoiceDate,
        p_due_date: dueDate,
        p_created_by: createdBy,
        p_draft_id:
          typeof payload?.draftId === "string" && isUuid(payload.draftId)
            ? payload.draftId
            : null,
        p_idempotency_key:
          typeof payload?.idempotencyKey === "string" &&
          payload.idempotencyKey.trim()
            ? payload.idempotencyKey.trim()
            : null,
      },
    );
    if (issueError || issuedNumber == null || String(issuedNumber).trim() === "") {
      throw issueError
        ? toAppError(issueError)
        : new Error("Could not allocate an invoice number. Please try again.");
    }
    const invoiceNumber = String(issuedNumber).trim();

    const EVENT_CONCURRENCY = 5;
    const runOne = async (id: string) => {
      await recordTripWorkflowEvent({
        tripId: id,
        orgId,
        eventType: "invoice.generated",
        payload: { invoice_no: invoiceNumber },
      }).catch((err) => {
        console.warn("[invoicing] recordTripWorkflowEvent failed for trip", id, err);
      });
    };
    for (let i = 0; i < sanitizedIds.length; i += EVENT_CONCURRENCY) {
      const chunk = sanitizedIds.slice(i, i + EVENT_CONCURRENCY);
      await Promise.all(chunk.map(runOne));
    }

    return { error: null, invoiceNumber };
  } catch (e) {
    return { error: toAppError(e) };
  }
}
