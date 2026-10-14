import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");

function read(name: string): string {
  return fs.readFileSync(path.join(migrations, name), "utf8");
}

const GODREJ_TX = "897a1bef-76c6-43bb-a4fa-b9d28df18a96";

describe("PR #1 migration guards", () => {
  it("keeps the Godrej receipt out of the supplier rewrite and classifies it as the existing DCO payee", () => {
    const supplier = read("20271012140000_compliance_payments_supplier_payable.sql");
    const godrej = read("20271014184500_godrej_dco_payable_classification.sql");
    expect(supplier).toContain(
      `AND tx.id IS DISTINCT FROM '${GODREJ_TX}'::uuid`,
    );
    expect(supplier).not.toMatch(/dco_payee_id\s+is\s+not\s+null/i);
    expect(supplier).toContain("contact_id = t.supplier_id");
    expect(supplier).not.toContain("dco_payee_id");
    expect(godrej).toContain(GODREJ_TX);
    expect(godrej).toContain("contact_type = 'dco'");
    expect(godrej).toContain("contact_id = v_payee");
    expect(godrej).toContain("v_amount_in is distinct from 3500");
    expect(godrej).not.toMatch(/supplier_id\s*=/i);
    expect(godrej).not.toMatch(/insert into public\.suppliers/i);
    expect(godrej).toContain("SET LOCAL lock_timeout = '5s';");
    expect("20271014184500" > "20271012140000").toBe(true);
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

    const issued = read("20271014183000_finance_approval_issues_payment_request.sql");
    const rejection = issued.indexOf(
      "this trip was rejected; Ground Ops must resubmit it before the advance can be approved",
    );
    const issueCalls = [...issued.matchAll(/perform public\.issue_payment_request/g)].map((m) => m.index ?? -1);
    expect(rejection).toBeGreaterThan(-1);
    expect(issueCalls).toHaveLength(2);
    expect(Math.min(...issueCalls)).toBeGreaterThan(rejection);
    expect(issued).not.toMatch(/unique_violation then\s+return/);
    expect("20271014183000" > "20271013120000").toBe(true);
    expect(issued).toContain("SET LOCAL lock_timeout = '5s';");
    expect(issued.indexOf("compliance must be verified before finance verify")).toBeGreaterThan(-1);
    expect(issued.indexOf("this trip is flagged for compliance review")).toBeGreaterThan(
      issued.indexOf("compliance must be verified before finance verify"),
    );
    const alreadyVerified = issued.indexOf("if v_finance_at is not null then");
    const firstIssue = Math.min(...issueCalls);
    expect(alreadyVerified).toBeGreaterThan(rejection);
    expect(firstIssue).toBeGreaterThan(alreadyVerified);
  });

  it("keeps the finance-approval release set as 131015 then 131200 then 141830", () => {
    const body = fs.readFileSync(
      path.join(migrations, "../release-sets/finance-approval.versions"),
      "utf8",
    );
    const versions = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d{14}$/.test(line));
    expect(versions).toEqual(["20271013101500", "20271013120000", "20271014183000"]);
    expect(body).not.toContain("20271014184500");
  });

  it("does not put the Godrej data rewrite in a release set", () => {
    const setsDir = path.join(migrations, "../release-sets");
    const named = fs.readdirSync(setsDir).filter((name) => name.endsWith(".versions"));
    for (const name of named) {
      const body = fs.readFileSync(path.join(setsDir, name), "utf8");
      expect(body).not.toContain("20271014184500");
    }
  });

  it("does not put the destructive rollback or the weaker quote guard in a release set", () => {
    const sets = fs.readdirSync(path.join(migrations, "../release-sets"));
    const named = sets.filter((name) => name.endsWith(".versions"));
    for (const name of named) {
      const body = fs.readFileSync(path.join(migrations, "../release-sets", name), "utf8");
      expect(body).not.toContain("20270930130000");
    }
    const weak = read("20270930213000_reject_award_of_inactive_indent.sql");
    const strong = read("20271014051328_reassert_gate1a_quote_accept_guard.sql");
    expect(weak).not.toContain("is_org_staff");
    expect(strong).toContain("is_org_staff");
    expect(strong).toContain("SECURITY DEFINER");
  });
});
