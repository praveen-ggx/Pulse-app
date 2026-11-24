/**
 * Contract: Ground Ops simulate RPC accepts an optional stage clock so the
 * app can save the same picker ISO Trip Ops uses.
 */
import { readFileSync } from "fs";
import { join } from "path";

const FILE = "20271123101500_ground_ops_pickup_event_at.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", FILE), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("ground_ops_pickup_event_at migration", () => {
  it("has a real non-midnight timestamp", () => {
    expect(FILE.slice(0, 14)).toBe("20271123101500");
    expect(FILE.slice(8, 14)).not.toBe("000000");
  });

  it("sets lock_timeout as integer ms (SQL Editor-safe)", () => {
    expect(sql).toMatch(/set local lock_timeout\s*=\s*5000/i);
    expect(sql).not.toMatch(/lock_timeout\s*=\s*'5s'/i);
  });

  it("adds optional p_event_at and drops both overloads before recreate", () => {
    expect(sql).toMatch(
      /drop function if exists public\.simulate_ground_ops_pickup_status\s*\(\s*uuid\s*,\s*text\s*\)/i,
    );
    expect(sql).toMatch(
      /drop function if exists public\.simulate_ground_ops_pickup_status\s*\(\s*uuid\s*,\s*text\s*,\s*timestamptz\s*\)/i,
    );
    expect(sql).toMatch(/p_event_at\s+timestamptz\s+default\s+null/i);
  });

  it("writes the selected stage clock into BISIM and started_at", () => {
    expect(sql).toMatch(/v_event_at\s*:=\s*coalesce\s*\(\s*p_event_at\s*,\s*now\s*\(\s*\)\s*\)/i);
    expect(sql).toMatch(/v_event_at\s+AT TIME ZONE/i);
    expect(sql).toMatch(/\[BISIM\|/);
    expect(sql).toMatch(
      /started_at\s*=\s*case[\s\S]*in_progress[\s\S]*v_event_at/i,
    );
  });

  it("builds ISO without quoted T/Z inside to_char (SQL Editor-safe)", () => {
    expect(sql).toMatch(/\|\|\s*\$e\$T\$e\$/);
    expect(sql).toMatch(/\|\|\s*\$e\$Z\$e\$/);
    expect(sql).not.toMatch(/YYYY-MM-DD"T"HH24/);
  });

  it("also records editedAt save clock on the BISIM line", () => {
    expect(sql).toMatch(/v_edited_iso\s*:=/i);
    expect(sql).toContain("|| $e$||$e$ || v_edited_iso");
  });

  it("keeps the ground_ops role and warehouse gates", () => {
    expect(sql).toContain("platformRole");
    expect(sql).toContain("ground_ops");
    expect(sql).toContain("organization_member_warehouses");
  });

  it("dollar-quotes RAISE messages for SQL Editor paste safety", () => {
    expect(sql).toContain("RAISE EXCEPTION $e$Not authenticated$e$");
    expect(sql).not.toMatch(/RAISE EXCEPTION 'Not authenticated'/);
  });

  it("grants execute only to authenticated", () => {
    expect(sql).toMatch(
      /revoke all on function public\.simulate_ground_ops_pickup_status\(uuid, text, timestamptz\) from public/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.simulate_ground_ops_pickup_status\(uuid, text, timestamptz\) to authenticated/i,
    );
  });
});
