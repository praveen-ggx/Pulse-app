import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import type { InvoicePodPolicy } from "@/features/invoicing/utils/invoicePodPolicy.util";
import type {
  FinanceInvoiceState,
  FinanceWorkflowTripState,
} from "@/features/invoicing/utils/financeWorkflowState.util";

export type InvoicePodRequiredMode = "on" | "off" | "soft" | "unconfigured";

/** Presentation only. Eligibility stays in evaluateFinanceWorkflowTrip. */
export function invoicePodRequiredMode(
  policy: InvoicePodPolicy | null,
): InvoicePodRequiredMode {
  if (policy == null) return "unconfigured";
  if (policy === "none") return "off";
  if (policy === "soft_copy") return "soft";
  return "on";
}

export function invoicePodRequiredModeLabel(
  policy: InvoicePodPolicy | null,
): string {
  switch (invoicePodRequiredMode(policy)) {
    case "on":
      return "POD Required · ON";
    case "off":
      return "POD Required · OFF";
    case "soft":
      return "Soft POD";
    case "unconfigured":
      return "POD policy not configured";
  }
}

export function financeInvoiceWorkspacePill(
  state: FinanceInvoiceState,
): string {
  switch (state) {
    case "issued":
      return "Invoiced";
    case "eligible":
      return "Eligible";
    case "draft":
      return "Draft";
    case "blocked_pod":
      return "POD pending";
    case "blocked_policy":
      return "Unconfigured";
    case "not_completed":
      return "Not completed";
  }
}

/** Hard-copy receipt is loggable. Soft-copy gaps are not this action. */
export function isInvoiceHardPodLoggable(args: {
  state: FinanceWorkflowTripState;
  policy: InvoicePodPolicy | null;
  physicalPodReceived: boolean;
}): boolean {
  if (!args.state.completed) return false;
  if (
    args.state.invoiceState === "issued" ||
    args.state.invoiceState === "draft"
  ) {
    return false;
  }
  if (args.physicalPodReceived) return false;
  if (args.policy === "hard_copy" && args.state.invoiceState === "blocked_pod") {
    return true;
  }
  if (args.policy === "none" && args.state.invoiceState === "eligible") {
    return true;
  }
  return false;
}

export function isInvoiceWorkspaceSelectable(args: {
  state: FinanceWorkflowTripState;
  policy: InvoicePodPolicy | null;
  physicalPodReceived: boolean;
}): boolean {
  return (
    args.state.invoiceable === true ||
    isInvoiceHardPodLoggable(args)
  );
}

export type InvoiceWorkspaceSelectionSummary = {
  selectedCount: number;
  podLoggableCount: number;
  invoiceableCount: number;
  invoicedCount: number;
  blockedCount: number;
};

export function summarizeInvoiceWorkspaceSelection(
  rows: Array<{
    selected: boolean;
    state: FinanceWorkflowTripState;
    policy: InvoicePodPolicy | null;
    physicalPodReceived: boolean;
  }>,
): InvoiceWorkspaceSelectionSummary {
  let selectedCount = 0;
  let podLoggableCount = 0;
  let invoiceableCount = 0;
  let invoicedCount = 0;
  let blockedCount = 0;
  for (const row of rows) {
    if (!row.selected) continue;
    selectedCount += 1;
    if (row.state.invoiceable) invoiceableCount += 1;
    if (isInvoiceHardPodLoggable(row)) podLoggableCount += 1;
    if (row.state.invoiceState === "issued") invoicedCount += 1;
    if (
      row.state.invoiceState === "blocked_pod" ||
      row.state.invoiceState === "blocked_policy" ||
      row.state.invoiceState === "not_completed"
    ) {
      blockedCount += 1;
    }
  }
  return {
    selectedCount,
    podLoggableCount,
    invoiceableCount,
    invoicedCount,
    blockedCount,
  };
}

export function filterInvoicePreviewTrips(
  trips: InvoicingTripView[],
  isInvoiceable: (trip: InvoicingTripView) => boolean,
): InvoicingTripView[] {
  return trips.filter((trip) => isInvoiceable(trip));
}

export type HardCopyPodReceiptCandidate = {
  id: string;
  displayId?: string;
  exists?: boolean;
  clientId?: string | null;
  completed: boolean;
  physicalPodReceived: boolean;
};

/** Fail closed — never silently skip a selected trip. */
export function validateHardCopyPodReceiptSelection(args: {
  candidates: HardCopyPodReceiptCandidate[];
  expectedClientId: string;
}): { ok: true } | { ok: false; message: string } {
  if (args.candidates.length === 0) {
    return { ok: false, message: "Select at least one pending trip." };
  }
  const expected = args.expectedClientId.trim();
  for (const trip of args.candidates) {
    const label = (trip.displayId || trip.id).trim() || "Trip";
    const ineligible = `${label} is no longer eligible for POD logging.`;
    if (trip.exists === false) return { ok: false, message: ineligible };
    if (!expected || (trip.clientId ?? "").trim() !== expected) {
      return { ok: false, message: ineligible };
    }
    if (!trip.completed || trip.physicalPodReceived) {
      return { ok: false, message: ineligible };
    }
  }
  return { ok: true };
}

export function invoicePreviewExclusionNote(args: {
  selectedCount: number;
  invoiceableCount: number;
}): string | null {
  const skipped = args.selectedCount - args.invoiceableCount;
  if (args.selectedCount <= 0 || skipped <= 0) return null;
  return `${skipped} selected trip${skipped === 1 ? " is" : "s are"} not invoiceable`;
}
