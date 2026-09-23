import type { InvoiceLineSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import { round2 } from "@/features/invoicing/services/invoiceTax.service";

export type ManualClientPlan = {
  id: string;
  client_id: string;
  pickup_area: string;
  drop_location: string;
  rate: number | null;
  rate_type: string | null;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
};

export function defaultBillingPeriod(today = new Date()): {
  start: string;
  end: string;
} {
  const y = today.getFullYear();
  const m = today.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}

export function manualPlanDisplayName(plan: ManualClientPlan): string {
  const lane = `${plan.pickup_area} → ${plan.drop_location}`.trim();
  return lane === "→" ? (plan.notes ?? "").trim() || "Client plan" : lane;
}

export function buildManualPlanInvoiceLines(args: {
  plan: ManualClientPlan;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  taxRate?: number | null;
  /** Operator-entered. Never invented from the contract. */
  hsnSac?: string | null;
}): InvoiceLineSnapshot[] {
  const rate = Number.isFinite(args.plan.rate) ? Number(args.plan.rate) : 0;
  const sku = `PLAN-${(args.plan.rate_type ?? "fixed").toUpperCase()}`;
  const hsn = (args.hsnSac ?? "").replace(/\s+/g, "").replace(/[^0-9]/g, "");
  return [
    {
      trip_id: null,
      trip_ref: sku,
      description: `${manualPlanDisplayName(args.plan)} (${args.billingPeriodStart} – ${args.billingPeriodEnd})`,
      qty: 1,
      unit: "period",
      rate,
      taxable_value: round2(rate),
      line_type: "plan",
      hsn_sac: hsn.length > 0 ? hsn : null,
      tax_rate: args.taxRate ?? 18,
    },
  ];
}

export function manualPlanSnapshot(args: {
  plan: ManualClientPlan;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  hsnSac?: string | null;
}): Record<string, unknown> {
  const hsn = (args.hsnSac ?? "").replace(/\s+/g, "").replace(/[^0-9]/g, "");
  return {
    plan_id: args.plan.id,
    plan_name: manualPlanDisplayName(args.plan),
    rate: args.plan.rate,
    rate_type: args.plan.rate_type,
    sku: `PLAN-${(args.plan.rate_type ?? "fixed").toUpperCase()}`,
    hsn_sac: hsn.length > 0 ? hsn : null,
    billing_period_start: args.billingPeriodStart,
    billing_period_end: args.billingPeriodEnd,
  };
}
