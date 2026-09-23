import fs from "fs";
import path from "path";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20270922084500_invoice_billing_source_order_plan.sql",
);

describe("commerce order invoice migration contract", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8");

  it("adds sales_order_id and invoice_source without dropping trip_ids", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS sales_order_id");
    expect(sql).toContain("invoice_source");
    expect(sql).not.toContain("DROP COLUMN trip_ids");
  });

  it("enforces one active invoice per sales order", () => {
    expect(sql).toContain("invoices_one_active_per_sales_order");
  });

  it("creates issue_sales_order_invoice with empty trip_ids and Fulfilled-only gate", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.issue_sales_order_invoice");
    expect(sql).toContain("'{}'::uuid[]");
    expect(sql).toContain("invoice_source = 'order'");
    expect(sql).toContain("IS DISTINCT FROM 'Fulfilled'");
  });

  it("does not FK plan_id to client_contracts", () => {
    expect(sql).not.toContain("REFERENCES public.client_contracts");
  });
});
