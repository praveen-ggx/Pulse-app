import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20270922114827_invoice_source_manual.sql",
  ),
  "utf8",
);

describe("manual invoice source migration contract", () => {
  it("allows invoice_source = manual without a Client Plan", () => {
    expect(sql).toContain("'trip', 'order', 'manual', 'manual_plan'");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.issue_manual_invoice(");
    expect(sql).not.toContain("client_contracts");
    expect(sql).not.toContain("p_plan_id");
    expect(sql).toContain("invoice_source = 'manual'");
  });
});
