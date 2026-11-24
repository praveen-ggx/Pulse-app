import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/hub-unassigned-excludes-cancelled.versions");
const FILE = "20271124132234_hub_unassigned_excludes_cancelled.sql";
const VERSION = "20271124132234";
const sql = fs.readFileSync(path.join(migrations, FILE), "utf8");

describe("hub-unassigned-excludes-cancelled release set", () => {
  it("lists only this migration, pinned by SHA-256, off-midnight and not frozen", () => {
    const lines = fs.readFileSync(setFile, "utf8").split("\n").map((line) => line.trim());
    const versions = lines.filter((line) => /^\d{14}$/.test(line));
    expect(versions).toEqual([VERSION]);
    expect(VERSION.endsWith("000000")).toBe(false);
    const pinned = lines[lines.indexOf(VERSION) - 1];
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, FILE))).digest("hex");
    expect(pinned).toBe(`# sha256 ${actual}  ${FILE}`);
    const frozen = fs
      .readFileSync(path.join(migrations, "../release-sets/FROZEN.versions"), "utf8")
      .split("\n")
      .map((line) => line.trim());
    expect(frozen).not.toContain(VERSION);
  });

  it("sorts after every migration that defines count_org_hub_metrics", () => {
    const all = fs.readdirSync(migrations).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
    const definers = all.filter(
      (f) =>
        f !== FILE &&
        fs.readFileSync(path.join(migrations, f), "utf8").includes("FUNCTION public.count_org_hub_metrics("),
    );
    expect(definers.length).toBeGreaterThan(0);
    for (const f of definers) expect(all.indexOf(FILE)).toBeGreaterThan(all.indexOf(f));
  });

  it("Unassigned excludes cancelled in both count paths and keeps draft", () => {
    const body = sql.slice(0, sql.indexOf("DO $do$"));
    expect(body).not.toMatch(/IN \('cancelled', 'draft'\)/);
    expect(body).toMatch(/NOT IN \('completed', 'delivered', 'done', 'cancelled'\)\s+AND \(\s+t\.driver_id IS NULL[\s\S]*?= 'draft'/);
    expect(body).toMatch(/st NOT IN \('completed', 'delivered', 'done', 'cancelled'\)\s+AND \(NOT has_driver OR st = 'draft'\)/);
  });

  it("leaves Cancelled, Active and the other stages as they were", () => {
    expect(sql).toMatch(/lower\(coalesce\(t\.status, ''\)\) = 'cancelled'\s+\)::int AS trips_cancelled/);
    expect(sql).toMatch(/FILTER \(WHERE st NOT IN \('completed', 'delivered', 'done', 'cancelled'\)\), 0\)::int AS trips_active/);
    expect(sql).toMatch(/hub_tile_match/);
    expect(sql).toMatch(/to_regprocedure\('public\.hub_tile_match\(text,boolean,text\)'\) IS NULL/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.hub_metric_contrib/);
  });
});
