/**
 * Canonical Finance Pro (POD + Invoice) state for one trip.
 * Both Pulse POD and Pulse Invoice must call this — do not re-derive
 * invoiceability in the UI.
 *
 * Hard-copy POD receipt is trips.pod_received_at.
 * Soft POD is trip_documents document_type=pod.
 * Invoice allocation is invoices.trip_ids.
 */

import { tripIsDeliveredStatus } from "@/features/trips/services/tripDocumentLrPod.service";
import type { InvoicePodPolicy } from "@/features/invoicing/utils/invoicePodPolicy.util";
import { isTripEligibleForInvoicePodPolicy } from "@/features/invoicing/utils/invoicePodEnforcement.util";
import { issuedInvoicesForClient } from "@/features/invoicing/utils/issuedInvoiceMatch.util";
import {
  invoiceStatusIsDraft,
  invoiceStatusIsIssued,
} from "@/features/invoicing/utils/invoiceLifecycle.util";

export type FinancePodState =
  | "not_required"
  | "pending"
  | "received"
  | "unconfigured";
export type FinanceInvoiceState =
  | "not_completed"
  | "blocked_pod"
  | "blocked_policy"
  | "eligible"
  | "draft"
  | "issued";

export type FinanceWorkflowTripInput = {
  tripStatus?: string | null;
  policy: InvoicePodPolicy | null;
  physicalPodReceived: boolean;
  digitalPodPresent: boolean;
  invoiced: boolean;
  inDraft?: boolean;
};

export type FinanceWorkflowTripState = {
  completed: boolean;
  podState: FinancePodState;
  invoiceState: FinanceInvoiceState;
  invoiceable: boolean;
};

export function financePodState(args: {
  policy: InvoicePodPolicy | null;
  physicalPodReceived: boolean;
  digitalPodPresent: boolean;
}): FinancePodState {
  if (args.policy == null) return "unconfigured";
  if (args.policy === "none") return "not_required";
  if (args.policy === "soft_copy") {
    return args.digitalPodPresent ? "received" : "pending";
  }
  return args.physicalPodReceived ? "received" : "pending";
}

export function evaluateFinanceWorkflowTrip(
  input: FinanceWorkflowTripInput,
): FinanceWorkflowTripState {
  const completed = tripIsDeliveredStatus(input.tripStatus);
  const podState = financePodState({
    policy: input.policy,
    physicalPodReceived: input.physicalPodReceived,
    digitalPodPresent: input.digitalPodPresent,
  });

  if (input.invoiced) {
    return {
      completed,
      podState,
      invoiceState: "issued",
      invoiceable: false,
    };
  }
  if (input.inDraft) {
    return {
      completed,
      podState,
      invoiceState: "draft",
      invoiceable: false,
    };
  }
  if (!completed) {
    return {
      completed,
      podState,
      invoiceState: "not_completed",
      invoiceable: false,
    };
  }
  if (input.policy == null) {
    return {
      completed,
      podState,
      invoiceState: "blocked_policy",
      invoiceable: false,
    };
  }
  const policyOk = isTripEligibleForInvoicePodPolicy(input.policy, {
    digitalPodPresent: input.digitalPodPresent,
    physicalPodReceived: input.physicalPodReceived,
  });
  if (!policyOk) {
    return {
      completed,
      podState,
      invoiceState: "blocked_pod",
      invoiceable: false,
    };
  }
  return {
    completed,
    podState,
    invoiceState: "eligible",
    invoiceable: true,
  };
}

export function financeInvoiceStatusLabel(state: FinanceInvoiceState): string {
  switch (state) {
    case "issued":
      return "Invoiced";
    case "eligible":
      return "Ready for Invoice";
    case "draft":
      return "In Draft";
    case "blocked_pod":
      return "Invoice Blocked";
    case "blocked_policy":
      return "Policy Unconfigured";
    case "not_completed":
      return "Invoice Pending";
  }
}

export function financePodStatusLabel(state: FinancePodState): string {
  switch (state) {
    case "not_required":
      return "Not Required";
    case "received":
      return "Received";
    case "pending":
      return "Pending";
    case "unconfigured":
      return "Policy Unconfigured";
  }
}

export const INVOICE_TRIP_NOT_COMPLETED =
  "Only completed trips can be invoiced.";

export type FinanceClientPictureTrip = {
  id: string;
  tripStatus?: string | null;
  client_id?: string | null;
  client_price?: number | null;
  physicalPodReceived: boolean;
  digitalPodPresent: boolean;
};

export type FinanceClientPictureInvoice = {
  id: string;
  client_id?: string | null;
  client_name?: string | null;
  trip_ids?: string[] | null;
  total_amount?: number | null;
  status?: string | null;
};

export type FinanceClientPictureSummary = {
  listedTripCount: number;
  completedTripCount: number;
  podPendingTripCount: number;
  draftTripCount: number;
  unbilledTripCount: number;
  eligibleTripCount: number;
  invoicedTripCount: number;
  blockedTripCount: number;
  issuedInvoiceCount: number;
  issuedInvoiceValue: number;
  createInvoiceEnabled: boolean;
};

/** Client-scoped Invoice picture: listed stays visible; eligibility is separate. */
export function summarizeFinanceClientPicture(args: {
  clientId: string;
  clientName?: string | null;
  clientPolicy: InvoicePodPolicy | null;
  trips: FinanceClientPictureTrip[];
  issuedInvoices: FinanceClientPictureInvoice[];
}): FinanceClientPictureSummary {
  const issuedIds = new Set<string>();
  const draftIds = new Set<string>();
  for (const inv of args.issuedInvoices) {
    for (const id of inv.trip_ids ?? []) {
      if (!id) continue;
      if (invoiceStatusIsIssued(inv.status)) issuedIds.add(id);
      else if (invoiceStatusIsDraft(inv.status)) draftIds.add(id);
    }
  }

  const listed = args.trips.filter(
    (trip) => (trip.client_id ?? "").trim() === args.clientId,
  );

  let unbilledTripCount = 0;
  let eligibleTripCount = 0;
  let invoicedTripCount = 0;
  let blockedTripCount = 0;
  let completedTripCount = 0;
  let podPendingTripCount = 0;
  let draftTripCount = 0;

  for (const trip of listed) {
    const state = evaluateFinanceWorkflowTrip({
      tripStatus: trip.tripStatus,
      policy: args.clientPolicy,
      physicalPodReceived: trip.physicalPodReceived,
      digitalPodPresent: trip.digitalPodPresent,
      invoiced: issuedIds.has(trip.id),
      inDraft: draftIds.has(trip.id) && !issuedIds.has(trip.id),
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

  const matched = issuedInvoicesForClient(
    args.issuedInvoices
      .filter((row) => invoiceStatusIsIssued(row.status))
      .map((row) => ({
        id: row.id,
        invoice_number: "",
        invoice_date: "",
        due_date: null,
        client_id: row.client_id ?? null,
        client_name: row.client_name ?? null,
        total_amount: Number(row.total_amount ?? 0),
        status: row.status ?? "",
        trip_ids: Array.isArray(row.trip_ids) ? row.trip_ids : [],
      })),
    { clientId: args.clientId, clientName: args.clientName },
  );

  const issuedInvoiceValue = matched.reduce(
    (sum, row) => sum + (Number.isFinite(row.total_amount) ? row.total_amount : 0),
    0,
  );

  return {
    listedTripCount: listed.length,
    completedTripCount,
    podPendingTripCount,
    draftTripCount,
    unbilledTripCount,
    eligibleTripCount,
    invoicedTripCount,
    blockedTripCount,
    issuedInvoiceCount: matched.length,
    issuedInvoiceValue,
    createInvoiceEnabled: eligibleTripCount > 0,
  };
}
