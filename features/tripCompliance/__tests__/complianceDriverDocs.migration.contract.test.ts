/**
 * Static contract for get_compliance_driver_docs_for_trips.
 * Not a database test — nothing here is applied to any project.
 */
import { readFileSync } from "fs";
import { join } from "path";

const NAME = "20261104095549_get_compliance_driver_docs_for_trips.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", NAME), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("get_compliance_driver_docs_for_trips migration", () => {
  it("uses a non-midnight version and authorizes via compliance_visible_trips", () => {
    expect(NAME.slice(8, 14)).not.toBe("000000");
    expect(sql).toContain("private.compliance_visible_trips");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("get_compliance_driver_docs_for_trips");
  });

  it("returns licence and aadhaar from entity_documents and driver_kyc_documents", () => {
    expect(sql).toContain("entity_documents");
    expect(sql).toContain("driver_kyc_documents");
    expect(sql).toContain("'license'");
    expect(sql).toContain("'aadhaar'");
    expect(sql).toContain("'driver-kyc'");
    expect(sql).toContain("GRANT EXECUTE");
    expect(sql).toContain("TO authenticated");
  });
});
