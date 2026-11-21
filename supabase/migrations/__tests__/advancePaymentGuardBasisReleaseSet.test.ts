import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const releaseSets = path.join(migrations, "../release-sets");
const setFile = path.join(releaseSets, "advance-payment-guard-basis.versions");
const FILE = "20261121113052_advance_payment_guard_resolved_basis.sql";

function parse(file: string) {
  const lines = fs.readFileSync(file, "utf8").split("\n").map((line) => line.trim());
  const versions: string[] = [];
  const sums = new Map<string, { sha: string; file: string }>();
  lines.forEach((line, i) => {
    if (line === "" || line.startsWith("#")) return;
    versions.push(line);
    const pinned = /^# sha256 ([0-9a-f]{64}) {2}(\S+\.sql)$/.exec(lines[i - 1] ?? "");
    if (pinned) sums.set(line, { sha: pinned[1], file: pinned[2] });
  });
  return { versions, sums };
}

describe("advance-payment-guard-basis set", () => {
  it("lists exactly the guard hotfix", () => {
    const { versions } = parse(setFile);
    expect(versions).toEqual(["20261121113052"]);
    expect(versions[0].endsWith("000000")).toBe(false);
  });

  it("does not name a frozen version", () => {
    const body = fs.readFileSync(setFile, "utf8");
    const frozen = fs
      .readFileSync(path.join(releaseSets, "FROZEN.versions"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d{14}$/.test(line));
    for (const version of frozen) expect(body).not.toContain(version);
  });

  it("pins the migration by SHA-256", () => {
    const pin = parse(setFile).sums.get("20261121113052");
    expect(pin?.file).toBe(FILE);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, FILE))).digest("hex");
    expect(actual).toBe(pin?.sha);
  });

  it("compares the resolved basis, not the raw trip column", () => {
    const full = fs.readFileSync(path.join(migrations, FILE), "utf8");
    // Function body only (the header comment quotes the old error text).
    const sql = full.slice(full.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(sql).toMatch(/v_basis := coalesce\(v_now->>'supplier_rate_basis', ''\);/);
    expect(sql).not.toMatch(/lower\(btrim\(coalesce\(supplier_rate_basis/);
    // The calculation runs before the terms check that uses its basis.
    expect(sql.indexOf("v_now := public.compliance_advance_calculation")).toBeLessThan(
      sql.indexOf("trip terms changed after approval"),
    );
    // Amount, rate and tons checks are kept.
    expect(sql).toMatch(/payment amount must equal the approved advance/);
    expect(sql).toMatch(/v_rate is distinct from nullif\(v_snapshot->>'supplier_rate', ''\)::numeric/);
    expect(sql).toMatch(/v_tons is distinct from nullif\(v_snapshot->>'load_tons', ''\)::numeric/);
  });
});
