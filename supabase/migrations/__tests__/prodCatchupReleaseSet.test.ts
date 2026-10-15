import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/prod-v1-0-1-catchup.versions");

// The 27 versions production is missing after PR #1, in apply order.
const APPROVED = [
  "20260930165033",
  "20260930170616",
  "20261005080754",
  "20261005122431",
  "20270930123100",
  "20270930124500",
  "20270930153000",
  "20270930235100",
  "20271001093000",
  "20271006154500",
  "20271006161000",
  "20271008112000",
  "20271008113000",
  "20271008114000",
  "20271008115000",
  "20271008116000",
  "20271008117000",
  "20271008118000",
  "20271008120000",
  "20271008121000",
  "20271012130500",
  "20271012140000",
  "20271013101500",
  "20271013113000",
  "20271013120000",
  "20271014051328",
  "20271014183000",
];

// Gap versions already live on prod with newer bodies, the frozen file, the trip-number
// overwrite and the Godrej classification. None may ever be applied by this set.
const EXCLUDED = [
  "20270922163000",
  "20270922174500",
  "20270925110000",
  "20270928114500",
  "20270929162901",
  "20270929194800",
  "20270929203000",
  "20271005130000",
  "20271005190000",
  "20271008119000",
  "20271014184500",
];

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

describe("prod-v1-0-1-catchup release set", () => {
  it("lists exactly the 27 approved versions in ascending order", () => {
    const { versions } = parse();
    versions.forEach((v) => expect(v).toMatch(/^\d{14}$/));
    expect(versions).toEqual(APPROVED);
    expect([...versions].sort()).toEqual(versions);
  });

  it("never names an excluded version", () => {
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
      expect(pinned).toBeDefined();
      expect(pinned!.file).toBe(files[0]);
      const actual = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(migrations, files[0])))
        .digest("hex");
      expect(actual).toBe(pinned!.sha);
    }
  });
});
