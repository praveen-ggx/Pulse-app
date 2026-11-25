import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/record-trip-operational-timeline-event.versions");
const FILE = "20261125132909_record_trip_operational_timeline_event.sql";
const sql = fs.readFileSync(path.join(migrations, FILE), "utf8");

describe("record-trip-operational-timeline-event release set", () => {
  const lines = fs.readFileSync(setFile, "utf8").split("\n").map((l) => l.trim());
  const versions = lines.filter((l) => l !== "" && !l.startsWith("#"));

  it("lists exactly the one migration, never a 000000 time", () => {
    expect(versions).toEqual(["20261125132909"]);
    expect(versions[0]!.endsWith("000000")).toBe(false);
  });

  it("pins the migration file by SHA-256", () => {
    const pinned = /^# sha256 ([0-9a-f]{64}) {2}(\S+\.sql)$/.exec(lines.find((l) => l.startsWith("# sha256")) ?? "");
    expect(pinned?.[2]).toBe(FILE);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, FILE))).digest("hex");
    expect(actual).toBe(pinned?.[1]);
  });
});

describe("record_trip_operational_timeline_event contract", () => {
  it("requires a session and an existing trip", () => {
    expect(sql).toContain("Not authenticated");
    expect(sql).toContain("not_found: trip");
  });

  it("allows only org members (old rule) or the trip's assigned driver for the trip's own org", () => {
    expect(sql).toMatch(/om\.organization_id = v_org[\s\S]*om\.user_id = v_uid[\s\S]*om\.status = 'active'/);
    expect(sql).toMatch(/v_org = v_trip_org[\s\S]*d\.id = v_driver_id[\s\S]*d\.user_id = v_uid/);
    expect(sql).toContain("unauthorized: caller must be a member");
  });

  it("does not change any table policy", () => {
    expect(sql).not.toMatch(/ALTER POLICY|CREATE POLICY|DROP POLICY/i);
  });

  it("is definer with empty search_path and not callable by anon/PUBLIC", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_trip_operational_timeline_event[\s\S]*FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_trip_operational_timeline_event[\s\S]*TO authenticated/);
  });
});
