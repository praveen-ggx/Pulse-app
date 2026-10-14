import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");

function read(name: string): string {
  return fs.readFileSync(path.join(migrations, name), "utf8");
}

const GODREJ_TX = "897a1bef-76c6-43bb-a4fa-b9d28df18a96";

describe("PR #1 migration guards", () => {
  it("keeps the unresolved Godrej compliance receipt out of the supplier rewrite", () => {
    const sql = read("20271012140000_compliance_payments_supplier_payable.sql");
    expect(sql).toContain(
      `AND tx.id IS DISTINCT FROM '${GODREJ_TX}'::uuid`,
    );
    expect(sql).not.toMatch(/dco_payee_id\s+is\s+not\s+null/i);
    expect(sql).toContain("contact_id = t.supplier_id");
  });

  it("requires the ground_ops role inside the helper and hides other orgs' indents", () => {
    const sql = read("20271008120000_ground_ops_trip_select_helper.sql");
    const helper = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.ground_ops_can_see_trip"),
      sql.indexOf("REVOKE ALL ON FUNCTION public.ground_ops_can_see_trip"),
    );
    expect(helper).toContain("COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'");
    expect(helper).toContain("i.organization_id = p_org_id");
    expect(helper).toContain("SET search_path TO ''");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.ground_ops_can_see_trip(uuid, uuid) FROM PUBLIC, anon;",
    );
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.ground_ops_can_see_trip[\s\S]*TO anon/i);
  });

  it("returns the live payment request when a concurrent insert hits the unique index", () => {
    const sql = read("20271013101500_payment_requests.sql");
    const fn = sql.slice(
      sql.indexOf("create or replace function public.issue_payment_request"),
      sql.indexOf("revoke all on function public.issue_payment_request"),
    );
    expect(sql).toContain("create unique index ux_payment_requests_live_trip_type");
    expect(fn).toContain("exception when unique_violation then");
    expect(fn).toContain("status <> 'cancelled'");
    expect(fn).not.toContain("grant execute on function public.issue_payment_request");
  });

  it("keeps the compliance-rejection gate in the later finance function", () => {
    const payment = read("20271013101500_payment_requests.sql");
    const cleared = read("20271013120000_compliance_cleared_gate.sql");
    const paymentFn = payment.slice(
      payment.indexOf("create or replace function public.mark_trip_finance_verified"),
      payment.indexOf("revoke all on function public.mark_trip_finance_verified"),
    );
    expect(paymentFn).not.toContain("compliance_cleared");
    expect(cleared).toContain(
      "this trip was rejected; Ground Ops must resubmit it before the advance can be approved",
    );
    expect(cleared.indexOf("compliance_cleared")).toBeGreaterThan(-1);
    expect("20271013120000" > "20271013101500").toBe(true);
  });
});
