/**
 * Static contract for 20271008118000_finance_reject_truck_size.sql.
 * Not a database test — nothing here is applied to any project.
 */
import { readFileSync } from "fs";
import { join } from "path";

const NAME = "20271008118000_finance_reject_truck_size.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", NAME), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("finance reject + truck size migration", () => {
  it("sorts after the hardening migration", () => {
    expect(NAME > "20271008117000_compliance_flow_hardening.sql").toBe(true);
    expect(NAME.slice(8, 14)).not.toBe("000000");
  });

  it("lets Reject accept the Finance surface but keeps the money guard", () => {
    const start = sql.indexOf("function public.reject_trip_compliance(");
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toContain("'trip_compliance.trip.mark_verified'");
    expect(body).toContain("'trip_compliance.finance.reject'");
    expect(body).toContain("an advance or balance is already posted");
    expect(sql).not.toMatch(/(delete from|update)\s+public\.transactions/i);
  });

  it("does not let the Finance surface verify", () => {
    expect(sql).not.toContain("function public.mark_trip_compliance_verified");
  });

  it("returns truck size with the type", () => {
    expect(sql).toContain("'vehicle_size',      v.vehicle_size");
    expect(sql).toContain("NULLIF(btrim(v.vehicle_size), '')");
  });
});
