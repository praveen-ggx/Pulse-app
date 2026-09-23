/**
 * Manual Plan invoice is blocked until a dedicated Client Plan entity exists.
 * Do not treat client_contracts, execution_plans, workspace_products, or
 * reach_plans as that entity. Do not enable free-form Manual Invoice as a
 * substitute for Client Plan billing.
 */

export type ClientPlanInvoiceAvailability = {
  available: false;
  reason: string;
};

export function resolveClientPlanInvoiceAvailability(): ClientPlanInvoiceAvailability {
  return {
    available: false,
    reason:
      "Manual Plan Invoice unavailable. Client Plan entity is not configured.",
  };
}
