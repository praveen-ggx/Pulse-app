/**
 * Ground Ops may correct an e-way bill during loading. The lock trigger still
 * blocks the change once the trip has moved on.
 */
import { readFileSync } from "fs";
import { join } from "path";

const FILE = "20271110133819_ground_ops_eway_bill_correct.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", FILE), "utf8");

describe("ground ops e-way correction migration", () => {
  it("sorts after the previous migration and is not a midnight slot", () => {
    expect(FILE.slice(0, 14) > "20271107190000").toBe(true);
    expect(FILE.slice(8, 14)).not.toBe("000000");
  });

  it("bounds the lock wait on trip_documents", () => {
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
  });

  it("opens update and delete only for e-way bills Ground Ops may still correct", () => {
    expect(sql).toContain("ground_ops_can_correct_eway_bill");
    expect(sql).toContain("ground_ops_trip_document_lock_reason");
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("document_type = 'eway_bill'");
    expect(sql).toContain("trip_documents_ground_ops_eway_update");
    expect(sql).toContain("trip_documents_ground_ops_eway_delete");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("FOR DELETE");
  });

  it("lets Ground Ops remove the e-way file from storage while the trip is unlocked", () => {
    expect(sql).toContain("coalesce(v_parts[2], '') = 'eway_bill'");
  });

  it("never lets anon call the helper", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.ground_ops_can_correct_eway_bill\(uuid, text, uuid, timestamptz\) FROM PUBLIC, anon/,
    );
  });
});
