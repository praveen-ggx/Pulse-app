import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import { invoicingClientGroupKey } from "@/features/invoicing/services/invoicePreviewModel.service";
import { effectiveInvoicePodPolicyFromClientRaw } from "@/features/invoicing/utils/invoicePodEnforcement.util";
import {
  evaluateFinanceWorkflowTrip,
  summarizeFinanceClientPicture,
  type FinanceClientPictureInvoice,
  type FinanceClientPictureSummary,
} from "@/features/invoicing/utils/financeWorkflowState.util";
import {
  financeInvoiceWorkspacePill,
  invoicePodRequiredModeLabel,
} from "@/features/invoicing/utils/financeInvoicePodAction.util";

export { financeInvoiceWorkspacePill, invoicePodRequiredModeLabel };
import type { InvoicePodPolicy } from "@/features/invoicing/utils/invoicePodPolicy.util";

export type FinanceClientRailRow = {
  key: string;
  name: string;
  clientId: string | null;
  picture: FinanceClientPictureSummary;
  issuedInvoiceValue: number;
  policy: InvoicePodPolicy | null;
  podRequiredLabel: string;
};

const EMPTY_PICTURE: FinanceClientPictureSummary = {
  listedTripCount: 0,
  completedTripCount: 0,
  podPendingTripCount: 0,
  draftTripCount: 0,
  unbilledTripCount: 0,
  eligibleTripCount: 0,
  invoicedTripCount: 0,
  blockedTripCount: 0,
  issuedInvoiceCount: 0,
  issuedInvoiceValue: 0,
  createInvoiceEnabled: false,
};

function pictureFromTrips(args: {
  clientId: string;
  clientName: string;
  policy: InvoicePodPolicy | null;
  trips: InvoicingTripView[];
  invoices: FinanceClientPictureInvoice[];
}): FinanceClientPictureSummary {
  return summarizeFinanceClientPicture({
    clientId: args.clientId,
    clientName: args.clientName,
    clientPolicy: args.policy,
    trips: args.trips.map((trip) => ({
      id: trip.internal_id || trip.id,
      tripStatus: trip.tripStatus,
      client_id: trip.client_id,
      client_price: trip.amount,
      physicalPodReceived: trip.physicalPodReceived === true,
      digitalPodPresent: trip.digitalPodPresent === true,
    })),
    issuedInvoices: args.invoices,
  });
}

export function buildFinanceClientRailRows(args: {
  trips: InvoicingTripView[];
  clientSearch: string;
  clientPolicies?: Record<string, unknown>;
  invoices: FinanceClientPictureInvoice[];
}): FinanceClientRailRow[] {
  const groups = new Map<string, InvoicingTripView[]>();
  for (const trip of args.trips) {
    const key = invoicingClientGroupKey(trip);
    const list = groups.get(key);
    if (list) list.push(trip);
    else groups.set(key, [trip]);
  }

  const q = args.clientSearch.trim().toLowerCase();
  const rows: FinanceClientRailRow[] = [];

  for (const [key, trips] of groups) {
    const name = trips[0]?.client ?? "Client";
    if (q && !name.toLowerCase().includes(q)) continue;

    const clientId = key.startsWith("name:") ? null : key;
    const resolved = clientId
      ? effectiveInvoicePodPolicyFromClientRaw({
          clientPolicyRaw: args.clientPolicies?.[clientId],
        })
      : { ok: true as const, policy: null };
    const policy = resolved.ok ? resolved.policy : null;

    if (clientId) {
      const picture = pictureFromTrips({
        clientId,
        clientName: name,
        policy,
        trips,
        invoices: args.invoices,
      });
      rows.push({
        key,
        name,
        clientId,
        picture,
        issuedInvoiceValue: picture.issuedInvoiceValue,
        policy,
        podRequiredLabel: invoicePodRequiredModeLabel(policy),
      });
      continue;
    }

    let listedTripCount = 0;
    let completedTripCount = 0;
    let podPendingTripCount = 0;
    let draftTripCount = 0;
    let unbilledTripCount = 0;
    let eligibleTripCount = 0;
    let invoicedTripCount = 0;
    let blockedTripCount = 0;
    for (const trip of trips) {
      listedTripCount += 1;
      const state = evaluateFinanceWorkflowTrip({
        tripStatus: trip.tripStatus,
        policy,
        physicalPodReceived: trip.physicalPodReceived === true,
        digitalPodPresent: trip.digitalPodPresent === true,
        invoiced: trip.invoiced === true,
        inDraft: trip.inDraft === true && trip.invoiced !== true,
      });
      if (state.completed) completedTripCount += 1;
      if (state.invoiceState === "issued") invoicedTripCount += 1;
      else if (state.invoiceState === "draft") draftTripCount += 1;
      else unbilledTripCount += 1;
      if (state.invoiceable) eligibleTripCount += 1;
      if (state.invoiceState === "blocked_pod") podPendingTripCount += 1;
      if (
        state.invoiceState === "blocked_pod" ||
        state.invoiceState === "blocked_policy" ||
        state.invoiceState === "not_completed"
      ) {
        blockedTripCount += 1;
      }
    }
    rows.push({
      key,
      name,
      clientId: null,
      picture: {
        ...EMPTY_PICTURE,
        listedTripCount,
        completedTripCount,
        podPendingTripCount,
        draftTripCount,
        unbilledTripCount,
        eligibleTripCount,
        invoicedTripCount,
        blockedTripCount,
        createInvoiceEnabled: eligibleTripCount > 0,
      },
      issuedInvoiceValue: 0,
      policy,
      podRequiredLabel: invoicePodRequiredModeLabel(policy),
    });
  }

  return rows.sort((a, b) => {
    const elig = b.picture.eligibleTripCount - a.picture.eligibleTripCount;
    if (elig !== 0) return elig;
    return b.picture.listedTripCount - a.picture.listedTripCount;
  });
}
