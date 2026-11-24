import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/hub-unassigned-excludes-cancelled.versions");
const FILE = "20271124132234_hub_unassigned_excludes_cancelled.sql";
const VERSION = "20271124132234";
const FILE2 = "20271124154500_hub_metric_contrib_excludes_cancelled_unassigned.sql";
const VERSION2 = "20271124154500";
const sql2 = fs.readFileSync(path.join(migrations, FILE2), "utf8");
const sql = fs.readFileSync(path.join(migrations, FILE), "utf8");

describe("hub-unassigned-excludes-cancelled release set", () => {
  it("lists only this migration, pinned by SHA-256, off-midnight and not frozen", () => {
    const lines = fs.readFileSync(setFile, "utf8").split("\n").map((line) => line.trim());
    const versions = lines.filter((line) => /^\d{14}$/.test(line));
    expect(versions).toEqual([VERSION, VERSION2]);
    for (const [v, f] of [[VERSION, FILE], [VERSION2, FILE2]]) {
      expect(v.endsWith("000000")).toBe(false);
      const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, f))).digest("hex");
      expect(lines[lines.indexOf(v) - 1]).toBe(`# sha256 ${actual}  ${f}`);
    }
    const frozen = fs
      .readFileSync(path.join(migrations, "../release-sets/FROZEN.versions"), "utf8")
      .split("\n")
      .map((line) => line.trim());
    expect(frozen).not.toContain(VERSION);
    expect(frozen).not.toContain(VERSION2);
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

  it("hub_metric_contrib drops cancelled from unassigned and keeps draft and the other buckets", () => {
    expect(sql2).not.toMatch(/IN \('cancelled', 'draft'\)/);
    expect(sql2).toMatch(/NOT IN \('completed', 'delivered', 'done', 'cancelled'\)\s+AND \(\s+tr\.driver_id IS NULL\s+OR lower\(coalesce\(tr\.status, ''\)\) = 'draft'/);
    expect(sql2).toMatch(/SELECT 'cancelled'\s+WHERE lower\(coalesce\(tr\.status, ''\)\) = 'cancelled'/);
    expect(sql2).toMatch(/CREATE OR REPLACE FUNCTION public\.hub_metric_contrib\(tr trips\)/);
  });

  it("the contrib migration sorts after the one that created hub_metric_contrib", () => {
    const all = fs.readdirSync(migrations).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
    expect(all.indexOf(FILE2)).toBeGreaterThan(all.indexOf("20271111164000_hub_metric_counter.sql"));
  });
});
