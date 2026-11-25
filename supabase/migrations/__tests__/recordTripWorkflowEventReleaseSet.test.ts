import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/record-trip-workflow-event.versions");
const FILE = "20261125124952_record_trip_workflow_event.sql";

describe("record-trip-workflow-event release set", () => {
  const lines = fs.readFileSync(setFile, "utf8").split("\n").map((l) => l.trim());
  const versions = lines.filter((l) => l !== "" && !l.startsWith("#"));

  it("lists exactly the one migration, never a 000000 time", () => {
    expect(versions).toEqual(["20261125124952"]);
    expect(versions[0]!.endsWith("000000")).toBe(false);
  });

  it("pins the migration file by SHA-256", () => {
    const pinned = /^# sha256 ([0-9a-f]{64}) {2}(\S+\.sql)$/.exec(lines.find((l) => l.startsWith("# sha256")) ?? "");
    expect(pinned?.[2]).toBe(FILE);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, FILE))).digest("hex");
    expect(actual).toBe(pinned?.[1]);
  });
});

describe("record_trip_workflow_event migration contract", () => {
  const sql = fs.readFileSync(path.join(migrations, FILE), "utf8");

  it("requires auth, org membership and a deterministic key", () => {
    expect(sql).toContain("Not authenticated");
    expect(sql).toMatch(/organization_members om[\s\S]*om\.user_id = v_uid/);
    expect(sql).toContain("invalid_idempotency_key");
  });

  it("is a quiet no-op on duplicates via the partial unique index", () => {
    expect(sql).toContain("ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING");
  });

  it("is not executable by anon/PUBLIC", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_trip_workflow_event[\s\S]*FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_trip_workflow_event[\s\S]*TO authenticated/);
  });

  it("is SECURITY DEFINER with an empty search_path", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO ''");
  });
});
