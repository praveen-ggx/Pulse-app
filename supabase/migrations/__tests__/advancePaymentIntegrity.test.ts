import fs from "fs";
import path from "path";

const sql = fs.readFileSync(
  path.join(__dirname, "../20271117194500_advance_approval_terms_guard.sql"),
  "utf8",
);

function body(name: string): string {
  const start = sql.indexOf(`function public.${name}`);
  const next = sql.indexOf("create or replace function public.", start + 10);
  return sql.slice(start, next === -1 ? undefined : next);
}

describe("advance approval terms guard", () => {
  it("rejects an advance above the locked trip freight and requires an amount", () => {
    const issue = body("issue_payment_request");
    expect(issue).toContain("for update");
    expect(issue).toContain("trip freight is not set; the advance cannot be approved");
    expect(issue).toContain("approved amount is required");
    expect(issue).toContain("approved amount exceeds current trip freight");
    expect(issue).toContain("exception when unique_violation then");
    expect(issue).toContain("terms_snapshot");
    expect(issue).not.toContain("grant execute on function public.issue_payment_request");
  });

  it("blocks payment before approval, above the approved amount, and after trip terms change", () => {
    const link = body("tg_transactions_link_payment_request");
    expect(link).toContain("payment organization does not match the trip");
    expect(link).toContain("advance cannot be paid before it is approved");
    expect(link).toContain("payment amount exceeds the approved advance");
    expect(link).toContain("trip terms changed after approval; reapprove the advance");
    expect(link).toContain("on conflict (transaction_id) do nothing");
    expect(link.indexOf("advance cannot be paid before it is approved")).toBeLessThan(
      link.indexOf("payment amount exceeds the approved advance"),
    );
  });

  it("freezes the freight snapshot with the approved amount", () => {
    expect(sql).toContain("new.terms_snapshot is distinct from old.terms_snapshot");
    expect(sql).toContain("add column if not exists terms_snapshot jsonb");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/update\s+public\.transactions/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.transactions/i);
  });

  it("keeps the insert guard off delete and off a null legacy snapshot", () => {
    const link = body("tg_transactions_link_payment_request");
    expect(link.indexOf("if tg_op = 'DELETE'")).toBeGreaterThan(-1);
    expect(link.indexOf("if tg_op = 'DELETE'")).toBeLessThan(
      link.indexOf("payment organization does not match the trip"),
    );
    expect(link.indexOf("if v_snapshot is not null")).toBeLessThan(
      link.indexOf("trip terms changed after approval"),
    );
    expect(link).not.toContain("6e708a85-dca2-4151-acd8-902db6431aa2");
    expect(link).not.toContain("897a1bef-76c6-43bb-a4fa-b9d28df18a96");
  });

  it("keeps the new release set to this migration and leaves the finance set unchanged", () => {
    const sets = path.join(__dirname, "../../release-sets");
    const advance = fs.readFileSync(path.join(sets, "advance-approval-terms.versions"), "utf8");
    const finance = fs.readFileSync(path.join(sets, "finance-approval.versions"), "utf8");
    const versions = (body: string) =>
      body
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d{14}$/.test(line));
    expect(versions(advance)).toEqual(["20271117194500"]);
    expect(advance).toContain("Not authorized");
    expect(versions(finance)).toEqual(["20271013101500", "20271013120000", "20271014183000"]);
    expect(versions(advance).some((version) => versions(finance).includes(version))).toBe(false);
  });

  it("uses rate times tons only for per_mt freight", () => {
    const terms = body("compliance_advance_terms");
    expect(terms).toContain("per_mt");
    expect(terms).toContain("round(v_rate * v_tons, 2)");
    expect(terms).toContain("round(v_rate, 2)");
    expect(sql).toContain(
      "revoke all on function public.compliance_advance_terms(uuid) from public, anon, authenticated",
    );
  });
});
