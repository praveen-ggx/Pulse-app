import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/record-trip-events-hardening.versions");
const FILE = "20261125142041_harden_trip_event_functions.sql";
const raw = fs.readFileSync(path.join(migrations, FILE), "utf8");
const sql = raw.replace(/--.*$/gm, "");

describe("record-trip-events-hardening release set", () => {
  const lines = fs.readFileSync(setFile, "utf8").split("\n").map((l) => l.trim());
  const versions = lines.filter((l) => l !== "" && !l.startsWith("#"));

  it("lists exactly the one migration, never a 000000 time", () => {
    expect(versions).toEqual(["20261125142041"]);
  });

  it("pins the migration file by SHA-256", () => {
    const pinned = /^# sha256 ([0-9a-f]{64}) {2}(\S+\.sql)$/.exec(lines.find((l) => l.startsWith("# sha256")) ?? "");
    expect(pinned?.[2]).toBe(FILE);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, FILE))).digest("hex");
    expect(actual).toBe(pinned?.[1]);
  });
});

describe("hardening migration contract (behaviour is proven by scripts/run-trip-event-functions-local-test.sh)", () => {
  it("only replaces functions and adds one helper: no table, policy, index, trigger or data statements", () => {
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP)\s+(TABLE|POLICY|INDEX|TRIGGER|EXTENSION)\b/i);
    expect(sql).not.toMatch(/\b(UPDATE\s+public|DELETE\s+FROM|TRUNCATE)\b/i);
    expect([...sql.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\(/g)].map((m) => m[1])).toEqual([
      "private.org_is_trip_party",
      "public.record_trip_workflow_event",
      "public.record_trip_operational_timeline_event",
    ]);
  });

  it("keeps both public signatures (the app needs no change)", () => {
    expect(sql).toMatch(/record_trip_workflow_event\(\s*p_trip_id\s+uuid,\s*p_org_id\s+uuid,\s*p_event_type\s+text,\s*p_payload\s+jsonb DEFAULT '\{\}'::jsonb,\s*p_idempotency_key text\s+DEFAULT NULL\s*\)/);
    expect(sql).toMatch(/record_trip_operational_timeline_event\(\s*p_trip_id\s+uuid,\s*p_event_type\s+text,\s*p_organization_id uuid\s+DEFAULT NULL/);
  });

  it("limits the driver path: fixed event types, approval_changed only for a driver cancel, actor forced to the caller", () => {
    for (const t of ["odometer_added", "discrepancy_detected", "fuel_logged", "toll_logged", "other_expense_logged", "reimbursement_flagged", "replay_completed", "replay_failed"]) {
      expect(sql).toContain(`'${t}'`);
    }
    expect(sql).toContain("v_payload ->> 'action' = 'driver_cancelled'");
    expect(sql).toMatch(/IF v_driver THEN\s+v_actor := v_uid/);
    for (const t of ["posting_completed", "posting_failed", "maintenance_logged"]) {
      expect(sql).not.toContain(`'${t}'`);
    }
  });

  it("requires a party org and an active membership for both functions", () => {
    expect(sql.match(/org_is_trip_party\(/g)!.length).toBeGreaterThanOrEqual(3);
    expect(sql.match(/om\.status = 'active'/g)!.length).toBe(2);
  });

  it("uses one generic error so trip ids cannot be probed", () => {
    expect(sql).not.toContain("not_found");
  });

  it("keeps definer + empty search_path, and no grant to anon/PUBLIC on the helper", () => {
    expect(sql.match(/SECURITY DEFINER/g)!.length).toBe(3);
    expect(sql.match(/SET search_path TO ''/g)!.length).toBe(3);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION private\.org_is_trip_party\(uuid, uuid\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION private\.org_is_trip_party\(uuid, uuid\) TO authenticated/);
  });
});
