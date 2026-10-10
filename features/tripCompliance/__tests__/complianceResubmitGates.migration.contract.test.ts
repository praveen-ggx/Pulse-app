/**
 * Static contract for 20271008116000_compliance_resubmit_gates.sql.
 * Not a database test — nothing here is applied to any project.
 */
import { readFileSync } from "fs";
import { join } from "path";

const NAME = "20271008116000_compliance_resubmit_gates.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", NAME), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

function body(fn: string): string {
  const start = sql.indexOf(`function public.${fn}(`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("resubmit gates migration", () => {
  it("sorts after the resubmit note migration and is not a midnight version", () => {
    expect(NAME > "20271008115000_compliance_resubmit_note.sql").toBe(true);
    expect(NAME.slice(8, 14)).not.toBe("000000");
  });

  it("blocks Verify and Verify-with-exception until Ground Ops resubmits", () => {
    for (const fn of ["mark_trip_compliance_verified", "approve_trip_compliance_with_exception"]) {
      const text = body(fn);
      expect(text).toContain("compliance_awaiting_resubmit(");
      expect(text).toContain("must resubmit it before it can be verified");
      expect(text).toContain("security definer");
      expect(text).toContain("set search_path = public");
    }
    const rule = body("compliance_awaiting_resubmit");
    expect(rule).toContain("p_declined_at >= p_verified_at");
    expect(rule).toContain("p_resubmitted_at < p_declined_at");
  });

  it("lets exception approval re-approve a resubmitted reject with a distinct event key", () => {
    const text = body("approve_trip_compliance_with_exception");
    expect(text).toContain("v_reapproval");
    expect(text).toContain("extract(epoch from v_declined_at)");
  });

  it("refuses Resubmit while a required trip document is missing or rejected, before any write", () => {
    const text = body("resubmit_trip_compliance");
    const gate = text.indexOf("required documents missing or rejected");
    expect(gate).toBeGreaterThan(-1);
    expect(text).toContain("array['lr', 'eway_bill', 'invoice']");
    expect(text).toContain("<> 'rejected'");
    expect(gate).toBeLessThan(text.indexOf("insert into public.trip_workflow_events"));
    expect(gate).toBeLessThan(text.indexOf("update public.trips"));
  });

  it("no longer needs a stored return queue to resubmit, and never touches ledger rows", () => {
    const text = body("resubmit_trip_compliance");
    expect(text).not.toContain("this reject has no return queue");
    expect(text).toContain("idempotency_key");
    expect(sql).not.toMatch(/(delete from|update)\s+public\.transactions/i);
  });

  it("keeps grants to authenticated only", () => {
    expect(sql).toContain("revoke all on function public.resubmit_trip_compliance(uuid, text, text) from anon");
    expect(sql).toContain("grant execute on function public.resubmit_trip_compliance(uuid, text, text) to authenticated");
  });
});
