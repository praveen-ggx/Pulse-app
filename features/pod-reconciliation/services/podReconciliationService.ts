/**
 * POD Reconciliation service — maps to cashflow PodReconciliation.tsx.
 * Same DB as pulse-unified-base; RLS applies.
 *
 * Trip scope: selected org only — merge owner trips + supplier-linked + client-linked RPCs
 * so list counts match metrics (plain `from('trips')` + RLS can include other orgs).
 */
import { supabase } from '@/lib/supabase';
import { syncDomainRows } from '@/lib/cache/domainSync';
import { mergeDeltaRows } from '@/lib/cache/mergeDelta';
import { getTripOperationalDisplay } from "@/features/operations/display";
import {
  loadLrPodIndexByTripIds,
  receivedLrNumbersForTrip,
  tripPodIsReceived,
  type TripLrPodIndex,
} from "@/features/trips/services/tripDocumentLrPod.service";
import { fetchIssuedInvoicesForOrg } from "@/features/invoicing/services/invoiceList.service";
import {
  invoiceNumbersByTripId,
  overlayIssuedInvoiceOnTrip,
  tripHardPodStamp,
} from "../utils/podIssuedInvoiceOverlay.util";
import { fetchClientInvoicePodPolicies } from "@/features/clients/services/clients.service";
import { effectiveInvoicePodPolicyFromClientRaw } from "@/features/invoicing/utils/invoicePodEnforcement.util";
import {
  evaluateFinanceWorkflowTrip,
  financeInvoiceStatusLabel,
  financePodStatusLabel,
} from "@/features/invoicing/utils/financeWorkflowState.util";
import {
  podOperatorDisplayName,
  podTripLane,
} from "../utils/podOperatorDisplay.util";

type TripRow = Record<string, unknown>;

export interface PodReconciliationSummaryComputed {
  pod_pending_count: number;
  pod_pending_sum: number;
  received_count: number;
  received_sum: number;
  approved_count: number;
  approved_sum: number;
  invoiced_count: number;
  invoiced_sum: number;
}

export type PodTab = 'pod_pending' | 'received' | 'approved' | 'invoiced';

export interface PodReconciliationTripView {
  id: string; // trip_id (sequence)
  internal_id: string; // uuid
  client_name: string;
  vendor_name: string;
  driver_name: string;
  lane: "asset" | "market";
  trip_date: string;
  pp_location: string;
  drop_point: string;
  total_client_value?: number;
  trip_status: string;
  pod_status: string;
  pod_received_date: string | null;
  invoice_status_1: string;
  invoice_no: string | null;
  invoice_status_display: string;
  lr_numbers: string[];
  trip_pods: string[];
  amount: number;
  date: string;
  /** Digital POD in trip_documents (document_type=pod). */
  soft_pod_received: boolean;
  /** Physical POD via trips.pod_received_at. */
  hard_pod_received: boolean;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function tripAmount(t: TripRow): number {
  return num(t.total_client_value ?? t.client_price);
}

/** Trips for the selected org: owner + supplier-linked + client-linked (same scope as finance/invoicing merge). */
export async function mergeTripsForPodOrg(orgId: string): Promise<{
  error: Error | null;
  trips: TripRow[];
}> {
  try {
    const { data, error } = await supabase().rpc('get_trips_for_pod_org', { p_org_id: orgId });
    if (error) return { error: new Error(error.message), trips: [] };
    return { error: null, trips: (data ?? []) as TripRow[] };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      trips: [],
    };
  }
}

/** Same rules as the tab list filter in fetchReconciliationTrips. */
export function tripMatchesPodTab(trip: TripRow, activeTab: PodTab): boolean {
  const inv1 = str(trip.invoice_status_1).toLowerCase();
  const inv2 = str(trip.invoice_status_2).toLowerCase();
  const podS = str(trip.pod_status).toLowerCase();
  const podReceived = tripPodIsReceived({
    pod_received_at: (trip.pod_received_at as string | null | undefined) ?? null,
    pod_status: trip.pod_status,
  });
  const hasInvoiceNo = Boolean(trip.invoice_no && str(trip.invoice_no).trim() !== '');
  const isNoInvoice = !hasInvoiceNo && !inv1.includes('raised');
  const isApproved = inv1.includes('pending') || inv1.includes('data shared');

  if (activeTab === 'invoiced') {
    return hasInvoiceNo || inv1.includes('raised');
  }
  if (activeTab === 'approved') {
    return isNoInvoice && podReceived && isApproved;
  }
  if (activeTab === 'received') {
    return isNoInvoice && podReceived && !isApproved;
  }
  if (activeTab === 'pod_pending') {
    if (inv2.includes('unbilled')) return true;
    if (podReceived) return false;
    return (
      isNoInvoice &&
      (podS.includes('pending') ||
        podS.includes('i-bond') ||
        podS === '' ||
        podS === 'partial' ||
        !podS)
    );
  }
  return true;
}

export function computePodReconciliationSummaryFromTrips(
  rows: TripRow[],
): PodReconciliationSummaryComputed {
  const sumFor = (tab: PodTab) =>
    rows
      .filter((t) => tripMatchesPodTab(t, tab))
      .reduce((s, t) => s + tripAmount(t), 0);

  return {
    pod_pending_count: rows.filter((t) => tripMatchesPodTab(t, 'pod_pending'))
      .length,
    pod_pending_sum: sumFor('pod_pending'),
    received_count: rows.filter((t) => tripMatchesPodTab(t, 'received')).length,
    received_sum: sumFor('received'),
    approved_count: rows.filter((t) => tripMatchesPodTab(t, 'approved'))
      .length,
    approved_sum: sumFor('approved'),
    invoiced_count: rows.filter((t) => tripMatchesPodTab(t, 'invoiced'))
      .length,
    invoiced_sum: sumFor('invoiced'),
  };
}

/** Pulse Invoice writes invoices.trip_ids; overlay so tabs and metrics match issued docs. */
export async function withIssuedInvoiceOverlay(
  orgId: string,
  trips: TripRow[],
): Promise<TripRow[]> {
  const issued = await fetchIssuedInvoicesForOrg(orgId);
  const numbersByTripId = invoiceNumbersByTripId(issued.invoices);
  if (numbersByTripId.size === 0) return trips;
  return trips.map((trip) => overlayIssuedInvoiceOnTrip(trip, numbersByTripId));
}

export async function fetchReconciliationTrips(
  orgId: string,
  activeTab: PodTab,
  searchTerm: string = '',
  regionFilter: string = 'All'
): Promise<{ error: Error | null; trips: PodReconciliationTripView[] }> {
  try {
    const { error: mergeErr, trips: merged } = await mergeTripsForPodOrg(orgId);
    if (mergeErr) {
      console.error('[podReconciliation] merge error:', mergeErr);
      return { error: mergeErr, trips: [] };
    }

    let pool = merged;

    if (searchTerm) {
      const q = searchTerm.trim().toLowerCase();
      pool = pool.filter((trip) => {
        const operationalRef = getTripOperationalDisplay({
          trip_operational_code: (trip as { trip_operational_code?: string | null }).trip_operational_code ?? null,
          trip_code: (trip as { trip_code?: string | null }).trip_code ?? null,
          display_trip_id: (trip as { display_trip_id?: string | null }).display_trip_id ?? null,
          trip_number: (trip as { trip_number?: string | null }).trip_number ?? null,
        });
        const tid = str(
          operationalRef !== "—"
            ? operationalRef
            : (trip as { trip_id?: string | null }).trip_id ?? trip.id,
        ).toLowerCase();
        const client = str(trip.client_name).toLowerCase();
        const driver = str(trip.driver_display_name).toLowerCase();
        const lr = str(trip.lr_no).toLowerCase();
        return tid.includes(q) || client.includes(q) || driver.includes(q) || lr.includes(q);
      });
    }

    if (regionFilter && regionFilter !== 'All') {
      const pref = regionFilter.toLowerCase();
      pool = pool.filter((trip) => {
        const loc = str(trip.pickup_area ?? trip.pp_location).toLowerCase();
        return loc.startsWith(pref);
      });
    }

    pool.sort((a, b) => {
      const ca = str(a.created_at);
      const cb = str(b.created_at);
      return cb.localeCompare(ca);
    });

    const issuedOverlay = await withIssuedInvoiceOverlay(orgId, pool);
    pool = issuedOverlay;

    const filtered = pool
      .filter((trip) => tripMatchesPodTab(trip, activeTab))
      .slice(0, 1000);

    const internalIds = filtered.map(t => str(t.id)).filter(Boolean);
    const supplierIds = Array.from(new Set(filtered.map(t => str(t.supplier_id)).filter(Boolean)));
    const driverIds = Array.from(new Set(filtered.map(t => str(t.driver_id)).filter(Boolean)));

    let lrByTripId = new Map<string, TripLrPodIndex>();
    let supplierNameById = new Map<string, string>();
    let driverNameById = new Map<string, string>();

    if (supplierIds.length > 0) {
      const { data: supData } = await supabase()
        .from('suppliers')
        .select('id, name, company_name')
        .in('id', supplierIds);
      
      (supData || []).forEach(s => {
        supplierNameById.set(s.id, str(s.name || s.company_name));
      });
    }

    if (driverIds.length > 0) {
      const { data: driverData } = await supabase()
        .from("drivers")
        .select("id, name")
        .in("id", driverIds);
      (driverData || []).forEach((d) => {
        if (d.id) driverNameById.set(d.id, str(d.name));
      });
    }

    if (internalIds.length > 0) {
      lrByTripId = await loadLrPodIndexByTripIds(internalIds);
    }

    const policyClientIds = Array.from(
      new Set(filtered.map((t) => str(t.client_id)).filter(Boolean)),
    );
    const policyRes =
      policyClientIds.length > 0
        ? await fetchClientInvoicePodPolicies(orgId, policyClientIds)
        : { error: null, policies: {} as Record<string, unknown> };
    const clientPolicies = policyRes.policies ?? {};

    const mapped = filtered.map(trip => {
      const inv1 = str(trip.invoice_status_1).toLowerCase();
      const podReceivedAt = tripHardPodStamp(trip);
      const podReceived = tripPodIsReceived({
        pod_received_at: podReceivedAt,
        pod_status: trip.pod_status,
      });
      const isRaised = Boolean(inv1.includes('raised') || trip.invoice_no);
      const docs = lrByTripId.get(str(trip.id));
      const clientId = str(trip.client_id);
      const resolvedPolicy = effectiveInvoicePodPolicyFromClientRaw({
        clientPolicyRaw: clientId ? clientPolicies[clientId] : null,
      });
      const workflow = evaluateFinanceWorkflowTrip({
        tripStatus: str(trip.status || trip.trip_status),
        policy: resolvedPolicy.ok ? resolvedPolicy.policy : null,
        physicalPodReceived: podReceived,
        digitalPodPresent: docs?.hasPodDocument === true,
        invoiced: isRaised,
      });
      const invoice_status_display = workflow
        ? financeInvoiceStatusLabel(workflow.invoiceState)
        : isRaised
          ? "Invoiced"
          : "Invoice Pending";
      const podStatusLabel = workflow
        ? financePodStatusLabel(workflow.podState)
        : podReceived
          ? "Received"
          : str(trip.pod_status) || "Pending";

      const allLrNumbers = docs?.lrNumbers ?? [];
      const finalReceivedLRs = receivedLrNumbersForTrip(allLrNumbers, {
        tripReceived: podReceived,
        hasPodDocument: docs?.hasPodDocument ?? false,
      });

      const operationalRef = getTripOperationalDisplay({
        trip_operational_code: (trip as { trip_operational_code?: string | null }).trip_operational_code ?? null,
        trip_code: (trip as { trip_code?: string | null }).trip_code ?? null,
        display_trip_id: (trip as { display_trip_id?: string | null }).display_trip_id ?? null,
        trip_number: (trip as { trip_number?: string | null }).trip_number ?? null,
      });
      const tripDisplayId = str(
        operationalRef !== "—"
          ? operationalRef
          : (trip as { trip_id?: string | null }).trip_id || trip.id,
      );
      const tripDate = str(trip.pickup_date || trip.trip_date || trip.created_at);

      const supplierName = str(
        supplierNameById.get(str(trip.supplier_id)) || trip.vendor_name || trip.supplier_name,
      );
      const driverName = str(
        driverNameById.get(str(trip.driver_id)) || trip.driver_display_name,
      );
      const lane = podTripLane({
        supplier_id: trip.supplier_id,
        trip_payout_mode: trip.trip_payout_mode,
      });
      const operatorName = podOperatorDisplayName({
        lane,
        supplierName,
        driverName,
      });

      return {
        ...trip,
        id: tripDisplayId,
        internal_id: str(trip.id),
        client_name: str(trip.client_name),
        vendor_name: operatorName,
        driver_name: driverName,
        lane,
        pp_location: str(trip.pickup_area || trip.pp_location),
        drop_point: str(trip.drop_location || trip.drop_point),
        amount: num(trip.client_price || trip.total_client_value),
        date: tripDate,
        trip_date: tripDate,
        pod_status: podStatusLabel,
        pod_received_date: podReceivedAt ? podReceivedAt.slice(0, 10) : null,
        invoice_status_1: isRaised
          ? "Raised"
          : str(trip.invoice_status_1) || "Pending",
        invoice_no: str(trip.invoice_no) || null,
        invoice_status_display,
        lr_numbers: allLrNumbers,
        trip_pods: finalReceivedLRs,
        trip_status: str(trip.status || trip.trip_status),
        soft_pod_received: docs?.hasPodDocument ?? false,
        hard_pod_received: podReceived,
      } as PodReconciliationTripView;
    });

    return { error: null, trips: mapped };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), trips: [] };
  }
}

export async function syncPodReconciliationTripsWithCache(
  orgId: string,
  activeTab: PodTab,
  currentRows: PodReconciliationTripView[],
): Promise<{ error: Error | null; trips: PodReconciliationTripView[] }> {
  try {
    const trips = await syncDomainRows<PodReconciliationTripView>({
      domain: 'pod-reconciliation',
      orgId,
      schemaVersion: '3',
      policy: { maxDeltaLagMs: 2 * 60_000, fullSyncEveryMs: 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await fetchReconciliationTrips(orgId, activeTab);
        if (res.error) throw res.error;
        return res.trips;
      },
      getDelta: async () => {
        // Use full result as delta until dedicated POD delta RPC is rolled out.
        const res = await fetchReconciliationTrips(orgId, activeTab);
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
