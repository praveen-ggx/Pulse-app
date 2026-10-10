/**
 * Static contract for 20271008117000_compliance_flow_hardening.sql.
 * Not a database test — nothing here is applied to any project.
 */
import { readFileSync } from "fs";
import { join } from "path";

const NAME = "20271008117000_compliance_flow_hardening.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", NAME), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

function body(fn: string): string {
  const start = sql.indexOf(`function public.${fn}(`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("compliance flow hardening migration", () => {
  it("sorts after the resubmit gates migration", () => {
    expect(NAME > "20271008116000_compliance_resubmit_gates.sql").toBe(true);
    expect(NAME.slice(8, 14)).not.toBe("000000");
  });

  it("checks trip, vehicle and driver files (with storage) before Resubmit writes anything", () => {
    const files = body("compliance_missing_required_files");
    expect(files).toContain("storage.objects");
    expect(files).toContain("'trip-documents'");
    expect(files).toContain("array['rc', 'insurance', 'fitness']");
    expect(files).toContain("driver_kyc_documents");
    const resubmit = body("resubmit_trip_compliance");
    const gate = resubmit.indexOf("compliance_missing_required_files(p_trip_id)");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(resubmit.indexOf("insert into public.trip_workflow_events"));
  });

  it("lets Finance flag but not clear, and Compliance clear; Reject clears the flag", () => {
    expect(body("flag_trip_for_compliance")).toContain("'trip_compliance.finance.manage'");
    expect(body("clear_trip_finance_flag")).toContain("'trip_compliance.trip.mark_verified'");
    expect(body("reject_trip_compliance")).toContain("finance_flagged_at = null");
    expect(body("mark_trip_finance_verified")).toContain("flagged for compliance review");
    expect(sql).toContain("create policy compliance_advance_requires_no_finance_flag");
  });

  it("keeps the delete guard on the caller's role and never touches ledger rows", () => {
    const guard = body("guard_trip_document_delete");
    expect(guard).not.toContain("security definer");
    expect(guard).toContain("approved documents cannot be deleted");
    expect(sql).not.toMatch(/(delete from|update)\s+public\.transactions/i);
  });

  it("validates the paid-from account belongs to the paying org", () => {
    expect(body("check_transaction_paid_from_account")).toContain("a.entity_id = new.organization_id");
  });
});
