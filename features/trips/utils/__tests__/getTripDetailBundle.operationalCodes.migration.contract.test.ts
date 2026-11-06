/**
 * Static contract: get_trip_detail_bundle returns trip_operational_code + trip_code.
 * Not a database test — nothing here is applied to any project.
 */
import { readFileSync } from "fs";
import { join } from "path";

const NAME = "20271104142208_get_trip_detail_bundle_operational_codes.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", NAME), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("get_trip_detail_bundle operational codes migration", () => {
  it("uses a non-midnight version and replaces get_trip_detail_bundle", () => {
    expect(NAME.slice(8, 14)).not.toBe("000000");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_trip_detail_bundle");
  });

  it("selects and returns trip_operational_code and trip_code on the trip object", () => {
    expect(sql).toContain("t.trip_operational_code");
    expect(sql).toContain("t.trip_code");
    expect(sql).toContain("'trip_operational_code'");
    expect(sql).toContain("'trip_code'");
    expect(sql).toContain("GRANT EXECUTE");
    expect(sql).toContain("TO authenticated");
  });
});
