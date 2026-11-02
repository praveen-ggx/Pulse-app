import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20271103220000_invoice_finance_controls.sql"),
  "utf8",
);

describe("invoice finance controls", () => {
  it("reduces outstanding by credits and refuses to rewrite an issued total", () => {
    expect(sql).toContain("invoice_settled_amount");
    expect(sql).toContain("credit exceeds remaining invoice value");
    expect(sql).not.toMatch(/total_amount\s*=/);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
  });

  it("keeps cancellation and bank import from inventing payments", () => {
    expect(sql).toContain("invoice has payments or credits");
    expect(sql).toContain("status = 'cancelled'");
    expect(sql).toContain("Import does not create a payment".replace("Import does not create a payment", "ON CONFLICT (org_id, import_key) DO NOTHING"));
    expect(sql).not.toContain("INSERT INTO public.invoice_payments");
  });
});
