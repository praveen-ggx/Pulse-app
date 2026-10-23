import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/prod-2026-10-23.versions");

// The versions production is missing for release 2026-10-23, in apply order.
const APPROVED = ["20261022123845"];

// Never applied to any database (team workflow), plus the frozen file.
const EXCLUDED = ["20271005130000", "20271005190000", "20271014184500"];

function parse() {
  const lines = fs.readFileSync(setFile, "utf8").split("\n").map((l) => l.trim());
  const versions: string[] = [];
  const sums = new Map<string, { sha: string; file: string }>();
  lines.forEach((line, i) => {
    if (line === "" || line.startsWith("#")) return;
    versions.push(line);
    const m = /^# sha256 ([0-9a-f]{64}) {2}(\S+\.sql)$/.exec(lines[i - 1] ?? "");
    if (m) sums.set(line, { sha: m[1], file: m[2] });
  });
  return { versions, sums };
}

describe("prod-2026-10-23 release set", () => {
  it("lists exactly the approved versions in ascending order", () => {
    const { versions } = parse();
    versions.forEach((v) => expect(v).toMatch(/^\d{14}$/));
    expect(versions).toEqual(APPROVED);
    expect([...versions].sort()).toEqual(versions);
  });

  it("never names an excluded or frozen version", () => {
    const body = fs.readFileSync(setFile, "utf8");
    for (const v of EXCLUDED) expect(body).not.toContain(v);
    const frozen = fs.readFileSync(path.join(migrations, "../release-sets/FROZEN.versions"), "utf8");
    const { versions } = parse();
    for (const v of versions) expect(frozen).not.toContain(v);
  });

  it("pins each version to one migration file by SHA-256", () => {
    const { versions, sums } = parse();
    const all = fs.readdirSync(migrations);
    for (const v of versions) {
      const files = all.filter((f) => f.startsWith(`${v}_`) && f.endsWith(".sql"));
      expect(files).toHaveLength(1);
      const pinned = sums.get(v);
      expect(pinned?.file).toBe(files[0]);
      const actual = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(migrations, files[0])))
        .digest("hex");
      expect(actual).toBe(pinned?.sha);
    }
  });

  it("uses a real timestamp, never the sibling repo's 000000 slot", () => {
    for (const v of parse().versions) expect(v.endsWith("000000")).toBe(false);
  });
});
