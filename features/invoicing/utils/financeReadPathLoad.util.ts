/**
 * Inventory of Finance Pro read paths.
 * Canonical eligibility is evaluateFinanceWorkflowTrip — not one RPC.
 * Do not merge Invoice into get_trips_for_pod_org unless production
 * measurement shows duplicated DB work.
 */

export const FINANCE_POD_READ_STEPS = [
  "rpc:get_trips_for_pod_org",
  "select:suppliers(name) batched",
  "select:drivers(name) batched",
  "select:trip_documents LR/POD index by trip id chunks",
  "select:clients.invoice_pod_policy batched",
] as const;

export const FINANCE_INVOICE_READ_STEPS = [
  "select:trips owner org",
  "rpc/service:supplier-visible trips",
  "select:invoices (issued + trip_ids)",
  "select:trip_documents document_type=pod for soft_copy clients only",
  "select:clients.invoice_pod_policy batched",
] as const;

export function financeReadPathsAreSeparate(): boolean {
  return !FINANCE_INVOICE_READ_STEPS.includes(
    "rpc:get_trips_for_pod_org" as (typeof FINANCE_INVOICE_READ_STEPS)[number],
  );
}
