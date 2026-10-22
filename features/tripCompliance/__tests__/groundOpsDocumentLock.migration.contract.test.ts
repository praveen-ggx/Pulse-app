/**
 * Static contract for the Ground Ops trip-document lock. Keeps the database
 * guard and groundOpsDocumentLock.util in step. Not a database test.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  GROUND_OPS_LOCKED_TRIP_STATUSES,
  GROUND_OPS_OWN_UPLOAD_GRACE_MS,
} from "@/features/tripCompliance/utils/groundOpsDocumentLock.util";

const FILE = "20261022093720_ground_ops_trip_document_lock.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", FILE), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("ground_ops_trip_document_lock migration", () => {
  it("has a real timestamp, never the sibling repo's 000000 slot", () => {
    expect(FILE.slice(8, 14)).not.toBe("000000");
  });

  it("locks exactly the trip statuses the app locks", () => {
    const match = /lower\(coalesce\(v_trip\.status, ''\)\) in\s*\(([^)]*)\)/.exec(sql);
    expect(match).not.toBeNull();
    const statuses = [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(statuses).toEqual([...GROUND_OPS_LOCKED_TRIP_STATUSES].sort());
  });

  it("keeps the reject exceptions: rejected document and awaiting resubmit", () => {
    expect(sql).toContain("lower(coalesce(p_document_status, '')) = 'rejected'");
    expect(sql).toContain("public.compliance_awaiting_resubmit(");
  });

  it("locks on approval, advance approval and a posted advance", () => {
    expect(sql).toContain("ledger_category = 'compliance_advance'");
    expect(sql).toContain("v_trip.finance_verified_at is not null");
    expect(sql).toContain("v_trip.compliance_verified_at is not null");
  });

  it("applies only to active Ground Ops members of the trip's organisation", () => {
    expect(sql).toContain("om.permissions ->> 'platformRole' = 'ground_ops'");
    expect(sql).toContain("om.status = 'active'");
    expect(sql).toContain("om.user_id = auth.uid()");
  });

  it("guards insert, update and delete, and leaves service-role writes alone", () => {
    expect(sql).toMatch(/before insert or update or delete on public\.trip_documents/);
    expect(sql).toContain("if current_user <> 'authenticated' then");
  });

  it("never lets anon call the lock helper", () => {
    expect(sql).toMatch(
      /revoke all on function public\.ground_ops_trip_document_lock_reason\(uuid, text\) from anon/,
    );
  });

  it("uses the same own-upload grace window as the app", () => {
    const m = /v_grace constant interval := interval '(\d+) minutes'/.exec(sql);
    expect(m).not.toBeNull();
    expect(Number(m![1]) * 60 * 1000).toBe(GROUND_OPS_OWN_UPLOAD_GRACE_MS);
    expect(sql).toContain("old.uploaded_by = auth.uid() and old.uploaded_at > now() - v_grace");
    expect(sql).toContain("td.uploaded_by = auth.uid() and td.uploaded_at > now() - v_grace");
  });
});
