import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const releaseSets = path.join(migrations, "../release-sets");

const APPROVED = ["20261112061609", "20271111143000", "20271111164000"];

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

function expectPinned(file: string) {
  const { versions, sums } = parse(file);
  const all = fs.readdirSync(migrations);
  for (const version of versions) {
    const files = all.filter((f) => f.startsWith(`${version}_`) && f.endsWith(".sql"));
    expect(files).toHaveLength(1);
    const pinned = sums.get(version);
    expect(pinned?.file).toBe(files[0]);
    const actual = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(migrations, files[0]!)))
      .digest("hex");
    expect(actual).toBe(pinned?.sha);
  }
}

describe("prod-2026-11-12-release set", () => {
  const setFile = path.join(releaseSets, "prod-2026-11-12-release.versions");

  it("lists exactly the three pending migrations in order", () => {
    const { versions } = parse(setFile);
    expect(versions).toEqual(APPROVED);
    expect(versions.every((version) => !version.endsWith("000000"))).toBe(true);
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

  it("pins every migration file by SHA-256", () => {
    expectPinned(setFile);
  });

  it("pins the hub-metric-counter set by SHA-256", () => {
    expectPinned(path.join(releaseSets, "hub-metric-counter.versions"));
  });
});
