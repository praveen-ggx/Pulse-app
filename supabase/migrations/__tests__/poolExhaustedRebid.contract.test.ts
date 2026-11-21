import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/pool-exhausted-rebid.versions");
const FILE = "20271120101500_pool_exhausted_quotes_can_rebid.sql";
const sql = fs.readFileSync(path.join(migrations, FILE), "utf8");

function fnBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$function$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("pool-exhausted-rebid release set", () => {
  it("lists only this migration, pinned by SHA-256, off-midnight and not frozen", () => {
    const lines = fs.readFileSync(setFile, "utf8").split("\n").map((line) => line.trim());
    const versions = lines.filter((line) => /^\d{14}$/.test(line));
    expect(versions).toEqual(["20271120101500"]);
    expect(versions[0].endsWith("000000")).toBe(false);
    const pinned = lines[lines.indexOf("20271120101500") - 1];
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, FILE))).digest("hex");
    expect(pinned).toBe(`# sha256 ${actual}  ${FILE}`);
    const frozen = fs
      .readFileSync(path.join(migrations, "../release-sets/FROZEN.versions"), "utf8")
      .split("\n")
      .map((line) => line.trim());
    expect(frozen).not.toContain("20271120101500");
  });

  it("sorts after the award-integrity migration that closes exhausted pool quotes", () => {
    const all = fs.readdirSync(migrations).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
    expect(all.indexOf(FILE)).toBeGreaterThan(all.indexOf("20271118213000_marketplace_award_state_integrity.sql"));
  });

  it("reopens only quotes closed by pool exhaustion", () => {
    const helper = fnBody("direct_quote_closed_by_pool_exhaustion");
    expect(helper).toMatch(/dq\.status = 'rejected'/);
    expect(helper).toMatch(/c\.status = 'exhausted'/);
    expect(helper).toMatch(/dq\.updated_at = c\.updated_at/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.direct_quote_closed_by_pool_exhaustion\(uuid\) FROM PUBLIC, anon, authenticated;/);
  });

  it("submit_network_quote reopens before the lock check and keeps every other lock", () => {
    const body = fnBody("submit_network_quote");
    const reopen = body.indexOf("public.direct_quote_closed_by_pool_exhaustion(v_existing.id)");
    const lock = body.indexOf("RAISE EXCEPTION 'quote_locked: this quote is no longer open for changes (status=%)'");
    expect(reopen).toBeGreaterThan(0);
    expect(lock).toBeGreaterThan(reopen);
    // open-load and visibility checks still run before the reopen
    expect(body.indexOf("indent_open_for_marketplace_bids")).toBeLessThan(reopen);
    expect(body.indexOf("market_indents_for_org")).toBeLessThan(reopen);
    expect(body).toMatch(/pool_commit_id = NULL/);
  });

  it("get_org_network_pool marks those quotes quotable", () => {
    expect(fnBody("get_org_network_pool")).toMatch(
      /OR public\.direct_quote_closed_by_pool_exhaustion\(q\.id\)\) AS quotable/,
    );
  });
});
