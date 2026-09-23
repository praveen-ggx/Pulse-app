import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20270922084500_invoice_billing_source_order_plan.sql",
  ),
  "utf8",
);

describe("invoice source migration contract", () => {
  it("is additive and keeps trip_ids", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS sales_order_id");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS plan_id");
    expect(sql).toContain("invoice_source");
    expect(sql).not.toMatch(/DROP COLUMN.*trip_ids/i);
    expect(sql).toContain("invoices_one_active_per_sales_order");
  });

  it("issues one order invoice atomically with idempotency", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.issue_sales_order_invoice(");
    expect(sql).toContain("Fulfilled");
    expect(sql).toContain("already has an active invoice");
    expect(sql).toContain("issue_idempotency_key");
    expect(sql).toContain("p_draft_id");
  });

  it("issues one manual-plan invoice with operator HSN and period uniqueness", () => {
    expect(sql).not.toContain("REFERENCES public.client_contracts");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.issue_manual_plan_invoice(");
    expect(sql).toContain("invoices_one_active_per_manual_plan_period");
    expect(sql).toContain("^[0-9]{4,8}$");
    expect(sql).toContain("already has an active invoice for this billing period");
  });
});
