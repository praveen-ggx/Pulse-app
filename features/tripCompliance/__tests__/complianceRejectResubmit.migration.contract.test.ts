/**
 * Static contract for finance verify + finance reject/resubmit.
 * Not a database test — nothing here is applied to a remote project.
 */
import { readFileSync } from "fs";
import { join } from "path";

const DIR = join(process.cwd(), "supabase/migrations");
const financeSql = readFileSync(join(DIR, "20271008112000_finance_verified_step.sql"), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");
const rejectSql = readFileSync(join(DIR, "20271008113000_compliance_reject_resubmit.sql"), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("finance verify migration", () => {
  it("sorts after the committed head and is not the untracked draft name", () => {
    expect("20271008112000_finance_verified_step.sql" > "20271008101106_route_extra_stops.sql").toBe(true);
    expect("20271008112000_finance_verified_step.sql".slice(8, 14)).not.toBe("000000");
  });

  it("gates a new advance on finance_verified_at and refuses when an advance exists", () => {
    expect(financeSql).toContain("finance_verified_at is not null");
    expect(financeSql).toContain("an advance is already posted for this trip");
    expect(financeSql).toContain("an advance is already posted; finance verify cannot be undone");
    expect(financeSql).toContain("security definer");
    expect(financeSql).toContain("set search_path = public");
    expect(financeSql).not.toContain("ledger_category is distinct from 'compliance_balance'");
  });
});

describe("reject and resubmit migration", () => {
  it("sorts after finance verify", () => {
    expect("20271008113000_compliance_reject_resubmit.sql" > "20271008112000_finance_verified_step.sql").toBe(true);
  });

  it("refuses money rows before writing, clears finance approval, and does not touch compliance_verified_at", () => {
    const rejectStart = rejectSql.indexOf("function public.reject_trip_compliance");
    const rejectBody = rejectSql.slice(rejectStart, rejectSql.indexOf("function public.resubmit_trip_compliance"));
    expect(rejectBody.indexOf("an advance or balance is already posted")).toBeLessThan(
      rejectBody.indexOf("insert into public.trip_workflow_events"),
    );
    expect(rejectBody).toContain("finance_verified_at = null");
    expect(rejectBody).toContain("compliance_reject_return_to = v_dest");
    expect(rejectBody).not.toContain("compliance_verified_at =");
    expect(rejectBody).toContain("for update");
  });

  it("resubmit uses the stored queue and does not verify", () => {
    const body = rejectSql.slice(rejectSql.indexOf("function public.resubmit_trip_compliance"));
    expect(body).toContain("trip_compliance.trip.resubmit");
    expect(body).toContain("this reject has no return queue");
    expect(body).toContain("compliance.resubmitted");
    expect(body).toContain("compliance_resubmitted_at = now()");
    expect(body).not.toContain("compliance_verified_at =");
    expect(body).toContain("an advance or balance is already posted; compliance cannot be resubmitted");
  });

  it("maps preset reasons the same way as the client", () => {
    expect(rejectSql).toContain("'truck no mismatch', 'client date mismatch'");
    expect(rejectSql).toContain("'memo missing', 'vendor mismatch', 'vendor rate mismatch'");
    expect(rejectSql).toContain("return 'pending_for_docs'");
    expect(rejectSql).toContain("return 'compliance_pending'");
  });
});
