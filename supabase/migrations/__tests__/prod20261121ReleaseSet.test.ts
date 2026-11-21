import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const releaseSets = path.join(migrations, "../release-sets");
const setFile = path.join(releaseSets, "prod-2026-11-21-release.versions");

const PENDING = ["20261120055411", "20261120094932", "20271120101500"];

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

describe("prod-2026-11-21-release set", () => {
  it("lists exactly the three pending migrations in version order", () => {
    const { versions } = parse(setFile);
    expect(versions).toEqual(PENDING);
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
    const { versions, sums } = parse(setFile);
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
  });

  it("uses the same hashes as the per-feature sets for the same files", () => {
    const now = parse(setFile).sums;
    for (const name of ["entity-documents-superseded-readers.versions", "pool-exhausted-rebid.versions"]) {
      for (const [version, pin] of parse(path.join(releaseSets, name)).sums) {
        expect(now.get(version)?.sha).toBe(pin.sha);
      }
    }
  });
});
