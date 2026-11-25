import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/trips-rls-hoist.versions");
const FILE = "20261125131559_trips_rls_hoist_per_row_checks.sql";
const sql = fs.readFileSync(path.join(migrations, FILE), "utf8");

describe("trips-rls-hoist release set", () => {
  const lines = fs.readFileSync(setFile, "utf8").split("\n").map((l) => l.trim());
  const versions = lines.filter((l) => l !== "" && !l.startsWith("#"));

  it("lists exactly the one migration, never a 000000 time", () => {
    expect(versions).toEqual(["20261125131559"]);
    expect(versions[0]!.endsWith("000000")).toBe(false);
  });

  it("pins the migration file by SHA-256", () => {
    const pinned = /^# sha256 ([0-9a-f]{64}) {2}(\S+\.sql)$/.exec(lines.find((l) => l.startsWith("# sha256")) ?? "");
    expect(pinned?.[2]).toBe(FILE);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, FILE))).digest("hex");
    expect(actual).toBe(pinned?.[1]);
  });
});

describe("trips RLS hoist contract (access must not change)", () => {
  it("only alters the two named policies and creates no new ones", () => {
    const altered = [...sql.matchAll(/ALTER POLICY "([^"]+)" ON public\.trips/g)].map((m) => m[1]);
    expect(altered.sort()).toEqual(["Org members can manage trips", "trips_platform_admin_select"]);
    expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY/i);
  });

  it("keeps both platform permissions, now behind a scalar subquery", () => {
    expect(sql).toContain("'verification.review'");
    expect(sql).toContain("'verification.approve'");
    expect(sql).toMatch(/USING \(\(SELECT \(\s*public\.has_platform_permission/);
  });

  it("keeps the ground_ops exclusion on both USING and WITH CHECK", () => {
    expect(sql.match(/= 'ground_ops'/g)).toHaveLength(2);
  });

  it("uses the same org-staff roles as is_org_staff()", () => {
    expect(sql).toContain("ARRAY['owner','admin','member','dispatcher','finance']");
    expect(sql).toContain("om.status = 'active'");
  });

  it("set function is definer, empty search_path and not callable by anon/PUBLIC", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION private\.rls_staff_org_ids\(\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION private\.rls_staff_org_ids\(\) TO authenticated/);
  });

  it("no longer calls is_org_staff per row", () => {
    expect(sql).not.toMatch(/ALTER POLICY[\s\S]*is_org_staff\(organization_id\)/);
  });
});
